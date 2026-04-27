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
