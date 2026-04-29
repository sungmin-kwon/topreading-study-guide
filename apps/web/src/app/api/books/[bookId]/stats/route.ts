import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { countStudySetsForBook } from "@/lib/study-sets";

type RouteContext = {
  params: Promise<{
    bookId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId } = await context.params;
  const book = await getBook(bookId);

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  return NextResponse.json({
    stats: {
      studySetCount: await countStudySetsForBook(bookId)
    }
  });
}
