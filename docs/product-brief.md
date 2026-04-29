# Product Brief

TopReading Study Guide is a small private app for creating reading materials from English books.

## Primary Users

- Family members or tutors who prepare English reading assignments.
- Students who need chapter-by-chapter vocabulary and comprehension practice.

## Core Objects

- **Source file**: the original PDF, EPUB, or TXT upload.
- **Book**: title, author, reading level, pinned state, active generated version, and status.
- **Parsed document**: extracted raw text and metadata.
- **Chapter**: editable chapter text split from the parsed document.
- **Generation run**: one attempt to generate study materials for selected chapters.
- **Study set**: generated and edited vocabulary/questions for a run, usually covering the whole book or a selected chapter range.
- **Generated item**: vocabulary, multiple-choice, or short-answer row tied to a study set and optionally a chapter.
- **User**: app-level account identified by Cloudflare/proxy email with admin/member role and active/disabled status.
- **Export**: generated PDF or DOCX artifact.

## Design Direction

The app should feel like a calm workbench, not a marketing page:

- library on the left
- selected book workspace on the right
- clear state for upload, parse, review, generate, export
- separate Sets/version management from Review/item editing
- dense but readable editing surfaces
- durable progress and logs for long generation jobs
