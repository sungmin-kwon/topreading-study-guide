-- PostgreSQL foundation. Applied transactionally by migrate-postgres.py.
-- Existing application stays on SQLite until its data-access/auth cutover.
CREATE TABLE libraries (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  notes text,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (role IN ('admin', 'member')),
  CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE books (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  author text,
  reading_level text,
  active_generation_run_id uuid,
  pinned_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  library_id uuid NOT NULL REFERENCES libraries(id),
  UNIQUE (id, library_id)
);

CREATE TABLE source_files (
  id uuid PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  stored_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  sha256 text NOT NULL,
  upload_status text NOT NULL DEFAULT 'uploaded',
  created_at timestamptz NOT NULL,
  storage_backend text NOT NULL DEFAULT 'local' CHECK (storage_backend IN ('local', 's3')),
  object_key text,
  CHECK (storage_backend <> 's3' OR object_key IS NOT NULL),
  CHECK (byte_size >= 0)
);

CREATE TABLE parsed_documents (
  id uuid PRIMARY KEY,
  source_file_id uuid NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
  parser_name text NOT NULL,
  parser_version text NOT NULL,
  text_content text NOT NULL,
  page_count integer NOT NULL,
  word_count integer NOT NULL,
  metadata_json jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE parsed_pages (
  id uuid PRIMARY KEY,
  parsed_document_id uuid NOT NULL REFERENCES parsed_documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  text_content text NOT NULL,
  word_count integer NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE chapters (
  id uuid PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  parsed_document_id uuid NOT NULL REFERENCES parsed_documents(id) ON DELETE CASCADE,
  chapter_number integer NOT NULL,
  title text NOT NULL DEFAULT '',
  text_content text NOT NULL,
  word_count integer NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (id, book_id)
);

CREATE TABLE generation_runs (
  id uuid PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  name text,
  status text NOT NULL DEFAULT 'draft',
  config_json jsonb NOT NULL DEFAULT '{}',
  progress_json jsonb NOT NULL DEFAULT '{}',
  log_json jsonb NOT NULL DEFAULT '[]',
  error_message text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (id, book_id)
);

CREATE TABLE study_sets (
  id uuid PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  generation_run_id uuid REFERENCES generation_runs(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  generator text NOT NULL DEFAULT 'manual',
  model text,
  prompt_version text,
  settings_json jsonb NOT NULL DEFAULT '{}',
  raw_output_json jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (id, book_id)
);

CREATE TABLE vocabulary_items (
  id uuid PRIMARY KEY,
  study_set_id uuid NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL,
  term text NOT NULL,
  definition text NOT NULL,
  context_sentence text,
  part_of_speech text,
  difficulty text,
  status text NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  book_id uuid NOT NULL REFERENCES books(id),
  chapter_revision_id uuid
);

CREATE TABLE multiple_choice_questions (
  id uuid PRIMARY KEY,
  study_set_id uuid NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  choices_json jsonb NOT NULL,
  correct_choice_index integer NOT NULL,
  explanation text,
  skill text,
  difficulty text,
  status text NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  book_id uuid NOT NULL REFERENCES books(id),
  chapter_revision_id uuid,
  CHECK (jsonb_typeof(choices_json) = 'array'),
  CHECK (correct_choice_index >= 0 AND correct_choice_index < jsonb_array_length(choices_json))
);

CREATE TABLE short_answer_questions (
  id uuid PRIMARY KEY,
  study_set_id uuid NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  suggested_answer text NOT NULL,
  rubric text,
  skill text,
  difficulty text,
  status text NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  book_id uuid NOT NULL REFERENCES books(id),
  chapter_revision_id uuid
);

CREATE TABLE chapter_summaries (
  id uuid PRIMARY KEY,
  study_set_id uuid NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE SET NULL,
  summary_text text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  book_id uuid NOT NULL REFERENCES books(id),
  chapter_revision_id uuid
);

CREATE TABLE library_memberships (
  library_id uuid NOT NULL REFERENCES libraries(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (library_id, user_id)
);

CREATE TABLE chapter_revisions (
  id uuid PRIMARY KEY,
  chapter_id uuid NOT NULL REFERENCES chapters(id),
  revision_number integer NOT NULL CHECK (revision_number > 0),
  title text NOT NULL,
  text_content text NOT NULL,
  word_count integer NOT NULL CHECK (word_count >= 0),
  content_sha256 text NOT NULL CHECK (length(content_sha256) = 64),
  origin text NOT NULL CHECK (origin IN ('legacy_snapshot', 'extraction', 'edit')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, revision_number),
  UNIQUE (id, chapter_id)
);
ALTER TABLE chapters ADD COLUMN current_revision_id uuid;
ALTER TABLE chapters ADD CONSTRAINT chapters_current_revision_fk
  FOREIGN KEY (current_revision_id, id) REFERENCES chapter_revisions(id, chapter_id)
  DEFERRABLE INITIALLY DEFERRED;

-- Preserve existing active guide selections while enforcing same-book ownership.
ALTER TABLE books ADD CONSTRAINT books_active_run_fk
  FOREIGN KEY (active_generation_run_id, id) REFERENCES generation_runs(id, book_id)
  DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE study_sets ADD CONSTRAINT study_sets_run_book_fk
  FOREIGN KEY (generation_run_id, book_id) REFERENCES generation_runs(id, book_id);
ALTER TABLE study_sets ADD CONSTRAINT study_sets_chapter_book_fk
  FOREIGN KEY (chapter_id, book_id) REFERENCES chapters(id, book_id);
CREATE UNIQUE INDEX parsed_pages_document_page_idx ON parsed_pages(parsed_document_id, page_number);
CREATE UNIQUE INDEX chapters_book_number_idx ON chapters(book_id, chapter_number);

-- A revision cannot be changed in place. New edits create another revision.
CREATE FUNCTION reject_revision_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Chapter revisions are immutable; insert a new revision';
END;
$$;
CREATE TRIGGER chapter_revision_immutable BEFORE UPDATE ON chapter_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_revision_update();

-- Queue storage only; worker claiming/retry logic is a later implementation slice.
CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  library_id uuid NOT NULL REFERENCES libraries(id),
  book_id uuid,
  requested_by uuid REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('extract', 'generate', 'export', 'ocr')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  progress jsonb NOT NULL DEFAULT '{}',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (library_id, idempotency_key),
  FOREIGN KEY (book_id, library_id) REFERENCES books(id, library_id)
);
CREATE INDEX jobs_ready_idx ON jobs(available_at) WHERE status = 'queued';
CREATE INDEX jobs_lease_idx ON jobs(lease_until) WHERE status = 'running';

CREATE TABLE migration_history (
  version text PRIMARY KEY,
  migration_sha256 text NOT NULL,
  source_fingerprint text NOT NULL,
  library_id uuid NOT NULL REFERENCES libraries(id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  reconciliation jsonb NOT NULL
);

ALTER TABLE vocabulary_items ADD CONSTRAINT vocabulary_items_set_book_fk
  FOREIGN KEY (study_set_id, book_id) REFERENCES study_sets(id, book_id);
ALTER TABLE vocabulary_items ADD CONSTRAINT vocabulary_items_chapter_book_fk
  FOREIGN KEY (chapter_id, book_id) REFERENCES chapters(id, book_id);
ALTER TABLE vocabulary_items ADD CONSTRAINT vocabulary_items_revision_fk
  FOREIGN KEY (chapter_revision_id, chapter_id) REFERENCES chapter_revisions(id, chapter_id);
ALTER TABLE vocabulary_items ADD CHECK (chapter_revision_id IS NULL OR chapter_id IS NOT NULL);
CREATE INDEX vocabulary_items_set_chapter_order_idx ON vocabulary_items(study_set_id, chapter_id, sort_order);

ALTER TABLE multiple_choice_questions ADD CONSTRAINT multiple_choice_questions_set_book_fk
  FOREIGN KEY (study_set_id, book_id) REFERENCES study_sets(id, book_id);
ALTER TABLE multiple_choice_questions ADD CONSTRAINT multiple_choice_questions_chapter_book_fk
  FOREIGN KEY (chapter_id, book_id) REFERENCES chapters(id, book_id);
ALTER TABLE multiple_choice_questions ADD CONSTRAINT multiple_choice_questions_revision_fk
  FOREIGN KEY (chapter_revision_id, chapter_id) REFERENCES chapter_revisions(id, chapter_id);
ALTER TABLE multiple_choice_questions ADD CHECK (chapter_revision_id IS NULL OR chapter_id IS NOT NULL);
CREATE INDEX multiple_choice_questions_set_chapter_order_idx ON multiple_choice_questions(study_set_id, chapter_id, sort_order);

ALTER TABLE short_answer_questions ADD CONSTRAINT short_answer_questions_set_book_fk
  FOREIGN KEY (study_set_id, book_id) REFERENCES study_sets(id, book_id);
ALTER TABLE short_answer_questions ADD CONSTRAINT short_answer_questions_chapter_book_fk
  FOREIGN KEY (chapter_id, book_id) REFERENCES chapters(id, book_id);
ALTER TABLE short_answer_questions ADD CONSTRAINT short_answer_questions_revision_fk
  FOREIGN KEY (chapter_revision_id, chapter_id) REFERENCES chapter_revisions(id, chapter_id);
ALTER TABLE short_answer_questions ADD CHECK (chapter_revision_id IS NULL OR chapter_id IS NOT NULL);
CREATE INDEX short_answer_questions_set_chapter_order_idx ON short_answer_questions(study_set_id, chapter_id, sort_order);

ALTER TABLE chapter_summaries ADD CONSTRAINT chapter_summaries_set_book_fk
  FOREIGN KEY (study_set_id, book_id) REFERENCES study_sets(id, book_id);
ALTER TABLE chapter_summaries ADD CONSTRAINT chapter_summaries_chapter_book_fk
  FOREIGN KEY (chapter_id, book_id) REFERENCES chapters(id, book_id);
ALTER TABLE chapter_summaries ADD CONSTRAINT chapter_summaries_revision_fk
  FOREIGN KEY (chapter_revision_id, chapter_id) REFERENCES chapter_revisions(id, chapter_id);
ALTER TABLE chapter_summaries ADD CHECK (chapter_revision_id IS NULL OR chapter_id IS NOT NULL);
CREATE INDEX chapter_summaries_set_chapter_order_idx ON chapter_summaries(study_set_id, chapter_id, sort_order);

CREATE INDEX books_library_id_idx ON books(library_id);

CREATE INDEX source_files_book_id_idx ON source_files(book_id);

CREATE INDEX parsed_documents_source_file_id_idx ON parsed_documents(source_file_id);

CREATE INDEX chapters_parsed_document_id_idx ON chapters(parsed_document_id);

CREATE INDEX generation_runs_book_id_idx ON generation_runs(book_id);

CREATE INDEX study_sets_generation_run_id_idx ON study_sets(generation_run_id);

CREATE INDEX library_memberships_user_id_idx ON library_memberships(user_id);
