import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { atomic, db } from "./db/client";
import {
  appSchema,
  books,
  chapters,
  generationRuns,
  parsedDocuments,
  studySets,
  multipleChoiceQuestions,
  shortAnswerQuestions,
  vocabularyItems,
  chapterSummaries,
} from "./db/schema";
import { getParsedDocument, listParsedPages } from "./parsed-documents";
import { getSourceFile } from "./source-files";
import { splitAtBoundaries, type SplitPlan } from "./source-boundaries";
// Include legacy guides and item-level provenance, not only generation runs.
async function linkedSplits(bookId: string): Promise<(string | null)[]> {
  const revisions = sql`${sql.identifier(appSchema.schemaName)}.${sql.identifier("chapter_revisions")}`;
  const itemReferences = [
    multipleChoiceQuestions,
    shortAnswerQuestions,
    vocabularyItems,
    chapterSummaries,
  ].map(
    (table) => sql`EXISTS (
    SELECT 1 FROM ${table} WHERE ${table.chapterId}=${chapters.id}
    OR ${table.chapterRevisionId} IN (SELECT id FROM ${revisions} WHERE chapter_id=${chapters.id})
  )`,
  );
  const result = await db.execute(sql`
    SELECT ${generationRuns.layoutId} AS layout_id FROM ${generationRuns} WHERE ${generationRuns.bookId}=${bookId}
    UNION
    SELECT ${chapters.layoutId} AS layout_id FROM ${chapters} WHERE ${chapters.bookId}=${bookId} AND (
      EXISTS (SELECT 1 FROM ${studySets} WHERE ${studySets.chapterId}=${chapters.id})
      OR ${sql.join(itemReferences, sql` OR `)}
    )
  `);
  return result.rows.map((row) => row.layout_id as string | null);
}

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
    linkedLayoutIds: await linkedSplits(bookId),
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
      await db.insert(chapters).values(
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
      throw new Error("Saved chapter split not found.");
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

export async function deleteSourceSplit(
  bookId: string,
  documentId: string,
  userId: string,
  layoutId: unknown,
) {
  if (
    layoutId !== null &&
    (typeof layoutId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        layoutId,
      ))
  )
    throw new Error("Choose a saved chapter split.");
  return atomic(async () => {
    // Same lock order as applying a split and creating a generation run.
    await db.execute(
      sql`SELECT id FROM ${books} WHERE id=${bookId} FOR UPDATE`,
    );
    await db.execute(
      sql`SELECT id FROM ${parsedDocuments} WHERE id=${documentId} FOR UPDATE`,
    );
    const layoutFilter =
      layoutId === null
        ? sql`${chapters.layoutId} IS NULL`
        : eq(chapters.layoutId, layoutId);
    // Serialize with FK-backed guide/item inserts as well as chapter edits.
    await db.execute(
      sql`SELECT id FROM ${chapters} WHERE ${chapters.bookId}=${bookId} AND ${layoutFilter} FOR UPDATE`,
    );
    const data = await sourceEditorData(bookId, documentId, userId);
    if (
      layoutId === null
        ? !data.hasLegacy
        : !data.layouts.some((l: { id: string }) => l.id === layoutId)
    )
      throw new Error("Saved chapter split not found.");
    if (data.activeLayoutId === layoutId)
      throw new Error(
        "This split is currently in use. Choose another saved split before deleting it.",
      );
    if (data.linkedLayoutIds.includes(layoutId))
      throw new Error(
        "This split is used by a study guide or generation record and cannot be deleted.",
      );
    const [running] = await db
      .select({ id: generationRuns.id })
      .from(generationRuns)
      .where(
        and(
          eq(generationRuns.bookId, bookId),
          eq(generationRuns.status, "generating"),
        ),
      )
      .limit(1);
    if (running)
      throw new Error(
        "Finish or cancel generation before deleting a chapter split.",
      );
    await db
      .delete(chapters)
      .where(and(eq(chapters.bookId, bookId), layoutFilter));
    data.metadata.chapterLayouts = data.layouts.filter(
      (l: { id: string }) => l.id !== layoutId,
    );
    await db
      .update(parsedDocuments)
      .set({ metadataJson: JSON.stringify(data.metadata) })
      .where(eq(parsedDocuments.id, documentId));
    return { ok: true };
  });
}
