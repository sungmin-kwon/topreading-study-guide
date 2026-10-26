#!/usr/bin/env python3
"""Staging backup and isolated restore rehearsal. Never restores over the live DB."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('starter', ROOT / 'scripts/start-ubuntu-staging.py')
starter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(starter)
SCHEMA = 'topreading_staging'
CONTAINER = 'topreading-staging-postgres'
SERVICES = ['topreading-staging.service', 'topreading-staging-worker.service']


def command(args, **kwargs):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        raise RuntimeError(f'{Path(args[0]).name} failed (exit {result.returncode}); no secret output was printed.')
    return result.stdout


def docker(*args, **kwargs):
    return command(['sudo', 'docker', *args], **kwargs)


def sql(container, query):
    return docker('exec', container, 'psql', '-XAt', '-v', 'ON_ERROR_STOP=1', '-U', 'staging_owner', '-d', 'topreading_staging', '-c', query).decode().strip()


def inventory(container):
    tables = json.loads(sql(container, f"SELECT json_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='{SCHEMA}'"))
    if not tables or any(not t.replace('_', '').isalnum() for t in tables):
        raise RuntimeError('Unexpected database inventory.')
    return {table: int(sql(container, f'SELECT count(*) FROM {SCHEMA}."{table}"')) for table in tables}


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def hashes(directory):
    result = {}
    for path in sorted(directory.rglob('*')):
        if path.is_symlink():
            raise RuntimeError('Symlinks are not accepted in backups.')
        if path.is_file() and path != directory / 'manifest.json':
            result[str(path.relative_to(directory))] = digest(path)
    return result


def verify_sources(container, folder, original_uploads):
    rows = json.loads(sql(container, f"SELECT coalesce(json_agg(json_build_object('path',stored_path,'sha256',sha256,'bytes',byte_size)), '[]') FROM {SCHEMA}.source_files"))
    for row in rows:
        path = Path(row['path'])
        if path.is_absolute():
            relative = path.relative_to(original_uploads)
        else:
            # Imported records normally use data/uploads/<id>/<filename>.
            parts = path.parts
            if 'uploads' in parts:
                relative = Path(*parts[parts.index('uploads')+1:])
            else:
                relative = path
        target = folder / 'uploads' / relative
        if not target.resolve().is_relative_to((folder / 'uploads').resolve()):
            raise RuntimeError('Unsafe source path in database.')
        if not target.is_file() or target.stat().st_size != row['bytes'] or digest(target) != row['sha256']:
            raise RuntimeError('A referenced source file is missing or has changed.')
    return len(rows)


def backup():
    if ROOT.name != 'topreading-staging' or os.geteuid() == 0:
        raise RuntimeError('Run as the normal owner in the separate topreading-staging checkout.')
    private = ROOT / 'backups/ubuntu-staging'
    state = json.loads((private / 'state.json').read_text())
    values = starter.load_config(ROOT / '.env.local')
    db = urlsplit(values.get('DATABASE_URL', ''))
    if (state.get('root') != str(ROOT) or not state.get('imported') or values.get('DATABASE_SCHEMA') != SCHEMA
            or db.hostname != '127.0.0.1' or db.port != state['port'] or db.path != '/topreading_staging'):
        raise RuntimeError('Staging identity or database configuration mismatch.')
    label = docker('inspect', '--format', '{{index .Config.Labels "com.topreading.staging-id"}}', CONTAINER).decode().strip()
    if label != state['instance']:
        raise RuntimeError('Container does not belong to this staging instance.')
    uploads = Path(values['UPLOAD_DIR']).resolve()
    exports = Path(values['EXPORT_DIR']).resolve()
    if not all(p.is_relative_to(ROOT / 'data') and p.is_dir() for p in (uploads, exports)):
        raise RuntimeError('Expected staging uploads/exports directories under data/.')
    folder = ROOT / 'backups' / ('postgres-' + time.strftime('%Y%m%d_%H%M%S') + '-' + uuid.uuid4().hex[:8])
    with (private / 'setup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Avoid interrupting a paid request. Stop the worker before the web app;
        # queued jobs remain durable and will be included in the snapshot.
        if sql(CONTAINER, f"SELECT count(*) FROM {SCHEMA}.generation_runs r WHERE r.status='generating' AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.jobs j WHERE j.book_id=r.book_id AND j.status='queued')") != '0':
            raise RuntimeError('A job is running. Wait for it to finish before taking a backup.')
        active = [s for s in SERVICES if subprocess.run(['systemctl', 'is-active', '--quiet', s]).returncode == 0]
        stopped = []
        try:
            for service in reversed(active):
                command(['sudo', 'systemctl', 'stop', service]); stopped.append(service)
            if sql(CONTAINER, f"SELECT count(*) FROM {SCHEMA}.generation_runs r WHERE r.status='generating' AND NOT EXISTS (SELECT 1 FROM {SCHEMA}.jobs j WHERE j.book_id=r.book_id AND j.status='queued')") != '0':
                raise RuntimeError('A job started during backup preparation. Restarted services; retry when idle.')
            folder.mkdir(mode=0o700)
            # Stream the dump; do not buffer the database in Python memory.
            with (folder / 'database.dump').open('xb') as output:
                result = subprocess.run(['sudo', 'docker', 'exec', CONTAINER, 'pg_dump', '-U', 'staging_owner', '-d', 'topreading_staging', '-Fc', '--no-owner', '--no-acl'], stdout=output, stderr=subprocess.PIPE)
                if result.returncode:
                    raise RuntimeError('pg_dump failed; incomplete backup has no manifest.')
            for name, source in [('uploads', uploads), ('exports', exports)]:
                if any(p.is_symlink() for p in source.rglob('*')):
                    raise RuntimeError('Source directories must not contain symlinks.')
                shutil.copytree(source, folder / name)
            recovery = folder / 'private-recovery'
            recovery.mkdir(mode=0o700)
            shutil.copyfile(ROOT / '.env.local', recovery / 'env.local')
            shutil.copyfile(private / 'state.json', recovery / 'state.json')
            for p in recovery.iterdir(): p.chmod(0o600)
            manifest = {'format': 1, 'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'schema': SCHEMA,
                        'commit': command(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']).decode().strip(),
                        'original_uploads': str(uploads), 'counts': inventory(CONTAINER),
                        'source_files_checked': verify_sources(CONTAINER, folder, uploads), 'sha256': hashes(folder)}
            (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        finally:
            # Restore exactly the services that were active on entry, even on failure.
            failures = []
            for service in reversed(stopped):
                try: command(['sudo', 'systemctl', 'start', service])
                except RuntimeError: failures.append(service)
            if failures: raise RuntimeError('Could not restart: ' + ', '.join(failures))
    print(f'BACKUP CREATED: {folder}\nContains private credentials and library data. Keep it private; copy it off this PC.')


def verify(folder):
    folder = folder.resolve()
    manifest = json.loads((folder / 'manifest.json').read_text())
    if manifest.get('format') != 1 or manifest.get('schema') != SCHEMA or hashes(folder) != manifest['sha256']:
        raise RuntimeError('Backup manifest or file checksums do not match.')
    name = 'topreading-restore-check-' + uuid.uuid4().hex
    created = False
    try:
        # No published port, no network, no persistent named volume. Unique name;
        # cleanup removes only the container created by this invocation.
        docker('run', '-d', '--name', name, '--network', 'none', '--memory', '768m',
               '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=staging_owner',
               '-e', 'POSTGRES_DB=topreading_staging', 'postgres:17')
        created = True
        for _ in range(60):
            try: sql(name, 'SELECT 1'); break
            except RuntimeError: time.sleep(0.5)
        else: raise RuntimeError('Restore database did not become ready.')
        with (folder / 'database.dump').open('rb') as dump:
            result = subprocess.run(['sudo', 'docker', 'exec', '-i', name, 'pg_restore', '-U', 'staging_owner', '-d', 'topreading_staging', '--no-owner', '--no-acl', '--exit-on-error'], stdin=dump, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result.returncode: raise RuntimeError('Restore failed; the live database was not changed.')
        if inventory(name) != manifest['counts']:
            raise RuntimeError('Restored table counts differ from the backup.')
        count = verify_sources(name, folder, Path(manifest['original_uploads']))
        # Check the restricted runtime role can read, but cannot own schema objects.
        sql(name, f"CREATE ROLE topreading_app; GRANT USAGE ON SCHEMA {SCHEMA} TO topreading_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA {SCHEMA} TO topreading_app; REVOKE ALL ON {SCHEMA}.migration_history,{SCHEMA}.application_migrations FROM topreading_app; SET ROLE topreading_app; SELECT count(*) FROM {SCHEMA}.books;")
        allowed = sql(name, f"SELECT has_schema_privilege('topreading_app','{SCHEMA}','CREATE')")
        if allowed != 'f': raise RuntimeError('Unexpected runtime schema creation privilege.')
        print(f'RESTORE CHECK PASSED: {len(manifest["counts"])} tables reconciled; {count} source files verified; runtime role checked. Live database unchanged.')
    finally:
        if created: docker('rm', '-fv', name)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', type=Path, metavar='BACKUP_FOLDER', help='Restore and verify in an isolated disposable container')
    args = parser.parse_args()
    if args.verify: verify(args.verify)
    else: backup()


if __name__ == '__main__':
    try: main()
    except (RuntimeError, OSError, ValueError, KeyError) as error:
        print(f'BACKUP/RESTORE CHECK FAILED: {error if isinstance(error, RuntimeError) else type(error).__name__}', file=sys.stderr)
        sys.exit(1)
