import { NextResponse } from "next/server";
import { getStudySetForBook } from "@/lib/study-sets";
import { deleteStudyItem, listStudyItems, normalizeStudyItemKind, summarizeStudyItems, updateStudyItem } from "@/lib/study-items";

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

export async function PATCH(request: Request, context: RouteContext) {
  const { bookId, studySetId, kind: kindValue, itemId } = await context.params;
  const authorized = await getAuthorizedContext(bookId, studySetId, kindValue);

  if (!authorized) {
    return NextResponse.json({ error: "Generated item not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    await updateStudyItem(authorized.kind, authorized.studySet.id, itemId, body);
    const items = await listStudyItems(authorized.studySet.id);
    return NextResponse.json({ items: summarizeStudyItems(items) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update generated item." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { bookId, studySetId, kind: kindValue, itemId } = await context.params;
  const authorized = await getAuthorizedContext(bookId, studySetId, kindValue);

  if (!authorized) {
    return NextResponse.json({ error: "Generated item not found." }, { status: 404 });
  }

  await deleteStudyItem(authorized.kind, authorized.studySet.id, itemId);
  return NextResponse.json({ ok: true });
}
