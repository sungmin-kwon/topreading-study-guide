import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { getChapter } from "@/lib/chapters";
import { generateMockStudySet } from "@/lib/mock-generator";

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
  const book = await getBook(bookId);
  const chapter = book ? await getChapter(chapterId) : null;

  if (!book || !chapter || chapter.bookId !== book.id) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await generateMockStudySet(book.id, chapter, parsePlan(body));
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not generate mock study set." },
      { status: 400 }
    );
  }
}
