import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { getStudySetForBook } from "@/lib/study-sets";
import { deleteStudyItem, listStudyItems, moveStudyItem, normalizeStudyItemKind, summarizeStudyItems, updateStudyItem } from "@/lib/study-items";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    studySetId: string;
    kind: string;
    itemId: string;
  }>;
};

async function getAuthorizedContext(bookId: string, studySetId: string, kindValue: string) {
  const studySet = await getStudySetForBook(bookId, studySetId);
  const kind = normalizeStudyItemKind(kindValue);

  if (!studySet || !kind) {
    return null;
  }

  return { studySet, kind };
}

function parseChapterId(request: Request, fallback?: string | null) {
  const value = new URL(request.url).searchParams.get("chapterId")?.trim();
  return value || fallback || null;
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, studySetId, kind: kindValue, itemId } = await context.params;
  if (!(await requireBookAccess(request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const authorized = await getAuthorizedContext(bookId, studySetId, kindValue);

  if (!authorized) {
    return NextResponse.json({ error: "Generated item not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const chapterId = parseChapterId(request, authorized.studySet.chapterId);

  try {
    if (
      body
      && typeof body === "object"
      && "direction" in body
      && ((body as Record<string, unknown>).direction === "up" || (body as Record<string, unknown>).direction === "down")
    ) {
      const items = await moveStudyItem(
        authorized.kind,
        authorized.studySet.id,
        itemId,
        (body as Record<string, "up" | "down">).direction,
        { chapterId }
      );
      return NextResponse.json({ items: summarizeStudyItems(items) });
    }

    await updateStudyItem(authorized.kind, authorized.studySet.id, itemId, body);
    const items = await listStudyItems(authorized.studySet.id, { chapterId });
    return NextResponse.json({ items: summarizeStudyItems(items) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update generated item." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, studySetId, kind: kindValue, itemId } = await context.params;
  if (!(await requireBookAccess(_request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const authorized = await getAuthorizedContext(bookId, studySetId, kindValue);

  if (!authorized) {
    return NextResponse.json({ error: "Generated item not found." }, { status: 404 });
  }

  await deleteStudyItem(authorized.kind, authorized.studySet.id, itemId);
  return NextResponse.json({ ok: true });
}
