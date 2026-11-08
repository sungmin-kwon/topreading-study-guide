import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { books, chapters, type Chapter, type ParsedDocument, type ParsedPage } from "@/lib/db/schema";

type ChapterDraft = {
  chapterNumber: number;
  title: string;
  textContent: string;
  wordCount: number;
  sortOrder: number;
};

type ManualMarker = {
  marker: string;
  title?: string;
};

type PageStart = {
  pageNumber: number;
  title?: string;
};

type HeadingMatch = {
  index: number;
  length: number;
  chapterNumber: number | null;
  title: string;
  line: string;
  reason: string;
};

const numberWords = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20],
  ["twenty-one", 21],
  ["twenty-two", 22],
  ["twenty-three", 23],
  ["twenty-four", 24],
  ["twenty-five", 25],
  ["twenty-six", 26],
  ["twenty-seven", 27],
  ["twenty-eight", 28],
  ["twenty-nine", 29],
  ["thirty", 30]
]);

function nowIso() {
  return new Date().toISOString();
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeText(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseChapterNumber(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (/^\d{1,3}$/.test(normalized)) {
    return Number(normalized);
  }

  return numberWords.get(normalized) || null;
}

function parseHeadingLine(line: string): { chapterNumber: number | null; title: string; reason: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) {
    return null;
  }

  const chapterMatch = trimmed.match(/^chapter\s+([0-9]{1,3}|[a-z]+(?:[-\s][a-z]+)?)(?:\s*[:.-]\s*(.+)|\s+(.+))?$/i);
  if (chapterMatch) {
    return {
      chapterNumber: parseChapterNumber(chapterMatch[1]),
      title: String(chapterMatch[2] || chapterMatch[3] || "").trim(),
      reason: "chapter-label"
    };
  }

  const numberedMatch = trimmed.match(/^([0-9]{1,3})\s*$/);
  if (numberedMatch) {
    return {
      chapterNumber: Number(numberedMatch[1]),
      title: "",
      reason: "standalone-number"
    };
  }

  return null;
}

function findRawChapterHeadings(text: string): HeadingMatch[] {
  const matches: HeadingMatch[] = [];
  const linePattern = /^(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(text)) !== null) {
    const parsed = parseHeadingLine(match[1]);
    if (!parsed) {
      continue;
    }

    matches.push({
      index: match.index,
      length: match[0].length,
      chapterNumber: parsed.chapterNumber,
      title: parsed.title,
      line: match[1].trim(),
      reason: parsed.reason
    });
  }

  return matches;
}

function filterPlausibleHeadings(matches: HeadingMatch[]) {

  const plausible = matches.filter((item, index, all) => {
    if (item.chapterNumber === null) {
      return true;
    }

    const previousNumbered = all
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.chapterNumber !== null);
    if (!previousNumbered?.chapterNumber) {
      return item.chapterNumber <= 3;
    }

    return item.chapterNumber > previousNumbered.chapterNumber
      && item.chapterNumber <= previousNumbered.chapterNumber + 2;
  });

  return plausible.length >= 2 ? plausible : [];
}

function findChapterHeadings(text: string): HeadingMatch[] {
  return filterPlausibleHeadings(findRawChapterHeadings(text));
}

export function previewChapterSplit(parsedDocument: ParsedDocument) {
  const text = normalizeText(parsedDocument.textContent);
  const rawCandidates = findRawChapterHeadings(text);
  const acceptedCandidates = filterPlausibleHeadings(rawCandidates);
  const acceptedIndexes = new Set(acceptedCandidates.map((candidate) => candidate.index));

  return {
    strategy: acceptedCandidates.length ? "heading" : "single-chapter-fallback",
    totalCandidates: rawCandidates.length,
    acceptedCandidates: acceptedCandidates.length,
    candidates: rawCandidates.slice(0, 200).map((candidate) => ({
      index: candidate.index,
      line: candidate.line,
      chapterNumber: candidate.chapterNumber,
      title: candidate.title,
      reason: candidate.reason,
      accepted: acceptedIndexes.has(candidate.index),
      context: text.slice(Math.max(0, candidate.index - 160), Math.min(text.length, candidate.index + candidate.length + 220))
    }))
  };
}

function splitParsedDocument(parsedDocument: ParsedDocument): ChapterDraft[] {
  const text = normalizeText(parsedDocument.textContent);
  const headings = findChapterHeadings(text);

  if (!headings.length) {
    return [{
      chapterNumber: 1,
      title: "",
      textContent: text,
      wordCount: countWords(text),
      sortOrder: 1
    }];
  }

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const start = heading.index + heading.length;
    const end = nextHeading?.index ?? text.length;
    const body = text.slice(start, end).trim();
    const chapterNumber = heading.chapterNumber || index + 1;
    const title = heading.title || `Chapter ${chapterNumber}`;
    const textContent = `${text.slice(heading.index, heading.index + heading.length).trim()}\n\n${body}`.trim();

    return {
      chapterNumber,
      title,
      textContent,
      wordCount: countWords(textContent),
      sortOrder: index + 1
    };
  }).filter((chapter) => chapter.textContent && chapter.wordCount > 0);
}

function findMarkerMatches(text: string, markers: ManualMarker[]) {
  return markers
    .map((marker, index) => {
      const normalizedMarker = marker.marker.trim();
      if (!normalizedMarker) {
        return null;
      }

      const matchIndex = text.toLowerCase().indexOf(normalizedMarker.toLowerCase());
      if (matchIndex < 0) {
        return null;
      }

      return {
        index: matchIndex,
        marker: normalizedMarker,
        title: marker.title?.trim() || normalizedMarker,
        sortOrder: index + 1
      };
    })
    .filter((match): match is NonNullable<typeof match> => Boolean(match))
    .sort((a, b) => a.index - b.index);
}

function splitParsedDocumentByMarkers(parsedDocument: ParsedDocument, markers: ManualMarker[]): ChapterDraft[] {
  const text = normalizeText(parsedDocument.textContent);
  const matches = findMarkerMatches(text, markers);

  if (!matches.length) {
    throw new Error("None of the manual markers were found in the extracted text.");
  }

  return matches.map((match, index) => {
    const nextMatch = matches[index + 1];
    const textContent = text.slice(match.index, nextMatch?.index ?? text.length).trim();
    const chapterNumber = index + 1;

    return {
      chapterNumber,
      title: match.title,
      textContent,
      wordCount: countWords(textContent),
      sortOrder: chapterNumber
    };
  }).filter((chapter) => chapter.textContent && chapter.wordCount > 0);
}

function splitParsedPagesByStarts(pages: ParsedPage[], pageStarts: PageStart[]): ChapterDraft[] {
  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const sortedStarts = pageStarts
    .map((start) => ({
      pageNumber: Number(start.pageNumber),
      title: start.title?.trim() || ""
    }))
    .filter((start) => Number.isInteger(start.pageNumber) && start.pageNumber > 0)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  if (!sortedStarts.length) {
    throw new Error("At least one chapter start page is required.");
  }

  if (!sortedPages.length) {
    throw new Error("No parsed page text was found. Delete the extracted text, extract the PDF again, then retry page splitting.");
  }

  const availablePageNumbers = new Set(sortedPages.map((page) => page.pageNumber));
  const missingStarts = sortedStarts.filter((start) => !availablePageNumbers.has(start.pageNumber));
  if (missingStarts.length === sortedStarts.length) {
    const firstPage = sortedPages[0]?.pageNumber;
    const lastPage = sortedPages[sortedPages.length - 1]?.pageNumber;
    throw new Error(`None of the chapter start pages matched extracted PDF pages. Available extracted pages are ${firstPage}-${lastPage}.`);
  }

  return sortedStarts.map((start, index) => {
    const nextStart = sortedStarts[index + 1];
    const chapterPages = sortedPages.filter((page) =>
      page.pageNumber >= start.pageNumber
      && (!nextStart || page.pageNumber < nextStart.pageNumber)
    );
    const textContent = chapterPages
      .map((page) => page.textContent)
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const chapterNumber = index + 1;

    return {
      chapterNumber,
      title: start.title || `Chapter ${chapterNumber}`,
      textContent,
      wordCount: countWords(textContent),
      sortOrder: chapterNumber
    };
  }).filter((chapter) => chapter.textContent && chapter.wordCount > 0);
}

export async function listChaptersByBook(bookId: string, layoutId?: string | null): Promise<Chapter[]> {
  return db
    .select()
    .from(chapters)
    .where(and(eq(chapters.bookId, bookId), layoutId === undefined ? sql`${chapters.layoutId} IS NOT DISTINCT FROM (SELECT ${books.activeLayoutId} FROM ${books} WHERE ${books.id} = ${bookId})` : sql`${chapters.layoutId} IS NOT DISTINCT FROM ${layoutId}`))
    .orderBy(asc(chapters.sortOrder), asc(chapters.chapterNumber));
}

export async function getChapter(chapterId: string): Promise<Chapter | null> {
  const rows = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);

  return rows[0] || null;
}

export async function deleteChaptersByBook(bookId: string): Promise<void> {
  await db.delete(chapters).where(eq(chapters.bookId, bookId));
}

export async function deleteChaptersByParsedDocument(parsedDocumentId: string): Promise<void> {
  await db.delete(chapters).where(eq(chapters.parsedDocumentId, parsedDocumentId));
}

export async function deleteChapter(chapterId: string): Promise<void> {
  await db.delete(chapters).where(eq(chapters.id, chapterId));
}

export async function updateChapter(input: {
  chapterId: string;
  chapterNumber: number;
  title: string;
  textContent: string;
}): Promise<Chapter | null> {
  const textContent = normalizeText(input.textContent);
  if (!textContent) {
    throw new Error("Chapter text cannot be empty.");
  }

  const chapterNumber = Number(input.chapterNumber);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw new Error("Chapter number must be a positive whole number.");
  }

  await db
    .update(chapters)
    .set({
      chapterNumber,
      sortOrder: chapterNumber,
      title: input.title.trim(),
      textContent,
      wordCount: countWords(textContent),
      updatedAt: nowIso()
    })
    .where(eq(chapters.id, input.chapterId));

  return getChapter(input.chapterId);
}

export async function createChaptersFromParsedDocument(input: {
  bookId: string;
  parsedDocument: ParsedDocument;
}): Promise<Chapter[]> {
  const drafts = splitParsedDocument(input.parsedDocument);
  return insertChapterDrafts(input.bookId, input.parsedDocument.id, drafts);
}

export async function createChaptersFromManualMarkers(input: {
  bookId: string;
  parsedDocument: ParsedDocument;
  markers: ManualMarker[];
}): Promise<Chapter[]> {
  const drafts = splitParsedDocumentByMarkers(input.parsedDocument, input.markers);
  return insertChapterDrafts(input.bookId, input.parsedDocument.id, drafts);
}

export async function createChaptersFromPageStarts(input: {
  bookId: string;
  parsedDocument: ParsedDocument;
  pages: ParsedPage[];
  pageStarts: PageStart[];
}): Promise<Chapter[]> {
  const drafts = splitParsedPagesByStarts(input.pages, input.pageStarts);
  return insertChapterDrafts(input.bookId, input.parsedDocument.id, drafts);
}

async function insertChapterDrafts(bookId: string, parsedDocumentId: string, drafts: ChapterDraft[]) {
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  const timestamp = nowIso();
  const rows = drafts.map((draft) => ({
    id: randomUUID(),
    bookId,
    parsedDocumentId,
    layoutId: book?.activeLayoutId || null,
    chapterNumber: draft.chapterNumber,
    title: draft.title,
    textContent: draft.textContent,
    wordCount: draft.wordCount,
    sortOrder: draft.sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp
  }));

  if (!rows.length) {
    throw new Error("No usable chapter text was found.");
  }

  await db.insert(chapters).values(rows);
  return db.select().from(chapters).where(inArray(chapters.id, rows.map(row => row.id))).orderBy(asc(chapters.sortOrder));
}

export function summarizeChapter(chapter: Chapter) {
  return {
    id: chapter.id,
    bookId: chapter.bookId,
    parsedDocumentId: chapter.parsedDocumentId,
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    wordCount: chapter.wordCount,
    sortOrder: chapter.sortOrder,
    preview: chapter.textContent.slice(0, 500),
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt
  };
}

export function serializeChapterDetail(chapter: Chapter) {
  return {
    ...summarizeChapter(chapter),
    textContent: chapter.textContent
  };
}
