# Source import and chapter-boundary editor

Release: 2026-11-08. Branch: `modernization/postgres-auth`.

This release implements the source-navigation and safe chapter-splitting milestone. It requires PostgreSQL migration **0006**. Local validation is complete; Ubuntu acceptance is still pending.

## Teacher workflow

1. Upload a PDF, EPUB or TXT in **Text → Text tools → Import sources**. The modern interface starts extraction automatically, then opens **Split text**. If extraction fails, the uploaded file remains available; use **Extract Text** to retry.
2. Browse the entire source. PDFs open as rendered original pages; switch to **Extracted text** to position the cursor. EPUB sections follow the book's spine order, rather than pretending to have fixed printed pages. TXT has one section. **Find in source** searches extracted text throughout the document.
3. Choose **Suggest starts** to use PDF bookmarks or EPUB contents links when available, with chapter-heading detection as a fallback. Suggestions are editable and are never applied automatically. Contents, part headings and appendices may also appear in a publisher's outline: check the results.
4. On any readable page, choose **Start chapter on this page**. For a boundary within a page, switch to extracted text, click before the first character of the new chapter, and choose **Start at cursor**. Several chapters may start on the same page. Rename entries in the outline; use **Move start here** or the remove button to correct boundaries. Chapters follow source order.
5. Text before the first start is omitted. To exclude back matter, place the cursor before it and choose **End reading at cursor**. This changes the chapter selection, not the retained source file.
6. **Preview chapters** shows word counts and the opening/closing text. A short-chapter indicator helps find accidental boundaries. Duplicate, reversed, out-of-range or empty boundaries prevent applying the plan.
7. **Save draft** persists this account's draft in PostgreSQL. Unsaved drafts block in-app navigation and warn before leaving the browser page. **Discard changes** returns to the last saved draft. Concurrent changes from another window are rejected instead of silently overwriting them; reload that window to get the latest saved draft.
8. **Use these chapters** creates a new chapter layout for this book. Previous chapters, edits, guide versions and items are retained. The new layout initially has no selected guide. Generate a new version when ready, or select an older guide version to return to its original chapter layout.

If a file has multiple extractions, or a book has multiple sources, the **Source text** selector chooses which draft to edit. Only one editor is open at a time. Save or discard changes before switching it. Applying a source's plan selects that plan as the book's complete chapter layout; it does not append it to another source's chapters.

### Physical and printed PDF pages

**PDF page** always means the physical position in the file, starting at 1. The original-page viewer also displays embedded PDF page labels when available. It remembers labels for viewed pages when switching to extracted text.

Use **Printed page numbering → Add numbering range** when the publisher's printed numbering differs. For example, PDF pages 9–200 with printed start 1 make physical PDF page 14 display printed page 6. Multiple non-overlapping numeric ranges are supported and saved with the draft. Embedded Roman labels can be displayed; manually configured ranges currently support positive Arabic numbers only. Numbering does not change chapter boundaries or source content.

### Scanned or difficult files

Blank pages are retained in new PDF extractions so physical numbering remains stable. Existing extractions with omitted blank pages still use their stored physical page numbers. Original PDF pages can be viewed even when no text was extracted. Scanned text needs OCR before it can be split or sent to generation; upload an OCR-processed copy for now.

PDF rendering uses the existing PyMuPDF dependency. It renders a single requested page on the server and requires an active account and book access. It does not publish the uploaded file as a public URL.

Older PDF extractions can obtain bookmark suggestions from the original-page viewer without re-extracting. Older EPUB extractions lack the new contents-link metadata; re-extract to obtain it. The older extraction and its drafts remain available in the selector.

## Data preservation and generation

Migration `0006_source_layouts.sql` adds nullable layout identifiers to books, chapters and generation runs. Existing rows remain in the original `NULL` layout. Chapter-number uniqueness is enforced within each layout, allowing older layouts to retain their original chapter numbers.

- Drafts are stored per user in parsed-document metadata, with a version and a SHA-256 fingerprint of the source pages. Shared applied-layout history is stored there too. General parsed-document summaries omit private drafts and layout history.
- Applying a plan locks the book and parsed document, validates its text positions, inserts a new set of chapter IDs and switches the active layout in one transaction. Existing chapters and their immutable revisions are not deleted.
- **Saved layouts** can restore an earlier chapter arrangement, including the original chapters. Restoring a layout clears the guide selection; choose the matching guide in the guide-version selector when needed.
- Generation runs record their layout. Creating a run rejects chapter IDs from another layout; enqueueing rejects a draft whose layout is no longer active. Queued/running generation blocks applying or restoring a chapter layout.
- Selecting an older guide restores its layout. Explicit exports of an older guide use that guide's layout, even if another layout is currently active.

These guarantees concern the new splitting workflow. Explicitly deleting a book, source or extracted text still invokes the existing destructive deletion behavior. Keep backups and retain source files needed by older guides. Saved layouts are not a replacement for backups.

## Deploy to Ubuntu staging

Wait until generation is idle. These commands target the separate staging checkout and services, not production SQLite.

First pull and back up:

```bash
cd /home/sungmin-kwon/topreading-staging
git pull --ff-only
python3 scripts/postgres-backup.py
```

Verify the backup using its printed absolute path:

```bash
python3 scripts/postgres-backup.py --verify /absolute/path/to/the/new/backup
```

Then migrate, build and restart:

```bash
(
  set -e
  cd /home/sungmin-kwon/topreading-staging
  sudo systemctl stop topreading-staging.service topreading-staging-worker.service
  python3 scripts/migrate-ubuntu-staging.py
  NODE_OPTIONS=--max-old-space-size=3072 nice -n 10 npm run build
  sudo systemctl start topreading-staging.service topreading-staging-worker.service
  curl --retry 20 --retry-delay 2 --retry-connrefused --retry-max-time 60 \
    --silent --show-error --fail --output /dev/null \
    http://127.0.0.1:3100/api/auth/providers
  python3 scripts/check-staging-google-access.py
  python3 scripts/check-staging-google-access.py --public
)
```

No `.env.local`, Google OAuth, Cloudflare or systemd unit changes are needed. No new application dependency is required. Both web and worker must be rebuilt because they share the database schema and generation logic.

If migration or build fails, the fail-fast block leaves the services stopped. Inspect that failure before proceeding; do not repeatedly reinstall services. After a successful migration but failed build, fix the build and restart the new version. Do not simply deploy pre-0006 application code after creating new layouts: it would read all retained chapter rows without the new layout filter. A full rollback requires the matching pre-release code and verified pre-release database/files snapshot, and would need to account for any subsequent edits. Prefer a forward fix and preserve a current backup first.

### Acceptance on the actual library

Use a temporary test book first:

- Upload a representative PDF with front matter; navigate beyond page 20 and compare its original page to the extracted text.
- Try an ebook with contents links; check suggested starts against its actual chapters.
- Save two chapter starts on one page, reload, and confirm the draft and printed numbering persist.
- Move/remove a boundary; inspect chapter previews and exclude an appendix.
- Apply a layout, then return to an earlier saved layout or guide and check its questions and PDF/Word export.
- Confirm generation still uses the intended current chapters. A paid full-book rerun is not required to test navigation or splitting.

Take and verify another backup after acceptance, and keep an off-server copy.

## Validation and remaining work

Local checks use synthetic sources and a disposable restored PostgreSQL library. Coverage includes exact within-page slicing, Unicode cursor positions, front/back matter exclusion, blank-page preservation, EPUB contents anchors, PDF page labels/bookmarks, draft persistence and conflicts, navigation guards, multiple extraction selection, layout restoration, retained guide exports, source ownership, stale generation rejection, and narrow-screen fit. The full application/worker build and existing MCQ/export regressions passed. Worker lifecycle tests use a fake provider, with no paid model calls.

This release does **not** add OCR, editable extraction cleanup, automatic header/footer removal, or background extraction jobs. Extraction is still request-bound, and the editor loads the extracted page text into the browser. Very large sources will need paged text loading and durable extraction/OCR work in the next milestone. PDF bookmarks identify page starts; precise within-page PDF starts are set manually. EPUB navigation fragments are resolved to within-section text positions.
