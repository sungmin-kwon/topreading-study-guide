import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { exportBookFile, parseExportFileFormat, parsePdfExportType } from "@/lib/pdf-export";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  if (!(await requireActiveUser(request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId } = await context.params;
  const url = new URL(request.url);
  const type = parsePdfExportType(url.searchParams.get("type"));
  const format = parseExportFileFormat(url.searchParams.get("format"));
  const generationRunId = url.searchParams.get("generationRunId");

  if (!type) {
    return NextResponse.json({ error: "PDF export type is not valid." }, { status: 400 });
  }

  try {
    const exported = await exportBookFile(bookId, type, format, generationRunId === "latest" ? null : generationRunId);
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
      { error: error instanceof Error ? error.message : "Could not export book PDF." },
      { status: 400 }
    );
  }
}
