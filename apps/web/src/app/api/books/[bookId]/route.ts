import { NextResponse } from "next/server";
import { deleteBook, getBook, updateBook, updateBookActiveGenerationRun, updateBookPinnedAt } from "@/lib/books";
import { getGenerationRun } from "@/lib/generation-runs";

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

  return NextResponse.json({ book });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { bookId } = await context.params;
  const existing = await getBook(bookId);

  if (!existing) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    let book = await updateBook({
      bookId,
      title: String(body?.title ?? existing.title),
      author: body?.author === undefined ? existing.author : body.author ? String(body.author) : null,
      readingLevel: body?.readingLevel === undefined ? existing.readingLevel : body.readingLevel ? String(body.readingLevel) : null
    });

    if (body?.activeGenerationRunId !== undefined) {
      const activeGenerationRunId = body.activeGenerationRunId ? String(body.activeGenerationRunId) : null;
      const generationRun = activeGenerationRunId ? await getGenerationRun(activeGenerationRunId) : null;

      if (activeGenerationRunId && (!generationRun || generationRun.bookId !== bookId)) {
        return NextResponse.json({ error: "Generation run not found." }, { status: 404 });
      }

      book = await updateBookActiveGenerationRun(bookId, activeGenerationRunId);
    }

    if (body?.pinned !== undefined) {
      book = await updateBookPinnedAt(bookId, body.pinned ? new Date().toISOString() : null);
    }

    return NextResponse.json({ book });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update book." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { bookId } = await context.params;
  const existing = await getBook(bookId);

  if (!existing) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  await deleteBook(bookId);
  return NextResponse.json({ ok: true });
}
