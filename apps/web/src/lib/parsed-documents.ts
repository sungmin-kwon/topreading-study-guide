import { randomUUID } from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { parsedDocuments, parsedPages, type ParsedDocument, type ParsedPage, type SourceFile } from "@/lib/db/schema";
import { getUploadDir } from "@/lib/env";

const execFileAsync = promisify(execFile);

type ExtractorPayload = {
  parser?: string;
  parser_version?: string;
  page_count?: number;
  metadata?: Record<string, unknown>;
  pages?: Array<{
    page_number?: number;
    text?: string;
  }>;
  text?: string;
  error?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeText(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u000c/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getRepoRoot() {
  return path.resolve(process.cwd(), "../..");
}

function getPythonExecutable() {
  return process.env.PYTHON_EXECUTABLE || "python";
}

function getSourceAbsolutePath(sourceFile: SourceFile) {
  return path.resolve(getUploadDir(), sourceFile.storedPath);
}

async function extractSourceText(sourcePath: string): Promise<ExtractorPayload> {
  const scriptPath = path.join(getRepoRoot(), "scripts", "extract_source_text.py");
  const { stdout, stderr } = await execFileAsync(
    getPythonExecutable(),
    [scriptPath, sourcePath],
    { maxBuffer: 128 * 1024 * 1024 }
  );

  if (stderr.trim()) {
    throw new Error(stderr.trim());
  }

  const payload = JSON.parse(stdout) as ExtractorPayload;
  if (payload.error) {
    throw new Error(payload.error);
  }

  return payload;
}

export async function listParsedDocumentsForSource(sourceFileId: string): Promise<ParsedDocument[]> {
  return db
    .select()
    .from(parsedDocuments)
    .where(eq(parsedDocuments.sourceFileId, sourceFileId))
    .orderBy(desc(parsedDocuments.createdAt));
}

export async function getParsedDocument(parsedDocumentId: string): Promise<ParsedDocument | null> {
  const rows = await db
    .select()
    .from(parsedDocuments)
    .where(eq(parsedDocuments.id, parsedDocumentId))
    .limit(1);

  return rows[0] || null;
}

export async function listParsedPages(parsedDocumentId: string): Promise<ParsedPage[]> {
  return db
    .select()
    .from(parsedPages)
    .where(eq(parsedPages.parsedDocumentId, parsedDocumentId))
    .orderBy(asc(parsedPages.pageNumber));
}

export async function deleteParsedDocument(parsedDocument: ParsedDocument): Promise<void> {
  await db.delete(parsedDocuments).where(eq(parsedDocuments.id, parsedDocument.id));
}

export async function extractAndSaveParsedDocument(sourceFile: SourceFile): Promise<ParsedDocument> {
  const extracted = await extractSourceText(getSourceAbsolutePath(sourceFile));
  const textContent = normalizeText(extracted.text || "");

  if (!textContent && !(sourceFile.originalFilename.toLowerCase().endsWith(".pdf") && Number(extracted.page_count)>0)) {
    throw new Error("No readable text was extracted from this source file.");
  }

  const parsedDocument = {
    id: randomUUID(),
    sourceFileId: sourceFile.id,
    parserName: extracted.parser || "pymupdf",
    parserVersion: extracted.parser_version || "unknown",
    textContent,
    pageCount: Number(extracted.page_count || 0),
    wordCount: countWords(textContent),
    metadataJson: JSON.stringify(extracted.metadata || {}),
    createdAt: nowIso()
  };

  await db.insert(parsedDocuments).values(parsedDocument);
  const pageRows = (extracted.pages || [])
    .map((page) => ({
      id: randomUUID(),
      parsedDocumentId: parsedDocument.id,
      pageNumber: Number(page.page_number || 0),
      textContent: normalizeText(page.text || ""),
      wordCount: countWords(page.text || ""),
      createdAt: parsedDocument.createdAt
    }))
    .filter((page) => page.pageNumber > 0);

  if (pageRows.length) {
    await db.insert(parsedPages).values(pageRows);
  }

  return parsedDocument;
}

export function summarizeParsedDocument(parsedDocument: ParsedDocument) {
  const {splitDrafts, chapterLayouts, ...metadata} = JSON.parse(parsedDocument.metadataJson || "{}");
  return {
    id: parsedDocument.id,
    sourceFileId: parsedDocument.sourceFileId,
    parserName: parsedDocument.parserName,
    parserVersion: parsedDocument.parserVersion,
    pageCount: parsedDocument.pageCount,
    wordCount: parsedDocument.wordCount,
    metadata,
    preview: parsedDocument.textContent.slice(0, 900),
    createdAt: parsedDocument.createdAt
  };
}

export function serializeParsedDocumentDetail(parsedDocument: ParsedDocument) {
  return {
    ...summarizeParsedDocument(parsedDocument),
    textContent: parsedDocument.textContent
  };
}

export function summarizeParsedPage(page: ParsedPage) {
  return {
    id: page.id,
    parsedDocumentId: page.parsedDocumentId,
    pageNumber: page.pageNumber,
    wordCount: page.wordCount,
    preview: page.textContent.slice(0, 700)
  };
}
