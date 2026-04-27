import { deriveGenerationPlan } from "@topreading/core";
import { type Chapter } from "@/lib/db/schema";
import { balanceCorrectChoicePositions } from "@/lib/mcq-shuffle";
import { replaceStudyItems, summarizeStudyItems } from "@/lib/study-items";
import { createStudySet, deleteStudySet, summarizeStudySet, updateStudySet } from "@/lib/study-sets";

type MockGenerationPlan = {
  vocabularyCount: number;
  multipleChoiceCount: number;
  shortAnswerCount: number;
};

const stopWords = new Set([
  "about", "after", "again", "against", "also", "because", "before", "between", "could", "every",
  "from", "have", "into", "just", "like", "more", "only", "other", "over", "said", "some",
  "than", "that", "their", "them", "then", "there", "these", "they", "this", "through", "upon",
  "were", "what", "when", "where", "which", "while", "with", "would", "your"
]);

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function formatRunTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 40);
}

function extractCandidateTerms(text: string, count: number) {
  const frequencies = new Map<string, number>();
  const firstSeen = new Map<string, string>();
  const words = text.match(/[A-Za-z][A-Za-z'-]{4,}/g) || [];

  for (const word of words) {
    const normalized = word.toLowerCase().replace(/^'+|'+$/g, "");
    if (normalized.length < 5 || stopWords.has(normalized)) {
      continue;
    }

    frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
    if (!firstSeen.has(normalized)) {
      firstSeen.set(normalized, word);
    }
  }

  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([word]) => firstSeen.get(word) || word);
}

function findContextSentence(term: string, sentences: string[]) {
  const normalized = term.toLowerCase();
  return sentences.find((sentence) => sentence.toLowerCase().includes(normalized)) || sentences[0] || "";
}

function buildVocabulary(chapter: Chapter, count: number, sentences: string[]) {
  return extractCandidateTerms(chapter.textContent, count).map((term, index) => ({
    term,
    definition: `Mock definition for "${term}" based on its use in this chapter.`,
    contextSentence: findContextSentence(term, sentences),
    partOfSpeech: null,
    difficulty: index < 4 ? "core" : "stretch",
    status: "draft",
    sortOrder: index + 1
  }));
}

function buildMultipleChoice(chapter: Chapter, count: number, sentences: string[]) {
  return balanceCorrectChoicePositions(Array.from({ length: count }, (_item, index) => {
    const sentence = sentences[index % Math.max(sentences.length, 1)] || chapter.textContent.slice(0, 180);
    return {
      questionText: `Mock question ${index + 1}: What is one important detail from Chapter ${chapter.chapterNumber}?`,
      choices: [
        sentence.slice(0, 140),
        "A detail from a different part of the book.",
        "A choice that contradicts the chapter.",
        "A choice that is too vague to be supported."
      ],
      correctChoiceIndex: 0,
      explanation: "Mock explanation: the first choice is pulled directly from the chapter text.",
      skill: "comprehension",
      difficulty: index < 2 ? "standard" : "challenge",
      status: "draft",
      sortOrder: index + 1
    };
  }));
}

function buildShortAnswer(chapter: Chapter, count: number) {
  return Array.from({ length: count }, (_item, index) => ({
    questionText: `Mock short-answer ${index + 1}: Explain one important moment or character choice in Chapter ${chapter.chapterNumber}.`,
    suggestedAnswer: "Mock suggested answer: cite a specific event from the chapter and explain why it matters.",
    rubric: "A strong answer names a concrete detail, explains its importance, and uses evidence from the chapter.",
    skill: "written-response",
    difficulty: index === 0 ? "standard" : "challenge",
    status: "draft",
    sortOrder: index + 1
  }));
}

function normalizePlan(chapter: Chapter, planOverride?: Partial<MockGenerationPlan>): MockGenerationPlan {
  const fallback = deriveGenerationPlan(chapter.wordCount || countWords(chapter.textContent));
  const override = planOverride || {};

  return {
    vocabularyCount: Math.max(0, Number.isInteger(override.vocabularyCount) ? override.vocabularyCount as number : fallback.vocabularyCount),
    multipleChoiceCount: Math.max(0, Number.isInteger(override.multipleChoiceCount) ? override.multipleChoiceCount as number : fallback.multipleChoiceCount),
    shortAnswerCount: Math.max(0, Number.isInteger(override.shortAnswerCount) ? override.shortAnswerCount as number : fallback.shortAnswerCount)
  };
}

export async function generateMockStudySet(bookId: string, chapter: Chapter, planOverride?: Partial<MockGenerationPlan>) {
  const plan = normalizePlan(chapter, planOverride);
  const sentences = splitSentences(chapter.textContent);
  const studySet = await createStudySet({
    bookId,
    chapter,
    title: `Mock Chapter ${chapter.chapterNumber} - ${formatRunTimestamp()}`,
    generator: "mock",
    model: "deterministic-mock",
    promptVersion: "mock-v1",
    settings: plan
  });

  const generatedItems = {
    vocabularyItems: buildVocabulary(chapter, plan.vocabularyCount, sentences),
    multipleChoiceQuestions: buildMultipleChoice(chapter, plan.multipleChoiceCount, sentences),
    shortAnswerQuestions: buildShortAnswer(chapter, plan.shortAnswerCount)
  };

  try {
    const items = await replaceStudyItems(studySet.id, generatedItems);
    const readyStudySet = await updateStudySet({
      studySetId: studySet.id,
      status: "ready",
      rawOutput: generatedItems
    });

    return {
      studySet: summarizeStudySet(readyStudySet || studySet),
      items: summarizeStudyItems(items)
    };
  } catch (error) {
    await deleteStudySet(studySet.id);
    throw error;
  }
}
