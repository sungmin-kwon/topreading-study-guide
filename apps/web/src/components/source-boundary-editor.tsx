"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  splitAtBoundaries,
  type SplitPlan,
  type SourcePage,
} from "@/lib/source-boundaries";
import {
  sourceSpread,
  nearbySourcePages,
  type PageLayout,
} from "@/lib/source-spread";
import { useSourcePreviews } from "./use-source-previews";
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
    plan: SplitPlan;
  }[];
  activeLayoutId: string | null;
  linkedLayoutIds: (string | null)[];
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
    [zoom, setZoom] = useState(100),
    [preview, setPreview] = useState(false),
    [restoreId, setRestoreId] = useState(""),
    [bookmarks, setBookmarks] = useState<SplitPlan["starts"]>([]);
  const [nativeLabels, setNativeLabels] = useState<Record<number, string>>({});
  const [pageLayout, setPageLayout] = useState<PageLayout>("single");
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1100px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const effectiveLayout = wide ? pageLayout : "single";
  const visiblePages = sourceSpread(
    page,
    data?.pageCount || 1,
    effectiveLayout,
  );
  const spreadKey = visiblePages.join(",");
  const previewBase =
    data && view === "original"
      ? `/api/books/${bookId}/source-files/${data.sourceId}/preview`
      : null;
  const getPreview = useSourcePreviews(
    previewBase,
    visiblePages,
    nearbySourcePages(visiblePages, data?.pageCount || 1, effectiveLayout),
  );
  const activePreview = getPreview(page).preview;
  useEffect(() => {
    if (!activePreview) return;
    setNativeLabels((labels) => ({ ...labels, [page]: activePreview.label }));
    setBookmarks(activePreview.bookmarks || []);
  }, [activePreview, page]);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [mobilePanel, setMobilePanel] = useState<"source" | "chapters">(
    "source",
  );
  const [openBoundary, setOpenBoundary] = useState<string | null>(null);
  const searchRef = useRef<HTMLDialogElement>(null);
  const numberingRef = useRef<HTMLDialogElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  function closeSearch() {
    searchRef.current?.close();
  }
  function showTextAt(number: number, at: number, length = 0) {
    navigate(number, at);
    setView("text");
    setMobilePanel("source");
    closeSearch();
    requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(at, at + length);
    });
  }
  useEffect(() => {
    imageRef.current?.scrollTo(0, 0);
  }, [spreadKey, view]);
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
  function turnPage(direction: -1 | 1) {
    if (!data) return;
    const next =
      direction === 1
        ? visiblePages[visiblePages.length - 1] + 1
        : Math.max(1, visiblePages[0] - (effectiveLayout === "single" ? 1 : 2));
    if (next >= 1 && next <= data.pageCount) navigate(next);
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !data ||
        !editorRef.current?.getClientRects().length ||
        busy ||
        mobilePanel !== "source" ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !["ArrowLeft", "ArrowRight"].includes(event.key)
      )
        return;
      if (document.querySelector("dialog[open]")) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target !== document.body && !editorRef.current?.contains(target))
        return;
      if (
        target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="menu"]',
        )
      )
        return;
      event.preventDefault();
      turnPage(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, busy, mobilePanel, spreadKey, effectiveLayout]);
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
  function discardDraft() {
    if (!data || busy) return;
    setPlan(data.draft.plan);
    setOpenBoundary(null);
    setError("");
    setNotice("");
  }
  function markEnd() {
    if (!current || !plan.starts.length) return;
    setPlan({
      ...plan,
      end: {
        page,
        offset: view === "text" ? offset : current.textContent.length,
      },
    });
    setError("");
    setNotice(
      view === "text"
        ? t(
            "Reading ends at the cursor. Later text is excluded.",
            "커서 위치에서 읽기를 마칩니다. 이후 텍스트는 제외됩니다.",
          )
        : t(
            `Reading ends after page ${page}. Later pages are excluded.`,
            `${page}페이지 뒤에서 읽기를 마칩니다. 이후 페이지는 제외됩니다.`,
          ),
    );
  }
  async function save(apply = false) {
    if (busy || !data) return;
    if (
      apply &&
      !window.confirm(
        t(
          "Use this chapter split? Previous splits and guides will be kept.",
          "이 챕터 분할을 사용할까요? 이전 분할과 학습지는 유지됩니다.",
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
  async function deleteSplit() {
    if (!data || !restoreId || busy || dirty) return;
    if (
      !window.confirm(
        t(
          "Delete this saved chapter split and its chapter text edits? This cannot be undone. The source file and your saved draft will be kept.",
          "저장된 챕터 분할과 챕터 텍스트 수정 내역을 삭제할까요? 되돌릴 수 없습니다. 원본 파일과 저장된 초안은 유지됩니다.",
        ),
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-split",
          layoutId: restoreId === "legacy" ? null : restoreId,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setRestoreId("");
      const refreshed = await fetch(url);
      const latest = await refreshed.json();
      if (!refreshed.ok) throw Error(latest.error);
      setData(latest);
      setPlan(latest.draft.plan);
      setSaved(JSON.stringify(latest.draft.plan));
      setNotice(
        t("Saved chapter split deleted.", "저장된 챕터 분할을 삭제했습니다."),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete split.");
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
  const selectedSplitId = restoreId === "legacy" ? null : restoreId;
  const splitProtection = !restoreId
    ? ""
    : selectedSplitId === data.activeLayoutId
      ? t(
          "Currently in use. Choose another split before deleting this one.",
          "현재 사용 중입니다. 다른 분할을 선택한 뒤 삭제하세요.",
        )
      : data.linkedLayoutIds.includes(selectedSplitId)
        ? t(
            "Used by a study guide or generation record. Kept to preserve its chapters and exports.",
            "학습지 또는 생성 기록에서 사용 중입니다. 챕터와 내보내기를 보존하기 위해 유지됩니다.",
          )
        : "";
  const activePlan = data.layouts.find(
    (layout) => layout.id === data.activeLayoutId,
  )?.plan;
  function loadCurrentBoundaries() {
    if (!activePlan) return;
    if (
      dirty &&
      !window.confirm(
        t(
          "Replace your unsaved draft with the current chapter boundaries?",
          "미저장 초안을 현재 챕터 경계로 바꿀까요?",
        ),
      )
    )
      return;
    setPlan(structuredClone(activePlan));
    navigate(activePlan.starts[0]?.page || 1);
    setOpenBoundary(null);
    setError("");
  }
  const pdf = data.filename.toLowerCase().endsWith(".pdf");
  function printedPageLabel(number: number) {
    const range = plan.pageLabels?.find(
      (r) => number >= r.from && number <= r.to,
    );
    return range
      ? String(range.first + number - range.from)
      : nativeLabels[number] || getPreview(number).preview?.label;
  }
  const printedLabel = printedPageLabel(page);
  return (
    <section
      ref={editorRef}
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
          onClick={() => searchRef.current?.showModal()}
        >
          {t("Find", "찾기")}
        </button>
        {dirty && (
          <button
            type="button"
            aria-label={t("Discard changes", "변경 취소")}
            disabled={busy}
            onClick={discardDraft}
          >
            {t("Discard", "취소")}
          </button>
        )}
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
            {pdf && (
              <button
                className="boundary-numbering-button"
                type="button"
                aria-label={t("Page numbers", "페이지 번호")}
                aria-haspopup="dialog"
                onClick={() => numberingRef.current?.showModal()}
              >
                {printedLabel
                  ? `${t("Printed", "인쇄")}: ${printedLabel}`
                  : t("Page numbers", "페이지 번호")}
              </button>
            )}
            {wide && (
              <select
                aria-label={t("Page layout", "페이지 배치")}
                value={pageLayout}
                onChange={(e) => setPageLayout(e.target.value as PageLayout)}
              >
                <option value="single">{t("Single page", "한 페이지")}</option>
                <option value="pairs">
                  {t("Two pages (1–2)", "두 페이지 (1–2)")}
                </option>
                <option value="facing">
                  {t("Facing pages (2–3)", "맞쪽 (2–3)")}
                </option>
              </select>
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
              className={`boundary-page-image${zoom === 0 ? " boundary-fit-page" : ""}${visiblePages.length > 1 ? " boundary-spread" : ""}`}
              tabIndex={0}
              aria-label={t("PDF viewer", "PDF 보기")}
            >
              {visiblePages.length === 1 ? (
                getPreview(page).preview ? (
                  <img
                    alt={`${t("Original page", "원본 페이지")} ${page}`}
                    src={`data:image/png;base64,${getPreview(page).preview!.image}`}
                    style={
                      zoom === 0
                        ? undefined
                        : { width: `${zoom}%`, maxWidth: "none" }
                    }
                  />
                ) : (
                  <p role="status">
                    {getPreview(page).error ||
                      t("Loading page…", "페이지를 불러오는 중…")}
                  </p>
                )
              ) : (
                <div
                  className="boundary-spread-pages"
                  style={zoom === 0 ? undefined : { width: `${zoom}%` }}
                >
                  {visiblePages.map((number) => (
                    <button
                      type="button"
                      key={number}
                      className="boundary-sheet"
                      aria-label={`${t("Select page", "페이지 선택")} ${number}`}
                      aria-pressed={page === number}
                      onClick={() => navigate(number)}
                    >
                      <span className="boundary-sheet-label">
                        {t("Page", "페이지")} {number}
                        {printedPageLabel(number)
                          ? ` · ${t("Printed", "인쇄")}: ${printedPageLabel(number)}`
                          : ""}
                      </span>
                      {getPreview(number).preview ? (
                        <img
                          alt={`${t("Original page", "원본 페이지")} ${number}`}
                          src={`data:image/png;base64,${getPreview(number).preview!.image}`}
                        />
                      ) : (
                        <span role="status">
                          {getPreview(number).error ||
                            t("Loading page…", "페이지를 불러오는 중…")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className={`boundary-text-pages${visiblePages.length > 1 ? " boundary-text-spread" : ""}`}
            >
              {visiblePages.map((number) => (
                <div
                  className="boundary-text-sheet"
                  key={number}
                  data-selected={page === number}
                >
                  {visiblePages.length > 1 && (
                    <button
                      type="button"
                      className="boundary-text-label"
                      aria-pressed={page === number}
                      onClick={() => navigate(number)}
                    >
                      {t("Page", "페이지")} {number}
                    </button>
                  )}
                  <textarea
                    ref={page === number ? textRef : undefined}
                    className="boundary-text"
                    aria-label={
                      visiblePages.length === 1
                        ? t("Page text", "페이지 텍스트")
                        : `${t("Page text", "페이지 텍스트")} ${number}`
                    }
                    value={
                      data.pages.find((p) => p.pageNumber === number)
                        ?.textContent || ""
                    }
                    readOnly
                    onFocus={(e) => {
                      setPage(number);
                      setOffset(e.currentTarget.selectionStart);
                    }}
                    onSelect={(e) => {
                      setPage(number);
                      setOffset(e.currentTarget.selectionStart);
                    }}
                    placeholder={t(
                      "No extracted text on this page.",
                      "이 페이지에는 추출된 텍스트가 없습니다.",
                    )}
                  />
                </div>
              ))}
            </div>
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
              disabled={visiblePages[0] <= 1}
              title={t("Previous page / spread (←)", "이전 페이지 / 맞쪽 (←)")}
              aria-keyshortcuts="ArrowLeft"
              onClick={() => turnPage(-1)}
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
              disabled={visiblePages[visiblePages.length - 1] >= data.pageCount}
              title={t("Next page / spread (→)", "다음 페이지 / 맞쪽 (→)")}
              aria-keyshortcuts="ArrowRight"
              onClick={() => turnPage(1)}
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
              {t("Start", "시작")}
            </button>
            <button
              type="button"
              className="boundary-mark-end"
              disabled={!plan.starts.length || !current}
              aria-label={
                view === "text"
                  ? t("End reading at cursor", "커서 위치에서 읽기 종료")
                  : t(
                      "End reading after this page",
                      "이 페이지 뒤에서 읽기 종료",
                    )
              }
              title={
                view === "text"
                  ? t("Exclude text after the cursor", "커서 뒤 텍스트 제외")
                  : t(
                      "Include this page; exclude later pages",
                      "이 페이지 포함, 이후 페이지 제외",
                    )
              }
              onClick={markEnd}
            >
              {t("End", "끝")}
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
            {activePlan &&
              JSON.stringify(activePlan) !== JSON.stringify(plan) && (
                <div className="boundary-current-layout">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={loadCurrentBoundaries}
                  >
                    {t("Load current boundaries", "현재 경계 불러오기")}
                  </button>
                  <small>
                    {t(
                      "Replace this draft with the split currently in use.",
                      "초안을 챕터 읽기의 현재 경계로 바꿉니다.",
                    )}
                  </small>
                </div>
              )}
            {!activePlan &&
              data.hasLegacy &&
              !data.activeLayoutId &&
              !plan.starts.length && (
                <p className="boundary-empty">
                  {t(
                    "These original chapters have no saved boundary markers. Mark a new split here; existing guides will be kept.",
                    "이전 챕터에는 저장된 경계가 없습니다. 여기서 새 경계를 지정하세요. 기존 학습지는 유지됩니다.",
                  )}
                </p>
              )}
            {!plan.starts.length && (
              <p className="boundary-empty">
                {t(
                  "Browse the source and mark where each chapter begins.",
                  "원본을 읽으며 각 챕터의 시작점을 표시하세요.",
                )}
              </p>
            )}
            {plan.starts.map((b, i) => {
              const key = `${b.page}:${b.offset}`;
              return (
                <div className="boundary-row" key={key}>
                  <span className="boundary-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  <button
                    className="boundary-location"
                    type="button"
                    aria-label={`${t("Go to chapter", "챕터로 이동")} ${i + 1}`}
                    title={`${t("Page", "페이지")} ${b.page} · ${b.offset ? t("within page", "페이지 중간") : t("page start", "페이지 시작")}`}
                    onClick={() => showTextAt(b.page, b.offset)}
                  >
                    {t("p.", "쪽")} {b.page}
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
                    className="boundary-row-menu"
                    aria-label={`${t("Chapter actions", "챕터 작업")} ${i + 1}`}
                    aria-expanded={openBoundary === key}
                    aria-controls={`boundary-actions-${i}`}
                    onClick={() =>
                      setOpenBoundary(openBoundary === key ? null : key)
                    }
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <circle cx="3" cy="8" r="1.3" />
                      <circle cx="8" cy="8" r="1.3" />
                      <circle cx="13" cy="8" r="1.3" />
                    </svg>
                  </button>
                  {openBoundary === key && (
                    <div
                      className="boundary-row-actions"
                      id={`boundary-actions-${i}`}
                    >
                      <button
                        type="button"
                        disabled={!current?.textContent}
                        onClick={() => {
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
                              .sort(
                                (a, b) =>
                                  a.page - b.page || a.offset - b.offset,
                              ),
                          });
                          setOpenBoundary(null);
                        }}
                      >
                        {t("Move start here", "시작점을 여기로 이동")}
                      </button>
                      <button
                        type="button"
                        aria-label={`${t("Remove boundary", "시작점 삭제")} ${i + 1}`}
                        onClick={() => {
                          setPlan({
                            ...plan,
                            starts: plan.starts.filter((_, n) => n !== i),
                          });
                          setOpenBoundary(null);
                        }}
                      >
                        {t("Remove", "삭제")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {plan.end && (
              <div className="boundary-end">
                <button
                  type="button"
                  className="boundary-end-location"
                  onClick={() => showTextAt(plan.end!.page, plan.end!.offset)}
                  title={t(
                    "Everything after this point is excluded",
                    "이 위치 이후의 내용은 제외됩니다",
                  )}
                >
                  <strong>{t("Reading end", "읽기 종료")}</strong>
                  <span>
                    {plan.end.offset ===
                    data.pages.find((p) => p.pageNumber === plan.end!.page)
                      ?.textContent.length
                      ? t(
                          `After page ${plan.end.page}`,
                          `${plan.end.page}페이지 뒤`,
                        )
                      : plan.end.offset === 0
                        ? t(
                            `Before page ${plan.end.page}`,
                            `${plan.end.page}페이지 앞`,
                          )
                        : t(
                            `Within page ${plan.end.page}`,
                            `${plan.end.page}페이지 중간`,
                          )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t("Clear reading end", "읽기 종료 해제")}
                  onClick={() => {
                    setPlan({ ...plan, end: null });
                    setNotice("");
                  }}
                >
                  ×
                </button>
              </div>
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
                <summary>
                  {t("Saved chapter splits", "저장된 챕터 분할")}
                </summary>
                <select
                  aria-label={t("Saved chapter split", "저장된 챕터 분할")}
                  value={restoreId}
                  onChange={(e) => setRestoreId(e.target.value)}
                >
                  <option value="">{t("Choose split", "분할 선택")}</option>
                  {data.hasLegacy && (
                    <option value="legacy">
                      {t("Original chapters", "기존 챕터")}
                      {data.activeLayoutId === null
                        ? ` · ${t("Current", "현재")}`
                        : ""}
                    </option>
                  )}
                  {data.layouts.map((l) => (
                    <option key={l.id} value={l.id}>
                      {new Date(l.createdAt).toLocaleString()} · {l.count}{" "}
                      {t("chapters", "챕터")}
                      {data.activeLayoutId === l.id
                        ? ` · ${t("Current", "현재")}`
                        : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={
                    !restoreId ||
                    busy ||
                    dirty ||
                    selectedSplitId === data.activeLayoutId
                  }
                  onClick={() => void restore()}
                >
                  {t("Use saved split", "저장된 챕터 분할 사용")}
                </button>
                <button
                  className="boundary-delete-split"
                  type="button"
                  disabled={
                    !restoreId || busy || dirty || Boolean(splitProtection)
                  }
                  onClick={() => void deleteSplit()}
                >
                  {t("Delete split", "분할 삭제")}
                </button>
                {splitProtection && (
                  <p className="boundary-split-protection">{splitProtection}</p>
                )}
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
        ref={searchRef}
        className="boundary-tools"
        aria-labelledby="boundary-search-title"
      >
        <header>
          <h3 id="boundary-search-title">
            {t("Find in source", "원본에서 찾기")}
          </h3>
          <button
            type="button"
            aria-label={t("Close search", "검색 닫기")}
            onClick={closeSearch}
          >
            ×
          </button>
        </header>
        <div className="boundary-tools-body">
          <label className="boundary-search">
            <span className="visually-hidden">
              {t("Find in source", "원본에서 찾기")}
            </span>
            <input
              autoFocus
              placeholder={t("Search words in the book…", "책에서 단어 검색…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
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
        </div>
      </dialog>
      {pdf && (
        <dialog
          ref={numberingRef}
          className="boundary-tools"
          aria-labelledby="boundary-numbering-title"
        >
          <header>
            <h3 id="boundary-numbering-title">
              {t("Printed page numbers", "인쇄 페이지 번호")}
            </h3>
            <button
              type="button"
              aria-label={t("Close page numbers", "페이지 번호 닫기")}
              onClick={() => numberingRef.current?.close()}
            >
              ×
            </button>
          </header>
          <div className="boundary-tools-body boundary-numbering">
            <p>
              {t(
                "Match the page numbers printed in your book. For example, if PDF page 9 is printed page 1, enter 9 as PDF from and 1 as Printed start. This changes labels only, not chapter boundaries.",
                "책에 인쇄된 번호를 맞춥니다. 예를 들어 PDF 9쪽이 인쇄 1쪽이면 PDF 시작에 9, 인쇄 시작에 1을 입력하세요. 챕터 경계는 바뀌지 않습니다.",
              )}
            </p>
            {result.error && <p role="alert">{result.error}</p>}
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
            <p>
              {t(
                "Changes are included when you save the chapter draft.",
                "챕터 초안을 저장하면 번호 변경도 저장됩니다.",
              )}
            </p>
          </div>
          <footer>
            <button type="button" onClick={() => numberingRef.current?.close()}>
              {t("Done", "완료")}
            </button>
          </footer>
        </dialog>
      )}
    </section>
  );
}
