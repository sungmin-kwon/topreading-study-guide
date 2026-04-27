# Product Brief

TopReading Study Guide is a small private app for creating reading materials from English books.

## Primary Users

- Family members or tutors who prepare English reading assignments.
- Students who need chapter-by-chapter vocabulary and comprehension practice.

## Core Objects

- **Source file**: the original PDF or text upload.
- **Book**: title, author, reading level, owner, and status.
- **Parsed document**: extracted raw text and metadata.
- **Chapter**: editable chapter text split from the parsed document.
- **Generation run**: one attempt to generate study materials for selected chapters.
- **Question set**: generated and edited vocabulary/questions for one chapter.
- **Export**: generated PDF, DOCX, or JSON artifact.

## Design Direction

The app should feel like a calm workbench, not a marketing page:

- library on the left
- selected book workspace on the right
- clear state for upload, parse, review, generate, export
- dense but readable editing surfaces
- durable progress and logs for long generation jobs

