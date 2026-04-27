import { NextResponse } from "next/server";
import { getBook } from "@/lib/books";
import { countStudySetsForBook } from "@/lib/study-sets";

type RouteContext = {
  params: Promise<{
    bookId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
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
