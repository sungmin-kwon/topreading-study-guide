import { NextResponse } from "next/server";
import { userLibrary, requireActiveUser } from "@/lib/auth";
import { createBook, listBooks } from "@/lib/books";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireActiveUser(request.headers);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const books = await listBooks(user.id);
  return NextResponse.json({ books });
}

export async function POST(request: Request) {
  const user = await requireActiveUser(request.headers);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const membership = await userLibrary(user.id);
  if (!membership) return NextResponse.json({ error: "Library membership required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));

  try {
    const book = await createBook({
      libraryId: membership.libraryId,
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

