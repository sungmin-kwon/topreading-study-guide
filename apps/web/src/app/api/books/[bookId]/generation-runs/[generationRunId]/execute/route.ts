import { NextResponse } from "next/server";
import { requireActiveUser, requireBookAccess } from "@/lib/auth";
import { enqueueGeneration } from "@/lib/generation-queue";
import { getGenerationRun, summarizeGenerationRun } from "@/lib/generation-runs";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{bookId: string; generationRunId: string}> }) {
  const user = await requireActiveUser(request.headers);
  if (!user) return NextResponse.json({error: "Unauthorized."}, {status: 401});
  const {bookId, generationRunId} = await context.params;
  if (!(await requireBookAccess(request.headers, bookId))) return NextResponse.json({error: "Book not found."}, {status: 404});
  try {
    await enqueueGeneration(bookId, generationRunId, user.id);
    const run = await getGenerationRun(generationRunId);
    return NextResponse.json({generationRun: await summarizeGenerationRun(run!)}, {status: 202});
  } catch (error) {
    return NextResponse.json({error: error instanceof Error && error.name === "QueueError" ? error.message : "Could not queue generation."}, {status: 409});
  }
}
