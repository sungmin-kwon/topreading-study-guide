# Architecture Notes

## Rebuild Principles

- Keep the old prototype intact until v2 covers its core workflows.
- Model uploaded source files explicitly instead of treating PDFs as temporary input.
- Store structured study-guide records, plus raw JSON snapshots for reproducibility.
- Keep OpenAI prompts and output schemas in the shared core package.
- Keep UI state local and predictable; avoid another large unstructured single-file app.

## Proposed Workspace

```text
apps/
  web/        Next.js UI, API routes, and local SQLite data access
packages/
  core/       shared domain types, schemas, prompt builders
data/
  uploads/   local source file storage
  exports/   local generated files
docs/
```

## Legacy Reference

Useful old files:

- `src/db/database.js`: existing SQLite tables and migration history
- `src/services/questionGenerator.js`: current OpenAI prompt and normalization behavior
- `src/services/questionSetService.js`: generation run lifecycle
- `src/services/chapterToolsService.js`: PDF extraction and chapter splitting flow
- `src/services/exportService.js`: export behavior
- `public/app.js`: current workflow inventory, but not a structure to preserve

## Current V2 Choice

The app is currently a single Next.js app using Drizzle + SQLite:

- Drizzle schema lives in `apps/web/src/lib/db/schema.ts`.
- Local SQLite connection lives in `apps/web/src/lib/db/client.ts`.
- API routes should stay thin and call small server-side library modules.
- When Postgres becomes necessary, keep the product model and route contracts stable, then swap the Drizzle dialect/schema details.

## Study Guide Model

Generated study material is grouped by `study_sets`. A whole-book or selected-chapter generation run creates a run-level study set. The generated vocabulary, multiple-choice questions, and short-answer questions belong to that study set, while each generated item can also carry its own `chapter_id`.

This keeps generation history and review state explicit:

- `generation_runs` stores run status, configuration, progress, logs, and timing.
- `study_sets` stores book/run linkage, status, generator/model details, prompt version, settings JSON, and optional raw output JSON.
- `vocabulary_items` stores reviewable vocabulary rows for a study set.
- `multiple_choice_questions` stores reviewable MCQs, with choices serialized as JSON.
- `short_answer_questions` stores reviewable short-answer prompts and suggested answers.

Whole-book export uses the active generation run for a book, then gathers the generated items from the run-level study set in chapter/sort order.

The UI separates this model into three surfaces:

- Generate shows execution state, terminal-style logs, cancellation, and generation history.
- Sets manages user-facing generated versions: rename, delete, and mark active.
- Review loads the active version's items by chapter for manual editing and reordering.

## User Accounts And Authorization

Cloudflare Access remains the preferred authentication layer for private deployment. The app reads the authenticated email from Cloudflare/proxy headers, then applies app-level authorization through the `users` table.

- `AUTH_ALLOWED_EMAILS` is the outer Cloudflare/proxy allowlist.
- `APP_ADMIN_EMAILS` bootstraps app-level admin users.
- `AUTH_AUTO_CREATE_USERS=false` makes unknown authenticated emails fail app authorization until an admin adds them.
- Normal app APIs under `/api/books/**` require an active app user.
- Admin APIs require an active admin user.

This gives the private app a second authorization layer without implementing passwords, sessions, or account recovery.

## Generation Planning

Default generation totals are calculated at the book level from total word count, then allocated across included chapters by word-count weight. The user can adjust whole-book targets for multiple-choice, short-answer, and vocabulary items before generation, then fine-tune individual chapter counts in the same modal.

The shared count and allocation helpers live in `packages/core`.
