import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { getBook } from "@/lib/books";
import { getGenerationRun, summarizeGenerationRun, updateGenerationRun, type GenerationLogEntry } from "@/lib/generation-runs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookId: string;
    generationRunId: string;
  }>;
};

function nowIso() {
  return new Date().toISOString();
}

function parseLog(value: string | null | undefined): GenerationLogEntry[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item) => {
    const entry = item && typeof item === "object" ? item as Partial<GenerationLogEntry> : {};
    return {
      timestamp: String(entry.timestamp || ""),
      level: entry.level === "success" || entry.level === "warn" || entry.level === "error" ? entry.level : "info",
      message: String(entry.message || item || "")
    };
  });
}

function parseProgress(value: string | null | undefined) {
  if (!value) {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

export async function POST(_request: Request, context: RouteContext) {
  if (!(await requireActiveUser(_request.headers))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { bookId, generationRunId } = await context.params;
  const book = await getBook(bookId);
  const run = book ? await getGenerationRun(generationRunId) : null;

  if (!book || !run || run.bookId !== book.id) {
    return NextResponse.json({ error: "Generation run not found." }, { status: 404 });
  }

  if (run.status === "cancelled") {
    return NextResponse.json({ generationRun: await summarizeGenerationRun(run) });
  }

  if (run.status !== "generating") {
    return NextResponse.json({ error: "Only a running generation can be cancelled." }, { status: 400 });
  }

  const updated = await updateGenerationRun({
    id: run.id,
    status: "cancelled",
    progress: {
      ...parseProgress(run.progressJson),
      cancellationRequestedAt: nowIso()
    },
    log: [
      ...parseLog(run.logJson),
      {
        timestamp: nowIso(),
        level: "warn",
        message: "Cancellation requested. The current chapter will finish before the run stops."
      }
    ]
  });

  return NextResponse.json({ generationRun: await summarizeGenerationRun(updated || run) });
}
