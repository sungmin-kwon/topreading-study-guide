"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { deriveGenerationPlan } from "@topreading/core";

type BookSummary = {
  id: string;
  title: string;
  author: string | null;
  readingLevel: string | null;
  activeGenerationRunId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type BooksResponse = {
  books: BookSummary[];
};

type BookResponse = {
  book?: BookSummary;
  error?: string;
};

type BookStatsResponse = {
  stats?: {
    studySetCount: number;
  };
  error?: string;
};

type GenerationLogEntry = {
  timestamp: string;
  level: "info" | "success" | "warn" | "error";
  message: string;
};

type GenerationRunSummary = {
  id: string;
  bookId: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  progress: Record<string, unknown>;
  log: GenerationLogEntry[];
  errorMessage: string | null;
  chapterCount: number;
  vocabularyCount: number;
  multipleChoiceCount: number;
  shortAnswerCount: number;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type GenerationRunsResponse = {
  generationRuns?: GenerationRunSummary[];
  generationRun?: GenerationRunSummary;
  error?: string;
};

type CreateBookResponse = {
  book?: BookSummary;
  error?: string;
};

type SourceFile = {
  id: string;
  bookId: string;
  originalFilename: string;
  storedPath: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  uploadStatus: string;
  createdAt: string;
};

type SourceFilesResponse = {
  sourceFiles: SourceFile[];
  error?: string;
};

type UploadSourceResponse = {
  sourceFile?: SourceFile;
  error?: string;
};

type ParsedDocument = {
  id: string;
  sourceFileId: string;
  parserName: string;
  parserVersion: string;
  pageCount: number;
  wordCount: number;
  metadata: Record<string, unknown>;
  preview: string;
  createdAt: string;
};

type ParsedDocumentsResponse = {
  parsedDocuments: ParsedDocument[];
  error?: string;
};

type ExtractResponse = {
  parsedDocument?: ParsedDocument;
  error?: string;
};

type ChapterSummary = {
  id: string;
  bookId: string;
  parsedDocumentId: string;
  chapterNumber: number;
  title: string;
  wordCount: number;
  sortOrder: number;
  preview: string;
  createdAt: string;
  updatedAt: string;
};

type ChapterDetail = ChapterSummary & {
  textContent: string;
};

type ChaptersResponse = {
  chapters: ChapterSummary[];
  error?: string;
};

type ChapterDetailResponse = {
  chapter?: ChapterDetail;
  error?: string;
};

type ChapterUpdateResponse = {
  chapter?: ChapterSummary;
  error?: string;
};

type StudySetSummary = {
  id: string;
  bookId: string;
  generationRunId: string | null;
  chapterId: string;
  title: string;
  status: string;
  generator: string;
  model: string | null;
  promptVersion: string | null;
  settings: Record<string, unknown>;
  hasRawOutput: boolean;
  createdAt: string;
  updatedAt: string;
};

type VocabularyItem = {
  id: string;
  term: string;
  definition: string;
  contextSentence: string | null;
  partOfSpeech: string | null;
  difficulty: string | null;
  status: string;
  sortOrder: number;
};

type MultipleChoiceQuestion = {
  id: string;
  questionText: string;
  choices: string[];
  correctChoiceIndex: number;
  explanation: string | null;
  skill: string | null;
  difficulty: string | null;
  status: string;
  sortOrder: number;
};

type ShortAnswerQuestion = {
  id: string;
  questionText: string;
  suggestedAnswer: string;
  rubric: string | null;
  skill: string | null;
  difficulty: string | null;
  status: string;
  sortOrder: number;
};

type StudyItems = {
  vocabularyItems: VocabularyItem[];
  multipleChoiceQuestions: MultipleChoiceQuestion[];
  shortAnswerQuestions: ShortAnswerQuestion[];
};

type StudySetsResponse = {
  studySets?: StudySetSummary[];
  error?: string;
};

type StudyItemsResponse = {
  items?: StudyItems;
  error?: string;
};

type StudyItemKind = "vocabulary" | "multiple-choice" | "short-answer";

type SplitCandidate = {
  index: number;
  line: string;
  chapterNumber: number | null;
  title: string;
  reason: string;
  accepted: boolean;
  context: string;
};

type SplitPreview = {
  strategy: string;
  totalCandidates: number;
  acceptedCandidates: number;
  candidates: SplitCandidate[];
};

type SplitPreviewResponse = {
  preview?: SplitPreview;
  error?: string;
};

type ParsedDocumentDetail = ParsedDocument & {
  textContent: string;
};

type ParsedPageSummary = {
  id: string;
  parsedDocumentId: string;
  pageNumber: number;
  wordCount: number;
  preview: string;
};

type ParsedDocumentDetailResponse = {
  parsedDocument?: ParsedDocumentDetail;
  error?: string;
};

type ParsedPagesResponse = {
  pages?: ParsedPageSummary[];
  error?: string;
};

type ParsedDocumentTool = "preview" | "inspect" | "pages";
type WorkspaceTab = "source" | "chapters" | "generate" | "study-sets" | "export";
type StudySetView = "vocabulary" | "multiple-choice" | "short-answer";
type ExportFileFormat = "pdf" | "docx";
type ThemeMode = "light" | "dark";
type UiLanguage = "en" | "ko";
type PdfExportType =
  | "vocabulary-list"
  | "vocabulary-quiz"
  | "multiple-choice"
  | "multiple-choice-concise-key"
  | "multiple-choice-key"
  | "short-answer"
  | "short-answer-key";

type GenerationPlanDraft = {
  included: boolean;
  vocabularyCount: string;
  multipleChoiceCount: string;
  shortAnswerCount: string;
};

async function fetchBooks() {
  const response = await fetch("/api/books", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load the book library.");
  }

  const payload = (await response.json()) as BooksResponse;
  return payload.books;
}

async function fetchSourceFiles(bookId: string) {
  const response = await fetch(`/api/books/${bookId}/source-files`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load source files.");
  }

  const payload = (await response.json()) as SourceFilesResponse;
  return payload.sourceFiles;
}

async function fetchParsedDocuments(bookId: string, sourceFileId: string) {
  const response = await fetch(`/api/books/${bookId}/source-files/${sourceFileId}/parsed-documents`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Could not load parsed documents.");
  }

  const payload = (await response.json()) as ParsedDocumentsResponse;
  return payload.parsedDocuments;
}

async function fetchChapters(bookId: string) {
  const response = await fetch(`/api/books/${bookId}/chapters`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load chapters.");
  }

  const payload = (await response.json()) as ChaptersResponse;
  return payload.chapters;
}

async function fetchBookStats(bookId: string) {
  const response = await fetch(`/api/books/${bookId}/stats`, { cache: "no-store" });
  const payload = (await response.json()) as BookStatsResponse;

  if (!response.ok || !payload.stats) {
    throw new Error(payload.error || "Could not load book stats.");
  }

  return payload.stats;
}

async function fetchGenerationRuns(bookId: string) {
  const response = await fetch(`/api/books/${bookId}/generation-runs`, { cache: "no-store" });
  const payload = (await response.json()) as GenerationRunsResponse;

  if (!response.ok || !payload.generationRuns) {
    throw new Error(payload.error || "Could not load generation history.");
  }

  return payload.generationRuns;
}

async function fetchStudySets(bookId: string, chapterId: string, generationRunId?: string | null) {
  const params = new URLSearchParams();
  if (generationRunId) {
    params.set("generationRunId", generationRunId);
  }
  const query = params.toString();
  const response = await fetch(`/api/books/${bookId}/chapters/${chapterId}/study-sets${query ? `?${query}` : ""}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load study sets.");
  }

  const payload = (await response.json()) as StudySetsResponse;
  return payload.studySets || [];
}

async function fetchStudyItems(bookId: string, studySetId: string) {
  const response = await fetch(`/api/books/${bookId}/study-sets/${studySetId}/items`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load generated study items.");
  }

  const payload = (await response.json()) as StudyItemsResponse;
  return payload.items || { vocabularyItems: [], multipleChoiceQuestions: [], shortAnswerQuestions: [] };
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatStatusLabel(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getChoiceLabel(index: number) {
  return String.fromCharCode(65 + index);
}

function formatLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function makeLogEntry(level: GenerationLogEntry["level"], message: string): GenerationLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message
  };
}

function omitParsedTool(current: Record<string, ParsedDocumentTool>, parsedDocumentId: string) {
  const next = { ...current };
  delete next[parsedDocumentId];
  return next;
}

function formatVocabularyDefinition(definition: string) {
  return definition
    .replace(/\s*Korean:\s*/i, " | ")
    .replace(/\s*\|\s*/g, " | ")
    .trim();
}

function renderVocabularyExample(sentence: string, term: string) {
  const trimmedTerm = term.trim();
  if (!trimmedTerm) {
    return sentence;
  }

  const lowerSentence = sentence.toLowerCase();
  const lowerTerm = trimmedTerm.toLowerCase();
  const parts = [];
  let cursor = 0;
  let matchIndex = lowerSentence.indexOf(lowerTerm);

  while (matchIndex !== -1) {
    let wordStart = matchIndex;
    let wordEnd = matchIndex + trimmedTerm.length;

    while (wordStart > 0 && /[A-Za-z'-]/.test(sentence[wordStart - 1])) {
      wordStart -= 1;
    }

    while (wordEnd < sentence.length && /[A-Za-z'-]/.test(sentence[wordEnd])) {
      wordEnd += 1;
    }

    if (wordStart > cursor) {
      parts.push(sentence.slice(cursor, wordStart));
    }

    parts.push(
      <span className="vocabulary-example-term" key={`${wordStart}-${wordEnd}`}>
        {sentence.slice(wordStart, wordEnd)}
      </span>
    );
    cursor = wordEnd;
    matchIndex = lowerSentence.indexOf(lowerTerm, cursor);
  }

  if (cursor < sentence.length) {
    parts.push(sentence.slice(cursor));
  }

  return parts.length ? parts : sentence;
}

export function BookWorkspace() {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("source");
  const [activeStudySetView, setActiveStudySetView] = useState<StudySetView>("vocabulary");
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isBookMetadataOpen, setIsBookMetadataOpen] = useState(false);
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);
  const [showSingleChapterExport, setShowSingleChapterExport] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("en");
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [sourceUploadFilename, setSourceUploadFilename] = useState("");
  const [studySetCount, setStudySetCount] = useState(0);
  const [parsedDocumentsBySource, setParsedDocumentsBySource] = useState<Record<string, ParsedDocument[]>>({});
  const [splitPreviewByParsedDocument, setSplitPreviewByParsedDocument] = useState<Record<string, SplitPreview>>({});
  const [parsedDocumentDetailById, setParsedDocumentDetailById] = useState<Record<string, ParsedDocumentDetail>>({});
  const [parsedPagesByDocumentId, setParsedPagesByDocumentId] = useState<Record<string, ParsedPageSummary[]>>({});
  const [activeParsedToolByDocumentId, setActiveParsedToolByDocumentId] = useState<Record<string, ParsedDocumentTool>>({});
  const [textSearchByParsedDocument, setTextSearchByParsedDocument] = useState<Record<string, string>>({});
  const [manualMarkersByParsedDocument, setManualMarkersByParsedDocument] = useState<Record<string, string>>({});
  const [pageStartsByParsedDocument, setPageStartsByParsedDocument] = useState<Record<string, string>>({});
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chapterDetailById, setChapterDetailById] = useState<Record<string, ChapterDetail>>({});
  const [chapterEditById, setChapterEditById] = useState<Record<string, {
    chapterNumber: string;
    title: string;
    textContent: string;
  }>>({});
  const [bookMetadataEdit, setBookMetadataEdit] = useState({
    title: "",
    author: "",
    readingLevel: ""
  });
  const [studySetsByChapterId, setStudySetsByChapterId] = useState<Record<string, StudySetSummary[]>>({});
  const [selectedStudySetIdByChapterId, setSelectedStudySetIdByChapterId] = useState<Record<string, string>>({});
  const [studyItemsByStudySetId, setStudyItemsByStudySetId] = useState<Record<string, StudyItems>>({});
  const [studySetDraftById, setStudySetDraftById] = useState<Record<string, { title: string; status: string }>>({});
  const [generationRuns, setGenerationRuns] = useState<GenerationRunSummary[]>([]);
  const [editingStudyItemId, setEditingStudyItemId] = useState<string | null>(null);
  const [studyItemDraftById, setStudyItemDraftById] = useState<Record<string, Record<string, string>>>({});
  const [bookSearch, setBookSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [extractingSourceId, setExtractingSourceId] = useState<string | null>(null);
  const [splittingParsedDocumentId, setSplittingParsedDocumentId] = useState<string | null>(null);
  const [previewingParsedDocumentId, setPreviewingParsedDocumentId] = useState<string | null>(null);
  const [loadingTextParsedDocumentId, setLoadingTextParsedDocumentId] = useState<string | null>(null);
  const [loadingPagesParsedDocumentId, setLoadingPagesParsedDocumentId] = useState<string | null>(null);
  const [loadingChapterId, setLoadingChapterId] = useState<string | null>(null);
  const [loadingStudySetsChapterId, setLoadingStudySetsChapterId] = useState<string | null>(null);
  const [loadingStudyItemsSetId, setLoadingStudyItemsSetId] = useState<string | null>(null);
  const [savingChapterId, setSavingChapterId] = useState<string | null>(null);
  const [isSavingBookMetadata, setIsSavingBookMetadata] = useState(false);
  const [savingStudyItemId, setSavingStudyItemId] = useState<string | null>(null);
  const [savingStudySetId, setSavingStudySetId] = useState<string | null>(null);
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [isGeneratingBook, setIsGeneratingBook] = useState(false);
  const [generationLog, setGenerationLog] = useState<GenerationLogEntry[]>([]);
  const [generationPlansByChapterId, setGenerationPlansByChapterId] = useState<Record<string, GenerationPlanDraft>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isStatusToastClosing, setIsStatusToastClosing] = useState(false);

  const activeBook = useMemo(
    () => books.find((book) => book.id === activeBookId) || books[0] || null,
    [activeBookId, books]
  );
  const filteredBooks = useMemo(() => {
    const query = bookSearch.trim().toLowerCase();
    if (!query) {
      return books;
    }

    return books.filter((book) =>
      book.title.toLowerCase().includes(query)
      || (book.author || "").toLowerCase().includes(query)
    );
  }, [bookSearch, books]);
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) || chapters[0] || null,
    [chapters, selectedChapterId]
  );
  const selectedChapterEdit = selectedChapter ? chapterEditById[selectedChapter.id] : null;
  const activeGenerationRun = activeBook?.activeGenerationRunId
    ? generationRuns.find((run) => run.id === activeBook.activeGenerationRunId) || null
    : null;
  const generatingRun = generationRuns.find((run) => run.status === "generating") || null;
  const selectedChapterStudySets = selectedChapter ? studySetsByChapterId[selectedChapter.id] || [] : [];
  const selectedStudySetId = selectedChapter
    ? selectedStudySetIdByChapterId[selectedChapter.id] || selectedChapterStudySets[0]?.id || null
    : null;
  const selectedStudySet = selectedStudySetId
    ? selectedChapterStudySets.find((studySet) => studySet.id === selectedStudySetId) || null
    : null;
  const selectedStudyItems = selectedStudySetId ? studyItemsByStudySetId[selectedStudySetId] : null;
  const selectedChapterWordCount = selectedChapterEdit
    ? selectedChapterEdit.textContent.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const t = (english: string, korean: string) => uiLanguage === "ko" ? korean : english;
  const formatUiStatus = (value: string) => {
    const normalized = value.toLowerCase();
    const koreanLabels: Record<string, string> = {
      draft: "초안",
      ready: "준비됨",
      reviewed: "검토됨",
      archived: "보관됨",
      failed: "실패",
      generating: "생성 중",
      completed: "완료",
      active: "활성"
    };

    return uiLanguage === "ko" ? koreanLabels[normalized] || value : formatStatusLabel(value);
  };
  const bookStats = activeBook
    ? [
      t(`${sourceFiles.length} source${sourceFiles.length === 1 ? "" : "s"}`, `소스 ${sourceFiles.length}개`),
      t(`${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`, `챕터 ${chapters.length}개`),
      t(`${studySetCount} study set${studySetCount === 1 ? "" : "s"}`, `학습 세트 ${studySetCount}개`)
    ]
    : [];
  const hasChapters = chapters.length > 0;
  const hasStudySets = studySetCount > 0;

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("topreading-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setThemeMode(storedTheme);
      return;
    }

    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setThemeMode("dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem("topreading-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("topreading-ui-language");
    if (storedLanguage === "en" || storedLanguage === "ko") {
      setUiLanguage(storedLanguage);
      return;
    }

    if (window.navigator.language.toLowerCase().startsWith("ko")) {
      setUiLanguage("ko");
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = uiLanguage === "ko" ? "ko" : "en";
    window.localStorage.setItem("topreading-ui-language", uiLanguage);
  }, [uiLanguage]);

  const generationTotals = useMemo(() => chapters.reduce(
    (totals, chapter) => {
      const draft = generationPlansByChapterId[chapter.id];
      if (draft && !draft.included) {
        return totals;
      }

      const fallback = deriveGenerationPlan(chapter.wordCount);

      return {
        vocabularyCount: totals.vocabularyCount + Math.max(0, Number(draft?.vocabularyCount ?? fallback.vocabularyCount) || 0),
        multipleChoiceCount: totals.multipleChoiceCount + Math.max(0, Number(draft?.multipleChoiceCount ?? fallback.multipleChoiceCount) || 0),
        shortAnswerCount: totals.shortAnswerCount + Math.max(0, Number(draft?.shortAnswerCount ?? fallback.shortAnswerCount) || 0)
      };
    },
    { vocabularyCount: 0, multipleChoiceCount: 0, shortAnswerCount: 0 }
  ), [chapters, generationPlansByChapterId]);
  const includedGenerationChapterCount = useMemo(() => chapters.filter((chapter) => {
    const draft = generationPlansByChapterId[chapter.id];
    if (draft && !draft.included) {
      return false;
    }

    const fallback = deriveGenerationPlan(chapter.wordCount);
    const vocabularyCount = Math.max(0, Number(draft?.vocabularyCount ?? fallback.vocabularyCount) || 0);
    const multipleChoiceCount = Math.max(0, Number(draft?.multipleChoiceCount ?? fallback.multipleChoiceCount) || 0);
    const shortAnswerCount = Math.max(0, Number(draft?.shortAnswerCount ?? fallback.shortAnswerCount) || 0);
    return vocabularyCount + multipleChoiceCount + shortAnswerCount > 0;
  }).length, [chapters, generationPlansByChapterId]);

  const pdfExportOptions: Array<{ type: PdfExportType; label: string; description: string }> = [
    { type: "vocabulary-list", label: t("Vocabulary List", "단어 목록"), description: t("Words with English and Korean meanings.", "영어와 한국어 뜻이 포함된 단어 목록입니다.") },
    { type: "vocabulary-quiz", label: t("Vocabulary Quiz", "단어 시험지"), description: t("Words with blank answer lines.", "답을 적을 빈칸이 있는 단어 시험지입니다.") },
    { type: "multiple-choice", label: t("MCQs", "객관식 문제"), description: t("Multiple-choice questions without answers.", "정답이 표시되지 않은 객관식 문제입니다.") },
    { type: "multiple-choice-concise-key", label: t("MCQ Concise Key", "객관식 간단 정답표"), description: t("Question numbers with answer letters only.", "문제 번호와 정답 선택지만 표시합니다.") },
    { type: "multiple-choice-key", label: t("MCQ Detailed Key", "객관식 상세 정답표"), description: t("Questions with choices, answers, and explanations.", "선택지, 정답, 해설을 함께 표시합니다.") },
    { type: "short-answer", label: t("Short Answer", "주관식 문제"), description: t("Short-answer prompts with writing lines.", "답안을 적을 줄이 있는 주관식 문제입니다.") },
    { type: "short-answer-key", label: t("Short Answer Key", "주관식 정답표"), description: t("Short-answer prompts with suggested answers.", "예시 답안이 포함된 주관식 정답표입니다.") }
  ];
  const exportOptionGroups = [
    {
      title: t("Vocabulary", "단어"),
      description: t("Word lists and vocabulary quiz sheets.", "단어 목록과 단어 시험지를 내보냅니다."),
      options: pdfExportOptions.filter((option) => option.type.startsWith("vocabulary"))
    },
    {
      title: t("Multiple Choice", "객관식"),
      description: t("Student handouts plus concise or detailed answer keys.", "학생용 문제지와 간단/상세 정답표를 내보냅니다."),
      options: pdfExportOptions.filter((option) => option.type.startsWith("multiple-choice"))
    },
    {
      title: t("Short Answer", "주관식"),
      description: t("Writing prompts and suggested-answer keys.", "주관식 문제와 예시 답안을 내보냅니다."),
      options: pdfExportOptions.filter((option) => option.type.startsWith("short-answer"))
    }
  ];
  const studySetStatuses = ["draft", "ready", "reviewed", "archived", "failed"];

  useEffect(() => {
    setBookMetadataEdit({
      title: activeBook?.title || "",
      author: activeBook?.author || "",
      readingLevel: activeBook?.readingLevel || ""
    });
  }, [activeBook?.id, activeBook?.title, activeBook?.author, activeBook?.readingLevel]);

  useEffect(() => {
    setGenerationPlansByChapterId((current) => {
      const next: Record<string, GenerationPlanDraft> = {};
      chapters.forEach((chapter) => {
        const existing = current[chapter.id];
        if (existing) {
          next[chapter.id] = existing;
          return;
        }

        const suggested = deriveGenerationPlan(chapter.wordCount);
        next[chapter.id] = {
          included: true,
          vocabularyCount: String(suggested.vocabularyCount),
          multipleChoiceCount: String(suggested.multipleChoiceCount),
          shortAnswerCount: String(suggested.shortAnswerCount)
        };
      });
      return next;
    });
  }, [chapters]);

  useEffect(() => {
    let isMounted = true;

    fetchBooks()
      .then((loadedBooks) => {
        if (!isMounted) {
          return;
        }

        setBooks(loadedBooks);
        setActiveBookId((current) => current || loadedBooks[0]?.id || null);
      })
      .catch((error) => {
        if (isMounted) {
          setStatusMessage(error instanceof Error ? error.message : "Could not load books.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeBook?.id) {
      setSourceFiles([]);
      setChapters([]);
      setStudySetCount(0);
      setGenerationRuns([]);
      setSelectedChapterId(null);
      return;
    }

    let isMounted = true;
    setIsLoadingSources(true);

    fetchSourceFiles(activeBook.id)
      .then((loadedSourceFiles) => {
        if (isMounted) {
          setSourceFiles(loadedSourceFiles);
          setParsedDocumentsBySource({});
          setSplitPreviewByParsedDocument({});
          setParsedDocumentDetailById({});
          setParsedPagesByDocumentId({});
          setActiveParsedToolByDocumentId({});
          setTextSearchByParsedDocument({});
          setManualMarkersByParsedDocument({});
          setPageStartsByParsedDocument({});
          setChapterDetailById({});
          setChapterEditById({});
          setStudySetsByChapterId({});
          setSelectedStudySetIdByChapterId({});
          setStudyItemsByStudySetId({});
          setGenerationRuns([]);
          setSelectedChapterId(null);
          loadedSourceFiles.forEach((sourceFile) => {
            fetchParsedDocuments(activeBook.id, sourceFile.id)
              .then((parsedDocuments) => {
                if (isMounted) {
                  setParsedDocumentsBySource((current) => ({
                    ...current,
                    [sourceFile.id]: parsedDocuments
                  }));
                }
              })
              .catch(() => {
                if (isMounted) {
                  setParsedDocumentsBySource((current) => ({
                    ...current,
                    [sourceFile.id]: []
                  }));
                }
              });
          });
        }
      })
      .catch((error) => {
        if (isMounted) {
          setStatusMessage(error instanceof Error ? error.message : "Could not load source files.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingSources(false);
        }
      });

    fetchChapters(activeBook.id)
      .then((loadedChapters) => {
        if (isMounted) {
          setChapters(loadedChapters);
          setSelectedChapterId((current) =>
            current && loadedChapters.some((chapter) => chapter.id === current)
              ? current
              : loadedChapters[0]?.id || null
          );
        }
      })
      .catch(() => {
        if (isMounted) {
          setChapters([]);
          setSelectedChapterId(null);
        }
      });

    fetchBookStats(activeBook.id)
      .then((stats) => {
        if (isMounted) {
          setStudySetCount(stats.studySetCount);
        }
      })
      .catch(() => {
        if (isMounted) {
          setStudySetCount(0);
        }
      });

    fetchGenerationRuns(activeBook.id)
      .then((loadedRuns) => {
        if (isMounted) {
          setGenerationRuns(loadedRuns);
        }
      })
      .catch(() => {
        if (isMounted) {
          setGenerationRuns([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeBook?.id]);

  useEffect(() => {
    if ((activeWorkspaceTab === "export" || activeWorkspaceTab === "study-sets") && selectedChapter) {
      void loadStudySets(selectedChapter);
    }
  }, [activeWorkspaceTab, selectedChapter?.id, activeBook?.activeGenerationRunId]);

  useEffect(() => {
    if (!activeBook?.id || !generatingRun) {
      return;
    }

    let isMounted = true;
    const syncGeneratingRun = async () => {
      try {
        const runs = await fetchGenerationRuns(activeBook.id);
        if (!isMounted) {
          return;
        }

        setGenerationRuns(runs);
        const updatedRun = runs.find((run) => run.id === generatingRun.id);
        if (!updatedRun) {
          setIsGeneratingBook(false);
          setGeneratingChapterId(null);
          return;
        }

        setGenerationLog(updatedRun.log);
        const currentChapterId = typeof updatedRun.progress.currentChapterId === "string"
          ? updatedRun.progress.currentChapterId
          : null;
        setGeneratingChapterId(updatedRun.status === "generating" ? currentChapterId : null);
        setIsGeneratingBook(updatedRun.status === "generating");

        if (updatedRun.status !== "generating") {
          setStudySetsByChapterId({});
          setSelectedStudySetIdByChapterId({});
          setStudyItemsByStudySetId({});
          await refreshActiveBookStats(activeBook.id);
          if ((activeWorkspaceTab === "study-sets" || activeWorkspaceTab === "export") && selectedChapter) {
            await loadStudySets(selectedChapter, activeBook.activeGenerationRunId);
          }
        }
      } catch {
        // Keep the existing UI state if a polling request fails.
      }
    };

    setIsGeneratingBook(true);
    void syncGeneratingRun();
    const pollId = window.setInterval(() => {
      void syncGeneratingRun();
    }, 2500);

    return () => {
      isMounted = false;
      window.clearInterval(pollId);
    };
  }, [activeBook?.id, activeBook?.activeGenerationRunId, activeWorkspaceTab, generatingRun?.id, selectedChapter?.id]);

  useEffect(() => {
    if (!selectedStudySet) {
      return;
    }

    setStudySetDraftById((current) => ({
      ...current,
      [selectedStudySet.id]: current[selectedStudySet.id] || {
        title: selectedStudySet.title,
        status: selectedStudySet.status
      }
    }));
  }, [selectedStudySet?.id, selectedStudySet?.title, selectedStudySet?.status]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    setIsStatusToastClosing(false);

    const fadeTimeoutId = window.setTimeout(() => {
      setIsStatusToastClosing(true);
    }, 8400);
    const clearTimeoutId = window.setTimeout(() => {
      setStatusMessage("");
      setIsStatusToastClosing(false);
    }, 9000);

    return () => {
      window.clearTimeout(fadeTimeoutId);
      window.clearTimeout(clearTimeoutId);
    };
  }, [statusMessage]);

  useEffect(() => {
    if (!activeBook) {
      if (activeWorkspaceTab !== "source") {
        setActiveWorkspaceTab("source");
      }
      return;
    }

    if ((activeWorkspaceTab === "chapters" || activeWorkspaceTab === "generate") && !hasChapters) {
      setActiveWorkspaceTab("source");
      return;
    }

    if ((activeWorkspaceTab === "study-sets" || activeWorkspaceTab === "export") && !hasStudySets) {
      setActiveWorkspaceTab(hasChapters ? "generate" : "source");
    }
  }, [activeBook, activeWorkspaceTab, hasChapters, hasStudySets]);

  async function handleCreateBook() {
    setIsCreating(true);
    setStatusMessage("");

    const response = await fetch("/api/books", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title: "Untitled Book" })
    });
    const payload = (await response.json().catch(() => ({}))) as CreateBookResponse;

    if (!response.ok || !payload.book) {
      setStatusMessage(payload.error || "Could not create the book.");
      setIsCreating(false);
      return;
    }

    setBooks((current) => [payload.book as BookSummary, ...current]);
    setActiveBookId(payload.book.id);
    setActiveWorkspaceTab("source");
    setStatusMessage("Book created. Use Edit Details to add author or reading level.");
    setIsCreating(false);
  }

  async function handleSourceUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeBook) {
      return;
    }

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("sourceFile");
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.[0]) {
      setStatusMessage("Choose a PDF, EPUB, or TXT file before uploading.");
      return;
    }

    setIsUploading(true);
    setStatusMessage("");

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    const response = await fetch(`/api/books/${activeBook.id}/source-files`, {
      method: "POST",
      body: formData
    });
    const payload = (await response.json().catch(() => ({}))) as UploadSourceResponse;

    if (!response.ok || !payload.sourceFile) {
      setStatusMessage(payload.error || "Could not upload the source file.");
      setIsUploading(false);
      return;
    }

    setSourceFiles((current) => [payload.sourceFile as SourceFile, ...current]);
    form.reset();
    setSourceUploadFilename("");
    setStatusMessage("Source file uploaded and saved.");
    setIsUploading(false);
  }

  async function refreshActiveBookStats(bookId = activeBook?.id) {
    if (!bookId) {
      setStudySetCount(0);
      return;
    }

    try {
      const stats = await fetchBookStats(bookId);
      setStudySetCount(stats.studySetCount);
    } catch {
      setStudySetCount(0);
    }
  }

  async function refreshGenerationRuns(bookId = activeBook?.id) {
    if (!bookId) {
      setGenerationRuns([]);
      return;
    }

    try {
      setGenerationRuns(await fetchGenerationRuns(bookId));
    } catch {
      setGenerationRuns([]);
    }
  }

  function updateBookInState(book: BookSummary) {
    setBooks((current) => current.map((item) => item.id === book.id ? book : item));
  }

  async function handleSelectActiveGenerationRun(generationRunId: string | null) {
    if (!activeBook) {
      return;
    }

    const response = await fetch(`/api/books/${activeBook.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: activeBook.title,
        author: activeBook.author,
        readingLevel: activeBook.readingLevel,
        activeGenerationRunId: generationRunId
      })
    });
    const payload = (await response.json().catch(() => ({}))) as BookResponse;

    if (!response.ok || !payload.book) {
      setStatusMessage(payload.error || "Could not select generation run.");
      return;
    }

    updateBookInState(payload.book);
    setStudySetsByChapterId({});
    setSelectedStudySetIdByChapterId({});
    setStudyItemsByStudySetId({});
    setStatusMessage(generationRunId ? "Active generation run selected." : "Using latest study sets across all runs.");

    if ((activeWorkspaceTab === "study-sets" || activeWorkspaceTab === "export") && selectedChapter) {
      void loadStudySets(selectedChapter, generationRunId);
    }
  }

  async function handleSaveBookMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeBook) {
      return;
    }

    setIsSavingBookMetadata(true);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(bookMetadataEdit)
    });
    const payload = (await response.json().catch(() => ({}))) as BookResponse;

    if (!response.ok || !payload.book) {
      setStatusMessage(payload.error || "Could not save book details.");
      setIsSavingBookMetadata(false);
      return;
    }

    updateBookInState(payload.book);
    setStatusMessage("Book details saved.");
    setIsBookMetadataOpen(false);
    setIsSavingBookMetadata(false);
  }

  async function handleDeleteBook() {
    if (!activeBook || !window.confirm(`Delete "${activeBook.title}" and all of its files, chapters, and study sets?`)) {
      return;
    }

    setDeletingId(activeBook.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatusMessage(payload.error || "Could not delete book.");
      setDeletingId(null);
      return;
    }

    const remaining = books.filter((book) => book.id !== activeBook.id);
    setBooks(remaining);
    setActiveBookId(remaining[0]?.id || null);
    setSourceFiles([]);
    setParsedDocumentsBySource({});
    setSplitPreviewByParsedDocument({});
    setParsedDocumentDetailById({});
    setParsedPagesByDocumentId({});
    setActiveParsedToolByDocumentId({});
    setChapters([]);
    setSelectedChapterId(null);
    setChapterDetailById({});
    setChapterEditById({});
    setStudySetsByChapterId({});
    setSelectedStudySetIdByChapterId({});
    setStudyItemsByStudySetId({});
    setActiveWorkspaceTab(remaining[0] ? "source" : "source");
    setStatusMessage("Book deleted.");
    setDeletingId(null);
  }

  async function handleExtractSource(sourceFile: SourceFile) {
    if (!activeBook) {
      return;
    }

    setExtractingSourceId(sourceFile.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/source-files/${sourceFile.id}/parsed-documents`, {
      method: "POST"
    });
    const payload = (await response.json().catch(() => ({}))) as ExtractResponse;

    if (!response.ok || !payload.parsedDocument) {
      setStatusMessage(payload.error || "Could not extract text from this source file.");
      setExtractingSourceId(null);
      return;
    }

    setParsedDocumentsBySource((current) => ({
      ...current,
      [sourceFile.id]: [payload.parsedDocument as ParsedDocument, ...(current[sourceFile.id] || [])]
    }));
    setStatusMessage("Source text extracted and saved.");
    setExtractingSourceId(null);
  }

  function parseManualMarkers(value: string) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("|");
        if (separatorIndex < 0) {
          return { marker: line };
        }

        return {
          marker: line.slice(0, separatorIndex).trim(),
          title: line.slice(separatorIndex + 1).trim()
        };
      })
      .filter((item) => item.marker);
  }

  function parsePageStarts(value: string) {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("|");
        const pagePart = separatorIndex < 0 ? line : line.slice(0, separatorIndex);
        const titlePart = separatorIndex < 0 ? "" : line.slice(separatorIndex + 1);

        return {
          pageNumber: Number(pagePart.trim()),
          title: titlePart.trim() || undefined
        };
      })
      .filter((item) => Number.isInteger(item.pageNumber) && item.pageNumber > 0);
  }

  async function handleCreateChapters(parsedDocument: ParsedDocument, markersText = "", pageStartsText = "") {
    if (!activeBook) {
      return;
    }

    setSplittingParsedDocumentId(parsedDocument.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/chapters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        parsedDocumentId: parsedDocument.id,
        markers: parseManualMarkers(markersText),
        pageStarts: parsePageStarts(pageStartsText)
      })
    });
    const payload = (await response.json().catch(() => ({}))) as ChaptersResponse;

    if (!response.ok || !payload.chapters) {
      setStatusMessage(payload.error || "Could not create chapters.");
      setSplittingParsedDocumentId(null);
      return;
    }

    setChapters(payload.chapters);
    setSelectedChapterId(payload.chapters[0]?.id || null);
    setChapterDetailById({});
    setChapterEditById({});
    setStudySetsByChapterId({});
    setSelectedStudySetIdByChapterId({});
    setStudyItemsByStudySetId({});
    setActiveWorkspaceTab("chapters");
    setStatusMessage(`Created ${payload.chapters.length} chapter${payload.chapters.length === 1 ? "" : "s"}.`);
    setSplittingParsedDocumentId(null);
  }

  async function handleLoadPages(parsedDocument: ParsedDocument) {
    if (!activeBook) {
      return;
    }

    if (parsedPagesByDocumentId[parsedDocument.id]) {
      setActiveParsedToolByDocumentId((current) => {
        const isOpen = current[parsedDocument.id] === "pages";
        return isOpen ? omitParsedTool(current, parsedDocument.id) : { ...current, [parsedDocument.id]: "pages" };
      });
      return;
    }

    setLoadingPagesParsedDocumentId(parsedDocument.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/parsed-documents/${parsedDocument.id}/pages`, {
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => ({}))) as ParsedPagesResponse;

    if (!response.ok || !payload.pages) {
      setStatusMessage(payload.error || "Could not load parsed pages. Re-extract this source if it was parsed before page storage was added.");
      setLoadingPagesParsedDocumentId(null);
      return;
    }

    setParsedPagesByDocumentId((current) => ({
      ...current,
      [parsedDocument.id]: payload.pages as ParsedPageSummary[]
    }));
    setActiveParsedToolByDocumentId((current) => ({
      ...current,
      [parsedDocument.id]: "pages"
    }));
    setLoadingPagesParsedDocumentId(null);
  }

  async function handleLoadParsedText(parsedDocument: ParsedDocument) {
    if (!activeBook) {
      return;
    }

    if (parsedDocumentDetailById[parsedDocument.id]) {
      setActiveParsedToolByDocumentId((current) => {
        const isOpen = current[parsedDocument.id] === "inspect";
        return isOpen ? omitParsedTool(current, parsedDocument.id) : { ...current, [parsedDocument.id]: "inspect" };
      });
      return;
    }

    setLoadingTextParsedDocumentId(parsedDocument.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/parsed-documents/${parsedDocument.id}`, {
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => ({}))) as ParsedDocumentDetailResponse;

    if (!response.ok || !payload.parsedDocument) {
      setStatusMessage(payload.error || "Could not load extracted text.");
      setLoadingTextParsedDocumentId(null);
      return;
    }

    setParsedDocumentDetailById((current) => ({
      ...current,
      [parsedDocument.id]: payload.parsedDocument as ParsedDocumentDetail
    }));
    setActiveParsedToolByDocumentId((current) => ({
      ...current,
      [parsedDocument.id]: "inspect"
    }));
    setLoadingTextParsedDocumentId(null);
  }

  function getSearchPreview(parsedDocument: ParsedDocument) {
    const detail = parsedDocumentDetailById[parsedDocument.id];
    const search = (textSearchByParsedDocument[parsedDocument.id] || "").trim();
    if (!detail || !search) {
      return null;
    }

    const index = detail.textContent.toLowerCase().indexOf(search.toLowerCase());
    if (index < 0) {
      return { found: false, text: "No matches found." };
    }

    return {
      found: true,
      text: detail.textContent.slice(Math.max(0, index - 240), Math.min(detail.textContent.length, index + search.length + 360))
    };
  }

  async function handlePreviewSplit(parsedDocument: ParsedDocument) {
    if (!activeBook) {
      return;
    }

    if (splitPreviewByParsedDocument[parsedDocument.id]) {
      setActiveParsedToolByDocumentId((current) => {
        const isOpen = current[parsedDocument.id] === "preview";
        return isOpen ? omitParsedTool(current, parsedDocument.id) : { ...current, [parsedDocument.id]: "preview" };
      });
      return;
    }

    setPreviewingParsedDocumentId(parsedDocument.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/parsed-documents/${parsedDocument.id}/split-preview`, {
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => ({}))) as SplitPreviewResponse;

    if (!response.ok || !payload.preview) {
      setStatusMessage(payload.error || "Could not preview the chapter split.");
      setPreviewingParsedDocumentId(null);
      return;
    }

    setSplitPreviewByParsedDocument((current) => ({
      ...current,
      [parsedDocument.id]: payload.preview as SplitPreview
    }));
    setActiveParsedToolByDocumentId((current) => ({
      ...current,
      [parsedDocument.id]: "preview"
    }));
    setStatusMessage(
      payload.preview.acceptedCandidates
        ? `Found ${payload.preview.acceptedCandidates} accepted chapter heading candidates.`
        : "No reliable chapter headings found. This book likely needs manual splitting or a broader rule."
    );
    setPreviewingParsedDocumentId(null);
  }

  async function handleDeleteSourceFile(sourceFile: SourceFile) {
    if (!activeBook || !window.confirm(`Delete ${sourceFile.originalFilename}? This also removes extracted text and chapters from this source.`)) {
      return;
    }

    setDeletingId(sourceFile.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/source-files`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ sourceFileId: sourceFile.id })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatusMessage(payload.error || "Could not delete the source file.");
      setDeletingId(null);
      return;
    }

    setSourceFiles((current) => current.filter((item) => item.id !== sourceFile.id));
    setParsedDocumentsBySource((current) => {
      const next = { ...current };
      delete next[sourceFile.id];
      return next;
    });
    setChapters([]);
    setStudySetCount(0);
    setStatusMessage("Source file deleted.");
    setDeletingId(null);
  }

  async function handleDeleteParsedDocument(sourceFile: SourceFile, parsedDocument: ParsedDocument) {
    if (!activeBook || !window.confirm("Delete this extracted text? Chapters created from it will also be removed.")) {
      return;
    }

    setDeletingId(parsedDocument.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/source-files/${sourceFile.id}/parsed-documents`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ parsedDocumentId: parsedDocument.id })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatusMessage(payload.error || "Could not delete extracted text.");
      setDeletingId(null);
      return;
    }

    setParsedDocumentsBySource((current) => ({
      ...current,
      [sourceFile.id]: (current[sourceFile.id] || []).filter((item) => item.id !== parsedDocument.id)
    }));
    setSplitPreviewByParsedDocument((current) => {
      const next = { ...current };
      delete next[parsedDocument.id];
      return next;
    });
    setActiveParsedToolByDocumentId((current) => omitParsedTool(current, parsedDocument.id));
    setChapters((current) => current.filter((chapter) => chapter.parsedDocumentId !== parsedDocument.id));
    setSelectedChapterId((current) => {
      const remaining = chapters.filter((chapter) => chapter.parsedDocumentId !== parsedDocument.id);
      return current && remaining.some((chapter) => chapter.id === current) ? current : remaining[0]?.id || null;
    });
    setParsedDocumentDetailById((current) => {
      const next = { ...current };
      delete next[parsedDocument.id];
      return next;
    });
    setParsedPagesByDocumentId((current) => {
      const next = { ...current };
      delete next[parsedDocument.id];
      return next;
    });
    void refreshActiveBookStats();
    setStatusMessage("Extracted text deleted.");
    setDeletingId(null);
  }

  function handleCloseParsedTool(parsedDocumentId: string) {
    setActiveParsedToolByDocumentId((current) => omitParsedTool(current, parsedDocumentId));
  }

  async function handleClearChapters() {
    if (!activeBook || chapters.length === 0 || !window.confirm("Delete all chapters for this book?")) {
      return;
    }

    setDeletingId("chapters");
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/chapters`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatusMessage(payload.error || "Could not delete chapters.");
      setDeletingId(null);
      return;
    }

    setChapters([]);
    setSelectedChapterId(null);
    setChapterDetailById({});
    setChapterEditById({});
    setStudySetsByChapterId({});
    setSelectedStudySetIdByChapterId({});
    setStudyItemsByStudySetId({});
    setStudySetCount(0);
    setStatusMessage("Chapters cleared.");
    setDeletingId(null);
  }

  async function loadStudyItems(studySetId: string) {
    if (!activeBook || studyItemsByStudySetId[studySetId]) {
      return;
    }

    setLoadingStudyItemsSetId(studySetId);

    try {
      const items = await fetchStudyItems(activeBook.id, studySetId);
      setStudyItemsByStudySetId((current) => ({
        ...current,
        [studySetId]: items
      }));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not load generated study items.");
    } finally {
      setLoadingStudyItemsSetId(null);
    }
  }

  async function loadStudySets(chapter: ChapterSummary, generationRunId = activeBook?.activeGenerationRunId) {
    if (!activeBook) {
      return;
    }

    setLoadingStudySetsChapterId(chapter.id);

    try {
      const studySets = await fetchStudySets(activeBook.id, chapter.id, generationRunId);
      setStudySetsByChapterId((current) => ({
        ...current,
        [chapter.id]: studySets
      }));

      const currentSelectedId = selectedStudySetIdByChapterId[chapter.id];
      const selectedId = currentSelectedId && studySets.some((studySet) => studySet.id === currentSelectedId)
        ? currentSelectedId
        : studySets[0]?.id;
      if (selectedId) {
        setSelectedStudySetIdByChapterId((current) => ({
          ...current,
          [chapter.id]: selectedId
        }));
        await loadStudyItems(selectedId);
      } else {
        setSelectedStudySetIdByChapterId((current) => {
          const next = { ...current };
          delete next[chapter.id];
          return next;
        });
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not load study sets.");
    } finally {
      setLoadingStudySetsChapterId(null);
    }
  }

  async function handleSelectChapter(chapter: ChapterSummary) {
    if (!activeBook) {
      return;
    }

    setSelectedChapterId(chapter.id);
    void loadStudySets(chapter);

    if (chapterDetailById[chapter.id]) {
      return;
    }

    setLoadingChapterId(chapter.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/chapters/${chapter.id}`, {
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => ({}))) as ChapterDetailResponse;

    if (!response.ok || !payload.chapter) {
      setStatusMessage(payload.error || "Could not load this chapter.");
      setLoadingChapterId(null);
      return;
    }

    setChapterDetailById((current) => ({
      ...current,
      [chapter.id]: payload.chapter as ChapterDetail
    }));
    setChapterEditById((current) => ({
      ...current,
      [chapter.id]: {
        chapterNumber: String(payload.chapter?.chapterNumber || chapter.chapterNumber),
        title: payload.chapter?.title || "",
        textContent: payload.chapter?.textContent || ""
      }
    }));
    setLoadingChapterId(null);
  }

  async function handleSelectStudySet(chapterId: string, studySetId: string) {
    setSelectedStudySetIdByChapterId((current) => ({
      ...current,
      [chapterId]: studySetId
    }));
    await loadStudyItems(studySetId);
  }

  function handleChapterEdit(chapterId: string, updates: Partial<{ chapterNumber: string; title: string; textContent: string }>) {
    setChapterEditById((current) => ({
      ...current,
      [chapterId]: {
        chapterNumber: current[chapterId]?.chapterNumber || "",
        title: current[chapterId]?.title || "",
        textContent: current[chapterId]?.textContent || "",
        ...updates
      }
    }));
  }

  async function handleSaveChapter(chapter: ChapterSummary) {
    if (!activeBook) {
      return;
    }

    const edit = chapterEditById[chapter.id];
    if (!edit) {
      return;
    }

    setSavingChapterId(chapter.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/chapters/${chapter.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chapterNumber: Number(edit.chapterNumber),
        title: edit.title,
        textContent: edit.textContent
      })
    });
    const payload = (await response.json().catch(() => ({}))) as ChapterUpdateResponse;

    if (!response.ok || !payload.chapter) {
      setStatusMessage(payload.error || "Could not save this chapter.");
      setSavingChapterId(null);
      return;
    }

    setChapters((current) =>
      current
        .map((item) => item.id === chapter.id ? (payload.chapter as ChapterSummary) : item)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.chapterNumber - b.chapterNumber)
    );
    setChapterDetailById((current) => ({
      ...current,
      [chapter.id]: {
        ...(current[chapter.id] || (payload.chapter as ChapterDetail)),
        ...(payload.chapter as ChapterSummary),
        textContent: edit.textContent
      }
    }));
    setStatusMessage("Chapter saved.");
    setSavingChapterId(null);
  }

  async function handleDeleteChapter(chapter: ChapterSummary) {
    if (!activeBook || !window.confirm(`Delete Chapter ${chapter.chapterNumber}?`)) {
      return;
    }

    setDeletingId(chapter.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/chapters/${chapter.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatusMessage(payload.error || "Could not delete chapter.");
      setDeletingId(null);
      return;
    }

    const remaining = chapters.filter((item) => item.id !== chapter.id);
    setChapters(remaining);
    setSelectedChapterId((current) => current === chapter.id ? remaining[0]?.id || null : current);
    setChapterDetailById((current) => {
      const next = { ...current };
      delete next[chapter.id];
      return next;
    });
    setChapterEditById((current) => {
      const next = { ...current };
      delete next[chapter.id];
      return next;
    });
    setStudySetsByChapterId((current) => {
      const next = { ...current };
      delete next[chapter.id];
      return next;
    });
    setSelectedStudySetIdByChapterId((current) => {
      const next = { ...current };
      delete next[chapter.id];
      return next;
    });
    void refreshActiveBookStats();
    setStatusMessage("Chapter deleted.");
    setDeletingId(null);
  }

  function openGenerationModal() {
    if (!activeBook || chapters.length === 0 || isGeneratingBook) {
      return;
    }

    setIsGenerationModalOpen(true);
  }

  async function handleGenerateBook() {
    if (!activeBook || chapters.length === 0 || isGeneratingBook) {
      return;
    }

    const chaptersToGenerate = chapters.filter(isGenerationChapterIncluded);
    if (chaptersToGenerate.length === 0) {
      setStatusMessage("Select at least one chapter with a nonzero generation count.");
      return;
    }

    const runConfig = {
      chapters: chaptersToGenerate.map((chapter) => ({
        chapterId: chapter.id,
        chapterNumber: chapter.chapterNumber,
        wordCount: chapter.wordCount,
        plan: getGenerationPlanPayload(chapter)
      }))
    };
    const createRunResponse = await fetch(`/api/books/${activeBook.id}/generation-runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: `${activeBook.title} - ${formatDateTime(new Date().toISOString())}`,
        config: runConfig
      })
    });
    const createRunPayload = (await createRunResponse.json().catch(() => ({}))) as GenerationRunsResponse;

    if (!createRunResponse.ok || !createRunPayload.generationRun) {
      setStatusMessage(createRunPayload.error || "Could not create generation run.");
      return;
    }

    const generationRun = createRunPayload.generationRun;
    setGenerationRuns((current) => [generationRun, ...current]);
    await handleSelectActiveGenerationRun(generationRun.id);
    setIsGenerationModalOpen(false);
    setIsGeneratingBook(true);
    const initialLog = [
      makeLogEntry("info", `Starting OpenAI generation for "${activeBook.title}".`),
      makeLogEntry("info", `Queued ${chaptersToGenerate.length} chapter${chaptersToGenerate.length === 1 ? "" : "s"}.`)
    ];
    setGenerationLog(initialLog);
    setStatusMessage("");

    const syncRunProgress = async () => {
      try {
        const runs = await fetchGenerationRuns(activeBook.id);
        setGenerationRuns(runs);
        const currentRun = runs.find((run) => run.id === generationRun.id);
        if (currentRun) {
          setGenerationLog(currentRun.log);
          const currentChapterId = typeof currentRun.progress.currentChapterId === "string"
            ? currentRun.progress.currentChapterId
            : null;
          setGeneratingChapterId(currentChapterId);
        }
      } catch {
        // Keep the visible log we already have if a polling request misses.
      }
    };
    const pollId = window.setInterval(() => {
      void syncRunProgress();
    }, 1500);

    try {
      const response = await fetch(`/api/books/${activeBook.id}/generation-runs/${generationRun.id}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const payload = (await response.json().catch(() => ({}))) as GenerationRunsResponse;

      if (!response.ok || !payload.generationRun) {
        setStatusMessage(payload.error || "Book generation stopped.");
        await syncRunProgress();
        return;
      }

      setGenerationRuns((current) => current.map((run) => run.id === payload.generationRun?.id ? payload.generationRun : run));
      setGenerationLog(payload.generationRun.log);
      setStatusMessage("Generation completed.");
    } finally {
      window.clearInterval(pollId);
      setGeneratingChapterId(null);
      setIsGeneratingBook(false);
      setStudySetsByChapterId({});
      setSelectedStudySetIdByChapterId({});
      setStudyItemsByStudySetId({});
      await refreshGenerationRuns(activeBook.id);
      await refreshActiveBookStats(activeBook.id);
      if ((activeWorkspaceTab === "study-sets" || activeWorkspaceTab === "export") && selectedChapter) {
        await loadStudySets(selectedChapter, generationRun.id);
      }
    }
  }

  async function handleDeleteStudySet(chapter: ChapterSummary, studySet: StudySetSummary) {
    if (!activeBook || !window.confirm(`Delete study set "${studySet.title}"? Generated items in this set will also be removed.`)) {
      return;
    }

    setDeletingId(studySet.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/study-sets/${studySet.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatusMessage(payload.error || "Could not delete study set.");
      setDeletingId(null);
      return;
    }

    const remaining = (studySetsByChapterId[chapter.id] || []).filter((item) => item.id !== studySet.id);
    setStudySetsByChapterId((current) => ({
      ...current,
      [chapter.id]: remaining
    }));
    setSelectedStudySetIdByChapterId((current) => {
      const next = { ...current };
      if (next[chapter.id] === studySet.id) {
        if (remaining[0]?.id) {
          next[chapter.id] = remaining[0].id;
        } else {
          delete next[chapter.id];
        }
      }
      return next;
    });
    setStudyItemsByStudySetId((current) => {
      const next = { ...current };
      delete next[studySet.id];
      return next;
    });
    if (remaining[0]?.id) {
      await loadStudyItems(remaining[0].id);
    }
    setStudySetCount((current) => Math.max(0, current - 1));
    setStatusMessage("Study set deleted.");
    setDeletingId(null);
  }

  async function handleDeleteGenerationRun(run: GenerationRunSummary) {
    if (!activeBook || !window.confirm(`Delete generation run "${run.name}" and all of its generated study sets?`)) {
      return;
    }

    setDeletingId(run.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/generation-runs/${run.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatusMessage(payload.error || "Could not delete generation run.");
      setDeletingId(null);
      return;
    }

    const remainingRuns = generationRuns.filter((item) => item.id !== run.id);
    setGenerationRuns(remainingRuns);
    if (activeBook.activeGenerationRunId === run.id) {
      await handleSelectActiveGenerationRun(remainingRuns[0]?.id || null);
    }
    setStudySetsByChapterId({});
    setSelectedStudySetIdByChapterId({});
    setStudyItemsByStudySetId({});
    await refreshActiveBookStats(activeBook.id);
    setStatusMessage("Generation run deleted.");
    setDeletingId(null);
  }

  function updateStudySetDraft(studySetId: string, updates: Partial<{ title: string; status: string }>) {
    const studySet = Object.values(studySetsByChapterId).flat().find((item) => item.id === studySetId);
    setStudySetDraftById((current) => ({
      ...current,
      [studySetId]: {
        title: current[studySetId]?.title || studySet?.title || "",
        status: current[studySetId]?.status || studySet?.status || "ready",
        ...updates
      }
    }));
  }

  async function handleSaveStudySet(studySet: StudySetSummary) {
    if (!activeBook) {
      return;
    }

    const draft = studySetDraftById[studySet.id] || { title: studySet.title, status: studySet.status };
    const title = draft.title.trim();
    if (!title) {
      setStatusMessage("Study set name cannot be blank.");
      return;
    }

    setSavingStudySetId(studySet.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/study-sets/${studySet.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        status: draft.status
      })
    });
    const payload = (await response.json().catch(() => ({}))) as { studySet?: StudySetSummary; error?: string };

    if (!response.ok || !payload.studySet) {
      setStatusMessage(payload.error || "Could not save study set.");
      setSavingStudySetId(null);
      return;
    }

    const updated = payload.studySet;
    setStudySetsByChapterId((current) => ({
      ...current,
      [updated.chapterId]: (current[updated.chapterId] || []).map((item) => item.id === updated.id ? updated : item)
    }));
    setStudySetDraftById((current) => ({
      ...current,
      [updated.id]: {
        title: updated.title,
        status: updated.status
      }
    }));
    setStatusMessage("Study set saved.");
    setSavingStudySetId(null);
  }

  function handleExportStudySet(type: PdfExportType, format: ExportFileFormat) {
    if (!activeBook || !selectedStudySet) {
      setStatusMessage("Select a study set before exporting.");
      return;
    }

    const url = `/api/books/${activeBook.id}/study-sets/${selectedStudySet.id}/export?type=${encodeURIComponent(type)}&format=${format}`;
    window.location.href = url;
    setStatusMessage(`Preparing ${format.toUpperCase()} export.`);
  }

  function handleExportBook(type: PdfExportType, format: ExportFileFormat) {
    if (!activeBook) {
      setStatusMessage("Select a book before exporting.");
      return;
    }

    const params = new URLSearchParams({ type, format });
    if (activeBook.activeGenerationRunId) {
      params.set("generationRunId", activeBook.activeGenerationRunId);
    }
    const url = `/api/books/${activeBook.id}/export?${params.toString()}`;
    window.location.href = url;
    setStatusMessage(`Preparing whole-book ${format.toUpperCase()} export.`);
  }

  function startEditingStudyItem(kind: StudyItemKind, item: VocabularyItem | MultipleChoiceQuestion | ShortAnswerQuestion) {
    setEditingStudyItemId(item.id);

    if (kind === "vocabulary") {
      const vocabulary = item as VocabularyItem;
      setStudyItemDraftById((current) => ({
        ...current,
        [item.id]: {
          term: vocabulary.term,
          definition: vocabulary.definition,
          contextSentence: vocabulary.contextSentence || "",
          status: vocabulary.status
        }
      }));
      return;
    }

    if (kind === "multiple-choice") {
      const question = item as MultipleChoiceQuestion;
      setStudyItemDraftById((current) => ({
        ...current,
        [item.id]: {
          questionText: question.questionText,
          choices: question.choices.join("\n"),
          correctChoiceIndex: String(question.correctChoiceIndex),
          explanation: question.explanation || "",
          status: question.status
        }
      }));
      return;
    }

    const question = item as ShortAnswerQuestion;
    setStudyItemDraftById((current) => ({
      ...current,
      [item.id]: {
        questionText: question.questionText,
        suggestedAnswer: question.suggestedAnswer,
        rubric: question.rubric || "",
        status: question.status
      }
    }));
  }

  function updateStudyItemDraft(itemId: string, updates: Record<string, string>) {
    setStudyItemDraftById((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || {}),
        ...updates
      }
    }));
  }

  function buildStudyItemPayload(kind: StudyItemKind, draft: Record<string, string>) {
    if (kind === "vocabulary") {
      return {
        term: draft.term || "",
        definition: draft.definition || "",
        contextSentence: draft.contextSentence || null,
        status: draft.status || "draft"
      };
    }

    if (kind === "multiple-choice") {
      return {
        questionText: draft.questionText || "",
        choices: (draft.choices || "").split(/\r?\n/).map((choice) => choice.trim()).filter(Boolean),
        correctChoiceIndex: Number(draft.correctChoiceIndex || 0),
        explanation: draft.explanation || null,
        status: draft.status || "draft"
      };
    }

    return {
      questionText: draft.questionText || "",
      suggestedAnswer: draft.suggestedAnswer || "",
      rubric: draft.rubric || null,
      status: draft.status || "draft"
    };
  }

  function getGenerationPlanPayload(chapter: ChapterSummary) {
    const draft = generationPlansByChapterId[chapter.id];
    const fallback = deriveGenerationPlan(chapter.wordCount);

    return {
      vocabularyCount: Math.max(0, Number(draft?.vocabularyCount ?? fallback.vocabularyCount) || 0),
      multipleChoiceCount: Math.max(0, Number(draft?.multipleChoiceCount ?? fallback.multipleChoiceCount) || 0),
      shortAnswerCount: Math.max(0, Number(draft?.shortAnswerCount ?? fallback.shortAnswerCount) || 0)
    };
  }

  function isGenerationChapterIncluded(chapter: ChapterSummary) {
    const draft = generationPlansByChapterId[chapter.id];
    if (draft && !draft.included) {
      return false;
    }

    const plan = getGenerationPlanPayload(chapter);
    return plan.vocabularyCount + plan.multipleChoiceCount + plan.shortAnswerCount > 0;
  }

  function updateGenerationPlan(chapterId: string, field: keyof Omit<GenerationPlanDraft, "included">, value: string) {
    setGenerationPlansByChapterId((current) => ({
      ...current,
      [chapterId]: {
        included: current[chapterId]?.included ?? true,
        vocabularyCount: current[chapterId]?.vocabularyCount || "0",
        multipleChoiceCount: current[chapterId]?.multipleChoiceCount || "0",
        shortAnswerCount: current[chapterId]?.shortAnswerCount || "0",
        [field]: value
      }
    }));
  }

  function toggleGenerationChapter(chapter: ChapterSummary, included: boolean) {
    const suggested = deriveGenerationPlan(chapter.wordCount);
    setGenerationPlansByChapterId((current) => ({
      ...current,
      [chapter.id]: {
        included,
        vocabularyCount: current[chapter.id]?.vocabularyCount || String(suggested.vocabularyCount),
        multipleChoiceCount: current[chapter.id]?.multipleChoiceCount || String(suggested.multipleChoiceCount),
        shortAnswerCount: current[chapter.id]?.shortAnswerCount || String(suggested.shortAnswerCount)
      }
    }));
  }

  function resetGenerationPlans() {
    const next: Record<string, GenerationPlanDraft> = {};
    chapters.forEach((chapter) => {
      const suggested = deriveGenerationPlan(chapter.wordCount);
      next[chapter.id] = {
        included: true,
        vocabularyCount: String(suggested.vocabularyCount),
        multipleChoiceCount: String(suggested.multipleChoiceCount),
        shortAnswerCount: String(suggested.shortAnswerCount)
      };
    });
    setGenerationPlansByChapterId(next);
  }

  async function handleSaveStudyItem(kind: StudyItemKind, itemId: string) {
    if (!activeBook || !selectedStudySetId) {
      return;
    }

    const draft = studyItemDraftById[itemId] || {};
    setSavingStudyItemId(itemId);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/study-sets/${selectedStudySetId}/items/${kind}/${itemId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildStudyItemPayload(kind, draft))
    });
    const payload = (await response.json().catch(() => ({}))) as StudyItemsResponse;

    if (!response.ok || !payload.items) {
      setStatusMessage(payload.error || "Could not save generated item.");
      setSavingStudyItemId(null);
      return;
    }

    setStudyItemsByStudySetId((current) => ({
      ...current,
      [selectedStudySetId]: payload.items as StudyItems
    }));
    setEditingStudyItemId(null);
    setStatusMessage("Generated item saved.");
    setSavingStudyItemId(null);
  }

  async function handleDeleteStudyItem(kind: StudyItemKind, itemId: string) {
    if (!activeBook || !selectedStudySetId || !window.confirm("Delete this generated item?")) {
      return;
    }

    setDeletingId(itemId);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/study-sets/${selectedStudySetId}/items/${kind}/${itemId}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setStatusMessage(payload.error || "Could not delete generated item.");
      setDeletingId(null);
      return;
    }

    const items = await fetchStudyItems(activeBook.id, selectedStudySetId);
    setStudyItemsByStudySetId((current) => ({
      ...current,
      [selectedStudySetId]: items
    }));
    setEditingStudyItemId((current) => current === itemId ? null : current);
    setStatusMessage("Generated item deleted.");
    setDeletingId(null);
  }

  return (
    <main className={`app-shell ${isLibraryCollapsed ? "library-collapsed" : ""}`}>
      <aside className="library-panel">
        <div className="library-panel-top">
          <div className="brand-block">
            <span className="brand-mark">TR</span>
            <div>
              <h1>TopReading</h1>
              <p>{t("Study Guide Studio", "학습지 제작 도구")}</p>
            </div>
          </div>
          <button
            className="collapse-sidebar-button"
            type="button"
            aria-label={isLibraryCollapsed ? t("Expand library sidebar", "도서 목록 펼치기") : t("Collapse library sidebar", "도서 목록 접기")}
            onClick={() => setIsLibraryCollapsed((current) => !current)}
          >
            {isLibraryCollapsed ? ">" : "<"}
          </button>
        </div>

        {!isLibraryCollapsed ? (
          <>
            <button className="primary-action" type="button" disabled={isCreating} onClick={handleCreateBook}>
              {isCreating ? t("Creating...", "생성 중...") : t("New Book", "새 책")}
            </button>

            <label className="book-search">
              {t("Search library", "도서 검색")}
              <input
                value={bookSearch}
                onChange={(event) => setBookSearch(event.target.value)}
                placeholder={t("Title or author", "제목 또는 저자")}
              />
            </label>

            <section className="library-list" aria-label={t("Book library", "도서 목록")}>
              {isLoading ? <p className="muted-text">{t("Loading library...", "도서 목록을 불러오는 중...")}</p> : null}
              {!isLoading && books.length === 0 ? <p className="muted-text">{t("No books yet.", "아직 등록된 책이 없습니다.")}</p> : null}
              {!isLoading && books.length > 0 && filteredBooks.length === 0 ? <p className="muted-text">{t("No matching books.", "검색 결과가 없습니다.")}</p> : null}
              {filteredBooks.map((book) => (
                <button
                  className={`book-row ${book.id === activeBook?.id ? "active" : ""}`}
                  key={book.id}
                  type="button"
                  onClick={() => setActiveBookId(book.id)}
                >
                  <span className="book-row-title">{book.title}</span>
                  <small className={`book-status-badge status-${book.status}`}>{book.status}</small>
                </button>
              ))}
            </section>
          </>
        ) : null}
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="workspace-title-block">
            <p className="eyebrow">{t("Book Workspace", "책 작업 공간")}</p>
            <h2>{activeBook?.title || t("Create a book to begin", "책을 만들어 시작하세요")}</h2>
            <p className="workspace-subtitle">
              {activeBook?.author || t("Upload a source file, review chapters, then generate a study set.", "소스 파일을 업로드하고, 챕터를 검토한 뒤 학습 세트를 생성하세요.")}
              {activeBook?.readingLevel ? ` · ${activeBook.readingLevel}` : ""}
            </p>
            {activeBook ? (
              <div className="workspace-stat-row" aria-label="Book status summary">
                {bookStats.map((stat) => (
                  <span key={stat}>{stat}</span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="workspace-header-actions">
            <div className="workspace-utility-actions">
              <button
                className="theme-toggle"
                type="button"
                aria-pressed={themeMode === "dark"}
                onClick={() => setThemeMode((current) => current === "dark" ? "light" : "dark")}
              >
                {themeMode === "dark" ? t("Light Mode", "라이트 모드") : t("Dark Mode", "다크 모드")}
              </button>
              <button
                className="language-toggle"
                type="button"
                aria-pressed={uiLanguage === "ko"}
                onClick={() => setUiLanguage((current) => current === "ko" ? "en" : "ko")}
              >
                {uiLanguage === "ko" ? "English" : "한국어"}
              </button>
              {activeBook ? (
                <button type="button" onClick={() => setIsBookMetadataOpen(true)}>
                  {t("Edit Details", "책 정보 수정")}
                </button>
              ) : null}
            </div>
            <div className="workspace-tabs" role="tablist" aria-label={t("Book workspace sections", "책 작업 섹션")}>
              <button
                className={activeWorkspaceTab === "source" ? "active" : ""}
                type="button"
                disabled={!activeBook}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : t("Manage source files.", "소스 파일을 관리합니다.")}
                onClick={() => setActiveWorkspaceTab("source")}
              >
                {t("Source", "소스")}
              </button>
              <button
                className={activeWorkspaceTab === "chapters" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasChapters}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : !hasChapters ? t("Create chapters from a source file first.", "먼저 소스 파일에서 챕터를 만드세요.") : t("Review and edit chapters.", "챕터를 검토하고 수정합니다.")}
                onClick={() => setActiveWorkspaceTab("chapters")}
              >
                {t("Chapters", "챕터")}
              </button>
              <button
                className={activeWorkspaceTab === "generate" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasChapters}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : !hasChapters ? t("Create chapters before generating study material.", "학습 자료를 생성하기 전에 챕터를 만드세요.") : t("Generate study material.", "학습 자료를 생성합니다.")}
                onClick={() => setActiveWorkspaceTab("generate")}
              >
                {t("Generate", "생성")}
              </button>
              <button
                className={activeWorkspaceTab === "study-sets" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasStudySets}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : !hasStudySets ? t("Generate at least one study set first.", "먼저 학습 세트를 하나 이상 생성하세요.") : t("Review generated study sets.", "생성된 학습 세트를 검토합니다.")}
                onClick={() => {
                  setActiveWorkspaceTab("study-sets");
                  if (selectedChapter) {
                    void loadStudySets(selectedChapter);
                  }
                }}
              >
                {t("Study Sets", "학습 세트")}
              </button>
              <button
                className={activeWorkspaceTab === "export" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasStudySets}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : !hasStudySets ? t("Generate at least one study set before exporting.", "내보내기 전에 학습 세트를 하나 이상 생성하세요.") : t("Export generated study material.", "생성된 학습 자료를 내보냅니다.")}
                onClick={() => setActiveWorkspaceTab("export")}
              >
                {t("Export", "내보내기")}
              </button>
            </div>
          </div>
        </header>

        {activeBook && isBookMetadataOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section className="metadata-dialog" role="dialog" aria-modal="true" aria-labelledby="book-details-title">
              <div className="dialog-header">
                <div>
                  <p className="eyebrow">{t("Book Details", "책 정보")}</p>
                  <h3 id="book-details-title">{activeBook.title}</h3>
                </div>
                <button type="button" onClick={() => setIsBookMetadataOpen(false)}>
                  {t("Close", "닫기")}
                </button>
              </div>
              <form className="metadata-form" onSubmit={handleSaveBookMetadata}>
                <label>
                  {t("Title", "제목")}
                  <input
                    value={bookMetadataEdit.title}
                    onChange={(event) => setBookMetadataEdit((current) => ({ ...current, title: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  {t("Author", "저자")}
                  <input
                    value={bookMetadataEdit.author}
                    onChange={(event) => setBookMetadataEdit((current) => ({ ...current, author: event.target.value }))}
                    placeholder={t("Optional", "선택 사항")}
                  />
                </label>
                <label>
                  {t("Reading level", "읽기 수준")}
                  <input
                    value={bookMetadataEdit.readingLevel}
                    onChange={(event) => setBookMetadataEdit((current) => ({ ...current, readingLevel: event.target.value }))}
                    placeholder={t("Optional", "선택 사항")}
                  />
                </label>
                <div className="dialog-actions">
                  <button type="submit" disabled={isSavingBookMetadata}>
                    {isSavingBookMetadata ? t("Saving...", "저장 중...") : t("Save Details", "정보 저장")}
                  </button>
                  <button type="button" onClick={() => setIsBookMetadataOpen(false)}>
                    {t("Cancel", "취소")}
                  </button>
                </div>
              </form>
              <div className="dialog-danger-zone">
                <div>
                  <strong>{t("Delete book", "책 삭제")}</strong>
                  <p className="muted-text">{t("Removes the source files, extracted text, chapters, and generated sets for this book.", "이 책의 소스 파일, 추출된 텍스트, 챕터, 생성된 학습 세트를 모두 삭제합니다.")}</p>
                </div>
                <button
                  className="danger-button"
                  type="button"
                  disabled={deletingId === activeBook.id}
                  onClick={handleDeleteBook}
                >
                  {deletingId === activeBook.id ? t("Deleting...", "삭제 중...") : t("Delete Book", "책 삭제")}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {activeBook && isGenerationModalOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section className="generation-dialog" role="dialog" aria-modal="true" aria-labelledby="generation-dialog-title">
              <div className="dialog-header">
                <div>
                  <p className="eyebrow">{t("Generate", "생성")}</p>
                  <h3 id="generation-dialog-title">{t("Configure Generation", "생성 설정")}</h3>
                  <p className="muted-text">{t("Select chapters and adjust item counts before starting a new run.", "새 생성 작업을 시작하기 전에 챕터와 문항 수를 조정하세요.")}</p>
                </div>
                <div className="dialog-actions">
                  <button type="button" disabled={isGeneratingBook || includedGenerationChapterCount === 0} onClick={handleGenerateBook}>
                    {t("Start Generation", "생성 시작")}
                  </button>
                  <button type="button" onClick={() => setIsGenerationModalOpen(false)}>
                    {t("Cancel", "취소")}
                  </button>
                </div>
              </div>

              <div className="generation-total-strip" aria-label="Configured generation totals">
                <article>
                  <span>{t("Chapters", "챕터")}</span>
                  <strong>{includedGenerationChapterCount.toLocaleString()}</strong>
                </article>
                <article>
                  <span>{t("Vocabulary", "단어")}</span>
                  <strong>{generationTotals.vocabularyCount.toLocaleString()}</strong>
                </article>
                <article>
                  <span>{t("MCQ", "객관식")}</span>
                  <strong>{generationTotals.multipleChoiceCount.toLocaleString()}</strong>
                </article>
                <article>
                  <span>{t("Short Answer", "주관식")}</span>
                  <strong>{generationTotals.shortAnswerCount.toLocaleString()}</strong>
                </article>
              </div>

              <div className="generation-modal-toolbar">
                <button type="button" disabled={isGeneratingBook} onClick={resetGenerationPlans}>
                  {t("Reset Suggestions", "추천값 초기화")}
                </button>
              </div>

              <div className="generation-plan-table generation-modal-plan-table">
                <div className="generation-plan-head">
                  <div>{t("Use", "사용")}</div>
                  <div>{t("Chapter", "챕터")}</div>
                  <div>{t("Words", "단어 수")}</div>
                  <div>{t("Vocabulary", "단어")}</div>
                  <div>{t("MCQ", "객관식")}</div>
                  <div>{t("Short Answer", "주관식")}</div>
                </div>
                {chapters.map((chapter) => {
                  const suggested = deriveGenerationPlan(chapter.wordCount);
                  const draft = generationPlansByChapterId[chapter.id] || {
                    included: true,
                    vocabularyCount: String(suggested.vocabularyCount),
                    multipleChoiceCount: String(suggested.multipleChoiceCount),
                    shortAnswerCount: String(suggested.shortAnswerCount)
                  };

                  return (
                    <div className="generation-plan-row" key={chapter.id}>
                      <label className="generation-include-cell">
                        <input
                          type="checkbox"
                          checked={draft.included}
                          disabled={isGeneratingBook}
                          onChange={(event) => toggleGenerationChapter(chapter, event.target.checked)}
                        />
                      </label>
                      <div className="generation-plan-chapter">
                        <strong>Chapter {chapter.chapterNumber}</strong>
                        {chapter.title ? <span>{chapter.title}</span> : null}
                      </div>
                      <div>{chapter.wordCount.toLocaleString()}</div>
                      <input
                        className="generation-count-input"
                        type="number"
                        min="0"
                        value={draft.vocabularyCount}
                        disabled={isGeneratingBook || !draft.included}
                        onChange={(event) => updateGenerationPlan(chapter.id, "vocabularyCount", event.target.value)}
                      />
                      <input
                        className="generation-count-input"
                        type="number"
                        min="0"
                        value={draft.multipleChoiceCount}
                        disabled={isGeneratingBook || !draft.included}
                        onChange={(event) => updateGenerationPlan(chapter.id, "multipleChoiceCount", event.target.value)}
                      />
                      <input
                        className="generation-count-input"
                        type="number"
                        min="0"
                        value={draft.shortAnswerCount}
                        disabled={isGeneratingBook || !draft.included}
                        onChange={(event) => updateGenerationPlan(chapter.id, "shortAnswerCount", event.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}

        {statusMessage ? (
          <div className={`status-toast ${isStatusToastClosing ? "closing" : ""}`} role="status" aria-live="polite">
            {statusMessage}
          </div>
        ) : null}

        <div className="workspace-scroll">
        <div className="workspace-stack">
          {activeWorkspaceTab === "source" ? (
          <section className="source-panel">
            <div>
              <p className="step-label">{t("Source", "소스")}</p>
              <h3>{t("Source Files", "소스 파일")}</h3>
            </div>

            <form className="upload-form" onSubmit={handleSourceUpload}>
              <label className="file-picker">
                <span className="file-picker-button">{t("Browse...", "파일 선택...")}</span>
                <span className="file-picker-name">{sourceUploadFilename || t("No source file selected", "선택된 소스 파일 없음")}</span>
                <input
                  aria-label={t("Source file", "소스 파일")}
                  disabled={!activeBook || isUploading}
                  name="sourceFile"
                  type="file"
                  accept="application/pdf,application/epub+zip,text/plain,.pdf,.epub,.txt"
                  onChange={(event) => setSourceUploadFilename(event.target.files?.[0]?.name || "")}
                />
              </label>
              <button type="submit" disabled={!activeBook || isUploading}>
                {isUploading ? t("Uploading...", "업로드 중...") : t("Upload Source", "소스 업로드")}
              </button>
            </form>

            <div className="source-list">
              {isLoadingSources ? <p className="muted-text">{t("Loading source files...", "소스 파일을 불러오는 중...")}</p> : null}
              {!isLoadingSources && activeBook && sourceFiles.length === 0 ? (
                <div className="empty-state">
                  <strong>{t("No source files yet", "아직 소스 파일이 없습니다")}</strong>
                  <p>{t("Upload a PDF, EPUB, or TXT file to begin extracting book text.", "책 텍스트를 추출하려면 PDF, EPUB 또는 TXT 파일을 업로드하세요.")}</p>
                </div>
              ) : null}
              {sourceFiles.map((sourceFile) => (
                <article className="source-card" key={sourceFile.id}>
                  <div className="source-card-header">
                    <div>
                      <h4>{sourceFile.originalFilename}</h4>
                      <div className="source-meta-row">
                        <span>{formatBytes(sourceFile.byteSize)}</span>
                        <span>{sourceFile.uploadStatus}</span>
                        <span>{sourceFile.originalFilename.split(".").pop()?.toUpperCase() || "FILE"}</span>
                      </div>
                    </div>
                    <div className="button-group">
                      <button
                        type="button"
                        disabled={extractingSourceId === sourceFile.id}
                        onClick={() => handleExtractSource(sourceFile)}
                      >
                        {extractingSourceId === sourceFile.id ? t("Extracting...", "추출 중...") : t("Extract Text", "텍스트 추출")}
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={deletingId === sourceFile.id}
                        onClick={() => handleDeleteSourceFile(sourceFile)}
                      >
                        {deletingId === sourceFile.id ? t("Deleting...", "삭제 중...") : t("Delete Source", "소스 삭제")}
                      </button>
                    </div>
                  </div>

                  <p className="source-path">{sourceFile.storedPath}</p>

                  <div className="source-row-main">
                    <div className="parsed-list">
                      {(parsedDocumentsBySource[sourceFile.id] || []).length === 0 ? (
                        <div className="source-next-step">
                          <strong>{t("Text not extracted yet", "아직 텍스트가 추출되지 않았습니다")}</strong>
                          <p>{t("Run extraction to create searchable source text before splitting chapters.", "챕터를 나누기 전에 검색 가능한 소스 텍스트를 추출하세요.")}</p>
                        </div>
                      ) : null}
                      {(parsedDocumentsBySource[sourceFile.id] || []).map((parsedDocument) => {
                        const activeParsedTool = activeParsedToolByDocumentId[parsedDocument.id];

                        return (
                        <article className="parsed-row" key={parsedDocument.id}>
                          <div className="parsed-row-header">
                            <div>
                              <strong>{t("Extracted Text", "추출된 텍스트")}</strong>
                              <span>
                                {t(`${parsedDocument.pageCount} pages`, `${parsedDocument.pageCount}쪽`)} · {t(`${parsedDocument.wordCount.toLocaleString()} words`, `${parsedDocument.wordCount.toLocaleString()}단어`)} · {parsedDocument.parserName}
                              </span>
                            </div>
                          </div>
                          <div className="parsed-action-bar">
                            <div className="button-group parsed-primary-actions">
                              <button
                                type="button"
                                disabled={splittingParsedDocumentId === parsedDocument.id}
                                onClick={() => handleCreateChapters(parsedDocument)}
                              >
                                {splittingParsedDocumentId === parsedDocument.id ? t("Creating...", "생성 중...") : t("Create Chapters", "챕터 생성")}
                              </button>
                            </div>
                            <div className="button-group parsed-tool-actions">
                              <button
                                className={activeParsedTool === "preview" ? "active-tool-button" : ""}
                                type="button"
                                disabled={previewingParsedDocumentId === parsedDocument.id}
                                onClick={() => handlePreviewSplit(parsedDocument)}
                              >
                                {previewingParsedDocumentId === parsedDocument.id
                                  ? t("Previewing...", "미리보기 중...")
                                  : activeParsedTool === "preview"
                                    ? t("Hide Preview", "미리보기 숨기기")
                                    : t("Preview Split", "분할 미리보기")}
                              </button>
                              <button
                                className={activeParsedTool === "inspect" ? "active-tool-button" : ""}
                                type="button"
                                disabled={loadingTextParsedDocumentId === parsedDocument.id}
                                onClick={() => handleLoadParsedText(parsedDocument)}
                              >
                                {loadingTextParsedDocumentId === parsedDocument.id
                                  ? t("Loading...", "불러오는 중...")
                                  : activeParsedTool === "inspect"
                                    ? t("Hide Text", "텍스트 숨기기")
                                    : t("Inspect Text", "텍스트 검사")}
                              </button>
                              <button
                                className={activeParsedTool === "pages" ? "active-tool-button" : ""}
                                type="button"
                                disabled={loadingPagesParsedDocumentId === parsedDocument.id}
                                onClick={() => handleLoadPages(parsedDocument)}
                              >
                                {loadingPagesParsedDocumentId === parsedDocument.id
                                  ? t("Loading...", "불러오는 중...")
                                  : activeParsedTool === "pages"
                                    ? t("Hide Pages", "페이지 숨기기")
                                    : t("Page Split", "페이지 분할")}
                              </button>
                            </div>
                            <div className="button-group parsed-danger-actions">
                              <button
                                className="danger-button"
                                type="button"
                                disabled={deletingId === parsedDocument.id}
                                onClick={() => handleDeleteParsedDocument(sourceFile, parsedDocument)}
                              >
                                {deletingId === parsedDocument.id ? t("Deleting...", "삭제 중...") : t("Delete Text", "텍스트 삭제")}
                              </button>
                            </div>
                          </div>
                          <p>{parsedDocument.preview || t("No preview available.", "미리보기가 없습니다.")}</p>
                          {activeParsedTool === "inspect" && parsedDocumentDetailById[parsedDocument.id] ? (
                            <div className="text-inspector">
                              <div className="tool-panel-header">
                                <div>
                                  <strong>{t("Inspect extracted text", "추출된 텍스트 검사")}</strong>
                                  <span>{t("Search the full parse or create chapters from exact text markers.", "전체 추출 텍스트를 검색하거나 정확한 텍스트 표시로 챕터를 만들 수 있습니다.")}</span>
                                </div>
                                <button type="button" onClick={() => handleCloseParsedTool(parsedDocument.id)}>{t("Close", "닫기")}</button>
                              </div>
                              <div className="inspector-grid">
                                <label>
                                  {t("Search extracted text", "추출 텍스트 검색")}
                                  <input
                                    value={textSearchByParsedDocument[parsedDocument.id] || ""}
                                    onChange={(event) => setTextSearchByParsedDocument((current) => ({
                                      ...current,
                                      [parsedDocument.id]: event.target.value
                                    }))}
                                    placeholder="BOOK ONE, I, Chapter, Francie..."
                                  />
                                </label>
                                <label>
                                  {t("Manual chapter markers", "수동 챕터 표시")}
                                  <textarea
                                    rows={5}
                                    value={manualMarkersByParsedDocument[parsedDocument.id] || ""}
                                    onChange={(event) => setManualMarkersByParsedDocument((current) => ({
                                      ...current,
                                      [parsedDocument.id]: event.target.value
                                    }))}
                                    placeholder={"One marker per line.\nOptional title: marker | title"}
                                  />
                                </label>
                              </div>

                              {getSearchPreview(parsedDocument) ? (
                                <pre className="search-preview">{getSearchPreview(parsedDocument)?.text}</pre>
                              ) : (
                                <pre className="search-preview">{parsedDocumentDetailById[parsedDocument.id].textContent.slice(0, 1500)}</pre>
                              )}

                              <div className="button-group inspector-actions">
                                <button
                                  type="button"
                                  disabled={!manualMarkersByParsedDocument[parsedDocument.id]?.trim() || splittingParsedDocumentId === parsedDocument.id}
                                  onClick={() => handleCreateChapters(parsedDocument, manualMarkersByParsedDocument[parsedDocument.id] || "")}
                                >
                                  {splittingParsedDocumentId === parsedDocument.id ? t("Creating...", "생성 중...") : t("Create From Markers", "표시로 챕터 생성")}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {activeParsedTool === "pages" && parsedPagesByDocumentId[parsedDocument.id] ? (
                            <div className="page-splitter">
                              <div className="tool-panel-header">
                                <div>
                                  <strong>{t("Page-based split", "페이지 기준 분할")}</strong>
                                  <span>{t(`${parsedPagesByDocumentId[parsedDocument.id].length} extracted pages available`, `추출된 페이지 ${parsedPagesByDocumentId[parsedDocument.id].length}개 사용 가능`)}</span>
                                </div>
                                <button type="button" onClick={() => handleCloseParsedTool(parsedDocument.id)}>{t("Close", "닫기")}</button>
                              </div>
                              <div className="inspector-grid">
                                <label>
                                  {t("Chapter start pages", "챕터 시작 페이지")}
                                  <textarea
                                    rows={6}
                                    value={pageStartsByParsedDocument[parsedDocument.id] || ""}
                                    onChange={(event) => setPageStartsByParsedDocument((current) => ({
                                      ...current,
                                      [parsedDocument.id]: event.target.value
                                    }))}
                                    placeholder={"One start page per line.\nExample: 12 | Chapter I"}
                                  />
                                </label>
                                <div className="page-preview-list">
                                  {parsedPagesByDocumentId[parsedDocument.id].length === 0 ? (
                                    <p className="muted-text">{t("No page rows found. Delete this extracted text and run Extract Text again.", "페이지 행을 찾을 수 없습니다. 이 추출 텍스트를 삭제한 뒤 텍스트 추출을 다시 실행하세요.")}</p>
                                  ) : null}
                                  {parsedPagesByDocumentId[parsedDocument.id].slice(0, 24).map((page) => (
                                    <article className="page-preview-row" key={page.id}>
                                      <strong>{t(`Page ${page.pageNumber}`, `${page.pageNumber}쪽`)}</strong>
                                      <span>{t(`${page.wordCount.toLocaleString()} words`, `${page.wordCount.toLocaleString()}단어`)}</span>
                                      <p>{page.preview || t("No text on this page.", "이 페이지에는 텍스트가 없습니다.")}</p>
                                    </article>
                                  ))}
                                </div>
                              </div>
                              <div className="button-group inspector-actions">
                                <button
                                  type="button"
                                  disabled={!pageStartsByParsedDocument[parsedDocument.id]?.trim() || splittingParsedDocumentId === parsedDocument.id}
                                  onClick={() => handleCreateChapters(parsedDocument, "", pageStartsByParsedDocument[parsedDocument.id] || "")}
                                >
                                  {splittingParsedDocumentId === parsedDocument.id ? t("Creating...", "생성 중...") : t("Create From Pages", "페이지로 챕터 생성")}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {activeParsedTool === "preview" && splitPreviewByParsedDocument[parsedDocument.id] ? (
                            <div className="split-preview">
                              <div className="tool-panel-header">
                                <div>
                                  <strong>
                                    {splitPreviewByParsedDocument[parsedDocument.id].strategy === "heading"
                                      ? t("Heading split preview", "제목 기준 분할 미리보기")
                                      : t("Single-chapter fallback", "단일 챕터 대체 방식")}
                                  </strong>
                                  <span>
                                    {t(`${splitPreviewByParsedDocument[parsedDocument.id].acceptedCandidates} accepted`, `${splitPreviewByParsedDocument[parsedDocument.id].acceptedCandidates}개 승인`)} /{" "}
                                    {t(`${splitPreviewByParsedDocument[parsedDocument.id].totalCandidates} candidates`, `후보 ${splitPreviewByParsedDocument[parsedDocument.id].totalCandidates}개`)}
                                  </span>
                                </div>
                                <button type="button" onClick={() => handleCloseParsedTool(parsedDocument.id)}>{t("Close", "닫기")}</button>
                              </div>
                              <div className="split-candidate-list">
                                {splitPreviewByParsedDocument[parsedDocument.id].candidates.slice(0, 20).map((candidate) => (
                                  <article
                                    className={`split-candidate ${candidate.accepted ? "accepted" : ""}`}
                                    key={`${candidate.index}-${candidate.line}`}
                                  >
                                    <div>
                                      <strong>{candidate.line}</strong>
                                      <span>
                                        {candidate.reason}
                                        {candidate.chapterNumber ? ` · ${t("chapter", "챕터")} ${candidate.chapterNumber}` : ""}
                                        {candidate.accepted ? ` · ${t("accepted", "승인됨")}` : ""}
                                      </span>
                                    </div>
                                    <p>{candidate.context}</p>
                                  </article>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </article>
                        );
                      })}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
          ) : null}

          {activeWorkspaceTab === "generate" ? (
          <section className="generate-panel">
            <div className="panel-title-row">
              <div>
                <p className="step-label">{t("Generate", "생성")}</p>
                <h3>{t("Generation Plan", "생성 계획")}</h3>
              </div>
              <button
                type="button"
                disabled={!activeBook || chapters.length === 0 || isGeneratingBook}
                onClick={openGenerationModal}
              >
                {isGeneratingBook ? t("Generating...", "생성 중...") : t("Configure Generation", "생성 설정")}
              </button>
            </div>

            {chapters.length === 0 ? (
              <div className="empty-state">
                <strong>{t("No chapters ready", "준비된 챕터가 없습니다")}</strong>
                <p>{t("Create chapters from extracted source text before starting generation.", "생성을 시작하기 전에 추출된 소스 텍스트에서 챕터를 만드세요.")}</p>
              </div>
            ) : (
              <div className="generation-plan-panel">
                <div className="generation-terminal" aria-live="polite">
                  {generationLog.length === 0 ? (
                    <p>$ {t("waiting for generation job...", "생성 작업 대기 중...")}</p>
                  ) : generationLog.map((entry, index) => (
                    <p className={`generation-log-line ${entry.level}`} key={`${index}-${entry.timestamp}-${entry.message}`}>
                      <span>{formatLogTime(entry.timestamp)}</span>
                      <strong>{entry.level.toUpperCase()}</strong>
                      <em>{entry.message}</em>
                    </p>
                  ))}
                </div>

                <div className="generation-summary">
                  <p>
                    {t(
                      `${includedGenerationChapterCount} of ${chapters.length} chapter${chapters.length === 1 ? "" : "s"} selected. Use Configure Generation to choose chapters and adjust item counts before the run.`,
                      `전체 ${chapters.length}개 챕터 중 ${includedGenerationChapterCount}개가 선택되었습니다. 생성 설정에서 챕터와 문항 수를 조정할 수 있습니다.`
                    )}
                  </p>
                  <button type="button" disabled={isGeneratingBook} onClick={openGenerationModal}>
                    {t("Configure", "설정")}
                  </button>
                </div>

                <div className="generation-total-strip" aria-label={t("Whole book generation totals", "책 전체 생성 총량")}>
                  <article>
                    <span>{t("Vocabulary", "단어")}</span>
                    <strong>{generationTotals.vocabularyCount.toLocaleString()}</strong>
                  </article>
                  <article>
                    <span>{t("Multiple Choice", "객관식")}</span>
                    <strong>{generationTotals.multipleChoiceCount.toLocaleString()}</strong>
                  </article>
                  <article>
                    <span>{t("Short Answer", "주관식")}</span>
                    <strong>{generationTotals.shortAnswerCount.toLocaleString()}</strong>
                  </article>
                </div>

                <section className="generation-history-panel">
                  <div className="study-item-section-header">
                    <strong>{t("Generation History", "생성 기록")}</strong>
                    <span>{generationRuns.length}</span>
                  </div>
                  {generationRuns.length > 0 ? (
                    <div className="active-run-selector">
                      <label htmlFor="active-generation-run">{t("Active version", "활성 버전")}</label>
                      <select
                        id="active-generation-run"
                        value={activeBook?.activeGenerationRunId || ""}
                        onChange={(event) => void handleSelectActiveGenerationRun(event.target.value || null)}
                      >
                        <option value="">{t("Latest study sets across all runs", "모든 실행에서 가장 최신 학습 세트 사용")}</option>
                        {generationRuns.map((run) => (
                          <option key={run.id} value={run.id}>
                            {run.name} ({formatUiStatus(run.status)})
                          </option>
                        ))}
                      </select>
                      <p>
                        {t("Study Sets and whole-book exports use this version.", "학습 세트와 책 전체 내보내기는 이 버전을 사용합니다.")}
                      </p>
                    </div>
                  ) : null}
                  {generationRuns.length === 0 ? (
                    <div className="empty-state">
                      <strong>{t("No generation runs yet", "아직 생성 기록이 없습니다")}</strong>
                      <p>{t("Completed runs will appear here with chapter and item totals.", "완료된 생성 작업은 챕터 및 문항 수와 함께 여기에 표시됩니다.")}</p>
                    </div>
                  ) : (
                    <div className="generation-history-list">
                      {generationRuns.map((run) => (
                        <article className="generation-history-card" key={run.id}>
                          <div>
                            <strong>{run.name}{activeBook?.activeGenerationRunId === run.id ? ` · ${t("Active", "활성")}` : ""}</strong>
                            <p>
                              {formatDateTime(run.startedAt)} · {formatUiStatus(run.status)}
                              {run.finishedAt ? ` · ${t("finished", "완료")} ${formatDateTime(run.finishedAt)}` : ""}
                            </p>
                            <p>
                              {t(`${run.chapterCount} chapters`, `챕터 ${run.chapterCount}개`)} · {t(`${run.vocabularyCount} vocab`, `단어 ${run.vocabularyCount}개`)} · {t(`${run.multipleChoiceCount} MCQ`, `객관식 ${run.multipleChoiceCount}개`)} · {t(`${run.shortAnswerCount} short answer`, `주관식 ${run.shortAnswerCount}개`)}
                            </p>
                            {run.errorMessage ? <p className="generation-error-text">{run.errorMessage}</p> : null}
                          </div>
                          <div className="generation-history-actions">
                            <button
                              type="button"
                              disabled={activeBook?.activeGenerationRunId === run.id}
                              onClick={() => void handleSelectActiveGenerationRun(run.id)}
                            >
                              {activeBook?.activeGenerationRunId === run.id ? t("Active", "활성") : t("Use Run", "이 실행 사용")}
                            </button>
                            <button
                              className="danger-button"
                              type="button"
                              disabled={run.status === "generating" || deletingId === run.id}
                              onClick={() => handleDeleteGenerationRun(run)}
                            >
                              {deletingId === run.id ? t("Deleting...", "삭제 중...") : t("Delete Run", "실행 삭제")}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

              </div>
            )}
          </section>
          ) : null}

          {activeWorkspaceTab === "export" ? (
          <section className="export-panel">
            <div className="panel-title-row">
              <div>
                <p className="step-label">{t("Export", "내보내기")}</p>
                <h3>{t("Exports", "내보내기")}</h3>
              </div>
            </div>

            {chapters.length === 0 ? (
              <div className="empty-state">
                <strong>{t("No exports available", "내보낼 자료가 없습니다")}</strong>
                <p>{t("Create chapters and generate at least one study set before exporting files.", "파일을 내보내기 전에 챕터를 만들고 학습 세트를 하나 이상 생성하세요.")}</p>
              </div>
            ) : (
              <div className="export-page-stack">
                <div className="export-workspace">
                  <div className="export-scope-block">
                    <div>
                      <p className="step-label">{t("Whole Book", "책 전체")}</p>
                      <h4>{activeGenerationRun ? t(`Export ${activeGenerationRun.name}`, `${activeGenerationRun.name} 내보내기`) : t("Export latest generated set for every chapter", "각 챕터의 최신 학습 세트 내보내기")}</h4>
                      <p className="muted-text">
                        {activeGenerationRun
                          ? t("Uses study sets from the active generation run.", "활성 생성 실행의 학습 세트를 사용합니다.")
                          : t("Uses the newest study set for each chapter that has generated material.", "생성된 자료가 있는 각 챕터의 최신 학습 세트를 사용합니다.")}
                      </p>
                    </div>
                    <div className="export-group-list">
                      {exportOptionGroups.map((group) => (
                        <section className="export-option-group" key={`book-${group.title}`}>
                          <div>
                            <strong>{group.title}</strong>
                            <p>{group.description}</p>
                          </div>
                          <div className="export-grid">
                            {group.options.map((option) => (
                              <article
                                className="export-card"
                                key={`book-${option.type}`}
                              >
                                <strong>{option.label}</strong>
                                <span>{option.description}</span>
                                <div className="export-format-buttons">
                                  <button type="button" onClick={() => handleExportBook(option.type, "pdf")}>
                                    PDF
                                  </button>
                                  <button type="button" onClick={() => handleExportBook(option.type, "docx")}>
                                    {t("Word", "Word")}
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="export-advanced-toggle">
                  <button
                    type="button"
                    onClick={() => setShowSingleChapterExport((current) => !current)}
                  >
                    {showSingleChapterExport ? t("Hide Single-Chapter Export", "개별 챕터 내보내기 숨기기") : t("Show Single-Chapter Export", "개별 챕터 내보내기 표시")}
                  </button>
                  <p className="muted-text">{t("Use this only when you need a one-chapter handout.", "한 챕터짜리 자료가 필요할 때만 사용하세요.")}</p>
                </div>

                {showSingleChapterExport ? (
                <div className="chapter-editor-layout">
                  <div className="chapter-list">
                    {chapters.map((chapter) => (
                      <button
                        className={`chapter-row ${chapter.id === selectedChapter?.id ? "active" : ""}`}
                        key={chapter.id}
                        type="button"
                        onClick={() => handleSelectChapter(chapter)}
                      >
                        <div>
                          <strong>
                            {t("Chapter", "챕터")} {chapter.chapterNumber}{chapter.title ? `: ${chapter.title}` : ""}
                          </strong>
                          <span>{t(`${chapter.wordCount.toLocaleString()} words`, `${chapter.wordCount.toLocaleString()}단어`)}</span>
                        </div>
                        <p>{chapter.preview}</p>
                      </button>
                    ))}
                  </div>

                  <div className="export-workspace">
                    <div className="export-scope-block">
                    {!selectedChapter ? (
                      <p className="muted-text">{t("Select a chapter to export.", "내보낼 챕터를 선택하세요.")}</p>
                    ) : (
                      <>
                        <div className="study-set-header">
                          <div>
                            <p className="step-label">{t("Single Chapter", "개별 챕터")}</p>
                            <h4>{selectedStudySet?.title || t("No generated study set selected", "선택된 학습 세트가 없습니다")}</h4>
                            {selectedStudySet ? (
                              <p className="muted-text">
                                {t("Generated", "생성됨")} {formatDateTime(selectedStudySet.createdAt)}
                                {selectedStudySet.model ? ` ${t("with", "모델:")} ${selectedStudySet.model}` : ""}
                              </p>
                            ) : null}
                          </div>
                          <div className="study-set-controls">
                            {loadingStudySetsChapterId === selectedChapter.id ? (
                              <span>{t("Loading...", "불러오는 중...")}</span>
                            ) : selectedChapterStudySets.length ? (
                              <select
                                value={selectedStudySetId || ""}
                                onChange={(event) => void handleSelectStudySet(selectedChapter.id, event.target.value)}
                              >
                                {selectedChapterStudySets.map((studySet) => (
                                  <option key={studySet.id} value={studySet.id}>
                                    {studySet.title}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        </div>

                        {!selectedStudySet ? (
                          <p className="muted-text">{t("Generate a study set for this chapter before exporting.", "내보내기 전에 이 챕터의 학습 세트를 생성하세요.")}</p>
                        ) : (
                          <div className="export-group-list">
                            {exportOptionGroups.map((group) => (
                              <section className="export-option-group" key={`chapter-${group.title}`}>
                                <div>
                                  <strong>{group.title}</strong>
                                  <p>{group.description}</p>
                                </div>
                                <div className="export-grid">
                                  {group.options.map((option) => (
                                    <article
                                      className="export-card"
                                      key={option.type}
                                    >
                                      <strong>{option.label}</strong>
                                      <span>{option.description}</span>
                                      <div className="export-format-buttons">
                                        <button type="button" onClick={() => handleExportStudySet(option.type, "pdf")}>
                                          PDF
                                        </button>
                                        <button type="button" onClick={() => handleExportStudySet(option.type, "docx")}>
                                          {t("Word", "Word")}
                                        </button>
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    </div>
                  </div>
                </div>
                ) : null}
              </div>
            )}
          </section>
          ) : null}

          {activeWorkspaceTab === "chapters" || activeWorkspaceTab === "study-sets" ? (
          <section className="chapter-panel">
            <div className="panel-title-row">
              <div>
                <p className="step-label">{activeWorkspaceTab === "study-sets" ? t("Study Sets", "학습 세트") : t("Chapters", "챕터")}</p>
                <h3>{activeWorkspaceTab === "study-sets" ? t("Study Set Review", "학습 세트 검토") : t("Chapter Review", "챕터 검토")}</h3>
                {activeWorkspaceTab === "study-sets" && activeGenerationRun ? (
                  <p className="muted-text">{t("Viewing active version:", "활성 버전:")} {activeGenerationRun.name}</p>
                ) : null}
              </div>
              {activeWorkspaceTab === "chapters" ? (
                <button
                  className="danger-button"
                  type="button"
                  disabled={chapters.length === 0 || deletingId === "chapters"}
                  onClick={handleClearChapters}
                >
                  {deletingId === "chapters" ? t("Clearing...", "삭제 중...") : t("Clear Chapters", "챕터 모두 삭제")}
                </button>
              ) : null}
            </div>

            {chapters.length === 0 ? (
              <div className="empty-state">
                <strong>{t("No chapters created yet", "아직 생성된 챕터가 없습니다")}</strong>
                <p>{t("Use the Source tab to extract text and split the book into chapters.", "소스 탭에서 텍스트를 추출하고 챕터를 나누세요.")}</p>
              </div>
            ) : (
              <div className="chapter-editor-layout">
                <div className="chapter-list">
                  {chapters.map((chapter) => (
                    <button
                      className={`chapter-row ${chapter.id === selectedChapter?.id ? "active" : ""}`}
                      key={chapter.id}
                      type="button"
                      onClick={() => handleSelectChapter(chapter)}
                    >
                      <div>
                        <strong>
                          {t("Chapter", "챕터")} {chapter.chapterNumber}{chapter.title ? `: ${chapter.title}` : ""}
                        </strong>
                        <span>{t(`${chapter.wordCount.toLocaleString()} words`, `${chapter.wordCount.toLocaleString()}단어`)}</span>
                      </div>
                      <p>{chapter.preview}</p>
                    </button>
                  ))}
                </div>

                <div className="chapter-editor">
                  {!selectedChapter ? (
                    <p className="muted-text">{t("Select a chapter to continue.", "계속하려면 챕터를 선택하세요.")}</p>
                  ) : loadingChapterId === selectedChapter.id ? (
                    <p className="muted-text">{t("Loading chapter...", "챕터를 불러오는 중...")}</p>
                  ) : activeWorkspaceTab === "study-sets" ? (
                    <>
                      <div className="study-set-panel">
                        <div className="study-set-header">
                          <div>
                            <p className="step-label">{t("Study Set", "학습 세트")}</p>
                            <h4>{selectedStudySet?.title || t("No study set yet", "아직 학습 세트가 없습니다")}</h4>
                            {selectedStudySet ? (
                              <div className="study-set-meta-row">
                                <span>{formatUiStatus(selectedStudySet.status)}</span>
                                <span>{formatDateTime(selectedStudySet.createdAt)}</span>
                                {selectedStudySet.model ? <span>{selectedStudySet.model}</span> : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="study-set-controls">
                            {loadingStudySetsChapterId === selectedChapter.id ? (
                              <span>{t("Loading...", "불러오는 중...")}</span>
                            ) : selectedChapterStudySets.length ? (
                              <select
                                value={selectedStudySetId || ""}
                                onChange={(event) => void handleSelectStudySet(selectedChapter.id, event.target.value)}
                              >
                                {selectedChapterStudySets.map((studySet) => (
                                  <option key={studySet.id} value={studySet.id}>
                                    {studySet.title}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {selectedStudySet ? (
                              <button
                                className="danger-button"
                                type="button"
                                disabled={deletingId === selectedStudySet.id}
                                onClick={() => handleDeleteStudySet(selectedChapter, selectedStudySet)}
                              >
                                {deletingId === selectedStudySet.id ? t("Deleting...", "삭제 중...") : t("Delete Study Set", "학습 세트 삭제")}
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {selectedStudySet ? (
                          <details className="study-set-edit-details">
                            <summary>{t("Rename and status", "이름 및 상태")}</summary>
                            <div className="study-set-edit-panel">
                              <label>
                                {t("Rename", "이름 변경")}
                                <input
                                  value={studySetDraftById[selectedStudySet.id]?.title || selectedStudySet.title}
                                  onChange={(event) => updateStudySetDraft(selectedStudySet.id, { title: event.target.value })}
                                />
                              </label>
                              <label>
                                {t("Status", "상태")}
                                <select
                                  value={studySetDraftById[selectedStudySet.id]?.status || selectedStudySet.status}
                                  onChange={(event) => updateStudySetDraft(selectedStudySet.id, { status: event.target.value })}
                                >
                                  {studySetStatuses.map((status) => (
                                    <option key={status} value={status}>
                                      {formatUiStatus(status)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                disabled={savingStudySetId === selectedStudySet.id}
                                onClick={() => handleSaveStudySet(selectedStudySet)}
                              >
                                {savingStudySetId === selectedStudySet.id ? t("Saving...", "저장 중...") : t("Save Study Set", "학습 세트 저장")}
                              </button>
                            </div>
                          </details>
                        ) : null}

                        {!selectedStudySet ? (
                          <p className="muted-text">{t("Generate a study set to review vocabulary and questions.", "단어와 문제를 검토하려면 학습 세트를 생성하세요.")}</p>
                        ) : loadingStudyItemsSetId === selectedStudySet.id ? (
                          <p className="muted-text">{t("Loading generated items...", "생성된 항목을 불러오는 중...")}</p>
                        ) : selectedStudyItems ? (
                          <>
                          <div className="study-set-subtabs" role="tablist" aria-label={t("Study set item type", "학습 세트 항목 종류")}>
                            <button
                              className={activeStudySetView === "vocabulary" ? "active" : ""}
                              type="button"
                              onClick={() => setActiveStudySetView("vocabulary")}
                            >
                              {t("Vocabulary", "단어")}
                              <span>{selectedStudyItems.vocabularyItems.length}</span>
                            </button>
                            <button
                              className={activeStudySetView === "multiple-choice" ? "active" : ""}
                              type="button"
                              onClick={() => setActiveStudySetView("multiple-choice")}
                            >
                              {t("Multiple Choice", "객관식")}
                              <span>{selectedStudyItems.multipleChoiceQuestions.length}</span>
                            </button>
                            <button
                              className={activeStudySetView === "short-answer" ? "active" : ""}
                              type="button"
                              onClick={() => setActiveStudySetView("short-answer")}
                            >
                              {t("Short Answer", "주관식")}
                              <span>{selectedStudyItems.shortAnswerQuestions.length}</span>
                            </button>
                          </div>

                          {activeStudySetView === "vocabulary" ? (
                          <div className="study-items-grid single-column">
                            <section className="study-item-section">
                              <div className="study-item-section-header">
                                <strong>{t("Vocabulary", "단어")}</strong>
                                <span>{selectedStudyItems.vocabularyItems.length}</span>
                              </div>
                              {selectedStudyItems.vocabularyItems.map((item) => (
                                <article className="study-item-card" key={item.id}>
                                  {editingStudyItemId === item.id ? (
                                    <div className="study-item-edit-form">
                                      <input value={studyItemDraftById[item.id]?.term || ""} onChange={(event) => updateStudyItemDraft(item.id, { term: event.target.value })} />
                                      <textarea rows={3} value={studyItemDraftById[item.id]?.definition || ""} onChange={(event) => updateStudyItemDraft(item.id, { definition: event.target.value })} />
                                      <textarea rows={3} value={studyItemDraftById[item.id]?.contextSentence || ""} onChange={(event) => updateStudyItemDraft(item.id, { contextSentence: event.target.value })} />
                                    </div>
                                  ) : (
                                    <>
                                      <strong>{item.term}</strong>
                                      <p>{formatVocabularyDefinition(item.definition)}</p>
                                      {item.contextSentence ? (
                                        <small className="vocabulary-example">
                                          {renderVocabularyExample(item.contextSentence, item.term)}
                                        </small>
                                      ) : null}
                                    </>
                                  )}
                                  <div className="study-item-actions">
                                    {editingStudyItemId === item.id ? (
                                      <>
                                        <button type="button" disabled={savingStudyItemId === item.id} onClick={() => handleSaveStudyItem("vocabulary", item.id)}>{savingStudyItemId === item.id ? t("Saving...", "저장 중...") : t("Save", "저장")}</button>
                                        <button type="button" onClick={() => setEditingStudyItemId(null)}>{t("Cancel", "취소")}</button>
                                      </>
                                    ) : (
                                      <button type="button" onClick={() => startEditingStudyItem("vocabulary", item)}>{t("Edit", "수정")}</button>
                                    )}
                                    <button className="danger-button" type="button" disabled={deletingId === item.id} onClick={() => handleDeleteStudyItem("vocabulary", item.id)}>{deletingId === item.id ? t("Deleting...", "삭제 중...") : t("Delete", "삭제")}</button>
                                  </div>
                                </article>
                              ))}
                            </section>
                          </div>
                          ) : activeStudySetView === "multiple-choice" ? (
                          <div className="study-items-grid single-column">
                            <section className="study-item-section">
                              <div className="study-item-section-header">
                                <strong>{t("Multiple Choice", "객관식")}</strong>
                                <span>{selectedStudyItems.multipleChoiceQuestions.length}</span>
                              </div>
                              {selectedStudyItems.multipleChoiceQuestions.map((item) => (
                                <article className="study-item-card" key={item.id}>
                                  {editingStudyItemId === item.id ? (
                                    <div className="study-item-edit-form">
                                      <textarea rows={3} value={studyItemDraftById[item.id]?.questionText || ""} onChange={(event) => updateStudyItemDraft(item.id, { questionText: event.target.value })} />
                                      <textarea rows={5} value={studyItemDraftById[item.id]?.choices || ""} onChange={(event) => updateStudyItemDraft(item.id, { choices: event.target.value })} />
                                      <input type="number" min="0" value={studyItemDraftById[item.id]?.correctChoiceIndex || "0"} onChange={(event) => updateStudyItemDraft(item.id, { correctChoiceIndex: event.target.value })} />
                                      <textarea rows={3} value={studyItemDraftById[item.id]?.explanation || ""} onChange={(event) => updateStudyItemDraft(item.id, { explanation: event.target.value })} />
                                    </div>
                                  ) : (
                                    <>
                                      <strong>{item.questionText}</strong>
                                      <div className="choice-list">
                                        {item.choices.map((choice, index) => (
                                          <div
                                            className={`choice-row ${index === item.correctChoiceIndex ? "correct-choice" : ""}`}
                                            key={`${item.id}-${choice}`}
                                          >
                                            <span>{getChoiceLabel(index)}</span>
                                            <p>{choice}</p>
                                          </div>
                                        ))}
                                      </div>
                                      {item.explanation ? <small>{item.explanation}</small> : null}
                                    </>
                                  )}
                                  <div className="study-item-actions">
                                    {editingStudyItemId === item.id ? (
                                      <>
                                        <button type="button" disabled={savingStudyItemId === item.id} onClick={() => handleSaveStudyItem("multiple-choice", item.id)}>{savingStudyItemId === item.id ? t("Saving...", "저장 중...") : t("Save", "저장")}</button>
                                        <button type="button" onClick={() => setEditingStudyItemId(null)}>{t("Cancel", "취소")}</button>
                                      </>
                                    ) : (
                                      <button type="button" onClick={() => startEditingStudyItem("multiple-choice", item)}>{t("Edit", "수정")}</button>
                                    )}
                                    <button className="danger-button" type="button" disabled={deletingId === item.id} onClick={() => handleDeleteStudyItem("multiple-choice", item.id)}>{deletingId === item.id ? t("Deleting...", "삭제 중...") : t("Delete", "삭제")}</button>
                                  </div>
                                </article>
                              ))}
                            </section>
                          </div>
                          ) : (
                          <div className="study-items-grid single-column">
                            <section className="study-item-section">
                              <div className="study-item-section-header">
                                <strong>{t("Short Answer", "주관식")}</strong>
                                <span>{selectedStudyItems.shortAnswerQuestions.length}</span>
                              </div>
                              {selectedStudyItems.shortAnswerQuestions.map((item) => (
                                <article className="study-item-card" key={item.id}>
                                  {editingStudyItemId === item.id ? (
                                    <div className="study-item-edit-form">
                                      <textarea rows={3} value={studyItemDraftById[item.id]?.questionText || ""} onChange={(event) => updateStudyItemDraft(item.id, { questionText: event.target.value })} />
                                      <textarea rows={4} value={studyItemDraftById[item.id]?.suggestedAnswer || ""} onChange={(event) => updateStudyItemDraft(item.id, { suggestedAnswer: event.target.value })} />
                                      <textarea rows={4} value={studyItemDraftById[item.id]?.rubric || ""} onChange={(event) => updateStudyItemDraft(item.id, { rubric: event.target.value })} />
                                    </div>
                                  ) : (
                                    <>
                                      <strong>{item.questionText}</strong>
                                      <p>{item.suggestedAnswer}</p>
                                      {item.rubric ? <small>{item.rubric}</small> : null}
                                    </>
                                  )}
                                  <div className="study-item-actions">
                                    {editingStudyItemId === item.id ? (
                                      <>
                                        <button type="button" disabled={savingStudyItemId === item.id} onClick={() => handleSaveStudyItem("short-answer", item.id)}>{savingStudyItemId === item.id ? t("Saving...", "저장 중...") : t("Save", "저장")}</button>
                                        <button type="button" onClick={() => setEditingStudyItemId(null)}>{t("Cancel", "취소")}</button>
                                      </>
                                    ) : (
                                      <button type="button" onClick={() => startEditingStudyItem("short-answer", item)}>{t("Edit", "수정")}</button>
                                    )}
                                    <button className="danger-button" type="button" disabled={deletingId === item.id} onClick={() => handleDeleteStudyItem("short-answer", item.id)}>{deletingId === item.id ? t("Deleting...", "삭제 중...") : t("Delete", "삭제")}</button>
                                  </div>
                                </article>
                              ))}
                            </section>
                          </div>
                          )}
                          </>
                        ) : (
                          <p className="muted-text">{t("Select a study set to load its generated items.", "생성된 항목을 불러오려면 학습 세트를 선택하세요.")}</p>
                        )}
                      </div>
                    </>
                  ) : !selectedChapterEdit ? (
                    <div className="empty-editor">
                      <h4>{t("Chapter", "챕터")} {selectedChapter.chapterNumber}</h4>
                      <p className="muted-text">{t("Open this chapter to load the full text for editing.", "수정할 전체 텍스트를 불러오려면 이 챕터를 여세요.")}</p>
                      <button type="button" onClick={() => handleSelectChapter(selectedChapter)}>
                        {t("Open Chapter", "챕터 열기")}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="chapter-editor-header">
                        <div>
                          <p className="step-label">{t("Editor", "편집기")}</p>
                          <h4>{t("Chapter", "챕터")} {selectedChapter.chapterNumber}</h4>
                        </div>
                        <span>{t(`${selectedChapterWordCount.toLocaleString()} words`, `${selectedChapterWordCount.toLocaleString()}단어`)}</span>
                      </div>

                      <div className="chapter-form-grid">
                        <label>
                          {t("Number", "번호")}
                          <input
                            min="1"
                            type="number"
                            value={selectedChapterEdit.chapterNumber}
                            onChange={(event) => handleChapterEdit(selectedChapter.id, { chapterNumber: event.target.value })}
                          />
                        </label>
                        <label>
                          {t("Title", "제목")}
                          <input
                            value={selectedChapterEdit.title}
                            onChange={(event) => handleChapterEdit(selectedChapter.id, { title: event.target.value })}
                            placeholder={`${t("Chapter", "챕터")} ${selectedChapter.chapterNumber}`}
                          />
                        </label>
                      </div>

                      <label className="chapter-text-field">
                        {t("Chapter text", "챕터 텍스트")}
                        <textarea
                          rows={22}
                          value={selectedChapterEdit.textContent}
                          onChange={(event) => handleChapterEdit(selectedChapter.id, { textContent: event.target.value })}
                        />
                      </label>

                      <div className="button-group editor-actions">
                        <button
                          type="button"
                          disabled={savingChapterId === selectedChapter.id}
                          onClick={() => handleSaveChapter(selectedChapter)}
                        >
                          {savingChapterId === selectedChapter.id ? t("Saving...", "저장 중...") : t("Save Chapter", "챕터 저장")}
                        </button>
                        {activeWorkspaceTab === "chapters" ? (
                          <button
                            className="danger-button"
                            type="button"
                            disabled={deletingId === selectedChapter.id}
                            onClick={() => handleDeleteChapter(selectedChapter)}
                          >
                            {deletingId === selectedChapter.id ? t("Deleting...", "삭제 중...") : t("Delete Chapter", "챕터 삭제")}
                          </button>
                        ) : null}
                      </div>

                    </>
                  )}
                </div>
              </div>
            )}
          </section>
          ) : null}
        </div>
        </div>
      </section>
    </main>
  );
}
