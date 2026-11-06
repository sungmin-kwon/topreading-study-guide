# Study guide format review and proposed specification

Date: 2026-11-04 (Asia/Seoul)
Status: investigation and proposed format; not a deployed generation/schema change.
Audience: teachers preparing chapter-by-chapter English book guides, primarily for middle/high school students with varied backgrounds and English proficiency. Student accounts, attempts, mastery tracking and learning dashboards are outside this product.

## Recommendation

Make the central artifact a **chapter teaching guide**, with a detailed teacher reference and a selectable student handout derived from the same content. Organize it around what students should understand and the evidence they should use. Question type is an attribute of a task, not the principal organizing system.

Preserve detailed coverage in the teacher's bank. Let teachers select a focused lesson sequence without discarding the rest. A detailed guide is not necessarily a long compulsory worksheet.

Age, language proficiency, literary sophistication and prior knowledge are different dimensions. The default audience is secondary school, but no fixed CEFR level or lesson duration has been established. Suggested item ranges below are starting points for teacher trials, not validated standards or quotas.

## Evidence and limits

Reviewed current generation prompt and JSON schema, allocation logic, persistence, MCQ checks/review, vocabulary deduplication, editing organization, and PDF/DOCX payload construction. Read the disposable restored PostgreSQL library without writes: seven saved guides across eight books, 2,989 vocabulary entries, 2,422 MCQs and 1,157 short answers. Closely inspected the opening chapter's first three available items per type for 1984, A People's History of the United States and Chocolate Fever (26 items total). Checked the opening source excerpt of 1984 against a sampled stem.

The seven restored guides were generated with `gpt-5-mini`, prompt `openai-study-guide-v1`, April–August 2026. They do not include the newly generated Ubuntu guide. Current code uses the later MCQ-quality workflow. Historical metrics therefore describe the restored corpus, not current model performance. The sample is diagnostic, not a representative accuracy evaluation of all books. No paid generation, production access, internet literature review or classroom effectiveness trial was performed. Recommendations below are product/pedagogical design judgments requiring teacher trials.

### Findings

| Finding | Evidence | Consequence and proposed change |
|---|---|---|
| Counts drive planning | `deriveBookGenerationPlan` derives totals from word count, then the UI allocates by chapter word weight. The prompt demands exact counts. | Long passages get more items regardless of their teachable ideas. Start with chapter objectives and coverage; retain a teacher-controlled workload budget. |
| Student level is not operationalized | Current prompt includes title, author and chapter but not the book's reading level or a structured audience profile. | Add language support, expected response depth and teaching focus; do not infer proficiency from age. |
| Lower-order content dominates the historical bank | The exact label `literal comprehension` accounts for 1,440/2,422 MCQs and 480/1,157 short answers. Other labels include near-synonyms. | Recall has a place, but make evidence-based inference and analysis explicit in the blueprint. These figures are labels, not independently rated cognitive demand. |
| Skill labels cannot reliably guide selection | 30 distinct MCQ skill strings and 50 short-answer skill strings; a sampled causal question about Columbus was labeled sequencing. | Use a small controlled skill vocabulary and validate the requested reasoning, not only its tag. |
| Shuffling solves only position bias | Historical correct positions A/B/C/D = 609/605/605/603. Yet 364/2,422 (15.0%) trigger the current length heuristic: correct choice >1.5× longest distractor and at least five words longer. | Keep shuffling, parallel options, independent solving and teacher review. A heuristic flag is not proof the answer is wrong. |
| Stems can misstate a passage despite a recognizable correct answer | The sampled 1984 stem asks about clocks when Winston “leaves for” Victory Mansions; the opening source depicts him entering. | Verify the premise and temporal relationships in the stem as well as the answer key. |
| Vocabulary can mix senses | Chocolate Fever's `lean` includes the adjective meaning and the unrelated verb meaning; `bargain` bundles general meanings with the phrase `in the bargain`. | Select the actual sense/phrase used in the chapter. Separate optional other meanings and label constructed examples. |
| Context is stored but lost in export | All 2,989 historical vocabulary entries have context. The list export emits term plus English/Korean meaning; quiz export emits term plus blank. | Include selected context, use or collocation in the handout; support contextual tasks, not only definition recall. |
| Short-answer scoring is underspecified | Prompt asks only for a 1–2 sentence answer and a short rubric. Samples often restate the answer or say “fewer items = partial credit” without a threshold. | Use explicit required ideas, acceptable alternatives, evidence expectations and criterion-level points when assessed. |
| Quality review is MCQ-centric | Current bounded blind review covers flagged MCQs plus every tenth unflagged item. Summaries, vocabulary, short answers and chapter-level coverage lack equivalent semantic review. | Extend targeted review to the entire guide. Unreviewed items must not be presented as verified. |
| Repetition is treated as waste | Worker deduplication removes matching vocabulary terms across a run without considering sense or teaching purpose. | Avoid accidental duplicates but allow deliberate revisits, new senses and book-important recurring terms. |
| Genre and audience are flattened | Same prompt handles children's fiction, dystopian fiction and historical nonfiction. Korean gloss is required in every generated vocabulary entry. | Support fiction/nonfiction emphasis and optional language support; keep translations in separate fields. |

Useful foundations to retain: chapter linkage and revision infrastructure, editable item bank, background generation, guide versions, MCQ explanations, short-answer rubrics, source-only grounding, reorderable compact rows and separate answer-bearing exports. The structure should change without throwing these away.

## Proposed chapter guide

### 1. Chapter brief — teacher reference, collapsed in the editor

- Source/edition, chapter boundaries and source revision.
- Two or three specific learning objectives selected for this chapter.
- A short account of important events or claims; distinguish fact, narrator/author assertion and interpretation.
- Key relationships, conflicts or arguments and two or three likely misunderstandings.
- Optional background/context notes, explicitly sourced if outside the supplied text.
- Where relevant, a concise content note for teacher preparation rather than automatic warnings on every chapter.

This remains teacher-facing by default. Putting the plot summary above student questions can reveal answers or spoil discovery. A teacher may deliberately include a recap for a review lesson.

### 2. Essential language — choose what deserves attention

A suggested lesson selection starts with roughly 6–10 entries; longer chapters can have a larger optional bank. Do not impose the same quota on a short scene and a long historical chapter.

For each entry store:

- Headword or meaningful phrase, form encountered, part of speech, and **sense in this chapter**.
- Plain-English definition and optional separately stored translated gloss.
- Short source-linked context OR a clearly labeled paraphrase; never present an invented sentence as a quotation.
- A useful collocation, usage note or original example when it adds teaching value.
- Priority (essential/support/extension) separate from estimated language difficulty.
- Optional task: infer meaning, explain the effect of the word choice, choose its use in a new context, or complete a meaningful contrast.

Not every entry needs all optional fields. Avoid padding with a synonym, antonym, etymology and exercise for every word. Allow important idioms and phrasal verbs rather than favoring single words indiscriminately. Track deliberate recycling separately from accidental duplication; sense matters.

### 3. Understand the chapter — establish the essentials

A compact core of approximately 3–5 tasks on consequential events, relationships, causes, sequence or claims. Use MCQ where a concise diagnostic choice is useful and short response where explanation matters. Do not ask two formats of the same fact merely to fill a quota.

Questions should generally follow passage order within this section. The bank can include supplemental checks, clearly separated from the default lesson selection.

### 4. Interpret with evidence — the main teaching work

Approximately 2–4 well-chosen tasks, adjusted to the chapter and class. Ask students to make a claim, identify relevant evidence, and explain the connection. Suitable focuses include motivation, change, narrative perspective, word choice, theme, structure, argument or use of evidence.

Each task has one primary objective. Keep one manageable step per prompt or use explicit subparts. Cognitive depth must not be confused with complicated wording: a demanding question can use clear English.

For fiction, invite more than one defensible interpretation when the text supports it. For nonfiction, distinguish the author's account and evidence from independently established facts. Do not force literary-device questions onto chapters where they add no value.

### 5. Discuss or write — optional extension

One or two tasks that synthesize the chapter or connect it with earlier material actually supplied. State a purpose, expected response scale and the evidence boundary. An open discussion prompt should not be graded as if there is one secret correct opinion.

Optional supports can include sentence frames or a focused evidence location. Optional challenge should increase the reasoning required, not simply the quantity of writing. Teachers may select discussion OR writing, or omit both; this is not an obligatory new section on every worksheet.

### 6. Teacher key — paired with the exact handout selection

- MCQ: correct content, why it is supported, and why each distractor fails. Display letters only after export ordering is fixed.
- Written response: required ideas, one illustrative answer, acceptable alternatives, source evidence and criteria. A model response is not the only acceptable wording.
- Discussion: possible directions, follow-up prompts and misconceptions; no artificial single answer.
- Vocabulary: contextual sense and task-specific answer, not unrelated dictionary senses.
- Stable task identifiers, numbering, selected source revision and export revision matching the handout.

For a short evidence-based response, a usable starting rubric is 1 point for a defensible claim, 1 for relevant evidence, and 1 for explaining the connection. Adapt the criteria to the task; do not grade language mechanics unless language accuracy is an explicit objective. Keep scoring optional for discussion/material preparation.

## One content model, three useful exports

1. **Student handout:** selected tasks in teaching order, appropriate writing space, chosen vocabulary support, no teacher keys or hidden answers.
2. **Teacher edition:** the same task order and numbering with keys, evidence, criteria and optional teaching notes.
3. **Question/language bank:** the complete reusable collection, including extensions and filters.

Existing single-purpose vocabulary/quiz exports can remain as presets. PDFs and DOCX should use the same assembled content so answers and ordering cannot diverge. Generate a paired handout/key from one immutable selection snapshot, including any option shuffle. Shuffling again when exporting the key is incorrect.

These are documents teachers distribute; this does not introduce a student-facing platform. Review warnings belong in the teacher workspace/export review, not in learner worksheets. Provide draft export for preparation with a clear teacher-visible status. A final export must make unresolved review flags explicit; a missing review is distinct from a known defect and from teacher approval.

## Worked design example: 1984, Chapter 1

This is a small editorial illustration, not a generated replacement chapter guide or a classroom-validated lesson.

**Objective:** distinguish an explicit event from an inference about how surveillance constrains Winston's behavior.

**Teacher brief:** focus the lesson on the contrast between Winston's private actions and the conditions of observation. Keep plot recap out of the initial student handout.

**Language example:** `nuzzle` — verb; in the opening, press or tuck the chin closely against the chest. Use the source wording “his chin nuzzled into his breast” as the evidence anchor. Do not give only a definition centered on affectionate rubbing, which can obscure its use here. An optional original example should be labeled as constructed.

**Understand:** “As Winston enters Victory Mansions, what are the clocks doing?” If retained as an MCQ, all distractors should be plausible alternatives in the same grammatical form. The source supports “striking thirteen.” This corrects the sampled stem's movement premise; it does not claim this detail alone deserves a central lesson objective.

**Interpret:** “What can we infer about Winston's ability to act privately? Identify one restriction described in this chapter and explain how it affects his behavior.” Require evidence from the chapter and an explanation. The key should distinguish a supported inference from the claim that the text proves observation occurs at every moment.

**Optional language/literature extension:** “Choose one detail in the opening description of Victory Mansions. Explain how its wording contributes to your impression of the place.” Accept different defensible selections. Offer a sentence frame only when helpful; do not pre-fill the interpretation.

**Teacher key shape:** required idea → acceptable evidence → reasoning link → plausible alternatives → common overclaim. Before publishing a complete guide, verify each evidence anchor against the exact uploaded revision; the illustrative questions above are not a substitute for that validation.

## Generation and data design

### Start with a chapter blueprint

Generate a small, inspectable blueprint before the full bank: learning objectives, essential events/claims, likely misconceptions, vocabulary candidates, section selection and task coverage. Include the teacher's workload/depth preference. For short/simple chapters, combine blueprint and content in one bounded request if that works reliably; do not multiply model calls merely to add stages.

Supply only the source scope needed. Cross-chapter questions require explicit access to earlier chapters or verified summaries, with citations to their revisions. Never assume the model's knowledge of the book matches the uploaded edition. Do not introduce later spoilers into a chapter-local lesson.

Generate content to cover that blueprint. Reject invalid structures, remove redundant tasks, verify evidence spans programmatically, and then perform targeted semantic review within a visible cost/time budget. A quote matching the source proves it exists, not that it proves the answer. Teacher judgment remains necessary.

### Suggested schema direction

- Guide: `schemaVersion`, source revision references, immutable audience/profile snapshot, blueprint, model/prompt provenance.
- Objective: stable ID, concise observable goal, primary skill.
- Task: stable ID/revision, section, response format, objective ID, prompt, priority, language support, response expectations, evidence references, answer specification, review state and order.
- MCQ answer specification: stable choice IDs, correct choice ID, choice-specific rationales. Presentation order is separate.
- Written answer specification: expected elements, alternatives, rubric criteria and optional points.
- Vocabulary: lemma/phrase, encountered form, part of speech, contextual sense, separate gloss fields, evidence reference, example provenance and intentional recurrence links.
- Teacher selection: task IDs/revisions and order, optional language scaffolds and audience variant.
- Export snapshot: exact selection, numbering/choice ordering and matched teacher key.

Use typed answer specifications; avoid both a table for every superficial section and an unvalidated catch-all JSON blob. Existing chapter revision IDs are a useful foundation, but item revisions and exact evidence anchors need explicit support. Define an anchor using revision ID plus paragraph/span coordinates and a short excerpt/hash; page numbers alone will not survive edition or extraction changes.

Suggested primary skills: retrieve, sequence/cause, infer, analyze language/structure, evaluate argument/evidence, synthesize. Treat these as teacher-facing organizational categories, not a validated measurement scale. Separate task format, language demand and cognitive demand.

### Quality checks

- Source coverage: major events/claims and stated objectives receive appropriate attention; no trivia-heavy quota filling.
- Grounding: correct chapter, supported stem and answer, valid evidence references, no unsupported background or later spoilers.
- MCQ: one defensible answer; plausible distractors; parallel language; no length/grammar cue; explanations remain correct after shuffling.
- Vocabulary: correct sense and part of speech; useful selection for the intended language profile; honest quote/paraphrase/example labeling.
- Written response: answerable scope, clear expectations, acceptable alternatives and usable criteria. Do not mistake interpretive plurality for ambiguity requiring a single answer.
- Whole guide: non-redundancy across formats, manageable selected workload, appropriate scaffolding, consistent terminology.
- Delivery: paired key alignment, no answer leakage into the handout, usable writing space, stable bilingual layout and reasonable page breaks.

Use review states that distinguish generated/unreviewed, checked with limitations, needs teacher attention and teacher-approved. Editing an item must invalidate its old approval where its meaning or key changes. Persist review findings against the item revision rather than matching question text back to raw model output.

## Implementation and migration sequence

1. **Editorial prototype first:** manually assemble a teacher edition and student handout for one secondary-school fiction chapter and one nonfiction chapter using verified sources. Compare with current exports. This tests the format without spending on a full-book regeneration.
2. **Versioned contract and assembly:** introduce the blueprint, contextual vocabulary, typed answers, review provenance and export selection snapshot. Keep a reader/adapter for current guides. Map known existing content as legacy/unreviewed; never invent evidence, proficiency or approval metadata during migration.
3. **Teacher editor and paired exports:** organize tasks by teaching purpose with format filters, preserve compact draggable rows and collapse controls, expose optional detail on demand. Keep additions sparse. Student/teacher output must share one snapshot.
4. **Opt-in generation v3 pilot:** generate a few chapters under explicit settings and bounded budget. Record cost and review time. Do not replace existing guides or silently regenerate books.
5. **Validate and expand:** compare a short and a long chapter, fiction and nonfiction, and lower/higher language-support variants before making v3 the default. Old guides stay editable/exportable until the new pipeline proves useful.

A small teacher review should record substantive corrections per guide, unsupported-answer defects, redundant tasks removed, time to a usable handout, vocabulary usefulness, rubric agreement and export/key mismatches. These are evaluation measures to collect, not improvements already demonstrated. Require all selected final tasks to have resolved blocking grounding/key defects and exact handout/key correspondence. Numeric quality targets beyond those invariants should be set after the pilot.

Open decisions: actual class language-support profiles, preferred handout length, typical lesson duration and how much Korean support teachers want. The secondary-school audience is confirmed; those details are not. Make them editable project/profile settings rather than hard-coded assumptions.

## Code references inspected

- `packages/core/src/index.ts`: word-count plans and allocation.
- `apps/web/src/lib/openai-generator.ts`: current prompt, schema, normalization and quality calls.
- `apps/web/src/lib/generation-executor.ts`: vocabulary deduplication and persisted chapter results.
- `apps/web/src/lib/mcq-checks.ts`, `mcq-quality.ts`: structural heuristics and bounded sampled blind review.
- `apps/web/src/lib/study-items.ts`: stored items and review metadata presentation.
- `apps/web/src/lib/pdf-export.ts`, `scripts/render_study_set_docx.py`: document content and rendering.
- `apps/web/src/components/book-workspace.tsx`: generation planning, item-type editing and export selection.
- `database/migrations/0001_postgres.sql`, `0002_runtime_auth.sql`: content tables and chapter revisions.

## 2026-11-06: clarified product decisions and first implementation

The full chapter structure above is a longer-term option, not the default workflow. The primary user's core need is high-quality chapter-by-chapter MCQs. Chapter counts and adjustment already exist; their presentation will be revisited separately. Generate the complete MCQ/short-answer/vocabulary/summary bank together and let teachers select portions at export. Do not introduce generation selection checkboxes or require a lesson blueprint UI. A compact teacher overview may later build on the existing summary.

The first implementation is generation content quality v3, described in [UI behaviors and MCQ quality](ui-behaviors-and-mcq-quality.md): improved instructions across all item types, reading-level context, explicit MCQ premise checking, repeated-stem/collective-option flags and validation before normalization. This does not implement the new summary structure, project ownership or export presets.
