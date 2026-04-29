# Future Work

These are useful ideas from the legacy implementation and newer polish passes that are worth considering later.

## Recently Completed

These items used to be future work, but have now landed in the app.

### Run-Level Study Sets

Study sets are no longer treated as strictly chapter-level objects. A generation run now creates one study set for the whole run, while generated vocabulary, multiple-choice questions, and short-answer questions carry their own `chapter_id`.

This makes whole-book or selected-chapter-range runs easier to rename, delete, export, and review without managing dozens of chapter-level sets.

### Cancelable Generation

Whole-book generation runs now support cancellation from the Generate tab.

Current behavior:

- A running generation can be marked `cancelled` from the UI.
- The server-side generation loop checks for cancellation between chapters and after a chapter finishes.
- The current in-flight OpenAI request may finish before cancellation takes effect.
- Completed chapter outputs are preserved as partial results.
- The terminal log records the cancellation request and final cancelled state.

Future refinement: if generation moves to a background worker, cancellation could become more immediate by wiring an abort signal into the worker/request lifecycle.

## Import Folder / Append Chapter Files

The legacy app could import a folder of `.txt` chapter files and append chapters to an existing book.

Potential use cases:

- Project Gutenberg or public-domain books already cleaned into chapter files.
- Teacher-curated chapter text stored outside the app.
- Recovery path when PDF/EPUB parsing is poor but manual text files are available.

Implementation notes:

- Browser folder upload could accept multiple `.txt` files.
- Chapter number/title can be inferred from filenames, then manually corrected.
- Append behavior should detect chapter-number conflicts and ask before replacing or renumbering.

## Replace Chapter File

The legacy app allowed replacing one chapter's text from a local `.txt` file.

This would complement the current chapter editor:

- Keep manual text editing for small fixes.
- Use file replacement for large corrections.
- Recalculate word count and generation suggestions after replacement.
- Warn if replacing text for a chapter that already has generated study sets.

## LLM-Assisted Chapter Splitting

The current splitter is deterministic, with manual page-marker fallback. Some books still need better chapter-boundary detection.

The legacy app had a two-pass LLM approach:

- Build text units from paragraphs.
- Ask the model for likely chapter-start candidates.
- Ask the model to finalize a clean ordered chapter list from those candidates.

This should remain a fallback, not the default, because it costs tokens and can introduce false positives. A good workflow would be:

- Try deterministic splitting first.
- Show preview diagnostics.
- Offer "LLM-assisted split" only when headings/page markers are inconvenient.
- Require preview/confirmation before writing chapters.

## Generation Run Operations

The current app now has persisted generation runs, active-run selection, and server-side execution. Longer term, run management could become more complete:

- Add status filters for completed, failed, cancelled, and archived runs.
- Show structured usage/cost summary outside the terminal log.
- Move generation execution to a background worker or queue for deployment.
- Add a cleaner partial-results indicator for cancelled runs.

## Drag-And-Drop Study Item Reordering

Generated and manually added study items now support review, edit, delete, manual creation, and arrow-based reordering. A drag-and-drop interface would be a more intuitive refinement later.

Possible shape:

- Add drag handles to vocabulary, multiple-choice, and short-answer cards.
- Reuse the existing `sort_order` values instead of changing the schema.
- Add a batch reorder API if drag-and-drop moves items across several positions at once.
- Keep export order tied to `sort_order` so classroom handouts match the review UI.

This should not require a major database redesign because the item tables already have `sort_order`.

## Global Generation Sliders

The current generation planner suggests item counts per chapter and allows per-chapter adjustment. A future book-level control could let users choose a total number of MCQs, short-answer questions, and vocabulary items for the whole book.

Implementation notes:

- Keep the allocation logic in a shared helper under `packages/core`.
- Distribute totals by chapter word count with minimums/maximums.
- Preserve manual chapter overrides after the global slider changes.
- Show the final whole-book totals before generation begins.

## User And Admin Hardening

The current admin page is a first-pass private deployment tool. It works well enough for a home server, but a more complete user system would need:

- Clear separation between Cloudflare Access authentication and app-level authorization.
- Per-user ownership/audit fields on books, generation runs, and edits.
- A stronger disabled-user path that blocks normal app actions, not just admin access.
- Safer admin settings editing, including restart-required indicators.
- Optional activity log for user changes and `.env.local` changes.

Cloudflare Access should remain the preferred login layer for the near term.

## Cost And Rate Controls

Current guardrails are coarse per-run limits. More complete controls could include:

- Per-user or per-day generation limits.
- Estimated cost preview before generation starts.
- Persisted token/cost summaries in generation run metadata.
- Warnings when a run is unusually large.
- Admin-configurable model presets.

## Study Set Version Tools

Run-level study sets make versioning much cleaner, but the review UI could still grow a few workflow tools:

- Duplicate a study set before heavy manual editing.
- Compare two generation runs for the same book or chapter range.
- Archive older runs without deleting them.
- Add notes to a run or study set explaining why it was kept or rejected.
- Show which chapters are covered by a run-level study set.
