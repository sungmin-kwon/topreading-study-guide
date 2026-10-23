import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { books, libraryMemberships, type Book } from "@/lib/db/schema";
import { getUploadDir } from "@/lib/env";

function nowIso() {
  return new Date().toISOString();
}

export type BookSummary = Book;

export async function listBooks(userId: string): Promise<BookSummary[]> {
  return db.select({ book: books }).from(books).innerJoin(libraryMemberships, and(eq(libraryMemberships.libraryId, books.libraryId), eq(libraryMemberships.userId, userId))).orderBy(desc(books.createdAt)).then(rows => rows.map(row => row.book));
}

export async function getBook(bookId: string): Promise<BookSummary | null> {
  const rows = await db.select().from(books).where(eq(books.id, bookId)).limit(1);
  return rows[0] || null;
}

export async function createBook(input: {
  libraryId: string;
  title: string;
  author?: string | null;
  readingLevel?: string | null;
}): Promise<BookSummary> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Book title is required.");
  }

  const timestamp = nowIso();
  const book = {
    id: randomUUID(),
    libraryId: input.libraryId,
    title,
    author: input.author?.trim() || null,
    readingLevel: input.readingLevel?.trim() || null,
    activeGenerationRunId: null,
    pinnedAt: null,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await db.insert(books).values(book);
  return book;
}

export async function updateBook(input: {
  bookId: string;
  title: string;
  author?: string | null;
  readingLevel?: string | null;
}): Promise<BookSummary | null> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Book title is required.");
  }

  await db
    .update(books)
    .set({
      title,
      author: input.author?.trim() || null,
      readingLevel: input.readingLevel?.trim() || null,
      updatedAt: nowIso()
    })
    .where(eq(books.id, input.bookId));

  return getBook(input.bookId);
}

export async function updateBookActiveGenerationRun(bookId: string, generationRunId: string | null): Promise<BookSummary | null> {
  await db
    .update(books)
    .set({
      activeGenerationRunId: generationRunId,
      updatedAt: nowIso()
    })
    .where(eq(books.id, bookId));

  return getBook(bookId);
}

export async function updateBookPinnedAt(bookId: string, pinnedAt: string | null): Promise<BookSummary | null> {
  await db
    .update(books)
    .set({
      pinnedAt,
      updatedAt: nowIso()
    })
    .where(eq(books.id, bookId));

  return getBook(bookId);
}

export async function deleteBook(bookId: string): Promise<void> {
  // A rejected database deletion must never remove the retained book's files.
  await db.delete(books).where(eq(books.id, bookId));
  const uploadDir = getUploadDir();
  const bookUploadDir = path.resolve(uploadDir, bookId);
  const relative = path.relative(uploadDir, bookUploadDir);

  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    await fs.rm(bookUploadDir, { recursive: true, force: true });
  }
}
