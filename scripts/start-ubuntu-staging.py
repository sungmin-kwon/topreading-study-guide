#!/usr/bin/env python3
"""Configure and start ONLY the prepared topreading-staging systemd service.

Use --prepare-only to write configuration/unit and check the database without
installing or starting a system service. No production, tunnel or proxy edits.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'backups' / 'ubuntu-staging'
SERVICE = 'topreading-staging.service'
DESTINATION = Path('/etc/systemd/system') / SERVICE
PRODUCTION_AUD = 'd1c8751b006e02f5d135ccdb4402eaef1bca2f4897e592ad9aa3015232f9457a'


class StartError(Exception):
    pass


def run(args, *, env=None, capture=False):
    result = subprocess.run(args, cwd=ROOT, env=env, text=True,
                            stdout=subprocess.PIPE if capture else None, check=False)
    if result.returncode:
        raise StartError(f'{Path(args[0]).name} failed (exit {result.returncode}). Inspect the staging service locally; do not paste configuration files.')
    return result.stdout.strip() if capture else ''


def unit_value(value):
    # Escape systemd specifiers, its command-line variable expansion and quotes.
    return json.dumps(str(value).replace('%', '%%').replace('$', '$$'))


def load_config(path):
    values = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
            raise StartError('Unexpected staging environment format. Inspect .env.local locally.')
        # The preparation helper writes JSON-quoted dotenv values. Unquoted
        # values are also accepted for normal, deliberate operator edits.
        values[key] = json.loads(value) if value.startswith('"') else value
        if not isinstance(values[key], str) or '\n' in values[key] or '\r' in values[key]:
            raise StartError('Staging environment entries must be single-line strings.')
    return values


def origin_checks(port=3100):
    # This bypasses proxies only for this fixed loopback health check.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    probes = [
        ('/api/books', {}),
        ('/api/me', {'Cf-Access-Authenticated-User-Email': 'fixture@example.test', 'X-Forwarded-Email': 'fixture@example.test'}),
        ('/api/books', {'Cf-Access-Jwt-Assertion': 'not-a-valid-jwt'})
    ]
    for route, headers in probes:
        request = urllib.request.Request(f'http://127.0.0.1:{port}{route}', headers=headers)
        try:
            response = opener.open(request, timeout=5)
            with response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
        if status != 401:
            raise StartError(f'Staging origin check expected HTTP 401, got {status}. Do not publish its route yet.')
    print('PASS: unsigned requests, spoofed email headers and malformed tokens are rejected (HTTP 401).')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--aud', required=True)
    parser.add_argument('--prepare-only', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    if ROOT.name != 'topreading-staging':
        raise StartError('Run from the separate topreading-staging checkout, never the live application directory.')
    if not re.fullmatch(r'/[A-Za-z0-9_/.-]+', str(ROOT)):
        raise StartError('Use a staging checkout path without spaces or special characters.')
    if os.geteuid() == 0:
        raise StartError('Run as the normal staging checkout owner, without sudo. Only service installation needs sudo.')
    if not re.fullmatch('[0-9a-f]{64}', args.aud) or args.aud == PRODUCTION_AUD:
        raise StartError('Supply the NEW staging Access application AUD, not the production application AUD.')
    if not PRIVATE.is_dir():
        raise StartError('Run setup-ubuntu-staging.py successfully first.')
    lock = (PRIVATE / 'setup.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise StartError('Another staging setup/start command is running.')
    state = json.loads((PRIVATE / 'state.json').read_text())
    if state.get('root') != str(ROOT) or not state.get('built_commit') or not state.get('configured'):
        raise StartError('Staging preparation must finish in this checkout before starting.')
    if not (ROOT / 'apps/web/.next/BUILD_ID').is_file():
        raise StartError('The staging production build is missing.')
    if run(['git', 'branch', '--show-current'], capture=True) != 'modernization/postgres-auth':
        raise StartError('Use the modernization/postgres-auth staging branch.')
    if run(['node', '--version'], capture=True).split('.')[0] != 'v22':
        raise StartError('Node.js 22 is required.')
    config_path = ROOT / '.env.local'
    if config_path.stat().st_uid != os.getuid():
        raise StartError('The staging environment file belongs to another user.')
    values = load_config(config_path)
    if values.get('DATABASE_SCHEMA') != 'topreading_staging' or values.get('UPLOAD_DIR') != str(ROOT / 'data/uploads'):
        raise StartError('Unexpected database schema or upload path; refusing to use another deployment.')
    database = urlsplit(values.get('DATABASE_URL', ''))
    if (database.scheme not in ('postgres', 'postgresql') or database.hostname != '127.0.0.1'
            or database.port != state['port'] or database.path != '/topreading_staging'
            or database.username != 'topreading_app'):
        raise StartError('The database connection does not match this prepared staging instance.')
    username = pwd.getpwuid(os.getuid()).pw_name
    node = Path(shutil.which('node')).absolute()
    marker = f"# TopReading staging instance: {state['instance']}"
    if DESTINATION.is_symlink():
        raise StartError('The staging unit path is a symlink. Refusing to replace it.')
    if DESTINATION.exists() and marker not in DESTINATION.read_text().splitlines():
        raise StartError('An unrelated service already uses the staging unit name. Nothing was replaced.')
    if not args.prepare_only:
        inspection = subprocess.run(['systemctl', 'show', SERVICE, '--property=LoadState', '--property=FragmentPath'],
                                    text=True, stdout=subprocess.PIPE, check=False)
        properties = dict(line.split('=', 1) for line in inspection.stdout.splitlines() if '=' in line)
        if inspection.returncode and properties.get('LoadState') != 'not-found':
            raise StartError('Could not inspect the staging service through systemd.')
        fragment = properties.get('FragmentPath', '')
        if fragment and Path(fragment) != DESTINATION:
            raise StartError('A unit from another location already uses the staging service name.')
        with socket.socket() as listener:
            try:
                listener.bind(('0.0.0.0', 3100))
            except OSError:
                if not DESTINATION.exists() or subprocess.run(['systemctl', 'is-active', '--quiet', SERVICE]).returncode:
                    raise StartError('Port 3100 is occupied by another process. Nothing was stopped.')

    values.update({
        'AUTH_MODE': 'cloudflare_access', 'ALLOW_INSECURE_LOCAL_AUTH': 'false',
        'APP_BASE_URL': 'https://top-staging.dubugimchi.com',
        'CLOUDFLARE_ACCESS_TEAM_DOMAIN': 'supervenience.cloudflareaccess.com',
        'CLOUDFLARE_ACCESS_AUD': args.aud
    })
    # Validate the already-prepared DB connection before modifying service/config.
    run([str(node), 'scripts/check-staging-runtime.mjs'], env={**os.environ, **values})
    pending = PRIVATE / 'environment.pending'
    pending.write_text('# Staging configuration; keep private.\n' + ''.join(f'{key}={json.dumps(value)}\n' for key, value in values.items()))
    pending.chmod(0o600)
    pending.replace(config_path)
    unit = f'''{marker}
[Unit]
Description=TopReading Staging
Wants=network-online.target
After=network-online.target docker.service
Requires=docker.service

[Service]
Type=simple
User={username}
WorkingDirectory={ROOT / 'apps/web'}
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=NODE_OPTIONS=--max-old-space-size=1024
EnvironmentFile={config_path}
ExecStartPre={unit_value(node)} {unit_value(ROOT / 'scripts/check-staging-runtime.mjs')}
ExecStart={unit_value(node)} {unit_value(ROOT / 'node_modules/next/dist/bin/next')} start --hostname 0.0.0.0 --port 3100
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
MemoryMax=1536M

[Install]
WantedBy=multi-user.target
'''
    unit_path = PRIVATE / SERVICE
    unit_path.write_text(unit)
    if args.prepare_only:
        print('STAGING SERVICE PREPARED: configuration and unit written; no service installed or started.')
        return
    run(['sudo', 'install', '-m', '0644', str(unit_path), str(DESTINATION)])
    run(['sudo', 'systemctl', 'daemon-reload'])
    run(['sudo', 'systemctl', 'enable', SERVICE])
    run(['sudo', 'systemctl', 'restart', SERVICE])
    for attempt in range(30):
        try:
            origin_checks()
            break
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(1)
    else:
        raise StartError('Staging did not become reachable. Check sudo journalctl -u topreading-staging.service -n 50 --no-pager locally.')
    run(['systemctl', 'is-active', '--quiet', SERVICE])
    print('STAGING SERVICE READY: topreading-staging.service on port 3100.')
    print('Next: add the staging proxy host and Cloudflare tunnel route, then test browser sign-in.')


if __name__ == '__main__':
    try:
        main()
    except (StartError, OSError, ValueError, KeyError) as error:
        print(f'Staging start stopped: {error if isinstance(error, StartError) else type(error).__name__}', file=sys.stderr)
        sys.exit(1)
