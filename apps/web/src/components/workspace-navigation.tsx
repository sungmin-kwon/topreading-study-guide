import { type ReactNode, useEffect, useRef } from "react";

export type WorkspaceDestination = "source" | "split" | "chapters" | "generate" | "sets" | "review" | "export" | "info";
type Book = { id: string; title: string; author: string | null; pinnedAt: string | null };
type Translate = (en: string, ko: string) => string;

export function WorkspaceBar({ books, bookId, libraryOpen, onLibrary, onBook, preferences, t }: {
  books: Book[]; bookId: string; libraryOpen: boolean; onLibrary: () => void;
  onBook: (id: string) => void; preferences: ReactNode; t: Translate;
}) {
  return <header className="reading-topbar">
    <span className="reading-brand">TopReading</span>
    <button type="button" onClick={onLibrary} aria-pressed={libraryOpen}>{t("Library", "도서관")}</button>
    <label className="reading-book-switcher"><span className="visually-hidden">{t("Current book", "현재 책")}</span>
      <select value={libraryOpen ? "" : bookId} onChange={e => onBook(e.target.value)} disabled={!books.length}>
        {libraryOpen && books.length > 0 && <option value="" disabled>{t("Choose a book", "책 선택")}</option>}
        {!books.length && <option value="">{t("No books yet", "등록된 책 없음")}</option>}
        {books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}
      </select>
    </label>
    <div className="reading-preferences">{preferences}</div>
  </header>;
}

export function SavedLibrary({ books, total, search, onSearch, sort, onSort, onBook, onPin, onCreate, creating, loading, error, onRetry, t }: {
  books: Book[]; total: number; search: string; onSearch: (s: string) => void; sort: string;
  onSort: (s: string) => void; onBook: (id: string) => void; onPin: (book: Book) => void;
  onCreate: () => void; creating: boolean; loading: boolean; error: string; onRetry: () => void; t: Translate;
}) {
  return <section className="reading-library" aria-labelledby="saved-library-title">
    <div className="reading-library-inner">
      <div className="reading-library-heading"><div>
        <h1 id="saved-library-title">{t("Library", "도서관")}</h1>
      </div><button className="primary-action" type="button" disabled={creating || loading} onClick={onCreate}>{creating ? t("Creating…", "생성 중…") : t("New book", "새 책")}</button></div>
      <div className="reading-library-tools">
        <label>{t("Search library", "도서 검색")}<input value={search} onChange={e => onSearch(e.target.value)} placeholder={t("Title or author", "제목 또는 저자")} /></label>
        <label>{t("Sort books", "도서 정렬")}<select value={sort} onChange={e => onSort(e.target.value)}>
          <option value="newest">{t("Newest", "최신순")}</option><option value="oldest">{t("Oldest", "오래된순")}</option>
          <option value="az">{t("A to Z", "가나다순")}</option><option value="za">{t("Z to A", "가나다 역순")}</option>
        </select></label><span>{total} {t("books", "권")}</span>
      </div>
      {error ? <p role="alert">{error} <button type="button" onClick={onRetry}>{t("Retry", "다시 시도")}</button></p> : loading ? <p role="status">{t("Loading library…", "도서 목록을 불러오는 중…")}</p> : !books.length ? <p>{total ? t("No matching books.", "검색 결과가 없습니다.") : t("Your library is empty. Create your first book to import a source file.", "새 책을 만들고 원본 파일을 가져오세요.")}</p> : null}
      <div className="reading-book-list">{books.map((book, index) => <article key={book.id}>
        <button className="reading-open-book" type="button" onClick={() => onBook(book.id)}>
          <span className={`reading-spine ${index % 2 ? "ochre" : ""}`} aria-hidden="true">{book.title.slice(0, 1)}</span>
          <span><strong>{book.title}</strong>{book.author && <small>{book.author}</small>}</span>
          <span className="reading-open-label" aria-hidden="true">→</span>
        </button>
        <button className="reading-pin" type="button" aria-label={`${book.pinnedAt ? t("Unpin", "고정 해제") : t("Pin", "고정")} ${book.title}`} aria-pressed={Boolean(book.pinnedAt)} onClick={() => onPin(book)}>{book.pinnedAt ? "★" : "☆"}</button>
      </article>)}</div>
    </div>
  </section>;
}

export function WorkspaceNavigation({ tab, onTab, hasBook, hasChapters, hasSources, t }: {
  tab: WorkspaceDestination; onTab: (tab: WorkspaceDestination) => void; hasBook: boolean; hasChapters: boolean; hasSources: boolean; t: Translate;
}) {
  const text = ["source", "split", "chapters"].includes(tab);
  const guides = ["generate", "sets", "review"].includes(tab);
  return <div className="reading-navigation">
    <nav className="reading-destinations" aria-label={t("Book destinations", "책 작업 메뉴")}>
      <button type="button" aria-current={text ? "page" : undefined} disabled={!hasBook} onClick={() => onTab(hasChapters ? "chapters" : "source")}>{t("Text", "텍스트")}</button>
      <button type="button" aria-current={guides ? "page" : undefined} disabled={!hasBook} onClick={() => onTab("review")}>{t("Study guides", "학습지")}</button>
      <button type="button" aria-current={tab === "export" ? "page" : undefined} disabled={!hasBook} onClick={() => onTab("export")}>{t("Export", "내보내기")}</button>
      <button type="button" aria-current={tab === "info" ? "page" : undefined} disabled={!hasBook} onClick={() => onTab("info")}>{t("Book info", "책 정보")}</button>
    </nav>
    {text && <QuietMenu label={t("Text tools", "텍스트 도구")}>
      <button type="button" aria-current={tab === "chapters" ? "page" : undefined} disabled={!hasChapters} onClick={() => onTab("chapters")}>{t("Chapters", "챕터")}</button>
      <button type="button" aria-current={tab === "source" ? "page" : undefined} onClick={() => onTab("source")}>{t("Import sources", "원본 가져오기")}</button>
      <button type="button" aria-current={tab === "split" ? "page" : undefined} disabled={!hasSources} onClick={() => onTab("split")}>{t("Chapter boundaries", "챕터 경계")}</button>
    </QuietMenu>}

  </div>;
}

/** Native disclosure keeps infrequent actions reachable with keyboard and touch. */
export function QuietMenu({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent | FocusEvent) => {
      if (ref.current?.open && event.target instanceof Node && !ref.current.contains(event.target)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("focusin", dismiss); };
  }, []);
  return <details ref={ref} className="reading-menu" onKeyDown={event => {
    if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
  }}>
    <summary>{label}</summary>
    <div className="reading-menu-content" onClick={event => {
      if ((event.target as HTMLElement).closest("button")) {
        // A dialog opened by this action returns focus to its visible disclosure.
        ref.current?.querySelector("summary")?.focus();
        if (ref.current) ref.current.open = false;
      }
    }}>{children}</div>
  </details>;
}
