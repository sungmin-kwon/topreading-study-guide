import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { getParsedDocument, listParsedPages, summarizeParsedPage } from "@/lib/parsed-documents";
import { getSourceFile } from "@/lib/source-files";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    parsedDocumentId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, parsedDocumentId } = await context.params;
  if (!(await requireBookAccess(_request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const book = await getBook(bookId);
  const parsedDocument = await getParsedDocument(parsedDocumentId);
  const sourceFile = parsedDocument ? await getSourceFile(parsedDocument.sourceFileId) : null;

  if (!book || !parsedDocument || !sourceFile || sourceFile.bookId !== book.id) {
    return NextResponse.json({ error: "Parsed document not found." }, { status: 404 });
  }

  const pages = await listParsedPages(parsedDocument.id);
  return NextResponse.json({ pages: pages.map(summarizeParsedPage) });
}

