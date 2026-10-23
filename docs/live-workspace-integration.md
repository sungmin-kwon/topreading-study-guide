# Saved-book workspace integration

Implemented 2026-10-23, following the [prototype behavior and MCQ work](ui-behaviors-and-mcq-quality.md).

## What changes after deployment

The main application at `/` now applies the approved editorial layout to the **existing SQLite library and APIs**. No database conversion, content rewrite, authentication change, or environment-variable change is required.

- Header book switcher and separate searchable, sortable, pinnable Library view.
- Three primary destinations: Text, Study guides, Export. Text contains chapter editing, source import and boundary tools; Study guides contains review, versions and generation.
- One chapter outline on desktop; a compact chapter picker on mobile.
- Saved guide selection, source passage alongside review, quieter document-style question cards, and generation metadata in version management.
- Existing source upload/extraction, chapter preparation, generation controls, question editing, and PDF/DOCX exporters remain connected to their real endpoints.
- English/Korean controls, dark mode, visible focus and properly grouped MCQ answer-choice fields.
- Book/chapter/destination IDs are reflected in the URL for reloads. Switching books remembers the chapter and destination during the current session.

`/prototype` remains an isolated sample-data design playground. `/legacy` temporarily provides the earlier interface against the same live database as `/`—it is **not** a backup or a separate data copy.

## UI subtraction pass

The saved-book workspace now removes the permanent save-instruction strip, secondary navigation rows, repeated chapter headings, library introductions and missing-author placeholders. Save errors remain visible, with unsaved/saving feedback beside the relevant Save action.

- Text import and chapter boundaries are under **Text tools**. The chapter title is an editable heading; numbering, deletion and Clear All Chapters are under **Chapter settings**.
- **Manage versions** and generation sit beside the guide selector. Version metadata and alternate chapter sets are in management. Question cards show Edit and a keyboard-accessible More disclosure for reorder/delete; Add sits beside content tabs.
- Export uses version, chapter scope, content and format selectors with one Export button. All eight existing content types and both PDF/Word formats remain available for a whole book or one chapter.
- The header uses an avatar menu for preferences. Library has a correctly sized New book button and quieter book links.
- The sample prototype also drops its idle save strip, redundant library introduction, export helper text and duplicate answer toggle. Copy type controls answer inclusion; save failures still offer Retry.

Verification covers keyboard disclosure/Escape behavior, relocated import tools, and both full-book and single-chapter PDF/Word downloads, in addition to the existing save/recovery checks. This pass makes no database or authentication changes.

## Saving and recovery boundaries

Live chapter and question changes are saved to the server with explicit Save actions. Pending edits remain in memory when navigating between chapters, content tabs and books. Closing/reloading a page with unsaved work raises the browser's leave warning. **Unsaved live drafts are not durable across a confirmed reload, browser crash or another device.** The prototype's local-storage persistence is not used for real book contents.

Save failures keep the edited fields, clear the busy state and explain how to retry. Cancel discards an item's draft. Loading a book has an explicit loading/error boundary; failed guide loads can be retried. Stale guide responses from an earlier book/version are ignored. Creating a new item or performing generation has additional navigation guards to avoid losing its context. After an ambiguous failure while creating a new item, check whether it was saved before retrying; idempotency keys are future work.

The preview's revision history, split/merge undo, per-version source fingerprints, simulated jobs and print preview are **not** represented as production features here. Production still uses its existing boundary-review tools and PDF/DOCX exports. Durable revisions and optimistic concurrency, server-backed draft recovery, the final combined export-preview screen, PostgreSQL/authentication and worker jobs remain subsequent integrations. Generation still runs through the existing HTTP execution path; the worker/restart-recovery milestone has not been completed.

## Dependency maintenance

The deployment log's 17 findings were investigated rather than applying `npm audit fix --force`.

- Next.js and matching ESLint configuration updated to 15.5.28, resolving the reported critical framework advisories.
- Drizzle ORM updated to 0.45.4; Drizzle Kit to 0.31.11.
- Compatible transitive updates include source-map-js, nanoid, js-yaml and brace-expansion.
- Root overrides select patched PostCSS 8.5.31 and Next's Sharp 0.35.5 dependency. Retain these overrides until a subsequent framework version uses patched dependencies itself. Verify them when updating the framework.
- `npm audit --omit=dev`: **0 known vulnerabilities** at verification time. This is an advisory check, not a claim that the application or authentication boundary is fully secure.
- Full audit: **9 development-tool findings** (5 high, 4 moderate), in the ESLint/fast-glob/micromatch/braces and Drizzle Kit/esbuild dependency chains. The registry had no patched braces release. npm proposed unrelated major downgrades for the toolchains; these were not applied. Revisit these chains before enabling their development servers or processing untrusted repository/build input.

Use Node 22 and the declared npm 10.9.2 toolchain. npm 11 initially retained the vulnerable PostCSS lockfile resolution despite the override; resolving with npm 10 and checking a clean `npm ci` verifies the committed resolution.

## Verification

Browser checks use an **isolated writable copy** of the verified production backup and a local-only server. No live server/database or paid model request is used. Real-content screenshots and exports stay under ignored `backups/live-ui-check/`; no private book contents or account data are committed.

The browser regression script discovers a saved book/chapter with MCQs, verifies source passage content, editing/navigation, injected network failures, successful saves after retry, reload persistence, unchanged choices/correct index, Cancel, selected version, PDF/DOCX downloads, and Korean/dark mobile layout. It creates an empty failed guide version without executing it and restores edited contents in `finally`. It still changes timestamps: **only use a disposable test database**.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright \
CHROMIUM_EXECUTABLE=/usr/bin/chromium \
LIVE_UI_TEST_URL=http://127.0.0.1:3190 \
ALLOW_TEST_WRITES=1 \
node scripts/test-live-workspace.cjs

# Same environment variables and disposable server:
node scripts/test-live-import.cjs

node scripts/test-mcq-quality.cjs
.topreading/bin/python -m unittest discover -s scripts -p 'test_*.py'
npm run typecheck
npm run build
npm audit --omit=dev
```

The import browser check creates a temporary book, uploads a synthetic TXT file, extracts it, previews headings, saves two chapters, verifies reload and empty-guide/export states, then deletes the temporary book. It makes no AI calls.

The Python migration integration tests require a disposable PostgreSQL database via `MIGRATION_TEST_DATABASE_URL`; they are skipped when it is absent. This UI change does not rerun or alter the PostgreSQL migration.

## Deployment and acceptance

Use the normal fetch / fast-forward pull / install / build / restart procedure on `modernization/prototype-and-postgres`. Keep the existing SQLite configuration and Python executable. The normal procedure pauses the service while building; if a step fails, diagnose that failure before restarting.

After deployment, visit `/` (not `/prototype`) and check one existing book: open a chapter, inspect its source passage, edit/save a question, reload, switch a guide version, and export an answer key. Test edits on a disposable question or restore the original afterward. The `/legacy` fallback uses the same saved data if a navigation issue prevents completing a task.
