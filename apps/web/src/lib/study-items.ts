import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  multipleChoiceQuestions,
  shortAnswerQuestions,
  vocabularyItems,
  type MultipleChoiceQuestion,
  type ShortAnswerQuestion,
  type VocabularyItem
} from "@/lib/db/schema";

export type VocabularyItemInput = {
  term?: unknown;
  definition?: unknown;
  contextSentence?: unknown;
  partOfSpeech?: unknown;
  difficulty?: unknown;
  status?: unknown;
  sortOrder?: unknown;
};

export type MultipleChoiceQuestionInput = {
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
  questionText?: unknown;
  suggestedAnswer?: unknown;
  rubric?: unknown;
  skill?: unknown;
  difficulty?: unknown;
  status?: unknown;
  sortOrder?: unknown;
};

export type StudyItemsInput = {
  vocabularyItems?: VocabularyItemInput[];
  multipleChoiceQuestions?: MultipleChoiceQuestionInput[];
  shortAnswerQuestions?: ShortAnswerQuestionInput[];
};

export type StudyItemKind = "vocabulary" | "multiple-choice" | "short-answer";

const allowedItemStatuses = new Set(["draft", "reviewed", "approved", "rejected", "archived"]);

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

function normalizeVocabularyInput(studySetId: string, item: VocabularyItemInput, index: number) {
  const term = asString(item.term);
  const definition = asString(item.definition);

  if (!term || !definition) {
    throw new Error("Vocabulary items need both a term and a definition.");
  }

  const timestamp = nowIso();
  return {
    id: randomUUID(),
    studySetId,
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

function normalizeMultipleChoiceInput(studySetId: string, item: MultipleChoiceQuestionInput, index: number) {
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

function normalizeShortAnswerInput(studySetId: string, item: ShortAnswerQuestionInput, index: number) {
  const questionText = asString(item.questionText);
  const suggestedAnswer = asString(item.suggestedAnswer);

  if (!questionText || !suggestedAnswer) {
    throw new Error("Short-answer questions need question text and a suggested answer.");
  }

  const timestamp = nowIso();
  return {
    id: randomUUID(),
    studySetId,
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

export async function listStudyItems(studySetId: string) {
  const [vocabulary, multipleChoice, shortAnswer] = await Promise.all([
    db.select().from(vocabularyItems).where(eq(vocabularyItems.studySetId, studySetId)).orderBy(asc(vocabularyItems.sortOrder)),
    db.select().from(multipleChoiceQuestions).where(eq(multipleChoiceQuestions.studySetId, studySetId)).orderBy(asc(multipleChoiceQuestions.sortOrder)),
    db.select().from(shortAnswerQuestions).where(eq(shortAnswerQuestions.studySetId, studySetId)).orderBy(asc(shortAnswerQuestions.sortOrder))
  ]);

  return { vocabulary, multipleChoice, shortAnswer };
}

export async function appendStudyItems(studySetId: string, input: StudyItemsInput) {
  const existing = await listStudyItems(studySetId);
  const vocabulary = (input.vocabularyItems || []).map((item, index) => normalizeVocabularyInput(studySetId, item, existing.vocabulary.length + index));
  const multipleChoice = (input.multipleChoiceQuestions || []).map((item, index) => normalizeMultipleChoiceInput(studySetId, item, existing.multipleChoice.length + index));
  const shortAnswer = (input.shortAnswerQuestions || []).map((item, index) => normalizeShortAnswerInput(studySetId, item, existing.shortAnswer.length + index));

  if (vocabulary.length) {
    await db.insert(vocabularyItems).values(vocabulary);
  }

  if (multipleChoice.length) {
    await db.insert(multipleChoiceQuestions).values(multipleChoice);
  }

  if (shortAnswer.length) {
    await db.insert(shortAnswerQuestions).values(shortAnswer);
  }

  return listStudyItems(studySetId);
}

export async function replaceStudyItems(studySetId: string, input: StudyItemsInput) {
  await db.delete(vocabularyItems).where(eq(vocabularyItems.studySetId, studySetId));
  await db.delete(multipleChoiceQuestions).where(eq(multipleChoiceQuestions.studySetId, studySetId));
  await db.delete(shortAnswerQuestions).where(eq(shortAnswerQuestions.studySetId, studySetId));

  return appendStudyItems(studySetId, input);
}

export async function clearStudyItems(studySetId: string) {
  await db.delete(vocabularyItems).where(eq(vocabularyItems.studySetId, studySetId));
  await db.delete(multipleChoiceQuestions).where(eq(multipleChoiceQuestions.studySetId, studySetId));
  await db.delete(shortAnswerQuestions).where(eq(shortAnswerQuestions.studySetId, studySetId));
}

export async function updateVocabularyItem(studySetId: string, itemId: string, input: VocabularyItemInput) {
  await db
    .update(vocabularyItems)
    .set({
      term: input.term === undefined ? undefined : asString(input.term),
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

export function summarizeStudyItems(items: Awaited<ReturnType<typeof listStudyItems>>) {
  return {
    vocabularyItems: items.vocabulary.map(summarizeVocabularyItem),
    multipleChoiceQuestions: items.multipleChoice.map(summarizeMultipleChoiceQuestion),
    shortAnswerQuestions: items.shortAnswer.map(summarizeShortAnswerQuestion)
  };
}
