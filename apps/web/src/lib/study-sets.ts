import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { studySets, type Chapter, type StudySet } from "@/lib/db/schema";
import { listStudyItems } from "@/lib/study-items";

type CreateStudySetInput = {
  bookId: string;
  generationRunId?: string | null;
  chapter?: Chapter | null;
  title?: string;
  generator?: string;
  model?: string | null;
  promptVersion?: string | null;
  settings?: Record<string, unknown>;
};

type UpdateStudySetInput = {
  studySetId: string;
  title?: string;
  status?: string;
  generator?: string;
  model?: string | null;
  promptVersion?: string | null;
  settings?: Record<string, unknown>;
  rawOutput?: unknown;
};

const allowedStatuses = new Set(["draft", "generating", "ready", "reviewed", "archived", "failed"]);

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

function defaultStudySetTitle(chapter: Chapter) {
  return `Chapter ${chapter.chapterNumber}${chapter.title ? `: ${chapter.title}` : ""}`;
}

function normalizeStatus(status: string | undefined) {
  if (!status) {
    return undefined;
  }

  const normalized = status.trim().toLowerCase();
  if (!allowedStatuses.has(normalized)) {
    throw new Error("Study set status is not valid.");
  }

  return normalized;
}

export async function listStudySetsForChapter(bookId: string, chapterId: string): Promise<StudySet[]> {
  const rows = await db
    .select()
    .from(studySets)
    .where(and(eq(studySets.bookId, bookId), eq(studySets.chapterId, chapterId)))
    .orderBy(desc(studySets.createdAt));
  const bookLevelRows = await db
    .select()
    .from(studySets)
    .where(eq(studySets.bookId, bookId))
    .orderBy(desc(studySets.createdAt));
  const matchingBookLevelRows = await filterStudySetsWithChapterItems(
    bookLevelRows.filter((studySet) => studySet.chapterId !== chapterId),
    chapterId
  );

  return dedupeStudySets([...rows, ...matchingBookLevelRows]);
}

export async function listStudySetsForChapterInRun(chapterId: string, generationRunId: string): Promise<StudySet[]> {
  const rows = await db
    .select()
    .from(studySets)
    .where(eq(studySets.generationRunId, generationRunId))
    .orderBy(desc(studySets.createdAt));

  return filterStudySetsForChapter(rows, chapterId);
}

export async function countStudySetsForBook(bookId: string): Promise<number> {
  const rows = await db
    .select({ id: studySets.id })
    .from(studySets)
    .where(eq(studySets.bookId, bookId));

  return rows.length;
}

export async function listStudySetsForRun(generationRunId: string): Promise<StudySet[]> {
  return db
    .select()
    .from(studySets)
    .where(eq(studySets.generationRunId, generationRunId))
    .orderBy(desc(studySets.createdAt));
}

export async function getStudySet(studySetId: string): Promise<StudySet | null> {
  const rows = await db
    .select()
    .from(studySets)
    .where(eq(studySets.id, studySetId))
    .limit(1);

  return rows[0] || null;
}

export async function createStudySet(input: CreateStudySetInput): Promise<StudySet> {
  if (input.chapter && input.chapter.bookId !== input.bookId) {
    throw new Error("Chapter does not belong to this book.");
  }

  const timestamp = nowIso();
  const row = {
    id: randomUUID(),
    bookId: input.bookId,
    generationRunId: input.generationRunId || null,
    chapterId: input.chapter?.id || null,
    title: input.title?.trim() || (input.chapter ? defaultStudySetTitle(input.chapter) : "Study Set"),
    status: "draft",
    generator: input.generator?.trim() || "manual",
    model: input.model || null,
    promptVersion: input.promptVersion || null,
    settingsJson: JSON.stringify(input.settings || {}),
    rawOutputJson: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await db.insert(studySets).values(row);
  return row;
}

export async function updateStudySet(input: UpdateStudySetInput): Promise<StudySet | null> {
  const existing = await getStudySet(input.studySetId);
  if (!existing) {
    return null;
  }

  const updates = {
    title: input.title === undefined ? existing.title : input.title.trim(),
    status: normalizeStatus(input.status) || existing.status,
    generator: input.generator === undefined ? existing.generator : input.generator.trim() || "manual",
    model: input.model === undefined ? existing.model : input.model,
    promptVersion: input.promptVersion === undefined ? existing.promptVersion : input.promptVersion,
    settingsJson: input.settings === undefined ? existing.settingsJson : JSON.stringify(input.settings),
    rawOutputJson: input.rawOutput === undefined ? existing.rawOutputJson : JSON.stringify(input.rawOutput),
    updatedAt: nowIso()
  };

  if (!updates.title) {
    throw new Error("Study set title cannot be empty.");
  }

  await db
    .update(studySets)
    .set(updates)
    .where(eq(studySets.id, input.studySetId));

  return getStudySet(input.studySetId);
}

export async function deleteStudySet(studySetId: string): Promise<void> {
  await db.delete(studySets).where(eq(studySets.id, studySetId));
}

export async function deleteStudySetsForRun(generationRunId: string): Promise<void> {
  await db.delete(studySets).where(eq(studySets.generationRunId, generationRunId));
}

export async function getStudySetForBook(bookId: string, studySetId: string): Promise<StudySet | null> {
  const rows = await db
    .select()
    .from(studySets)
    .where(and(eq(studySets.bookId, bookId), eq(studySets.id, studySetId)))
    .limit(1);

  return rows[0] || null;
}

export async function getLatestStudySetForChapter(bookId: string, chapterId: string): Promise<StudySet | null> {
  const rows = await db
    .select()
    .from(studySets)
    .where(and(eq(studySets.bookId, bookId), eq(studySets.chapterId, chapterId)))
    .orderBy(desc(studySets.createdAt))
    .limit(1);

  return rows[0] || null;
}

export async function getStudySetForChapterInRun(bookId: string, chapterId: string, generationRunId: string): Promise<StudySet | null> {
  const rows = await db
    .select()
    .from(studySets)
    .where(and(
      eq(studySets.bookId, bookId),
      eq(studySets.generationRunId, generationRunId)
    ))
    .orderBy(desc(studySets.createdAt))
    .limit(10);

  const matching = await filterStudySetsForChapter(rows, chapterId);
  return matching[0] || null;
}

function dedupeStudySets(rows: StudySet[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) {
      return false;
    }
    seen.add(row.id);
    return true;
  });
}

async function studySetHasItemsForChapter(studySetId: string, chapterId: string) {
  const items = await listStudyItems(studySetId, { chapterId });
  return items.summaries.length > 0 || items.vocabulary.length > 0 || items.multipleChoice.length > 0 || items.shortAnswer.length > 0;
}

async function filterStudySetsWithChapterItems(rows: StudySet[], chapterId: string) {
  const checks = await Promise.all(rows.map(async (studySet) => ({
    studySet,
    hasItems: await studySetHasItemsForChapter(studySet.id, chapterId)
  })));
  return checks.filter((check) => check.hasItems).map((check) => check.studySet);
}

async function filterStudySetsForChapter(rows: StudySet[], chapterId: string) {
  const anchored = rows.filter((studySet) => studySet.chapterId === chapterId);
  const bookLevel = await filterStudySetsWithChapterItems(
    rows.filter((studySet) => studySet.chapterId !== chapterId),
    chapterId
  );
  return dedupeStudySets([...anchored, ...bookLevel]);
}

export function summarizeStudySet(studySet: StudySet) {
  return {
    id: studySet.id,
    bookId: studySet.bookId,
    generationRunId: studySet.generationRunId,
    chapterId: studySet.chapterId,
    title: studySet.title,
    status: studySet.status,
    generator: studySet.generator,
    model: studySet.model,
    promptVersion: studySet.promptVersion,
    settings: parseJsonObject(studySet.settingsJson),
    hasRawOutput: Boolean(studySet.rawOutputJson),
    createdAt: studySet.createdAt,
    updatedAt: studySet.updatedAt
  };
}

export function serializeStudySetDetail(studySet: StudySet) {
  return {
    ...summarizeStudySet(studySet),
    rawOutput: studySet.rawOutputJson ? JSON.parse(studySet.rawOutputJson) : null
  };
}
