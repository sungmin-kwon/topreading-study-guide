# TopReading implementation and migration plan

Date: 2026-10-23 (Asia/Seoul)

Status: production backup restored and verified in isolation; UI prototype and PostgreSQL import rehearsal implemented. See [current implementation status](prototype-and-postgres.md). Live deployment, authentication boundary, and the full PostgreSQL application cutover remain pending.

## Goal and scope

Incrementally modernize the existing Next.js, Drizzle, and Python application: simplify importing and chapter splitting, redesign persistence, implement proper authentication and authorization, overhaul the UI, and move hosting off the home Ubuntu PC.

Start with an invite-only shared library. Design membership so separate libraries can be supported later. Preserve existing books, edited chapters, generated material, guide versions, and PDF/DOCX export behavior. Defer public registration, billing, classroom management, and student assessment features.

## Target architecture

| Area | Direction |
| --- | --- |
| Interface | Next.js; Text, Study guides, and Export destinations within each book |
| Authentication | Google login through Auth.js, invitations, server-side sessions |
| Authorization | Library memberships, admin/member roles, resource-level checks |
| Database | PostgreSQL with version-controlled Drizzle migrations |
| File storage | Private S3-compatible storage, such as Cloudflare R2 |
| Processing | Separate worker with a PostgreSQL-backed queue |
| Initial hosting | Small VPS running web, worker, and PostgreSQL through Docker Compose |
| Public access | Keep Cloudflare and top.dubugimchi.com; tunnel remains optional |
| Operations | Off-server backups, restore procedures, health checks, logs, and budget alerts |

A single VPS is economical but requires server maintenance and is not a high-availability deployment. Managed PostgreSQL or managed container hosting can replace individual components later. Nginx Proxy Manager is optional in the new deployment.

## Phase 1 — Baseline and recovery

1. Inventory the production code revision, database, uploaded sources, exports, deployment method, and non-secret configuration.
2. Make a consistent SQLite backup and copy associated files. Pause application writes and processing for the migration-quality baseline: a database snapshot and a separately copied directory are not automatically one consistent snapshot.
3. Restore into an isolated environment; verify books, chapters, questions, vocabulary, and exports.
4. Capture current screens and complete workflows in a browser.
5. Assemble representative source files: clean EPUB, text PDF, scanned PDF, TXT, and difficult chapter layouts.
6. Record table counts, relationships, source checksums, active guide selections, and known anomalies for later reconciliation.
7. Inspect the Cloudflare/proxy authentication boundary. Correct exposed header trust or production bypasses before adding public endpoints.

**Completion gate:** restored baseline, documented deployment inventory, and representative regression dataset. A local development database is not evidence that production can be restored.

## Phase 2 — Workflow and visual design

Prototype three complete tasks with realistic content: import and correct chapters; generate and edit a guide; export a student handout and answer key.

| Destination | Responsibilities |
| --- | --- |
| Text | Upload, extraction progress, boundary review, chapter editing |
| Study guides | Generate, choose versions, review questions and vocabulary |
| Export | Choose chapters, content, answers, and format; preview output |

Design a quiet editorial workspace: neutral surfaces, dark readable text, one restrained accent, compact navigation, and fewer nested cards. Keep reading material prominent. Use typography, spacing, and dividers for grouping. Preserve English/Korean support and dark mode; check both scripts together. Design compact mobile navigation and a chapter picker explicitly.

Combine generation status and version management. Show plain-language progress and recovery actions; put logs, model metadata, and storage details in expandable details. Use a document-like question editor with an optional source pane. Make the current book, chapter, guide version, and save status unambiguous.

Include empty, processing, failed, cancelled, partial-success, and recovery states in the prototype.

**Completion gate:** a clickable prototype makes the next action and editing context clear without explaining internal processing concepts.

## Phase 3 — Storage and access foundations

Implement PostgreSQL and authentication together because ownership affects nearly every query.

### Data model

- Users, provider identities, libraries, and memberships.
- Books assigned to a library.
- Source files and immutable extraction versions, with pages/text blocks and source references.
- Stable chapter identities with versioned text.
- Study guides linked to the chapter revisions used for generation.
- Typed vocabulary, multiple-choice, short-answer, and existing summary records.
- Jobs, chapter tasks, attempts, errors, progress, and usage.
- Stored-file and export metadata.

Preserve useful IDs and relationships. Keep ambiguous legacy provenance explicit rather than inventing revision links. Add foreign keys, indexes, uniqueness constraints, and transactions. Replace application-startup schema modifications with controlled deployment migrations.

Introduce a storage interface. Store private object keys and checksums in PostgreSQL; store original source files and generated artifacts in object storage. Retain the original extraction while applying reversible cleanup. Editing chapter text should identify potentially outdated guides without destroying previous content.

### Access

- Google login through verified provider identities and secure sessions.
- Invite-only membership initially, with admin/member roles.
- Authorization on books, chapters, guides, jobs, and downloads.
- Private downloads through authorization or short-lived signed URLs.
- Disabled-account enforcement and rejection of production startup with authentication disabled.
- Deployment secrets managed outside the admin UI; ordinary editable settings in the database.
- If retaining Cloudflare Access as an identity source, validate signed assertions and prevent origin bypass.

**Completion gate:** representative migrated data works; unauthorized IDs and private files are inaccessible; disabled users lose access.

## Phase 4 — Durable processing

Move extraction, OCR, AI generation, and export rendering out of HTTP requests into worker jobs. The web app submits jobs and displays persisted progress.

- Atomic task claiming and bounded concurrency.
- Per-chapter checkpoints and persisted successful output.
- Bounded retries, permanent-failure states, cancellation, and restart recovery.
- Duplicate-safe database writes.
- Per-user generation limits, token usage, and cost estimates.
- Retry failed chapters without replacing successful, reviewed material.
- Temporary local processing files, with durable artifacts uploaded to object storage.

A lost AI response may require another external request even when database writes are duplicate-safe. Account for this possibility in retry limits and cost reporting.

**Completion gate:** closing the browser or restarting a worker does not lose saved results, strand jobs permanently, or duplicate generated items.

## Phase 5 — Deliver redesigned workflows

Build shared typography, spacing, controls, dialogs, feedback, and navigation components. Split the large workspace component into focused screens and editors. Deliver frontend and backend changes together by workflow.

### Text and importing

1. Upload → automatic extraction → chapter suggestions → boundary review → save.
2. Prefer EPUB navigation and reading order; use PDF bookmarks/layout cues where available, then text-heading rules.
3. Clean repeated headers/footers, page numbers, and broken words while preserving original extraction.
4. Show a chapter outline alongside source text; split, merge, rename, and exclude front matter directly.
5. Diagnose short chapters, duplicate headings, uncovered text, and pages with little extracted content.
6. Detect duplicate uploads using checksums; scope reuse to authorized content.
7. Reprocessing creates a draft revision and preserves existing edits and guides.
8. Add OCR and optional AI boundary suggestions after the standard EPUB/PDF/TXT path is reliable. AI suggestions must reference actual source locations and be previewable.

### Study guides

- Combine version selection, generation status, and version management.
- Keep chapter navigation beside the question/vocabulary editor.
- Offer source text for answer checking.
- Provide generation defaults with detailed counts available when needed.
- Show completed/remaining chapters, partial output, cancellation, and retry actions.
- Make unsaved changes and potentially outdated guides visible.

### Export

- One settings panel beside a preview.
- Explicit guide version, chapter selection, content types, answers, and PDF/DOCX format.
- Student handout and answer-key options.
- Preview representative output using the selected settings; preserve document quality.

**Completion gate:** representative books complete import-to-export, including corrections and failure recovery. Check keyboard navigation, dialog focus, contrast, bilingual layouts, long titles, large chapter lists, and narrow screens.

## Phase 6 — Cloud staging and migration rehearsal

Provision a VPS and private object storage; deploy to a staging hostname.

- Repeatable container builds and deployment.
- One controlled database migration step.
- Separate staging/production configuration and secrets.
- Private database networking, restricted host access, HTTPS.
- Health checks, error reporting, disk-capacity alerts.
- Off-server database backups and object-retention policy.
- Restore procedure covering database records and corresponding files.

Build a repeatable migration command that reads a consistent SQLite snapshot, creates the initial library, maps existing users, preserves IDs/relationships, copies files, verifies checksums, and reports missing files and invalid references. Produce a reconciliation report; never silently discard anomalous records.

Rehearse migration into staging. Compare record counts, text, generated items and summaries, guide versions, active selections, and representative exports. Restore staging from backups.

**Completion gate:** repeatable migration, resolved or explicitly accounted-for discrepancies, and successful cloud restore rehearsal.

## Phase 7 — Production cutover

1. Schedule a short maintenance window.
2. Stop new imports, edits, and generation on the home server.
3. Finish or cleanly cancel active processing.
4. Take the final consistent snapshot and file inventory.
5. Run the rehearsed migration and reconciliation.
6. Smoke-test login, editing, generation, and export.
7. Switch top.dubugimchi.com to the cloud deployment.
8. Monitor access failures, job failures, latency, storage, and costs.

Keep the home installation read-only for an agreed retention period. Before cloud writes occur, rollback can restore traffic to the old deployment. After new cloud writes, preserve and reconcile those changes before rollback; DNS reversal alone is insufficient.

**Completion gate:** production works from the cloud, backups and alerts are active, and rollback/recovery responsibilities are documented.

## Delivery order and budget

Baseline and UI prototype → storage/authentication → durable jobs → redesigned workflows → staging rehearsal → cutover.

Design can proceed alongside backend preparation. Production migration waits for validated workflows and recovery behavior. The first milestone is a restored baseline, workflow prototype, and migration specification.

Provisional monthly planning allowances, excluding AI usage: US$10–25 for a modest VPS setup; US$30–70 for a managed setup. These are not verified provider quotes. Confirm resource requirements, region, backups, storage, and current pricing before provisioning.

## Decisions to verify during the baseline

- Actual production code revision, data volume, deployment method, and configuration.
- Whether every existing user should join the initial shared library.
- Access through Cloudflare Access, internal proxy, and direct origin routes.
- Representative user-provided source books and expected chapter boundaries.
- Hosting region, operating budget, backup retention, and acceptable recovery window.

## Repository references

- [README](../README.md)
- [Deployment notes](deployment.md)
- [Current data model notes](data-model.md)
- [Architecture notes](architecture.md)
- [Future-work notes](future-work.md)

This document is the agreed modernization direction. Older documents describe the current implementation and may contain recommendations superseded by this plan.
