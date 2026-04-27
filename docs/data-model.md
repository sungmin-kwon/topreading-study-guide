# Data Model Draft

This is the first-pass v2 schema shape. It is intentionally product-oriented rather than copied directly from the legacy database.

## Tables

### users

- id
- display_name
- email
- auth_provider
- created_at
- last_login_at

### books

- id
- owner_id
- title
- author
- reading_level
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
- owner_id
- name
- status
- config_json
- progress_json
- log_json
- started_at
- finished_at
- created_at
- updated_at

### question_sets

- id
- generation_run_id
- chapter_id
- status
- raw_model_json
- created_at
- updated_at

### vocabulary_items

- id
- question_set_id
- word
- english_definition
- korean_definition
- sort_order

### questions

- id
- question_set_id
- type
- prompt
- answer
- choices_json
- sort_order

### exports

- id
- book_id
- generation_run_id
- format
- stored_path
- options_json
- created_at
