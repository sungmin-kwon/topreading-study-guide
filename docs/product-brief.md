# Product Brief

TopReading Study Guide is a small private app for creating reading materials from English books.

## Primary Users

- Teachers and tutors preparing detailed, chapter-by-chapter English book guides.
- Intended classroom audience is primarily middle/high school students, with varied backgrounds and English proficiency.
- Students receive teacher-prepared materials; student accounts, mastery tracking and learning dashboards are outside this product.

## Core Objects

- **Source file**: the original PDF, EPUB, or TXT upload.
- **Book**: title, author, reading level, pinned state, active generated version, and status.
- **Parsed document**: extracted raw text and metadata.
- **Chapter**: editable chapter text split from the parsed document.
- **Generation run**: one attempt to generate study materials for selected chapters.
- **Study set**: generated and edited vocabulary/questions for a run, usually covering the whole book or a selected chapter range.
- **Generated item**: vocabulary, multiple-choice, or short-answer row tied to a study set and optionally a chapter.
- **User**: app-level account with admin/member role and active/disabled status. Staging uses Google sign-in and invite-only library membership.
- **Export**: generated PDF or DOCX artifact.

## Design Direction

The app should feel like a calm workbench, not a marketing page:

- a compact Library and a focused selected-book workspace
- Text, Study guides, Export and Book info destinations
- clear state for upload, parse, review, generate, export
- separate Sets/version management from Review/item editing
- dense but readable editing surfaces
- durable progress and logs for long generation jobs

## Proposed guide format

See [Study guide format review](study-guide-format-review.md) for the source/code audit and proposed teacher reference, selectable classroom handout, contextual vocabulary, evidence-based tasks and paired answer key. This specification is not yet a deployed generation format. Personal teaching projects and generation profiles are planned; current library access remains shared.
