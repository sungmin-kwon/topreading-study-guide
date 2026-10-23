# PostgreSQL and authentication staging

This is the implementation on `modernization/postgres-auth`. The Ubuntu service remains on SQLite on `modernization/prototype-and-postgres`. Do not switch that service to this branch using its existing `.env.local`.

The library landing change is independently available on the SQLite branch at `e2a3bc9`. Opening `/` shows the library; a valid `?book=...` link still opens that book.

## What this branch implements

- PostgreSQL queries through Drizzle and `pg`; no schema changes at application startup.
- Explicit, checksummed SQL migrations following the verified SQLite bootstrap import.
- Library-scoped book listing and membership checks on every book-resource route, including bulk item replacement, nested resources, generation and exports.
- Google login through Auth.js with database sessions. Only pre-created active users with library membership can sign in. Admin user creation is the invitation mechanism for this phase; invitation email delivery and acceptance tokens are not implemented.
- SHA-256 hashes of opaque session tokens in PostgreSQL; expiry and disabled-account checks on requests. Disabling a user revokes existing sessions. Provider access and refresh tokens are not stored.
- Google email linking only after the provider reports a verified address matching an invited account. Public registration is closed.
- Cloudflare Access as an alternative identity source, verifying the JWT signature, issuer, audience and expiry. Email headers alone never authenticate. The legacy shared-secret identity mode and automatic user/admin creation are removed.
- Same-origin checks for application mutations; Auth.js handles its own OAuth/CSRF endpoints.
- Deployment secrets and filesystem/authentication configuration removed from the admin editor. Model and generation limits are ordinary PostgreSQL settings.
- Atomic item append/replacement, chapter revision snapshots on text/title changes, and generation linked to the revision read before the model request. Legacy item provenance remains unknown. Manually added/replaced items also retain unknown provenance unless the server supplies a known revision.

`database/migrations/*.sql` is authoritative: it includes compound foreign keys and trigger behavior beyond the ORM mapping. Do not run `drizzle-kit push` or generate replacement DDL from the partial mapping. The migration account owns the schema; the web account should have only schema usage and DML on application tables. Trigger functions bind their lookups to their installation schema.

Admin is currently an application-wide role for users and settings. Membership is still required for book access. Changing a user's admin/member role updates their existing membership roles. Multiple-library selection and separate library administration are future work; new books/invitations use the current user's initial membership.

## Cloudflare identifiers

`top.dubugimchi.com` is the public application hostname. It is not the Access token issuer.

1. Open the Cloudflare Zero Trust dashboard. Find the **team name/domain** in Settings (often under Custom Pages or Team domain, depending on the dashboard version). It ends in `.cloudflareaccess.com`.
2. Open **Access controls → Applications → topreading → Configure → Additional settings**. Copy **Application Audience (AUD) Tag**. This is the self-hosted application for `top.dubugimchi.com`, using the `Family Access` policy.
3. The user supplied the following non-secret settings for the existing application. Use them when configuring the backend for that application; a separate staging Access application must use its own AUD and public URL:

   ```dotenv
   AUTH_MODE=cloudflare_access
   APP_BASE_URL=https://top.dubugimchi.com
   CLOUDFLARE_ACCESS_TEAM_DOMAIN=supervenience.cloudflareaccess.com
   CLOUDFLARE_ACCESS_AUD=d1c8751b006e02f5d135ccdb4402eaef1bca2f4897e592ad9aa3015232f9457a
   ```

The team domain and AUD are non-secret identifiers. OAuth secrets, session secrets and API keys should be entered directly into server configuration, never chat or Git. Both Access identifiers have now been supplied and accepted by the local configuration validator. This does not verify a live signed assertion or establish that the Ubuntu service uses the new authentication code. No production Cloudflare settings were changed by this work.

The development workspace currently has no network allowance for the team domain or public application hostname. Run this read-only check on Ubuntu to confirm that the server can obtain Cloudflare's public signing keys (it needs no login or secret):

```bash
python3 - <<'PYTHON'
import json
import urllib.request
url = "https://supervenience.cloudflareaccess.com/cdn-cgi/access/certs"
with urllib.request.urlopen(url, timeout=15) as response:
    keys = json.load(response).get("keys", [])
usable = [key for key in keys if key.get("kty") == "RSA" and key.get("kid") and key.get("n") and key.get("e")]
if not usable:
    raise SystemExit("FAIL: no usable RSA signing keys returned")
print(f"PASS: received {len(usable)} public signing key(s) from the team domain")
PYTHON
```

**Reported result:** the user ran this check on the Ubuntu server and received `PASS: Cloudflare signing keys are reachable`. Key retrieval from that server is confirmed.

A passing key check confirms reachability and key availability only. The release check still needs a real browser sign-in through Cloudflare into the migrated staging app, plus denied requests without a valid assertion. Do not paste session cookies or JWTs into chat. Keep the current SQLite service on its existing branch until the separate PostgreSQL/authentication deployment is ready.

Retain the tunnel or restrict origin ingress to the intended proxy. Confirm that a direct request with only an email header is denied and that the signed Access login works through the complete proxy chain before release.

## Google setup

1. Create a Google OAuth **Web application** client. During Google consent-screen testing, add the intended Google test users.
2. Register the exact authorized redirect URI for each environment, for example `https://top.dubugimchi.com/api/auth/callback/google`. Use a separate staging hostname/client before production.
3. Set `AUTH_MODE=google`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and a random `AUTH_SECRET` of at least 32 characters. Set `AUTH_URL` and `APP_BASE_URL` to the same trusted HTTPS origin, without a trailing slash. Generate the secret locally, for example `openssl rand -base64 48`.
4. Review imported users and memberships, including the initial admin, before enabling access. Existing active imported members are already invited. An administrator can pre-create additional users in Admin; they sign in with that exact Google-verified address.
5. Configure the proxy to preserve the public host/protocol, and test login, refresh, sign-out, an uninvited account and a disabled account through staging. Keep Cloudflare Access protection in place until the Google flow is verified; its login policy remains an independent gate if retained.

The app pins the trusted OAuth origin using `AUTH_URL`. Use production HTTPS so Auth.js issues secure cookies. Real Google consent/callback and live proxy tests require configured credentials and remain release gates. Local tests seed sessions and exercise the adapter/admission logic without contacting Google.

## First browser staging test on the existing Ubuntu host

Use a separate checkout at `/home/sungmin-kwon/topreading-staging`, a separate PostgreSQL database/container, and a copy of the verified baseline. The running service stays in `/home/sungmin-kwon/topreading-study-guide`. This is a staging rehearsal before purchasing/provisioning the VPS.

Start by creating the checkout and checking host capacity. Do not run the legacy deployment instructions in `docs/deployment.md` against this PostgreSQL branch.

```bash
(
  set -e
  cd /home/sungmin-kwon
  git clone --single-branch --branch modernization/postgres-auth \
    https://github.com/sungmin-kwon/topreading-study-guide.git topreading-staging
  cd topreading-staging
  git log -1 --oneline
  free -h
  df -h .
  sudo docker version --format 'Docker server: {{.Server.Version}}'
  python3 - <<'PYTHON'
from pathlib import Path
baseline = Path('/home/sungmin-kwon/topreading-study-guide/backups/migration-baseline-xuWh81Xw/topreading-backup-20261023_113708')
for name in ('topreading.sqlite', 'uploads'):
    item = baseline / name
    if not item.exists():
        raise SystemExit(f'Missing baseline component: {item}')
print('Verified baseline location is available for copying')
PYTHON
)
```

The command intentionally stops if the staging directory already exists; inspect it instead of overwriting it. The capacity check is needed before running a production build alongside the current application. No dependencies are installed and no services are restarted by this preparation step.

The user's Ubuntu host reported 6.3 GiB available memory, 421 GiB free disk space and Docker 29.3.0. This is sufficient for the initial native-app/PostgreSQL rehearsal.

Prepare the staged database and build with the checked-in helper:

```bash
(
  set -e
  cd /home/sungmin-kwon/topreading-staging
  git pull --ff-only
  python3 scripts/setup-ubuntu-staging.py \
    --baseline /home/sungmin-kwon/topreading-study-guide/backups/migration-baseline-xuWh81Xw/topreading-backup-20261023_113708
)
```

The helper verifies and copies the backup, installs a staging Python environment and npm dependencies, and starts **only** `topreading-staging-postgres` with its own `topreading-staging-pgdata` volume. PostgreSQL is bound to `127.0.0.1:55433` and limited to 768 MiB of memory. It imports into `topreading_staging`, applies migrations, grants a separate non-owner application role, and builds with a 3 GiB Node heap limit at reduced CPU priority. It preserves copied data/configuration on reruns, rejects unrelated containers/volumes, and stops if the staging web port is already occupied. The original snapshot is a rehearsal baseline, not a fresh production cutover snapshot.

The script prints `STAGING PREPARATION PASSED` when complete. It leaves the staging app stopped and its new Access AUD blank. It does not install a systemd unit, change Cloudflare routing, copy production secrets or configure an OpenAI key. Generated credentials are kept in mode-0600 files under `.env.local` and `backups/ubuntu-staging/`; do not post those files. Keep the setup state with the database volume because it is needed to resume safely.

If Python reports that `venv`/`ensurepip` is unavailable, install the Ubuntu `python3-venv` package and rerun. If a native npm dependency needs a compiler, install `build-essential`. Do not run the whole helper with `sudo`; it requests sudo for Docker only when necessary. No cleanup command removes the database automatically.

After preparation:

1. Review the preparation result and imported library counts. The existing four users and their roles/memberships are imported; confirm the intended administrator account during sign-in.
2. Configure a separate staging service on port 3100 after the staging Access settings are ready. Leave its OpenAI key unset while checking login, reading, editing and export.
3. Create a separate self-hosted Cloudflare Access application for a staging hostname (proposed: `top-staging.dubugimchi.com`) with the same family admission rules. Protect it before publishing its tunnel route. Use that application's **own** AUD, the existing team domain, and the staging hostname as `APP_BASE_URL`. The supplied production AUD belongs to `topreading` and must not be assumed to cover the new application.
4. Route only the staging hostname through the tunnel/proxy to the staging port. Test a real family-member login, an account excluded by policy, a disabled application user, and direct-origin requests without a signed assertion. Confirm library data and exports before planning the VPS deployment.

These steps do not establish Google OAuth; its real-provider test follows the separate Google setup above. Cloudflare and Google checks are distinct release gates.

## Isolated deployment sequence

Use Node 22, PostgreSQL 17 and the Python dependencies from `requirements.txt` and `requirements-migration.txt`. Keep the existing Ubuntu installation and its verified backup intact.

1. Create a **new** PostgreSQL database and a dedicated schema. Restore a consistent SQLite snapshot into it, with files copied to a staging upload directory. Use the existing importer with `MIGRATION_DATABASE_URL` supplied securely in the shell environment:

   ```bash
   python scripts/migrate-postgres.py \
     --database /secure/staging-baseline/topreading.sqlite \
     --uploads /secure/staging-baseline/uploads \
     --schema topreading --apply
   ```

   Review reconciliation before continuing. All current users join the initial shared library as recorded by the bootstrap migration. Do not run the bootstrap importer against an application schema after it has accepted new writes; its repeat-import checks expect the original snapshot.

2. Apply application migrations using the schema owner:

   ```bash
   DATABASE_SCHEMA=topreading npm run db:migrate
   ```

   This reads `MIGRATION_DATABASE_URL`, applies migrations under a transaction/advisory lock, and refuses altered checksums. A second invocation is a no-op. It deliberately requires the verified bootstrap schema first.

3. Create a separate, non-owner PostgreSQL login for the web service. Grant database connection, `USAGE` on the chosen schema and `SELECT, INSERT, UPDATE, DELETE` on its application tables. Do not grant schema creation/ownership or access to `migration_history`/`application_migrations`. Provision its password through the host's secret configuration. Restrict PostgreSQL networking to the application host/container network.
4. Copy `.env.example` into the staging configuration and fill PostgreSQL credentials, schema, auth settings, absolute upload/export paths and the Python interpreter. The web service receives `DATABASE_URL`, never `MIGRATION_DATABASE_URL`.
5. Run `npm ci`, `npm run build`, then start the staging app behind HTTPS. The build needs no database credentials; production startup validates auth and PostgreSQL configuration. Normal runtime environment values select the schema.
6. Validate the copied library and access-denial cases. Do not route `top.dubugimchi.com` to it yet.

For disposable localhost tests only, use `AUTH_MODE=off`, `ALLOW_INSECURE_LOCAL_AUTH=true`, a loopback `APP_BASE_URL` and a pre-created `DEV_USER_EMAIL` with library membership. Bind the server to `127.0.0.1`. This is an explicit development bypass, not a public deployment option.

## Validation commands

Run these only with disposable data. `test-postgres-auth.cjs` expects a localhost Google-mode server configured with test-only OAuth placeholders, a migrated library, and a schema named `test_*` or `topreading_runtime*`. It does not make Google or OpenAI requests.

```bash
npm run build
node --test scripts/test-mcq-quality.cjs
# Supply the local disposable DB URL in MIGRATION_TEST_DATABASE_URL:
python -m unittest discover -s scripts -p 'test_migrate_postgres.py'
# Supply DATABASE_URL, DATABASE_SCHEMA and AUTH_TEST_URL for the same local app:
ALLOW_TEST_WRITES=1 node scripts/test-postgres-auth.cjs
# Against a separate localhost server with the explicitly configured local test user:
ALLOW_TEST_WRITES=1 LIVE_UI_TEST_URL=http://127.0.0.1:3191 node scripts/test-live-workspace.cjs
ALLOW_TEST_WRITES=1 LIVE_UI_TEST_URL=http://127.0.0.1:3191 node scripts/test-live-import.cjs
```

Browser checks require Playwright/Chromium; `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` can point to existing installations. PostgreSQL driver dependencies for Python are in `requirements-migration.txt`.

## Rehearsal results (2026-10-23 UTC)

- Production build and type checking passed.
- The Ubuntu staging helper passed an end-to-end disposable rehearsal: dependency installation, copied-backup verification/import, PostgreSQL role restrictions and production build. A second run retained staging writes, files and configuration. Changed-backup, unrelated-container/volume, missing-configuration, simultaneous-run and wrong-checkout refusals were exercised.
- The restored PostgreSQL library passed browser checks for saved-book navigation, default library landing, chapter/question edits, failed-save retry, reload persistence, guide versions, PDF/DOCX export, and Korean/dark mobile layouts.
- A temporary TXT book passed upload, extraction, two-chapter creation, generation-setup and deletion checks without calling an AI model.
- All 40 book-resource handlers rejected another library's user and anonymous access. Actual Auth.js session retrieval and CSRF-protected sign-out passed; forged headers/cookies, expired/revoked sessions, disabled admins and uninvited/unverified Google identities were rejected.
- Signed Cloudflare fixtures passed; invalid issuer/audience, expiry, tampering and the public hostname used as a team domain were rejected. This tests verification code, not the live Cloudflare configuration.
- Failed item replacement/insertion rolled back; same-book constraints, populated-book deletion cascades and chapter-revision provenance passed. Migration reruns were a no-op.
- Seven synthetic migration tests and 13 mocked MCQ/preview regression tests passed.
- The library retained 8 books, 174 chapters, 7 guide runs, 7 study sets, 2,422 MCQs, 1,157 short answers, 2,989 vocabulary items, 156 summaries, 8 sources and 2,144 parsed pages. Temporary authorization fixtures were removed.

## Backups and remaining gates

`npm run backup` remains a legacy SQLite backup tool and explicitly refuses PostgreSQL URLs. For PostgreSQL, pause writes/processing, use `pg_dump --format=custom` with a dedicated backup role, copy the upload directory, then resume service. Restore the dump with `pg_restore` into a separate database and restore matching files before calling a backup valid. Keep both off-server. PostgreSQL does not make filesystem copies transactionally consistent.

This branch keeps local files and request-bound extraction/generation/export. It does **not** complete durable worker jobs, object storage, non-destructive chapter-boundary revisions, stale-guide notices, VPS provisioning, automated off-server backup/restore, or production cutover. Existing explicit chapter/book deletion removes corresponding revision history. Re-splitting remains destructive and needs the later import-workflow overhaul.

Next: configure and verify the real authentication boundary in staging, implement durable jobs and private file storage, then complete workflow/recovery checks and a VPS restore rehearsal before the production maintenance window. Preserve the home service for rollback; after new cloud writes, rollback requires data reconciliation rather than only changing DNS.
