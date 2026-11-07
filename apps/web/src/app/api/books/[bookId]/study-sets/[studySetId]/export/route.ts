import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireBookAccess, requireActiveUser } from "@/lib/auth";
import { exportStudySetFile, parseExportFileFormat, parseExportSelection } from "@/lib/pdf-export";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    studySetId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, studySetId } = await context.params;
  if (!(await requireBookAccess(request.headers, bookId))) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  const url = new URL(request.url);
  const selection = parseExportSelection(url.searchParams);
  const type = selection?.[0];
  const format = parseExportFileFormat(url.searchParams.get("format"));
  const chapterId = url.searchParams.get("chapterId");

  if (!type) {
    return NextResponse.json({ error: "PDF export type is not valid." }, { status: 400 });
  }

  try {
    const exported = await exportStudySetFile(bookId, studySetId, type, format, chapterId, url.searchParams.has("types") ? selection! : undefined);
    const buffer = await fs.readFile(exported.filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
        "Content-Disposition": `attachment; filename="${exported.filename}"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not export PDF." },
      { status: 400 }
    );
  }
}
