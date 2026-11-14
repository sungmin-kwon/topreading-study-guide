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

## 2026-11-06: generation content quality v3

New generations use `openai-study-guide-v3-content-quality` in both the standalone and background-worker paths. Existing guides are not regenerated or rewritten. MCQs, short answers, vocabulary and the summary are still generated together according to the existing requested counts; export selection remains separate. The chapter-count presentation and summary UI are outside this release.

Generation now uses the book's reading-level note when present, a secondary-school teacher audience without assuming a CEFR level, and passage-appropriate coverage across significant events/claims. Skill labels use six consistent categories. Instructions explicitly distinguish source facts, inference and author claims, reject later spoilers, and discourage redundant answer targets across formats.

MCQ instructions emphasize supported premises, plausible misconceptions, comparable option wording and explanations of every distractor. Blind review now requires a separate `stem_supported` verdict: a true correct choice cannot make an unsupported question premise pass. All/none-of-the-above choices receive a structural flag. Duplicate stems (case/punctuation normalized) are flagged across the final chapter MCQs, including duplicates introduced by repairs. These reasons appear in the existing English/Korean review display. Duplicate detection is lexical, not semantic; paraphrased duplicates still need editorial judgment. Review remains sampled/bounded under the existing `MCQ_REVIEW_MAX_CALLS` setting, and model agreement is not proof of correctness.

Short-answer instructions require an answerable task, requested evidence where appropriate, a concise model answer, task-specific criteria/point totals/partial credit and acceptable alternatives. Language mechanics are not scored unless explicitly part of the task. Vocabulary instructions select the actual contextual sense, preserve useful idioms/phrasal verbs, separate the sense from unrelated dictionary meanings, and require a faithful paraphrase of source context rather than an invented quotation. Korean glosses remain supported.

Before normalization, all three output lists must match the requested counts and have required nonblank content (including vocabulary context/definitions and written answers/rubrics). Missing content or over/under-counts stop that chapter instead of silently truncating output or manufacturing placeholder text. The worker's existing failure behavior preserves completed chapters; no automatic paid request replay was added. Existing cross-chapter vocabulary deduplication still runs after generation and can reduce the saved vocabulary count.

This improves generation instructions and completeness validation; it does not add independent semantic review of every vocabulary/short-answer item or prove classroom quality. No additional review stage or budget increase was introduced. Longer instructions/output can still change token usage.

Validation: 19 generation/quality regressions and three historical review-reason tests cover unsupported premises, incomplete verdicts, duplicate stems, collective options, missing required content, count mismatches, mixed-section output, usage accounting, repair budgets, shuffling and preservation of saved/completed work. All use synthetic responses; no paid requests or live library writes. Run a small new chapter version after deployment and compare teacher correction effort before considering a full-book regeneration.

## 2026-11-08: first-question review bias and export selection

Investigation: the old `index % 10 === 0` sampling rule always reviewed question 1, then 11, 21, etc., in addition to structurally flagged questions. There is no one-warning-per-chapter limit. For short chapters with otherwise clean structural checks, question 1 could be the only item receiving semantic review. The operator reported wording-cue and unsupported-evidence reasons. These establish actual recorded review flags, not that the warnings are false. We have not inspected the latest Ubuntu run's raw model verdicts.

New generations select the same approximately 10% routine sample by SHA-256 rank of chapter/question content, independent of list position; structural warnings still trigger review within the existing call budget. This is sampling, not exhaustive verification. Reordering does not change the selected content. Generation logs now report how many questions received valid model review, alongside structural coverage. A question without a flag is not certified correct.

Evidence verification normalizes Unicode NFC and whitespace before comparing a contiguous source excerpt. It still rejects changed wording, paraphrases and invented quotations. The reviewer schema caps evidence at 240 characters and instructions prohibit joining excerpts or adding quotation marks/ellipses. Historical flags are preserved; this release does not retroactively approve questions or issue paid re-reviews. Raw quality metadata records sampling version 2.

Export now offers independent Multiple choice, Short answers, Vocabulary and Chapter summaries checkboxes. Enabled sections expose their relevant layout: questions only, answers/explanations, vocabulary list/quiz, and concise MCQ key options. The MCQ questions-plus-key option places the concise key after the content, with matching numbering and unchanged saved choice order. Selected sections download as one PDF or DOCX, organized by chapter, with independent continuous numbering per item type. Empty sections are skipped; a wholly empty selection/result is rejected. Existing single-type API exports remain supported.

Selection and format are remembered per signed-in user in that browser, not synchronized between devices. No chapter/version IDs are remembered as export preferences. Download failures appear in the form without navigating away or discarding choices. Authentication and resource-access checks remain on both export endpoints.

Validation: 22 generation/quality regressions, three review-reason tests, five export tests (including actual PDF/DOCX renderers), and local browser checks of real restored-data downloads, selection persistence, failure retention, empty selection, invalid API types and mobile fit. Text/XML inspection confirmed a student PDF omitted answer labels and the combined Word document contained selected sections only. No paid generation or library-content changes. Old flags still require teacher judgment; actual new model outputs remain to be assessed on Ubuntu.


## 2026-11-15: exact generated counts and usable partial versions

A reported Night run completed Chapters 1–2, then failed on Chapter 3 because the returned MCQ array did not contain the requested 17 items. The old message did not record the actual count, so the supplied log cannot establish whether the model returned too many or too few. MCQ review warnings were separate from this failure.

The original structured-output schema constrained each item's fields and the four choices, but left the three list lengths unconstrained. Generation now builds a per-chapter schema with `minItems` and `maxItems` equal to each requested vocabulary, MCQ and short-answer count, including zero. New runs use `openai-study-guide-v4-exact-counts`. Validation remains in place and reports expected and received counts; normalization no longer contains array slicing that could hide excess items. No placeholders or automatic paid request replay are introduced.

Completed chapters remain committed if a later chapter fails. Manage versions now allows **Use version** for a failed run that has saved questions or vocabulary, with a visible partial-results notice. A failed run with no items remains disabled. Teachers can read/edit/export the retained results; incomplete chapters have no generated items in that version. This applies to existing failed versions without a migration. The version still displays Failed, not Completed. Resuming a failed run in place or merging new results into it is not part of this fix; the existing protection against rerunning saved versions remains.

For new requests, received responses that fail decoding, completeness or content checks carry their reported token usage into the worker's failure record. Failure logs now report known usage and explicitly state that completed chapters were retained. A network failure may have no usage response, so this is not an authoritative billing reconciliation. Historical rejected-response usage and actual item counts cannot be reconstructed from the old application logs.

Validation: mocked Responses API tests cover exact schemas for all three lists, successive chapters with different counts, zero counts, under/over-count errors, incomplete responses, no replay, failed-response usage and preserved completed chapters. Browser/API acceptance uses a disposable failed version with mock-generated items to verify selection, reading and Word export; no paid model requests are made. Deploy with generation idle using the standard web/worker build/restart process. No database migration, dependency or environment change is required.
