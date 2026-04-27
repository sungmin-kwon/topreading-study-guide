import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getDatabasePath } from "@/lib/env";
import * as schema from "./schema";

const databasePath = getDatabasePath();
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    reading_level TEXT,
    active_generation_run_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS source_files (
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

  CREATE INDEX IF NOT EXISTS idx_source_files_book_id ON source_files(book_id);

  CREATE TABLE IF NOT EXISTS parsed_documents (
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

  CREATE INDEX IF NOT EXISTS idx_parsed_documents_source_file_id ON parsed_documents(source_file_id);

  CREATE TABLE IF NOT EXISTS parsed_pages (
    id TEXT PRIMARY KEY,
    parsed_document_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    text_content TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (parsed_document_id) REFERENCES parsed_documents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_parsed_pages_document_page ON parsed_pages(parsed_document_id, page_number);

  CREATE TABLE IF NOT EXISTS chapters (
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

  CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
  CREATE INDEX IF NOT EXISTS idx_chapters_parsed_document_id ON chapters(parsed_document_id);

  CREATE TABLE IF NOT EXISTS generation_runs (
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

  CREATE INDEX IF NOT EXISTS idx_generation_runs_book_id ON generation_runs(book_id);

  CREATE TABLE IF NOT EXISTS study_sets (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    generation_run_id TEXT,
    chapter_id TEXT NOT NULL,
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
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_study_sets_book_id ON study_sets(book_id);
  CREATE INDEX IF NOT EXISTS idx_study_sets_chapter_id ON study_sets(chapter_id);

  CREATE TABLE IF NOT EXISTS vocabulary_items (
    id TEXT PRIMARY KEY,
    study_set_id TEXT NOT NULL,
    term TEXT NOT NULL,
    definition TEXT NOT NULL,
    context_sentence TEXT,
    part_of_speech TEXT,
    difficulty TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (study_set_id) REFERENCES study_sets(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_vocabulary_items_study_set_id ON vocabulary_items(study_set_id);

  CREATE TABLE IF NOT EXISTS multiple_choice_questions (
    id TEXT PRIMARY KEY,
    study_set_id TEXT NOT NULL,
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
    FOREIGN KEY (study_set_id) REFERENCES study_sets(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_multiple_choice_questions_study_set_id ON multiple_choice_questions(study_set_id);

  CREATE TABLE IF NOT EXISTS short_answer_questions (
    id TEXT PRIMARY KEY,
    study_set_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    suggested_answer TEXT NOT NULL,
    rubric TEXT,
    skill TEXT,
    difficulty TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (study_set_id) REFERENCES study_sets(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_short_answer_questions_study_set_id ON short_answer_questions(study_set_id);
`);

const bookColumns = (sqlite.prepare("PRAGMA table_info(books)").all() as Array<{ name: string }>).map((column) => column.name);

if (!bookColumns.includes("active_generation_run_id")) {
  sqlite.exec("ALTER TABLE books ADD COLUMN active_generation_run_id TEXT");
}

const studySetColumns = (sqlite.prepare("PRAGMA table_info(study_sets)").all() as Array<{ name: string }>).map((column) => column.name);

if (!studySetColumns.includes("generation_run_id")) {
  sqlite.exec("ALTER TABLE study_sets ADD COLUMN generation_run_id TEXT");
}

sqlite.exec("CREATE INDEX IF NOT EXISTS idx_study_sets_generation_run_id ON study_sets(generation_run_id)");

export const db = drizzle(sqlite, { schema });
