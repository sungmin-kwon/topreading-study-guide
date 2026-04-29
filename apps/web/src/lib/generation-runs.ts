import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { books, generationRuns, studySets, type GenerationRun } from "@/lib/db/schema";
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
  const timestamp = nowIso();
  const row = {
    id: randomUUID(),
    bookId: input.bookId,
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
    name: input.name === undefined ? existing.name : input.name?.trim() || null,
    status: normalizeStatus(input.status) || existing.status,
    progressJson: input.progress === undefined ? existing.progressJson : JSON.stringify(input.progress),
    logJson: input.log === undefined ? existing.logJson : JSON.stringify(input.log),
    errorMessage: input.errorMessage === undefined ? existing.errorMessage : input.errorMessage,
    finishedAt: input.finishedAt === undefined ? existing.finishedAt : input.finishedAt,
    updatedAt: nowIso()
  };

  await db.update(generationRuns).set(updates).where(eq(generationRuns.id, input.id));
  return getGenerationRun(input.id);
}

export async function deleteGenerationRun(id: string): Promise<void> {
  await deleteStudySetsForRun(id);
  await db.delete(generationRuns).where(eq(generationRuns.id, id));
}

async function backfillLegacyStudySetsForBook(bookId: string) {
  const orphanStudySets = await db
    .select()
    .from(studySets)
    .where(and(eq(studySets.bookId, bookId), isNull(studySets.generationRunId)));

  if (!orphanStudySets.length) {
    return null;
  }

  const timestamp = nowIso();
  const chapterIds = [...new Set(orphanStudySets.map((studySet) => studySet.chapterId).filter(Boolean))];
  const run = {
    id: randomUUID(),
    bookId,
    name: "Legacy study sets",
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
    .where(and(eq(studySets.bookId, bookId), isNull(studySets.generationRunId)));

  const [book] = await db.select().from(books).where(eq(books.id, bookId)).limit(1);
  if (book && !book.activeGenerationRunId) {
    await db
      .update(books)
      .set({
        activeGenerationRunId: run.id,
        updatedAt: timestamp
      })
      .where(eq(books.id, bookId));
  }

  return run;
}

export async function summarizeGenerationRun(run: GenerationRun, index = 0) {
  const studySets = await listStudySetsForRun(run.id);
  const parsedConfig = parseJsonObject(run.configJson);
  let normalizedRun = run;

  if (run.status === "generating") {
    const expectedChapterIds = getConfiguredChapterIds(parsedConfig);
    const completedStudySets = studySets.filter((studySet) => studySet.status === "ready" || studySet.status === "reviewed");
    const generatedChapterIds = new Set<string>();
    for (const studySet of completedStudySets) {
      if (studySet.chapterId) {
        generatedChapterIds.add(studySet.chapterId);
      }
      const items = await listStudyItems(studySet.id);
      for (const item of [...items.vocabulary, ...items.multipleChoice, ...items.shortAnswer]) {
        if (item.chapterId) {
          generatedChapterIds.add(item.chapterId);
        }
      }
    }
    const hasAllExpectedChapters = expectedChapterIds.length > 0
      && expectedChapterIds.every((chapterId) => generatedChapterIds.has(chapterId));

    if (hasAllExpectedChapters) {
      const completed = await updateGenerationRun({
        id: run.id,
        status: "completed",
        progress: {
          ...parseJsonObject(run.progressJson),
          completedChapters: expectedChapterIds.length,
          totalChapters: expectedChapterIds.length,
          currentChapterId: null,
          currentChapterNumber: null,
          repairedFromStaleGeneratingState: true
        },
        log: [
          ...parseJsonArray(run.logJson),
          {
            timestamp: nowIso(),
            level: "warn",
            message: "Run was marked completed after detecting ready study sets for every planned chapter."
          }
        ],
        finishedAt: run.finishedAt || nowIso()
      });
      normalizedRun = completed || run;
    }
  }

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
  await backfillLegacyStudySetsForBook(bookId);
  const runs = await listGenerationRunsForBook(bookId);
  return Promise.all(runs.map((run, index) => summarizeGenerationRun(run, index)));
}
