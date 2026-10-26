#!/usr/bin/env python3
"""Read-only checks before/after removing staging's extra Cloudflare Access gate.

Default: check the Ubuntu origin on loopback port 3100 before dashboard changes.
--public: check only https://top-staging.dubugimchi.com after dashboard changes.
No credentials, cookies, environment files or real book IDs are needed.
"""
import argparse
import errno
import http.client
import json
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

PUBLIC_ORIGIN = 'https://top-staging.dubugimchi.com'
MISSING_ID = '00000000-0000-4000-8000-000000000000'


class CheckError(Exception):
    pass


def connection_failure(error):
    """Describe transport errors without exposing proxy URLs or credentials."""
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    if isinstance(reason, ssl.SSLCertVerificationError):
        return 'HTTPS certificate verification failed. Check the certificate, Ubuntu CA certificates and system clock; do not disable TLS verification.'
    if isinstance(reason, socket.gaierror):
        return 'DNS lookup failed. Check Ubuntu DNS, the staging DNS record and any configured proxy hostname.'
    if isinstance(reason, (TimeoutError, socket.timeout)) or getattr(reason, 'errno', None) == errno.ETIMEDOUT:
        return 'Connection or response timed out. Check connectivity and the tunnel route.'
    if isinstance(reason, ssl.SSLError):
        return 'The HTTPS handshake failed. Check the staging HTTPS route and certificate.'
    if isinstance(reason, ConnectionRefusedError):
        return 'Connection refused. Check that the selected service or proxy is listening.'
    if isinstance(reason, ConnectionResetError):
        return 'The connection was reset. Check the network, proxy and tunnel status.'
    if isinstance(reason, http.client.HTTPException):
        return 'An incomplete or invalid HTTP response was received. Check the proxy and tunnel status.'
    code = errno.errorcode.get(getattr(reason, 'errno', None))
    suffix = f' ({code})' if code else ''
    return f'Network/proxy connection failed{suffix}. Check connectivity, proxy settings and the tunnel route.'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(base, *, public=False):
    # Honor the normal HTTPS proxy/CA settings for public requests. Only the
    # explicitly selected loopback origin bypasses proxies.
    handlers = [NoRedirect()]
    if not public:
        handlers.append(urllib.request.ProxyHandler({}))
    opener = urllib.request.build_opener(*handlers)

    def request(path, headers=None):
        req = urllib.request.Request(base + path, headers={
            'Cache-Control': 'no-cache', 'User-Agent': 'TopReading-staging-check/1', **(headers or {})
        })
        try:
            try:
                response = opener.open(req, timeout=15)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                # Never print response bodies, redirect query strings or cookies.
                return response.status, response.headers, response.read(1_000_000)
        except (urllib.error.URLError, OSError, http.client.HTTPException) as error:
            raise CheckError(f'{path}: {connection_failure(error)}') from None

    def expect_json(path, expected, headers=None):
        status, response_headers, body = request(path, headers)
        if status != expected or 'application/json' not in response_headers.get('Content-Type', '').lower():
            raise CheckError(f'{path}: expected application JSON with HTTP {expected}, got HTTP {status}. '
                             'A redirect/HTML response can indicate a remaining Access gate or proxy rule.')
        try:
            value = json.loads(body)
        except (ValueError, UnicodeError):
            raise CheckError(f'{path}: invalid application JSON.') from None
        if not isinstance(value, dict):
            raise CheckError(f'{path}: unexpected JSON response.')
        return value

    provider = expect_json('/api/auth/providers', 200).get('google')
    if not isinstance(provider, dict) or provider.get('callbackUrl') != PUBLIC_ORIGIN + '/api/auth/callback/google':
        raise CheckError('The service must use Google login with the staging HTTPS callback.')
    status, _, body = request('/login')
    if status != 200 or b'Continue with Google' not in body:
        raise CheckError(f'/login: expected the application Google sign-in page, got HTTP {status}.')
    for path in ('/', '/admin'):
        status, headers, _ = request(path)
        target = urllib.parse.urlsplit(urllib.parse.urljoin(base + path, headers.get('Location', '')))
        origin = urllib.parse.urlsplit(base)
        allowed_origins = {(origin.scheme, origin.netloc)}
        if not public:
            # Next may normalize 127.0.0.1 to localhost on origin requests.
            allowed_origins.add(('http', f'localhost:{origin.port}'))
            allowed_origins.add(('https', urllib.parse.urlsplit(PUBLIC_ORIGIN).netloc))
        if status not in (302, 303, 307, 308) or (target.scheme, target.netloc) not in allowed_origins or target.path != '/login':
            raise CheckError(f'{path}: anonymous navigation must redirect to this application\'s /login.')
    print('PASS: application Google login is reachable; anonymous pages redirect to /login.')

    paths = ['/api/books', '/api/me', '/api/admin/me',
             f'/api/books/{MISSING_ID}/chapters', f'/api/books/{MISSING_ID}/source-files',
             f'/api/books/{MISSING_ID}/export?type=multiple-choice&format=pdf',
             f'/api/books/{MISSING_ID}/study-sets/{MISSING_ID}/export?type=multiple-choice&format=docx']
    for path in paths:
        expect_json(path, 401)
    for path in ('/api/admin/users', '/api/admin/settings'):
        expect_json(path, 403)
    for headers in (
        {'Cf-Access-Authenticated-User-Email': 'fixture@example.test', 'X-Forwarded-Email': 'fixture@example.test'},
        {'Cf-Access-Jwt-Assertion': 'not-a-valid-jwt'},
        {'Cookie': '__Secure-authjs.session-token=not-a-real-session; authjs.session-token=not-a-real-session'},
    ):
        expect_json('/api/books', 401, headers)
    print('PASS: anonymous library, Admin and download requests are denied; spoofed headers/sessions are rejected.')
    print('PUBLIC GOOGLE ACCESS CHECK PASSED' if public else 'ORIGIN GOOGLE ACCESS CHECK PASSED')
    print('Finish with a fresh private-browser sign-in, sign-out and uninvited-account check.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--public', action='store_true', help='Check the fixed staging HTTPS hostname after removing its Access gate')
    parser.add_argument('--port', type=int, default=3100, help='Local origin port (default: 3100; ignored with --public)')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('--port must be between 1024 and 65535')
    try:
        check(PUBLIC_ORIGIN if args.public else f'http://127.0.0.1:{args.port}', public=args.public)
    except CheckError as error:
        print(f'FAIL: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
