import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const books = sqliteTable("books", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author"),
  readingLevel: text("reading_level"),
  activeGenerationRunId: text("active_generation_run_id"),
  pinnedAt: text("pinned_at"),
  status: text("status").notNull().default("draft"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const sourceFiles = sqliteTable("source_files", {
  id: text("id").primaryKey(),
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  originalFilename: text("original_filename").notNull(),
  storedPath: text("stored_path").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  uploadStatus: text("upload_status").notNull().default("uploaded"),
  createdAt: text("created_at").notNull()
});

export const parsedDocuments = sqliteTable("parsed_documents", {
  id: text("id").primaryKey(),
  sourceFileId: text("source_file_id").notNull().references(() => sourceFiles.id, { onDelete: "cascade" }),
  parserName: text("parser_name").notNull(),
  parserVersion: text("parser_version").notNull(),
  textContent: text("text_content").notNull(),
  pageCount: integer("page_count").notNull(),
  wordCount: integer("word_count").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const parsedPages = sqliteTable("parsed_pages", {
  id: text("id").primaryKey(),
  parsedDocumentId: text("parsed_document_id").notNull().references(() => parsedDocuments.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  textContent: text("text_content").notNull(),
  wordCount: integer("word_count").notNull(),
  createdAt: text("created_at").notNull()
});

export const chapters = sqliteTable("chapters", {
  id: text("id").primaryKey(),
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  parsedDocumentId: text("parsed_document_id").notNull().references(() => parsedDocuments.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  title: text("title").notNull().default(""),
  textContent: text("text_content").notNull(),
  wordCount: integer("word_count").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const generationRuns = sqliteTable("generation_runs", {
  id: text("id").primaryKey(),
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  name: text("name"),
  status: text("status").notNull().default("draft"),
  configJson: text("config_json").notNull().default("{}"),
  progressJson: text("progress_json").notNull().default("{}"),
  logJson: text("log_json").notNull().default("[]"),
  errorMessage: text("error_message"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const studySets = sqliteTable("study_sets", {
  id: text("id").primaryKey(),
  bookId: text("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  generationRunId: text("generation_run_id").references(() => generationRuns.id, { onDelete: "set null" }),
  chapterId: text("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  generator: text("generator").notNull().default("manual"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  settingsJson: text("settings_json").notNull().default("{}"),
  rawOutputJson: text("raw_output_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const vocabularyItems = sqliteTable("vocabulary_items", {
  id: text("id").primaryKey(),
  studySetId: text("study_set_id").notNull().references(() => studySets.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  term: text("term").notNull(),
  definition: text("definition").notNull(),
  contextSentence: text("context_sentence"),
  partOfSpeech: text("part_of_speech"),
  difficulty: text("difficulty"),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const multipleChoiceQuestions = sqliteTable("multiple_choice_questions", {
  id: text("id").primaryKey(),
  studySetId: text("study_set_id").notNull().references(() => studySets.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  questionText: text("question_text").notNull(),
  choicesJson: text("choices_json").notNull(),
  correctChoiceIndex: integer("correct_choice_index").notNull(),
  explanation: text("explanation"),
  skill: text("skill"),
  difficulty: text("difficulty"),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const shortAnswerQuestions = sqliteTable("short_answer_questions", {
  id: text("id").primaryKey(),
  studySetId: text("study_set_id").notNull().references(() => studySets.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  questionText: text("question_text").notNull(),
  suggestedAnswer: text("suggested_answer").notNull(),
  rubric: text("rubric"),
  skill: text("skill"),
  difficulty: text("difficulty"),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SourceFile = typeof sourceFiles.$inferSelect;
export type NewSourceFile = typeof sourceFiles.$inferInsert;
export type ParsedDocument = typeof parsedDocuments.$inferSelect;
export type NewParsedDocument = typeof parsedDocuments.$inferInsert;
export type ParsedPage = typeof parsedPages.$inferSelect;
export type NewParsedPage = typeof parsedPages.$inferInsert;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;
export type GenerationRun = typeof generationRuns.$inferSelect;
export type NewGenerationRun = typeof generationRuns.$inferInsert;
export type StudySet = typeof studySets.$inferSelect;
export type NewStudySet = typeof studySets.$inferInsert;
export type VocabularyItem = typeof vocabularyItems.$inferSelect;
export type NewVocabularyItem = typeof vocabularyItems.$inferInsert;
export type MultipleChoiceQuestion = typeof multipleChoiceQuestions.$inferSelect;
export type NewMultipleChoiceQuestion = typeof multipleChoiceQuestions.$inferInsert;
export type ShortAnswerQuestion = typeof shortAnswerQuestions.$inferSelect;
export type NewShortAnswerQuestion = typeof shortAnswerQuestions.$inferInsert;
