import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { getStudySetForBook } from "@/lib/study-sets";
import { appendStudyItems, clearStudyItems, listStudyItems, replaceStudyItems, summarizeStudyItems } from "@/lib/study-items";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    studySetId: string;
  }>;
};

function parseItemsBody(body: unknown) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};

  return {
    chapterSummaries: Array.isArray(value.chapterSummaries) ? value.chapterSummaries : [],
    vocabularyItems: Array.isArray(value.vocabularyItems) ? value.vocabularyItems : [],
    multipleChoiceQuestions: Array.isArray(value.multipleChoiceQuestions) ? value.multipleChoiceQuestions : [],
    shortAnswerQuestions: Array.isArray(value.shortAnswerQuestions) ? value.shortAnswerQuestions : []
  };
}

function parseChapterId(request: Request, fallback?: string | null) {
  const urlChapterId = new URL(request.url).searchParams.get("chapterId")?.trim();
  return urlChapterId || fallback || null;
}

async function getAuthorizedStudySet(bookId: string, studySetId: string) {
  return getStudySetForBook(bookId, studySetId);
}

export async function GET(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, studySetId } = await context.params;
  const studySet = await getAuthorizedStudySet(bookId, studySetId);

  if (!studySet) {
    return NextResponse.json({ error: "Study set not found." }, { status: 404 });
  }

  const items = await listStudyItems(studySet.id, { chapterId: parseChapterId(request, studySet.chapterId) });
  return NextResponse.json({ items: summarizeStudyItems(items) });
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, studySetId } = await context.params;
  const studySet = await getAuthorizedStudySet(bookId, studySetId);

  if (!studySet) {
    return NextResponse.json({ error: "Study set not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const bodyChapterId = body && typeof body === "object" ? String((body as Record<string, unknown>).chapterId || "").trim() : "";
    const items = await appendStudyItems(studySet.id, parseItemsBody(body), { chapterId: bodyChapterId || studySet.chapterId });
    return NextResponse.json({ items: summarizeStudyItems(items) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add generated items." },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { bookId, studySetId } = await context.params;
  const studySet = await getAuthorizedStudySet(bookId, studySetId);

  if (!studySet) {
    return NextResponse.json({ error: "Study set not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const bodyChapterId = body && typeof body === "object" ? String((body as Record<string, unknown>).chapterId || "").trim() : "";
    const items = await replaceStudyItems(studySet.id, parseItemsBody(body), { chapterId: bodyChapterId || studySet.chapterId });
    return NextResponse.json({ items: summarizeStudyItems(items) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not replace generated items." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, studySetId } = await context.params;
  const studySet = await getAuthorizedStudySet(bookId, studySetId);

  if (!studySet) {
    return NextResponse.json({ error: "Study set not found." }, { status: 404 });
  }

  await clearStudyItems(studySet.id);
  return NextResponse.json({ ok: true });
}
