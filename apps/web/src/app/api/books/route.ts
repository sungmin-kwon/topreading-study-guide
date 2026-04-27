import { NextResponse } from "next/server";
import { createBook, listBooks } from "@/lib/books";

export const runtime = "nodejs";

export async function GET() {
  const books = await listBooks();
  return NextResponse.json({ books });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  try {
    const book = await createBook({
      title: String(body?.title || ""),
      author: body?.author ? String(body.author) : null,
      readingLevel: body?.readingLevel ? String(body.readingLevel) : null
    });

    return NextResponse.json({ book }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create book." },
      { status: 400 }
    );
  }
}

