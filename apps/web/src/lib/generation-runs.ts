import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, inArray, sql } from "drizzle-orm";
import { atomic, db } from "@/lib/db/client";
import { books, chapters, generationRuns, studySets, type GenerationRun } from "@/lib/db/schema";
import { listStudyItems } from "@/lib/study-items";
import { deleteStudySetsForRun, listStudySetsForRun } from "@/lib/study-sets";

type CreateGenerationRunInput = {
  bookId: string;
  name?: string | null;
  config?: Record<string, unknown>;
};

type UpdateGenerationRunInput = {
  id: string;
  name?: string | null;
  status?: string;
  progress?: Record<string, unknown>;
  log?: Array<string | GenerationLogEntry>;
  errorMessage?: string | null;
  finishedAt?: string | null;
};

export type GenerationLogEntry = {
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
};

const allowedStatuses = new Set(["draft", "generating", "completed", "failed", "cancelled"]);

function nowIso() {
  return new Date().toISOString();
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function parseJsonArray(value: string | null | undefined): GenerationLogEntry[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item) => {
    if (item && typeof item === "object") {
      const entry = item as Partial<GenerationLogEntry>;
      return {
        timestamp: String(entry.timestamp || ""),
        level: entry.level === "success" || entry.level === "warn" || entry.level === "error" ? entry.level : "info",
        message: String(entry.message || "")
      };
    }

    return {
      timestamp: "",
      level: "info",
      message: String(item)
    };
  });
}

function normalizeStatus(status: string | undefined) {
  if (!status) {
    return undefined;
  }

  const normalized = status.trim().toLowerCase();
  if (!allowedStatuses.has(normalized)) {
    throw new Error("Generation run status is not valid.");
  }

  return normalized;
}

function getConfiguredChapterIds(config: Record<string, unknown>) {
  const chapters = Array.isArray(config.chapters) ? config.chapters : [];
  return chapters
    .map((item) => {
      const chapter = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return String(chapter.chapterId || "");
    })
    .filter(Boolean);
}

export async function createGenerationRun(input: CreateGenerationRunInput): Promise<GenerationRun> {
  return atomic(async () => {
    await db.execute(sql`SELECT id FROM ${books} WHERE id=${input.bookId} FOR UPDATE`);
    const [sourceBook] = await db.select().from(books).where(eq(books.id, input.bookId));
    if (!sourceBook) throw new Error("Book not found.");
    const ids = getConfiguredChapterIds(input.config || {});
    if (ids.length) {
      const selected = await db.select().from(chapters).where(inArray(chapters.id, ids));
      if (selected.length !== new Set(ids).size || selected.some(chapter =>
        chapter.bookId !== input.bookId || chapter.layoutId !== sourceBook.activeLayoutId
      )) {
        throw new Error("Chapter selection is from another layout. Reload before generating.");
      }
    }
    const timestamp = nowIso();
    const row = {
      id: randomUUID(),
      bookId: input.bookId,
      layoutId: sourceBook.activeLayoutId,
      name: input.name?.trim() || null,
      status: "draft",
      configJson: JSON.stringify(input.config || {}),
      progressJson: JSON.stringify({ completedChapters: 0 }),
      logJson: JSON.stringify([]),
      errorMessage: null,
      startedAt: timestamp,
      finishedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    await db.insert(generationRuns).values(row);
    return row;
  });
}

export async function getGenerationRun(id: string): Promise<GenerationRun | null> {
  const rows = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.id, id))
    .limit(1);

  return rows[0] || null;
}

export async function listGenerationRunsForBook(bookId: string): Promise<GenerationRun[]> {
  return db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.bookId, bookId))
    .orderBy(desc(generationRuns.startedAt), desc(generationRuns.createdAt));
}

export async function getGeneratingRunForBook(bookId: string): Promise<GenerationRun | null> {
  const rows = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.bookId, bookId))
    .orderBy(desc(generationRuns.startedAt), desc(generationRuns.createdAt));

  return rows.find((run) => run.status === "generating") || null;
}

export async function updateGenerationRun(input: UpdateGenerationRunInput): Promise<GenerationRun | null> {
  const existing = await getGenerationRun(input.id);
  if (!existing) {
    return null;
  }

  const updates = {
    ...(input.name === undefined ? {} : { name: input.name?.trim() || null }),
    ...(input.status === undefined ? {} : { status: normalizeStatus(input.status) }),
    ...(input.progress === undefined ? {} : { progressJson: JSON.stringify(input.progress) }),
    ...(input.log === undefined ? {} : { logJson: JSON.stringify(input.log) }),
    ...(input.errorMessage === undefined ? {} : { errorMessage: input.errorMessage }),
    ...(input.finishedAt === undefined ? {} : { finishedAt: input.finishedAt }),
    updatedAt: nowIso()
  };

  await db.update(generationRuns).set(updates).where(eq(generationRuns.id, input.id));
  return getGenerationRun(input.id);
}

export async function deleteGenerationRun(id: string): Promise<void> {
  return atomic(async () => {
    await deleteStudySetsForRun(id);
    await db.delete(generationRuns).where(eq(generationRuns.id, id));
  });
}

async function backfillLegacyStudySetsForBook(bookId: string) {
  const allOrphans = await db
    .select()
    .from(studySets)
    .where(and(eq(studySets.bookId, bookId), isNull(studySets.generationRunId)));

  if (!allOrphans.length) {
    return null;
  }

  const sourceChapters = await db.select().from(chapters).where(eq(chapters.bookId,bookId));
  const layouts = new Map(sourceChapters.map(chapter => [chapter.id, chapter.layoutId]));
  const layoutId = layouts.get(allOrphans[0].chapterId || "") || null;
  const orphanStudySets = allOrphans.filter(set => (layouts.get(set.chapterId || "") || null) === layoutId);
  const timestamp = nowIso();
  const chapterIds = [...new Set(orphanStudySets.map((studySet) => studySet.chapterId).filter(Boolean))];
  const run = {
    id: randomUUID(),
    bookId,
    name: "Legacy study sets",
    layoutId,
    status: "completed",
    configJson: JSON.stringify({
      backfilledFromLegacyStudySets: true,
      chapters: chapterIds.map((chapterId) => ({ chapterId }))
    }),
    progressJson: JSON.stringify({
      completedChapters: chapterIds.length || orphanStudySets.length,
      totalChapters: chapterIds.length || orphanStudySets.length,
      currentChapterId: null,
      currentChapterNumber: null,
      backfilledFromLegacyStudySets: true
    }),
    logJson: JSON.stringify([
      {
        timestamp,
        level: "info",
        message: `Created generation history entry for ${orphanStudySets.length} legacy study set${orphanStudySets.length === 1 ? "" : "s"}.`
      }
    ]),
    errorMessage: null,
    startedAt: orphanStudySets[0]?.createdAt || timestamp,
    finishedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await db.insert(generationRuns).values(run);
  await db
    .update(studySets)
    .set({
      generationRunId: run.id,
      updatedAt: timestamp
    })
    .where(inArray(studySets.id, orphanStudySets.map(set => set.id)));

  const [book] = await db.select().from(books).where(eq(books.id, bookId)).limit(1);
  if (book && !book.activeGenerationRunId && book.activeLayoutId === layoutId) {
    await db
      .update(books)
      .set({
        activeGenerationRunId: run.id,
        updatedAt: timestamp
      })
      .where(eq(books.id, bookId));
  }

  if (allOrphans.length > orphanStudySets.length) await backfillLegacyStudySetsForBook(bookId);
  return run;
}

export async function summarizeGenerationRun(run: GenerationRun, index = 0) {
  const studySets = await listStudySetsForRun(run.id);
  const parsedConfig = parseJsonObject(run.configJson);
  let normalizedRun = run;

  const itemGroups = await Promise.all(studySets.map((studySet) => listStudyItems(studySet.id)));
  const vocabularyCount = itemGroups.reduce((total, items) => total + items.vocabulary.length, 0);
  const multipleChoiceCount = itemGroups.reduce((total, items) => total + items.multipleChoice.length, 0);
  const shortAnswerCount = itemGroups.reduce((total, items) => total + items.shortAnswer.length, 0);

  return {
    id: normalizedRun.id,
    bookId: normalizedRun.bookId,
    name: normalizedRun.name || `Run ${index + 1}`,
    status: normalizedRun.status,
    config: parseJsonObject(normalizedRun.configJson),
    progress: parseJsonObject(normalizedRun.progressJson),
    log: parseJsonArray(normalizedRun.logJson),
    errorMessage: normalizedRun.errorMessage,
    chapterCount: getConfiguredChapterIds(parsedConfig).length || studySets.length,
    vocabularyCount,
    multipleChoiceCount,
    shortAnswerCount,
    startedAt: normalizedRun.startedAt,
    finishedAt: normalizedRun.finishedAt,
    createdAt: normalizedRun.createdAt,
    updatedAt: normalizedRun.updatedAt
  };
}

export async function summarizeGenerationRunsForBook(bookId: string) {
  await atomic(async () => {
    // Backfill can select an active guide, so serialize it with layout changes.
    await db.execute(sql`SELECT id FROM ${books} WHERE id=${bookId} FOR UPDATE`);
    await backfillLegacyStudySetsForBook(bookId);
  });
  const runs = await listGenerationRunsForBook(bookId);
  return Promise.all(runs.map((run, index) => summarizeGenerationRun(run, index)));
}
