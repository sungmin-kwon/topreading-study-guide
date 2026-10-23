"use client";
import { useEffect, useRef, useState } from "react";
import { type Book, type Chapter, type Guide, type Item, type ItemKind, labels, sampleItems, splitText, words } from "./sample-library";
import { STORAGE_KEY, readPreview, sourceSnapshot, withSourceSnapshots, positionFromUrl, type Position, type Snapshot, type PreviewSave } from "./preview-storage";
import { previewText } from "./preview-text";
import s from "./reading-prototype.module.css";
type View = "text" | "guides" | "export";
type Modal = "import" | "generate" | "versions" | "history" | null;
const kinds = Object.keys(labels) as ItemKind[];
function Mark({ name }: {
    name: "book" | "plus" | "arrow" | "close" | "menu" | "check";
}) {
    const paths = { book: "M3 4h6c2 0 3 1 3 2m0 0c0-1 1-2 3-2h6v15h-6c-2 0-3 1-3 2m0-15v15m0 0c0-1-1-2-3-2H3V4", plus: "M12 5v14M5 12h14", arrow: "M4 12h16m-6-6 6 6-6 6", close: "m6 6 12 12M6 18 18 6", menu: "M4 6h16M4 12h16M4 18h16", check: "m5 12 4 4L19 6" };
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
export function ReadingPrototype() {
    const [books, setBooks] = useState(withSourceSnapshots);
    const [bookId, setBookId] = useState("garden");
    const [chapterId, setChapterId] = useState("garden-1");
    const [guideId, setGuideId] = useState("guide-2");
    const [view, setView] = useState<View>("guides");
    const [kind, setKind] = useState<ItemKind>("multiple-choice");
    const [search, setSearch] = useState("");
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [sourceOpen, setSourceOpen] = useState(false);
    const [modal, setModal] = useState<Modal>(null);
    const [message, setMessage] = useState("");
    const [importError, setImportError] = useState("");
    const [importing, setImporting] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, Item>>({});
    const [history, setHistory] = useState<Snapshot[]>([]);
    const [undo, setUndo] = useState<Book | null>(null);
    const [ready, setReady] = useState(false);
    const [saveState, setSaveState] = useState<"saving" | "saved" | "failed">("saving");
    const [storageError, setStorageError] = useState(false);
    const [language, setLanguage] = useState<"en" | "ko">("en");
    const t = (text: string) => language === "ko" ? previewText[text.trim()] || text : text;
    const [dark, setDark] = useState(false);
    const [copyType, setCopyType] = useState("student");
    const [generation, setGeneration] = useState<"idle" | "queued" | "generating" | "failed" | "cancelled">("idle");
    const [generationFailure, setGenerationFailure] = useState(false);
    const generationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const generationToken = useRef(0);
    const pendingSave = useRef("");
    const lastSaved = useRef("");
    const dirty = useRef(false);
    const [guideName, setGuideName] = useState("Reading practice");
    const [allChapters, setAllChapters] = useState(true);
    const [includeAnswers, setIncludeAnswers] = useState(false);
    const [exportKinds, setExportKinds] = useState<ItemKind[]>(["multiple-choice", "short-answer", "vocabulary"]);
    const [splitPosition, setSplitPosition] = useState(0);
    const dialog = useRef<HTMLDialogElement>(null);
    const chapterText = useRef<HTMLTextAreaElement>(null);
    const readingPositions = useRef(new Map<string, {
        chapterId: string;
        guideId: string;
        view: View;
        kind: ItemKind;
        draft: Item | null;
        sourceOpen: boolean;
    }>());
    const pageHeading = useRef<HTMLHeadingElement>(null);
    const book = books.find(b => b.id === bookId) || books[0];
    const chapter = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
    const guide = book.guides.find(g => g.id === guideId) || book.guides[0];
    const chapterIndex = book.chapters.findIndex(c => c.id === chapter.id);
    const draftKey = `${book.id}:${chapter.id}:${guide?.id || ""}:${kind}`;
    const draft = drafts[draftKey] || null;
    function setDraft(value: Item | null) {
        setDrafts(previous => { const next = { ...previous }; if (value)
            next[draftKey] = value;
        else
            delete next[draftKey]; return next; });
    }
    const needsReview = guide && guide.sources?.[chapter.id] !== `${chapter.title}\n${chapter.text}`;
    const items = guide?.items.filter(i => i.chapterId === chapter.id && i.kind === kind) || [];
    const selectedExportChapters = allChapters ? book.chapters : [chapter];
    const exportCount = guide?.items.filter(i => exportKinds.includes(i.kind) && selectedExportChapters.some(c => c.id === i.chapterId)).length || 0;
    useEffect(() => {
        if (modal && !dialog.current?.open)
            dialog.current?.showModal();
        if (!modal && dialog.current?.open)
            dialog.current?.close();
    }, [modal]);
    useEffect(() => {
        if (!message)
            return;
        const timer = setTimeout(() => setMessage(""), 6000);
        return () => clearTimeout(timer);
    }, [message]);
    useEffect(() => {
        pageHeading.current?.focus();
    }, [libraryOpen, bookId]);
    function applyPosition(p: Position) { setBookId(p.bookId); setChapterId(p.chapterId); setGuideId(p.guideId); setView(p.view); setKind(p.kind); }
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = readPreview(raw);
                setBooks(saved.books);
                setDrafts(saved.drafts);
                setHistory(saved.history);
                setLanguage(saved.language);
                setDark(saved.dark);
                applyPosition(positionFromUrl(saved.position));
            }
            else
                applyPosition(positionFromUrl({ bookId, chapterId, guideId, view, kind }));
        }
        catch {
            setStorageError(true);
            setSaveState("failed");
        }
        setReady(true);
        const onPop = () => applyPosition(positionFromUrl({ bookId: "garden", chapterId: "garden-1", guideId: "guide-2", view: "guides", kind: "multiple-choice" }));
        const onLeave = (event: BeforeUnloadEvent) => { if (dirty.current) {
            event.preventDefault();
            event.returnValue = "";
        } };
        window.addEventListener("popstate", onPop);
        window.addEventListener("beforeunload", onLeave);
        return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("beforeunload", onLeave); if (generationTimer.current)
            clearTimeout(generationTimer.current); };
    }, []);
    function persist() {
        try {
            localStorage.setItem(STORAGE_KEY, pendingSave.current);
            lastSaved.current = pendingSave.current;
            dirty.current = false;
            setSaveState("saved");
        }
        catch {
            dirty.current = true;
            setSaveState("failed");
        }
    }
    useEffect(() => {
        if (!ready)
            return;
        const position: Position = { bookId: book.id, chapterId: chapter.id, guideId: guide?.id || "", view, kind };
        const saved: PreviewSave = { version: 2, books, position, drafts, history, language, dark };
        pendingSave.current = JSON.stringify(saved);
        dirty.current = pendingSave.current !== lastSaved.current;
        if (storageError)
            return;
        setSaveState("saving");
        const timer = setTimeout(persist, 400);
        const url = new URL(window.location.href);
        for (const [key, value] of Object.entries({ book: position.bookId, chapter: position.chapterId, guide: position.guideId, view, kind }))
            url.searchParams.set(key, value);
        window.history.replaceState(null, "", url);
        return () => clearTimeout(timer);
    }, [ready, books, drafts, history, bookId, chapterId, guideId, view, kind, language, dark, storageError]);
    function checkpoint(label: string) {
        setHistory(previous => [{ id: crypto.randomUUID(), label, date: new Date().toLocaleString(), book: structuredClone(book) }, ...previous].slice(0, 8));
    }
    function restoreSnapshot(snapshot: Snapshot) {
        // Restore as a separate book so newer guides and manual edits are never overwritten.
        const restored = { ...structuredClone(snapshot.book), id: crypto.randomUUID(), title: `${snapshot.book.title} (restored)` };
        setBooks(previous => [...previous, restored]);
        selectBook(restored);
        setModal(null);
        setMessage("Revision restored as a separate book. Your current work is preserved.");
    }
    function updateBook(update: (b: Book) => Book) {
        setUndo(null);
        setBooks(previous => previous.map(b => b.id === book.id ? update(b) : b));
    }
    function selectBook(next: Book) {
        if (generation === "queued" || generation === "generating") {
            setMessage("Cancel generation before switching books.");
            return;
        }
        setLibraryOpen(false);
        if (next.id === book.id)
            return;
        readingPositions.current.set(book.id, { chapterId: chapter.id, guideId: guide?.id || "", view, kind, draft, sourceOpen });
        const position = readingPositions.current.get(next.id);
        setBookId(next.id);
        setChapterId(next.chapters.find(c => c.id === position?.chapterId)?.id || next.chapters[0].id);
        setGuideId(next.guides.find(g => g.id === position?.guideId)?.id || next.guides[0]?.id || "");
        setView(position?.view || (next.guides.length ? "guides" : "text"));
        setKind(position?.kind || "multiple-choice");
        setSourceOpen(position?.sourceOpen || false);
        setSplitPosition(0);
    }
    function selectChapter(id: string) {
        setChapterId(id);
        setSplitPosition(0);
    }
    function updateChapter(update: Partial<Chapter>) {
        updateBook(b => ({ ...b, chapters: b.chapters.map(c => c.id === chapter.id ? { ...c, ...update, changed: true } : c) }));
    }
    function splitChapter() {
        const at = chapterText.current?.selectionStart || splitPosition;
        const before = chapter.text.slice(0, at).trim(), after = chapter.text.slice(at).trim();
        if (!before || !after) {
            setMessage("Place the cursor between two passages before splitting.");
            return;
        }
        checkpoint("Before split");
        const next = { id: crypto.randomUUID(), title: "New chapter", text: after, changed: true };
        updateBook(b => ({ ...b, chapters: b.chapters.flatMap(c => c.id === chapter.id ? [{ ...c, text: before, changed: true }, next] : [c]) }));
        setUndo(structuredClone(book));
        selectChapter(next.id);
        setMessage("Chapter split. Give the new chapter a title.");
    }
    function mergeNext() {
        const next = book.chapters[chapterIndex + 1];
        if (!next)
            return;
        checkpoint("Before merge");
        updateBook(b => ({ ...b, chapters: b.chapters.filter(c => c.id !== next.id).map(c => c.id === chapter.id ? { ...c, text: `${c.text}\n\n${next.text}`, changed: true } : c), guides: b.guides.map(g => ({ ...g, items: g.items.map(i => i.chapterId === next.id ? { ...i, chapterId: chapter.id } : i) })) }));
        setUndo(structuredClone(book));
        setMessage("Chapters merged. Existing guide items were kept together.");
    }
    async function importFile(file?: File) {
        if (!file)
            return;
        setImportError("");
        if (!/\.txt$/i.test(file.name) || file.size > 2 * 1024 * 1024) {
            setImportError("Choose a TXT file smaller than 2 MB for this preview.");
            return;
        }
        setImporting(true);
        try {
            const text = await file.text();
            if (!text.trim())
                throw new Error("This file is empty. Choose a file with readable text.");
            const next: Book = { id: crypto.randomUUID(), title: file.name.replace(/\.txt$/i, "").replace(/[-_]/g, " "), author: "Imported reading", source: file.name, chapters: splitText(text), guides: [] };
            setBooks(previous => [...previous, next]);
            selectBook(next);
            setModal(null);
            setMessage(`${next.chapters.length} chapter suggestions ready to review. Your file stays in this browser tab.`);
        }
        catch (error) {
            setImportError(error instanceof Error ? error.message : "The file could not be read.");
        }
        finally {
            setImporting(false);
        }
    }
    function createGuide() {
        if (generation === "queued" || generation === "generating")
            return;
        const target = structuredClone(book);
        const name = guideName.trim() || "Reading practice";
        const token = ++generationToken.current;
        setGeneration("queued");
        setModal(null);
        generationTimer.current = setTimeout(() => {
            setGeneration("generating");
            generationTimer.current = setTimeout(() => {
                if (generationToken.current !== token)
                    return;
                if (generationFailure) {
                    setGeneration("failed");
                    return;
                }
                try {
                    const next: Guide = { id: crypto.randomUUID(), name, date: new Date().toLocaleString(), sources: sourceSnapshot(target), items: target.chapters.flatMap(sampleItems).map(i => ({ ...i, id: crypto.randomUUID() })) };
                    setBooks(previous => previous.map(b => b.id === target.id ? { ...b, guides: [next, ...b.guides] } : b));
                    setGuideId(next.id);
                    setView("guides");
                    setKind("multiple-choice");
                    setGeneration("idle");
                    setUndo(null);
                    setMessage("Sample guide ready. Previous versions and edits are preserved.");
                }
                catch {
                    setGeneration("failed");
                }
            }, 2000);
        }, 600);
    }
    function cancelGeneration() { generationToken.current++; if (generationTimer.current)
        clearTimeout(generationTimer.current); setGeneration("cancelled"); }
    function saveItem() {
        if (!draft || !draft.prompt.trim())
            return;
        const saved = { ...draft, answer: draft.choices ? draft.choices[draft.correct || 0] : draft.answer };
        updateBook(b => ({ ...b, guides: b.guides.map(g => g.id === guide.id ? { ...g, items: g.items.some(i => i.id === saved.id) ? g.items.map(i => i.id === saved.id ? saved : i) : [...g.items, saved] } : g) }));
        setDraft(null);
        setMessage("Question updated. Saving on this device.");
    }
    function addItem() {
        setDraft({ id: crypto.randomUUID(), chapterId: chapter.id, kind, prompt: "", answer: "", ...(kind === "multiple-choice" ? { choices: ["", "", ""], correct: 0, explanation: "" } : {}) });
    }
    function editForm() {
        if (!draft)
            return null;
        return <form className={s.editForm} onSubmit={e => { e.preventDefault(); saveItem(); }}>
      <label>{kind === "vocabulary" ? t("Term") : t("Prompt")}<textarea aria-label={kind === "vocabulary" ? t("Term") : t("Prompt")} autoFocus required value={draft.prompt} onChange={e => setDraft({ ...draft, prompt: e.target.value })} rows={2}/></label>
      {draft.choices ? <fieldset><legend>{t("Choices \u00B7 select the correct answer")}</legend>{draft.choices.map((choice, index) => <label className={s.choiceEdit} key={index}><input type="radio" name="correct-answer" aria-label={`Choice ${index + 1} is correct`} checked={draft.correct === index} onChange={() => setDraft({ ...draft, correct: index })}/><input required aria-label={`Choice ${index + 1}`} value={choice} onChange={e => setDraft({ ...draft, choices: draft.choices!.map((v, i) => i === index ? e.target.value : v) })}/></label>)}</fieldset> : <label>{kind === "vocabulary" ? t("Definition") : t("Suggested answer")}<textarea aria-label={kind === "vocabulary" ? t("Definition") : t("Suggested answer")} rows={3} value={draft.answer} onChange={e => setDraft({ ...draft, answer: e.target.value })}/></label>}
      {draft.choices ? <label>{t("Explanation")}<textarea aria-label={t("Explanation")} rows={2} value={draft.explanation || ""} onChange={e => setDraft({ ...draft, explanation: e.target.value })}/></label> : null}
      <div className={s.actions}><button className={s.primary} type="submit">{t("Save changes")}</button><button type="button" onClick={() => setDraft(null)}>{t("Cancel")}</button></div>
    </form>;
    }
    function itemBody(item: Item, answers = true) {
        return <><p className={s.prompt}>{item.prompt}</p>{item.choices ? <ol className={s.choices}>{item.choices.map((choice, i) => <li key={i} className={answers && i === item.correct ? s.correct : ""}><span>{String.fromCharCode(65 + i)}</span>{choice}{" "}{answers && i === item.correct ? <Mark name="check"/> : null}</li>)}</ol> : item.kind === "summary" || item.kind === "vocabulary" || answers ? <p className={s.answer}>{item.answer}</p> : <div className={s.answerLines} aria-label={t("Space for a written answer")}/>}{" "}{answers && item.explanation ? <p className={s.explanation}><span>{item.kind === "vocabulary" ? t("In the text") : t("Teaching note")}</span>{item.explanation}</p> : null}</>;
    }
    if (storageError) return <main className={s.shell}><section className={s.libraryPage}><h1>{t("Could not load saved preview")}</h1><p>{t("Your saved data has not been overwritten. Retry after allowing browser storage, or download it before resetting this preview.")}</p><button onClick={() => {
        try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const saved = readPreview(raw); setBooks(saved.books); setDrafts(saved.drafts); setHistory(saved.history); setLanguage(saved.language); setDark(saved.dark); applyPosition(positionFromUrl(saved.position)); } setStorageError(false); } catch { setMessage("Saved preview data is still unavailable."); }
    }}>{t("Retry load")}</button><button onClick={() => { try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return; const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "topreading-preview-recovery.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch { setMessage("Browser storage is unavailable."); } }}>{t("Download saved data")}</button><button onClick={() => { if (!window.confirm(t("Reset only this device's preview data? Download your saved data first."))) return; try { localStorage.removeItem(STORAGE_KEY); setBooks(withSourceSnapshots()); setDrafts({}); setHistory([]); setStorageError(false); } catch { setMessage("Browser storage is unavailable."); } }}>{t("Reset preview")}</button><p role="status">{t(message)}</p><a href="/">{t("Current app ↗")}</a></section></main>;
    return <main className={s.shell} data-theme={dark ? "dark" : "light"} lang={language}>
    <header className={s.appBar}>
      <span className={s.brand}><Mark name="book"/><span className={s.brandName}>{t("TopReading")}</span></span>
      <button className={s.libraryButton} aria-pressed={libraryOpen} onClick={() => setLibraryOpen(true)}>{t("Library")}</button>
      <label className={s.bookSwitcher}><span>{t("Current book")}</span><select disabled={generation === "queued" || generation === "generating"} aria-label={t("Current book")} value={book.id} onChange={e => selectBook(books.find(b => b.id === e.target.value)!)}>{books.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label>
      <span className={s.previewLabel}>{t("Preview \u00B7 Saved on this device")}</span>
      <button aria-label={t("Toggle dark mode")} aria-pressed={dark} onClick={() => setDark(!dark)}>{dark ? t("Light") : t("Dark")}</button>
      <select aria-label={t("Interface language")} value={language} onChange={e => setLanguage(e.target.value as "en" | "ko")}><option value="en">{t("English")}</option><option value="ko">{t("\uD55C\uAD6D\uC5B4")}</option></select>
      <a className={s.currentApp} href="/">{t("Current app \u2197")}</a>
    </header>
    <div className={s.saveBar} role="status"><span>{saveState === "saved" ? t("Saved on this device") : saveState === "saving" ? t("Saving\u2026") : t("Could not save \u2014 edits remain in this tab")}</span>{saveState === "failed" ? <button onClick={() => { if (storageError) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw)
                readPreview(raw);
            setStorageError(false);
        }
        catch {
            setMessage("Saved preview data could not be read. Export your work before clearing this browser's storage.");
            return;
        }
    } persist(); }}>{t("Retry save")}</button> : null}<span>{t("Preview only \u00B7 No server sync")}</span></div>
    {generation !== "idle" ? <div className={s.saveBar} role="status">{t("Sample generation:")}{" "}{t(generation)}{" "}{generation === "queued" || generation === "generating" ? <button onClick={cancelGeneration}>{t("Cancel generation")}</button> : <><button onClick={() => { setGenerationFailure(false); setModal("generate"); }}>{t("Try again")}</button><button onClick={() => setGeneration("idle")}>{t("Dismiss")}</button></>}</div> : null}
    {libraryOpen ? <section className={s.libraryPage} aria-label={t("Book library")}>
      <div className={s.libraryInner}>
        <div className={s.libraryHeading}><div><p className={s.chapterKicker}>{t("Your reading workspace")}</p><h1 ref={pageHeading} tabIndex={-1}>{t("Library")}</h1><p>{t("Choose a book to continue, or bring in a new reading.")}</p></div><button className={s.primary} onClick={() => { setImportError(""); setModal("import"); }}><Mark name="plus"/>{t("Import a book")}</button></div>
        <div className={s.libraryTools}><label className={s.search}><span>{t("Find a book")}</span><input placeholder={t("Search by title or author")} value={search} onChange={e => setSearch(e.target.value)}/></label><span>{books.length} {books.length === 1 ? t("book") : t("books")}</span></div>
        <div className={s.bookList}>{books.filter(b => `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase())).map((b, i) => <button key={b.id} aria-label={`Open ${b.title}`} onClick={() => selectBook(b)}><span className={`${s.bookSpine} ${i % 2 ? s.ochre : ""}`}>{b.title.slice(0, 1)}</span><span className={s.bookDetails}><strong>{b.title}</strong><small>{b.author}</small></span><span className={s.bookMeta}>{b.chapters.length} {b.chapters.length === 1 ? t("chapter") : t("chapters")}<small>{b.guides.length ? `${b.guides.length} guide ${b.guides.length === 1 ? "version" : "versions"}` : t("Text ready")}</small></span><span className={s.openBook}>{b.id === book.id ? t("Continue") : t("Open")}<Mark name="arrow"/></span></button>)}{" "}{!books.some(b => `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase())) ? <p className={s.empty}>{t("No books match your search.")}</p> : null}</div>
        <footer className={s.libraryFooter}><button onClick={() => setLibraryOpen(false)}>{t("Return to")}{" "}{book.title}</button><p>{t("Preview books and drafts are saved on this device. They are separate from your real library.")}</p></footer>
      </div>
    </section> : <section className={s.workspace} aria-label={t("Selected book")}>
      <header className={s.header}>
        <div className={s.bookHeading}><p>{book.author}</p><h1 ref={pageHeading} tabIndex={-1}>{book.title}</h1></div>
        <span className={s.headerStatus}><span className={s.previewDot}/>{t("Preview library")}</span>
      </header>
      <nav className={s.navigation} aria-label={t("Book sections")}>{([['text', 'Text'], ['guides', 'Study guides'], ['export', 'Export']] as const).map(([id, label]) => <button key={id} className={view === id ? s.activeNav : ""} aria-pressed={view === id} onClick={() => { setView(id); }}>{t(label)}</button>)}<span>{book.chapters.length}{" "}{t("chapters")}<span className={s.dot}>{t("\u00B7")}</span>{book.chapters.reduce((sum, c) => sum + words(c.text), 0).toLocaleString()}{" "}{t("words")}</span></nav>

      <div className={s.content}>
        {view !== "export" ? <>
          <aside className={s.outline} aria-label={t("Chapters")}><div className={s.outlineHeading}><h2>{t("Contents")}</h2><span>{book.chapters.length}</span></div>{book.chapters.map((c, i) => <button key={c.id} className={c.id === chapter.id ? s.activeChapter : ""} aria-pressed={c.id === chapter.id} onClick={() => selectChapter(c.id)}><span className={s.chapterNumber}>{String(i + 1).padStart(2, "0")}</span><span>{c.title}<small>{words(c.text)}{" "}{t("words")}{" "}{c.changed ? t(" \u00B7 Edited") : ""}</small></span></button>)}<div className={s.outlineFoot}><Mark name="book"/><span>{book.source}</span></div></aside>
          <section className={s.editor} aria-label={view === "text" ? t("Chapter editor") : t("Study guide editor")}>
            <label className={s.chapterPicker}>{t("Chapter")}<select aria-label={t("Chapter")} value={chapter.id} onChange={e => selectChapter(e.target.value)}>{book.chapters.map((c, i) => <option key={c.id} value={c.id}>{i + 1}{" "}{t(".")}{" "}{c.title}</option>)}</select></label>
            {view === "text" ? <>
              <div className={s.toolbar}><span className={s.quiet}>{t("Review the text and chapter boundaries")}</span><button className={s.primary} onClick={() => setModal("generate")}>{t("Create sample guide")}<Mark name="arrow"/></button></div>
              {book.guides.some(g => g.sources?.[chapter.id] !== `${chapter.title}\n${chapter.text}`) ? <p className={s.notice}>{t("This text has changed. Existing guides may need review.")}</p> : null}
              <div className={s.textDocument}><span className={s.chapterKicker}>{t("Chapter")}{" "}{chapterIndex + 1}</span><label className={s.titleInput}>{t("Chapter title")}<input value={chapter.title} onChange={e => updateChapter({ title: e.target.value })}/></label><label className={s.textInput}>{t("Chapter text")}<textarea aria-label={t("Chapter text")} ref={chapterText} value={chapter.text} onSelect={e => setSplitPosition(e.currentTarget.selectionStart)} onChange={e => updateChapter({ text: e.target.value })} spellCheck/></label><div className={s.boundaryTools}><button onClick={() => { checkpoint("Saved checkpoint"); setMessage("Revision checkpoint saved."); }}>{t("Save checkpoint")}</button><button onClick={() => setModal("history")}>{t("Revision history")}</button>{undo?.id === book.id ? <button onClick={() => { setBooks(previous => previous.map(b => b.id === undo.id ? undo : b)); setChapterId(undo.chapters[0].id); setUndo(null); setMessage("Chapter change undone."); }}>{t("Undo chapter change")}</button> : null}<span>{words(chapter.text)}{" "}{t("words")}</span><button onClick={splitChapter}>{t("Split at cursor")}</button><button disabled={chapterIndex === book.chapters.length - 1} onClick={mergeNext}>{t("Merge with next chapter")}</button></div></div>
            </> : <>
              <div className={s.toolbar}><div className={s.versionControl}><label>{t("Guide version")}<select aria-label={t("Guide version")} value={guide?.id || ""} onChange={e => { setGuideId(e.target.value); }}>{book.guides.length ? book.guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>) : <option value="">{t("No guide yet")}</option>}</select></label>{guide ? <button className={s.textButton} onClick={() => setModal("versions")}>{t("Manage")}</button> : null}</div><button className={s.sourceToggle} aria-pressed={sourceOpen} onClick={() => setSourceOpen(!sourceOpen)}><Mark name="book"/>{sourceOpen ? t("Hide source") : t("Read source")}</button></div>
              {needsReview ? <p className={s.notice}>{t("Source text was edited. Check this guide against the updated chapter.")}</p> : null}
              {!guide ? <div className={s.empty}><Mark name="book"/><h2>{t("Your text is ready.")}</h2><p>{t("Create a sample guide to explore question editing and handout previews.")}</p><button className={s.primary} onClick={() => setModal("generate")}>{t("Create sample guide")}</button></div> : <>
                {sourceOpen ? <details className={s.sourcePassage} open><summary>{t("Source \u00B7")}{" "}{chapter.title}</summary><div>{chapter.text.split(/\n\n/).map((p, i) => <p key={i}>{p}</p>)}</div></details> : null}
                <div className={s.guideDocument}><div className={s.documentHeading}><span className={s.chapterKicker}>{t("Chapter")}{" "}{chapterIndex + 1}</span><h2>{chapter.title}</h2><p>{words(chapter.text)}{" "}{t("words in source \u00B7")}{" "}{guide.date}</p></div>
                  <div className={s.itemTypes} aria-label={t("Content type")}>{kinds.map(k => <button key={k} className={kind === k ? s.activeType : ""} aria-pressed={kind === k} onClick={() => { setKind(k); }}>{t(labels[k])}<span>{guide.items.filter(i => i.kind === k && i.chapterId === chapter.id).length}</span></button>)}</div>
                  <div className={s.itemList}>{items.map((item, i) => <article className={s.item} key={item.id}><span className={s.itemNumber}>{String(i + 1).padStart(2, "0")}</span><div>{draft?.id === item.id ? editForm() : <>{itemBody(item)}<button disabled={!!draft} className={s.editButton} onClick={() => setDraft({ ...item, choices: item.choices ? [...item.choices] : undefined })}>{t("Edit")}{" "}{kind === "vocabulary" ? t("entry") : kind === "summary" ? t("summary") : t("question")}</button></>}</div></article>)}{" "}{draft && !guide.items.some(i => i.id === draft.id) ? editForm() : null}{" "}{!items.length && !draft ? <p className={s.quiet}>{t("No")}{" "}{labels[kind].toLowerCase()}{" "}{t("items for this chapter yet.")}</p> : null}</div>
                  <button disabled={!!draft} className={s.addItem} onClick={addItem}><Mark name="plus"/>{t("Add")}{" "}{kind === "vocabulary" ? t("a word") : kind === "summary" ? t("a summary") : t("a question")}</button>
                  <div className={s.nextChapter}><span>{chapterIndex + 1}{" "}{t("of")}{" "}{book.chapters.length}{" "}{t("chapters")}</span><button disabled={chapterIndex === book.chapters.length - 1} onClick={() => selectChapter(book.chapters[chapterIndex + 1].id)}>{t("Next chapter")}<Mark name="arrow"/></button></div>
                </div>
              </>}
            </>}
          </section>
        </> : <div className={s.exportWorkspace}>
          <aside className={s.exportSettings}><label>{t("Copy type")}<select aria-label={t("Copy type")} value={copyType} onChange={e => { setCopyType(e.target.value); setIncludeAnswers(e.target.value !== "student"); }}><option value="student">{t("Student handout")}</option><option value="teacher">{t("Teacher copy with answers")}</option><option value="key">{t("Answer key only")}</option></select></label><h2>{t("Make a handout")}</h2><p>{t("Choose what your readers will see.")}</p><label>{t("Guide version")}<select aria-label={t("Guide version")} value={guide?.id || ""} onChange={e => setGuideId(e.target.value)}>{book.guides.length ? book.guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>) : <option value="">{t("Create a guide first")}</option>}</select></label><label>{t("Chapters")}<select aria-label={t("Chapters")} value={allChapters ? "all" : "current"} onChange={e => setAllChapters(e.target.value === "all")}><option value="all">{t("All")}{" "}{book.chapters.length}{" "}{t("chapters")}</option><option value="current">{t("Current chapter only")}</option></select></label><fieldset><legend>{t("Include")}</legend>{kinds.map(k => <label className={s.checkbox} key={k}><input type="checkbox" checked={exportKinds.includes(k)} onChange={e => setExportKinds(current => e.target.checked ? [...current, k] : current.filter(v => v !== k))}/>{t(labels[k])}</label>)}</fieldset><label className={s.checkbox}><input type="checkbox" checked={includeAnswers} onChange={e => { setIncludeAnswers(e.target.checked); setCopyType(e.target.checked ? "teacher" : "student"); }}/>{t("Include answers and teaching notes")}</label><button className={s.primary} disabled={!exportCount} onClick={() => window.print()}>{t("Print or save as PDF")}<Mark name="arrow"/></button><small>{t("The browser print dialog can save this preview as a PDF. DOCX export will join the finished workflow.")}</small></aside>
          <div className={s.printStage}><div className={s.printLabel}>{t("HANDOUT PREVIEW")}<span>{exportCount}{" "}{t("items")}</span></div><article className={s.printable}><header><span>{t("TOPREADING \u00B7")}{" "}{copyType === "key" ? t("ANSWER KEY") : includeAnswers ? t("TEACHER COPY") : t("STUDENT HANDOUT")}</span><h2>{book.title}</h2><p>{guide?.name || "Choose a study guide"}</p>{!includeAnswers ? <p className={s.studentLine}>{t("Name _______________________  Date ____________")}</p> : null}</header>{!exportCount ? <p className={s.quiet}>{t("Create a guide and select content to preview a handout.")}</p> : selectedExportChapters.map((c, index) => <section className={s.printChapter} key={c.id}><h3>{book.chapters.findIndex(v => v.id === c.id) + 1}{" "}{t(".")}{" "}{c.title}</h3>{kinds.filter(k => exportKinds.includes(k)).map(k => { const collection = guide.items.filter(i => i.chapterId === c.id && i.kind === k); return collection.length ? <section key={k}><h4>{t(labels[k])}</h4>{collection.map((item, i) => <div className={s.printItem} key={item.id}><span>{i + 1}{" "}{t(".")}</span><div>{copyType === "key" ? <><p className={s.prompt}>{item.prompt}</p><p>{item.choices ? `${String.fromCharCode(65 + (item.correct || 0))}. ${item.choices[item.correct || 0]}` : item.answer}</p></> : itemBody(item, includeAnswers)}</div></div>)}</section> : null; })}{" "}{index < selectedExportChapters.length - 1 ? <hr /> : null}</section>)}</article></div>
        </div>}
      </div>
    </section>}
    <div role="status" className={`${s.toast} ${message ? s.toastVisible : ""}`}>{t(message)}</div>
    <dialog ref={dialog} className={s.dialog} aria-labelledby="prototype-dialog-title" onClose={() => setModal(null)}><header><h2 id="prototype-dialog-title">{modal === "import" ? t("Bring in a reading") : modal === "generate" ? t("Create a sample guide") : modal === "history" ? t("Revision history") : t("Guide versions")}</h2><button aria-label={t("Close dialog")} onClick={() => setModal(null)}><Mark name="close"/></button></header>
      {modal === "history" ? <><p>{t("Restore a checkpoint into a separate book to preserve newer edits and guides. The latest eight checkpoints are kept on this device.")}</p>{history.filter(h => h.book.id === book.id).map(h => <div className={s.versionRow} key={h.id}><span>{h.label}<small>{h.date}</small></span><button onClick={() => restoreSnapshot(h)}>{t("Restore as new book")}</button></div>)}{" "}{!history.some(h => h.book.id === book.id) ? <p>{t("No saved revisions yet. Use Save checkpoint before editing chapter text.")}</p> : null}</> : modal === "import" ? <><p>{t("Try the import and chapter-review workflow with a text file. Nothing is uploaded to a server.")}</p><label className={s.dropzone}><Mark name="book"/><strong>{importing ? t("Reading your file\u2026") : t("Choose a text file")}</strong><span>{t("TXT \u00B7 up to 2 MB")}</span><input type="file" accept=".txt,text/plain" aria-label={t("Import text file")} disabled={importing} onChange={e => void importFile(e.target.files?.[0])}/></label><p className={s.quiet}>{t("PDF and EPUB importing will use the extraction pipeline in the finished application.")}</p>{importError ? <p role="alert" className={s.error}>{importError}</p> : null}</> : modal === "generate" ? <form onSubmit={e => { e.preventDefault(); createGuide(); }}><p>{t("This preview creates sample questions and a summary for each chapter so you can try editing and exporting. It does not call an AI service.")}</p><label>{t("Guide name")}<input autoFocus required value={guideName} onChange={e => setGuideName(e.target.value)}/></label><div className={s.guideSummary}><span>{book.chapters.length}{" "}{t("chapters")}</span><span>{t("Questions + summaries")}</span></div><label className={s.checkbox}><input type="checkbox" checked={generationFailure} onChange={e => setGenerationFailure(e.target.checked)}/>{t("Simulate a failure (preview)")}</label><button className={s.primary}>{t("Create sample guide")}<Mark name="arrow"/></button></form> : modal === "versions" ? <><p>{t("Each version keeps its own edits. Choose the one you want to work on.")}</p>{book.guides.map(g => <div className={s.versionRow} key={g.id}><label>{t("Version name")}<input aria-label={`Name for ${g.name}`} value={g.name} onChange={e => updateBook(b => ({ ...b, guides: b.guides.map(v => v.id === g.id ? { ...v, name: e.target.value } : v) }))}/><small>{g.date}{" "}{t("\u00B7")}{" "}{g.items.length}{" "}{t("items")}</small></label><button onClick={() => { setGuideId(g.id); setModal(null); }}>{g.id === guide?.id ? t("Continue editing") : t("Use version")}</button></div>)}<button className={s.primary} onClick={() => setModal("generate")}><Mark name="plus"/>{t("New sample guide")}</button></> : null}
    </dialog>
  </main>;
}
