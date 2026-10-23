# UI behavior implementation and MCQ quality workflow

Implemented 2026-10-23 on the modernization branch. The new UI remains at `/prototype`; the existing application remains at `/` and uses SQLite.

## Editing behavior

The prototype now saves books, pending question drafts, checkpoints, language, theme, and current position in browser local storage. It shows Saving / Saved on this device / Could not save, with Retry. Pending writes install a browser leave warning. A failed initial read or corrupt saved document blocks editing and automatic overwrites, with recovery download, retry and explicit preview reset. Browser storage is device/browser specific, has quotas, and is not a production backup or server synchronization. Concurrent editing across tabs is not supported yet.

Drafts are keyed by book/chapter/guide/content type, so navigation and reload do not discard them. Save applies the draft to the guide; Cancel removes that draft. Book, task, chapter, guide and content type are reflected in the URL and restored on reload. Named content only exists on the device that saved it; this is not cross-device sharing.

Split and merge make a checkpoint and offer immediate Undo. Undo is cleared by a later content mutation so it cannot erase subsequent edits. Save checkpoint provides an explicit snapshot before other text changes. Revision history retains the latest eight snapshots and restores into a **separate book**, preserving newer content and manual guide edits. These are prototype snapshots, not the production PostgreSQL revision store.

Sample generation has queued/generating/failed/cancelled states, cancellation, a failure simulation, and retry. A completed attempt adds one new guide version. Existing versions remain intact. Each new guide records its source text; review warnings compare that guide's snapshot with the current chapter rather than using a permanent edited flag. Sample generation makes no AI calls. Production queue execution, partial retries, cross-device saving, conflict handling, and server-backed chapter revisions belong to the PostgreSQL/worker integration.

Export distinguishes Student handout, Teacher copy with answers, and Answer key only. The key omits distractors; the handout omits answer highlights and suggested short answers. Printing always uses a light document even in dark mode. DOCX remains available through the current application; the prototype still uses browser PDF printing.

English/Korean controls, dark mode, visible keyboard focus, heading focus after context changes, and larger touch targets are implemented. Reading content remains in its original language. Some contextual sample metadata and dynamically generated notices still use English; native-speaker review of the Korean interface remains desirable.

## Audit of the supplied backup

The read-only audit examined 2,422 stored MCQs, all in the active guides in this snapshot:

| Metric | Result |
| --- | ---: |
| Correct answers A / B / C / D | 609 / 605 / 605 / 603 |
| Longest-option strategy, fractional credit for ties | 72.76% |
| Random guessing baseline | 25% |
| Mean per-question correct/distractor word-count ratio | 1.47 |
| Flagged questions (distinct) | 373 |
| Correct answer >1.5× longest distractor AND ≥5 words longer | 364 |
| Correct answer ≥8 words with a distractor ≤2 words | 14 |

Flags overlap. These descriptive metrics confirm a strong length cue despite balanced positions. They do not measure semantic correctness or establish a confidence interval; questions are clustered by chapter/book. The heuristics do not capture every giveaway.

Run against a backup or snapshot:

```sh
python scripts/audit-mcq.py --database /path/to/topreading.sqlite --report /path/to/mcq-audit.json
```

The default report contains IDs, lengths and flags. Add `--include-content` only for a private local report with question text. Reports are created exclusively, never overwritten. The audit opens SQLite read-only, makes no model calls, and selects deterministic samples of up to 20 flagged and 20 unflagged questions for human review. The production content report is kept under ignored `backups/`; no book text or account data is committed. No existing question was repaired or overwritten during this task.

## New MCQ generation

Both whole-book and single-chapter OpenAI generation use the same pipeline:

1. Require one passage-supported answer, plausible wrong distractors, parallel grammar, comparable detail, and explanations referring to choice content rather than letters. Reject malformed choices/indices instead of inventing placeholder answers.
2. Check duplicate choices, correct-answer length, very short distractors, and answer-letter references.
3. Blind-review every flagged item and the first of each ten otherwise unflagged questions, subject to the per-chapter call budget. Temporarily permute the options; the reviewer receives only the passage, question and choices. It gets no answer key, original explanation, or flags revealing the intended answer.
4. Compare its chosen answer with the intended answer, inspect ambiguity/wording cues, and verify that a short evidence quote actually occurs in the passage. A matching answer is not proof of correctness. Record each verdict with the choice order it reviewed.
5. Allow at most two repairs per question, each followed by a new blind review. Invalid repairs, review errors, exhausted budgets, disagreement, or remaining flags become `needs_review`. A passing item remains `draft`, not automatically human-approved.
6. Shuffle once before persistence, preserving the answer text and correct index. Randomized blocks balance positions without always assigning short batches to A. Distractor order is shuffled too. Unresolved letter-dependent questions retain their order until repaired, avoiding incorrect explanations. The whole-book completion path no longer reshuffles saved items.

`MCQ_REVIEW_MAX_CALLS` controls the per-chapter review/repair request budget (default 12, clamped to 0–40). Each quality call has a 60-second timeout and no automatic HTTP retry. It uses the generation model so usage/cost accounting remains consistent; review and repair tokens are included in the run total. Quality calls add time and cost to future generation. Provider failures can still incur usage that the provider does not return; reported usage cannot account for an unknown response.

The existing Review UI displays a Needs review notice. In Edit, the teacher can explicitly check that they verified the answer and distractors against the passage, then Save to mark it reviewed. Review records and pre/post repair material are stored in the new guide's raw-output metadata. Existing guides are only audited. Saved generation versions cannot be rerun destructively; failed whole-book attempts retain partial results. Until the worker supports resumable chapter tasks, generating again for a version that already has results requires a new version rather than replacing its contents.

## Validation

- Production build and TypeScript checks.
- Browser checks for draft persistence, task/book navigation, storage failure/retry, split Undo, restoration without overwriting, failure/cancel/retry, guide-specific source warnings, answer-only printing, and Korean dark mobile layout.
- Five synthetic Python audit tests for ties, variable choice counts, invalid records, thresholds, active-guide filtering and unchanged source database.
- Thirteen Node tests for nested preview validation, saved-version protection, partial-result retention, blind payloads, capped repairs, fresh review after repair, missing service, budget exhaustion, fabricated evidence, answer-preserving shuffle, letter-reference protection, and actual generator orchestration with a mocked Responses API and usage aggregation.

```sh
node scripts/test-mcq-quality.cjs
python -m unittest discover -s scripts -p 'test_audit_mcq.py' -v
```

No paid model calls were made for these tests. Whether the new prompt/reviewer improves real question quality must be measured on a representative generation sample and checked by a teacher before treating these thresholds as calibrated.

For repeatable browser checks, install Playwright in a separate tooling environment, start the isolated preview at `http://127.0.0.1:3188/prototype`, and run `scripts/test-prototype-behaviors.cjs`. It accepts `PLAYWRIGHT_MODULE`, `CHROMIUM_EXECUTABLE`, and `PROTOTYPE_URL` overrides; evidence is written under ignored `backups/ui-behavior-checks/`. Use a disposable browser context and preview data, never a production editing session.
