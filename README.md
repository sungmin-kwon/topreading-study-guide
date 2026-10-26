# TopReading Study Guide

TopReading imports English reading sources, prepares chapters, generates editable vocabulary and comprehension questions, and exports PDF/DOCX study guides.

## Start here

**[Administration manual, operations runbook, and migration log](docs/admin-runbook.md)** — current deployment inventory, account management, update commands, verification, backup limitations, DNS/tunnel recovery, implementation history and next steps. This is also designed to be downloaded as a standalone Markdown file.

- [Implementation and migration plan](docs/modernization-plan.md)
- [PostgreSQL/authentication implementation and staging setup](docs/postgres-auth-staging.md)
- [Verified historical production baseline](docs/production-baseline-findings.md)

## Current branch and deployments

This branch, `modernization/postgres-auth`, requires PostgreSQL and explicit authentication configuration.

| Deployment | Status |
| --- | --- |
| `top.dubugimchi.com` | Existing home-PC production service, SQLite, port 3000, separate checkout; production cutover has not happened |
| `top-staging.dubugimchi.com` | Home-PC staging service, PostgreSQL, port 3100, application Google login and invite-only membership; the extra Cloudflare Access gate is removed |

Production and staging are independent data stores. Do not deploy this backend over the production SQLite environment. No VPS is live yet.

The shared Cloudflare Tunnel and nginx Proxy Manager remain in use. The current host DNS fix requires both the staging hostname route and `DNSDefaultRoute=yes`; read the manual before changing network settings. A subsequent reboot verified the corrected DNS routing, automatic service/container startup and both access checks.

## Current application workflow

1. Open Library and create/select a book.
2. Use Text tools to upload a PDF, EPUB or TXT source, extract text, and prepare chapter boundaries.
3. Review/edit chapter text in Text.
4. Generate a guide, select/manage versions, and review/edit questions and vocabulary in Study guides.
5. Download whole-book or chapter-level documents through Export.
6. Use Admin for member access, roles/status and database-backed generation settings.

Light/dark and English/Korean controls remain visible in the header. `/prototype` is an isolated sample-data design reference; `/legacy` redirects to the current Library.

Re-splitting remains destructive. Durable background jobs, private object storage and automated PostgreSQL backup/restore are not implemented yet.

## Configuration and development

Use Node 22. The repository includes a Next.js/React web app, shared TypeScript core, Drizzle/PostgreSQL data access, Auth.js Google sessions and Python extraction/export tools.

`.env.example` describes the current configuration. Actual database credentials, OAuth credentials, session secrets and API keys belong in private `.env.local`, not Git. For Ubuntu staging, follow the prepared-checkout helpers and the runbook rather than creating a replacement environment from scratch.

The model and the two Admin-editable generation limits are stored in PostgreSQL. Editing their retired `.env.local` entries does not change runtime behavior.

Local authentication bypass requires an explicit loopback-only configuration and a pre-created user. It is not automatic admin bootstrapping and must never be used for a public deployment. The former shared-secret identity mode is not supported on this branch.

## Commands and data safeguards

```bash
npm ci
npm run typecheck
npm run build
```

These build/check commands do not constitute deployment. Use the [staging update procedure](docs/admin-runbook.md#7-updating-the-staging-application), which includes stopping staging, controlled migrations, building, restarting and verification.

`database/migrations/*.sql` is authoritative. Do not replace the controlled migration flow with `drizzle-kit push`. Use `scripts/migrate-ubuntu-staging.py` for the prepared staging installation. The initial importer/setup script is not a routine update mechanism.

`npm run backup` is a **legacy SQLite backup command** and refuses PostgreSQL. A verified PostgreSQL dump plus matching files, configuration recovery and an isolated restore rehearsal are still required; see the manual's backup section.

Several integration tests write disposable fixture data. Read their setup requirements and never point them at the live library merely to check deployment health. The read-only operational checks on Ubuntu are:

```bash
cd /home/sungmin-kwon/topreading-staging
python3 scripts/check-staging-google-access.py
python3 scripts/check-staging-google-access.py --public
```

## Historical references

- [SQLite deployment notes](docs/deployment.md) describe the older deployment; they are not the setup instructions for this PostgreSQL branch.
- [Baseline runbook](docs/baseline-runbook.md) and [baseline findings](docs/production-baseline-findings.md) preserve the original recovery work.
- [UI behavior and MCQ quality notes](docs/ui-behaviors-and-mcq-quality.md) explain prototype behavior and the bounded review/repair pipeline for new MCQs.
- [Saved-workspace integration history](docs/live-workspace-integration.md) records earlier UI rollout stages.

Consult the current administration manual when an older document describes a superseded UI, authentication mode or environment-setting workflow.
