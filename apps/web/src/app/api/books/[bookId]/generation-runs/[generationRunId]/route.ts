import { NextResponse } from "next/server";
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
  const { bookId, generationRunId } = await context.params;
  const run = await getAuthorizedRun(bookId, generationRunId);

  if (!run) {
    return NextResponse.json({ error: "Generation run not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const progress = body?.progress && typeof body.progress === "object" && !Array.isArray(body.progress)
    ? body.progress as Record<string, unknown>
    : undefined;
  const log = Array.isArray(body?.log) ? body.log.map((item: unknown) => String(item)) : undefined;

  try {
    const updated = await updateGenerationRun({
      id: run.id,
      name: body?.name === undefined ? undefined : String(body.name),
      status: body?.status === undefined ? undefined : String(body.status),
      progress,
      log,
      errorMessage: body?.errorMessage === undefined ? undefined : body.errorMessage === null ? null : String(body.errorMessage),
      finishedAt: body?.finishedAt === undefined ? undefined : body.finishedAt === null ? null : String(body.finishedAt)
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
  const { bookId, generationRunId } = await context.params;
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
