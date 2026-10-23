import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { getChapter } from "@/lib/chapters";
import { getGenerationRun } from "@/lib/generation-runs";
import { generateOpenAIStudySet } from "@/lib/openai-generator";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    chapterId: string;
  }>;
};

function parsePlan(body: unknown) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const plan = value.plan && typeof value.plan === "object" ? value.plan as Record<string, unknown> : value;

  return {
    vocabularyCount: Number(plan.vocabularyCount),
    multipleChoiceCount: Number(plan.multipleChoiceCount),
    shortAnswerCount: Number(plan.shortAnswerCount)
  };
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, chapterId } = await context.params;
  if (!(await requireBookAccess(request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const book = await getBook(bookId);
  const chapter = book ? await getChapter(chapterId) : null;

  if (!book || !chapter || chapter.bookId !== book.id) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const generationRunId = body?.generationRunId === undefined ? null : String(body.generationRunId);
    const generationRun = generationRunId ? await getGenerationRun(generationRunId) : null;

    if (generationRunId && (!generationRun || generationRun.bookId !== book.id)) {
      return NextResponse.json({ error: "Generation run not found." }, { status: 404 });
    }

    const result = await generateOpenAIStudySet(book, chapter, parsePlan(body), {
      generationRunId,
      runName: generationRun?.name || null
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate study set." },
      { status: 400 }
    );
  }
}
