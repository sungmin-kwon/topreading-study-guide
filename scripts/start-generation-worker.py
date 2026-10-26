#!/usr/bin/env python3
"""Install/start the dedicated worker only in the prepared Ubuntu staging checkout."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import sys
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('starter', ROOT / 'scripts/start-ubuntu-staging.py')
starter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(starter)


def unit_path(value):
    # WorkingDirectory is a single path, not an ExecStart-style quoted word.
    # Keep deployment paths simple rather than ambiguously escaping directives.
    value = str(value)
    if not re.fullmatch(r'/[A-Za-z0-9_./-]+', value):
        raise starter.StartError('Worker paths must be absolute and contain only letters, digits, slash, dot, underscore or hyphen.')
    return value


def render_unit(root, config, node, username):
    q = starter.unit_value
    return f'''# Managed by TopReading start-generation-worker.py
[Unit]
Description=TopReading staging generation worker
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service
[Service]
Type=simple
User={username}
WorkingDirectory={unit_path(root)}
EnvironmentFile={unit_path(config)}
Environment=NODE_ENV=production
ExecStart={q(node)} {q(root / 'dist/generation-worker.mjs')}
Restart=on-failure
RestartSec=5
TimeoutStopSec=900
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
MemoryMax=1024M
[Install]
WantedBy=multi-user.target
'''

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    if ROOT.name != 'topreading-staging' or os.geteuid() == 0:
        raise starter.StartError('Run as the normal staging checkout owner.')
    if starter.run(['git', 'branch', '--show-current'], capture=True) != 'modernization/postgres-auth':
        raise starter.StartError('Expected the PostgreSQL staging branch.')
    private = ROOT / 'backups/ubuntu-staging'
    state = json.loads((private / 'state.json').read_text())
    config = ROOT / '.env.local'
    if config.is_symlink() or config.stat().st_uid != os.getuid():
        raise starter.StartError('Unexpected environment file ownership.')
    values = starter.load_config(config)
    db = urlsplit(values.get('DATABASE_URL', ''))
    if (state.get('root') != str(ROOT) or not state.get('imported') or values.get('DATABASE_SCHEMA') != 'topreading_staging'
            or db.hostname != '127.0.0.1' or db.port != state['port'] or db.path != '/topreading_staging' or db.username != 'topreading_app'):
        raise starter.StartError('Staging instance mismatch.')
    node = shutil.which('node')
    if not node or starter.run([node, '--version'], capture=True).split('.')[0] != 'v22':
        raise starter.StartError('Node 22 is required.')
    if not (ROOT / 'dist/generation-worker.mjs').is_file():
        raise starter.StartError('Run npm run build first.')
    starter.run([node, 'scripts/check-staging-runtime.mjs', '--require-worker'], env={**os.environ, **values})
    unit = render_unit(ROOT, config, node, pwd.getpwuid(os.getuid()).pw_name)
    pending = private / 'topreading-staging-worker.service'
    pending.write_text(unit)
    service = pending.name
    destination = Path('/etc/systemd/system') / service
    if destination.exists() and ('# Managed by TopReading start-generation-worker.py' not in destination.read_text() or str(ROOT) not in destination.read_text()):
        raise starter.StartError('Refusing to replace an unrelated worker unit.')
    starter.run(['systemd-analyze', 'verify', '--man=no', str(pending)])
    if args.prepare_only:
        print(f'Worker unit prepared: {pending}'); return
    starter.run(['sudo', 'install', '-m', '644', str(pending), str(destination)])
    starter.run(['sudo', 'systemctl', 'daemon-reload'])
    starter.run(['sudo', 'systemctl', 'enable', service])
    starter.run(['sudo', 'systemctl', 'restart', service])
    starter.run(['systemctl', 'is-active', service])
    print('WORKER SERVICE READY: topreading-staging-worker.service. Check its journal for Generation worker ready.')


if __name__ == '__main__':
    try: main()
    except (starter.StartError, OSError, ValueError, KeyError) as error:
        print(f'Worker setup stopped: {error if isinstance(error, starter.StartError) else type(error).__name__}', file=sys.stderr)
        sys.exit(1)
