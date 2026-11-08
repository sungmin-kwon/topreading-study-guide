import { integer, pgSchema, text, uuid, timestamp, bigint, customType, primaryKey } from "drizzle-orm/pg-core";
const schemaName = process.env.DATABASE_SCHEMA || "topreading";
if (!/^[a-z][a-z0-9_]*$/.test(schemaName) || schemaName === "public") throw new Error("Use a dedicated DATABASE_SCHEMA");
export const appSchema = pgSchema(schemaName);
// Preserve the existing service boundary (JSON strings and ISO timestamps).
// PostgreSQL stores validated JSONB rather than opaque text.
const jsonString = customType<{ data: string; driverData: unknown }>({
  dataType: () => "jsonb",
  toDriver: value => JSON.stringify(JSON.parse(value)),
  fromDriver: value => JSON.stringify(value)
});
const isoTime = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const users = appSchema.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  lastSeenAt: isoTime("last_seen_at"),
  createdAt: isoTime("created_at").notNull(),
  updatedAt: isoTime("updated_at").notNull()
});

export const books = appSchema.table("books", {
  libraryId: uuid("library_id").notNull(),
  id: uuid("id").primaryKey(),
  title: text("title").notNull(),
  author: text("author"),
  readingLevel: text("reading_level"),
  activeGenerationRunId: uuid("active_generation_run_id"),
  activeLayoutId: uuid("active_layout_id"),
  pinnedAt: isoTime("pinned_at"),
  status: text("status").notNull().default("draft"),
  createdAt: isoTime("created_at").notNull(),
  updatedAt: isoTime("updated_at").notNull()
});

export const sourceFiles = appSchema.table("source_files", {
  id: uuid("id").primaryKey(),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  originalFilename: text("original_filename").notNull(),
  storedPath: text("stored_path").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: bigint("byte_size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  uploadStatus: text("upload_status").notNull().default("uploaded"),
  createdAt: isoTime("created_at").notNull()
});

export const parsedDocuments = appSchema.table("parsed_documents", {
  id: uuid("id").primaryKey(),
  sourceFileId: uuid("source_file_id").notNull().references(() => sourceFiles.id, { onDelete: "cascade" }),
  parserName: text("parser_name").notNull(),
  parserVersion: text("parser_version").notNull(),
  textContent: text("text_content").notNull(),
  pageCount: integer("page_count").notNull(),
  wordCount: integer("word_count").notNull(),
  metadataJson: jsonString("metadata_json").notNull(),
  createdAt: isoTime("created_at").notNull()
});

export const parsedPages = appSchema.table("parsed_pages", {
  id: uuid("id").primaryKey(),
  parsedDocumentId: uuid("parsed_document_id").notNull().references(() => parsedDocuments.id, { onDelete: "cascade" }),
  pageNumber: integer("page_number").notNull(),
  textContent: text("text_content").notNull(),
  wordCount: integer("word_count").notNull(),
  createdAt: isoTime("created_at").notNull()
});

export const chapters = appSchema.table("chapters", {
  layoutId: uuid("layout_id"),
  id: uuid("id").primaryKey(),
  currentRevisionId: uuid("current_revision_id"),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  parsedDocumentId: uuid("parsed_document_id").notNull().references(() => parsedDocuments.id, { onDelete: "cascade" }),
  chapterNumber: integer("chapter_number").notNull(),
  title: text("title").notNull().default(""),
  textContent: text("text_content").notNull(),
  wordCount: integer("word_count").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: isoTime("created_at").notNull(),
  updatedAt: isoTime("updated_at").notNull()
});

export const generationRuns = appSchema.table("generation_runs", {
  layoutId: uuid("layout_id"),
  id: uuid("id").primaryKey(),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  name: text("name"),
  status: text("status").notNull().default("draft"),
  configJson: jsonString("config_json").notNull().default("{}"),
  progressJson: jsonString("progress_json").notNull().default("{}"),
  logJson: jsonString("log_json").notNull().default("[]"),
  errorMessage: text("error_message"),
  startedAt: isoTime("started_at").notNull(),
  finishedAt: isoTime("finished_at"),
  createdAt: isoTime("created_at").notNull(),
  updatedAt: isoTime("updated_at").notNull()
});

export const studySets = appSchema.table("study_sets", {
  id: uuid("id").primaryKey(),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  generationRunId: uuid("generation_run_id").references(() => generationRuns.id, { onDelete: "set null" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  generator: text("generator").notNull().default("manual"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  settingsJson: jsonString("settings_json").notNull().default("{}"),
  rawOutputJson: jsonString("raw_output_json"),
  createdAt: isoTime("created_at").notNull(),
  updatedAt: isoTime("updated_at").notNull()
});

export const vocabularyItems = appSchema.table("vocabulary_items", {
  id: uuid("id").primaryKey(),
  studySetId: uuid("study_set_id").notNull().references(() => studySets.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  chapterRevisionId: uuid("chapter_revision_id"),
  term: text("term").notNull(),
  definition: text("definition").notNull(),
  contextSentence: text("context_sentence"),
  partOfSpeech: text("part_of_speech"),
  difficulty: text("difficulty"),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: isoTime("created_at").notNull(),
  updatedAt: isoTime("updated_at").notNull()
});

export const multipleChoiceQuestions = appSchema.table("multiple_choice_questions", {
  id: uuid("id").primaryKey(),
  studySetId: uuid("study_set_id").notNull().references(() => studySets.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  chapterRevisionId: uuid("chapter_revision_id"),
  questionText: text("question_text").notNull(),
  choicesJson: jsonString("choices_json").notNull(),
  correctChoiceIndex: integer("correct_choice_index").notNull(),
  explanation: text("explanation"),
  skill: text("skill"),
  difficulty: text("difficulty"),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: isoTime("created_at").notNull(),
  updatedAt: isoTime("updated_at").notNull()
});

export const shortAnswerQuestions = appSchema.table("short_answer_questions", {
  id: uuid("id").primaryKey(),
  studySetId: uuid("study_set_id").notNull().references(() => studySets.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  chapterRevisionId: uuid("chapter_revision_id"),
  questionText: text("question_text").notNull(),
  suggestedAnswer: text("suggested_answer").notNull(),
  rubric: text("rubric"),
  skill: text("skill"),
  difficulty: text("difficulty"),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: isoTime("created_at").notNull(),
  updatedAt: isoTime("updated_at").notNull()
});

export const chapterSummaries = appSchema.table("chapter_summaries", {
  id: uuid("id").primaryKey(),
  studySetId: uuid("study_set_id").notNull().references(() => studySets.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  chapterRevisionId: uuid("chapter_revision_id"),
  summaryText: text("summary_text").notNull(),
  status: text("status").notNull().default("draft"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: isoTime("created_at").notNull(),
  updatedAt: isoTime("updated_at").notNull()
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
export type ChapterSummaryItem = typeof chapterSummaries.$inferSelect;
export type NewChapterSummaryItem = typeof chapterSummaries.$inferInsert;

export const libraries = appSchema.table("libraries", { id: uuid("id").primaryKey(), name: text("name").notNull(), createdAt: isoTime("created_at").notNull() });
export const libraryMemberships = appSchema.table("library_memberships", { libraryId: uuid("library_id").notNull(), userId: uuid("user_id").notNull(), role: text("role").notNull(), createdAt: isoTime("created_at").notNull().defaultNow() }, t => [primaryKey({ columns: [t.libraryId, t.userId] })]);

export const authSessions = appSchema.table("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull(),
  expires: isoTime("expires").notNull()
});
