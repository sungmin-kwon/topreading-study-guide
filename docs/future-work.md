# Future Work

These are useful ideas from the legacy implementation that are worth considering later, but are intentionally out of scope for the current polish pass.

## Cancelable Generation

Long whole-book generation runs should eventually support cancellation from the UI.

Possible shape:

- Add a `cancel_requested` flag to `generation_runs`.
- Add a cancel button while a run is `generating`.
- Have the server-side generation loop check the flag between chapters.
- Mark cancelled runs as `cancelled` while preserving completed chapter outputs and logs.

This is most useful once generation is moved to a true background job or deployment environment where long requests may be fragile.

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

- Rename generation runs from the history panel.
- Add status filters for completed, failed, cancelled, and archived runs.
- Show structured usage/cost summary outside the terminal log.
- Move generation execution to a background worker or queue for deployment.
