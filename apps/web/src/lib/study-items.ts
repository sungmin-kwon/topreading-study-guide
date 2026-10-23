import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  chapterSummaries,
  multipleChoiceQuestions,
  shortAnswerQuestions,
  vocabularyItems,
  type ChapterSummaryItem,
  type MultipleChoiceQuestion,
  type ShortAnswerQuestion,
  type VocabularyItem
} from "@/lib/db/schema";
import { balanceCorrectChoicePositions } from "@/lib/mcq-shuffle";

export type VocabularyItemInput = {
  chapterId?: unknown;
  term?: unknown;
  definition?: unknown;
  contextSentence?: unknown;
  partOfSpeech?: unknown;
  difficulty?: unknown;
  status?: unknown;
  sortOrder?: unknown;
};

export type MultipleChoiceQuestionInput = {
  chapterId?: unknown;
  questionText?: unknown;
  choices?: unknown;
  correctChoiceIndex?: unknown;
  explanation?: unknown;
  skill?: unknown;
  difficulty?: unknown;
  status?: unknown;
  sortOrder?: unknown;
};

export type ShortAnswerQuestionInput = {
  chapterId?: unknown;
  questionText?: unknown;
  suggestedAnswer?: unknown;
  rubric?: unknown;
  skill?: unknown;
  difficulty?: unknown;
  status?: unknown;
  sortOrder?: unknown;
};

export type ChapterSummaryInput = {
  chapterId?: unknown;
  summaryText?: unknown;
  status?: unknown;
  sortOrder?: unknown;
};

export type StudyItemsInput = {
  chapterSummaries?: ChapterSummaryInput[];
  vocabularyItems?: VocabularyItemInput[];
  multipleChoiceQuestions?: MultipleChoiceQuestionInput[];
  shortAnswerQuestions?: ShortAnswerQuestionInput[];
};

type StudyItemsOptions = {
  chapterId?: string | null;
};

export type StudyItemKind = "vocabulary" | "multiple-choice" | "short-answer";
export type StudyItemMoveDirection = "up" | "down";

const allowedItemStatuses = new Set(["draft", "needs_review", "reviewed", "approved", "rejected", "archived"]);

function nowIso() {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNullableString(value: unknown) {
  const text = asString(value);
  return text || null;
}

function asPositiveInteger(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function normalizeStatus(value: unknown) {
  const status = asString(value, "draft").toLowerCase();
  if (!allowedItemStatuses.has(status)) {
    throw new Error("Generated item status is not valid.");
  }

  return status;
}

function parseJsonArray(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
}

function normalizeChoices(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Multiple-choice questions need a choices array.");
  }

  const choices = value.map((choice) => asString(choice)).filter(Boolean);
  if (choices.length < 2) {
    throw new Error("Multiple-choice questions need at least two choices.");
  }

  return choices;
}

function normalizeCorrectChoiceIndex(value: unknown, choices: string[]) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
    throw new Error("The correct choice index is outside the choices array.");
  }

  return index;
}

function normalizeChapterId(item: { chapterId?: unknown }, options?: StudyItemsOptions) {
  return asNullableString(item.chapterId) || options?.chapterId || null;
}

function normalizeVocabularyInput(studySetId: string, item: VocabularyItemInput, index: number, options?: StudyItemsOptions) {
  const term = asString(item.term);
  const definition = asString(item.definition);

  if (!term || !definition) {
    throw new Error("Vocabulary items need both a term and a definition.");
  }

  const timestamp = nowIso();
  return {
    id: randomUUID(),
    studySetId,
    chapterId: normalizeChapterId(item, options),
    term,
    definition,
    contextSentence: asNullableString(item.contextSentence),
    partOfSpeech: asNullableString(item.partOfSpeech),
    difficulty: asNullableString(item.difficulty),
    status: normalizeStatus(item.status),
    sortOrder: asPositiveInteger(item.sortOrder, index + 1),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function normalizeMultipleChoiceInput(studySetId: string, item: MultipleChoiceQuestionInput, index: number, options?: StudyItemsOptions) {
  const questionText = asString(item.questionText);
  const choices = normalizeChoices(item.choices);
  const correctChoiceIndex = normalizeCorrectChoiceIndex(item.correctChoiceIndex, choices);

  if (!questionText) {
    throw new Error("Multiple-choice questions need question text.");
  }

  const timestamp = nowIso();
  return {
    id: randomUUID(),
    studySetId,
    chapterId: normalizeChapterId(item, options),
    questionText,
    choicesJson: JSON.stringify(choices),
    correctChoiceIndex,
    explanation: asNullableString(item.explanation),
    skill: asNullableString(item.skill),
    difficulty: asNullableString(item.difficulty),
    status: normalizeStatus(item.status),
    sortOrder: asPositiveInteger(item.sortOrder, index + 1),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function normalizeShortAnswerInput(studySetId: string, item: ShortAnswerQuestionInput, index: number, options?: StudyItemsOptions) {
  const questionText = asString(item.questionText);
  const suggestedAnswer = asString(item.suggestedAnswer);

  if (!questionText || !suggestedAnswer) {
    throw new Error("Short-answer questions need question text and a suggested answer.");
  }

  const timestamp = nowIso();
  return {
    id: randomUUID(),
    studySetId,
    chapterId: normalizeChapterId(item, options),
    questionText,
    suggestedAnswer,
    rubric: asNullableString(item.rubric),
    skill: asNullableString(item.skill),
    difficulty: asNullableString(item.difficulty),
    status: normalizeStatus(item.status),
    sortOrder: asPositiveInteger(item.sortOrder, index + 1),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function normalizeChapterSummaryInput(studySetId: string, item: ChapterSummaryInput, index: number, options?: StudyItemsOptions) {
  const summaryText = asString(item.summaryText);

  if (!summaryText) {
    throw new Error("Chapter summaries need summary text.");
  }

  const timestamp = nowIso();
  return {
    id: randomUUID(),
    studySetId,
    chapterId: normalizeChapterId(item, options),
    summaryText,
    status: normalizeStatus(item.status),
    sortOrder: asPositiveInteger(item.sortOrder, index + 1),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export async function listStudyItems(studySetId: string, options: StudyItemsOptions = {}) {
  const whereSummary = options.chapterId
    ? and(eq(chapterSummaries.studySetId, studySetId), eq(chapterSummaries.chapterId, options.chapterId))
    : eq(chapterSummaries.studySetId, studySetId);
  const whereVocabulary = options.chapterId
    ? and(eq(vocabularyItems.studySetId, studySetId), eq(vocabularyItems.chapterId, options.chapterId))
    : eq(vocabularyItems.studySetId, studySetId);
  const whereMultipleChoice = options.chapterId
    ? and(eq(multipleChoiceQuestions.studySetId, studySetId), eq(multipleChoiceQuestions.chapterId, options.chapterId))
    : eq(multipleChoiceQuestions.studySetId, studySetId);
  const whereShortAnswer = options.chapterId
    ? and(eq(shortAnswerQuestions.studySetId, studySetId), eq(shortAnswerQuestions.chapterId, options.chapterId))
    : eq(shortAnswerQuestions.studySetId, studySetId);

  const [summaries, vocabulary, multipleChoice, shortAnswer] = await Promise.all([
    db.select().from(chapterSummaries).where(whereSummary).orderBy(asc(chapterSummaries.chapterId), asc(chapterSummaries.sortOrder)),
    db.select().from(vocabularyItems).where(whereVocabulary).orderBy(asc(vocabularyItems.chapterId), asc(vocabularyItems.sortOrder)),
    db.select().from(multipleChoiceQuestions).where(whereMultipleChoice).orderBy(asc(multipleChoiceQuestions.chapterId), asc(multipleChoiceQuestions.sortOrder)),
    db.select().from(shortAnswerQuestions).where(whereShortAnswer).orderBy(asc(shortAnswerQuestions.chapterId), asc(shortAnswerQuestions.sortOrder))
  ]);

  return { summaries, vocabulary, multipleChoice, shortAnswer };
}

export async function appendStudyItems(studySetId: string, input: StudyItemsInput, options: StudyItemsOptions = {}) {
  const existing = await listStudyItems(studySetId, options);
  const summaries = (input.chapterSummaries || []).map((item, index) => normalizeChapterSummaryInput(studySetId, item, existing.summaries.length + index, options));
  const vocabulary = (input.vocabularyItems || []).map((item, index) => normalizeVocabularyInput(studySetId, item, existing.vocabulary.length + index, options));
  const multipleChoice = (input.multipleChoiceQuestions || []).map((item, index) => normalizeMultipleChoiceInput(studySetId, item, existing.multipleChoice.length + index, options));
  const shortAnswer = (input.shortAnswerQuestions || []).map((item, index) => normalizeShortAnswerInput(studySetId, item, existing.shortAnswer.length + index, options));

  if (summaries.length) {
    await db.insert(chapterSummaries).values(summaries);
  }

  if (vocabulary.length) {
    await db.insert(vocabularyItems).values(vocabulary);
  }

  if (multipleChoice.length) {
    await db.insert(multipleChoiceQuestions).values(multipleChoice);
  }

  if (shortAnswer.length) {
    await db.insert(shortAnswerQuestions).values(shortAnswer);
  }

  return listStudyItems(studySetId, options);
}

export async function replaceStudyItems(studySetId: string, input: StudyItemsInput, options: StudyItemsOptions = {}) {
  const summaryWhere = options.chapterId
    ? and(eq(chapterSummaries.studySetId, studySetId), eq(chapterSummaries.chapterId, options.chapterId))
    : eq(chapterSummaries.studySetId, studySetId);
  const vocabularyWhere = options.chapterId
    ? and(eq(vocabularyItems.studySetId, studySetId), eq(vocabularyItems.chapterId, options.chapterId))
    : eq(vocabularyItems.studySetId, studySetId);
  const multipleChoiceWhere = options.chapterId
    ? and(eq(multipleChoiceQuestions.studySetId, studySetId), eq(multipleChoiceQuestions.chapterId, options.chapterId))
    : eq(multipleChoiceQuestions.studySetId, studySetId);
  const shortAnswerWhere = options.chapterId
    ? and(eq(shortAnswerQuestions.studySetId, studySetId), eq(shortAnswerQuestions.chapterId, options.chapterId))
    : eq(shortAnswerQuestions.studySetId, studySetId);

  await db.delete(chapterSummaries).where(summaryWhere);
  await db.delete(vocabularyItems).where(vocabularyWhere);
  await db.delete(multipleChoiceQuestions).where(multipleChoiceWhere);
  await db.delete(shortAnswerQuestions).where(shortAnswerWhere);

  return appendStudyItems(studySetId, input, options);
}

export async function clearStudyItems(studySetId: string) {
  await db.delete(chapterSummaries).where(eq(chapterSummaries.studySetId, studySetId));
  await db.delete(vocabularyItems).where(eq(vocabularyItems.studySetId, studySetId));
  await db.delete(multipleChoiceQuestions).where(eq(multipleChoiceQuestions.studySetId, studySetId));
  await db.delete(shortAnswerQuestions).where(eq(shortAnswerQuestions.studySetId, studySetId));
}

export async function updateVocabularyItem(studySetId: string, itemId: string, input: VocabularyItemInput) {
  await db
    .update(vocabularyItems)
    .set({
      term: input.term === undefined ? undefined : asString(input.term),
      chapterId: input.chapterId === undefined ? undefined : asNullableString(input.chapterId),
      definition: input.definition === undefined ? undefined : asString(input.definition),
      contextSentence: input.contextSentence === undefined ? undefined : asNullableString(input.contextSentence),
      partOfSpeech: input.partOfSpeech === undefined ? undefined : asNullableString(input.partOfSpeech),
      difficulty: input.difficulty === undefined ? undefined : asNullableString(input.difficulty),
      status: input.status === undefined ? undefined : normalizeStatus(input.status),
      sortOrder: input.sortOrder === undefined ? undefined : asPositiveInteger(input.sortOrder, 1),
      updatedAt: nowIso()
    })
    .where(and(eq(vocabularyItems.studySetId, studySetId), eq(vocabularyItems.id, itemId)));
}

export async function updateMultipleChoiceQuestion(studySetId: string, itemId: string, input: MultipleChoiceQuestionInput) {
  const choices = input.choices === undefined ? undefined : normalizeChoices(input.choices);
  const correctChoiceIndex = choices
    ? normalizeCorrectChoiceIndex(input.correctChoiceIndex, choices)
    : input.correctChoiceIndex === undefined
      ? undefined
      : Number(input.correctChoiceIndex);

  await db
    .update(multipleChoiceQuestions)
    .set({
      questionText: input.questionText === undefined ? undefined : asString(input.questionText),
      chapterId: input.chapterId === undefined ? undefined : asNullableString(input.chapterId),
      choicesJson: choices === undefined ? undefined : JSON.stringify(choices),
      correctChoiceIndex,
      explanation: input.explanation === undefined ? undefined : asNullableString(input.explanation),
      skill: input.skill === undefined ? undefined : asNullableString(input.skill),
      difficulty: input.difficulty === undefined ? undefined : asNullableString(input.difficulty),
      status: input.status === undefined ? undefined : normalizeStatus(input.status),
      sortOrder: input.sortOrder === undefined ? undefined : asPositiveInteger(input.sortOrder, 1),
      updatedAt: nowIso()
    })
    .where(and(eq(multipleChoiceQuestions.studySetId, studySetId), eq(multipleChoiceQuestions.id, itemId)));
}

export async function updateShortAnswerQuestion(studySetId: string, itemId: string, input: ShortAnswerQuestionInput) {
  await db
    .update(shortAnswerQuestions)
    .set({
      questionText: input.questionText === undefined ? undefined : asString(input.questionText),
      chapterId: input.chapterId === undefined ? undefined : asNullableString(input.chapterId),
      suggestedAnswer: input.suggestedAnswer === undefined ? undefined : asString(input.suggestedAnswer),
      rubric: input.rubric === undefined ? undefined : asNullableString(input.rubric),
      skill: input.skill === undefined ? undefined : asNullableString(input.skill),
      difficulty: input.difficulty === undefined ? undefined : asNullableString(input.difficulty),
      status: input.status === undefined ? undefined : normalizeStatus(input.status),
      sortOrder: input.sortOrder === undefined ? undefined : asPositiveInteger(input.sortOrder, 1),
      updatedAt: nowIso()
    })
    .where(and(eq(shortAnswerQuestions.studySetId, studySetId), eq(shortAnswerQuestions.id, itemId)));
}

export async function deleteStudyItem(kind: StudyItemKind, studySetId: string, itemId: string) {
  if (kind === "vocabulary") {
    await db.delete(vocabularyItems).where(and(eq(vocabularyItems.studySetId, studySetId), eq(vocabularyItems.id, itemId)));
    return;
  }

  if (kind === "multiple-choice") {
    await db.delete(multipleChoiceQuestions).where(and(eq(multipleChoiceQuestions.studySetId, studySetId), eq(multipleChoiceQuestions.id, itemId)));
    return;
  }

  await db.delete(shortAnswerQuestions).where(and(eq(shortAnswerQuestions.studySetId, studySetId), eq(shortAnswerQuestions.id, itemId)));
}

export async function moveStudyItem(
  kind: StudyItemKind,
  studySetId: string,
  itemId: string,
  direction: StudyItemMoveDirection,
  options: StudyItemsOptions = {}
) {
  const items = await listStudyItems(studySetId, options);
  const itemList = kind === "vocabulary"
    ? items.vocabulary
    : kind === "multiple-choice"
      ? items.multipleChoice
      : items.shortAnswer;
  const currentIndex = itemList.findIndex((item) => item.id === itemId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex === -1 || nextIndex < 0 || nextIndex >= itemList.length) {
    return listStudyItems(studySetId, options);
  }

  const currentItem = itemList[currentIndex];
  const nextItem = itemList[nextIndex];
  const timestamp = nowIso();

  if (kind === "vocabulary") {
    await db
      .update(vocabularyItems)
      .set({ sortOrder: nextItem.sortOrder, updatedAt: timestamp })
      .where(and(eq(vocabularyItems.studySetId, studySetId), eq(vocabularyItems.id, currentItem.id)));
    await db
      .update(vocabularyItems)
      .set({ sortOrder: currentItem.sortOrder, updatedAt: timestamp })
      .where(and(eq(vocabularyItems.studySetId, studySetId), eq(vocabularyItems.id, nextItem.id)));
  } else if (kind === "multiple-choice") {
    await db
      .update(multipleChoiceQuestions)
      .set({ sortOrder: nextItem.sortOrder, updatedAt: timestamp })
      .where(and(eq(multipleChoiceQuestions.studySetId, studySetId), eq(multipleChoiceQuestions.id, currentItem.id)));
    await db
      .update(multipleChoiceQuestions)
      .set({ sortOrder: currentItem.sortOrder, updatedAt: timestamp })
      .where(and(eq(multipleChoiceQuestions.studySetId, studySetId), eq(multipleChoiceQuestions.id, nextItem.id)));
  } else {
    await db
      .update(shortAnswerQuestions)
      .set({ sortOrder: nextItem.sortOrder, updatedAt: timestamp })
      .where(and(eq(shortAnswerQuestions.studySetId, studySetId), eq(shortAnswerQuestions.id, currentItem.id)));
    await db
      .update(shortAnswerQuestions)
      .set({ sortOrder: currentItem.sortOrder, updatedAt: timestamp })
      .where(and(eq(shortAnswerQuestions.studySetId, studySetId), eq(shortAnswerQuestions.id, nextItem.id)));
  }

  return listStudyItems(studySetId, options);
}

export async function rebalanceStudySetMultipleChoiceAnswers(studySetId: string) {
  const items = await listStudyItems(studySetId);
  const balanced = balanceCorrectChoicePositions(items.multipleChoice.map((item) => ({
    id: item.id,
    questionText: item.questionText,
    explanation: item.explanation,
    choices: parseJsonArray(item.choicesJson),
    correctChoiceIndex: item.correctChoiceIndex
  })));
  const timestamp = nowIso();

  await Promise.all(balanced.map((item) =>
    db
      .update(multipleChoiceQuestions)
      .set({
        choicesJson: JSON.stringify(item.choices),
        correctChoiceIndex: item.correctChoiceIndex,
        updatedAt: timestamp
      })
      .where(and(eq(multipleChoiceQuestions.studySetId, studySetId), eq(multipleChoiceQuestions.id, item.id)))
  ));

  return listStudyItems(studySetId);
}

export async function updateStudyItem(kind: StudyItemKind, studySetId: string, itemId: string, input: unknown) {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};

  if (kind === "vocabulary") {
    await updateVocabularyItem(studySetId, itemId, body);
    return;
  }

  if (kind === "multiple-choice") {
    await updateMultipleChoiceQuestion(studySetId, itemId, body);
    return;
  }

  await updateShortAnswerQuestion(studySetId, itemId, body);
}

export function normalizeStudyItemKind(value: string): StudyItemKind | null {
  if (value === "vocabulary" || value === "multiple-choice" || value === "short-answer") {
    return value;
  }

  return null;
}

export function summarizeVocabularyItem(item: VocabularyItem) {
  return {
    id: item.id,
    studySetId: item.studySetId,
    chapterId: item.chapterId,
    term: item.term,
    definition: item.definition,
    contextSentence: item.contextSentence,
    partOfSpeech: item.partOfSpeech,
    difficulty: item.difficulty,
    status: item.status,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

export function summarizeMultipleChoiceQuestion(item: MultipleChoiceQuestion) {
  return {
    id: item.id,
    studySetId: item.studySetId,
    chapterId: item.chapterId,
    questionText: item.questionText,
    choices: parseJsonArray(item.choicesJson),
    correctChoiceIndex: item.correctChoiceIndex,
    explanation: item.explanation,
    skill: item.skill,
    difficulty: item.difficulty,
    status: item.status,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

export function summarizeShortAnswerQuestion(item: ShortAnswerQuestion) {
  return {
    id: item.id,
    studySetId: item.studySetId,
    chapterId: item.chapterId,
    questionText: item.questionText,
    suggestedAnswer: item.suggestedAnswer,
    rubric: item.rubric,
    skill: item.skill,
    difficulty: item.difficulty,
    status: item.status,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

export function summarizeChapterSummary(item: ChapterSummaryItem) {
  return {
    id: item.id,
    studySetId: item.studySetId,
    chapterId: item.chapterId,
    summaryText: item.summaryText,
    status: item.status,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

export function summarizeStudyItems(items: Awaited<ReturnType<typeof listStudyItems>>) {
  return {
    chapterSummaries: items.summaries.map(summarizeChapterSummary),
    vocabularyItems: items.vocabulary.map(summarizeVocabularyItem),
    multipleChoiceQuestions: items.multipleChoice.map(summarizeMultipleChoiceQuestion),
    shortAnswerQuestions: items.shortAnswer.map(summarizeShortAnswerQuestion)
  };
}
