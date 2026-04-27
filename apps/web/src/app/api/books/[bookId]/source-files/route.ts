import { NextResponse } from "next/server";
import { getBook } from "@/lib/books";
import { deleteSourceFile, getSourceFile, listSourceFiles, saveSourceFile } from "@/lib/source-files";

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

  const sourceFiles = await listSourceFiles(bookId);
  return NextResponse.json({ sourceFiles });
}

export async function POST(request: Request, context: RouteContext) {
  const { bookId } = await context.params;
  const book = await getBook(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A PDF, EPUB, or TXT file is required." }, { status: 400 });
  }

  try {
    const sourceFile = await saveSourceFile({ bookId, file });
    return NextResponse.json({ sourceFile }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload source file." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { bookId } = await context.params;
  const book = await getBook(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const sourceFileId = String(body?.sourceFileId || "");
  const sourceFile = sourceFileId ? await getSourceFile(sourceFileId) : null;

  if (!sourceFile || sourceFile.bookId !== book.id) {
    return NextResponse.json({ error: "Source file not found." }, { status: 404 });
  }

  await deleteSourceFile(sourceFile);
  return NextResponse.json({ ok: true });
}
