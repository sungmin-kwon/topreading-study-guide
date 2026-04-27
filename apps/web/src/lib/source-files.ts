import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sourceFiles, type SourceFile } from "@/lib/db/schema";
import { getUploadDir } from "@/lib/env";

const allowedExtensions = new Set([".pdf", ".txt", ".epub"]);
const fallbackMimeTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".epub": "application/epub+zip"
};

function nowIso() {
  return new Date().toISOString();
}

function sanitizeFilename(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  const name = path.basename(filename, extension)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${name || "source"}${extension || ".pdf"}`;
}

export async function listSourceFiles(bookId: string): Promise<SourceFile[]> {
  return db
    .select()
    .from(sourceFiles)
    .where(eq(sourceFiles.bookId, bookId))
    .orderBy(desc(sourceFiles.createdAt));
}

export async function getSourceFile(sourceFileId: string): Promise<SourceFile | null> {
  const rows = await db
    .select()
    .from(sourceFiles)
    .where(eq(sourceFiles.id, sourceFileId))
    .limit(1);

  return rows[0] || null;
}

export async function deleteSourceFile(sourceFile: SourceFile): Promise<void> {
  await db.delete(sourceFiles).where(eq(sourceFiles.id, sourceFile.id));

  const absolutePath = path.resolve(getUploadDir(), sourceFile.storedPath);
  await fs.rm(absolutePath, { force: true });
}

export async function saveSourceFile(input: {
  bookId: string;
  file: File;
}): Promise<SourceFile> {
  const file = input.file;
  const originalFilename = file.name || "source";
  const extension = path.extname(originalFilename).toLowerCase();

  if (!allowedExtensions.has(extension)) {
    throw new Error("Only PDF, EPUB, and TXT source files are supported right now.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length) {
    throw new Error("The uploaded file is empty.");
  }

  const id = randomUUID();
  const safeName = sanitizeFilename(originalFilename);
  const uploadRoot = getUploadDir();
  const bookUploadDir = path.join(uploadRoot, input.bookId);
  const storedRelativePath = path.join(input.bookId, `${id}-${safeName}`).replace(/\\/g, "/");
  const storedAbsolutePath = path.join(uploadRoot, storedRelativePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const createdAt = nowIso();

  await fs.mkdir(bookUploadDir, { recursive: true });
  await fs.writeFile(storedAbsolutePath, bytes);

  const sourceFile = {
    id,
    bookId: input.bookId,
    originalFilename,
    storedPath: storedRelativePath,
    mimeType: file.type || fallbackMimeTypes[extension] || "application/octet-stream",
    byteSize: bytes.byteLength,
    sha256,
    uploadStatus: "uploaded",
    createdAt
  };

  await db.insert(sourceFiles).values(sourceFile);
  return sourceFile;
}
