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
    } | null>(null),
    [imageError, setImageError] = useState(""),
    [zoom, setZoom] = useState(100),
    [preview, setPreview] = useState(false),
    [restoreId, setRestoreId] = useState(""),
    [bookmarks, setBookmarks] = useState<SplitPlan["starts"]>([]);
  const [nativeLabels, setNativeLabels] = useState<Record<number, string>>({});
  const textRef = useRef<HTMLTextAreaElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  // Fit the reading surface beneath its actual controls, including expanded
  // numbering ranges; a fixed viewport fraction hides its bottom on laptops.
  useEffect(() => {
    const fit = () => {
      const surface = sourceRef.current?.querySelector<HTMLElement>(
        ".boundary-text, .boundary-page-image",
      );
      if (surface)
        surface.style.height = `${Math.max(220, window.innerHeight - surface.getBoundingClientRect().top - 24)}px`;
    };
    const observer = new ResizeObserver(fit);
    if (sourceRef.current) observer.observe(sourceRef.current);
    window.addEventListener("resize", fit);
    fit();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [data, view]);
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
        setImage(d);
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
      setNotice(t("Draft saved.", "초안이 저장되었습니다."));
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
      aria-label={t("Chapter boundary editor", "챕터 시작점 편집기")}
    >
      <div className="boundary-header">
        <strong>{data.filename}</strong>
        <span>
          {dirty
            ? t("Unsaved draft", "저장되지 않은 초안")
            : notice || t("Draft saved", "저장된 초안")}
        </span>
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => {
            setPlan(data.draft.plan);
            setError("");
          }}
        >
          {t("Discard changes", "변경 취소")}
        </button>
        <button
          type="button"
          disabled={busy || !dirty || Boolean(result.error)}
          onClick={() => void save()}
        >
          {t("Save draft", "초안 저장")}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="boundary-columns">
        <div ref={sourceRef} className="boundary-source">
          <div className="boundary-toolbar">
            <button
              type="button"
              aria-label={t("Previous page", "이전 페이지")}
              disabled={page <= 1}
              onClick={() => navigate(page - 1)}
            >
              ←
            </button>
            <label>
              {pdf ? t("PDF page", "PDF 페이지") : t("Section", "구간")}{" "}
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
            </label>
            <span>/ {data.pageCount}</span>
            <button
              type="button"
              aria-label={t("Next page", "다음 페이지")}
              disabled={page >= data.pageCount}
              onClick={() => navigate(page + 1)}
            >
              →
            </button>
            {pdf && (
              <>
                <button
                  type="button"
                  aria-pressed={view === "original"}
                  onClick={() => setView("original")}
                >
                  {t("Original PDF", "원본 PDF")}
                </button>
                <button
                  type="button"
                  aria-pressed={view === "text"}
                  onClick={() => setView("text")}
                >
                  {t("Extracted text", "추출 텍스트")}
                </button>
              </>
            )}
          </div>
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
          {pdf && printedLabel && (
            <p>
              {t("Printed page", "인쇄 페이지")}: {printedLabel}
            </p>
          )}
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
                      navigate(m.page, m.offset);
                      setView("text");
                      setTimeout(() => {
                        textRef.current?.focus();
                        textRef.current?.setSelectionRange(
                          m.offset,
                          m.offset + query.length,
                        );
                      }, 0);
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
          <div className="boundary-toolbar">
            <button type="button" onClick={() => mark(0)}>
              {t("Start chapter on this page", "이 페이지에서 챕터 시작")}
            </button>
            {view === "text" && (
              <>
                <button
                  type="button"
                  disabled={!current?.textContent}
                  onClick={() => mark(offset)}
                >
                  {t("Start at cursor", "커서 위치에서 시작")}
                </button>
                <button
                  type="button"
                  disabled={!current?.textContent}
                  onClick={() => setPlan({ ...plan, end: { page, offset } })}
                >
                  {t("End reading at cursor", "커서 위치에서 읽기 종료")}
                </button>
              </>
            )}
          </div>
          {!current?.textContent && (
            <p role="status">
              {t(
                "No text was extracted on this page. If it contains scanned text, upload an OCR-processed copy to split it.",
                "이 페이지에는 추출된 텍스트가 없습니다. 스캔된 텍스트라면 OCR 처리한 파일을 업로드하세요.",
              )}
            </p>
          )}
          {view === "original" ? (
            <>
              <label>
                {t("Zoom", "확대")}{" "}
                <select
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                >
                  <option value={75}>75%</option>
                  <option value={100}>100%</option>
                  <option value={150}>150%</option>
                </select>
              </label>
              <div className="boundary-page-image">
                {image ? (
                  <img
                    alt={`${t("Original page", "원본 페이지")} ${page}`}
                    src={`data:image/png;base64,${image.image}`}
                    style={{ width: `${zoom}%`, maxWidth: "none" }}
                  />
                ) : (
                  <p role="status">
                    {imageError || t("Loading page…", "페이지를 불러오는 중…")}
                  </p>
                )}
              </div>
            </>
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
        </div>
        <aside className="boundary-outline">
          <h3>
            {t("Chapters", "챕터")} ({plan.starts.length})
          </h3>
          <button type="button" onClick={suggest}>
            {t("Suggest starts", "시작점 추천")}
          </button>
          <p>
            {t(
              "Text before the first start is excluded. Place the text cursor to split within a page.",
              "첫 시작점 이전 텍스트는 제외됩니다. 페이지 중간을 나누려면 커서를 놓으세요.",
            )}
          </p>
          {plan.starts.map((b, i) => (
            <div className="boundary-row" key={`${b.page}:${b.offset}`}>
              <button
                type="button"
                onClick={() => {
                  navigate(b.page, b.offset);
                  setView("text");
                  setTimeout(() => {
                    textRef.current?.focus();
                    textRef.current?.setSelectionRange(b.offset, b.offset);
                  }, 0);
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
                          ? { ...v, page, offset: view === "text" ? offset : 0 }
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
          {result.error && <p role="alert">{result.error}</p>}
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
          <button
            className="primary-action"
            type="button"
            disabled={busy || !result.chapters.length || Boolean(result.error)}
            onClick={() => void save(true)}
          >
            {busy
              ? t("Saving…", "저장 중…")
              : t("Use these chapters", "이 챕터 구성 사용")}
          </button>
        </aside>
      </div>
    </section>
  );
}
