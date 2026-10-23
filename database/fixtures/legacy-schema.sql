-- Schema-only fixture from the current application. Contains no production records.

CREATE TABLE books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    reading_level TEXT,
    active_generation_run_id TEXT,
    pinned_at TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE chapter_summaries (
    id TEXT PRIMARY KEY,
    study_set_id TEXT NOT NULL,
    chapter_id TEXT,
    summary_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (study_set_id) REFERENCES study_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
  );

CREATE TABLE chapters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    parsed_document_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    text_content TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (parsed_document_id) REFERENCES parsed_documents(id) ON DELETE CASCADE
  );

CREATE TABLE generation_runs (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    config_json TEXT NOT NULL DEFAULT '{}',
    progress_json TEXT NOT NULL DEFAULT '{}',
    log_json TEXT NOT NULL DEFAULT '[]',
    error_message TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );

CREATE TABLE multiple_choice_questions (
    id TEXT PRIMARY KEY,
    study_set_id TEXT NOT NULL,
    chapter_id TEXT,
    question_text TEXT NOT NULL,
    choices_json TEXT NOT NULL,
    correct_choice_index INTEGER NOT NULL,
    explanation TEXT,
    skill TEXT,
    difficulty TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (study_set_id) REFERENCES study_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
  );

CREATE TABLE parsed_documents (
    id TEXT PRIMARY KEY,
    source_file_id TEXT NOT NULL,
    parser_name TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    text_content TEXT NOT NULL,
    page_count INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_file_id) REFERENCES source_files(id) ON DELETE CASCADE
  );

CREATE TABLE parsed_pages (
    id TEXT PRIMARY KEY,
    parsed_document_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (parsed_document_id) REFERENCES parsed_documents(id) ON DELETE CASCADE
  );

CREATE TABLE short_answer_questions (
    id TEXT PRIMARY KEY,
    study_set_id TEXT NOT NULL,
    chapter_id TEXT,
    question_text TEXT NOT NULL,
    suggested_answer TEXT NOT NULL,
    rubric TEXT,
    skill TEXT,
    difficulty TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (study_set_id) REFERENCES study_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
  );

CREATE TABLE source_files (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    upload_status TEXT NOT NULL DEFAULT 'uploaded',
    created_at TEXT NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );

CREATE TABLE study_sets (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    generation_run_id TEXT,
    chapter_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    generator TEXT NOT NULL DEFAULT 'manual',
    model TEXT,
    prompt_version TEXT,
    settings_json TEXT NOT NULL DEFAULT '{}',
    raw_output_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (generation_run_id) REFERENCES generation_runs(id) ON DELETE SET NULL,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
  );

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    last_seen_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE vocabulary_items (
    id TEXT PRIMARY KEY,
    study_set_id TEXT NOT NULL,
    chapter_id TEXT,
    term TEXT NOT NULL,
    definition TEXT NOT NULL,
    context_sentence TEXT,
    part_of_speech TEXT,
    difficulty TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (study_set_id) REFERENCES study_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
  );
