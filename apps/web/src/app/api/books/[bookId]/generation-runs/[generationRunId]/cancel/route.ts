import { cancelGeneration } from "@/lib/generation-queue";
import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { getGenerationRun, summarizeGenerationRun } from "@/lib/generation-runs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    generationRunId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, generationRunId } = await context.params;
  if (!(await requireBookAccess(_request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const book = await getBook(bookId);
  const run = book ? await getGenerationRun(generationRunId) : null;

  if (!book || !run || run.bookId !== book.id) {
    return NextResponse.json({ error: "Generation run not found." }, { status: 404 });
  }

  if (run.status === "cancelled") {
    return NextResponse.json({ generationRun: await summarizeGenerationRun(run) });
  }

  if (run.status !== "generating") {
    return NextResponse.json({ error: "Only a running generation can be cancelled." }, { status: 400 });
  }

  await cancelGeneration(run.id);
  return NextResponse.json({ generationRun: await summarizeGenerationRun(run) });
}
