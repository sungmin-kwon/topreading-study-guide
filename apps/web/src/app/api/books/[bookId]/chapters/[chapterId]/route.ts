import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { deleteChapter, getChapter, serializeChapterDetail, summarizeChapter, updateChapter } from "@/lib/chapters";

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

  return chapter;
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, chapterId } = await context.params;
  if (!(await requireBookAccess(_request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const chapter = await getBookChapter(bookId, chapterId);

  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  return NextResponse.json({ chapter: serializeChapterDetail(chapter) });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, chapterId } = await context.params;
  if (!(await requireBookAccess(request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const chapter = await getBookChapter(bookId, chapterId);

  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const updated = await updateChapter({
      chapterId: chapter.id,
      chapterNumber: Number(body?.chapterNumber ?? chapter.chapterNumber),
      title: String(body?.title ?? chapter.title),
      textContent: String(body?.textContent ?? chapter.textContent)
    });

    if (!updated) {
      return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
    }

    return NextResponse.json({ chapter: summarizeChapter(updated) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update chapter." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, chapterId } = await context.params;
  if (!(await requireBookAccess(_request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const chapter = await getBookChapter(bookId, chapterId);

  if (!chapter) {
    return NextResponse.json({ error: "Chapter not found." }, { status: 404 });
  }

  await deleteChapter(chapter.id);
  return NextResponse.json({ ok: true });
}
