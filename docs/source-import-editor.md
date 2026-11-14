# Source import and chapter-boundary editor

Initial release: 2026-11-08; compact reader update: 2026-11-14; split-management update: 2026-11-15. Branch: `modernization/postgres-auth`.

This release implements the source-navigation and safe chapter-splitting milestone. It requires PostgreSQL migration **0006**. Migration 0006 is deployed on Ubuntu staging. The latest preparation/spread UI update still needs deployment and acceptance there.

## Teacher workflow

1. Upload a PDF, EPUB or TXT in **Text → Source** (or **Text → Prepare text → Source** when chapters already exist). The modern interface starts extraction automatically, then opens **Split text**. If extraction fails, the uploaded file remains available; use **Extract Text** to retry.
2. Browse the entire source. PDFs open as rendered original pages; switch to **Text** to position the cursor. Page navigation stays below the document while its contents scroll. On phones, use **Chapters** to open the outline and **Back to source** to return. Choosing a chapter location also returns to the text automatically. EPUB sections follow the book's spine order, rather than pretending to have fixed printed pages. TXT has one section. **Find** searches extracted text throughout the document.
3. In the chapter outline, choose **Suggest starts** to use PDF bookmarks or EPUB contents links when available, with chapter-heading detection as a fallback. Suggestions are editable and are never applied automatically. Contents, part headings and appendices may also appear in a publisher's outline: check the results.
4. On any readable PDF page, choose **Start**. In **Text** view, **Start** uses the text cursor instead: click before the first character of the new chapter. For a whole-page start in Text view, place the cursor before its first character. Several chapters may start on the same page. Rename entries in the outline; open the chapter’s **…** actions for **Move start here** or **Remove**. Each entry occupies one compact row while its actions are closed. Chapters follow source order.
5. Each chapter ends at the next chapter start. For the last chapter, choose **End** in the reader controls: in PDF view it includes the current page and excludes all later pages; in Text view it excludes text after the cursor. This is useful for an epilogue or next-book preview, including one that begins midway through a page. Text before the first start is also omitted. The **Reading end** entry in the outline lets you revisit or clear the cutoff. These boundaries do not alter the retained source file.
6. **Preview chapters** shows word counts and the opening/closing text. A short-chapter indicator helps find accidental boundaries. Duplicate, reversed, out-of-range or empty boundaries prevent applying the plan.
7. **Save** persists this account's draft in PostgreSQL. Unsaved drafts block in-app navigation and warn before leaving the browser page. **Discard**, beside Save, returns to the last saved draft. Concurrent changes from another window are rejected instead of silently overwriting them; reload that window to get the latest saved draft.
8. **Use these chapters** creates a new chapter layout for this book. Previous chapters, edits, guide versions and items are retained. The new layout initially has no selected guide. Generate a new version when ready, or select an older guide version to return to its original chapter layout.

If a file has multiple extractions, or a book has multiple sources, the **Source text** selector chooses which draft to edit. Only one editor is open at a time. Save or discard changes before switching it. Applying a source's plan selects that plan as the book's complete chapter layout; it does not append it to another source's chapters.

### Physical and printed PDF pages

**PDF page** always means the physical position in the file, starting at 1. The original-page viewer also displays embedded PDF page labels when available. It remembers labels for viewed pages when switching to extracted text.

Use **Page numbers → Add numbering range** when the publisher's printed numbering differs. For example, PDF pages 9–200 with printed start 1 make physical PDF page 14 display printed page 6. Multiple non-overlapping numeric ranges are supported and saved with the draft. Embedded Roman labels can be displayed; manually configured ranges currently support positive Arabic numbers only. Numbering does not change chapter boundaries or source content.

### Scanned or difficult files

Blank pages are retained in new PDF extractions so physical numbering remains stable. Existing extractions with omitted blank pages still use their stored physical page numbers. Original PDF pages can be viewed even when no text was extracted. Scanned text needs OCR before it can be split or sent to generation; upload an OCR-processed copy for now.

PDF rendering uses the existing PyMuPDF dependency. It renders a single requested page on the server and requires an active account and book access. It does not publish the uploaded file as a public URL.

Older PDF extractions can obtain bookmark suggestions from the original-page viewer without re-extracting. Older EPUB extractions lack the new contents-link metadata; re-extract to obtain it. The older extraction and its drafts remain available in the selector.

## Data preservation and generation

Migration `0006_source_layouts.sql` adds nullable layout identifiers to books, chapters and generation runs. Existing rows remain in the original `NULL` layout. Chapter-number uniqueness is enforced within each layout, allowing older layouts to retain their original chapter numbers.

- Drafts are stored per user in parsed-document metadata, with a version and a SHA-256 fingerprint of the source pages. Shared applied-layout history is stored there too. General parsed-document summaries omit private drafts and layout history.
- Applying a plan locks the book and parsed document, validates its text positions, inserts a new set of chapter IDs and switches the active layout in one transaction. Existing chapters and their immutable revisions are not deleted.
- **Saved chapter splits** can restore an earlier chapter arrangement, including the original chapters. Restoring a layout clears the guide selection; choose the matching guide in the guide-version selector when needed.
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

## 2026-11-14 compact reader update

The split page uses the available workspace width and height, omits the repeated book heading, and keeps only the file/draft controls above the reader. The chapter outline scrolls separately on desktop. Phones show either the source or the chapter outline, retaining the current page and draft when switching. PDF/text switching and zoom stay next to the reader, while page navigation and **Start** remain visible below it. **Whole page** zoom fits the complete PDF page; **Fit width**, 125%, 150% and 200% support closer reading. Changing pages resets the PDF scroll position.

Search, printed numbering and reading-range help are in a keyboard-accessible **Tools** dialog. Draft reset is now directly beside Save (see the follow-up below). Escape closes it; choosing a search result returns to the source and selects the matching text. A short message identifies a page without selectable text, with the longer OCR explanation in Tools. A cover alone does not establish that the whole book needs OCR.

For installations already on migration 0006, this is a UI-only update: use the normal staging pull/build/restart procedure while generation is idle. No additional migration, dependency or environment change is needed. The initial deployment commands above still apply to installations that have not yet deployed 0006.

Validation for this UI update: production web/worker build and source-boundary tests passed. Chromium checks passed at widths 320, 375, 390, 800, 1366 and 1536 pixels, including document-area and page-control visibility, no outer workspace scrolling, blank covers, zoom/scroll reset, mobile outline return, search selection, Escape focus restoration, dark/Korean layouts and touch navigation. The same run verified saved/conflicting drafts, layout restoration and older-version PDF/Word exports using disposable fixtures. Actual phone-browser acceptance on Ubuntu remains pending deployment.

### Compact chapter rows, direct Discard and visible End

Chapter number, source-page link, editable title and an actions button now share one row. Move/remove controls appear only when that row’s actions are opened. **Discard** appears beside **Save** when the draft is dirty and restores the last saved draft, including its end marker. Removing chapter markers is an edit, not a draft reset.

**Start** and **End** are both visible beside the page navigation. PDF End includes the current physical page; Text End uses the cursor position as an exclusive cutoff. The outline describes the cutoff as after, before or within a page. The existing validation rejects an end before the final chapter start. This uses the existing saved `plan.end` field and requires no new migration. It defines a final reading cutoff; intermediate chapter endings still follow the next start.

A one-off `curl: (7)` during the deployment readiness command can precede success because systemd reports the process started before its HTTP listener is ready. The command retries connection refusal. If the later public checker reports `PUBLIC GOOGLE ACCESS CHECK PASSED`, that readiness retry recovered; do not rerun migration for this message. Persistent failures or a failing final checker require investigation.

Follow-up validation: production build and browser tests passed for compact row height, direct Discard after removing a chapter, restored end markers, PDF-page and within-page cutoffs, exclusion of later text in the resulting chapters, and a dirty draft on a 320-pixel phone layout. Existing draft conflict, layout restoration, export, search, touch and dark/Korean checks also passed. No paid generation was used.


## 2026-11-14 preparation navigation and two-page reader

**Text** opens the chapter reader when chapters exist. **Prepare text** opens a separate workflow with **Source → Split chapters** steps. Before chapters exist, Text opens Source directly. An extracted source has a **Split chapters** action; extraction after a new upload still opens the splitter automatically. **Read chapters** returns to the current reader, and applying a layout also returns there. The mixed Text tools menu has been removed.

To correct a split, use **Prepare text → Split chapters** on the same book. The editor prefers the source extraction used by the current chapters. If your saved personal draft differs from the active layout, **Load current boundaries** explicitly copies that layout into the editor. This does not change the current chapters until **Use these chapters** is chosen. Save persists the draft; Discard returns to the last saved draft. Earlier legacy chapters without recorded boundary markers cannot be reconstructed exactly: mark a new plan from the retained source instead. Neither path requires a new book or re-upload, and earlier guides remain available with their original layouts.

On desktop widths of at least 1100 pixels, **Page layout** offers:

- **Single page** (initial setting).
- **Two pages (1–2)**: physical pages 1–2, 3–4, and so on.
- **Facing pages (2–3)**: page 1 alone, then 2–3, 4–5, and so on. A final unpaired page is shown alone.

The layout applies to both PDF and extracted text. Pairing uses physical source positions, not printed-page labels. Click a PDF page or place the cursor in either text pane to select it; the outline and page input identify the selected page. **Start** and **End** use that page/cursor. Arrows move by the displayed spread; entering a page number jumps to its containing spread. Whole page fits both PDF pages within the viewer. On smaller screens the reader automatically shows one page, preserving the desktop selection when enlarged again. EPUB pairs refer to extracted spine sections rather than print pagination; TXT remains a single section.

PDF previews use a private in-memory cache of up to eight rendered pages. The visible page(s) load first, followed by the next and previous page/spread with one speculative request at a time. Navigation cancels obsolete fetches; speculative errors do not interrupt reading. A failed visible preview remains an error for that page and can be retried by navigating away and back. The cache is cleared when leaving the PDF view/source editor; it is not an offline download. All requests still pass the existing source authorization checks. Already-loaded extracted text needs no extra page requests. Very large books still load all extracted text at editor startup; this update does not change that limitation.

This update requires no migration, dependency or environment changes beyond the already-deployed 0006 baseline. Deploy with generation idle using the standard staging build/restart procedure. Local validation includes production web/worker build, spread/boundary tests, and Chromium checks for source selection, active-layout versus personal-draft loading, PDF and text spreads, cache reuse, render-error recovery, mobile fallback, draft conflicts and retained exports. Check your actual PDF's pairing and mobile browser after deployment.


## 2026-11-15 saved chapter splits, focused controls and keyboard navigation

The visible term **saved chapter splits** replaces **layouts**. These records keep a particular set of chapter boundaries and the corresponding chapter text. **Save** updates your personal draft; **Use these chapters** creates and activates a saved split. The database still uses `layout_id`; no migration or identifier conversion is required.

Open **Saved chapter splits** in the chapter outline, choose an entry, and use **Use saved split** or **Delete split**. The active entry is marked **Current**. Delete requires confirmation and is available only after saving or discarding pending edits. It removes the selected split's chapters and their text-edit history; it retains the source extraction, source file and personal saved drafts. It does not merely hide the entry. A retained draft can be used to create a new split later.

The current split cannot be deleted: activate another saved split first. A split referenced by any guide or generation record cannot be deleted, including legacy guides without an assigned generation run and item-level chapter/revision references. The interface explains these protections; the server checks them again in the deletion transaction. Queued/running generation also prevents deleting splits. Deletion uses the same book lock as split application and run creation, locks the affected chapter rows, and checks the document belongs to the authorized book. This release does not provide cascading deletion of guides from the split editor.

The generic Tools / Source tools dialog has been removed:

- **Find** opens a search-only dialog. Type text and choose a result to jump to its source page and cursor position.
- **Page numbers**, beside PDF/Text, opens the printed-numbering form directly. When a printed label exists, this button displays **Printed: …**. The form explains physical PDF positions with an example; changing labels does not change boundaries. **Done** closes the form; use **Save** to persist the draft changes.
- **Start** and **End** remain beside page navigation. Within-page positions use the Text view's cursor.

**Left Arrow / Right Arrow** move to the previous/next page, or spread when two-page viewing is enabled. The arrow buttons expose the shortcut in their tooltips. Shortcuts operate while focus is in the visible source editor or on the page background. They do not override inputs, textareas, dropdowns, editable fields, modified shortcuts, IME composition, open dialogs or controls outside the editor. Thus normal cursor movement in extracted text remains available. On phones, the chapter-outline panel does not navigate the hidden source by arrow key.

Validation passed: production web/worker build and the disposable PostgreSQL/Chromium regression, covering accepted and blocked deletions, cancellation, cross-book rejection, saved-draft preservation, chapter removal, retained exports, named dialogs, arrow navigation and desktop/mobile layout. No paid model calls were made. Deploy with generation idle using the normal staging build/restart procedure; no migration, dependency or environment changes are needed. Actual Ubuntu acceptance remains pending.
