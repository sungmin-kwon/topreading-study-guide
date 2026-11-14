"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  splitAtBoundaries,
  type SplitPlan,
  type SourcePage,
} from "@/lib/source-boundaries";
type Data = {
  suggestions: SplitPlan["starts"];
  pages: SourcePage[];
  pageCount: number;
  sourceId: string;
  filename: string;
  hasLegacy: boolean;
  layouts: {
    id: string;
    createdAt: string;
    count: number;
  }[];
  activeLayoutId: string | null;
  fingerprint: string;
  draft: {
    version: number;
    plan: SplitPlan;
  };
};
const empty: SplitPlan = { starts: [], end: null };
export function SourceBoundaryEditor({
  bookId,
  documentId,
  onApplied,
  onDirty,
  t,
}: {
  bookId: string;
  documentId: string;
  onApplied: () => void;
  onDirty: (dirty: boolean) => void;
  t: (a: string, b: string) => string;
}) {
  const [data, setData] = useState<Data | null>(null),
    [plan, setPlan] = useState<SplitPlan>(empty),
    [saved, setSaved] = useState(""),
    [page, setPage] = useState(1),
    [view, setView] = useState<"text" | "original">("text");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [image, setImage] = useState<{
      image: string;
      label: string;
      page: number;
    } | null>(null),
    [imageError, setImageError] = useState(""),
    [zoom, setZoom] = useState(100),
    [preview, setPreview] = useState(false),
    [restoreId, setRestoreId] = useState(""),
    [bookmarks, setBookmarks] = useState<SplitPlan["starts"]>([]);
  const [nativeLabels, setNativeLabels] = useState<Record<number, string>>({});
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [mobilePanel, setMobilePanel] = useState<"source" | "chapters">(
    "source",
  );
  const toolsRef = useRef<HTMLDialogElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  function closeTools() {
    toolsRef.current?.close();
  }
  function showTextAt(number: number, at: number, length = 0) {
    navigate(number, at);
    setView("text");
    setMobilePanel("source");
    closeTools();
    requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(at, at + length);
    });
  }
  useEffect(() => {
    imageRef.current?.scrollTo(0, 0);
  }, [page, view]);
  const url = `/api/books/${bookId}/parsed-documents/${documentId}/editor`;
  const dirty = JSON.stringify(plan) !== saved;
  useEffect(() => {
    onDirty(Boolean(data && dirty));
    return () => onDirty(false);
  }, [data, dirty, onDirty]);
  useEffect(() => {
    const abort = new AbortController();
    fetch(url, { signal: abort.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d);
        setPlan(d.draft.plan);
        setSaved(JSON.stringify(d.draft.plan));
        setPage(d.draft.plan.starts[0]?.page || d.pages[0]?.pageNumber || 1);
        setView(
          d.filename.toLowerCase().endsWith(".pdf") ? "original" : "text",
        );
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [url]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty && data) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, data]);
  useEffect(() => {
    setImage(null);
    setImageError("");
    if (!data || view !== "original") return;
    const abort = new AbortController();
    fetch(
      `/api/books/${bookId}/source-files/${data.sourceId}/preview?page=${page}`,
      { signal: abort.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setImage({ ...d, page });
        setNativeLabels((labels) => ({ ...labels, [page]: d.label }));
        setBookmarks(d.bookmarks || []);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setImageError(e.message);
      });
    return () => abort.abort();
  }, [data?.sourceId, bookId, page, view]);
  const current = data?.pages.find((p) => p.pageNumber === page);
  const result = useMemo(() => {
    try {
      return {
        chapters:
          data && plan.starts.length ? splitAtBoundaries(data.pages, plan) : [],
        error: "",
      };
    } catch (e) {
      return {
        chapters: [],
        error: e instanceof Error ? e.message : "Invalid boundaries",
      };
    }
  }, [data, plan]);
  const matches = useMemo(
    () =>
      !query.trim()
        ? []
        : (data?.pages || []).flatMap((p) => {
            const found = [];
            const content = p.textContent.toLowerCase(),
              needle = query.toLowerCase();
            let at = content.indexOf(needle);
            while (at >= 0 && found.length < 100) {
              found.push({
                page: p.pageNumber,
                offset: at,
                snippet: p.textContent.slice(Math.max(0, at - 35), at + 100),
              });
              at = content.indexOf(needle, at + Math.max(1, needle.length));
            }
            return found;
          }),
    [data, query],
  );
  function navigate(number: number, at = 0) {
    setPage(number);
    setOffset(at);
    setNotice("");
  }
  function mark(at: number) {
    if (!current?.textContent) {
      setError(
        t(
          "This page has no extracted text. Choose a readable page or extract text with OCR first.",
          "추출된 텍스트가 없는 페이지입니다. 다른 페이지를 선택하세요.",
        ),
      );
      return;
    }
    setError("");
    if (plan.starts.some((b) => b.page === page && b.offset === at)) {
      setError(
        t("A chapter already starts here.", "이미 챕터 시작점이 있습니다."),
      );
      return;
    }
    setPlan({
      ...plan,
      starts: [...plan.starts, { page, offset: at, title: "" }].sort(
        (a, b) => a.page - b.page || a.offset - b.offset,
      ),
    });
  }
  function suggest() {
    if (!data) return;
    const available = new Set(data.pages.map((p) => p.pageNumber));
    const fromBookmarks = (
      bookmarks.length ? bookmarks : data.suggestions || []
    ).filter((b) => available.has(b.page));
    const detected: SplitPlan["starts"] = [];
    for (const p of data.pages) {
      const pattern =
        /^(?:chapter|part|book)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b[^\n]*$/gim;
      let match;
      while ((match = pattern.exec(p.textContent)) !== null)
        detected.push({
          page: p.pageNumber,
          offset: match.index,
          title: match[0].trim(),
        });
    }
    const proposed = fromBookmarks.length ? fromBookmarks : detected;
    const unique = proposed
      .filter(
        (b, i, a) =>
          a.findIndex((v) => v.page === b.page && v.offset === b.offset) === i,
      )
      .sort((a, b) => a.page - b.page || a.offset - b.offset);
    if (!unique.length) {
      setNotice(
        t(
          "No clear starts found. Mark chapter starts while reading.",
          "시작점을 찾지 못했습니다. 직접 챕터 시작점을 표시하세요.",
        ),
      );
      return;
    }
    if (
      plan.starts.length &&
      !window.confirm(
        t(
          "Replace this draft with suggested starts?",
          "현재 초안을 추천 시작점으로 바꿀까요?",
        ),
      )
    )
      return;
    setPlan({ ...plan, starts: unique, end: null });
    setNotice(
      t(
        "Suggestions added. Check them before applying.",
        "추천 시작점을 추가했습니다. 적용 전에 확인하세요.",
      ),
    );
  }
  async function save(apply = false) {
    if (busy || !data) return;
    if (
      apply &&
      !window.confirm(
        t(
          "Create a new chapter layout? Previous chapters and guides will be retained.",
          "새 챕터 구성을 만들까요? 이전 챕터와 학습지는 유지됩니다.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: data.draft.version,
          fingerprint: data.fingerprint,
          plan,
          apply,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      setData({ ...data, draft: body.draft });
      setSaved(JSON.stringify(plan));
      setNotice("");
      if (apply) onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!data || dirty || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore",
          layoutId: restoreId === "legacy" ? null : restoreId,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="boundary-loading" role="status">
        {error || t("Loading source…", "원본을 불러오는 중…")}
      </div>
    );
  const pdf = data.filename.toLowerCase().endsWith(".pdf");
  const pageLabelRange = plan.pageLabels?.find(
    (r) => page >= r.from && page <= r.to,
  );
  const printedLabel = pageLabelRange
    ? String(pageLabelRange.first + page - pageLabelRange.from)
    : nativeLabels[page];
  return (
    <section
      className="source-boundary-editor"
      data-panel={mobilePanel}
      aria-label={t("Chapter boundary editor", "챕터 시작점 편집기")}
    >
      <header className="boundary-header">
        <div className="boundary-filename">
          <span>{t("Split text", "텍스트 분할")}</span>
          <strong title={data.filename}>{data.filename}</strong>
        </div>
        <span className="boundary-save-status" role="status">
          {dirty ? t("Unsaved", "미저장") : t("Saved", "저장됨")}
        </span>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => toolsRef.current?.showModal()}
        >
          {t("Tools", "도구")}
        </button>
        <button
          type="button"
          aria-label={t("Save draft", "초안 저장")}
          disabled={busy || !dirty || Boolean(result.error)}
          onClick={() => void save()}
        >
          {t("Save", "저장")}
        </button>
        <button
          className="boundary-panel-toggle"
          type="button"
          aria-expanded={mobilePanel === "chapters"}
          aria-controls="boundary-outline"
          onClick={() =>
            setMobilePanel(mobilePanel === "source" ? "chapters" : "source")
          }
        >
          {mobilePanel === "source"
            ? `${t("Chapters", "챕터")} (${plan.starts.length})`
            : t("Back to source", "원본으로")}
        </button>
      </header>
      {(error || result.error) && (
        <p className="boundary-alert" role="alert">
          {error || result.error}
        </p>
      )}
      {notice && (
        <p className="boundary-notice" role="status">
          {notice}
        </p>
      )}
      <div className="boundary-columns">
        <div className="boundary-source">
          <div className="boundary-view-bar">
            {pdf && (
              <div className="boundary-view-switch">
                <button
                  type="button"
                  aria-label={t("Original PDF", "원본 PDF")}
                  aria-pressed={view === "original"}
                  onClick={() => setView("original")}
                >
                  PDF
                </button>
                <button
                  type="button"
                  aria-label={t("Extracted text", "추출 텍스트")}
                  aria-pressed={view === "text"}
                  onClick={() => {
                    setView("text");
                    setOffset(0);
                  }}
                >
                  {t("Text", "텍스트")}
                </button>
              </div>
            )}
            {pdf && printedLabel && (
              <span className="boundary-printed-label">
                {t("Printed", "인쇄")}: {printedLabel}
              </span>
            )}
            {view === "original" && (
              <select
                aria-label={t("Zoom", "확대")}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                <option value={100}>{t("Fit width", "너비 맞춤")}</option>
                <option value={0}>{t("Whole page", "전체 페이지")}</option>
                <option value={125}>125%</option>
                <option value={150}>150%</option>
                <option value={200}>200%</option>
              </select>
            )}
          </div>
          {view === "original" ? (
            <div
              ref={imageRef}
              className={`boundary-page-image${zoom === 0 ? " boundary-fit-page" : ""}`}
              tabIndex={0}
              aria-label={t("PDF viewer", "PDF 보기")}
            >
              {image?.page === page ? (
                <img
                  alt={`${t("Original page", "원본 페이지")} ${page}`}
                  src={`data:image/png;base64,${image.image}`}
                  style={
                    zoom === 0
                      ? undefined
                      : { width: `${zoom}%`, maxWidth: "none" }
                  }
                />
              ) : (
                <p role="status">
                  {imageError || t("Loading page…", "페이지를 불러오는 중…")}
                </p>
              )}
            </div>
          ) : (
            <textarea
              ref={textRef}
              className="boundary-text"
              aria-label={t("Page text", "페이지 텍스트")}
              value={current?.textContent || ""}
              readOnly
              onSelect={(e) => setOffset(e.currentTarget.selectionStart)}
              placeholder={t(
                "No extracted text on this page.",
                "이 페이지에는 추출된 텍스트가 없습니다.",
              )}
            />
          )}
          {!current?.textContent && (
            <p className="boundary-page-note">
              {t(
                "No selectable text on this page.",
                "이 페이지에는 선택할 텍스트가 없습니다.",
              )}
            </p>
          )}
          <footer
            className="boundary-page-controls"
            aria-label={t("Page navigation", "페이지 이동")}
          >
            <button
              type="button"
              aria-label={t("Previous page", "이전 페이지")}
              disabled={page <= 1}
              onClick={() => navigate(page - 1)}
            >
              ←
            </button>
            <input
              aria-label={t("Source page", "원본 페이지")}
              type="number"
              min={1}
              max={data.pageCount}
              value={page}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= data.pageCount)
                  navigate(n);
              }}
            />
            <span>/ {data.pageCount}</span>
            <button
              type="button"
              aria-label={t("Next page", "다음 페이지")}
              disabled={page >= data.pageCount}
              onClick={() => navigate(page + 1)}
            >
              →
            </button>
            <button
              className="boundary-mark"
              type="button"
              aria-label={
                view === "text"
                  ? t("Start at cursor", "커서 위치에서 시작")
                  : t("Start chapter on this page", "이 페이지에서 챕터 시작")
              }
              disabled={!current?.textContent}
              onClick={() => mark(view === "text" ? offset : 0)}
            >
              {t("Mark start", "시작 표시")}
            </button>
          </footer>
        </div>
        <aside
          className="boundary-outline"
          id="boundary-outline"
          aria-label={t("Chapter outline", "챕터 목록")}
        >
          <div className="boundary-outline-heading">
            <h3>
              {t("Chapters", "챕터")} ({plan.starts.length})
            </h3>
            <button type="button" onClick={suggest}>
              {t("Suggest starts", "시작점 추천")}
            </button>
          </div>
          <div className="boundary-outline-scroll">
            {!plan.starts.length && (
              <p className="boundary-empty">
                {t(
                  "Browse the source and mark where each chapter begins.",
                  "원본을 읽으며 각 챕터의 시작점을 표시하세요.",
                )}
              </p>
            )}
            {plan.starts.map((b, i) => (
              <div className="boundary-row" key={`${b.page}:${b.offset}`}>
                <button
                  type="button"
                  onClick={() => {
                    showTextAt(b.page, b.offset);
                  }}
                >
                  {i + 1} · {pdf ? t("Page", "페이지") : t("Section", "구간")}{" "}
                  {b.page} ·{" "}
                  {b.offset === 0
                    ? t("page start", "페이지 시작")
                    : t("within page", "페이지 중간")}
                </button>
                <input
                  aria-label={`${t("Chapter title", "챕터 제목")} ${i + 1}`}
                  value={b.title}
                  placeholder={`${t("Chapter", "챕터")} ${i + 1}`}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      starts: plan.starts.map((v, n) =>
                        n === i ? { ...v, title: e.target.value } : v,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  disabled={!current?.textContent}
                  onClick={() =>
                    setPlan({
                      ...plan,
                      starts: plan.starts
                        .map((v, n) =>
                          n === i
                            ? {
                                ...v,
                                page,
                                offset: view === "text" ? offset : 0,
                              }
                            : v,
                        )
                        .sort((a, b) => a.page - b.page || a.offset - b.offset),
                    })
                  }
                >
                  {t("Move start here", "시작점을 여기로 이동")}
                </button>
                <button
                  type="button"
                  aria-label={`${t("Remove boundary", "시작점 삭제")} ${i + 1}`}
                  onClick={() =>
                    setPlan({
                      ...plan,
                      starts: plan.starts.filter((_, n) => n !== i),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            {plan.end && (
              <p>
                {t("Reading ends at", "읽기 종료")}: {plan.end.page} ·{" "}
                {t("selected position", "선택한 위치")}{" "}
                <button
                  type="button"
                  onClick={() => setPlan({ ...plan, end: null })}
                >
                  {t("Clear", "해제")}
                </button>
              </p>
            )}
            <button
              type="button"
              disabled={!result.chapters.length}
              onClick={() => setPreview(!preview)}
            >
              {t("Preview chapters", "챕터 미리보기")}
            </button>
            {preview && (
              <div className="boundary-preview">
                {result.chapters.map((c) => (
                  <details key={c.chapterNumber}>
                    <summary>
                      {c.chapterNumber}. {c.title} · {c.wordCount}{" "}
                      {t("words", "단어")}
                      {c.wordCount < 50
                        ? ` · ${t("Short chapter", "짧은 챕터")}`
                        : ""}
                    </summary>
                    <p>{c.textContent.slice(0, 180)}</p>
                    <p>…{c.textContent.slice(-180)}</p>
                  </details>
                ))}
              </div>
            )}
            {(data.hasLegacy || data.layouts.length > 0) && (
              <details className="boundary-history">
                <summary>{t("Saved layouts", "저장된 구성")}</summary>
                <select
                  aria-label={t("Saved chapter layout", "저장된 챕터 구성")}
                  value={restoreId}
                  onChange={(e) => setRestoreId(e.target.value)}
                >
                  <option value="">{t("Choose layout", "구성 선택")}</option>
                  {data.hasLegacy && (
                    <option value="legacy">
                      {t("Original chapters", "기존 챕터")}
                    </option>
                  )}
                  {data.layouts.map((l) => (
                    <option key={l.id} value={l.id}>
                      {new Date(l.createdAt).toLocaleString()} · {l.count}{" "}
                      {t("chapters", "챕터")}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!restoreId || busy || dirty}
                  onClick={() => void restore()}
                >
                  {t("Use saved layout", "저장된 구성 사용")}
                </button>
              </details>
            )}
          </div>
          <footer className="boundary-outline-actions">
            <button
              className="primary-action"
              type="button"
              disabled={
                busy || !result.chapters.length || Boolean(result.error)
              }
              onClick={() => void save(true)}
            >
              {busy
                ? t("Saving…", "저장 중…")
                : t("Use these chapters", "이 챕터 구성 사용")}
            </button>
          </footer>
        </aside>
      </div>
      <dialog
        ref={toolsRef}
        className="boundary-tools"
        aria-labelledby="boundary-tools-title"
      >
        <header>
          <h3 id="boundary-tools-title">{t("Source tools", "원본 도구")}</h3>
          <button
            type="button"
            aria-label={t("Close tools", "도구 닫기")}
            onClick={closeTools}
          >
            ×
          </button>
        </header>
        <div className="boundary-tools-body">
          {result.error && <p role="alert">{result.error}</p>}
          <label className="boundary-search">
            {t("Find in source", "원본에서 찾기")}
            <input value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {query && (
            <div className="boundary-search-results">
              {matches.length ? (
                matches.map((m) => (
                  <button
                    type="button"
                    key={`${m.page}:${m.offset}`}
                    onClick={() => {
                      showTextAt(m.page, m.offset, query.length);
                    }}
                  >
                    {m.page}: {m.snippet}
                  </button>
                ))
              ) : (
                <p>{t("No matches.", "검색 결과가 없습니다.")}</p>
              )}
            </div>
          )}
          {pdf && (
            <details className="boundary-numbering">
              <summary>
                {t("Printed page numbering", "인쇄 페이지 번호")}
              </summary>
              <p>
                {t(
                  "Use a range when printed numbers differ from PDF pages.",
                  "인쇄 번호가 PDF 페이지와 다를 때 범위를 지정하세요.",
                )}
              </p>
              {(plan.pageLabels || []).map((r, i) => (
                <div className="boundary-toolbar" key={i}>
                  {(["from", "to", "first"] as const).map((key) => (
                    <label key={key}>
                      {key === "from"
                        ? t("PDF from", "PDF 시작")
                        : key === "to"
                          ? t("PDF to", "PDF 끝")
                          : t("Printed start", "인쇄 시작")}
                      <input
                        type="number"
                        min={1}
                        value={r[key]}
                        onChange={(e) =>
                          setPlan({
                            ...plan,
                            pageLabels: plan.pageLabels?.map((v, n) =>
                              n === i
                                ? { ...v, [key]: Number(e.target.value) }
                                : v,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setPlan({
                        ...plan,
                        pageLabels: plan.pageLabels?.filter((_, n) => n !== i),
                      })
                    }
                  >
                    {t("Remove range", "범위 삭제")}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setPlan({
                    ...plan,
                    pageLabels: [
                      ...(plan.pageLabels || []),
                      { from: page, to: data.pageCount, first: 1 },
                    ],
                  })
                }
              >
                {t("Add numbering range", "번호 범위 추가")}
              </button>
            </details>
          )}

          <details className="boundary-reading-settings">
            <summary>{t("Reading range", "읽기 범위")}</summary>
            <p>
              {t(
                "Text before the first chapter start is excluded. In Text view, place the cursor to mark a start or end within a page.",
                "첫 챕터 시작점 이전 텍스트는 제외됩니다. 텍스트 보기에서 커서를 놓아 페이지 중간의 시작이나 끝을 표시하세요.",
              )}
            </p>
            <button
              type="button"
              disabled={!current?.textContent}
              onClick={() => {
                mark(0);
                closeTools();
              }}
            >
              {t("Start chapter on this page", "이 페이지에서 챕터 시작")}
            </button>
            <button
              type="button"
              disabled={view !== "text" || !current?.textContent}
              onClick={() => {
                setPlan({ ...plan, end: { page, offset } });
                closeTools();
              }}
            >
              {t("End reading at cursor", "커서 위치에서 읽기 종료")}
            </button>
          </details>
          {!current?.textContent && (
            <p>
              {t(
                "A cover or blank page may have no text. If the reading pages are scans too, upload an OCR-processed copy to split them.",
                "표지나 빈 페이지에는 텍스트가 없을 수 있습니다. 본문도 스캔이라면 OCR 처리한 파일을 업로드하세요.",
              )}
            </p>
          )}
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => {
              setPlan(data.draft.plan);
              setError("");
              setNotice("");
              closeTools();
            }}
          >
            {t("Discard changes", "변경 취소")}
          </button>
        </div>
      </dialog>
    </section>
  );
}
