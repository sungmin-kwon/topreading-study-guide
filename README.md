# TopReading Study Guide

TopReading Study Guide is a private study-guide maker for English reading books. It imports source ebooks, extracts and splits chapter text, generates vocabulary and comprehension questions with OpenAI, supports review/editing, and exports classroom-ready PDF or DOCX files.

The app is currently intended for private family/home-server use rather than public multi-tenant hosting.

## Current Workflow

1. Create or select a book.
2. Upload a PDF, EPUB, or TXT source file.
3. Extract text and split it into chapters.
4. Review/edit chapter text.
5. Generate multiple-choice questions, short-answer questions, and vocabulary.
6. Review/edit generated study sets.
7. Export whole-book or chapter-level PDF/DOCX files.

Generated study sets are versioned by generation run, so a book can keep multiple generated versions while one run is marked active for review/export.

## Features

- PDF, EPUB, and TXT source upload
- Python-backed text extraction and document rendering
- Rule-based chapter splitting plus page-marker fallback
- Chapter editor for correcting parsed text
- Whole-book OpenAI generation with structured progress logs
- Generation history and active-run selection
- Manual add/edit/delete for generated items
- Study set review tabs ordered question-first: Multiple Choice, Short Answer, Vocabulary
- Whole-book and single-chapter exports to PDF and DOCX
- SQLite persistence for books, sources, parsed text, chapters, generation runs, study sets, and users
- Basic admin page for user management and selected `.env.local` settings
- Backup script for SQLite database and uploaded sources

## Stack

- Node 22
- Next.js app in `apps/web`
- TypeScript
- Drizzle + SQLite for local persistence
- Python helper scripts for source extraction and document rendering
- OpenAI Responses API for generation

## Repository Layout

```text
apps/web/              Next.js application
packages/core/         Shared generation-count logic
scripts/               Backup, extraction, and render helper scripts
docs/                  Architecture, deployment, and future-work notes
data/                  Local runtime placeholders only; real contents are ignored
requirements.txt       Python helper dependencies
```

## Local Setup

Install Node 22, then from the repository root:

```powershell
npm install
Copy-Item .env.example .env.local
```

Create the Python helper environment:

```powershell
python -m venv .topreading
.\.topreading\Scripts\python.exe -m pip install -r requirements.txt
```

Set `OPENAI_API_KEY` in `.env.local`. For Windows local development, setting `PYTHON_EXECUTABLE` is recommended:

```text
PYTHON_EXECUTABLE=F:\VSCode-Local\topreading-study-guide\.topreading\Scripts\python.exe
```

Start the app:

```powershell
npm run dev
```

The Next dev server prints the local URL, usually `http://localhost:3000`.

For local development, `AUTH_MODE=off` is fine. In that mode the app will bootstrap a local admin user so `/admin` is accessible before production auth is configured.

## Useful Commands

```powershell
npm run typecheck
npm run build
npm run backup
```

`npm run typecheck` should pass before opening a PR or publishing changes. `npm run build` catches production-only Next.js issues.

`npm run backup` creates a timestamped backup under `BACKUP_DIR` containing a SQLite backup, uploaded sources, and a manifest. Add `-- --include-exports` if you also want to copy generated PDF/DOCX exports:

```powershell
npm run backup -- --include-exports
```

## Important Environment Variables

Copy `.env.example` to `.env.local` and keep `.env.local` out of Git.

- `OPENAI_API_KEY`: API key used for generation.
- `OPENAI_MODEL`: model used by the generator, currently defaulting to `gpt-5-mini`.
- `DATABASE_URL`: SQLite database path. Keep the `file:` prefix.
- `UPLOAD_DIR`: source ebook storage.
- `EXPORT_DIR`: generated PDF/DOCX storage.
- `BACKUP_DIR`: backup output directory.
- `PYTHON_EXECUTABLE`: Python venv executable used by extraction/export helpers.
- `AUTH_MODE`: `off`, `cloudflare_access`, or `shared_secret`.
- `AUTH_ALLOWED_EMAILS`: Cloudflare Access email allowlist.
- `APP_ADMIN_EMAILS`: comma-separated emails with app-level admin access.
- `DEV_USER_EMAIL`: optional local development identity.
- `MAX_GENERATION_CHAPTERS` and `MAX_GENERATION_ITEMS`: coarse generation guardrails.

## Runtime Data

Local runtime data is intentionally excluded from Git:

- `data/dev.db`
- `data/dev.db-*`
- `data/uploads/*`
- `data/exports/*`
- `backups/*`
- `.topreading/`
- `.env.local`

Only `.gitkeep` placeholders should remain under `data/`, `data/uploads/`, and `data/exports/`.

## Deployment Notes

This app currently assumes durable local filesystem access for SQLite, uploaded sources, generated exports, and the Python environment. A small VPS, home server, or container host is a better first deployment target than a serverless platform.

Before exposing the app publicly, enable authentication with `AUTH_MODE`. Cloudflare Access is the preferred first option when the app is published through Cloudflare Tunnel. Also set `APP_ADMIN_EMAILS` so the right account can open `/admin`.

On Ubuntu Server, see [Deployment Notes](docs/deployment.md#ubuntu-server-quick-setup) for the package install, Python venv, `.env.local`, and `systemd` service steps.

Typical production command:

```bash
npm run start -- -H 0.0.0.0 -p 3000
```

For `systemd`, use an `EnvironmentFile` pointing to the deployed `.env.local`, and restart the service after changing important admin settings.

## Admin Page

The admin page lives at `/admin`.

It currently supports:

- adding users
- editing display names
- changing app-level role/status
- editing notes
- editing a safe allowlist of `.env.local` parameters

Cloudflare Access or the shared-secret middleware still protects access to the app. The app-level user table controls internal role/status for the admin console.

## Backup Notes

SQLite is enough for the current private/home-server use case, but the database and uploads should be backed up regularly.

Run:

```powershell
npm run backup
```

Use `-- --include-exports` if generated exports should also be copied. For a home server, point `BACKUP_DIR` to a durable folder, ideally one synced by OneDrive, Google Drive, Syncthing, or another backup tool.

See [Deployment Notes](docs/deployment.md) and [Future Work](docs/future-work.md).
