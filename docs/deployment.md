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

```powershell
npm run typecheck
npm run build
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

The app has a lightweight middleware guard controlled by `AUTH_MODE`.

### Local Development

Use:

```text
AUTH_MODE=off
```

### Cloudflare Access

If the home server is exposed through Cloudflare Tunnel, Cloudflare Access is the preferred first auth layer.

Recommended setup:

1. Protect the public hostname with a Cloudflare Access application.
2. Restrict access to family member email addresses.
3. Set the app environment:

```text
AUTH_MODE=cloudflare_access
AUTH_ALLOWED_EMAILS=person1@example.com,person2@example.com
```

The app checks Cloudflare's `Cf-Access-Authenticated-User-Email` header. If `AUTH_ALLOWED_EMAILS` is empty, any Cloudflare-authenticated email is accepted. Keeping the allowlist populated is safer.

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
