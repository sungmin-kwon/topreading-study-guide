import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { deleteParsedDocument, extractAndSaveParsedDocument, getParsedDocument, listParsedDocumentsForSource, summarizeParsedDocument } from "@/lib/parsed-documents";
import { getSourceFile } from "@/lib/source-files";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    sourceFileId: string;
  }>;
};

async function loadSourceForBook(bookId: string, sourceFileId: string) {
  const book = await getBook(bookId);
  const sourceFile = await getSourceFile(sourceFileId);

  if (!book || !sourceFile || sourceFile.bookId !== book.id) {
    return null;
  }

  return sourceFile;
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, sourceFileId } = await context.params;
  if (!(await requireBookAccess(_request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const sourceFile = await loadSourceForBook(bookId, sourceFileId);

  if (!sourceFile) {
    return NextResponse.json({ error: "Source file not found." }, { status: 404 });
  }

  const parsedDocuments = await listParsedDocumentsForSource(sourceFile.id);
  return NextResponse.json({
    parsedDocuments: parsedDocuments.map(summarizeParsedDocument)
  });
}

export async function POST(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, sourceFileId } = await context.params;
  if (!(await requireBookAccess(_request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const sourceFile = await loadSourceForBook(bookId, sourceFileId);

  if (!sourceFile) {
    return NextResponse.json({ error: "Source file not found." }, { status: 404 });
  }

  try {
    const parsedDocument = await extractAndSaveParsedDocument(sourceFile);
    return NextResponse.json(
      { parsedDocument: summarizeParsedDocument(parsedDocument) },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not extract text from this PDF." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, sourceFileId } = await context.params;
  if (!(await requireBookAccess(request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const sourceFile = await loadSourceForBook(bookId, sourceFileId);

  if (!sourceFile) {
    return NextResponse.json({ error: "Source file not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsedDocumentId = String(body?.parsedDocumentId || "");
  const parsedDocument = parsedDocumentId ? await getParsedDocument(parsedDocumentId) : null;

  if (!parsedDocument || parsedDocument.sourceFileId !== sourceFile.id) {
    return NextResponse.json({ error: "Parsed document not found." }, { status: 404 });
  }

  await deleteParsedDocument(parsedDocument);
  return NextResponse.json({ ok: true });
}
