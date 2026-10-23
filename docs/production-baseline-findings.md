# Production backup restore findings — 2026-10-23

## Outcome

The uploaded Ubuntu production backup was successfully verified, restored in isolation, and exercised through the existing application. The uploaded archive remains preserved. The home server was not contacted or modified during this rehearsal, and no paid AI requests were made.

This completes the populated-backup recovery portion of the first milestone. The live authentication boundary, representative expected chapter boundaries, and a full accessibility/workflow audit remain open. This is not yet approval for production migration or cutover.

## Deployment facts supplied by the user

- Production revision: `2f1102d`; `git status --short` returned no changes.
- Ubuntu systemd service: `topreading-study-guide.service`, running as the application owner.
- Application directory: `/home/sungmin-kwon/topreading-study-guide`.
- Configuration: `.env.local` in that directory, loaded by systemd.
- Node 22.22.2; npm reported 10.9.7 during backup.
- SQLite: `data/dev.db`; source files: `data/uploads`; exports: `data/exports`.
- `AUTH_MODE=cloudflare_access`; the filtered configuration output did not include an explicit `AUTH_AUTO_CREATE_USERS` setting. The current code defaults automatic creation to enabled if unset; the effective production setting still needs confirmation.
- Next.js listens on port 3000. Cloudflare Tunnel and nginx Proxy Manager run separately in Docker.
- The service was stopped for backup and reported `active` after restart.

Binding port 3000 to all interfaces does not by itself prove Internet exposure. Firewall rules, Docker-to-host access, Cloudflare Access policy, and possible origin bypass have not been verified.

## Transfer and storage verification

The two uploaded parts matched their SHA-256 entries. Their concatenation matched the archive's SHA-256 entry. The verified archive is 28,449,082 bytes and expands to 53,623,897 bytes.

Archive members were checked for absolute/traversal paths, duplicates, links/special files, and unexpected top-level content before extraction. SQLite's companion files were included: a 32,768-byte shared-memory file and an empty WAL. The saved database contains the expected committed data.

The backup contains:

- 8 source files: 7 PDFs and 1 TXT.
- 37 saved exports: 36 PDFs and 1 DOCX.
- SQLite and the backup manifest, with no application environment file.

All referenced source sizes and SHA-256 values match the database. No missing or unreferenced uploads were reported. Copied exports match the originals byte-for-byte.

## Preserved database inventory

| Table | Rows |
| --- | ---: |
| books | 8 |
| chapters | 174 |
| source_files | 8 |
| parsed_documents | 8 |
| parsed_pages | 2,144 |
| generation_runs | 7 |
| study_sets | 7 |
| chapter_summaries | 156 |
| vocabulary_items | 2,989 |
| multiple_choice_questions | 2,422 |
| short_answer_questions | 1,157 |
| users | 4 |

SQLite integrity passed, declared foreign-key violations were zero, active-generation pointers were valid, and all seven generation runs were completed. There were no duplicate chapter-number groups within books.

Schema and deterministic content fingerprints for every table matched between the extracted snapshot and the isolated restore before app startup. After the rehearsal, all content tables, source checksums, and the schema still matched. Only the restored `users` table changed as expected: the local-only rehearsal account was created/touched. The uploaded archive and original production accounts remain preserved in the original snapshot.

## Application and document checks

The existing production build ran on localhost against the restored database, with a separate export-output directory and an empty OpenAI key. Browser requests outside localhost were blocked during UI capture.

| Check | Result |
| --- | --- |
| Book list | All 8 books load |
| Chapter, source, and run lists | Counts match SQLite for all 8 books |
| Generated items | All 7 study sets' vocabulary, questions, and summary counts match SQLite |
| Existing PDFs | All 36 open; 754 pages total |
| Existing DOCX | Opens as a valid archive with document XML |
| Source re-extraction | All 8 original sources produce readable text with the existing extractor |
| Regenerated exports | All 8 supported types generated as PDF and DOCX for a representative populated guide: 16 documents |
| Regenerated document validation | All 16 open; content samples match stored material in 14; the 2 concise answer-key documents were checked structurally |
| Browser | All 7 main workspace destinations opened; no page JavaScript errors observed |

The explicit active guide version was supplied for the successful exports, matching the current UI. Successful re-extraction does not establish correct chapter boundaries or OCR quality. PDF opening/text checks do not establish pixel-perfect print layout or complete Korean glyph coverage. No new live AI generation or destructive editing was performed.

## UI evidence

Private screenshots of populated Source, Split, Chapters, Generate, Sets, Review, and Export screens are retained in the ignored rehearsal directory. Korean/dark desktop and phone-width captures were also saved. Production book content, screenshots, exported documents, IDs, and account information were not added to version-controlled documentation.

Observations supporting the redesign:

1. At phone width, the expanded library and vertically stacked tabs occupy the viewport before the actual workspace content. Korean/dark mode shows the same layout problem.
2. In populated review, the library and chapter list consume substantial space while questions occupy a narrower nested panel.
3. Some chapter labels repeat information, such as `Chapter 1: Chapter 1`. The redesigned outline should separate numbering from titles.
4. Reloading returns to the initial book/workspace instead of restoring the last editing context. Navigation persistence should be included in the workflow redesign.

Keyboard behavior, focus containment, contrast measurement, and all error/recovery states still need dedicated checks.

## Findings to preserve in implementation work

### Export default-version behavior

Reproduced on the restored production data: a whole-book export request without `generationRunId` returns HTTP 400 with “No generated study sets are available for this book,” even though an active run exists. Supplying the active run succeeds.

The route passes a missing query value as `null`; `exportBookFile` uses the active run only when the argument is `undefined`. The fallback then looks for legacy chapter-level sets, whereas all seven production sets are run-level sets. The UI normally supplies the active run, which avoids this failure. Fix and regression-test omitted-version behavior during export work; preserve intentional `generationRunId=latest` semantics separately.

### Chapter numbering

One book has a gap within its chapter-number range. This is not evidence of transfer loss: its restored content fingerprints match the snapshot. It could reflect an intentional exclusion or an earlier split/edit issue. Preserve the existing data and compare against the source before renumbering or creating content. Details are recorded privately.

### Authentication coverage

Source review found that the bulk study-item `PUT` handler does not call `requireActiveUser`, unlike sibling read/create/delete handlers. Middleware still applies, so this finding alone does not prove an unauthenticated public endpoint. The authentication implementation must enforce active-user and library permissions consistently across every method, including replacement operations.

## Evidence location and privacy

Private operational artifacts are under `backups/production-baseline-20261023/`, which Git ignores:

- `topreading-baseline.tar.gz`: verified uploaded archive.
- `original/`: extracted snapshot; never used to run the app.
- `restored/`: isolated application copy with a local rehearsal identity.
- `rehearsal-exports/` and `evidence/`: generated documents and UI captures.
- JSON reports: transfer, original/restored fingerprints, application counts, documents, source re-extraction, content preservation, and chapter-number review.

The test server was stopped after validation. No public staging deployment or VPS has been provisioned.

## Next steps

1. Use the verified corpus to prepare the import/editor prototype and migration mapping, including all summary records and active guide versions.
2. Review the one chapter-number gap against its source and define expected chapter boundaries for representative books.
3. Add an EPUB and a clearly identified scanned/difficult PDF case to the regression corpus; the current archive has no EPUB.
4. Finish the production Cloudflare Access/origin-boundary review without changing the running deployment.
5. Complete UI/accessibility audit coverage and address the recorded export/authentication gaps as their implementation phases begin.

See the [combined implementation plan](modernization-plan.md), [baseline runbook](baseline-runbook.md), and [initial synthetic-baseline findings](baseline-findings.md).
