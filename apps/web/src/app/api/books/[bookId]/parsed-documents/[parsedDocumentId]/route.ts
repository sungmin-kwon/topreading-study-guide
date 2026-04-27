import { NextResponse } from "next/server";
import { getBook } from "@/lib/books";
import { getParsedDocument, serializeParsedDocumentDetail } from "@/lib/parsed-documents";
import { getSourceFile } from "@/lib/source-files";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    parsedDocumentId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { bookId, parsedDocumentId } = await context.params;
  const book = await getBook(bookId);
  const parsedDocument = await getParsedDocument(parsedDocumentId);
  const sourceFile = parsedDocument ? await getSourceFile(parsedDocument.sourceFileId) : null;

  if (!book || !parsedDocument || !sourceFile || sourceFile.bookId !== book.id) {
    return NextResponse.json({ error: "Parsed document not found." }, { status: 404 });
  }

  return NextResponse.json({ parsedDocument: serializeParsedDocumentDetail(parsedDocument) });
}

