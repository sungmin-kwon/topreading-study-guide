# Production baseline and restore runbook

Use this before database, authentication, or hosting changes. The current workspace contains an empty development library; its successful checks do not validate production recovery.

## 1. Record deployment facts

Record the following privately; do not share secrets or copy `.env.local` into Git:

- Deployed Git commit (`git rev-parse HEAD`) and whether local changes exist (`git status --short`).
- Node, npm, and Python versions; service/container name and application working directory.
- Database, uploads, exports, and backup paths used by the actual service.
- Whether configuration comes from `.env.local`, systemd, Docker, or another source. The backup script reads root `.env.local` and process environment, not an arbitrary service's environment.
- Authentication mode, whether allowlists are configured, and whether automatic user creation is enabled. No email addresses or secret values are needed in the shareable inventory.
- Cloudflare Access policy, tunnel origin, nginx routing, and whether anyone can reach the origin without passing the authentication gate.
- Approximate data sizes, expected number of books, active generation work, and available backup disk space.

The existing app trusts identity headers rather than validating signed identity itself. A Cloudflare Tunnel alone does not establish that Cloudflare Access protects the hostname. The production boundary must be inspected before treating it as secure.

## 2. Capture a consistent backup

Arrange a maintenance window and let generation finish. Stop the actual application service/container so there are no uploads, edits, deletions, or exports during the capture. Do not guess the service name or change production configuration as part of this runbook.

Use Node 22 and the existing installed dependencies. From the production repository root, run:

```bash
npm run backup -- --include-exports
```

If the service uses paths outside the root `.env.local`, supply the actual paths explicitly. This example must be adapted to the installation:

```bash
DATABASE_URL=file:/srv/topreading/data/topreading.sqlite \
UPLOAD_DIR=/srv/topreading/uploads \
EXPORT_DIR=/srv/topreading/exports \
BACKUP_DIR=/srv/topreading/backups \
npm run backup -- --include-exports
```

The database is captured through SQLite's backup API, which handles committed WAL data. Do not copy only a live `.db` file. The uploads copy is separate from the database snapshot, which is why application writes must be stopped for this baseline. Use a backup directory outside the uploads/exports directories. Avoid concurrent backup invocations: the existing script names backups to the second.

Verify the reported directory includes `topreading.sqlite`, `uploads/`, `manifest.json`, and exports if any existed. Missing source directories must be investigated even if the backup command itself returned success. Restart the original application using its existing operational procedure after capture; stop and investigate if the backup failed.

## 3. Verify the saved snapshot

Copy `scripts/verify-baseline.py` to the production checkout if needed; it uses only Python 3.9+ standard-library modules and does not load app configuration or execute schema migrations.

```bash
python3 scripts/verify-baseline.py \
  --database /absolute/path/to/backup/topreading.sqlite \
  --uploads /absolute/path/to/backup/uploads \
  --report /absolute/path/to/backup/verification.json
```

The report path must be new. The verifier never overwrites an existing report or creates a missing database. Exit codes: `0` = checks passed, `1` = data issues, `2` = invocation, I/O, or schema error. It is intended for the current schema; older production schemas may require an adapted read-only verifier.

Checks include:

- SQLite integrity and declared foreign-key relationships.
- Presence of the current application's tables, including chapter summaries.
- Row counts and deterministic content fingerprints for all user tables.
- Referenced uploads: safe relative paths, existence, byte size, and SHA-256.
- Active generation pointers and unfinished `generating` runs.
- Warnings for an empty library and unreferenced uploads.

Review all issues and warnings; never automatically delete orphaned files or alter rows to make the report pass. The report omits record contents and user emails, but includes IDs and hashes and should still be kept private. It is not a security audit, full semantic validation, or evidence that UI/export behavior works. Unreferenced uploads and exported files are not content-verified by this script; retain and compare those separately.

## 4. Restore into isolation

Copy the complete backup directory into a new private rehearsal directory. Do not restore over production. Verify the copied database/uploads using the same command and a new report path. Compare the two JSON reports before launching the app; matching counts alone are insufficient, so compare content and schema fingerprints too.

Use the same deployed code revision for the first restore rehearsal. Configure absolute paths pointing only to the restored database, uploads, and exports. Give the application a separate export output directory so it cannot overwrite captured exports. Bind to `127.0.0.1` and keep the rehearsal private.

Do not import the app's database client until the snapshot is verified: it performs startup-time migrations. Preserve the untouched backup and original report.

For a local-only rehearsal, authentication can be disabled explicitly. Clear `OPENAI_API_KEY` for smoke tests so no paid generation is attempted. Never reuse these settings on a public deployment. Test actual production authentication separately through the intended identity provider and proxy.

## 5. Application and UI acceptance checks

- Books, authors, chapter order/text, and selected versions match the original.
- Vocabulary, multiple-choice answers/explanations, short answers/rubrics, and summaries survive restoration.
- Edited content persists after restart.
- Existing PDF/DOCX exports open; regenerated samples contain the expected content.
- Capture populated Source, Split, Chapters, Generate, Sets, Review, and Export screens.
- Capture English/Korean, light/dark, desktop/narrow layouts, and useful empty/error states.
- Verify browser console/network errors and keyboard operation.
- Do not treat mock generation as validation of live OpenAI generation or its cost accounting.

Keep a matrix of actual source files, expected chapter boundaries, observed results, and known deficiencies. Include clean EPUB, text PDF, scanned PDF, TXT, and a difficult layout. Synthetic files can validate mechanics but cannot replace real representative books.

## 6. Retain the evidence

Keep the backup, verification reports, deployment inventory, and original exports together in private storage with an off-server copy. Store only sanitized findings and synthetic fixtures/screenshots in Git. Document unresolved issues and who will supply missing production evidence.

Do not approve production migration until a populated production snapshot has been restored successfully and the external authentication boundary has been checked.
