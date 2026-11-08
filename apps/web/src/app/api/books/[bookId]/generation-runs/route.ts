import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { createGenerationRun, summarizeGenerationRun, summarizeGenerationRunsForBook } from "@/lib/generation-runs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId } = await context.params;
  if (!(await requireBookAccess(_request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const book = await getBook(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  return NextResponse.json({ generationRuns: await summarizeGenerationRunsForBook(bookId) });
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId } = await context.params;
  if (!(await requireBookAccess(request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const book = await getBook(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const config = body?.config && typeof body.config === "object" && !Array.isArray(body.config)
    ? body.config as Record<string, unknown>
    : {};

  try {
    const run = await createGenerationRun({
      bookId,
      name: body?.name === undefined ? null : String(body.name),
      config
    });
    return NextResponse.json({ generationRun: await summarizeGenerationRun(run) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create generation run." }, { status: 400 });
  }
}
