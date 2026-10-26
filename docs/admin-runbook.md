# TopReading — Administration Manual, Operations Runbook, and Migration Log

**Snapshot date:** 2026-10-26 (Asia/Seoul)  
**Owner/operator:** Sungmin Kwon  
**Repository:** https://github.com/sungmin-kwon/topreading-study-guide  
**Modernization branch:** `modernization/postgres-auth`  
**Purpose:** A standalone handover document for operating the current installation, understanding the changes already made, troubleshooting failures, and continuing the migration.

This document contains operational identifiers and paths, but no passwords, OAuth secrets, API keys, tunnel tokens, or session cookies. Keep a private copy alongside your recovery records. Store the actual credentials separately in a password manager or encrypted backup.

## Contents

1. [Current status and important boundaries](#1-current-status-and-important-boundaries)
2. [Deployment inventory and architecture](#2-deployment-inventory-and-architecture)
3. [Quick operational checks](#3-quick-operational-checks)
4. [Using the application and administering members](#4-using-the-application-and-administering-members)
5. [Configuration and generation settings](#5-configuration-and-generation-settings)
6. [Google login and Cloudflare configuration](#6-google-login-and-cloudflare-configuration)
7. [Updating the staging application](#7-updating-the-staging-application)
8. [PostgreSQL migrations and data preservation](#8-postgresql-migrations-and-data-preservation)
9. [Backups, recovery, and rollback](#9-backups-recovery-and-rollback)
10. [DNS configuration and the reboot incident](#10-dns-configuration-and-the-reboot-incident)
11. [Troubleshooting by symptom](#11-troubleshooting-by-symptom)
12. [MCQ quality workflow](#12-mcq-quality-workflow)
13. [Verification record and remaining checks](#13-verification-record-and-remaining-checks)
14. [Implementation and incident log](#14-implementation-and-incident-log)
15. [Next implementation sequence](#15-next-implementation-sequence)
16. [Command reference and future handover template](#16-command-reference-and-future-handover-template)
17. [Source documents](#17-source-documents)

## 1. Current status and important boundaries

### What is working now

- The existing production service remains on the home Ubuntu PC.
- A separate staging service on the same PC runs the PostgreSQL/authentication branch and a migrated copy of the library.
- Staging uses application-level Google login with invite-only membership and database-backed sessions.
- The extra Cloudflare Access sign-in has been removed from **staging**. A fresh InPrivate browser reaches TopReading's Google sign-in directly, and sign-in/sign-out work.
- The running staging origin and public hostname passed the anonymous-access checker. Library, administrative APIs, and export endpoints rejected anonymous requests; forged identity headers and fake sessions were rejected.
- The current UI has been substantially redesigned and reviewed across desktop/mobile, English/Korean, and light/dark modes.
- The latest DNS correction restored Cloudflare tunnel connectivity, and the public checker passed again.

### What is not finished

- No VPS has been provisioned or put into service for this project.
- Production has not been switched to the PostgreSQL/Google-login staging deployment.
- Production and staging are separate data stores. Changes made in either one do **not** automatically appear in the other.
- Durable background workers, private object storage, and automated PostgreSQL backup/restore are future work.
- **Post-reboot recovery is verified:** Docker and staging are enabled/active; Ethernet retains `+DefaultRoute` and the staging DNS route; the tunnel, NPM and PostgreSQL are running; origin/public checks passed without a manual recovery step.
- The broad Tailscale split-DNS rule still exists. The staging-hostname exception works around it; it does not repair that rule for every other `dubugimchi.com` hostname.

### How to read verification claims

“Implemented” means the repository contains the change. “Locally tested” means it was exercised in an isolated development/rehearsal environment. “Reported on Ubuntu” means the operator ran it on the home server and supplied the result.

A Git pull changes the checkout; it does not prove that the running Next.js build includes that commit. The operator confirmed earlier UI improvements live. The final comprehensive UI pass was implemented and locally tested; its deployment should be checked through the update procedure rather than inferred from a later Git pull.

Historical documents describe earlier stages. In particular, old instructions showing a double sign-in, a live `/legacy` interface, or Cloudflare authentication as staging's active mode are not the current operating instructions.

## 2. Deployment inventory and architecture

### 2.1 Production versus staging

| Item | Existing production | Modernized staging |
| --- | --- | --- |
| Public hostname | `top.dubugimchi.com` | `top-staging.dubugimchi.com` |
| Machine | Home Ubuntu PC | Same home Ubuntu PC |
| Checkout | `/home/sungmin-kwon/topreading-study-guide` | `/home/sungmin-kwon/topreading-staging` |
| Application service | `topreading-study-guide.service` | `topreading-staging.service` |
| Web port | `3000` | `3100` |
| Application process | Native Node/Next.js under systemd | Native Node/Next.js under systemd |
| Database | SQLite | PostgreSQL 17 in Docker |
| Database location | `data/dev.db` in the production checkout | Docker volume `topreading-staging-pgdata` |
| Runtime branch | SQLite modernization line; last tracked as `modernization/prototype-and-postgres` | `modernization/postgres-auth` |
| Public authentication | Existing Cloudflare Access setup retained | TopReading Google login; extra Access gate removed |
| Relationship between libraries | Independent production data | Migrated snapshot plus staging edits |

The historical production baseline was commit `2f1102d`. That is the backup's code reference, **not a claim that it is the current production HEAD**. Check the actual checkout before any production maintenance.

Do not deploy the PostgreSQL branch over the SQLite checkout or point staging at the production database/upload directories.

### 2.2 Host and networking

| Item | Recorded value |
| --- | --- |
| Ubuntu username | `sungmin-kwon` |
| Hostname | `sm-ubuntu-server` |
| Tailscale address | `100.101.76.39` |
| Last recorded LAN address | `172.30.1.99` via DHCP |
| LAN gateway | `172.30.1.254` |
| Ethernet interface | `enp2s0` |
| Host network manager | Netplan → systemd-networkd |
| Generated network file | `/run/systemd/network/10-netplan-enp2s0.network` |
| Ethernet DNS servers | `168.126.63.1`, `168.126.63.2` |
| Tailscale DNS resolver | `100.100.100.100` |
| Tailscale MagicDNS suffix | `aardvark-dominant.ts.net` |
| Node version reported on Ubuntu | `v22.22.2`; use Node 22 for this branch |
| Docker version reported during preparation | `29.3.0` |

The LAN address is DHCP-assigned. Verify it when diagnosing proxy failures; do not assume it can never change.

### 2.3 Docker resources

| Resource | Purpose / known configuration |
| --- | --- |
| `cloudflare-tunnel` | Shared cloudflared connector; restart policy `unless-stopped` |
| `nginx-proxy-manager` | Shared internal reverse proxy; restart policy `unless-stopped`; published ports 80, 81, 443 |
| `topreading-staging-postgres` | Staging PostgreSQL; restart policy `unless-stopped` |
| `topreading-staging-pgdata` | Persistent PostgreSQL volume |
| `proxy-nw` | Reported network of the tunnel container |
| `/home/sungmin-kwon/homelab/docker-compose.yaml` | Reported Compose file defining the tunnel |
| Compose service `tunnel` | Service corresponding to `cloudflare-tunnel` |

Other containers, including Papra and BentoPDF, share this machine. Restarting the tunnel or nginx Proxy Manager may affect other public services. Ordinary TopReading updates should restart only `topreading-staging.service`.

During the DNS incident, the tunnel container had `DNS=[]`: no per-container DNS override. Its logs used Docker's internal resolver `127.0.0.11`. No Compose DNS change was needed after correcting host DNS.

### 2.4 Staging PostgreSQL and files

| Item | Value |
| --- | --- |
| Container image used by setup | `postgres:17` |
| Host binding | `127.0.0.1:55433` → container `5432` |
| Database | `topreading_staging` |
| Application schema | `topreading_staging` |
| Restricted application role | `topreading_app` |
| Setup/migration owner role | `staging_owner` |
| Upload directory | `/home/sungmin-kwon/topreading-staging/data/uploads` |
| Export directory | `/home/sungmin-kwon/topreading-staging/data/exports` |
| Backup directory | `/home/sungmin-kwon/topreading-staging/backups` |
| Python environment | `/home/sungmin-kwon/topreading-staging/.topreading` |
| Private setup state | `backups/ubuntu-staging/state.json` |
| Private PostgreSQL setup environment | `backups/ubuntu-staging/postgres.env` |
| Application configuration | `.env.local` in the staging checkout root |

The prepared database container is limited to approximately 768 MiB RAM and 1.5 CPUs. The staging service uses a 1 GiB Node heap limit and a 1.5 GiB systemd memory limit. The build command uses a separate 3 GiB heap allowance.

### 2.5 Request path

```text
Browser
  → Cloudflare public HTTPS
  → Cloudflare Tunnel connector on Ubuntu
  → nginx Proxy Manager
  → TopReading staging, port 3100
      → Google-backed application session and membership checks
      → PostgreSQL on 127.0.0.1:55433
      → local uploads/exports
```

Production uses its own hostname, Access application, port 3000, checkout and SQLite database. The tunnel and reverse proxy are shared infrastructure.

Cloudflare Access and Cloudflare Tunnel are different components. Removing an Access application removes that authentication gate; it does not mean deleting the tunnel, DNS record, or HTTPS configuration.

## 3. Quick operational checks

Run these on the **Ubuntu server** as `sungmin-kwon` unless stated otherwise.

### 3.1 Application and container status

```bash
systemctl is-active topreading-staging.service
systemctl is-enabled topreading-staging.service

sudo docker inspect \
  --format '{{.Name}}: status={{.State.Status}} restart={{.HostConfig.RestartPolicy.Name}}' \
  cloudflare-tunnel nginx-proxy-manager topreading-staging-postgres
```

Expected: the application is `active`, its unit is enabled, and the three containers are `running`. The recorded container restart policy is `unless-stopped`.

`restarting` means a container is repeatedly exiting; it is not healthy simply because Docker is trying to start it again.

### 3.2 Origin and public authentication checks

```bash
cd /home/sungmin-kwon/topreading-staging
python3 scripts/check-staging-google-access.py
python3 scripts/check-staging-google-access.py --public
```

Expected completion lines:

```text
ORIGIN GOOGLE ACCESS CHECK PASSED
PUBLIC GOOGLE ACCESS CHECK PASSED
```

The origin check connects to `127.0.0.1:3100`. The public check connects to the fixed staging HTTPS hostname. Neither needs credentials or a signed-in browser session.

The checker verifies:

- The Google provider is available and uses the staging HTTPS callback.
- TopReading's Google sign-in page is reachable.
- Anonymous navigation to `/` and `/admin` redirects to the application login page.
- Anonymous library, user, source/chapter and export API requests return denial responses.
- Administrative APIs reject anonymous requests.
- Spoofed Cloudflare/email headers and fake application sessions do not grant book access.

It uses nonexistent fixture resource IDs for anonymous resource probes. It does not create books, generate content, sign in to Google, or validate an invited member's actual download. It is a deployment smoke check, not a complete authorization audit.

### 3.3 Browser check

Use a fresh InPrivate/incognito window:

1. Open `https://top-staging.dubugimchi.com`.
2. Confirm TopReading's **Continue with Google** appears directly, without the Cloudflare team gate.
3. Sign in with an invited, active Google account.
4. Open a saved book and a guide; test a download when validating a release.
5. Sign out and confirm private library access requires login again.

Google may still show account selection or consent as part of the application login. That is not the removed Cloudflare gate.

### 3.4 Logs without the pager

```bash
sudo journalctl -u topreading-staging.service -n 80 --no-pager
sudo docker logs --tail 60 cloudflare-tunnel 2>&1
resolvectl --no-pager status
```

If a command opens a scrollable screen ending in `(END)`, press **q** to return to the prompt. Use `--no-pager` where supported.

Review logs before sharing them. Do not share tokens, credentials, session cookies, full OAuth callback URLs, or private library text. Avoid unrestricted `docker inspect` output: container environment variables can contain the tunnel token.

## 4. Using the application and administering members

### 4.1 Library and reading workspace

- The default landing page is **Library**, not the first database book.
- Library supports search, sorting and pinning, with a header book switcher.
- Each book has three main destinations: **Text**, **Study guides**, and **Export**.
- Text tools hold source import and chapter-boundary operations; the main Text view is for chapter navigation/editing.
- Desktop has one chapter navigator. Mobile uses a compact chapter selector.
- Light/dark and English/Korean controls remain visible outside the user dropdown.
- Book, chapter and destination are represented in the URL for navigation/reload behavior.
- `/prototype` remains a sample-data design reference. Its browser-local sample storage is not the server library or a backup.
- `/legacy` now redirects to the current Library on the modernized branch.

The subtraction passes removed repeated instructions, redundant headings, excessive nested panels, and secondary navigation clutter. Source passage and question content use a consistent reading column. Generation/version management, book details, Admin, account menus, and sign-in/out screens were aligned with the new UI.

Text's chapter navigator and editor use the available viewport height. The text area scrolls while its Save action stays visible. The final UI review included a regression check across eight desktop/mobile/landscape viewport sizes.

### 4.2 Editing and guide versions

Use the relevant **Save** action to persist an edit; **Cancel** discards that editor's draft. Failed saves should retain the draft and report an error. Do not infer that typing alone saved a change.

Guide versions can be selected, renamed, and managed separately. The rename dialog supports Escape, focus return, cancelled-draft reset and inline save errors. Generating a new version should not overwrite a saved version's manually edited content.

Chapter-boundary replacement/re-splitting is still destructive in the current live workflow. PostgreSQL revision snapshots do not make every delete or re-split reversible. Do not treat the prototype's Undo/checkpoint demonstration as a fully implemented server recovery mechanism.

### 4.3 Add a member

1. Sign in as an administrator.
2. Open the user menu → **Admin** → **Users**.
3. Choose **Add user**.
4. Enter the exact Google account email, display name if desired, and role.
5. Save.

Creating the active user and library membership is the current invitation mechanism. **No invitation email is sent.** Public self-registration is closed.

If the Google OAuth project is in Testing, the account may also need to be listed in the Google project's Test users. Passing Google's audience restriction and having TopReading membership are separate requirements.

### 4.4 Roles and account lifecycle

| Action / state | Behavior |
| --- | --- |
| Member | Can access resources in their library membership; cannot administer users/settings |
| Administrator | Can manage application users/settings; book access still requires membership |
| Disable | Reversible; revokes sessions and denies access on subsequent protected requests |
| Re-enable | Restores eligibility; the user may need to sign in again |
| Delete | Allowed for a disabled account; permanently removes the account, linked Google account, memberships and sessions |
| Delete shared books through user deletion | Does not happen; shared books/guides remain |
| Retained job history after user deletion | Requester reference is cleared rather than deleting shared history |
| Re-add a deleted email | Creates a new account identity |

Administrators appear before members, with email ordering within each group. The Notes editor was removed; existing stored notes are retained rather than silently erased.

The application prevents self-deletion/self-demotion/self-disabling and protects the last active administrator, including concurrent changes. Use another active administrator account when testing account disablement.

The admin role is currently application-wide. Full multi-library selection and separate per-library administration are not complete.

### 4.5 Test invitation and disabled-session enforcement

Use a separate browser session and a non-administrator test account:

1. A Google account permitted by Google's OAuth audience but absent from TopReading must be denied after OAuth.
2. Add it as an active member; it should then load the library.
3. Keep that member signed in, disable it from an administrator session, and reload the member's library.
4. Protected resources must be denied. The observed UI message was “Could not load the book library.” A friendlier dedicated disabled-account screen is not established by that message.

These tests passed on Ubuntu before the staging Access gate was removed. Fresh Google sign-in/out and anonymous public denial passed after removal. In the final operational-check response the operator reported that everything worked normally and supplied post-reboot terminal checks; individual post-removal account-test outcomes were not itemized. Preserve that evidence distinction rather than inferring individual test results from the terminal probes.

## 5. Configuration and generation settings

### 5.1 What belongs where

| Configuration | Location |
| --- | --- |
| Google OAuth secret, session secret, OpenAI API key | Private staging `.env.local` |
| Database connection and schema | Private staging `.env.local` |
| Public application/authentication URLs, auth mode | Staging `.env.local` |
| Upload/export paths and Python executable | Staging `.env.local` |
| Generation model | Admin → Generation settings → PostgreSQL `app_settings` |
| Maximum chapters/items per generation run | Admin → Generation settings → PostgreSQL `app_settings` |
| MCQ review/repair call budget | `MCQ_REVIEW_MAX_CALLS` in server configuration |
| Container restart/network configuration | Docker/Compose or staging setup configuration |
| Host DNS route | systemd-networkd drop-in plus Tailscale DNS configuration |

`.env.local` remains necessary. It holds deployment settings and secrets. It is not intended as a second competing editor for the model and the two Admin-editable generation limits.

### 5.2 Current staging authentication values

The following are non-secret identifiers. This is a reference, **not a replacement `.env.local` file**:

```dotenv
AUTH_MODE=google
APP_BASE_URL=https://top-staging.dubugimchi.com
AUTH_URL=https://top-staging.dubugimchi.com
DATABASE_SCHEMA=topreading_staging
ALLOW_INSECURE_LOCAL_AUTH=false
```

The file also needs its existing private `DATABASE_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, paths and other required settings. Preserve those values. Do not overwrite the file with the small example above.

The public service must not use the local development authentication bypass. Changing DNS does not require changing `AUTH_MODE`.

### 5.3 Generation model and limits

The model dropdown offers:

- `gpt-6-luna` as the requested default.
- `gpt-5-nano` as the requested alternative.

An existing explicit custom model can be represented as the current choice. This manual does not certify current provider availability, account entitlement, or pricing; no paid model request was made to establish those facts during the implementation checks.

The application reads `OPENAI_MODEL`, `MAX_GENERATION_CHAPTERS`, and `MAX_GENERATION_ITEMS` from PostgreSQL settings, with built-in defaults when absent. Their old `.env.local` entries no longer control runtime behavior.

Migration `0004_generation_settings.sql`:

- Seeds missing settings: model `gpt-6-luna`, maximum chapters `80`, maximum items `2500`.
- Changes an explicitly stored old `gpt-5-mini` value to `gpt-6-luna` once.
- Preserves explicit alternatives/custom models and existing limits.

The staging migration helper removes the three obsolete environment entries while preserving unrelated configuration. Change the model through Admin and Save; do not repeatedly edit a retired environment setting.

### 5.4 Private files and safe inspection

Protect `.env.local`, `backups/ubuntu-staging/state.json`, and `backups/ubuntu-staging/postgres.env`. The setup helpers create private credential files with restrictive permissions. Keep them out of Git and chat.

Safe routine inspection includes:

```bash
cd /home/sungmin-kwon/topreading-staging
stat -c '%a %n' .env.local backups/ubuntu-staging/state.json
systemctl show topreading-staging.service \
  --property=User --property=WorkingDirectory --property=EnvironmentFiles
```

Do not request `systemctl show --property=Environment`, dump the process environment, or print the database connection string merely to check health. Use the supplied health checkers.

## 6. Google login and Cloudflare configuration

### 6.1 Google OAuth client

The staging Google OAuth client is a **Web application** client. Its exact authorized redirect URI is:

```text
https://top-staging.dubugimchi.com/api/auth/callback/google
```

Google Console setup used Google Auth Platform → Branding / Audience / Clients, an External audience with Testing users for the initial rollout, and identity scopes `openid`, `email`, `profile`. Creating this client did not host the application on GCP.

Typical failures:

| Symptom | Check |
| --- | --- |
| `redirect_uri_mismatch` | Exact HTTPS callback in Google Console and staging `AUTH_URL` / `APP_BASE_URL` |
| `invalid_client` | Client type, ID and secret entered locally |
| Google refuses an account before returning to TopReading | OAuth Testing audience / Google project settings |
| TopReading says to use an invited account | Exact verified Google email, active user status, library membership |
| Existing user loses access after disablement | Expected session/account enforcement |

To configure or repair the prepared staging service's Google settings interactively:

```bash
cd /home/sungmin-kwon/topreading-staging
python3 scripts/start-ubuntu-staging.py --google
```

This helper can install/update/restart the staging unit. It prompts only for missing OAuth credentials, reuses existing nonempty ones, and checks the runtime database and auth endpoints. An incorrect existing value must be corrected privately; rerunning the helper does not necessarily ask for it again. It does not perform a general rebuild of changed application source.

The helper's older “keep the existing Access policy” message describes the initial dual-gate rollout. Staging's Access application has now been removed; do not recreate it merely because that historical message appears.

### 6.2 Sessions and resource protection

The modernized application uses opaque sessions whose token hashes are stored in PostgreSQL, checks expiration and account status, and enforces library access on protected resources/downloads. Google account linking requires a verified email matching an invited active account with membership. Provider access/refresh tokens are not stored by this implementation.

Cloudflare email headers alone do not authenticate a user. In the alternative Cloudflare identity mode, signed JWT issuer, audience, expiry and signature are validated. The legacy shared-secret/header-trust mode and automatic account creation were removed from the modernized branch.

These statements describe the PostgreSQL/authentication branch. They do not establish that the old production checkout has received all the same backend changes.

### 6.3 Cloudflare identifiers and current gate state

| Identifier | Value / status |
| --- | --- |
| Zero Trust team domain | `supervenience.cloudflareaccess.com` |
| Production Access application | `topreading`, destination `top.dubugimchi.com`, Family Access policy retained |
| Production Access AUD | `d1c8751b006e02f5d135ccdb4402eaef1bca2f4897e592ad9aa3015232f9457a` |
| Former staging Access AUD | `7615ba6c2c501dc8c6aee94fe09ca10d6fac8b4776dda968df9e5683cb986788` — historical; application deleted |
| Staging tunnel “Protect with Access” | Confirmed off |
| Shared Cloudflare Tunnel | Retained |
| DNS, proxy route and public HTTPS | Retained |

A hostname is not an Access team domain or AUD. The AUD identifies one Access application. Recreating a deleted Access application produces a new AUD; the former staging value must not be assumed reusable.

Do not run `start-ubuntu-staging.py --aud ...` as a normal update. That option deliberately switches the application back to Cloudflare identity mode. With the Access application removed, switching modes without rebuilding the complete identity boundary can lock users out.

### 6.4 Route details to preserve

The staging nginx Proxy Manager host forwards to the Ubuntu web application on port `3100`. The Cloudflare published route points to the existing internal NPM endpoint and uses the staging hostname where a Host Header override is required.

The exact currently working tunnel service URL should be read from the dashboard when needed, not guessed from this document. In particular, `127.0.0.1` inside a Docker container refers to that container, not automatically to the Ubuntu host or NPM container.

Cloudflare changes made during this work concerned staging's Access application only. Keep the production Access application, shared Family Access policy and other hostname routes unless a separate migration task explicitly changes them.

## 7. Updating the staging application

### 7.1 Before an update

1. Confirm the checkout and branch. Do not run this in the production directory.
2. Check for uncommitted changes; preserve and reconcile them rather than using a hard reset.
3. Allow active extraction/generation/export work to finish. Generation now runs in a separate worker; wait for idle before maintenance to avoid interrupting a paid request.
4. Record the current deployed code reference and preserve a database/files backup before a schema or significant data change. The remaining PostgreSQL backup work is described in section 9.
5. Review whether the update changes dependencies, migrations, or configuration.

```bash
cd /home/sungmin-kwon/topreading-staging
pwd
git branch --show-current
git rev-parse --short HEAD
git status --short
node --version
```

Expected branch: `modernization/postgres-auth`; Node major version: `22`.

### 7.2 Standard staging update

Run as the normal checkout owner, not through `sudo npm`:

```bash
(
  set -e
  cd /home/sungmin-kwon/topreading-staging
  test "$(git branch --show-current)" = modernization/postgres-auth
  git pull --ff-only
  if systemctl is-active --quiet topreading-staging-worker.service; then
    sudo systemctl stop topreading-staging-worker.service
  fi
  sudo systemctl stop topreading-staging.service
  npm ci
  python3 scripts/migrate-ubuntu-staging.py
  NODE_OPTIONS=--max-old-space-size=3072 nice -n 10 npm run build
  python3 scripts/start-generation-worker.py
  sudo systemctl start topreading-staging.service
  systemctl is-active topreading-staging.service topreading-staging-worker.service
  python3 scripts/check-staging-google-access.py
  python3 scripts/check-staging-google-access.py --public
)
```

`npm ci` refreshes JavaScript dependencies from the lockfile. The previous UI-only update snippets sometimes omitted it because dependencies had not changed; include it for a general update. If Python requirements changed, install them into the existing `.topreading` environment according to the release instructions while staging is stopped.

The service is stopped while dependencies and `.next` are replaced. `set -e` prevents later steps from running after a failed command. If migration/build fails after the stop, staging intentionally remains stopped for diagnosis. Production's application is not stopped by this procedure.

A DNS/tunnel failure in the final public check does not necessarily mean the newly built app failed. Compare the origin check before changing application code or authentication.

### 7.3 What the migration helper does

`migrate-ubuntu-staging.py`:

- Requires the prepared staging checkout, expected branch, normal owner and Node 22.
- Checks that the connection matches the local staging database/schema/app role.
- Uses the private setup owner's credentials only for the migration child process.
- Applies outstanding checksummed SQL migrations under a lock.
- Checks the restricted runtime role afterward.
- Removes retired model/limit keys from staging `.env.local` after success.

It does not reimport the original SQLite snapshot, erase the library, or restart services. Do not use the initial setup/import helper as a substitute for this routine update path.

### 7.4 Git authentication and deployment are separate

A GitHub account password cannot authenticate an HTTPS Git push. Use GitHub CLI authentication, a properly scoped token, or an SSH key configured locally. Never paste a token into chat or embed it in the remote URL.

For an intentionally reviewed source change:

```bash
git status --short
git diff
# Add only the intended source/document files; exclude data and secrets.
git add path/to/intended-file
git commit -m "Describe the change"
git push origin modernization/postgres-auth
```

Replace the example path with the actual reviewed file. Prefer making changes in a development checkout and pulling them into staging.

“Your branch is behind” means upstream commits are available. It does not indicate database corruption, but the running service may be old. Use `git pull --ff-only` for the intended branch, then the build/restart procedure for application changes. A failed fast-forward requires inspecting branch divergence, not forcing a reset.

Documentation-only and standalone checker updates do not themselves require rebuilding or restarting Next.js.

### 7.5 Deployment records and rollback

Record the commit, backup identifier, migration result, build result and health checks after every deployment. `git rev-parse HEAD` shows checked-out source, not independently the running build version. The initial setup state's build marker is also not a reliable deployment history after manual builds.

Code rollback is not automatically database rollback. Do not check out old code against a newer schema without confirming compatibility. Do not edit already-applied migration files or manually delete migration-history rows to force a rerun.

If a change is incompatible, prepare a coordinated restore of a matching database, files, code and configuration in isolation before touching the live deployment. Production cutover has not happened, so returning users to the existing production URL remains possible, but staging-only edits will not magically appear there.

## 8. PostgreSQL migrations and data preservation

### 8.1 Implemented database changes

- PostgreSQL runtime data access with an explicitly selected schema.
- Separate migration owner and restricted application role.
- Users, libraries and membership checks developed together with authentication.
- Database sessions and linked Google identities.
- Application settings stored in PostgreSQL.
- Transactional generated-item append/replacement.
- Immutable chapter revisions on text/title changes, with generation linked to the revision used at request time.
- Preservation of migrated books, text, guides, summaries, source metadata and active version selections.

Guide generation now uses the durable PostgreSQL queue and separate worker described in section 9.6. Extraction and export remain request-bound. The worker release is locally verified; Ubuntu installation and acceptance are still pending.

### 8.2 Migration files

| File | Purpose |
| --- | --- |
| `0001_postgres.sql` | Bootstrap schema used by the controlled import |
| `0002_runtime_auth.sql` | Runtime/authentication/settings/revision behavior |
| `0003_item_delete_cascades.sql` | Item deletion cascade behavior |
| `0004_generation_settings.sql` | Seed/normalize model and generation settings |

`database/migrations/*.sql` is authoritative. The ORM mapping does not represent every database constraint/trigger. Do not run `drizzle-kit push` as a replacement for the controlled migrations.

The migration runner checks applied file hashes, serializes migration work and rolls back on failure. Bootstrap import history and later application migrations are tracked separately.

### 8.3 Read-only PostgreSQL checks

These use the local container connection and do not print credentials:

```bash
sudo docker exec topreading-staging-postgres \
  pg_isready -U staging_owner -d topreading_staging

sudo docker exec topreading-staging-postgres \
  psql -U staging_owner -d topreading_staging -v ON_ERROR_STOP=1 \
  -c 'SELECT count(*) AS books FROM topreading_staging.books;'

sudo docker exec topreading-staging-postgres \
  psql -U staging_owner -d topreading_staging -v ON_ERROR_STOP=1 \
  -c 'SELECT version, applied_at FROM topreading_staging.application_migrations ORDER BY version;'
```

The prepared official PostgreSQL container normally permits this local Unix-socket administrative access. If local authentication has been hardened since setup, use the approved private credential mechanism rather than weakening authentication.

The web service uses `topreading_app`, not the owner role used by these administrative checks.

### 8.4 Data limitations to remember

- Legacy item provenance is not fully known; migration does not invent source-revision certainty.
- Explicit chapter/book deletion removes corresponding revision history.
- Re-splitting is still destructive and needs the later import-workflow overhaul.
- A successful database import is not evidence that every chapter boundary is pedagogically correct.
- The historical corpus contained one chapter-number gap; it existed in the source snapshot. Do not automatically renumber it as a “migration repair.”
- Whole-book exports should use the UI's selected guide version. The baseline audit identified an omitted-version API edge case; the current route still distinguishes absent/null/`latest` semantics. Do not assume direct API calls without a version reproduce the UI's successful export path.

## 9. Backups, recovery, and rollback

### 9.1 Verified historical SQLite baseline

The operator stopped the production application for the baseline capture, created a backup, restarted the service, verified it and copied the transfer files off the Ubuntu PC.

Recorded baseline directory:

```text
/home/sungmin-kwon/topreading-study-guide/backups/migration-baseline-xuWh81Xw/topreading-backup-20261023_113708
```

Transfer files included `topreading-baseline.part-00`, `topreading-baseline.part-01`, and `SHA256SUMS`. An off-server Windows copy was made under:

```text
C:\Users\super\topreading-backup
```

The uploaded parts and reconstructed archive passed SHA-256 verification. The isolated restore preserved the snapshot and exercised the populated application.

| Historical table | Baseline rows |
| --- | ---: |
| books | 8 |
| chapters | 174 |
| chapter_summaries | 156 |
| generation_runs | 7 |
| study_sets | 7 |
| multiple_choice_questions | 2,422 |
| short_answer_questions | 1,157 |
| vocabulary_items | 2,989 |
| parsed_documents | 8 |
| parsed_pages | 2,144 |
| source_files | 8 |
| users | 4 |

SQLite integrity was `ok`, declared foreign-key violations were zero, all 8 source files were verified, and no runs remained marked generating. The source corpus contained 7 PDFs and 1 TXT, plus 37 stored exports (36 PDFs and 1 DOCX).

These are baseline reconciliation numbers, not permanent expected counts after users edit the applications. This backup does not contain later staging changes or later production edits.

### 9.2 SQLite backup commands — production only

`npm run backup -- --include-exports` uses the SQLite backup API and copies files. Stop the intended production writer during a coordinated database/files snapshot. Run from the **SQLite production checkout**, preserve the reported new backup directory, and restart the service afterward using the production procedure.

To verify an existing SQLite snapshot from the staging checkout, without modifying it:

```bash
cd /home/sungmin-kwon/topreading-staging
python3 scripts/verify-baseline.py \
  --database /home/sungmin-kwon/topreading-study-guide/backups/migration-baseline-xuWh81Xw/topreading-backup-20261023_113708/topreading.sqlite \
  --uploads /home/sungmin-kwon/topreading-study-guide/backups/migration-baseline-xuWh81Xw/topreading-backup-20261023_113708/uploads
```

An optional `--report` path must be new; the verifier does not overwrite reports. Verification is read-only and does not replace a full application restore test.

Do not copy only a live SQLite `.db` file while ignoring its WAL and associated uploaded files.

### 9.3 PostgreSQL backup status

The staging backup and isolated restore-check helpers are implemented and locally rehearsed. They are manual commands; scheduling, retention and off-server encrypted copies remain operational work. `npm run backup` remains the legacy SQLite-only command. Use `python3 scripts/postgres-backup.py` for staging PostgreSQL.

The backup includes a custom-format dump, matching uploads/exports, table counts, source checksums, private environment/setup recovery files and a hash manifest. **It contains credentials: keep the entire folder private.** The helper briefly stops only staging writers, then restores their previous running state. Wait for generation to finish before using it.

### 9.4 Backup and isolated restore commands

```bash
cd /home/sungmin-kwon/topreading-staging
python3 scripts/postgres-backup.py
# Substitute the exact folder reported above.
python3 scripts/postgres-backup.py --verify /absolute/path/to/reported/backup-folder
```

The verifier uses a disposable PostgreSQL container with no network or published port. It reconciles table counts/source files and checks restricted-role grants, then removes the container. It does not restore over staging, execute restored jobs or test real Google/model requests. Keep a verified encrypted off-server copy. A full isolated application restore remains required before VPS cutover.

### 9.5 Configuration recovery

The database volume and `.env.local` are not interchangeable. Private setup state records owner/application credentials and instance information used by the helpers. Preserve that state securely with recovery records; losing it while retaining the database volume can prevent the helpers from reconnecting.

Do not regenerate or replace passwords/session secrets casually to solve an unrelated DNS problem. Plan credential recovery/rotation explicitly and account for its effect on access and sessions.

### 9.6 Backup and generation-worker release: deployment and operations

Implemented on `modernization/postgres-auth`, 2026-10-26. Local tests passed;
Ubuntu deployment and a real browser generation remain operator acceptance steps.
The production SQLite service and its Cloudflare routing are unchanged.

#### What changes

- `POST .../generation-runs/:id/execute` authorizes the user/book, persists a job,
  and returns HTTP 202. Repeated submission of the same run cannot duplicate it.
- One separate Node worker consumes PostgreSQL jobs. A database session lock
  permits one worker per schema; a unique index permits one active job per book.
- The existing progress panel/processing log reads persisted run state. Closing
  the browser or restarting only the web service does not stop generation.
- Each completed chapter's items, source revision reference, raw output, usage
  and progress are saved in a transaction. Existing versions are not overwritten.
- Cancellation is a persisted request. Queued work is skipped; an active chapter
  finishes before cancellation takes effect. Membership and disabled-account
  status are rechecked before work and between chapters.
- The worker starts automatically under systemd, separately from the web app.
  It drains its current run on SIGTERM; systemd allows up to 15 minutes before
  terminating it. Wait for generation to finish before maintenance.
- On a worker crash, queued jobs remain queued. An interrupted running job becomes
  failed on worker restart; completed chapters remain available. **The worker
  does not automatically resume or replay an interrupted paid request.** A lost
  response can still incur a charge. Create a new version deliberately to retry.
  The main model request has a ten-minute timeout and no automatic POST retries;
  MCQ quality calls retain their bounded budgets and one-minute timeouts.
- The old direct chapter-generation endpoint now returns HTTP 410 after its
  authorization checks. Use Generate a guide, including for a single chapter.
  Extraction and export still run through the web app; they are future work.
- Clients can rename runs but cannot forge worker status, progress or logs.

#### First deployment on Ubuntu

Finish/cancel any active generation first. No new environment variables or Google
credentials are needed. Commands apply only to the separate staging checkout.

First fetch the new helper and take a pre-migration backup:

```bash
cd /home/sungmin-kwon/topreading-staging
git pull --ff-only
python3 scripts/postgres-backup.py
```

The helper briefly stops staging services and restores their previous running
state. It refuses a known active job. Copy the reported absolute backup folder
into this command:

```bash
python3 scripts/postgres-backup.py --verify /absolute/path/to/reported/backup-folder
```

Expect `RESTORE CHECK PASSED`. Then install the release:

```bash
(
  set -e
  cd /home/sungmin-kwon/topreading-staging
  test "$(git branch --show-current)" = modernization/postgres-auth
  # This condition also works before the worker has been installed.
  if systemctl is-active --quiet topreading-staging-worker.service; then
    sudo systemctl stop topreading-staging-worker.service
  fi
  sudo systemctl stop topreading-staging.service
  npm ci
  python3 scripts/migrate-ubuntu-staging.py
  NODE_OPTIONS=--max-old-space-size=3072 nice -n 10 npm run build
  python3 scripts/start-generation-worker.py
  sudo systemctl start topreading-staging.service
  systemctl is-active topreading-staging.service topreading-staging-worker.service
  python3 scripts/check-staging-google-access.py
  python3 scripts/check-staging-google-access.py --public
)
```

If migration/build fails, diagnose it while staging remains stopped; production
is not stopped. Do not rebuild or replace dependencies underneath a running
worker. `npm run build` now builds both Next.js and `dist/generation-worker.mjs`.
The worker uses the same private `.env.local`, restricted database role, API key,
and Admin generation settings. Keep the worker stopped during schema migrations.

#### Acceptance checks

```bash
systemctl show topreading-staging-worker.service \
  --property=ActiveState --property=UnitFileState
journalctl -u topreading-staging-worker.service --since '10 minutes ago' --no-pager
```

Expect active/enabled and `Generation worker ready.` The journal contains job IDs
and lifecycle messages; chapter progress stays in the application's database.

Using an invited account, generate a small guide (normal model charges apply):

1. Confirm the request returns promptly and progress appears.
2. Close/reopen the browser; progress should resume from the database.
3. While the worker runs, restart **only** `topreading-staging.service`. The worker
   should keep running and finish the guide. Do not restart Docker, the database,
   tunnel or worker for this test.
4. Verify generated items, editing and an export. Separately test cancellation.
5. After the queue is idle, take/verify a fresh backup and copy it off the PC.

#### Backup contents and guarantees

`python3 scripts/postgres-backup.py` creates a private `backups/postgres-*` folder:

- `database.dump`: PostgreSQL custom-format logical dump, without ownership/ACLs.
- `uploads/` and `exports/`: matching files captured while staging writers stop.
- `private-recovery/env.local` and `private-recovery/state.json`: **credentials**.
- `manifest.json`: timestamp, checked-out source commit (not an independent
  running-build attestation), every table count, source verification count and
  SHA-256 hashes of all other files, including private recovery files.

An interrupted backup without a manifest is incomplete. Source paths, sizes and
checksums are checked against database references. Symlinks are refused. The
helper validates the checkout, database address and container instance label.
Only staging services that were active on entry are restarted, including after
an error. A backup briefly makes staging unavailable. The production web service,
Cloudflare tunnel and nginx proxy manager remain running.

`--verify` verifies hashes, restores into a uniquely named disposable PostgreSQL
17 container with **no published ports and no network**, reconciles all table
counts and source files, and recreates/checks restricted application-role grants.
The temporary container and its anonymous volume are removed afterward, including
on ordinary failure. A host crash/SIGKILL may require removal of the specific
`topreading-restore-check-*` container left by that attempt. Never remove the
staging database volume. Restored jobs are not executed and no OAuth/API requests
are made. The verifier is not a live restore command and does not redirect the app.

This proves database/file restoration, not a complete VPS or browser rehearsal.
Before disaster recovery or cutover: provision an isolated database, restore the
dump, recreate owner/runtime credentials and grants, restore files to intended
paths, configure the correct origin/OAuth callback, invalidate old sessions as
appropriate, reconcile data, and test the app before switching traffic. Do not
start a worker blindly on a restored queue: review outstanding jobs first to
avoid replaying work already completed since the backup.

Backups are currently **manual**. There is no scheduled timer, automatic pruning,
encryption-at-rest feature or off-server upload in this helper. Copy verified
backups to protected off-server storage; do not attach the backup or private files
to chat, commit them to Git, or share a public download link. Use encrypted storage
for the off-server copy. Keep the existing SQLite baseline separately. Establish
backup frequency/retention and monitor successful restores before VPS cutover.

#### Troubleshooting

- Stuck at queued: check worker active/enabled and its journal; the web service
  intentionally does not execute a fallback paid request.
- Worker reports another owner: another process owns the same schema's advisory
  lock. Stop the unintended worker, not the database. Do not run `npm run worker`
  alongside the systemd worker for the same schema.
- Failed after interruption: review partial results. Retry deliberately in a new
  version; unknown usage from a lost provider response may not be in saved totals.
- Missing `generation_run_id`/`cancel_requested`: apply migrations before starting
  the new web/worker release.
- Backup says a job is running: wait for completion/cancellation. Do not force a
  backup by editing job status or killing a paid model request.
- Restore check fails: keep the backup for diagnosis, but do not call it verified.
  The live database was not replaced. Correct the cause and make a new backup.

#### Local validation evidence

- Production build and TypeScript checks passed.
- Worker tests use a real disposable PostgreSQL schema and a build-time fake
  model provider. They cover duplicate delivery, per-book exclusion, singleton
  ownership, persisted results, cancellation, crash recovery, no automatic replay,
  revoked access, HTTP authorization and generation surviving web shutdown.
- A backup of the local restored staging corpus was restored into a disposable
  container: 21 tables reconciled, eight source files checked, role grants checked.
  systemd stop/start behavior was simulated locally; Ubuntu service acceptance is
  still required. Offline tests cover corruption, symlinks, unsafe paths and the
  production-checkout guard. No paid model requests were used in local testing.

## 10. DNS configuration and the reboot incident

### 10.1 The original Tailscale split-DNS problem

Tailscale reported:

```text
Split DNS Routes:
  dubugimchi.com → 100.101.76.39
```

That target is the Ubuntu server itself. DNS queries through `tailscale0` timed out. Explicit queries through Ethernet resolved staging to Cloudflare addresses immediately.

This proved a domain-specific DNS routing/resolver problem. It did not prove that the web app, Google client, or Cloudflare Access removal was broken. A browser could work while the Ubuntu checker failed because it used different DNS resolution or cached results.

The immediate workaround was a more-specific route for `top-staging.dubugimchi.com` on Ethernet. More-specific DNS suffix routes take precedence over the broad `dubugimchi.com` Tailscale route.

A DNS resolver address must identify a working DNS service. Pointing a split-DNS rule at a machine merely because it hosts a website does not make that machine a DNS resolver. The original purpose of this rule remains to be established before changing it for the whole tailnet.

### 10.2 The second problem: incomplete persistence instructions

The first persistent drop-in contained only:

```ini
[Network]
Domains=~top-staging.dubugimchi.com
```

That was incomplete. A route-only domain can cause systemd-resolved to stop treating that link as a default DNS route for unrelated names unless explicitly configured otherwise.

After reboot:

- Staging's public hostname could resolve, but the public checker received Cloudflare HTTP 530.
- The local application/authentication check passed.
- PostgreSQL and NPM were running.
- `cloudflare-tunnel` was in a restart loop with policy `unless-stopped`.
- Cloudflared reported failure resolving `region1.v2.argotunnel.com` through Docker DNS `127.0.0.11`.
- The container exited with code 1; `oomKilled=false`.
- The host's forced Ethernet lookup for that endpoint returned “No appropriate name servers or networks for name found.”

The missing `DNSDefaultRoute=yes` in the supplied instructions caused the second failure. The fix restored Ethernet's default DNS role; restarting the tunnel then restored its connection. No Docker Compose DNS override, OAuth change, or Access reconfiguration was required.

### 10.3 Correct persistent configuration

File:

```text
/etc/systemd/network/10-netplan-enp2s0.network.d/50-topreading-staging-dns.conf
```

Contents:

```ini
[Network]
Domains=~top-staging.dubugimchi.com
DNSDefaultRoute=yes
```

For this recorded host/interface, the corrective commands are:

```bash
sudo mkdir -p /etc/systemd/network/10-netplan-enp2s0.network.d

sudo tee /etc/systemd/network/10-netplan-enp2s0.network.d/50-topreading-staging-dns.conf >/dev/null <<'DNSCONF'
[Network]
Domains=~top-staging.dubugimchi.com
DNSDefaultRoute=yes
DNSCONF

sudo resolvectl domain enp2s0 '~top-staging.dubugimchi.com'
sudo resolvectl default-route enp2s0 yes
sudo resolvectl flush-caches
```

The file supplies persistent settings for systemd-networkd. The `resolvectl` commands apply the current runtime settings without requiring a full networking restart. The domain command reflects the known interface configuration at the time; inspect current domains before reusing it on a changed host because it sets that interface's runtime domain list.

Do not edit the generated file under `/run/systemd/network` as the persistent fix. Netplan can regenerate it. If the Netplan interface identifier or generated `.network` filename changes in the future, review the matching drop-in name.

### 10.4 Verify host DNS and tunnel recovery

```bash
resolvectl --no-pager status enp2s0
resolvectl query top-staging.dubugimchi.com
resolvectl query region1.v2.argotunnel.com
```

Expected: Ethernet has DNS servers, the staging route and default DNS routing enabled; both names resolve. Addresses can change, so do not pin the particular Cloudflare IPs copied from an old diagnostic result.

If the tunnel is still crash-looping after DNS is repaired:

```bash
sudo docker restart cloudflare-tunnel
```

Allow time for it to register a connection, then run the public checker. Restarting this shared connector affects all hostnames carried by it.

**Latest reported outcome:** the Cloudflare endpoint resolved, the tunnel was restarted, and `PUBLIC GOOGLE ACCESS CHECK PASSED` was printed.

### 10.5 Verified reboot recovery and repeatable checks

The operator subsequently rebooted after the final correction and supplied passing results: Docker/staging enabled and active, Ethernet `+DefaultRoute` with `~top-staging.dubugimchi.com`, successful staging/Cloudflare-endpoint resolution, all three containers running with `unless-stopped`, and both access checkers passing. The operator also reported that everything appeared to work normally. This closes the recorded DNS persistence/startup incident.

For future planned reboot checks, use:

```bash
resolvectl --no-pager status enp2s0
resolvectl query region1.v2.argotunnel.com
systemctl is-active topreading-staging.service
sudo docker inspect \
  --format '{{.Name}}: status={{.State.Status}} restart={{.HostConfig.RestartPolicy.Name}}' \
  cloudflare-tunnel nginx-proxy-manager topreading-staging-postgres
cd /home/sungmin-kwon/topreading-staging
python3 scripts/check-staging-google-access.py
python3 scripts/check-staging-google-access.py --public
```

Also check the production hostname and other homelab services because the host/tunnel are shared. Record the result; do not mark reboot persistence verified merely because the file exists.

### 10.6 Longer-term DNS cleanup

The exception fixes staging and preserves general Ethernet DNS. Other names under the broad Tailscale `dubugimchi.com` route may still fail through that route.

Before removing or narrowing the tailnet-wide rule, identify the intended DNS server and any internal service names depending on it. Options are to repair the intended resolver or replace an obsolete broad rule with deliberate, narrower rules. Avoid globally disabling Tailscale DNS as the first response; remote access and private name resolution may depend on it.

## 11. Troubleshooting by symptom

### 11.1 Start with the failing layer

```text
Does Ubuntu resolve the hostname?
  No → inspect DNS routing/resolvers.
  Yes → does the local origin check pass?
    No → inspect app service, database and authentication configuration.
    Yes → does the public check pass?
      No → inspect Cloudflare tunnel, NPM route, HTTPS and any remaining Access coverage.
      Yes → investigate the particular browser/account/resource workflow.
```

Do not change authentication modes to fix a DNS or transport failure.

### 11.2 Common symptoms

| Symptom | Meaning / first action |
| --- | --- |
| Python reports DNS lookup failed; curl shows HTTP 000 / resolving timeout | No HTTP response reached the checker. Inspect host DNS and split routes. |
| `resolvectl` says no appropriate name servers/networks | Inspect DNS servers, route-only domains and DefaultRoute on the selected link. |
| Browser works while Ubuntu cannot resolve | Compare resolvers/routing; browser success does not establish host DNS health. |
| Cloudflare HTTP 530 | Request reached Cloudflare. Inspect the four-digit page error if available and the tunnel logs; do not assume an app 401/403. |
| Tunnel status `restarting` | Repeated process failure. Read startup error and exit/OOM status. |
| Tunnel DNS error names `127.0.0.11` | That is Docker's internal DNS resolver. Test host DNS before changing container DNS. |
| Origin passes, public receives an Access login/HTML response | Check remaining/wildcard Access coverage and the tunnel's Protect with Access setting. |
| Origin fails or service is inactive | Inspect staging systemd logs and PostgreSQL readiness. |
| HTTP 502 / proxy failure | Check the tunnel/NPM origin target, host address, web port and process reachability. |
| TLS certificate verification error | Inspect certificate, CA trust and system clock. Do not use disabled verification as the fix. |
| Model changes in `.env.local` do nothing | Model/limits are stored in Admin/PostgreSQL. |
| Update was pulled but UI is unchanged | Check whether dependencies/build/restart were completed; Git pull is not deployment. |
| Migration checksum mismatch | Applied SQL was modified or source history differs. Investigate; do not erase history to suppress it. |

### 11.3 Narrow, non-secret diagnostic commands

Host routing:

```bash
networkctl --no-pager status enp2s0
resolvectl --no-pager status enp2s0
resolvectl --no-pager status tailscale0
tailscale dns status
```

Compare DNS paths:

```bash
timeout 20s resolvectl --interface=enp2s0 query top-staging.dubugimchi.com
timeout 20s resolvectl --interface=tailscale0 query top-staging.dubugimchi.com
```

A timeout may produce no final output; the shell still returns after 20 seconds. The `tailscale dns status` output previously included an “Access denied” message for its system-configuration dump; its displayed split-DNS routes were nevertheless usable diagnostic information.

Independent HTTPS request without printing response headers/body:

```bash
curl --silent --show-error --output /dev/null \
  --connect-timeout 10 --max-time 20 \
  --write-out 'HTTP %{http_code}\n' \
  https://top-staging.dubugimchi.com/api/auth/providers
```

Tunnel failure and deployment metadata:

```bash
sudo docker logs --tail 60 cloudflare-tunnel 2>&1

sudo docker inspect \
  --format 'exit={{.State.ExitCode}} oomKilled={{.State.OOMKilled}} restarts={{.RestartCount}}' \
  cloudflare-tunnel

sudo docker inspect --format \
'DNS={{json .HostConfig.Dns}}
Network={{.HostConfig.NetworkMode}}
Compose service={{index .Config.Labels "com.docker.compose.service"}}
Compose files={{index .Config.Labels "com.docker.compose.project.config_files"}}' \
cloudflare-tunnel
```

Avoid posting the entire Compose file or running `docker compose config` into a shared transcript: interpolation can reveal the tunnel token or other secrets.

## 12. MCQ quality workflow

### 12.1 Why shuffling alone was insufficient

The historical audit of 2,422 saved MCQs found:

| Metric | Result |
| --- | ---: |
| Correct position A / B / C / D | 609 / 605 / 605 / 603 |
| Longest-option guessing strategy, fractional credit for ties | 72.76% |
| Random guessing baseline | 25% |
| Mean correct-answer / mean-distractor word-count ratio per question | 1.47 |
| Distinct flagged questions | 373 |

Positions were already balanced, but answer length remained a strong giveaway. These are descriptive measurements on the baseline corpus, not proof that every flagged answer is wrong or every unflagged item is sound.

### 12.2 Implemented workflow for newly generated MCQs

1. Generate one passage-supported answer with plausible distractors, parallel grammar and comparable detail.
2. Check malformed/duplicate choices, length imbalance, very short distractors and letter-dependent explanations.
3. Blind-review flagged items and a sample of unflagged items within the call budget. The reviewer receives passage/question/choices with a temporary permutation, without the intended key or explanation.
4. Check disagreement, ambiguity and passage evidence. A matching reviewer answer is not automatic proof of correctness.
5. Allow at most two repairs per question, each followed by a fresh blind review.
6. Mark unresolved cases `needs_review`; passing automated checks leaves an item as a draft rather than human-approved.
7. Shuffle before saving while preserving the answer mapping and protecting unresolved letter-dependent explanations.
8. Let a teacher review and explicitly confirm the answer/distractors against the passage.

`MCQ_REVIEW_MAX_CALLS` defaults to 12 per chapter and is bounded to 0–40. Review/repair adds generation time and token usage. Mocked tests verified orchestration and safeguards; a representative real generation sample still needs teacher evaluation to establish practical quality improvement.

Existing questions were audited, not automatically rewritten in bulk.

### 12.3 Read-only historical audit

The current audit script targets SQLite snapshots, not the live PostgreSQL database:

```bash
cd /home/sungmin-kwon/topreading-staging
python3 scripts/audit-mcq.py \
  --database /home/sungmin-kwon/topreading-study-guide/backups/migration-baseline-xuWh81Xw/topreading-backup-20261023_113708/topreading.sqlite \
  --report /tmp/topreading-mcq-audit-new.json
```

Choose a new report filename each time. `--include-content` adds private question text and should be used only for a private report. The audit makes no model calls and does not repair content. PostgreSQL-wide audit/repair tooling is a separate future extension.

## 13. Verification record and remaining checks

| Check | Evidence / status |
| --- | --- |
| Uploaded SQLite transfer/archive hashes | Passed in isolated verification |
| SQLite integrity, foreign keys, source-file references | Passed on baseline |
| Populated baseline restore and representative exports | Passed locally |
| Staging PostgreSQL import and library availability | Reported working on Ubuntu |
| Staging question edit survives reload | Reported passed on Ubuntu |
| Staging PDF/DOCX downloads | Reported satisfactory on Ubuntu before Access removal |
| Multiple guide-version selection | Passed locally with a disposable fixture; not separately tested on Ubuntu because only one version was available |
| Real Google sign-in, sign-out, sign-in again | Passed on Ubuntu; also confirmed in InPrivate after Access removal |
| Uninvited account rejected | Passed on Ubuntu before Access removal |
| Added member can read; disabled member loses existing-session access | Passed on Ubuntu before Access removal |
| Resource/membership/session/CSRF protections | Automated local coverage, including all 40 book-resource handlers reviewed at that milestone |
| Admin delete/concurrency/rollback safeguards | Passed against temporary local test schema |
| Latest UI review | Build/type checks and local browser review passed; earlier UI changes also confirmed live by operator |
| Staging Access application removal / Protect with Access off | Confirmed by operator |
| Origin and public anonymous-access checks | Passed on Ubuntu, including public check after final DNS correction |
| Final corrected DNS/tunnel behavior after another reboot | Passed on Ubuntu: persistent DNS routing, automatic startup and both access checks |
| PostgreSQL backup helper and isolated restore check | Implemented; local restore passed; Ubuntu acceptance pending; scheduling/off-server copies pending |
| Real-world improvement from new MCQ reviewer | Not established by mocked tests; teacher evaluation needed |
| VPS / object storage / production cutover | Not performed |

Local test commands exist in the repository, including `test-postgres-auth.cjs`, `test-admin-users.cjs`, `test-live-workspace.cjs`, and `test-mcq-quality.cjs`. Several deliberately create or modify fixture data. Run them only with their documented disposable databases and configuration, not casually against the live staging or production library.

No paid model generation was required for the implementation/rehearsal checks recorded here. This does not describe or restrict the operator's own subsequent use of generation.

## 14. Implementation and incident log

Dates below describe the recorded work, not a guarantee that every commit was deployed to Ubuntu on that same day.

| Date / milestone | Result |
| --- | --- |
| 2026-10-23 — inventory and baseline | Identified native systemd deployment, SQLite/files, shared Docker proxy/tunnel; captured, transferred, verified and restored the production snapshot. |
| 2026-10-23 — prototype and UI behavior work | Built and reviewed the quieter Library/Text/Study guides/Export layout; added prototype behavior demonstrations and MCQ quality pipeline. |
| 2026-10-23 — saved-library integration | Connected the approved layout to real books, removed redundant UI, aligned guide tools, exposed appearance controls, made Library the default landing page. |
| 2026-10-23 — PostgreSQL/authentication foundation | Added controlled import/migrations, restricted runtime role, resource membership checks and Google sessions on an isolated branch. |
| 2026-10-23 to 24 — Ubuntu staging | Prepared separate checkout/database/files and service on port 3100; library, edit persistence and exports worked. |
| 2026-10-24 — Google and Admin | Configured Google OAuth; tested invitation/disablement; modernized Admin, added guarded deletion, sorted administrators first, removed Notes, added model dropdown. |
| 2026-10-24 — settings and Text layout | Moved model/limits fully to database settings, unified chevrons, corrected Text pane heights/scrollbars. |
| 2026-10-26 — comprehensive UI pass | Aligned account menu, import/splitting, rename dialog, authentication pages and shared controls; fixed Admin scrolling and retired the legacy route. |
| 2026-10-26 — Access gate removal | Removed only staging's Access application; kept tunnel/HTTPS and production Access; real Google login worked without double sign-in. |
| 2026-10-26 — first DNS issue | Public checker failed DNS lookup; identified Tailscale domain route to the Ubuntu server; staging-specific Ethernet exception restored the public check. |
| 2026-10-26 — reboot / tunnel failure | Incomplete persistent DNS exception left no appropriate default DNS route for Cloudflare endpoint lookup; tunnel crash-looped and public requests returned HTTP 530. |
| 2026-10-26 — corrected DNS | Added persistent and runtime `DNSDefaultRoute=yes`, verified endpoint lookup, restarted tunnel, obtained public checker PASS. A subsequent reboot passed DNS, automatic startup and origin/public checks. |

### Useful commit references

| Commit | Change |
| --- | --- |
| `f5de406` | MCQ length audit and bounded review/repair |
| `acfd97c` | Saved-book workspace integration |
| `6da51e1` | UI subtraction and export consolidation |
| `56d4581` | Guide-tool layout and visible preferences |
| `e2a3bc9` | Default Library landing |
| `9fcb319` | PostgreSQL runtime and invite-only authentication |
| `6d50416` | Isolated Ubuntu staging setup |
| `f756339` | Staging service and initial Access routing |
| `ad8d115` | Book details dialog and Google setup helper |
| `b317eea` | Admin UI and guarded deletion |
| `bc03f6b` | Admin ordering and model choices |
| `c510cfe` | Database-only generation settings and shared chevrons |
| `038a19b` | Text pane height/scroll fix |
| `33824ca` | Comprehensive UI consistency pass |
| `ce38c23` | Staging Access-removal checker/runbook |
| `e7c8695` | Actionable DNS/TLS/connection diagnostics |
| `e79f04c` | Initial record of successful gate removal and remaining DNS persistence |

The final host DNS change was applied manually on Ubuntu. It is host configuration, not an application code commit. This manual records its corrected contents so the change can be reproduced and checked later.

## 15. Next implementation sequence

### 15.1 Close the operational milestone

- Completed: reboot with the final DNS drop-in; automatic startup, DNS and origin/public checks passed.
- Record current running/build versions and preserve recovery information.
- Repeat uninvited/disabled-member and signed-in download checks after gate removal when closing release acceptance.
- Investigate the broader Tailscale split-DNS rule without disrupting other homelab services.

### 15.2 Deploy and accept PostgreSQL backup/restore support

The helper and local isolated restore rehearsal are complete. Run backup/verification on Ubuntu, retain the evidence, and copy a verified encrypted backup off the PC. Scheduling/retention and a complete application restore rehearsal remain before cloud cutover.

### 15.3 Deploy and accept the generation worker

The persistent queue, standalone worker, chapter transactions, cancellation, saved progress and interruption recovery are implemented. Follow section 9.6 for deployment and a small real generation test. A web restart no longer owns generation lifetime. A worker crash preserves completed chapters and fails the interrupted run without automatic paid replay; queued jobs survive. Extraction/export workers and automatic chapter resumption are not implemented.

### 15.4 Move files to private object storage

Evaluate private S3-compatible storage such as Cloudflare R2. Migrate files with checksum reconciliation and enforce membership on upload/download authorization. Object storage and an off-server database backup are separate requirements.

### 15.5 Complete workflow improvements and rehearse VPS migration

Continue staged import/chapter-boundary improvements, provenance/stale-guide behavior and recovery checks. Provision the VPS, deploy web/worker/database/storage configuration, restore a current dataset, and verify the complete workflow before changing production routing.

At cutover, plan a write freeze and a final production-data reconciliation/migration. The old staging baseline is not a substitute for the current production library. After users write to the new deployment, rollback requires data reconciliation; switching DNS alone would lose those new writes from view.

## 16. Command reference and future handover template

### 16.1 Commands by purpose

| Purpose | Command / entry point |
| --- | --- |
| Staging health | `python3 scripts/check-staging-google-access.py` |
| Public staging health | Same command with `--public` |
| View app logs | `sudo journalctl -u topreading-staging.service -n 80 --no-pager` |
| Restart only staging app | `sudo systemctl restart topreading-staging.service` |
| Migrate prepared staging DB | `python3 scripts/migrate-ubuntu-staging.py` |
| Configure prepared Google service | `python3 scripts/start-ubuntu-staging.py --google` |
| Initial staging preparation | `scripts/setup-ubuntu-staging.py` — installation/import workflow, not routine deployment |
| Legacy SQLite verification | `scripts/verify-baseline.py --database ... --uploads ...` |
| Legacy SQLite MCQ audit | `scripts/audit-mcq.py --database ...` |
| Tunnel logs | `sudo docker logs --tail 60 cloudflare-tunnel` |
| Host DNS status | `resolvectl --no-pager status` |
| Tailscale DNS routes | `tailscale dns status` |

Health-check scripts are run from the staging checkout. Avoid treating a runtime exception on a development workstation as evidence that the Ubuntu service failed; confirm which machine/port/path was tested.

### 16.2 Record for each deployment or incident

Copy this template into a private operations log:

```text
Date/time and timezone:
Operator:
Environment/hostname:
Symptom or intended change:
Previous deployed commit:
New commit:
Backup/recovery reference:
Configuration files changed (paths only; no secrets):
Migrations applied:
Services/containers restarted:
Origin check result:
Public check result:
Browser/account/download checks:
Reboot check, if relevant:
Root cause or remaining hypothesis:
Rollback/recovery action:
Unfinished follow-up:
```

### 16.3 Handover summary for a future session

```text
TopReading production is still the home-PC SQLite service on port 3000.
Modernized staging is /home/sungmin-kwon/topreading-staging on branch
modernization/postgres-auth, served by topreading-staging.service on port 3100.
PostgreSQL is container topreading-staging-postgres, localhost:55433,
database/schema topreading_staging, volume topreading-staging-pgdata.
Staging uses Google login; its extra Cloudflare Access gate is removed.
Production's Cloudflare Access gate remains.
Tunnel/NPM are shared Docker infrastructure; do not recreate them or expose tokens.
The host has a Tailscale split-DNS rule for dubugimchi.com pointing at itself.
Staging DNS uses a systemd-networkd exception with BOTH:
  Domains=~top-staging.dubugimchi.com
  DNSDefaultRoute=yes
Latest live public check passed after correcting DNS and restarting cloudflared.
A subsequent reboot verified the corrected DNS, automatic startup and both access checks.
Next: deploy/accept the backup and generation-worker release, preserve off-server backups, then private file storage and VPS rehearsal.
Read docs/admin-runbook.md and check the actual branch/service/configuration first.
```

## 17. Source documents

These repository links remain usable from a standalone downloaded copy. Some documents intentionally preserve historical findings; use this manual's current-state sections to interpret them.

- [Modernization plan](https://github.com/sungmin-kwon/topreading-study-guide/blob/modernization/postgres-auth/docs/modernization-plan.md)
- [PostgreSQL/authentication staging implementation](https://github.com/sungmin-kwon/topreading-study-guide/blob/modernization/postgres-auth/docs/postgres-auth-staging.md)
- [Production baseline findings](https://github.com/sungmin-kwon/topreading-study-guide/blob/modernization/postgres-auth/docs/production-baseline-findings.md)
- [Baseline backup/restore runbook — historical SQLite scope](https://github.com/sungmin-kwon/topreading-study-guide/blob/modernization/postgres-auth/docs/baseline-runbook.md)
- [UI behaviors and MCQ quality workflow](https://github.com/sungmin-kwon/topreading-study-guide/blob/modernization/postgres-auth/docs/ui-behaviors-and-mcq-quality.md)
- [Saved-workspace integration history](https://github.com/sungmin-kwon/topreading-study-guide/blob/modernization/postgres-auth/docs/live-workspace-integration.md)
- [Current configuration template](https://github.com/sungmin-kwon/topreading-study-guide/blob/modernization/postgres-auth/.env.example)
- [Controlled migrations](https://github.com/sungmin-kwon/topreading-study-guide/tree/modernization/postgres-auth/database/migrations)

Update this manual after significant deployment, authentication, DNS, backup or hosting changes. Record observed results separately from intended configuration so future troubleshooting starts with evidence rather than assumptions.

### 2026-10-26: pre-migration backup restart failure

The first Ubuntu backup attempt reported that `topreading-staging.service` could not restart. The startup readiness script had been changed by `git pull` to require migration 0005 columns before that migration was applied. This was a deployment ordering defect: the old built web app could otherwise continue using the old schema. The second backup succeeded at `backups/postgres-20261026_085323-71772f15`, but a successful backup does not prove the service restarted: the helper preserves the running/stopped state it found on entry.

Fixed by making worker-column checks explicit (`--require-worker`) in migration/worker setup only. The web startup check remains compatible with the pre-worker schema. Three regression checks cover old-web restart, rejection of an unmigrated worker, and post-migration readiness. Pull the fix, reset the staging service's failed state, start it, run the origin checker, then verify the reported backup before proceeding with migration/build/worker installation. Ubuntu recovery and backup verification are awaiting operator confirmation.

### 2026-10-26: worker unit path correction

Ubuntu backup restore verification passed (21 tables, eight source files), and origin/public access checks passed after web startup. Worker installation then failed because its generated `WorkingDirectory` was quoted as though it were an `ExecStart` argument; systemd treated those quotes as part of the path and rejected it as non-absolute. The installer now renders validated absolute path directives without quotes and runs `systemd-analyze verify` before installation. Tests with the actual systemd parser accept the corrected unit and reject the original defect.

Recovery: pull the fix, rerun `python3 scripts/start-generation-worker.py`, and start `topreading-staging.service` (the earlier fail-fast deployment stopped before that step). No repeated migration, build or backup is needed for this installer-only correction. Confirm the worker journal says `Generation worker ready.`, then run origin/public checks after the web app starts. Worker startup and real generation acceptance remain pending Ubuntu confirmation.
