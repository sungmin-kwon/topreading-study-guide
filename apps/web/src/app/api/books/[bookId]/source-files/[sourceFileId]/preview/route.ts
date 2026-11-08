import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { requireActiveUser, requireBookAccess } from "@/lib/auth";
import { getSourceFile } from "@/lib/source-files";
import { getUploadDir } from "@/lib/env";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: {
    params: Promise<{
      bookId: string;
      sourceFileId: string;
    }>;
  },
) {
  if (!(await requireActiveUser(request.headers)))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { bookId, sourceFileId } = await context.params;
  if (!(await requireBookAccess(request.headers, bookId)))
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  const source = await getSourceFile(sourceFileId);
  if (
    !source ||
    source.bookId !== bookId ||
    !source.originalFilename.toLowerCase().endsWith(".pdf")
  )
    return NextResponse.json(
      { error: "PDF source not found." },
      { status: 404 },
    );
  const page = Number(new URL(request.url).searchParams.get("page"));
  if (!Number.isInteger(page) || page < 1)
    return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  const root = path.resolve(getUploadDir()),
    file = path.resolve(root, source.storedPath);
  if (!file.startsWith(root + path.sep))
    return NextResponse.json(
      { error: "Invalid source path." },
      { status: 400 },
    );
  try {
    const { stdout } = await promisify(execFile)(
      process.env.PYTHON_EXECUTABLE || "python3",
      [
        path.resolve(process.cwd(), "../../scripts/render_source_page.py"),
        file,
        String(page),
      ],
      { timeout: 20000, maxBuffer: 16 * 1024 * 1024 },
    );
    const result = JSON.parse(stdout);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not display this PDF page." },
      { status: 400 },
    );
  }
}
