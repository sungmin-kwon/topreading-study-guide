import { type Book, type Item, initialLibrary } from "./sample-library";
export const STORAGE_KEY = "topreading-preview-v2";
export type Position = { bookId: string; chapterId: string; guideId: string; view: "text" | "guides" | "export"; kind: "multiple-choice" | "short-answer" | "vocabulary" | "summary" };
export type Snapshot = { id: string; label: string; date: string; book: Book };
export type PreviewSave = { version: 2; books: Book[]; position: Position; drafts: Record<string, Item>; history: Snapshot[]; language: "en" | "ko"; dark: boolean };
const kinds = new Set(["multiple-choice", "short-answer", "vocabulary", "summary"]);
function validItem(value: unknown): value is Item {
  if (!value || typeof value !== "object") return false;
  const i = value as Item;
  return [i.id,i.chapterId,i.prompt,i.answer].every(v => typeof v === "string") && kinds.has(i.kind)
    && (i.choices === undefined || (Array.isArray(i.choices) && i.choices.every(v => typeof v === "string") && Number.isInteger(i.correct) && i.correct! >= 0 && i.correct! < i.choices.length));
}
function validBook(value: unknown): value is Book {
  if (!value || typeof value !== "object") return false;
  const b = value as Book;
  return [b.id,b.title,b.author,b.source].every(v => typeof v === "string") && Array.isArray(b.chapters) && b.chapters.length > 0
    && b.chapters.every(c => c && [c.id,c.title,c.text].every(v => typeof v === "string"))
    && Array.isArray(b.guides) && b.guides.every(g => g && [g.id,g.name,g.date].every(v => typeof v === "string") && Array.isArray(g.items) && g.items.every(validItem)
      && (g.sources === undefined || (g.sources && typeof g.sources === "object" && Object.values(g.sources).every(v => typeof v === "string"))));
}
export function readPreview(raw: string): PreviewSave {
  const value = JSON.parse(raw) as PreviewSave;
  if (!value || value.version !== 2 || !Array.isArray(value.books) || !value.books.length || !value.books.every(validBook)
    || !value.position || ![value.position.bookId,value.position.chapterId,value.position.guideId].every(v => typeof v === "string")
    || !["text","guides","export"].includes(value.position.view) || !kinds.has(value.position.kind)
    || !value.drafts || typeof value.drafts !== "object" || !Object.values(value.drafts).every(validItem)
    || !Array.isArray(value.history) || !value.history.every(h => h && typeof h.id === "string" && typeof h.label === "string" && typeof h.date === "string" && validBook(h.book))
    || !["en","ko"].includes(value.language) || typeof value.dark !== "boolean") throw new Error("Invalid preview data");
  return value;
}
export function sourceSnapshot(book: Book) { return Object.fromEntries(book.chapters.map(c => [c.id, `${c.title}\n${c.text}`])); }
export function withSourceSnapshots(books = initialLibrary()): Book[] { return books.map(b => ({ ...b, guides: b.guides.map(g => ({ ...g, sources: sourceSnapshot(b) })) })); }
export function positionFromUrl(fallback: Position): Position {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view"); const kind = params.get("kind");
  return { bookId: params.get("book") || fallback.bookId, chapterId: params.get("chapter") || fallback.chapterId, guideId: params.get("guide") || fallback.guideId,
    view: view === "text" || view === "guides" || view === "export" ? view : fallback.view,
    kind: kind === "multiple-choice" || kind === "short-answer" || kind === "vocabulary" || kind === "summary" ? kind : fallback.kind };
}
