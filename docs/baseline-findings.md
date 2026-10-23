# Baseline findings — 2026-10-23

## Status and scope

This document records the initial local/synthetic baseline. **Update:** the populated Ubuntu backup has now been uploaded, verified, and restored successfully; see [production backup restore findings](production-baseline-findings.md). The historical checks below remain useful, while the newer report records current completion status and remaining work.

The application code and production configuration were not changed. Work added the modernization plan, this report, a production runbook, a read-only verifier, and verifier tests. Original local database contents were preserved; application smoke tests ran against isolated restored copies. No paid AI calls were made.

## Repository and runtime inventory

| Item | Observed |
| --- | --- |
| Starting Git revision | `2f1102d` — Book summary generation |
| Starting tracked worktree | Clean |
| Required Node version | 22.x |
| Validation toolchain | Node 22.23.4 and npm 10.9.2, already available in the workspace |
| Default shell toolchain | Node 24.19.0 / npm 11.9.0; not used for app validation |
| Installed Next.js | 15.5.15 |
| Python helper environment | Python 3.12.14; PyMuPDF 1.27.2.2 |
| Local database | SQLite, WAL mode; 12 application tables |
| Original local data | 1 user, 0 books, 0 sources, 0 chapters, 0 study material |
| Original local uploads/exports | No source or exported documents |

The actual installed versions were recorded rather than inferred solely from package ranges. The original database passed SQLite integrity and foreign-key checks, but its empty library cannot demonstrate real-book recovery.

## Completed checks

| Check | Result |
| --- | --- |
| TypeScript checks for both workspaces | Passed |
| Production Next.js build | Passed with worker execution permitted |
| Read-only verifier tests | 10 passed |
| Existing backup script | Created a SQLite snapshot plus uploads/exports directories |
| Original local backup restored to isolation | Schema and all table fingerprints matched |
| Synthetic TXT upload/extraction/splitting | Passed; 2 expected chapters |
| Existing deterministic mock generation | Passed for both chapters |
| Whole-book multiple-choice PDF and DOCX | Passed; both documents contain both chapters and questions |
| Browser smoke test | Populated review rendered; no page JavaScript errors observed in the smoke run |
| Populated synthetic backup and second restore | All table fingerprints, source checksums, and copied export checksums matched |
| Production build restarted against second restore | Books, chapters, populated review, and PDF/DOCX endpoints passed |

The first sandboxed build failed without useful webpack diagnostics, and the sandbox denied local listening. The same app compiled successfully with execution permissions, and the local server started. These are environment observations, not established product defects.

The synthetic recovery corpus contains 1 book, 1 source, 1 parsed document/page, 2 chapters, 1 legacy generation record, 2 study sets, 6 vocabulary items, 4 multiple-choice questions, 2 short-answer questions, and 0 summaries. It is deliberately small and does not validate long books, OCR, real EPUB layouts, live OpenAI behavior, or populated summary exports.

## Baseline verifier

[`scripts/verify-baseline.py`](../scripts/verify-baseline.py) opens SQLite read-only and performs no app initialization or migrations. It records table counts and deterministic content hashes, checks SQLite integrity/foreign keys, verifies referenced upload sizes/checksums, and checks active-generation pointers and unfinished runs. It reports empty-library and orphan-upload warnings. It does not print user emails, source text, or question contents.

It fails rather than creating a missing database or overwriting an existing report. Tests cover restored data equivalence, changed table content at the same row count, changed files at the same size, missing files, path traversal, escaping symlinks, invalid references, unfinished work, missing databases, and report overwrite protection.

It is a current-schema verifier, not a complete migration validator or security audit. Private reports and backups remain excluded from Git. Use the [production runbook](baseline-runbook.md) for commands, limitations, and consistent capture requirements.

## UI evidence

Synthetic local screenshots are retained for layout comparison:

- [Empty library, desktop](baseline/screenshots/01-empty-desktop.png)
- [Chapter editor, desktop](baseline/screenshots/02-chapters-desktop.png)
- [Populated review, desktop](baseline/screenshots/03-review-desktop.png)
- [Review at 390 × 844](baseline/screenshots/04-review-mobile.png)

Observed layout concerns:

1. At phone width, the expanded library and seven vertically stacked tabs consume the visible viewport before the review content appears. The fixed-height shell and nested scrolling need explicit mobile validation and redesign.
2. On desktop, the library, chapter outline, and nested review containers leave relatively little width for question content. Several metadata labels and controls compete with the content.
3. Guide/version state appears in several places, supporting the planned consolidation into a clear version selector and management view.

The initial development capture used an Inter fallback font. Chapter/review screenshots were recaptured from the production build with the Inter font family after restart against the second restore. These are local synthetic examples, not captures of the hosted production site. Only English/light screenshots were captured; Korean, dark mode, focus/keyboard behavior, and the remaining workflow states still require an audit.

## Recovery and authentication findings

- The existing backup script correctly uses SQLite's backup API, but it copies files separately. A migration-quality snapshot requires paused writes; a successful command alone does not prove a consistent database/file set.
- Backup manifests do not themselves verify source content. Run the verifier against the saved snapshot and restore, and separately retain/compare unreferenced files and exports.
- Backup directory names have one-second resolution. Avoid concurrent invocations until backup hardening is implemented.
- The application performs schema changes during database-client initialization. Verify an untouched snapshot before starting a restored app.
- Source review confirms reliance on identity headers and an authentication-off fallback. Actual exposure depends on the production Access/proxy/origin configuration, which remains unverified.
- Current source records, chapter text, generated items, active guide choices, and chapter summaries all belong in the migration inventory. Do not omit summaries because the synthetic fixture has none.

## Production follow-up status

1. Completed: systemd deployment, revision, paths, and reported authentication mode identified.
2. Completed: populated production backup transferred, verified, restored, and exercised with the existing application.
3. Completed: populated workspace and Korean/dark/mobile screenshots captured privately.
4. Pending: live Cloudflare Access/origin-boundary verification, EPUB/scanned-document corpus coverage, expected chapter boundaries, and full accessibility/recovery-state audit.
5. Next: workflow prototype and migration specification using the verified production corpus. See the newer report for findings and evidence.

No production cutover, authentication replacement, or PostgreSQL migration has begun. The [modernization plan](modernization-plan.md) remains the implementation sequence.
