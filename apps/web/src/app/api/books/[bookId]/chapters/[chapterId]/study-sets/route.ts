import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { getChapter } from "@/lib/chapters";
import { getGenerationRun } from "@/lib/generation-runs";
import { createStudySet, listStudySetsForChapter, listStudySetsForChapterInRun, summarizeStudySet } from "@/lib/study-sets";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    chapterId: string;
  }>;
};

async function getBookChapter(bookId: string, chapterId: string) {
  const book = await getBook(bookId);
  const chapter = book ? await getChapter(chapterId) : null;

  if (!book || !chapter || chapter.bookId !== book.id) {
    return null;
  }

  return { book, chapter };
}

export async function GET(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, chapterId } = await context.params;
  const result = await getBookChapter(bookId, chapterId);

  if (!result) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  const requestedRunId = new URL(request.url).searchParams.get("generationRunId");
  const generationRunId = requestedRunId === "all" ? null : requestedRunId || result.book.activeGenerationRunId;
  const generationRun = generationRunId ? await getGenerationRun(generationRunId) : null;

  if (generationRunId && (!generationRun || generationRun.bookId !== result.book.id)) {
    return NextResponse.json({ error: "Generation run not found." }, { status: 404 });
  }

  const studySets = generationRunId
    ? await listStudySetsForChapterInRun(result.chapter.id, generationRunId)
    : await listStudySetsForChapter(result.book.id, result.chapter.id);
  return NextResponse.json({ studySets: studySets.map(summarizeStudySet) });
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, chapterId } = await context.params;
  const result = await getBookChapter(bookId, chapterId);

  if (!result) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const settings = body?.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
    ? body.settings as Record<string, unknown>
    : {};

  try {
    const studySet = await createStudySet({
      bookId,
      chapter: result.chapter,
      title: body?.title ? String(body.title) : undefined,
      generator: body?.generator ? String(body.generator) : undefined,
      model: body?.model ? String(body.model) : null,
      promptVersion: body?.promptVersion ? String(body.promptVersion) : null,
      settings
    });

    return NextResponse.json({ studySet: summarizeStudySet(studySet) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create study set." },
      { status: 400 }
    );
  }
}
