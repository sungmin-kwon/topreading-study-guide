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
  CREATE TABLE IF NOT EXISTS users (
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

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS books (
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

  CREATE INDEX IF NOT EXISTS idx_study_sets_book_id ON study_sets(book_id);
  CREATE INDEX IF NOT EXISTS idx_study_sets_chapter_id ON study_sets(chapter_id);

  CREATE TABLE IF NOT EXISTS vocabulary_items (
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

  CREATE INDEX IF NOT EXISTS idx_vocabulary_items_study_set_id ON vocabulary_items(study_set_id);

  CREATE TABLE IF NOT EXISTS multiple_choice_questions (
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

  CREATE INDEX IF NOT EXISTS idx_multiple_choice_questions_study_set_id ON multiple_choice_questions(study_set_id);

  CREATE TABLE IF NOT EXISTS short_answer_questions (
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

  CREATE INDEX IF NOT EXISTS idx_short_answer_questions_study_set_id ON short_answer_questions(study_set_id);

  CREATE TABLE IF NOT EXISTS chapter_summaries (
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

  CREATE INDEX IF NOT EXISTS idx_chapter_summaries_study_set_id ON chapter_summaries(study_set_id);
  CREATE INDEX IF NOT EXISTS idx_chapter_summaries_chapter_id ON chapter_summaries(chapter_id);
`);

const bookColumns = (sqlite.prepare("PRAGMA table_info(books)").all() as Array<{ name: string }>).map((column) => column.name);

if (!bookColumns.includes("active_generation_run_id")) {
  sqlite.exec("ALTER TABLE books ADD COLUMN active_generation_run_id TEXT");
}

if (!bookColumns.includes("pinned_at")) {
  sqlite.exec("ALTER TABLE books ADD COLUMN pinned_at TEXT");
}

const studySetColumns = (sqlite.prepare("PRAGMA table_info(study_sets)").all() as Array<{ name: string }>).map((column) => column.name);

if (!studySetColumns.includes("generation_run_id")) {
  sqlite.exec("ALTER TABLE study_sets ADD COLUMN generation_run_id TEXT");
}

sqlite.exec("CREATE INDEX IF NOT EXISTS idx_study_sets_generation_run_id ON study_sets(generation_run_id)");

function tableColumns(tableName: string) {
  return (sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string; notnull: number }>); 
}

function hasColumn(tableName: string, columnName: string) {
  return tableColumns(tableName).some((column) => column.name === columnName);
}

function migrateGeneratedContentTables() {
  const currentStudySetColumns = tableColumns("study_sets");
  const chapterColumn = currentStudySetColumns.find((column) => column.name === "chapter_id");
  const needsNullableStudySetChapter = Boolean(chapterColumn?.notnull);
  const needsItemChapterColumns = !hasColumn("vocabulary_items", "chapter_id")
    || !hasColumn("multiple_choice_questions", "chapter_id")
    || !hasColumn("short_answer_questions", "chapter_id");

  if (!needsNullableStudySetChapter && !needsItemChapterColumns) {
    return;
  }

  const vocabularyChapterExpression = hasColumn("vocabulary_items", "chapter_id")
    ? "item.chapter_id"
    : "study_sets_legacy.chapter_id";
  const multipleChoiceChapterExpression = hasColumn("multiple_choice_questions", "chapter_id")
    ? "item.chapter_id"
    : "study_sets_legacy.chapter_id";
  const shortAnswerChapterExpression = hasColumn("short_answer_questions", "chapter_id")
    ? "item.chapter_id"
    : "study_sets_legacy.chapter_id";

  sqlite.pragma("foreign_keys = OFF");
  try {
    sqlite.exec(`
      BEGIN TRANSACTION;

      ALTER TABLE study_sets RENAME TO study_sets_legacy;
      ALTER TABLE vocabulary_items RENAME TO vocabulary_items_legacy;
      ALTER TABLE multiple_choice_questions RENAME TO multiple_choice_questions_legacy;
      ALTER TABLE short_answer_questions RENAME TO short_answer_questions_legacy;

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

      INSERT INTO study_sets (
        id, book_id, generation_run_id, chapter_id, title, status, generator, model,
        prompt_version, settings_json, raw_output_json, created_at, updated_at
      )
      SELECT
        id, book_id, generation_run_id, chapter_id, title, status, generator, model,
        prompt_version, settings_json, raw_output_json, created_at, updated_at
      FROM study_sets_legacy;

      INSERT INTO vocabulary_items (
        id, study_set_id, chapter_id, term, definition, context_sentence,
        part_of_speech, difficulty, status, sort_order, created_at, updated_at
      )
      SELECT
        item.id,
        item.study_set_id,
        ${vocabularyChapterExpression},
        item.term,
        item.definition,
        item.context_sentence,
        item.part_of_speech,
        item.difficulty,
        item.status,
        item.sort_order,
        item.created_at,
        item.updated_at
      FROM vocabulary_items_legacy item
      JOIN study_sets_legacy ON study_sets_legacy.id = item.study_set_id;

      INSERT INTO multiple_choice_questions (
        id, study_set_id, chapter_id, question_text, choices_json, correct_choice_index,
        explanation, skill, difficulty, status, sort_order, created_at, updated_at
      )
      SELECT
        item.id,
        item.study_set_id,
        ${multipleChoiceChapterExpression},
        item.question_text,
        item.choices_json,
        item.correct_choice_index,
        item.explanation,
        item.skill,
        item.difficulty,
        item.status,
        item.sort_order,
        item.created_at,
        item.updated_at
      FROM multiple_choice_questions_legacy item
      JOIN study_sets_legacy ON study_sets_legacy.id = item.study_set_id;

      INSERT INTO short_answer_questions (
        id, study_set_id, chapter_id, question_text, suggested_answer, rubric,
        skill, difficulty, status, sort_order, created_at, updated_at
      )
      SELECT
        item.id,
        item.study_set_id,
        ${shortAnswerChapterExpression},
        item.question_text,
        item.suggested_answer,
        item.rubric,
        item.skill,
        item.difficulty,
        item.status,
        item.sort_order,
        item.created_at,
        item.updated_at
      FROM short_answer_questions_legacy item
      JOIN study_sets_legacy ON study_sets_legacy.id = item.study_set_id;

      DROP TABLE study_sets_legacy;
      DROP TABLE vocabulary_items_legacy;
      DROP TABLE multiple_choice_questions_legacy;
      DROP TABLE short_answer_questions_legacy;

      COMMIT;
    `);
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}

migrateGeneratedContentTables();

sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_study_sets_book_id ON study_sets(book_id);
  CREATE INDEX IF NOT EXISTS idx_study_sets_chapter_id ON study_sets(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_study_sets_generation_run_id ON study_sets(generation_run_id);
  CREATE INDEX IF NOT EXISTS idx_vocabulary_items_study_set_id ON vocabulary_items(study_set_id);
  CREATE INDEX IF NOT EXISTS idx_vocabulary_items_chapter_id ON vocabulary_items(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_multiple_choice_questions_study_set_id ON multiple_choice_questions(study_set_id);
  CREATE INDEX IF NOT EXISTS idx_multiple_choice_questions_chapter_id ON multiple_choice_questions(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_short_answer_questions_study_set_id ON short_answer_questions(study_set_id);
  CREATE INDEX IF NOT EXISTS idx_short_answer_questions_chapter_id ON short_answer_questions(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_chapter_summaries_study_set_id ON chapter_summaries(study_set_id);
  CREATE INDEX IF NOT EXISTS idx_chapter_summaries_chapter_id ON chapter_summaries(chapter_id);
`);

export const db = drizzle(sqlite, { schema });
