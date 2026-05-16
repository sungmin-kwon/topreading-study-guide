import fs from "node:fs";
import path from "node:path";
import { deriveGenerationPlan } from "@topreading/core";
import { type Book, type Chapter } from "@/lib/db/schema";
import { balanceCorrectChoicePositions } from "@/lib/mcq-shuffle";
import { replaceStudyItems, summarizeStudyItems, type StudyItemsInput } from "@/lib/study-items";
import { createStudySet, deleteStudySet, summarizeStudySet, updateStudySet } from "@/lib/study-sets";

type GenerationPlan = {
  vocabularyCount: number;
  multipleChoiceCount: number;
  shortAnswerCount: number;
};

type OpenAIUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
};

export type OpenAIUsageSummary = OpenAIUsage;

type OpenAIResponsePayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: OpenAIUsage;
};

type FetchLikeError = {
  name?: string;
  message?: string;
  cause?: {
    code?: string;
    message?: string;
    cause?: {
      code?: string;
      message?: string;
    };
  };
};

type RawVocabularyItem = {
  term?: unknown;
  english_definition?: unknown;
  korean_definition?: unknown;
  context_sentence?: unknown;
  part_of_speech?: unknown;
  difficulty?: unknown;
};

type RawMultipleChoiceQuestion = {
  question_text?: unknown;
  choices?: unknown;
  correct_choice_index?: unknown;
  explanation?: unknown;
  skill?: unknown;
  difficulty?: unknown;
};

type RawShortAnswerQuestion = {
  question_text?: unknown;
  suggested_answer?: unknown;
  rubric?: unknown;
  skill?: unknown;
  difficulty?: unknown;
};

type RawStudyGuidePayload = {
  book_title?: unknown;
  chapter_number?: unknown;
  chapter_title?: unknown;
  word_count?: unknown;
  chapter_summary?: unknown;
  vocabulary_items?: RawVocabularyItem[];
  multiple_choice_questions?: RawMultipleChoiceQuestion[];
  short_answer_questions?: RawShortAnswerQuestion[];
};

const promptVersion = "openai-study-guide-v1";

const studyGuideSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    book_title: { type: "string" },
    chapter_number: { type: "number" },
    chapter_title: { type: "string" },
    word_count: { type: "number" },
    chapter_summary: { type: "string" },
    vocabulary_items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          term: { type: "string" },
          english_definition: { type: "string" },
          korean_definition: { type: "string" },
          context_sentence: { type: "string" },
          part_of_speech: { type: "string" },
          difficulty: { type: "string", enum: ["core", "standard", "stretch"] }
        },
        required: ["term", "english_definition", "korean_definition", "context_sentence", "part_of_speech", "difficulty"]
      }
    },
    multiple_choice_questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question_text: { type: "string" },
          choices: {
            type: "array",
            items: { type: "string" },
            minItems: 4,
            maxItems: 4
          },
          correct_choice_index: { type: "number", minimum: 0, maximum: 3 },
          explanation: { type: "string" },
          skill: { type: "string" },
          difficulty: { type: "string", enum: ["standard", "challenge"] }
        },
        required: ["question_text", "choices", "correct_choice_index", "explanation", "skill", "difficulty"]
      }
    },
    short_answer_questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question_text: { type: "string" },
          suggested_answer: { type: "string" },
          rubric: { type: "string" },
          skill: { type: "string" },
          difficulty: { type: "string", enum: ["standard", "challenge"] }
        },
        required: ["question_text", "suggested_answer", "rubric", "skill", "difficulty"]
      }
    }
  },
  required: [
    "book_title",
    "chapter_number",
    "chapter_title",
    "word_count",
    "chapter_summary",
    "vocabulary_items",
    "multiple_choice_questions",
    "short_answer_questions"
  ]
};

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function findRepoRoot() {
  let current = process.cwd();

  for (let depth = 0; depth < 6; depth += 1) {
    const packagePath = path.join(current, "package.json");
    const webAppPath = path.join(current, "apps", "web");

    if (fs.existsSync(packagePath) && fs.existsSync(webAppPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.resolve(process.cwd(), "../..");
}

function parseEnvLine(line: string, name: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1 || trimmed.slice(0, separatorIndex).trim() !== name) {
    return null;
  }

  const value = trimmed.slice(separatorIndex + 1).trim();
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function getServerEnv(name: string) {
  const existing = process.env[name]?.trim();
  if (existing) {
    return existing;
  }

  const rootEnvPath = path.join(findRepoRoot(), ".env.local");
  if (!fs.existsSync(rootEnvPath)) {
    return "";
  }

  const lines = fs.readFileSync(rootEnvPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const value = parseEnvLine(line, name);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function formatRunTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalizePlan(chapter: Chapter, planOverride?: Partial<GenerationPlan>): GenerationPlan {
  const fallback = deriveGenerationPlan(chapter.wordCount || countWords(chapter.textContent));
  const override = planOverride || {};

  return {
    vocabularyCount: Math.max(0, Number.isInteger(override.vocabularyCount) ? override.vocabularyCount as number : fallback.vocabularyCount),
    multipleChoiceCount: Math.max(0, Number.isInteger(override.multipleChoiceCount) ? override.multipleChoiceCount as number : fallback.multipleChoiceCount),
    shortAnswerCount: Math.max(0, Number.isInteger(override.shortAnswerCount) ? override.shortAnswerCount as number : fallback.shortAnswerCount)
  };
}

function buildPrompt({ book, chapter, plan }: { book: Book; chapter: Chapter; plan: GenerationPlan }) {
  return `
You are creating classroom-ready study-guide JSON for an English tutoring business.

Return JSON only. Follow the schema exactly.

Requirements:
- Book title: ${book.title}
- Author: ${book.author || "Unknown"}
- Chapter number: ${chapter.chapterNumber}
- Chapter title: ${chapter.title || ""}
- Generate exactly ${plan.vocabularyCount} vocabulary entries, ${plan.multipleChoiceCount} multiple-choice questions, and ${plan.shortAnswerCount} short-answer questions.
- Also write one chapter_summary in 3-5 concise sentences.
- Base every item only on the provided chapter text.
- Do not quote long copyrighted passages.

Vocabulary requirements:
- Choose useful, teachable ESL vocabulary that helps a student understand the chapter and can also be reused outside this specific book.
- Prefer single words.
- A two-word item is allowed only if it is a standard fixed expression or dictionary-like phrase.
- Do not include proper nouns, character names, place names, titles, nicknames, or one-off descriptive phrases.
- Do not include job titles or role descriptions unless they are clearly useful general vocabulary.
- Avoid simple inflected everyday verbs like "looked", "walked", or "screamed" unless the base form is genuinely worth teaching.
- Convert inflected words to their base dictionary form when appropriate.
- Give a simple learner-friendly English definition and a natural Korean definition or gloss.
- Include a brief context sentence or context clue, but keep it short.

Multiple-choice requirements:
- Exactly 4 options per question.
- correct_choice_index must point to the correct option using zero-based indexing.
- Focus on literal comprehension, sequencing, character motives, and simple inference.
- Keep options plausible and similar in length.
- Include a concise explanation for the correct answer.

Short-answer requirements:
- Questions should be concise and classroom-ready.
- Suggested answers should be 1-2 sentences.
- Rubrics should be short and useful for grading.

Chapter summary requirements:
- Summarize the chapter's main events, characters, and important changes.
- Write plainly for a teacher who may not have read the book before.
- Do not mention AI, prompts, generation, or study guide construction.

Chapter text:
"""
${chapter.textContent}
"""
`.trim();
}

function extractResponseText(payload: OpenAIResponsePayload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

async function requestStudyGuideJson(book: Book, chapter: Chapter, plan: GenerationPlan) {
  const apiKey = getServerEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in .env.local.");
  }

  const model = getServerEnv("OPENAI_MODEL") || "gpt-5-mini";
  const response = await fetchWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "You create classroom-ready study-guide JSON and follow the requested schema exactly."
        },
        {
          role: "user",
          content: buildPrompt({ book, chapter, plan })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "chapter_study_guide",
          strict: true,
          schema: studyGuideSchema
        }
      }
    })
  });

  const payload = await response.json().catch(() => ({})) as OpenAIResponsePayload & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI generation failed with HTTP ${response.status}.`);
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("OpenAI did not return study-guide JSON.");
  }

  return {
    model,
    usage: payload.usage || null,
    payload: JSON.parse(text) as RawStudyGuidePayload
  };
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function describeFetchError(error: unknown) {
  const value = error && typeof error === "object" ? error as FetchLikeError : {};
  const messages = [
    value.message,
    value.cause?.message,
    value.cause?.code,
    value.cause?.cause?.message,
    value.cause?.cause?.code
  ].filter(Boolean);

  return messages.length ? messages.join(" / ") : "network request failed";
}

function isRetryableResponse(response: Response) {
  return response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
}

async function fetchWithRetry(url: string, init: RequestInit) {
  let lastErrorMessage = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!isRetryableResponse(response) || attempt === 3) {
        return response;
      }

      lastErrorMessage = `HTTP ${response.status}`;
    } catch (error) {
      lastErrorMessage = describeFetchError(error);
      if (attempt === 3) {
        throw new Error(`OpenAI network request failed after 3 attempts: ${lastErrorMessage}`);
      }
    }

    await sleep(1000 * attempt);
  }

  throw new Error(`OpenAI network request failed: ${lastErrorMessage || "unknown error"}`);
}

function normalizeGeneratedItems(rawPayload: RawStudyGuidePayload, plan: GenerationPlan): StudyItemsInput {
  const chapterSummary = asString(rawPayload.chapter_summary);
  const chapterSummaries = chapterSummary
    ? [{
      summaryText: chapterSummary,
      status: "draft",
      sortOrder: 1
    }]
    : [];
  const vocabularyItems = (Array.isArray(rawPayload.vocabulary_items) ? rawPayload.vocabulary_items : [])
    .slice(0, plan.vocabularyCount)
    .map((item, index) => {
      const englishDefinition = asString(item.english_definition);
      const koreanDefinition = asString(item.korean_definition);
      return {
        term: asString(item.term),
        definition: koreanDefinition ? `${englishDefinition}\nKorean: ${koreanDefinition}` : englishDefinition,
        contextSentence: asString(item.context_sentence),
        partOfSpeech: asString(item.part_of_speech),
        difficulty: asString(item.difficulty, index < 4 ? "core" : "standard"),
        status: "draft",
        sortOrder: index + 1
      };
    });

  const multipleChoiceQuestions = balanceCorrectChoicePositions((Array.isArray(rawPayload.multiple_choice_questions) ? rawPayload.multiple_choice_questions : [])
    .slice(0, plan.multipleChoiceCount)
    .map((item, index) => {
      const choices = Array.isArray(item.choices) ? item.choices.map((choice) => asString(choice)).filter(Boolean).slice(0, 4) : [];
      while (choices.length < 4) {
        choices.push(`Option ${choices.length + 1}`);
      }

      const correctChoiceIndex = Math.min(Math.max(Math.round(asNumber(item.correct_choice_index, 0)), 0), 3);
      return {
        questionText: asString(item.question_text, `Question ${index + 1}`),
        choices,
        correctChoiceIndex,
        explanation: asString(item.explanation),
        skill: asString(item.skill, "comprehension"),
        difficulty: asString(item.difficulty, index < 2 ? "standard" : "challenge"),
        status: "draft",
        sortOrder: index + 1
      };
    }));

  const shortAnswerQuestions = (Array.isArray(rawPayload.short_answer_questions) ? rawPayload.short_answer_questions : [])
    .slice(0, plan.shortAnswerCount)
    .map((item, index) => ({
      questionText: asString(item.question_text, `Short-answer question ${index + 1}`),
      suggestedAnswer: asString(item.suggested_answer),
      rubric: asString(item.rubric),
      skill: asString(item.skill, "written-response"),
      difficulty: asString(item.difficulty, index === 0 ? "standard" : "challenge"),
      status: "draft",
      sortOrder: index + 1
    }));

  return {
    chapterSummaries,
    vocabularyItems,
    multipleChoiceQuestions,
    shortAnswerQuestions
  };
}

export async function generateOpenAIChapterItems(
  book: Book,
  chapter: Chapter,
  planOverride?: Partial<GenerationPlan>
) {
  const plan = normalizePlan(chapter, planOverride);
  const generated = await requestStudyGuideJson(book, chapter, plan);
  const generatedItems = normalizeGeneratedItems(generated.payload, plan);

  return {
    plan,
    generatedItems,
    rawOutput: generated.payload,
    usage: generated.usage,
    model: generated.model
  };
}

export async function generateOpenAIStudySet(
  book: Book,
  chapter: Chapter,
  planOverride?: Partial<GenerationPlan>,
  options: { generationRunId?: string | null; runName?: string | null } = {}
) {
  const plan = normalizePlan(chapter, planOverride);
  const studySet = await createStudySet({
    bookId: book.id,
    generationRunId: options.generationRunId || null,
    chapter,
    title: options.runName?.trim()
      ? `${options.runName.trim()} - Chapter ${chapter.chapterNumber}`
      : `Chapter ${chapter.chapterNumber} - ${formatRunTimestamp()}`,
    generator: "openai",
    model: getServerEnv("OPENAI_MODEL") || "gpt-5-mini",
    promptVersion,
    settings: plan
  });

  try {
    const generated = await requestStudyGuideJson(book, chapter, plan);
    const generatedItems = normalizeGeneratedItems(generated.payload, plan);
    const items = await replaceStudyItems(studySet.id, generatedItems, { chapterId: chapter.id });
    const readyStudySet = await updateStudySet({
      studySetId: studySet.id,
      status: "ready",
      model: generated.model,
      rawOutput: {
        ...generated.payload,
        usage: generated.usage
      }
    });

    return {
      studySet: summarizeStudySet(readyStudySet || studySet),
      items: summarizeStudyItems(items),
      usage: generated.usage,
      model: generated.model
    };
  } catch (error) {
    await deleteStudySet(studySet.id);
    throw error;
  }
}
