# Data Model Draft

This is the first-pass v2 schema shape. It is intentionally product-oriented rather than copied directly from the legacy database.

## Tables

### users

- id
- email
- display_name
- role
- status
- notes
- last_seen_at
- created_at
- updated_at

Users are identified by email from Cloudflare Access or a trusted proxy header. The app does not store passwords. `role` is currently `admin` or `member`; `status` is currently `active` or `disabled`.

### books

- id
- title
- author
- reading_level
- active_generation_run_id
- pinned_at
- status
- created_at
- updated_at

### source_files

- id
- book_id
- original_filename
- stored_path
- mime_type
- byte_size
- sha256
- upload_status
- created_at

Local development stores source files under `data/uploads/<book_id>/`. The database stores a relative path so the storage root can change between local and deployed environments.

### parsed_documents

- id
- source_file_id
- parser_name
- parser_version
- text_content
- page_count
- word_count
- metadata_json
- created_at

PDF extraction is currently performed by `scripts/extract_pdf_text.py` using PyMuPDF. The web app stores the full extracted text here before chapter splitting.

### chapters

- id
- book_id
- parsed_document_id
- chapter_number
- title
- text_content
- word_count
- sort_order
- created_at
- updated_at

The first splitter is deterministic and conservative: it recognizes obvious chapter headings and otherwise creates one chapter from the parsed document so users can continue the workflow without hallucinated boundaries.

Cleanup is supported during development: source file deletion removes the stored PDF and cascades parsed documents/chapters, parsed document deletion cascades chapters from that extraction, and chapter clearing lets users retry splitting after parser changes.

### generation_runs

- id
- book_id
- name
- status
- config_json
- progress_json
- log_json
- error_message
- started_at
- finished_at
- created_at
- updated_at

Generation runs are operational records: they store configuration, progress, terminal log entries, status, and timing. They are also the user-facing version boundary for generated material.

### study_sets

- id
- book_id
- generation_run_id
- chapter_id, nullable for run-level/whole-book sets
- title
- status
- generator
- model
- prompt_version
- settings_json
- raw_output_json
- created_at
- updated_at

A normal whole-book run creates one run-level study set. Generated items point back to the set and carry `chapter_id` so the Review tab can filter by chapter without treating every chapter as a separate version.

### vocabulary_items

- id
- study_set_id
- chapter_id
- term
- definition
- context_sentence
- part_of_speech
- difficulty
- status
- sort_order

### multiple_choice_questions

- id
- study_set_id
- chapter_id
- question_text
- choices_json
- correct_choice_index
- explanation
- skill
- difficulty
- status
- sort_order

### short_answer_questions

- id
- study_set_id
- chapter_id
- question_text
- suggested_answer
- rubric
- skill
- difficulty
- status
- sort_order

### exports

Exports are generated on demand and written to `EXPORT_DIR`; they are not currently persisted in a dedicated exports table. The export code reads the active generation run or selected study set, renders PDF/DOCX files, and returns the generated file.
