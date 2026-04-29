# Deployment Notes

This project is currently optimized for private/local deployment rather than serverless hosting.

## Recommended First Target

Use a deployment target with persistent disk and long-running Node support:

- small VPS
- home server
- Docker on a machine with mounted volumes
- private LAN machine accessed through a secure tunnel

Avoid serverless as the first target. The current app depends on:

- local SQLite database files
- uploaded source files on disk
- generated export files on disk
- Python helper scripts and installed Python packages
- long-running generation requests

## Required Environment

Copy `.env.example` to `.env.local` or configure equivalent production environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `DATABASE_URL`
- `UPLOAD_DIR`
- `EXPORT_DIR`
- `BACKUP_DIR`
- `PYTHON_EXECUTABLE`
- `APP_BASE_URL`
- `AUTH_MODE`
- `AUTH_ALLOWED_EMAILS`
- `APP_ADMIN_EMAILS`
- `AUTH_AUTO_CREATE_USERS`
- `AUTH_SHARED_SECRET`
- `MAX_GENERATION_CHAPTERS`
- `MAX_GENERATION_ITEMS`

Use absolute paths for `DATABASE_URL`, `UPLOAD_DIR`, `EXPORT_DIR`, and `PYTHON_EXECUTABLE` in production. Relative paths are convenient locally, but durable absolute paths are easier to reason about once deployed.

Example Windows home-server paths:

```text
DATABASE_URL=file:D:\TopReading\data\topreading.sqlite
UPLOAD_DIR=D:\TopReading\uploads
EXPORT_DIR=D:\TopReading\exports
BACKUP_DIR=D:\TopReading\backups
PYTHON_EXECUTABLE=D:\TopReading\app\.topreading\Scripts\python.exe
```

Example Linux paths:

```text
DATABASE_URL=file:/srv/topreading/data/topreading.sqlite
UPLOAD_DIR=/srv/topreading/uploads
EXPORT_DIR=/srv/topreading/exports
BACKUP_DIR=/srv/topreading/backups
PYTHON_EXECUTABLE=/srv/topreading/app/.topreading/bin/python
```

## Build Checks

Before deployment:

```bash
npm run typecheck
npm run build
```

## Ubuntu Server Quick Setup

These are the basic steps for a private Ubuntu Server deployment.

Install system packages:

```bash
sudo apt update
sudo apt install -y curl git python3 python3-venv python3-pip build-essential
```

Install Node 22 if it is not already installed:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Clone and install:

```bash
git clone https://github.com/sungmin-kwon/topreading-study-guide.git
cd topreading-study-guide
npm ci
```

Create the Python helper environment:

```bash
python3 -m venv .topreading
./.topreading/bin/python -m pip install --upgrade pip
./.topreading/bin/python -m pip install -r requirements.txt
```

Create durable data directories:

```bash
sudo mkdir -p /srv/topreading/data /srv/topreading/uploads /srv/topreading/exports /srv/topreading/backups
sudo chown -R "$USER":"$USER" /srv/topreading
```

Create `.env.local`:

```bash
cp .env.example .env.local
nano .env.local
```

Use Linux-style paths:

```text
DATABASE_URL=file:/srv/topreading/data/topreading.sqlite
UPLOAD_DIR=/srv/topreading/uploads
EXPORT_DIR=/srv/topreading/exports
BACKUP_DIR=/srv/topreading/backups
PYTHON_EXECUTABLE=/home/sungmin-kwon/topreading-study-guide/.topreading/bin/python
AUTH_MODE=cloudflare_access
AUTH_ALLOWED_EMAILS=your-email@example.com
APP_ADMIN_EMAILS=your-email@example.com
AUTH_AUTO_CREATE_USERS=false
```

Build and start:

```bash
npm run typecheck
npm run build
npm run start -- -H 0.0.0.0 -p 3000
```

### systemd Service

Create `/etc/systemd/system/topreading-study-guide.service`:

```ini
[Unit]
Description=TopReading Study Guide
After=network.target

[Service]
Type=simple
User=sungmin-kwon
Group=sungmin-kwon
WorkingDirectory=/home/sungmin-kwon/topreading-study-guide
EnvironmentFile=/home/sungmin-kwon/topreading-study-guide/.env.local
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start -- -H 0.0.0.0 -p 3000
Restart=on-failure
RestartSec=5
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

If `which npm` is not `/usr/bin/npm`, update `ExecStart`.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable topreading-study-guide
sudo systemctl start topreading-study-guide
sudo systemctl status topreading-study-guide
```

Useful logs:

```bash
journalctl -u topreading-study-guide -f
```

## Runtime Storage

Back up these paths if the app contains important generated material:

- SQLite database path from `DATABASE_URL`
- source file directory from `UPLOAD_DIR`
- export directory from `EXPORT_DIR`

The generated exports can usually be recreated from the database, but uploaded sources and the SQLite DB are primary data.

## Basic Backup Process

Run the backup script from the repository root:

```powershell
npm run backup
```

The script creates a timestamped folder under `BACKUP_DIR` with:

- `topreading.sqlite`: a SQLite backup created through SQLite's backup API
- `uploads/`: copied source files
- `manifest.json`: source paths and backup metadata

Generated PDF/DOCX exports are omitted by default because they can usually be recreated. Include them when desired:

```powershell
npm run backup -- --include-exports
```

For a home server, set `BACKUP_DIR` to a folder synced by OneDrive, Google Drive, Syncthing, or another backup tool. Prefer a path outside the repository, for example:

```text
BACKUP_DIR=D:\TopReadingBackups
```

Schedule this command nightly once the app has real users or generated material worth preserving.

## Security Checklist

- Keep `.env.local` out of Git.
- Do not commit SQLite DBs, uploads, exports, or `.topreading`.
- Add authentication before exposing the app outside a trusted network.
- Rotate the OpenAI key if it was ever pasted into a committed or shared file.
- Keep the legacy `topreading_study_guide_maker` folder out of this repository unless it has been sanitized.

## Authentication

The app has a lightweight middleware guard controlled by `AUTH_MODE`, plus app-level user authorization through the SQLite `users` table. Middleware handles the outer access layer; API routes then require an active app user for normal book workflows and an active admin user for `/admin`.

### Local Development

Use:

```text
AUTH_MODE=off
```

In local development, the app can bootstrap a local admin identity from `DEV_USER_EMAIL`, `APP_ADMIN_EMAILS`, or a default local email.

### Cloudflare Access

If the home server is exposed through Cloudflare Tunnel, Cloudflare Access is the preferred first auth layer.

Recommended setup:

1. Protect the public hostname with a Cloudflare Access application.
2. Restrict access to family member email addresses.
3. Set the app environment:

```text
AUTH_MODE=cloudflare_access
AUTH_ALLOWED_EMAILS=person1@example.com,person2@example.com
APP_ADMIN_EMAILS=person1@example.com
AUTH_AUTO_CREATE_USERS=false
```

The app checks Cloudflare's `Cf-Access-Authenticated-User-Email` header. If `AUTH_ALLOWED_EMAILS` is empty, any Cloudflare-authenticated email is accepted. Keeping the allowlist populated is safer.

`AUTH_AUTO_CREATE_USERS=false` makes the app-level user table the second authorization layer: Cloudflare can authenticate the email, but the app will still deny access until the email exists as an active user or is listed in `APP_ADMIN_EMAILS`.

Make sure the app is not directly reachable from the public internet except through Cloudflare Tunnel, otherwise headers could be spoofed by a direct client.

### Nginx Proxy Manager Shared Secret

For an internal proxy-only setup, nginx can inject a secret header and the app can require it:

```text
AUTH_MODE=shared_secret
AUTH_SHARED_SECRET=replace-with-a-long-random-value
```

Configure nginx proxy manager to add:

```text
X-TopReading-Auth-Secret: replace-with-a-long-random-value
```

This is not a user login system. It is a proxy trust check and works best when direct access to the Node app port is blocked.

## Cost And Rate Guardrails

The app currently prevents overlapping generation runs for the same book and has configurable per-run limits:

```text
MAX_GENERATION_CHAPTERS=80
MAX_GENERATION_ITEMS=2500
```

`MAX_GENERATION_ITEMS` counts requested vocabulary, multiple-choice, and short-answer items combined. These are coarse safety rails, not a billing system.

Recommended OpenAI-side guardrails:

- Set project-level monthly budget alerts/limits in the OpenAI dashboard.
- Use a dedicated API key for this app.
- Rotate the key if it is ever exposed.

## GitHub Hygiene Checklist

Before pushing:

- Verify `.env.local` is ignored.
- Verify `data/*.db`, `data/uploads/*`, `data/exports/*`, and `backups/*` are ignored.
- Do not commit `.topreading/`.
- Do not commit generated `.next/` output.
- Do not commit the legacy `topreading_study_guide_maker` project unless secrets and generated artifacts have been removed.
- Run `npm run typecheck` and `npm run build`.
- Review `git status --short` before the first commit; only source, docs, config templates, package files, and `.gitkeep` placeholders should be tracked.

## Known Deployment Gaps

- No background worker or queue for long generation runs.
- No user-level spending limits or rate limits.
- SQLite is fine for a private deployment, but Postgres is a better fit for multi-user hosting.
- Local filesystem storage should be replaced with durable object storage if deployed to a stateless platform.
