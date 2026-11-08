#!/usr/bin/env python3
"""Apply controlled migrations to the prepared Ubuntu staging database only.

Uses the existing private setup credentials; never prints them or restarts a
service. Removes retired Admin settings from staging .env.local after success.
"""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import quote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('staging_start', ROOT / 'scripts/start-ubuntu-staging.py')
starter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(starter)


def main():
    os.umask(0o077)
    if ROOT.name != 'topreading-staging' or os.geteuid() == 0:
        raise starter.StartError('Run as the normal owner of the separate topreading-staging checkout.')
    if starter.run(['git', 'branch', '--show-current'], capture=True) != 'modernization/postgres-auth':
        raise starter.StartError('Use the modernization/postgres-auth staging branch.')
    if starter.run(['node', '--version'], capture=True).split('.')[0] != 'v22':
        raise starter.StartError('Node.js 22 is required.')
    private = ROOT / 'backups/ubuntu-staging'
    with (private / 'setup.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise starter.StartError('Another staging setup/start/migration command is running.')
        state = json.loads((private / 'state.json').read_text())
        if state.get('root') != str(ROOT) or not state.get('configured') or not state.get('imported'):
            raise starter.StartError('Complete staging preparation in this checkout first.')
        config = ROOT / '.env.local'
        if config.is_symlink() or config.stat().st_uid != os.getuid():
            raise starter.StartError('Expected a staging environment file owned by the current user.')
        values = starter.load_config(config)
        database = urlsplit(values.get('DATABASE_URL', ''))
        if (values.get('DATABASE_SCHEMA') != 'topreading_staging' or database.scheme not in ('postgres', 'postgresql')
                or database.hostname != '127.0.0.1' or database.port != state['port']
                or database.path != '/topreading_staging' or database.username != 'topreading_app'):
            raise starter.StartError('The database connection does not match this prepared staging instance.')
        # This connection exists only in the migration child process environment.
        owner_url = f"postgresql://staging_owner:{quote(state['owner_password'], safe='')}@127.0.0.1:{state['port']}/topreading_staging"
        starter.run(['node', 'scripts/apply-postgres-migrations.mjs'], env={**os.environ,
            'MIGRATION_DATABASE_URL': owner_url, 'DATABASE_SCHEMA': 'topreading_staging'})
        starter.run(['node', 'scripts/check-staging-runtime.mjs', '--require-worker'], env={**os.environ, **values})
        # Preserve all unrelated configuration verbatim, including comments and
        # secrets. Obsolete model/limit keys no longer affect application runtime.
        retired = re.compile(r'^\s*(?:export\s+)?(?:OPENAI_MODEL|MAX_GENERATION_CHAPTERS|MAX_GENERATION_ITEMS)\s*=')
        original = config.read_text()
        cleaned = ''.join(line for line in original.splitlines(keepends=True) if not retired.match(line))
        if cleaned != original:
            pending = private / 'environment.migration-pending'
            with pending.open('x') as output:
                output.write(cleaned)
            pending.chmod(0o600)
            pending.replace(config)
        print('STAGING MIGRATION PASSED: pending database migrations applied; credentials and login settings are unchanged.')


if __name__ == '__main__':
    try:
        main()
    except (starter.StartError, OSError, ValueError, KeyError) as error:
        print(f'Staging migration stopped: {error if isinstance(error, starter.StartError) else type(error).__name__}', file=sys.stderr)
        sys.exit(1)
