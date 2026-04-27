import { NextResponse } from "next/server";
import { getBook } from "@/lib/books";
import { createChaptersFromManualMarkers, createChaptersFromPageStarts, createChaptersFromParsedDocument, deleteChaptersByBook, listChaptersByBook, summarizeChapter } from "@/lib/chapters";
import { getParsedDocument, listParsedPages } from "@/lib/parsed-documents";
import { getSourceFile } from "@/lib/source-files";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { bookId } = await context.params;
  const book = await getBook(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const chapters = await listChaptersByBook(bookId);
  return NextResponse.json({ chapters: chapters.map(summarizeChapter) });
}

export async function POST(request: Request, context: RouteContext) {
  const { bookId } = await context.params;
  const book = await getBook(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsedDocumentId = String(body?.parsedDocumentId || "");
  const parsedDocument = parsedDocumentId ? await getParsedDocument(parsedDocumentId) : null;
  const sourceFile = parsedDocument ? await getSourceFile(parsedDocument.sourceFileId) : null;

  if (!parsedDocument || !sourceFile || sourceFile.bookId !== book.id) {
    return NextResponse.json({ error: "Parsed document not found." }, { status: 404 });
  }

  try {
    const markers = Array.isArray(body?.markers)
      ? body.markers.map((item: unknown) => {
          if (typeof item === "string") {
            return { marker: item };
          }

          if (item && typeof item === "object") {
            const value = item as { marker?: unknown; title?: unknown };
            return {
              marker: String(value.marker || ""),
              title: value.title ? String(value.title) : undefined
            };
          }

          return { marker: "" };
        }).filter((item: { marker: string }) => item.marker.trim())
      : [];
    const pageStarts = Array.isArray(body?.pageStarts)
      ? body.pageStarts.map((item: unknown) => {
          if (typeof item === "number") {
            return { pageNumber: item };
          }

          if (item && typeof item === "object") {
            const value = item as { pageNumber?: unknown; title?: unknown };
            return {
              pageNumber: Number(value.pageNumber),
              title: value.title ? String(value.title) : undefined
            };
          }

          return { pageNumber: Number.NaN };
        }).filter((item: { pageNumber: number }) => Number.isInteger(item.pageNumber) && item.pageNumber > 0)
      : [];
    const pages = pageStarts.length ? await listParsedPages(parsedDocument.id) : [];
    const chapters = pageStarts.length
      ? await createChaptersFromPageStarts({ bookId, parsedDocument, pages, pageStarts })
      : markers.length
        ? await createChaptersFromManualMarkers({ bookId, parsedDocument, markers })
        : await createChaptersFromParsedDocument({ bookId, parsedDocument });
    return NextResponse.json({ chapters: chapters.map(summarizeChapter) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create chapters." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { bookId } = await context.params;
  const book = await getBook(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  await deleteChaptersByBook(book.id);
  return NextResponse.json({ ok: true });
}
