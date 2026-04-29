export type StudyQuestionType = "multiple_choice" | "short_answer";

export type VocabularyItem = {
  id?: string;
  word: string;
  englishDefinition: string;
  koreanDefinition: string;
  sortOrder: number;
};

export type MultipleChoiceQuestion = {
  id?: string;
  type: "multiple_choice";
  prompt: string;
  choices: string[];
  answer: string;
  sortOrder: number;
};

export type ShortAnswerQuestion = {
  id?: string;
  type: "short_answer";
  prompt: string;
  answer: string;
  sortOrder: number;
};

export type StudyQuestion = MultipleChoiceQuestion | ShortAnswerQuestion;

export type ChapterStudySet = {
  bookTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  wordCount: number;
  vocabulary: VocabularyItem[];
  questions: StudyQuestion[];
};

export type GenerationPlan = {
  vocabularyCount: number;
  multipleChoiceCount: number;
  shortAnswerCount: number;
};

export type WeightedAllocationItem = {
  id: string;
  wordCount: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function deriveGenerationPlan(wordCount: number): GenerationPlan {
  const normalizedWordCount = Math.max(0, Math.round(wordCount));

  return {
    vocabularyCount: clamp(Math.round(normalizedWordCount / 180), 4, 24),
    multipleChoiceCount: clamp(Math.round(normalizedWordCount / 300), 2, 16),
    shortAnswerCount: clamp(Math.round(normalizedWordCount / 900), 1, 6)
  };
}

export function deriveBookGenerationPlan(wordCount: number): GenerationPlan {
  const normalizedWordCount = Math.max(0, Math.round(wordCount));

  if (normalizedWordCount === 0) {
    return {
      vocabularyCount: 0,
      multipleChoiceCount: 0,
      shortAnswerCount: 0
    };
  }

  return {
    vocabularyCount: clamp(Math.round(normalizedWordCount / 180), 4, 1000),
    multipleChoiceCount: clamp(Math.round(normalizedWordCount / 300), 2, 800),
    shortAnswerCount: clamp(Math.round(normalizedWordCount / 600), 1, 300)
  };
}

export function allocateCountByWordWeight(
  items: WeightedAllocationItem[],
  totalCount: number,
  options: { curve?: number } = {}
): Record<string, number> {
  const normalizedTotal = Math.max(0, Math.round(totalCount));
  const allocation = Object.fromEntries(items.map((item) => [item.id, 0]));

  if (normalizedTotal === 0 || items.length === 0) {
    return allocation;
  }

  const curve = options.curve ?? 0.85;
  const weightedItems = items.map((item) => ({
    id: item.id,
    weight: Math.pow(Math.max(1, Math.round(item.wordCount)), curve)
  }));
  const totalWeight = weightedItems.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight <= 0) {
    return allocation;
  }

  const portions = weightedItems.map((item) => {
    const raw = (normalizedTotal * item.weight) / totalWeight;
    const base = Math.floor(raw);
    return {
      id: item.id,
      base,
      remainder: raw - base
    };
  });

  let remaining = normalizedTotal - portions.reduce((sum, item) => sum + item.base, 0);
  portions.sort((left, right) => right.remainder - left.remainder);

  for (const item of portions) {
    allocation[item.id] = item.base + (remaining > 0 ? 1 : 0);
    remaining -= remaining > 0 ? 1 : 0;
  }

  return allocation;
}
