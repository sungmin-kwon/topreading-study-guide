import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { generationRuns, type GenerationRun } from "@/lib/db/schema";
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

export async function summarizeGenerationRun(run: GenerationRun, index = 0) {
  const studySets = await listStudySetsForRun(run.id);
  const itemGroups = await Promise.all(studySets.map((studySet) => listStudyItems(studySet.id)));
  const vocabularyCount = itemGroups.reduce((total, items) => total + items.vocabulary.length, 0);
  const multipleChoiceCount = itemGroups.reduce((total, items) => total + items.multipleChoice.length, 0);
  const shortAnswerCount = itemGroups.reduce((total, items) => total + items.shortAnswer.length, 0);

  return {
    id: run.id,
    bookId: run.bookId,
    name: run.name || `Run ${index + 1}`,
    status: run.status,
    config: parseJsonObject(run.configJson),
    progress: parseJsonObject(run.progressJson),
    log: parseJsonArray(run.logJson),
    errorMessage: run.errorMessage,
    chapterCount: studySets.length,
    vocabularyCount,
    multipleChoiceCount,
    shortAnswerCount,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt
  };
}

export async function summarizeGenerationRunsForBook(bookId: string) {
  const runs = await listGenerationRunsForBook(bookId);
  return Promise.all(runs.map((run, index) => summarizeGenerationRun(run, index)));
}
