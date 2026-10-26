import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { getChapter } from "@/lib/chapters";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    chapterId: string;
  }>;
};

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

  return NextResponse.json({ error: "Use Generate a guide to queue generation in the background worker." }, { status: 410 });
}
