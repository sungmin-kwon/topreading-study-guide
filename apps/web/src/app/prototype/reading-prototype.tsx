"use client";

import { useEffect, useRef, useState } from "react";
import { type Book, type Chapter, type Guide, type Item, type ItemKind, initialLibrary, labels, sampleItems, splitText, words } from "./sample-library";
import s from "./reading-prototype.module.css";

type View = "text" | "guides" | "export";
type Modal = "import" | "generate" | "versions" | null;
const kinds = Object.keys(labels) as ItemKind[];

function Mark({ name }: { name: "book" | "plus" | "arrow" | "close" | "menu" | "check" }) {
  const paths = { book: "M3 4h6c2 0 3 1 3 2m0 0c0-1 1-2 3-2h6v15h-6c-2 0-3 1-3 2m0-15v15m0 0c0-1-1-2-3-2H3V4", plus: "M12 5v14M5 12h14", arrow: "M4 12h16m-6-6 6 6-6 6", close: "m6 6 12 12M6 18 18 6", menu: "M4 6h16M4 12h16M4 18h16", check: "m5 12 4 4L19 6" };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function ReadingPrototype() {
  const [books, setBooks] = useState(initialLibrary);
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
  const [draft, setDraft] = useState<Item | null>(null);
  const [guideName, setGuideName] = useState("Reading practice");
  const [allChapters, setAllChapters] = useState(true);
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [exportKinds, setExportKinds] = useState<ItemKind[]>(["multiple-choice", "short-answer", "vocabulary"]);
  const [splitPosition, setSplitPosition] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const chapterText = useRef<HTMLTextAreaElement>(null);
  const book = books.find(b => b.id === bookId) || books[0];
  const chapter = book.chapters.find(c => c.id === chapterId) || book.chapters[0];
  const guide = book.guides.find(g => g.id === guideId) || book.guides[0];
  const chapterIndex = book.chapters.findIndex(c => c.id === chapter.id);
  const items = guide?.items.filter(i => i.chapterId === chapter.id && i.kind === kind) || [];
  const selectedExportChapters = allChapters ? book.chapters : [chapter];
  const exportCount = guide?.items.filter(i => exportKinds.includes(i.kind) && selectedExportChapters.some(c => c.id === i.chapterId)).length || 0;

  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal && dialog.current?.open) dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  function updateBook(update: (b: Book) => Book) {
    setBooks(previous => previous.map(b => b.id === book.id ? update(b) : b));
  }
  function selectBook(next: Book) {
    setBookId(next.id); setChapterId(next.chapters[0].id); setGuideId(next.guides[0]?.id || "");
    setView(next.guides.length ? "guides" : "text"); setDraft(null); setLibraryOpen(false); setSplitPosition(0);
  }
  function selectChapter(id: string) {
    setChapterId(id); setDraft(null); setSplitPosition(0);
  }
  function updateChapter(update: Partial<Chapter>) {
    updateBook(b => ({ ...b, chapters: b.chapters.map(c => c.id === chapter.id ? { ...c, ...update, changed: true } : c) }));
  }
  function splitChapter() {
    const at = chapterText.current?.selectionStart || splitPosition;
    const before = chapter.text.slice(0, at).trim(), after = chapter.text.slice(at).trim();
    if (!before || !after) { setMessage("Place the cursor between two passages before splitting."); return; }
    const next = { id: crypto.randomUUID(), title: "New chapter", text: after, changed: true };
    updateBook(b => ({ ...b, chapters: b.chapters.flatMap(c => c.id === chapter.id ? [{ ...c, text: before, changed: true }, next] : [c]) }));
    selectChapter(next.id); setMessage("Chapter split. Give the new chapter a title.");
  }
  function mergeNext() {
    const next = book.chapters[chapterIndex + 1];
    if (!next) return;
    updateBook(b => ({ ...b, chapters: b.chapters.filter(c => c.id !== next.id).map(c => c.id === chapter.id ? { ...c, text: `${c.text}\n\n${next.text}`, changed: true } : c), guides: b.guides.map(g => ({ ...g, items: g.items.map(i => i.chapterId === next.id ? { ...i, chapterId: chapter.id } : i) })) }));
    setMessage("Chapters merged. Existing guide items were kept together.");
  }
  async function importFile(file?: File) {
    if (!file) return;
    setImportError("");
    if (!/\.txt$/i.test(file.name) || file.size > 2 * 1024 * 1024) { setImportError("Choose a TXT file smaller than 2 MB for this preview."); return; }
    setImporting(true);
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("This file is empty. Choose a file with readable text.");
      const next: Book = { id: crypto.randomUUID(), title: file.name.replace(/\.txt$/i, "").replace(/[-_]/g, " "), author: "Imported reading", source: file.name, chapters: splitText(text), guides: [] };
      setBooks(previous => [...previous, next]); selectBook(next); setModal(null);
      setMessage(`${next.chapters.length} chapter suggestions ready to review. Your file stays in this browser tab.`);
    } catch (error) { setImportError(error instanceof Error ? error.message : "The file could not be read."); }
    finally { setImporting(false); }
  }
  function createGuide() {
    const next: Guide = { id: crypto.randomUUID(), name: guideName.trim() || "Reading practice", date: "Created in this preview", items: book.chapters.flatMap(sampleItems).map(i => ({ ...i, id: crypto.randomUUID() })) };
    updateBook(b => ({ ...b, guides: [next, ...b.guides] })); setGuideId(next.id); setView("guides"); setKind("multiple-choice"); setDraft(null); setModal(null);
    setMessage("Sample guide created. You can edit it and preview a handout.");
  }
  function saveItem() {
    if (!draft || !draft.prompt.trim()) return;
    const saved = { ...draft, answer: draft.choices ? draft.choices[draft.correct || 0] : draft.answer };
    updateBook(b => ({ ...b, guides: b.guides.map(g => g.id === guide.id ? { ...g, items: g.items.some(i => i.id === saved.id) ? g.items.map(i => i.id === saved.id ? saved : i) : [...g.items, saved] } : g) }));
    setDraft(null); setMessage("Changes saved in this preview.");
  }
  function addItem() {
    setDraft({ id: crypto.randomUUID(), chapterId: chapter.id, kind, prompt: "", answer: "", ...(kind === "multiple-choice" ? { choices: ["", "", ""], correct: 0, explanation: "" } : {}) });
  }
  function editForm() {
    if (!draft) return null;
    return <form className={s.editForm} onSubmit={e => { e.preventDefault(); saveItem(); }}>
      <label>{kind === "vocabulary" ? "Term" : "Prompt"}<textarea aria-label={kind === "vocabulary" ? "Term" : "Prompt"} autoFocus required value={draft.prompt} onChange={e => setDraft({ ...draft, prompt: e.target.value })} rows={2} /></label>
      {draft.choices ? <fieldset><legend>Choices · select the correct answer</legend>{draft.choices.map((choice, index) => <label className={s.choiceEdit} key={index}><input type="radio" name="correct-answer" aria-label={`Choice ${index + 1} is correct`} checked={draft.correct === index} onChange={() => setDraft({ ...draft, correct: index })} /><input required aria-label={`Choice ${index + 1}`} value={choice} onChange={e => setDraft({ ...draft, choices: draft.choices!.map((v, i) => i === index ? e.target.value : v) })} /></label>)}</fieldset> : <label>{kind === "vocabulary" ? "Definition" : "Suggested answer"}<textarea aria-label={kind === "vocabulary" ? "Definition" : "Suggested answer"} rows={3} value={draft.answer} onChange={e => setDraft({ ...draft, answer: e.target.value })} /></label>}
      {draft.choices ? <label>Explanation<textarea aria-label="Explanation" rows={2} value={draft.explanation || ""} onChange={e => setDraft({ ...draft, explanation: e.target.value })} /></label> : null}
      <div className={s.actions}><button className={s.primary} type="submit">Save changes</button><button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
    </form>;
  }
  function itemBody(item: Item, answers = true) {
    return <><p className={s.prompt}>{item.prompt}</p>{item.choices ? <ol className={s.choices}>{item.choices.map((choice, i) => <li key={i} className={answers && i === item.correct ? s.correct : ""}><span>{String.fromCharCode(65 + i)}</span>{choice}{answers && i === item.correct ? <Mark name="check" /> : null}</li>)}</ol> : item.kind === "summary" || item.kind === "vocabulary" || answers ? <p className={s.answer}>{item.answer}</p> : <div className={s.answerLines} aria-label="Space for a written answer" />}{answers && item.explanation ? <p className={s.explanation}><span>{item.kind === "vocabulary" ? "In the text" : "Teaching note"}</span>{item.explanation}</p> : null}</>;
  }

  return <main className={s.shell}>
    <aside className={`${s.library} ${libraryOpen ? s.libraryVisible : ""}`} aria-label="Book library">
      <a href="/prototype" className={s.brand}><Mark name="book" /><span>TopReading<span className={s.brandSub}>Study guide editor</span></span></a>
      <button className={s.newBook} onClick={() => { setImportError(""); setModal("import"); }}><Mark name="plus" />Import a book</button>
      <label className={s.search}><span>Find a book</span><input placeholder="Search your library" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <div className={s.libraryLabel}>YOUR LIBRARY <span>{books.length}</span></div>
      <div className={s.bookList}>{books.filter(b => b.title.toLowerCase().includes(search.toLowerCase())).map((b, i) => <button key={b.id} className={b.id === book.id ? s.activeBook : ""} aria-pressed={b.id === book.id} onClick={() => selectBook(b)}><span className={`${s.bookSpine} ${i % 2 ? s.ochre : ""}`}>{b.title.slice(0, 1)}</span><span><strong>{b.title}</strong><small>{b.chapters.length} chapters · {b.guides.length ? "Guide ready" : "Text ready"}</small></span></button>)}{!books.some(b => b.title.toLowerCase().includes(search.toLowerCase())) ? <p className={s.quiet}>No books match your search.</p> : null}</div>
      <footer className={s.libraryFooter}><span className={s.previewDot} />Design preview<p>Sample content. Changes stay in this tab.</p><a href="/">Open current application <span aria-hidden="true">↗</span></a></footer>
      <button className={s.mobileClose} onClick={() => setLibraryOpen(false)}>Close library</button>
    </aside>
    {libraryOpen ? <button className={s.scrim} aria-label="Close library" onClick={() => setLibraryOpen(false)} /> : null}
    <section className={s.workspace} aria-label="Selected book">
      <header className={s.header}>
        <button className={s.mobileMenu} aria-label="Open library" aria-expanded={libraryOpen} onClick={() => setLibraryOpen(true)}><Mark name="menu" /></button>
        <div className={s.bookHeading}><p>{book.author}</p><h1>{book.title}</h1></div>
        <span className={s.headerStatus}><span className={s.previewDot} />Sample workspace</span>
      </header>
      <nav className={s.navigation} aria-label="Book sections">{([['text', 'Text'], ['guides', 'Study guides'], ['export', 'Export']] as const).map(([id, label]) => <button key={id} className={view === id ? s.activeNav : ""} aria-pressed={view === id} onClick={() => { setView(id); setDraft(null); }}>{label}</button>)}<span>{book.chapters.length} chapters<span className={s.dot}>·</span>{book.chapters.reduce((sum, c) => sum + words(c.text), 0).toLocaleString()} words</span></nav>

      <div className={s.content}>
        {view !== "export" ? <>
          <aside className={s.outline} aria-label="Chapters"><div className={s.outlineHeading}><h2>Contents</h2><span>{book.chapters.length}</span></div>{book.chapters.map((c, i) => <button key={c.id} className={c.id === chapter.id ? s.activeChapter : ""} aria-pressed={c.id === chapter.id} onClick={() => selectChapter(c.id)}><span className={s.chapterNumber}>{String(i + 1).padStart(2, "0")}</span><span>{c.title}<small>{words(c.text)} words{c.changed ? " · Edited" : ""}</small></span></button>)}<div className={s.outlineFoot}><Mark name="book" /><span>{book.source}</span></div></aside>
          <section className={s.editor} aria-label={view === "text" ? "Chapter editor" : "Study guide editor"}>
            <label className={s.chapterPicker}>Chapter<select aria-label="Chapter" value={chapter.id} onChange={e => selectChapter(e.target.value)}>{book.chapters.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {c.title}</option>)}</select></label>
            {view === "text" ? <>
              <div className={s.toolbar}><span className={s.quiet}>Review the text and chapter boundaries</span><button className={s.primary} onClick={() => setModal("generate")}>Create sample guide <Mark name="arrow" /></button></div>
              {chapter.changed && book.guides.length ? <p className={s.notice}>This text has changed. Existing guides may need review.</p> : null}
              <div className={s.textDocument}><span className={s.chapterKicker}>Chapter {chapterIndex + 1}</span><label className={s.titleInput}>Chapter title<input value={chapter.title} onChange={e => updateChapter({ title: e.target.value })} /></label><label className={s.textInput}>Chapter text<textarea aria-label="Chapter text" ref={chapterText} value={chapter.text} onSelect={e => setSplitPosition(e.currentTarget.selectionStart)} onChange={e => updateChapter({ text: e.target.value })} spellCheck /></label><div className={s.boundaryTools}><span>{words(chapter.text)} words</span><button onClick={splitChapter}>Split at cursor</button><button disabled={chapterIndex === book.chapters.length - 1} onClick={mergeNext}>Merge with next chapter</button></div></div>
            </> : <>
              <div className={s.toolbar}><div className={s.versionControl}><label>Guide version<select aria-label="Guide version" value={guide?.id || ""} onChange={e => { setGuideId(e.target.value); setDraft(null); }}>{book.guides.length ? book.guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>) : <option value="">No guide yet</option>}</select></label>{guide ? <button className={s.textButton} onClick={() => setModal("versions")}>Manage</button> : null}</div><button className={s.sourceToggle} aria-pressed={sourceOpen} onClick={() => setSourceOpen(!sourceOpen)}><Mark name="book" />{sourceOpen ? "Hide source" : "Read source"}</button></div>
              {chapter.changed && guide ? <p className={s.notice}>Source text was edited. Check this guide against the updated chapter.</p> : null}
              {!guide ? <div className={s.empty}><Mark name="book" /><h2>Your text is ready.</h2><p>Create a sample guide to explore question editing and handout previews.</p><button className={s.primary} onClick={() => setModal("generate")}>Create sample guide</button></div> : <>
                {sourceOpen ? <details className={s.sourcePassage} open><summary>Source · {chapter.title}</summary><div>{chapter.text.split(/\n\n/).map((p, i) => <p key={i}>{p}</p>)}</div></details> : null}
                <div className={s.guideDocument}><div className={s.documentHeading}><span className={s.chapterKicker}>Chapter {chapterIndex + 1}</span><h2>{chapter.title}</h2><p>{words(chapter.text)} words in source · {guide.date}</p></div>
                  <div className={s.itemTypes} aria-label="Content type">{kinds.map(k => <button key={k} className={kind === k ? s.activeType : ""} aria-pressed={kind === k} onClick={() => { setKind(k); setDraft(null); }}>{labels[k]}<span>{guide.items.filter(i => i.kind === k && i.chapterId === chapter.id).length}</span></button>)}</div>
                  <div className={s.itemList}>{items.map((item, i) => <article className={s.item} key={item.id}><span className={s.itemNumber}>{String(i + 1).padStart(2, "0")}</span><div>{draft?.id === item.id ? editForm() : <>{itemBody(item)}<button className={s.editButton} onClick={() => setDraft({ ...item, choices: item.choices ? [...item.choices] : undefined })}>Edit {kind === "vocabulary" ? "entry" : kind === "summary" ? "summary" : "question"}</button></>}</div></article>)}{draft && !guide.items.some(i => i.id === draft.id) ? editForm() : null}{!items.length && !draft ? <p className={s.quiet}>No {labels[kind].toLowerCase()} items for this chapter yet.</p> : null}</div>
                  <button className={s.addItem} onClick={addItem}><Mark name="plus" />Add {kind === "vocabulary" ? "a word" : kind === "summary" ? "a summary" : "a question"}</button>
                  <div className={s.nextChapter}><span>{chapterIndex + 1} of {book.chapters.length} chapters</span><button disabled={chapterIndex === book.chapters.length - 1} onClick={() => selectChapter(book.chapters[chapterIndex + 1].id)}>Next chapter <Mark name="arrow" /></button></div>
                </div>
              </>}
            </>}
          </section>
        </> : <div className={s.exportWorkspace}>
          <aside className={s.exportSettings}><h2>Make a handout</h2><p>Choose what your readers will see.</p><label>Guide version<select aria-label="Guide version" value={guide?.id || ""} onChange={e => setGuideId(e.target.value)}>{book.guides.length ? book.guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>) : <option value="">Create a guide first</option>}</select></label><label>Chapters<select aria-label="Chapters" value={allChapters ? "all" : "current"} onChange={e => setAllChapters(e.target.value === "all")}><option value="all">All {book.chapters.length} chapters</option><option value="current">Current chapter only</option></select></label><fieldset><legend>Include</legend>{kinds.map(k => <label className={s.checkbox} key={k}><input type="checkbox" checked={exportKinds.includes(k)} onChange={e => setExportKinds(current => e.target.checked ? [...current, k] : current.filter(v => v !== k))} />{labels[k]}</label>)}</fieldset><label className={s.checkbox}><input type="checkbox" checked={includeAnswers} onChange={e => setIncludeAnswers(e.target.checked)} />Include answers and teaching notes</label><button className={s.primary} disabled={!exportCount} onClick={() => window.print()}>Print or save as PDF <Mark name="arrow" /></button><small>The browser print dialog can save this preview as a PDF. DOCX export will join the finished workflow.</small></aside>
          <div className={s.printStage}><div className={s.printLabel}>HANDOUT PREVIEW <span>{exportCount} items</span></div><article className={s.printable}><header><span>TOPREADING · {includeAnswers ? "TEACHER COPY" : "READING PRACTICE"}</span><h2>{book.title}</h2><p>{guide?.name || "Choose a study guide"}</p>{!includeAnswers ? <p className={s.studentLine}>Name _______________________ &nbsp; Date ____________</p> : null}</header>{!exportCount ? <p className={s.quiet}>Create a guide and select content to preview a handout.</p> : selectedExportChapters.map((c, index) => <section className={s.printChapter} key={c.id}><h3>{book.chapters.findIndex(v => v.id === c.id) + 1}. {c.title}</h3>{kinds.filter(k => exportKinds.includes(k)).map(k => { const collection = guide.items.filter(i => i.chapterId === c.id && i.kind === k); return collection.length ? <section key={k}><h4>{labels[k]}</h4>{collection.map((item, i) => <div className={s.printItem} key={item.id}><span>{i + 1}.</span><div>{itemBody(item, includeAnswers)}</div></div>)}</section> : null; })}{index < selectedExportChapters.length - 1 ? <hr /> : null}</section>)}</article></div>
        </div>}
      </div>
    </section>
    <div role="status" className={`${s.toast} ${message ? s.toastVisible : ""}`}>{message}</div>
    <dialog ref={dialog} className={s.dialog} aria-labelledby="prototype-dialog-title" onClose={() => setModal(null)}><header><h2 id="prototype-dialog-title">{modal === "import" ? "Bring in a reading" : modal === "generate" ? "Create a sample guide" : "Guide versions"}</h2><button aria-label="Close dialog" onClick={() => setModal(null)}><Mark name="close" /></button></header>
      {modal === "import" ? <><p>Try the import and chapter-review workflow with a text file. Nothing is uploaded to a server.</p><label className={s.dropzone}><Mark name="book" /><strong>{importing ? "Reading your file…" : "Choose a text file"}</strong><span>TXT · up to 2 MB</span><input type="file" accept=".txt,text/plain" aria-label="Import text file" disabled={importing} onChange={e => void importFile(e.target.files?.[0])} /></label><p className={s.quiet}>PDF and EPUB importing will use the extraction pipeline in the finished application.</p>{importError ? <p role="alert" className={s.error}>{importError}</p> : null}</> : modal === "generate" ? <form onSubmit={e => { e.preventDefault(); createGuide(); }}><p>This preview creates sample questions and a summary for each chapter so you can try editing and exporting. It does not call an AI service.</p><label>Guide name<input autoFocus required value={guideName} onChange={e => setGuideName(e.target.value)} /></label><div className={s.guideSummary}><span>{book.chapters.length} chapters</span><span>Questions + summaries</span></div><button className={s.primary}>Create sample guide <Mark name="arrow" /></button></form> : modal === "versions" ? <><p>Each version keeps its own edits. Choose the one you want to work on.</p>{book.guides.map(g => <div className={s.versionRow} key={g.id}><label>Version name<input aria-label={`Name for ${g.name}`} value={g.name} onChange={e => updateBook(b => ({ ...b, guides: b.guides.map(v => v.id === g.id ? { ...v, name: e.target.value } : v) }))} /><small>{g.date} · {g.items.length} items</small></label><button onClick={() => { setGuideId(g.id); setDraft(null); setModal(null); }}>{g.id === guide?.id ? "Continue editing" : "Use version"}</button></div>)}<button className={s.primary} onClick={() => setModal("generate")}><Mark name="plus" />New sample guide</button></> : null}
    </dialog>
  </main>;
}
