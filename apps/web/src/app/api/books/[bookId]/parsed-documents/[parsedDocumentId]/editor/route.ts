import { NextResponse } from "next/server";
import { requireActiveUser, requireBookAccess } from "@/lib/auth";
import {
  sourceEditorData,
  saveSourcePlan,
  restoreSourceLayout,
  deleteSourceSplit,
} from "@/lib/source-editor";
export const runtime = "nodejs";
type Context = {
  params: Promise<{
    bookId: string;
    parsedDocumentId: string;
  }>;
};
async function handle(request: Request, context: Context, write: boolean) {
  const user = await requireActiveUser(request.headers);
  if (!user)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { bookId, parsedDocumentId } = await context.params;
  if (!(await requireBookAccess(request.headers, bookId)))
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  try {
    if (write) {
      const input = await request.json();
      if (input.action === "delete-split")
        return NextResponse.json(
          await deleteSourceSplit(
            bookId,
            parsedDocumentId,
            user.id,
            input.layoutId,
          ),
        );
      if (input.action === "restore")
        return NextResponse.json(
          await restoreSourceLayout(
            bookId,
            parsedDocumentId,
            user.id,
            input.layoutId,
          ),
        );
      return NextResponse.json(
        await saveSourcePlan(
          bookId,
          parsedDocumentId,
          user.id,
          input,
          input.apply === true,
        ),
      );
    }
    const data = await sourceEditorData(bookId, parsedDocumentId, user.id);
    return NextResponse.json(
      {
        pages: data.pages.map((p) => ({
          pageNumber: p.pageNumber,
          textContent: p.textContent,
        })),
        pageCount: data.doc.pageCount,
        suggestions: data.metadata.outline || [],
        sourceId: data.source.id,
        filename: data.source.originalFilename,
        fingerprint: data.fingerprint,
        draft: data.draft,
        layouts: data.layouts,
        hasLegacy: data.hasLegacy,
        activeLayoutId: data.activeLayoutId,
        linkedLayoutIds: data.linkedLayoutIds,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load source.",
      },
      { status: 400 },
    );
  }
}
export const GET = (r: Request, c: Context) => handle(r, c, false);
export const PUT = (r: Request, c: Context) => handle(r, c, true);
