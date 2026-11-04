# PostgreSQL and authentication staging

For current day-to-day operations and the consolidated incident record, use the [administration manual](admin-runbook.md). Sections describing initial dual-gate setup below are retained as implementation history; staging now uses Google login without the extra Access gate.

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

## Google setup on the existing staging site

The user confirmed that `top-staging.dubugimchi.com` opens the Library, question edits survive reload, and PDF/DOCX downloads look correct. Multiple-version switching has passed the local disposable rehearsal but remains untested on Ubuntu because the user has only one saved guide version. Subsequently, the user confirmed real Google login/sign-out, rejection of an uninvited Google account after OAuth, and denied library access after disabling an already signed-in member.

### Create a staging OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/), create/select a project for TopReading staging, then open **Google Auth Platform**. Creating an OAuth client does not move your hosting to GCP.
2. Under **Branding** (or **Get started**), name the app **TopReading Staging**, choose your support email and developer contact email. If asked for an authorized domain, use `dubugimchi.com`.
3. Under **Audience**, choose **External** for personal/family Google accounts and keep the app in **Testing**. Add your Google email and the family accounts you intend to test under **Test users**. Use the same exact email as an existing active TopReading user. For a different email, add that user through TopReading Admin while Cloudflare mode still works; the administrator-created user and library membership are the invitation for this phase.
4. Under **Clients → Create client**, choose **Web application**, name it **TopReading staging**, and add this exact **Authorized redirect URI**:

   ```text
   https://top-staging.dubugimchi.com/api/auth/callback/google
   ```

   Authorized JavaScript origins are not needed for this server-side Auth.js flow. No production callback is needed for this staging client.
5. Save the client ID and client secret securely. Google may show the secret only at creation; use it directly on Ubuntu, not in chat or Git. Only basic identity scopes (`openid`, `email`, `profile`) are needed; no Drive/Gmail scopes or API keys.

Google's [OpenID Connect setup documentation](https://developers.google.com/identity/openid-connect/openid-connect) describes the OAuth client and exact redirect URI requirement.

### Update the staging build, then switch authentication

For the book-info UI update, stop **only** staging while rebuilding its current `.next` directory. Production stays running. Run as the normal checkout owner:

```bash
(
  set -e
  cd /home/sungmin-kwon/topreading-staging
  git pull --ff-only
  sudo systemctl stop topreading-staging.service
  python3 scripts/migrate-ubuntu-staging.py
  NODE_OPTIONS=--max-old-space-size=3072 nice -n 10 npm run build
  sudo systemctl start topreading-staging.service
  systemctl is-active topreading-staging.service
)
```

The migration helper applies pending controlled migrations to the prepared staging database before the build. It uses the existing private setup credentials; there is no need to copy passwords into the shell or chat. If the build fails, leave staging stopped, inspect the build error and rerun after fixing it; production is unaffected. Do not rerun the initial importer or remove staging data. Verify the simplified Edit Book Info dialog before switching login.

Once the Google client is ready:

```bash
cd /home/sungmin-kwon/topreading-staging
python3 scripts/start-ubuntu-staging.py --google
```

The helper prompts for missing client credentials directly in the terminal, hides the secret input, preserves the database/upload paths and Cloudflare identifiers, generates a strong `AUTH_SECRET` if absent, pins both `AUTH_URL` and `APP_BASE_URL` to `https://top-staging.dubugimchi.com`, and restarts **only** staging. Credentials stay in the Git-ignored mode-0600 `.env.local`. Existing nonempty Google credentials are reused; correct them locally if necessary. It checks unauthenticated-origin rejection and the provider callback URL. Those checks cannot validate the Google secret or complete the provider round trip.

Keep the existing Cloudflare Access policy and tunnel/proxy routes. In a private browser window, pass the Family Access gate, then choose **Continue with Google**. The application now trusts its own Google session; Cloudflare still controls public entry. These can be two separate sign-in prompts.

Check the following before declaring Google login complete:

- An existing invited Google account reaches the library and remains signed in after reload.
- Sign-out revokes the app session; signing in again works. Cloudflare's independent session may remain active.
- An account admitted by Cloudflare and Google testing but absent from TopReading is denied by the application. An account blocked by Cloudflare cannot test the app's invitation boundary.
- Disabling a temporary test member in Admin denies their existing session. Keep a separate active administrator signed in; do not disable your only administrator.
- Members cannot access Admin; another library's resources and private downloads are denied (automated local coverage already exists).

Historical rollout note: before Access removal, the starter's `--aud` option could switch the app back to the then-existing staging Access application. That application has now been deleted. Do not reuse its historical AUD or switch modes to troubleshoot DNS. If a future rollback deliberately uses Access identity, first establish a new staging Access application, verify its policy and fresh AUD, then configure the complete boundary. Ordinary staging updates retain `AUTH_MODE=google`.

Common errors: `redirect_uri_mismatch` means the Google client redirect must exactly match the HTTPS callback above; `invalid_client` usually means the client ID/secret or client type is wrong; an application invitation error requires an active matching email and library membership. Share error names only, without callback query strings, cookies, secrets or JWTs.

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

### Start the prepared staging service

**Ubuntu result reported by the user:** `STAGING PREPARATION PASSED`; PostgreSQL is bound only to `127.0.0.1:55433`. The user also supplied the separate staging application's non-secret AUD:

```dotenv
APP_BASE_URL=https://top-staging.dubugimchi.com
CLOUDFLARE_ACCESS_TEAM_DOMAIN=supervenience.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUD=7615ba6c2c501dc8c6aee94fe09ca10d6fac8b4776dda968df9e5683cb986788
```

Run this as the normal Ubuntu checkout owner:

```bash
(
  set -e
  cd /home/sungmin-kwon/topreading-staging
  git pull --ff-only
  python3 scripts/start-ubuntu-staging.py \
    --aud 7615ba6c2c501dc8c6aee94fe09ca10d6fac8b4776dda968df9e5683cb986788
)
```

The helper checks the prepared database and restricted application role, updates only staging authentication settings, installs **topreading-staging.service**, and starts the existing build on **port 3100**. It uses sudo only for installing/managing this separate unit. It leaves the production service, its files and port 3000 unchanged. OpenAI remains unconfigured; generation is not part of this test.

The service reads the private staging environment file, checks database readiness before each start, and has a 1.5 GiB memory limit. The helper refuses the production AUD, a mismatched database, or an unrelated service/port conflict. Its direct-origin probes must reject missing assertions, forged email headers and malformed tokens with HTTP 401 before it prints `STAGING SERVICE READY`. Those negative checks do not prove a genuine signed login works.

The service binds to `0.0.0.0:3100` so the existing Docker-based Nginx Proxy Manager can reach the native Ubuntu application. Do not add router port forwarding for 3100; public access uses the existing tunnel. PostgreSQL remains loopback-only.

If startup fails, inspect these locally and share only relevant error lines, with any tokens/credentials removed:

```bash
systemctl is-active topreading-staging.service
sudo journalctl -u topreading-staging.service -n 50 --no-pager
```

To stop only staging: `sudo systemctl stop topreading-staging.service`. Starting this helper again preserves the database and uploads. It starts the prepared build; it is not a general deployment/rebuild command for future application changes.

### Route the staging hostname

Before adding its public tunnel route, confirm the separate **Self-hosted** Access application covers **top-staging.dubugimchi.com** and uses the intended **Family Access** policy. The production hostname/application remains unchanged.

1. In **Nginx Proxy Manager → Hosts → Proxy Hosts → Add Proxy Host**, set:
   - Domain Names: `top-staging.dubugimchi.com`
   - Scheme: `http`
   - Forward Hostname / IP: copy the value from the existing working `top.dubugimchi.com` proxy host. This reaches the native Ubuntu host from Docker; do not substitute `127.0.0.1`, which would address the NPM container itself.
   - Forward Port: `3100`
   - SSL certificate: None; Force SSL: off for this internal HTTP origin. Cloudflare serves public HTTPS through the tunnel.
2. In **Cloudflare Zero Trust → Networking → Tunnels**, select the existing tunnel and add a **Published application** route (some dashboard versions call this **Public Hostnames** or **Published application routes**):
   - Hostname: `top-staging.dubugimchi.com`
   - Service: `http://<existing Nginx Proxy Manager host>:80`. Reuse the NPM hostname/IP reachable from the existing tunnel. This is the proxy address, not necessarily the forward address used in step 1.
   - If configuring **HTTP Host Header**, use `top-staging.dubugimchi.com`; do not copy an override for the production hostname.
   - If the tunnel's optional **Protect with Access** setting is enabled, select the staging application/AUD.
3. Open **https://top-staging.dubugimchi.com** in a private browser window. Sign in as an existing imported family member. Confirm the library contains **8 books**, open a saved guide and source passage, make a small staging edit and reload, then try an export. Changes made in production after the baseline snapshot are intentionally absent from this rehearsal.

The existing four users and their roles/memberships were imported. Confirm the intended administrator account during sign-in. Also test an account excluded by the Access policy and a disabled application account before release. Never paste Access JWTs, cookies, `.env.local` or the setup state into chat.

References: [Cloudflare tunnel setup](https://developers.cloudflare.com/tunnel/get-started/) and [HTTP Host Header origin setting](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/).

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
- The staging startup helper passed a disposable database/configuration rehearsal and a real production-build startup with the staging Access settings. Unsigned requests, forged identity headers and malformed assertions returned HTTP 401. Production-AUD, unrelated-service, symlink-unit and mismatched-database refusals preserved configuration. `systemd-analyze verify` passed with a Docker dependency stub; this workspace has no systemd manager, so actual unit installation/start and real Cloudflare browser login remain Ubuntu checks.
- The restored PostgreSQL library passed browser checks for saved-book navigation, default library landing, chapter/question edits, failed-save retry, reload persistence, guide versions, PDF/DOCX export, and Korean/dark mobile layouts.
- A temporary TXT book passed upload, extraction, two-chapter creation, generation-setup and deletion checks without calling an AI model.
- All 40 book-resource handlers rejected another library's user and anonymous access. Actual Auth.js session retrieval and CSRF-protected sign-out passed; forged headers/cookies, expired/revoked sessions, disabled admins and uninvited/unverified Google identities were rejected.
- Signed Cloudflare fixtures passed; invalid issuer/audience, expiry, tampering and the public hostname used as a team domain were rejected. This tests verification code, not the live Cloudflare configuration.
- Failed item replacement/insertion rolled back; same-book constraints, populated-book deletion cascades and chapter-revision provenance passed. Migration reruns were a no-op.
- Seven synthetic migration tests and 13 mocked MCQ/preview regression tests passed.
- The library retained 8 books, 174 chapters, 7 guide runs, 7 study sets, 2,422 MCQs, 1,157 short answers, 2,989 vocabulary items, 156 summaries, 8 sources and 2,144 parsed pages. Temporary authorization fixtures were removed.

## Follow-up validation (2026-10-24, Asia/Seoul)

- The user confirmed successful live staging access, the Library landing page, persistent question edits and working PDF/DOCX downloads. Ubuntu version switching remains unchecked because there is only one saved version; the earlier local fixture check is still the available evidence.
- The simplified book-info modal passed a production build/type check and desktop/mobile browser checks for light/dark themes, Korean labels, initial focus, keyboard isolation, focus return, Escape/cancel, failed-save retry and persistence. Disposable metadata edits were restored.
- Google staging configuration was rehearsed with dummy OAuth credentials: invalid-client refusal left configuration untouched, secret files retained mode 0600, database/upload settings were preserved, Cloudflare fallback and Google credential reuse worked, and local requests confirmed the staging HTTPS callback and secure session resolution using a temporary seeded session. That local rehearsal did not contact Google. The subsequent Ubuntu browser results are recorded below.

## Admin update and live authentication results (2026-10-24, Asia/Seoul)

The user completed the real Google callback and sign-out/sign-in tests on Ubuntu. A Google account absent from TopReading was rejected after OAuth. After adding that account as a member it could load the library; disabling it denied library loading on reload of its existing signed-in window. These live checks confirm the invitation and disabled-session boundary. Those membership tests were completed while Cloudflare Access was still present. The staging gate was subsequently removed and public anonymous-denial checks passed; see the gate-removal record below.

Admin now shares the library's visual style, persistent light/dark and language controls, a searchable user list, inline editors, and a separate Generation settings view. Add-user fields appear on demand. Failed saves retain drafts and can be retried; Cancel discards user edits. Adding a user grants an invitation immediately but does not send email.

Administrators appear before members, with email ordering within each group; role changes reorder the list immediately. The Notes field is removed from the editor. Existing stored notes are retained and are not overwritten by user edits.

Generation model is a dropdown with `gpt-6-luna` as the default and `gpt-5-nano` as the alternative. The model and the two editable generation limits now come only from PostgreSQL, with built-in defaults when a setting is absent. `.env.local` holds secrets and deployment configuration; `OPENAI_MODEL`, `MAX_GENERATION_CHAPTERS` and `MAX_GENERATION_ITEMS` no longer affect runtime settings.

Migration `0004_generation_settings.sql` seeds missing defaults and updates an old saved `gpt-5-mini` model to `gpt-6-luna` once. Existing alternatives such as `gpt-5-nano`, custom model choices and saved generation limits are preserved. Runtime reads return the stored value directly, without translating model names. Select and save changes through Admin.

Use the pull/stop/**migrate**/build/start command in the Google setup section above. `scripts/migrate-ubuntu-staging.py` applies the checksummed migrations using the existing private owner credentials, checks the restricted app connection, and removes the three obsolete keys from staging `.env.local`. Other configuration, including Google and database credentials, is preserved. Reruns are safe. It neither imports the SQLite baseline again nor restarts a service. For another deployment, use the general `db:migrate` command with its own migration credentials, and remove the obsolete environment keys locally.

Dropdown disclosures and select controls now share the same SVG chevron, including Text tools, Chapter settings, language and model selectors. Native select semantics, keyboard operation and forced-colors fallback are preserved.

To remove an account, first **Edit → Status: Disabled → Save**, then choose **Delete user** and confirm. Deletion removes the user, library memberships, linked Google account and sessions. Shared libraries/books/guides remain; retained job records lose their requester reference. Disable alone remains reversible. Re-adding a deleted email creates a new account.

Both API and UI prevent self-deletion and changing one's own role/status. The API refuses deletion of active accounts. Access changes are serialized and recheck the acting administrator inside the transaction; the last active administrator cannot be disabled/demoted even under concurrent changes. All account cleanup is transactional. The user-deletion change itself does not require a schema change; the settings cleanup above uses migration 0004.

Validation passed: settings migration and rerun, environment cleanup with credentials/library counts preserved, database-only model reads and alternative selection, shared-chevron checks in light/dark/mobile/forced-colors modes, production build/type checking, the isolated deletion/authorization/rollback/concurrency checks, and desktop/mobile browser checks for add/edit/cancel/retry, saved changes, disable/delete confirmation, search, generation settings and persistent dark/Korean preferences. All test accounts lived in a temporary schema that was removed afterward.

Deploy with the staging-only pull/stop/build/start command in the Google setup section. This preserves Google mode and credentials; do not rerun the starter with `--aud` unless intentionally switching back to Cloudflare authentication.

The regression script `scripts/test-admin-users.cjs` creates and drops its own random `test_admin_*` schema in a **disposable localhost PostgreSQL database**. Supply `ADMIN_TEST_OWNER_URL` and `ADMIN_TEST_APP_URL` through the local environment, plus `ALLOW_TEST_WRITES=1`. The app account needs no schema ownership; the owner provisions test schema access. It checks authorization, same-origin protection, self/active-user restrictions, final/concurrent administrator protection, rollback after a forced delete failure, account/session removal and retained shared data, then exercises the Admin UI in Playwright. The existing production build is required. Never point test connections at the production database.

## Remove the extra staging Access gate

**Verified on staging:** the user deleted the staging Access application, confirmed Protect with Access is off, and completed Google sign-in/sign-out in an InPrivate window without the Cloudflare gate. Both `ORIGIN GOOGLE ACCESS CHECK PASSED` and `PUBLIC GOOGLE ACCESS CHECK PASSED` were reported. Public anonymous library/Admin/download requests and forged headers/sessions were rejected. Production was not changed. The earlier uninvited/disabled-account tests passed before gate removal; a repeat of those account tests and a signed-in download after removal have not been separately reported.

The public check initially failed because Tailscale split DNS routed `dubugimchi.com` to `100.101.76.39` (the Ubuntu server itself), where DNS queries timed out. Explicit Ethernet queries resolved the public hostname. A hostname-specific Ethernet exception initially restored the public checker.

The first persistence instructions omitted `DNSDefaultRoute=yes`. After reboot, the tunnel crashed while resolving Cloudflare endpoints through Docker DNS; a host Ethernet lookup returned “No appropriate name servers or networks for name found.” The final correction restored default DNS routing and the public checker passed after restarting the tunnel.

Correct persistent file: `/etc/systemd/network/10-netplan-enp2s0.network.d/50-topreading-staging-dns.conf`:

```ini
[Network]
Domains=~top-staging.dubugimchi.com
DNSDefaultRoute=yes
```

Matching runtime settings:

```bash
sudo resolvectl domain enp2s0 '~top-staging.dubugimchi.com'
sudo resolvectl default-route enp2s0 yes
sudo resolvectl flush-caches
```

**Reboot verified:** the operator subsequently supplied output showing Docker/staging enabled and active, Ethernet `+DefaultRoute` and the staging route preserved, successful DNS resolution, all three containers running, and origin/public checkers passing. The operator reported normal operation; individual browser/account/download results were not itemized. The underlying broad Tailscale split-DNS rule remains; identify dependent services before repairing/narrowing it. No Docker Compose DNS override was applied. See the [full incident and recovery procedure](admin-runbook.md#10-dns-configuration-and-the-reboot-incident).

The procedure below is retained for reference; the staging Access application has already been removed.

1. On Ubuntu, update the staging checkout and check the running origin:

   ```bash
   cd /home/sungmin-kwon/topreading-staging
   git pull --ff-only
   python3 scripts/check-staging-google-access.py
   ```

   Require `ORIGIN GOOGLE ACCESS CHECK PASSED` before changing the gate. This uses only unauthenticated GET requests to localhost:3100. It checks the Google provider/callback, app login page, navigation redirects, library/Admin/download denial and forged-header/session rejection. It does not read secrets or change configuration. This helper itself needs no build or service restart.

2. In Zero Trust → Networking → Tunnels (sometimes Networks → Connectors), open the existing tunnel, then the published application/public hostname route for **top-staging.dubugimchi.com**. If **Protect with Access** is enabled under its additional application settings, turn it off **for this staging route only** and save. Keep the hostname, NPM service URL, HTTP Host Header and all other routes unchanged. Cloudflare's edge Access application remains in place until the next step.

3. Open Zero Trust → Access controls → Applications. Select the self-hosted application whose only destination is **top-staging.dubugimchi.com**, with AUD `7615ba6c2c501dc8c6aee94fe09ca10d6fac8b4776dda968df9e5683cb986788`. Record its current policy assignment/settings for rollback, then delete that staging Access application. If it has other destinations, remove only the staging destination rather than deleting the shared application. Keep the production `topreading` application for **top.dubugimchi.com**, the shared **Family Access** policy, tunnel, DNS records and HTTPS settings. Do not disable the tunnel.

4. Run the same checker through public HTTPS, without any login cookies:

   ```bash
   python3 scripts/check-staging-google-access.py --public
   ```

   Require `PUBLIC GOOGLE ACCESS CHECK PASSED`. Redirects and non-JSON edge responses fail the check; an existing Cloudflare browser session cannot mask a remaining Access gate. HTTPS certificate validation and configured proxies are preserved. The public hostname is fixed to staging; the tool cannot be pointed at production.

5. In a fresh private window, open `https://top-staging.dubugimchi.com`. The first screen should be TopReading's **Continue with Google**, with no Cloudflare/team sign-in. Confirm invited sign-in, library access and one download, then sign out and confirm library access requires login again. Check an uninvited Google account; for a conclusive application-membership check, it must be allowed by the Google OAuth client's Testing audience first. Recheck a disabled member's existing session. Google account selection/consent is part of the one application sign-in and may still appear.

No `.env.local`, OAuth callback or app authentication changes are required. Keep `AUTH_MODE=google`. Unused Cloudflare team/AUD identifiers may remain in the file. Do not rerun the starter with `--aud`: that would switch the application back to requiring Access assertions.

If checks reveal an application authorization regression, restore the staging self-hosted Access application with the saved hostname/policy assignment while diagnosing. A DNS or connection failure alone calls for network diagnosis, not an authentication-mode change. Recreating an application gives it a new AUD. If also re-enabling the tunnel's optional Protect with Access validation, select that new application/AUD. Keep TopReading in Google mode throughout rollback. A broad/wildcard Access application may also cover staging; narrow its scope deliberately without removing protection from other hostnames.

If the checker cannot reach `/api/auth/providers`, rerun both origin and public checks before changing authentication settings. The checker distinguishes DNS lookup, TLS verification/handshake, timeout, refused/reset connections and other network/proxy failures without printing response bodies or credentials. A tunnel-side Access denial usually produces an HTTP error rather than a transport error; do not assume it is the cause of a failed connection. Confirm that the staging DNS record and published tunnel route still exist, then check Protect with Access on that route. Keep `AUTH_MODE=google` and certificate validation enabled.

The checker is a deployment smoke check, not a replacement for the real Google sign-in and membership tests above. Local validation used the built app in Google mode with dummy OAuth credentials; it made no Google requests and changed no library data.

## UI consistency review

The live workspace, Admin and sign-in/out pages share the same control typography, colors and appearance toggle. The account disclosure uses plain icons and regular-weight labels; it closes on Escape, outside clicks or focus leaving it. The import and chapter-boundary tools use the same document column and reduced card styling as the guide pages. Parser implementation names no longer appear in the live source-file metadata.

Version renaming uses the shared native dialog treatment, with Escape/focus return, draft reset on Cancel and an inline retryable save error. The page-start table fits its pane, and Admin scrolls within the viewport on small screens. `/legacy` redirects to the current Library; the isolated `/prototype` remains a design reference.

Validation: production build/type checking; desktop, mobile and landscape browser review of Library, Text, all three question editors, guide versions, generation, exports, source/splitting tools, Admin and login/sign-out. Checked English/Korean, light/dark, menu keyboard dismissal, dialog cancellation/focus return/failed-save retention, page-start column fit and Admin scrolling. The eight-viewport Text scroll regression check also passed. Browser checks used the restored local library without writes or paid generation.

This update does not change database schema, authentication rules, environment settings or saved library content. Deploy with the staging update command above.

## Backups and remaining gates

`npm run backup` remains a legacy SQLite backup tool and explicitly refuses PostgreSQL URLs. For PostgreSQL, pause writes/processing, use `pg_dump --format=custom` with a dedicated backup role, copy the upload directory, then resume service. Restore the dump with `pg_restore` into a separate database and restore matching files before calling a backup valid. Keep both off-server. PostgreSQL does not make filesystem copies transactionally consistent.

This branch keeps local files and request-bound extraction/generation/export. It does **not** complete durable worker jobs, object storage, non-destructive chapter-boundary revisions, stale-guide notices, VPS provisioning, automated off-server backup/restore, or production cutover. Existing explicit chapter/book deletion removes corresponding revision history. Re-splitting remains destructive and needs the later import-workflow overhaul.

Next: implement PostgreSQL backup/restore support, then durable jobs and private file storage, then complete workflow/recovery checks and a VPS restore rehearsal before the production maintenance window. Preserve the home service for rollback; after new cloud writes, rollback requires data reconciliation rather than only changing DNS.

## 2026-10-26: backup and generation-worker release

Implemented manual PostgreSQL backups with private recovery files and isolated restore verification, and a persistent generation queue consumed by a standalone systemd worker. Completed chapters/progress survive web restarts; worker interruption preserves partial results without automatic paid replay. Local restore and mocked-provider lifecycle tests passed. Ubuntu deployment, real generation acceptance and off-server backup storage are pending. See [deployment and operations](postgres-backup-worker.md). Extraction/export workers, automatic resumption, scheduled backups and VPS cutover remain future work.

### 2026-11-04: compact question editing and review reasons

MCQ and short-answer lists now start as collapsed question outlines. Click a question to reveal its choices/answer, explanation, and any review reasons; Expand all and Collapse all apply to the current list. An active edit stays open when collapsing answers. Review badges remain visible while collapsed.

Use the dotted handle to drag a question to another position in the same chapter and question type. Mouse and touch are supported; focus the handle and press Up/Down for keyboard ordering. Order is saved to PostgreSQL in one transaction and used on reload/export. Failed saves leave the displayed order unchanged; reload before retrying if the request outcome is uncertain.

Edit and Delete are directly visible. Delete opens an inline Delete/Keep confirmation. Add Question is available above and below the list; the form opens at that end and focuses its first field. Added questions append to the end and can then be dragged into place. Starting another addition does not discard the current draft. Save/cancel an unsaved existing edit before adding.

Review reasons are recovered from saved generation output by chapter and question content, independent of question order or shuffled answer choices. They distinguish content/wording problems from unavailable reviews or exhausted review budgets. Existing guides do not need regeneration. Edited, ambiguous, or missing historical matches show an explicit unavailable-reason message rather than borrowing another question's flags. These are historical checks, not a fresh model review of manual edits.

No database migration, new dependency, environment change or paid model call is needed for this UI release. Deploy with the existing generation worker idle: stop staging web/worker, pull this branch, build, and restart both. Local checks cover persistent mouse/keyboard/touch ordering, collapse/edit behavior, add/delete, failed/invalid moves, mobile layout, review matching and the existing MCQ quality regressions. Ubuntu acceptance is pending deployment.


### 2026-11-04: vocabulary outlines, compact Library and Book info tab

Vocabulary now uses the same collapsed rows as questions: expand a word for its definition/example, use Expand all or Collapse all, and drag the dotted handle to reorder within the chapter. Focus the handle and press Up/Down for keyboard ordering. Edit and Delete are directly available, with inline deletion confirmation. Add Word is available at either end of the list; new words append and can then be moved. Active edits remain expanded.

Library rows have reduced padding, smaller book markers and tighter title/author spacing. Loading a saved book now displays a centered status message and spinner, with reduced-motion support.

Book metadata is edited in the **Book info** tab alongside Text, Study guides and Export. The tab supports direct links (`?book=<id>&section=info`). Save persists the title, author and reading level; Reset restores saved values. Drafts survive switching between these tabs, failed saves retain entered text, and switching books or leaving the page warns about unsaved metadata. Delete book remains available in this tab.

Validation: production build/type checking and browser checks against a disposable restored PostgreSQL library passed. Checks covered vocabulary mouse/keyboard ordering persistence, expansion/editing, addition/deletion, metadata saving/reloading, draft retention, failed saves, Reset, centered loading, compact Library rows and a narrow-screen Book info layout. Test data changes were restored. No paid generation was performed. This release needs no migration, new dependency or environment change. Ubuntu deployment and acceptance remain pending; update with the worker idle using the existing staging build/restart procedure.
