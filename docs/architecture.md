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

Start as a single Next.js app using Drizzle + SQLite:

- Drizzle schema lives in `apps/web/src/lib/db/schema.ts`.
- Local SQLite connection lives in `apps/web/src/lib/db/client.ts`.
- API routes should stay thin and call small server-side library modules.
- When Postgres becomes necessary, keep the product model and route contracts stable, then swap the Drizzle dialect/schema details.

## Study Guide Model

Generated study material is grouped by `study_sets`. In the first implementation a study set belongs to one edited chapter, and the generated vocabulary, multiple-choice questions, and short-answer questions belong to that study set.

This keeps generation history and review state explicit:

- `study_sets` stores the chapter, status, generator/model details, prompt version, settings JSON, and optional raw output JSON.
- `vocabulary_items` stores reviewable vocabulary rows for a study set.
- `multiple_choice_questions` stores reviewable MCQs, with choices serialized as JSON.
- `short_answer_questions` stores reviewable short-answer prompts and suggested answers.

Whole-book export can later gather the active/reviewed study sets for each chapter rather than treating generated items as loose rows.
