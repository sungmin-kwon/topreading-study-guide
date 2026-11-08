import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { atomic, db } from "./db/client";
import { books, chapters, generationRuns, parsedDocuments } from "./db/schema";
import { getParsedDocument, listParsedPages } from "./parsed-documents";
import { getSourceFile } from "./source-files";
import { splitAtBoundaries, type SplitPlan } from "./source-boundaries";
export async function sourceEditorData(
  bookId: string,
  documentId: string,
  userId: string,
) {
  const doc = await getParsedDocument(documentId);
  const source = doc ? await getSourceFile(doc.sourceFileId) : null;
  if (!doc || !source || source.bookId !== bookId)
    throw new Error("Source not found.");
  const pages = await listParsedPages(doc.id);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(pages.map((p) => [p.pageNumber, p.textContent])))
    .digest("hex");
  const metadata = JSON.parse(doc.metadataJson || "{}");
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  const legacy = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(eq(chapters.bookId, bookId), sql`${chapters.layoutId} IS NULL`))
    .limit(1);
  return {
    activeLayoutId: book?.activeLayoutId,
    hasLegacy: legacy.length > 0,
    doc,
    source,
    pages,
    fingerprint,
    metadata,
    draft: metadata.splitDrafts?.[userId] || {
      version: 0,
      plan: { starts: [], end: null },
      fingerprint,
    },
    layouts: metadata.chapterLayouts || [],
  };
}
export async function saveSourcePlan(
  bookId: string,
  documentId: string,
  userId: string,
  input: any,
  apply: boolean,
) {
  return atomic(async () => {
    await db.execute(
      sql`SELECT id FROM ${books} WHERE id=${bookId} FOR UPDATE`,
    );
    await db.execute(
      sql`SELECT id FROM ${parsedDocuments} WHERE id=${documentId} FOR UPDATE`,
    );
    const data = await sourceEditorData(bookId, documentId, userId);
    if (
      input.fingerprint !== data.fingerprint ||
      input.version !== data.draft.version
    )
      throw new Error(
        "This draft changed in another window. Reload before saving.",
      );
    const plan = input.plan as SplitPlan;
    // Empty drafts may be saved while editing, but cannot be applied.
    const preview = plan?.starts?.length
      ? splitAtBoundaries(data.pages, plan)
      : [];
    if (
      !plan ||
      !Array.isArray(plan.starts) ||
      (!plan.starts.length && plan.end) ||
      JSON.stringify(plan).length > 250000
    )
      throw new Error("Invalid chapter plan.");
    let layoutId: string | null = null;
    if (apply) {
      if (!preview.length) throw new Error("Mark at least one chapter start.");
      const busy = await db
        .select({ id: generationRuns.id })
        .from(generationRuns)
        .where(
          and(
            eq(generationRuns.bookId, bookId),
            eq(generationRuns.status, "generating"),
          ),
        );
      if (busy.length)
        throw new Error(
          "Finish or cancel generation before changing chapters.",
        );
      layoutId = randomUUID();
      const now = new Date().toISOString();
      await db
        .insert(chapters)
        .values(
          preview.map((p) => ({
            id: randomUUID(),
            bookId,
            parsedDocumentId: documentId,
            layoutId,
            chapterNumber: p.chapterNumber,
            title: p.title,
            textContent: p.textContent,
            wordCount: p.wordCount,
            sortOrder: p.sortOrder,
            createdAt: now,
            updatedAt: now,
          })),
        );
      await db
        .update(books)
        .set({
          activeLayoutId: layoutId,
          activeGenerationRunId: null,
          updatedAt: now,
        })
        .where(eq(books.id, bookId));
      data.metadata.chapterLayouts = [
        ...(data.layouts || []),
        { id: layoutId, createdAt: now, count: preview.length, plan },
      ];
    }
    const draft = {
      version: data.draft.version + 1,
      plan,
      fingerprint: data.fingerprint,
    };
    data.metadata.splitDrafts = {
      ...(data.metadata.splitDrafts || {}),
      [userId]: draft,
    };
    await db
      .update(parsedDocuments)
      .set({ metadataJson: JSON.stringify(data.metadata) })
      .where(eq(parsedDocuments.id, documentId));
    return { draft, layoutId };
  });
}
export async function restoreSourceLayout(
  bookId: string,
  documentId: string,
  userId: string,
  layoutId: string | null,
) {
  return atomic(async () => {
    await db.execute(
      sql`SELECT id FROM ${books} WHERE id=${bookId} FOR UPDATE`,
    );
    const data = await sourceEditorData(bookId, documentId, userId);
    if (
      layoutId === null
        ? !data.hasLegacy
        : !data.layouts.some((l: any) => l.id === layoutId)
    )
      throw new Error("Saved layout not found.");
    const busy = await db
      .select({ id: generationRuns.id })
      .from(generationRuns)
      .where(
        and(
          eq(generationRuns.bookId, bookId),
          eq(generationRuns.status, "generating"),
        ),
      );
    if (busy.length)
      throw new Error("Finish or cancel generation before changing chapters.");
    await db
      .update(books)
      .set({
        activeLayoutId: layoutId,
        activeGenerationRunId: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(books.id, bookId));
    return { ok: true };
  });
}
