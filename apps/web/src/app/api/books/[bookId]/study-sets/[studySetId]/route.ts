import { NextResponse } from "next/server";
import { deleteStudySet, getStudySetForBook, serializeStudySetDetail, summarizeStudySet, updateStudySet } from "@/lib/study-sets";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    studySetId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { bookId, studySetId } = await context.params;
  const studySet = await getStudySetForBook(bookId, studySetId);

  if (!studySet) {
    return NextResponse.json({ error: "Study set not found." }, { status: 404 });
  }

  return NextResponse.json({ studySet: serializeStudySetDetail(studySet) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { bookId, studySetId } = await context.params;
  const existing = await getStudySetForBook(bookId, studySetId);

  if (!existing) {
    return NextResponse.json({ error: "Study set not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const settings = body?.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
    ? body.settings as Record<string, unknown>
    : undefined;

  try {
    const updated = await updateStudySet({
      studySetId: existing.id,
      title: body?.title === undefined ? undefined : String(body.title),
      status: body?.status === undefined ? undefined : String(body.status),
      generator: body?.generator === undefined ? undefined : String(body.generator),
      model: body?.model === undefined ? undefined : body.model === null ? null : String(body.model),
      promptVersion: body?.promptVersion === undefined ? undefined : body.promptVersion === null ? null : String(body.promptVersion),
      settings,
      rawOutput: body?.rawOutput
    });

    if (!updated) {
      return NextResponse.json({ error: "Study set not found." }, { status: 404 });
    }

    return NextResponse.json({ studySet: summarizeStudySet(updated) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update study set." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { bookId, studySetId } = await context.params;
  const studySet = await getStudySetForBook(bookId, studySetId);

  if (!studySet) {
    return NextResponse.json({ error: "Study set not found." }, { status: 404 });
  }

  await deleteStudySet(studySet.id);
  return NextResponse.json({ ok: true });
}
