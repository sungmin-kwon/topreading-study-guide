# TopReading Study Guide

TopReading Study Guide is a private study-guide maker for English reading books. It imports source ebooks, extracts and splits chapter text, generates vocabulary and comprehension questions with OpenAI, supports review/editing, and exports classroom-ready PDF or DOCX files.

## Current Workflow

1. Create or select a book.
2. Upload a PDF, EPUB, or TXT source file.
3. Extract text and split it into chapters.
4. Review/edit chapter text.
5. Generate vocabulary, multiple-choice questions, and short-answer questions.
6. Review/edit generated study sets.
7. Export whole-book or chapter-level PDF/DOCX files.

## Stack

- Node 22
- Next.js app in `apps/web`
- TypeScript
- Drizzle + SQLite for local persistence
- Python helper scripts for source extraction and document rendering
- OpenAI Responses API for generation

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

Before exposing the app publicly, enable authentication with `AUTH_MODE`. Cloudflare Access is the preferred first option when the app is published through Cloudflare Tunnel.

See [Deployment Notes](docs/deployment.md) and [Future Work](docs/future-work.md).
