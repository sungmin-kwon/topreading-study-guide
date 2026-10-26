import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { getBook, updateBookActiveGenerationRun } from "@/lib/books";
import { deleteGenerationRun, getGenerationRun, summarizeGenerationRun, updateGenerationRun } from "@/lib/generation-runs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    generationRunId: string;
  }>;
};

async function getAuthorizedRun(bookId: string, generationRunId: string) {
  const book = await getBook(bookId);
  const run = book ? await getGenerationRun(generationRunId) : null;
  return book && run?.bookId === book.id ? run : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, generationRunId } = await context.params;
  if (!(await requireBookAccess(request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const run = await getAuthorizedRun(bookId, generationRunId);

  if (!run) {
    return NextResponse.json({ error: "Generation run not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  try {
    const updated = await updateGenerationRun({
      id: run.id,
      name: body?.name === undefined ? undefined : String(body.name),

    });

    return NextResponse.json({ generationRun: await summarizeGenerationRun(updated || run) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update generation run." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, generationRunId } = await context.params;
  if (!(await requireBookAccess(_request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const run = await getAuthorizedRun(bookId, generationRunId);

  if (!run) {
    return NextResponse.json({ error: "Generation run not found." }, { status: 404 });
  }

  if (run.status === "generating") {
    return NextResponse.json({ error: "A running generation cannot be deleted." }, { status: 400 });
  }

  const book = await getBook(bookId);
  if (book?.activeGenerationRunId === run.id) {
    await updateBookActiveGenerationRun(book.id, null);
  }

  await deleteGenerationRun(run.id);
  return NextResponse.json({ ok: true });
}
