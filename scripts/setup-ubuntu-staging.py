#!/usr/bin/env python3
"""Prepare a separate Ubuntu staging checkout; never starts or changes the web service.

Copies a verified backup, creates a private PostgreSQL container, imports data,
installs dependencies and builds the app. Reruns resume this checkout's own state.
Passwords stay in permission-restricted, Git-ignored files and child environments.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'backups' / 'ubuntu-staging'
STATE_PATH = PRIVATE / 'state.json'
LABEL = 'com.topreading.staging-id'


class SetupError(Exception):
    pass


def run(args, *, env=None, capture=False, input_text=None):
    result = subprocess.run(args, cwd=ROOT, env=env, text=True, input=input_text,
                            stdout=subprocess.PIPE if capture else None, check=False)
    if result.returncode:
        raise SetupError(f'{Path(args[0]).name} failed (exit {result.returncode}). Fix the reported problem and rerun the same setup command.')
    return result.stdout if capture else ''


def save_state(state):
    temporary = STATE_PATH.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(STATE_PATH)


def is_listening(port):
    with socket.socket() as listener:
        try:
            listener.bind(('127.0.0.1', port))
        except OSError:
            return True
    return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True, type=Path)
    parser.add_argument('--database-port', type=int, default=55433)
    args = parser.parse_args()
    os.umask(0o077)
    if ROOT.name != 'topreading-staging':
        raise SetupError('Run from the separate checkout named topreading-staging, never the live application directory.')
    if any(c in str(ROOT) for c in ('\n', '\r', '$')):
        raise SetupError('Use a checkout path without newlines or dollar signs.')
    branch = run(['git', 'branch', '--show-current'], capture=True).strip()
    if branch != 'modernization/postgres-auth':
        raise SetupError('The staging checkout must use modernization/postgres-auth.')
    baseline = args.baseline.resolve(strict=True)
    if not (baseline / 'topreading.sqlite').is_file() or not (baseline / 'uploads').is_dir():
        raise SetupError('The baseline must contain topreading.sqlite and uploads/.')
    if ROOT == baseline or ROOT in baseline.parents:
        raise SetupError('Select the original verified backup outside this staging checkout.')
    if not 1024 <= args.database_port <= 65535 or args.database_port in (3000, 3100):
        raise SetupError('Choose an unused database port between 1024 and 65535, other than 3000/3100.')
    if is_listening(3100):
        raise SetupError('Port 3100 is occupied. Stop only a previously configured staging web service before rebuilding; do not stop production.')
    if run(['node', '--version'], capture=True).strip().split('.')[0] != 'v22':
        raise SetupError('Node.js 22 is required.')
    for executable in ('npm', 'docker'):
        if not shutil.which(executable):
            raise SetupError(f'{executable} is required.')
    if shutil.disk_usage(ROOT).free < 4 * 1024**3:
        raise SetupError('At least 4 GiB of free disk space is required for this rehearsal.')

    PRIVATE.mkdir(parents=True, exist_ok=True)
    PRIVATE.chmod(0o700)
    lock = (PRIVATE / 'setup.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SetupError('Another staging setup is already running.')
    env_path = ROOT / '.env.local'
    if STATE_PATH.exists():
        state = json.loads(STATE_PATH.read_text())
        if (state['root'], state['baseline'], state['port']) != (str(ROOT), str(baseline), args.database_port):
            raise SetupError('Existing staging state belongs to different paths/port. Refusing to replace it.')
        if state.get('configured') and not env_path.is_file():
            raise SetupError('The saved staging configuration is missing. Restore it before rerunning setup.')
    else:
        if env_path.exists() or (ROOT / 'data' / 'uploads').exists() and any((ROOT / 'data' / 'uploads').glob('[!.]*')):
            raise SetupError('This checkout already has configuration or uploaded files. Refusing to overwrite them.')
        state = dict(root=str(ROOT), baseline=str(baseline), port=args.database_port,
                     instance=str(uuid.uuid4()), owner_password=secrets.token_hex(32),
                     app_password=secrets.token_hex(32))
        save_state(state)

    docker_env = dict(os.environ)
    for key in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
        docker_env.pop(key, None)
    docker = ['docker', '--host=unix:///var/run/docker.sock']
    probe = subprocess.run(docker + ['info', '--format', '{{.ServerVersion}}'], env=docker_env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if probe.returncode:
        docker = ['sudo'] + docker
        run(docker + ['info', '--format', '{{.ServerVersion}}'], env=docker_env)

    def dock(*parts, capture=False):
        return run(docker + list(parts), env=docker_env, capture=capture)

    container = 'topreading-staging-postgres'
    volume = 'topreading-staging-pgdata'
    def inspect(kind, name):
        result = subprocess.run(docker + [kind, 'inspect', name], env=docker_env,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        if result.returncode:
            return None
        return json.loads(result.stdout)[0]

    existing_container = inspect('container', container)
    existing_volume = inspect('volume', volume)
    for existing in (existing_container, existing_volume):
        if existing is not None:
            labels = existing.get('Labels') or existing.get('Config', {}).get('Labels') or {}
            if labels.get(LABEL) != state['instance']:
                raise SetupError('A staging container/volume with this name belongs to another setup. Nothing was removed.')
    if not existing_container and is_listening(args.database_port):
        raise SetupError(f'Database port {args.database_port} is occupied. Nothing was replaced.')
    if existing_container and not existing_volume:
        raise SetupError('The owned database volume is missing. Refusing to start a replacement database.')

    snapshot_hash = hashlib.sha256((baseline / 'topreading.sqlite').read_bytes()).hexdigest()
    if state.get('snapshot_sha256') and state['snapshot_sha256'] != snapshot_hash:
        raise SetupError('The baseline database changed since this setup began. Use the original verified backup.')
    print('1/6 Verifying and copying the baseline', flush=True)
    run([sys.executable, 'scripts/verify-baseline.py', '--database', str(baseline / 'topreading.sqlite'),
         '--uploads', str(baseline / 'uploads')], capture=True)
    if not state.get('copied'):
        snapshot = PRIVATE / 'baseline'
        snapshot.mkdir(exist_ok=True)
        shutil.copy2(baseline / 'topreading.sqlite', snapshot / 'topreading.sqlite')
        shutil.copytree(baseline / 'uploads', ROOT / 'data' / 'uploads', dirs_exist_ok=True)
        run([sys.executable, 'scripts/verify-baseline.py', '--database', str(snapshot / 'topreading.sqlite'),
             '--uploads', str(ROOT / 'data' / 'uploads')], capture=True)
        state['snapshot_sha256'] = snapshot_hash
        state['copied'] = True
        save_state(state)
    if not (ROOT / 'data' / 'uploads').is_dir() or not (PRIVATE / 'baseline' / 'topreading.sqlite').is_file():
        raise SetupError('The copied staging files are missing. Restore them before rerunning setup.')
    (ROOT / 'data' / 'uploads').chmod(0o700)

    print('2/6 Installing staging dependencies', flush=True)
    python = ROOT / '.topreading' / 'bin' / 'python'
    if not python.exists():
        run([sys.executable, '-m', 'venv', str(ROOT / '.topreading')])
    run([str(python), '-m', 'pip', 'install', '-q', '-r', 'requirements.txt', '-r', 'requirements-migration.txt'])
    run(['npm', 'ci', '--no-audit', '--no-fund'])

    print('3/6 Preparing private PostgreSQL', flush=True)
    if not existing_volume:
        if state.get('imported'):
            raise SetupError('The previously imported database volume is missing. Restore it instead of silently replacing it.')
        dock('volume', 'create', '--label', f"{LABEL}={state['instance']}", volume, capture=True)
    if not existing_container:
        docker_file = PRIVATE / 'postgres.env'
        docker_file.write_text('POSTGRES_USER=staging_owner\nPOSTGRES_DB=topreading_staging\n'
                               f"POSTGRES_PASSWORD={state['owner_password']}\n")
        docker_file.chmod(0o600)
        dock('run', '-d', '--name', container, '--label', f"{LABEL}={state['instance']}",
             '--restart', 'unless-stopped', '--memory', '768m', '--cpus', '1.5',
             '--publish', f'127.0.0.1:{args.database_port}:5432', '--env-file', str(docker_file),
             '--mount', f'type=volume,source={volume},target=/var/lib/postgresql/data', 'postgres:17', capture=True)
    elif not existing_container['State']['Running']:
        dock('start', container, capture=True)
    for attempt in range(60):
        ready = subprocess.run(docker + ['exec', container, 'pg_isready', '-q', '-U', 'staging_owner', '-d', 'topreading_staging'],
                               env=docker_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if ready.returncode == 0:
            break
        time.sleep(1)
    else:
        raise SetupError('Staging PostgreSQL did not become ready. Inspect its container logs locally, then rerun.')

    owner_url = f"postgresql://staging_owner:{state['owner_password']}@127.0.0.1:{args.database_port}/topreading_staging"
    app_url = f"postgresql://topreading_app:{state['app_password']}@127.0.0.1:{args.database_port}/topreading_staging"
    migration_env = {**os.environ, 'MIGRATION_DATABASE_URL': owner_url, 'DATABASE_SCHEMA': 'topreading_staging'}
    print('4/6 Importing the copied library and applying migrations', flush=True)
    if not state.get('imported'):
        report = run([str(python), 'scripts/migrate-postgres.py', '--database', str(PRIVATE / 'baseline' / 'topreading.sqlite'),
                      '--uploads', str(ROOT / 'data' / 'uploads'), '--schema', 'topreading_staging', '--apply'],
                     env=migration_env, capture=True)
        (PRIVATE / 'migration-report.json').write_text(report)
        state['imported'] = True
        save_state(state)
    run(['node', 'scripts/apply-postgres-migrations.mjs'], env=migration_env)
    role_env = {**migration_env, 'STAGING_APP_PASSWORD': state['app_password'], 'STAGING_APP_DATABASE_URL': app_url}
    run([str(python), '-'], env=role_env, input_text='''
import os
import psycopg
from psycopg import sql
try:
    with psycopg.connect(os.environ['MIGRATION_DATABASE_URL']) as connection:
        if not connection.execute("SELECT 1 FROM pg_roles WHERE rolname='topreading_app'").fetchone():
            connection.execute("CREATE ROLE topreading_app LOGIN")
        connection.execute(sql.SQL("ALTER ROLE topreading_app PASSWORD {}").format(sql.Literal(os.environ['STAGING_APP_PASSWORD'])))
        connection.execute("REVOKE ALL ON DATABASE topreading_staging FROM PUBLIC")
        connection.execute("GRANT CONNECT ON DATABASE topreading_staging TO topreading_app")
        connection.execute("GRANT USAGE ON SCHEMA topreading_staging TO topreading_app")
        connection.execute("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA topreading_staging TO topreading_app")
        connection.execute("REVOKE ALL ON topreading_staging.migration_history,topreading_staging.application_migrations FROM topreading_app")
    with psycopg.connect(os.environ['STAGING_APP_DATABASE_URL']) as connection:
        role = connection.execute("SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user").fetchone()
        assert role == (False,False,False), 'Runtime role has excessive privileges'
        assert not connection.execute("SELECT has_schema_privilege(current_user,'topreading_staging','CREATE')").fetchone()[0]
        admins = connection.execute("SELECT count(*) FROM topreading_staging.users u JOIN topreading_staging.library_memberships m ON m.user_id=u.id WHERE u.status='active' AND u.role='admin'").fetchone()[0]
        assert admins > 0, 'No active imported administrator; review membership before proceeding'
        books = connection.execute('SELECT count(*) FROM topreading_staging.books').fetchone()[0]
        print(f'Runtime database access verified: {books} books; active administrator present.')
except Exception as error:
    print(f'Database role setup failed ({type(error).__name__}); inspect locally without posting credentials.')
    raise SystemExit(1)
''')

    print('5/6 Writing staging-only configuration', flush=True)
    values = {
        'DATABASE_URL': app_url, 'DATABASE_SCHEMA': 'topreading_staging',
        'UPLOAD_DIR': str(ROOT / 'data' / 'uploads'), 'EXPORT_DIR': str(ROOT / 'data' / 'exports'),
        'BACKUP_DIR': str(ROOT / 'backups'), 'PYTHON_EXECUTABLE': str(python),
        'APP_BASE_URL': 'https://top-staging.dubugimchi.com', 'AUTH_MODE': 'cloudflare_access',
        'CLOUDFLARE_ACCESS_TEAM_DOMAIN': 'supervenience.cloudflareaccess.com',
        'CLOUDFLARE_ACCESS_AUD': '', 'ALLOW_INSECURE_LOCAL_AUTH': 'false', 'OPENAI_API_KEY': ''
    }
    if not state.get('configured'):
        if env_path.exists():
            raise SetupError('Configuration appeared during setup. Refusing to overwrite it; inspect the staging state locally.')
        env_path.write_text('# Staging only. Fill in the NEW staging Access application AUD before starting.\n' +
                            ''.join(f'{key}={json.dumps(value)}\n' for key, value in values.items()))
        env_path.chmod(0o600)
        state['configured'] = True
        save_state(state)
    (ROOT / 'data' / 'exports').mkdir(parents=True, exist_ok=True)
    (ROOT / 'data' / 'exports').chmod(0o700)
    print('6/6 Building the staging app (this can take several minutes)', flush=True)
    build_env = {**os.environ, **values, 'NODE_OPTIONS': '--max-old-space-size=3072', 'NEXT_TELEMETRY_DISABLED': '1'}
    # Build does not require a working auth provider. Preserve any manually filled
    # staging configuration on disk; never import the production environment.
    build_env.pop('MIGRATION_DATABASE_URL', None)
    run(['nice', '-n', '10', 'npm', 'run', 'build'], env=build_env)
    state['built_commit'] = run(['git', 'rev-parse', 'HEAD'], capture=True).strip()
    save_state(state)
    print('\nSTAGING PREPARATION PASSED')
    print(f'PostgreSQL: {container}, bound only to 127.0.0.1:{args.database_port}')
    print('The staging web app is not started. Its new Cloudflare Access AUD is the next setup step.')
    print('Credentials are stored locally in private, Git-ignored files. Do not paste .env.local or backups/ubuntu-staging/state.json.')


if __name__ == '__main__':
    try:
        main()
    except (SetupError, OSError, ValueError, KeyError) as error:
        # Errors from subprocesses print their own safe summaries; never dump state.
        print(f'Staging preparation stopped: {error if isinstance(error, SetupError) else type(error).__name__}', file=sys.stderr)
        sys.exit(1)
