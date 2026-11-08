import { getGenerationRun } from "@/lib/generation-runs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { getBook } from "@/lib/books";
import { getChapter, listChaptersByBook } from "@/lib/chapters";
import { getExportDir } from "@/lib/env";
import { listStudyItems } from "@/lib/study-items";
import { getLatestStudySetForChapter, getStudySetForBook, getStudySetForChapterInRun } from "@/lib/study-sets";

const execFileAsync = promisify(execFile);

export type PdfExportType =
  | "chapter-summaries"
  | "vocabulary-list"
  | "vocabulary-quiz"
  | "multiple-choice"
  | "multiple-choice-concise-key"
  | "multiple-choice-key"
  | "short-answer"
  | "short-answer-key";

export type ExportFileFormat = "pdf" | "docx";

type PdfPayloadItem = {
  kind?: "text" | "blank";
  text?: string;
  size?: number;
  bold?: boolean;
  indent?: number;
  gap?: number;
  block_start?: boolean;
  block_end?: boolean;
};

const exportLabels: Record<PdfExportType, string> = {
  "chapter-summaries": "Chapter Summaries",
  "vocabulary-list": "Vocabulary List",
  "vocabulary-quiz": "Vocabulary Quiz",
  "multiple-choice": "Multiple Choice",
  "multiple-choice-concise-key": "Multiple Choice Answer Key",
  "multiple-choice-key": "Multiple Choice Answer Key",
  "short-answer": "Short Answer",
  "short-answer-key": "Short Answer Answer Key"
};

function getRepoRoot() {
  return path.resolve(process.cwd(), "../..");
}

function getPythonExecutable() {
  return process.env.PYTHON_EXECUTABLE || path.join(getRepoRoot(), ".topreading", "Scripts", "python.exe");
}

function sanitizeFilename(value: string) {
  return value
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90)
    .toLowerCase();
}

function splitVocabularyDefinition(definition: string) {
  const [englishPart, ...rest] = definition.split(/\s*Korean:\s*/i);
  return {
    english: englishPart.trim(),
    korean: rest.join(" | ").trim()
  };
}

function normalizeChapterTitle(chapterNumber: number, chapterTitle: string) {
  const title = chapterTitle.trim();
  if (!title) {
    return "";
  }

  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const chapterPatterns = [
    `chapter ${chapterNumber}`,
    String(chapterNumber)
  ];

  return chapterPatterns.includes(normalized) ? "" : title;
}

function formatChapterLabel(chapterNumber: number, chapterTitle: string) {
  const title = normalizeChapterTitle(chapterNumber, chapterTitle);
  return `Chapter ${chapterNumber}${title ? `: ${title}` : ""}`;
}

function normalizeExportType(value: string | null): PdfExportType | null {
  if (
    value === "vocabulary-list"
    || value === "chapter-summaries"
    || value === "vocabulary-quiz"
    || value === "multiple-choice"
    || value === "multiple-choice-concise-key"
    || value === "multiple-choice-key"
    || value === "short-answer"
    || value === "short-answer-key"
  ) {
    return value;
  }

  return null;
}

function buildVocabularyItems(items: Awaited<ReturnType<typeof listStudyItems>>, type: PdfExportType, startNumber = 1): PdfPayloadItem[] {
  return items.vocabulary.flatMap((item, index) => {
    const number = startNumber + index;
    const definitions = splitVocabularyDefinition(item.definition);

    if (type === "vocabulary-quiz") {
      const quizItems: PdfPayloadItem[] = [
        { text: `${number}. ${item.term}`, bold: true, gap: 2, block_start: true },
        { kind: "blank", gap: 18, block_end: true }
      ];
      return quizItems;
    }

    const meaning = [definitions.english, definitions.korean].filter(Boolean).join(" | ");
    const listItems: PdfPayloadItem[] = [
      { text: `${number}. ${item.term}: ${meaning || item.definition}`, gap: 5, block_start: true, block_end: true }
    ];
    return listItems;
  });
}

function buildChapterSummaryItems(items: Awaited<ReturnType<typeof listStudyItems>>): PdfPayloadItem[] {
  return items.summaries.map((item) => ({
    text: item.summaryText,
    gap: 8,
    block_start: true,
    block_end: true
  }));
}

function buildMultipleChoiceItems(items: Awaited<ReturnType<typeof listStudyItems>>, includeAnswers: boolean, startNumber = 1): PdfPayloadItem[] {
  const body = items.multipleChoice.flatMap((item, index) => {
    const number = startNumber + index;
    const choices = JSON.parse(item.choicesJson) as string[];
    const answerLabel = String.fromCharCode(65 + item.correctChoiceIndex);
    const questionItems: PdfPayloadItem[] = [
      { text: `${number}. ${item.questionText}`, bold: true, gap: 3, block_start: true },
      ...choices.map((choice: string, choiceIndex: number) => ({
        text: `${String.fromCharCode(65 + choiceIndex)}. ${choice}`,
        indent: 16,
        gap: 1
      }))
    ];

    if (includeAnswers) {
      questionItems.push({
        text: `Answer: ${answerLabel}. ${choices[item.correctChoiceIndex] || ""}`,
        indent: 16,
        gap: 3
      });
      if (item.explanation) {
        questionItems.push({ text: `Explanation: ${item.explanation}`, indent: 16, gap: 5 });
      }
    }

    questionItems.push({ text: "", gap: 2, block_end: true });
    return questionItems;
  });

  if (includeAnswers) {
    return body;
  }

  return body;
}

function buildMultipleChoiceConciseKeyItems(items: Awaited<ReturnType<typeof listStudyItems>>, startNumber = 1): PdfPayloadItem[] {
  return items.multipleChoice.map((item, index) => {
    const answerLabel = String.fromCharCode(65 + item.correctChoiceIndex);
    return {
      text: `${startNumber + index}. ${answerLabel}`,
      gap: 3,
      block_start: true,
      block_end: true
    };
  });
}

function buildShortAnswerItems(items: Awaited<ReturnType<typeof listStudyItems>>, includeAnswers: boolean, startNumber = 1): PdfPayloadItem[] {
  return items.shortAnswer.flatMap((item, index) => {
    const questionItems: PdfPayloadItem[] = [
      { text: `${startNumber + index}. ${item.questionText}`, bold: false, gap: 8, block_start: true }
    ];

    if (includeAnswers) {
      questionItems.push({ text: `Answer: ${item.suggestedAnswer}`, indent: 16, gap: 5 });
      if (item.rubric) {
        questionItems.push({ text: `Rubric: ${item.rubric}`, indent: 16, gap: 8, block_end: true });
      } else {
        questionItems[questionItems.length - 1].block_end = true;
      }
    } else {
      questionItems.push({ kind: "blank", indent: 22, gap: 22 }, { kind: "blank", indent: 22, gap: 28, block_end: true });
    }

    return questionItems;
  });
}

function buildPayload(input: {
  bookTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  studySetTitle: string;
  type: PdfExportType;
  items: Awaited<ReturnType<typeof listStudyItems>>;
}) {
  const label = exportLabels[input.type];
  const chapterLabel = formatChapterLabel(input.chapterNumber, input.chapterTitle);
  const title = `${input.bookTitle} - ${label}`;
  const items = buildItemsForType(input.items, input.type);

  return {
    title,
    header: `${title} - ${chapterLabel}`,
    show_title: false,
    subtitle: chapterLabel,
    sections: [
      {
        heading: chapterLabel,
        items
      }
    ]
  };
}

function buildItemsForType(items: Awaited<ReturnType<typeof listStudyItems>>, type: PdfExportType, startNumber = 1) {
  if (type === "chapter-summaries") {
    return buildChapterSummaryItems(items);
  }
  if (type === "vocabulary-list" || type === "vocabulary-quiz") {
    return buildVocabularyItems(items, type, startNumber);
  }
  if (type === "multiple-choice-concise-key") {
    return buildMultipleChoiceConciseKeyItems(items, startNumber);
  }
  if (type === "multiple-choice" || type === "multiple-choice-key") {
    return buildMultipleChoiceItems(items, type === "multiple-choice-key", startNumber);
  }
  return buildShortAnswerItems(items, type === "short-answer-key", startNumber);
}

function countItemsForType(items: Awaited<ReturnType<typeof listStudyItems>>, type: PdfExportType) {
  if (type === "chapter-summaries") {
    return items.summaries.length;
  }
  if (type === "vocabulary-list" || type === "vocabulary-quiz") {
    return items.vocabulary.length;
  }
  if (type === "multiple-choice" || type === "multiple-choice-key" || type === "multiple-choice-concise-key") {
    return items.multipleChoice.length;
  }
  return items.shortAnswer.length;
}

function buildBookPayload(input: {
  bookTitle: string;
  type: PdfExportType;
  sections: Array<{
    chapterNumber: number;
    chapterTitle: string;
    studySetTitle: string;
    items: Awaited<ReturnType<typeof listStudyItems>>;
  }>;
}) {
  const label = exportLabels[input.type];
  let nextNumber = 1;
  return {
    title: `${input.bookTitle} - ${label}`,
    header: `${input.bookTitle} - ${label} - All chapters`,
    show_title: false,
    subtitle: "All chapters",
    sections: input.sections.map((section) => {
      const chapterLabel = formatChapterLabel(section.chapterNumber, section.chapterTitle);
      const startNumber = nextNumber;
      nextNumber += countItemsForType(section.items, input.type);

      return {
        heading: chapterLabel,
        items: buildItemsForType(section.items, input.type, startNumber)
      };
    })
  };
}

// A single download assembled from one read of each chapter's items. Existing
// single-type export callers retain their format and filenames.
export function parseExportSelection(params: URLSearchParams): PdfExportType[] | null {
  const values = params.has("types") ? params.getAll("types") : [params.get("type") || ""];
  if (!values.length || values.length > 8) return null;
  const types = values.map(normalizeExportType);
  return types.every((type): type is PdfExportType => type !== null) ? [...new Set(types)] : null;
}

export function buildSelectedExportPayload(bookTitle: string, types: PdfExportType[], chapters: Array<{chapterNumber: number; chapterTitle: string; items: Awaited<ReturnType<typeof listStudyItems>>}>) {
  const counters = new Map<PdfExportType, number>();
  const sections: Array<{heading: string; items: PdfPayloadItem[]}> = [];
  // Concise keys go at the end; their counters follow the same chapter/item order.
  const main = types.filter(type => type !== "multiple-choice-concise-key");
  for (const chapter of chapters) {
    for (const type of main) {
      const count = countItemsForType(chapter.items, type);
      if (!count) continue;
      const start = counters.get(type) || 1;
      sections.push({heading: `${formatChapterLabel(chapter.chapterNumber, chapter.chapterTitle)} — ${exportLabels[type]}`, items: buildItemsForType(chapter.items, type, start)});
      counters.set(type, start + count);
    }
  }
  if (types.includes("multiple-choice-concise-key")) {
    let start = 1;
    for (const chapter of chapters) {
      if (!chapter.items.multipleChoice.length) continue;
      sections.push({heading: `${formatChapterLabel(chapter.chapterNumber, chapter.chapterTitle)} — Multiple Choice Answer Key`, items: buildMultipleChoiceConciseKeyItems(chapter.items, start)});
      start += chapter.items.multipleChoice.length;
    }
  }
  if (!sections.length) throw new Error("No items are available for the selected content and chapters.");
  return {title: `${bookTitle} - Study guide`, header: `${bookTitle} - Study guide`, show_title: false, subtitle: "Selected content", sections};
}

export function parsePdfExportType(value: string | null) {
  return normalizeExportType(value);
}

export function parseExportFileFormat(value: string | null): ExportFileFormat {
  return value === "docx" ? "docx" : "pdf";
}

async function renderPayloadFile(input: { payload: unknown; basename: string; format: ExportFileFormat }) {
  const exportDir = getExportDir();
  await fs.mkdir(exportDir, { recursive: true });
  const inputPath = path.join(exportDir, `${input.basename}.json`);
  const outputPath = path.join(exportDir, `${input.basename}.${input.format}`);
  const scriptName = input.format === "docx" ? "render_study_set_docx.py" : "render_study_set_pdf.py";
  const scriptPath = path.join(getRepoRoot(), "scripts", scriptName);

  await fs.writeFile(inputPath, JSON.stringify(input.payload), "utf8");
  const { stderr } = await execFileAsync(
    getPythonExecutable(),
    [scriptPath, inputPath, outputPath],
    { maxBuffer: 32 * 1024 * 1024 }
  );

  if (stderr.trim()) {
    throw new Error(stderr.trim());
  }

  await fs.rm(inputPath, { force: true });
  return {
    filePath: outputPath,
    filename: `${input.basename}.${input.format}`
  };
}

export async function exportStudySetFile(bookId: string, studySetId: string, type: PdfExportType, format: ExportFileFormat, chapterId?: string | null, selection?: PdfExportType[]) {
  const book = await getBook(bookId);
  const studySet = book ? await getStudySetForBook(book.id, studySetId) : null;
  const selectedChapterId = chapterId || studySet?.chapterId || null;
  const chapter = selectedChapterId ? await getChapter(selectedChapterId) : null;

  if (!book || !studySet || !chapter || chapter.bookId !== book.id) {
    throw new Error("Study set not found.");
  }

  const items = await listStudyItems(studySet.id, { chapterId: chapter.id });
  const payload = selection ? buildSelectedExportPayload(book.title, selection, [{chapterNumber: chapter.chapterNumber, chapterTitle: chapter.title, items}]) : buildPayload({
    bookTitle: book.title,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    studySetTitle: studySet.title,
    type,
    items
  });

  const exportDir = getExportDir();
  await fs.mkdir(exportDir, { recursive: true });
  const basename = [
    sanitizeFilename(book.title || "book"),
    selection ? "selected-guide" : type,
    `chapter_${chapter.chapterNumber}`,
    randomUUID().slice(0, 8)
  ].join("_");

  return renderPayloadFile({ payload, basename, format });
}

export async function exportStudySetPdf(bookId: string, studySetId: string, type: PdfExportType) {
  return exportStudySetFile(bookId, studySetId, type, "pdf");
}

export async function exportBookFile(bookId: string, type: PdfExportType, format: ExportFileFormat, generationRunId?: string | null, selection?: PdfExportType[]) {
  const book = await getBook(bookId);
  if (!book) {
    throw new Error("Book not found.");
  }

  const activeGenerationRunId = generationRunId === undefined ? book.activeGenerationRunId : generationRunId;
  const run = activeGenerationRunId ? await getGenerationRun(activeGenerationRunId) : null;
  if(activeGenerationRunId && (!run || run.bookId !== book.id)) throw new Error("Guide version not found.");
  const chapters = await listChaptersByBook(book.id, run ? run.layoutId : undefined);
  const sections = [];

  for (const chapter of chapters) {
    const studySet = activeGenerationRunId
      ? await getStudySetForChapterInRun(book.id, chapter.id, activeGenerationRunId)
      : await getLatestStudySetForChapter(book.id, chapter.id);
    if (!studySet) {
      continue;
    }

    sections.push({
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
      studySetTitle: studySet.title,
      items: await listStudyItems(studySet.id, { chapterId: chapter.id })
    });
  }

  if (!sections.length) {
    throw new Error(activeGenerationRunId
      ? "No generated study sets are available for the active generation run."
      : "No generated study sets are available for this book.");
  }

  const payload = selection ? buildSelectedExportPayload(book.title, selection, sections) : buildBookPayload({
    bookTitle: book.title,
    type,
    sections
  });
  const basename = [
    sanitizeFilename(book.title || "book"),
    selection ? "selected-guide" : type,
    "all_chapters",
    randomUUID().slice(0, 8)
  ].join("_");

  return renderPayloadFile({ payload, basename, format });
}

export async function exportBookPdf(bookId: string, type: PdfExportType) {
  return exportBookFile(bookId, type, "pdf");
}
