"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { allocateCountByWordWeight, deriveBookGenerationPlan } from "@topreading/core";

import { QuietMenu, WorkspaceBar, SavedLibrary, WorkspaceNavigation } from "./workspace-navigation";
import "./live-workspace.css";
import { QuestionCard } from "./question-card";
import { reviewReasonLabels } from "@/lib/mcq-review-reasons";
import { ThemeToggle } from "./theme-toggle";

type BookSummary = {
  id: string;
  title: string;
  author: string | null;
  readingLevel: string | null;
  activeGenerationRunId: string | null;
  pinnedAt: string | null;
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
  chapterId: string | null;
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
  chapterId: string | null;
  term: string;
  definition: string;
  contextSentence: string | null;
  partOfSpeech: string | null;
  difficulty: string | null;
  status: string;
  sortOrder: number;
};

type MultipleChoiceQuestion = {
  reviewFlags?: string[];
  id: string;
  chapterId: string | null;
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
  chapterId: string | null;
  questionText: string;
  suggestedAnswer: string;
  rubric: string | null;
  skill: string | null;
  difficulty: string | null;
  status: string;
  sortOrder: number;
};

type StudyItems = {
  chapterSummaries: Array<{
    id: string;
    chapterId: string | null;
    summaryText: string;
    status: string;
    sortOrder: number;
  }>;
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

type CurrentUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  notes: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CurrentUserResponse = {
  user: CurrentUser | null;
  isAdmin: boolean;
  error?: string;
};

type StudyItemKind = "vocabulary" | "multiple-choice" | "short-answer";
type BookSortMode = "newest" | "oldest" | "az" | "za";

type StatusToast = {
  id: string;
  message: string;
  closing: boolean;
};

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

type PageMarkerDraft = {
  chapterNumber: string;
  pageNumber: string;
  title: string;
};
type WorkspaceTab = "source" | "split" | "chapters" | "generate" | "sets" | "review" | "export";
type StudySetView = "vocabulary" | "multiple-choice" | "short-answer";
type ExportFileFormat = "pdf" | "docx";
type ThemeMode = "light" | "dark";
type UiLanguage = "en" | "ko";
type PdfExportType =
  | "chapter-summaries"
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
type GenerationCountField = keyof Omit<GenerationPlanDraft, "included">;

type UiIconName = "arrowDown" | "arrowLeft" | "arrowRight" | "arrowUp" | "check" | "chevronDown" | "chevronUp" | "fileDocx" | "filePdf" | "globe" | "logOut" | "moon" | "plus" | "settings" | "star" | "starFilled" | "sun" | "trash" | "user";

function UiIcon({ name }: { name: UiIconName }) {
  const paths: Record<UiIconName, ReactNode> = {
    arrowDown: (
      <>
        <path d="M12 5v14" />
        <path d="m19 12-7 7-7-7" />
      </>
    ),
    arrowLeft: (
      <>
        <path d="M19 12H5" />
        <path d="m12 5-7 7 7 7" />
      </>
    ),
    arrowRight: (
      <>
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </>
    ),
    arrowUp: (
      <>
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
    fileDocx: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5" />
        <path d="M9 12h6" />
        <path d="M9 15h6" />
        <path d="M9 18h4" />
      </>
    ),
    filePdf: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5" />
        <path d="M9 17c3-5 4-5 7-2" />
        <path d="M10 11c1 2 1 4-1 6" />
        <path d="M8 17c2 0 5-2 7-5" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a14 14 0 0 1 0 18" />
        <path d="M12 3a14 14 0 0 0 0 18" />
      </>
    ),
    logOut: (
      <>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M21 19V5a2 2 0 0 0-2-2h-6" />
        <path d="M13 21h6a2 2 0 0 0 2-2" />
      </>
    ),
    moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z" />,
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    settings: (
      <>
        <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.98 2.98l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.98-2.98l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.66-1.1H3a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4.72 8.6a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2.1 2.1 0 0 1 2.98-2.98l.04.04a1.8 1.8 0 0 0 1.98.36H9.4A1.8 1.8 0 0 0 10.5 2.34V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.98 2.98l-.04.04a1.8 1.8 0 0 0-.36 1.98v.08a1.8 1.8 0 0 0 1.66 1.1H22a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
      </>
    ),
    star: <path d="m12 2.8 2.84 5.76 6.36.92-4.6 4.48 1.08 6.34L12 17.32 6.32 20.3l1.08-6.34-4.6-4.48 6.36-.92L12 2.8Z" />,
    starFilled: <path className="filled-path" d="m12 2.8 2.84 5.76 6.36.92-4.6 4.48 1.08 6.34L12 17.32 6.32 20.3l1.08-6.34-4.6-4.48 6.36-.92L12 2.8Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M6 7l1 14h10l1-14" />
        <path d="M9 7V4h6v3" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    )
  };

  return (
    <svg aria-hidden="true" className="ui-icon" fill="none" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function buildAllocatedGenerationPlans(chapters: ChapterSummary[]): Record<string, GenerationPlanDraft> {
  const totalWordCount = chapters.reduce((sum, chapter) => sum + Math.max(0, chapter.wordCount), 0);
  const suggestedTotals = deriveBookGenerationPlan(totalWordCount);
  const allocationItems = chapters.map((chapter) => ({ id: chapter.id, wordCount: chapter.wordCount }));
  const vocabularyCounts = allocateCountByWordWeight(allocationItems, suggestedTotals.vocabularyCount);
  const multipleChoiceCounts = allocateCountByWordWeight(allocationItems, suggestedTotals.multipleChoiceCount);
  const shortAnswerCounts = allocateCountByWordWeight(allocationItems, suggestedTotals.shortAnswerCount);

  return Object.fromEntries(chapters.map((chapter) => [
    chapter.id,
    {
      included: true,
      vocabularyCount: String(vocabularyCounts[chapter.id] ?? 0),
      multipleChoiceCount: String(multipleChoiceCounts[chapter.id] ?? 0),
      shortAnswerCount: String(shortAnswerCounts[chapter.id] ?? 0)
    }
  ]));
}

function getChoiceDraftKey(index: number) {
  return `choice${getChoiceLabel(index)}`;
}

async function fetchBooks() {
  const response = await fetch("/api/books", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load the book library.");
  }

  const payload = (await response.json()) as BooksResponse;
  return payload.books;
}

async function fetchCurrentUser() {
  const response = await fetch("/api/me", { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as CurrentUserResponse;

  if (!response.ok || !payload.user) {
    throw new Error(payload.error || "Could not load current user.");
  }

  return payload;
}

async function fetchBook(bookId: string) {
  const response = await fetch(`/api/books/${bookId}`, { cache: "no-store" });
  const payload = (await response.json()) as BookResponse;

  if (!response.ok || !payload.book) {
    throw new Error(payload.error || "Could not load book.");
  }

  return payload.book;
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

async function fetchStudyItems(bookId: string, studySetId: string, chapterId?: string | null) {
  const params = new URLSearchParams();
  if (chapterId) {
    params.set("chapterId", chapterId);
  }
  const query = params.toString();
  const response = await fetch(`/api/books/${bookId}/study-sets/${studySetId}/items${query ? `?${query}` : ""}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not load generated study items.");
  }

  const payload = (await response.json()) as StudyItemsResponse;
  return payload.items || { chapterSummaries: [], vocabularyItems: [], multipleChoiceQuestions: [], shortAnswerQuestions: [] };
}

function studyItemsCacheKey(studySetId: string, chapterId?: string | null) {
  return `${studySetId}:${chapterId || "all"}`;
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

export function BookWorkspace({ modern = true }: { modern?: boolean }) {
  const [libraryOpen, setLibraryOpen] = useState(modern);
  const [libraryError, setLibraryError] = useState("");
  const [bookLoadError, setBookLoadError] = useState("");
  const [bookLoadAttempt, setBookLoadAttempt] = useState(0);
  const [isBookLoading, setIsBookLoading] = useState(true);
  const [loadedBookId, setLoadedBookId] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dirtyItemIds, setDirtyItemIds] = useState<string[]>([]);
  const readingPositions = useRef(new Map<string, { chapterId: string | null; tab: WorkspaceTab }>());
  const currentBookRef = useRef<string | null>(null);
  const studyRequestEpoch = useRef(0);
  const [studyLoadError, setStudyLoadError] = useState("");
  const [switchingVersion, setSwitchingVersion] = useState(false);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("source");
  const [activeStudySetView, setActiveStudySetView] = useState<StudySetView>("multiple-choice");
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isBookMetadataOpen, setIsBookMetadataOpen] = useState(false);
  const bookDialogRef = useRef<HTMLDialogElement>(null);
  const renameDialogRef = useRef<HTMLDialogElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [bookMetadataError, setBookMetadataError] = useState("");
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);
  const [renamingGenerationRunId, setRenamingGenerationRunId] = useState<string | null>(null);
  const [renameError, setRenameError] = useState("");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [exportType, setExportType] = useState<PdfExportType>("multiple-choice");
  const [exportFormat, setExportFormat] = useState<"pdf" | "docx">("pdf");
  const [exportScope, setExportScope] = useState<"all" | "chapter">("all");
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
  const [pageMarkersByParsedDocument, setPageMarkersByParsedDocument] = useState<Record<string, PageMarkerDraft[]>>({});
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
  const [generationRuns, setGenerationRuns] = useState<GenerationRunSummary[]>([]);
  const [generationRunDraftById, setGenerationRunDraftById] = useState<Record<string, string>>({});
  const [editingStudyItemId, setEditingStudyItemId] = useState<string | null>(null);
  const [studyItemDraftById, setStudyItemDraftById] = useState<Record<string, Record<string, string>>>({});
  const [creatingStudyItemKind, setCreatingStudyItemKind] = useState<StudyItemKind | null>(null);
  const [newStudyItemDraft, setNewStudyItemDraft] = useState<Record<string, string>>({});
  const [bookSearch, setBookSearch] = useState("");
  const [bookSortMode, setBookSortMode] = useState<BookSortMode>("newest");
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
  const [isSavingNewStudyItem, setIsSavingNewStudyItem] = useState(false);
  const [savingGenerationRunId, setSavingGenerationRunId] = useState<string | null>(null);
  const [movingStudyItemId, setMovingStudyItemId] = useState<string | null>(null);
  const [questionExpansion, setQuestionExpansion] = useState({open:false,version:0});
  const [newItemAtEnd, setNewItemAtEnd] = useState(false);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string|null>(null);
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [isGeneratingBook, setIsGeneratingBook] = useState(false);
  const [cancellingGenerationRunId, setCancellingGenerationRunId] = useState<string | null>(null);
  const [generationLog, setGenerationLog] = useState<GenerationLogEntry[]>([]);
  const [generationPlansByChapterId, setGenerationPlansByChapterId] = useState<Record<string, GenerationPlanDraft>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusToasts, setStatusToasts] = useState<StatusToast[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [currentUserIsAdmin, setCurrentUserIsAdmin] = useState(false);

  const activeBook = useMemo(
    () => books.find((book) => book.id === activeBookId) || books[0] || null,
    [activeBookId, books]
  );
  const filteredBooks = useMemo(() => {
    const query = bookSearch.trim().toLowerCase();
    const matching = query
      ? books.filter((book) =>
        book.title.toLowerCase().includes(query)
        || (book.author || "").toLowerCase().includes(query)
      )
      : books;

    const sorted = [...matching].sort((left, right) => {
      const pinCompare = Number(Boolean(right.pinnedAt)) - Number(Boolean(left.pinnedAt));
      if (pinCompare !== 0) {
        return pinCompare;
      }

      if (left.pinnedAt && right.pinnedAt) {
        const pinnedCompare = right.pinnedAt.localeCompare(left.pinnedAt);
        if (pinnedCompare !== 0) {
          return pinnedCompare;
        }
      }

      if (bookSortMode === "oldest") {
        return left.createdAt.localeCompare(right.createdAt);
      }
      if (bookSortMode === "az") {
        return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
      }
      if (bookSortMode === "za") {
        return right.title.localeCompare(left.title, undefined, { sensitivity: "base" });
      }
      return right.createdAt.localeCompare(left.createdAt);
    });

    return sorted;
  }, [bookSearch, bookSortMode, books]);
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) || chapters[0] || null,
    [chapters, selectedChapterId]
  );
  const selectedChapterDetail = selectedChapter ? chapterDetailById[selectedChapter.id] || null : null;
  const selectedChapterEdit = selectedChapter ? chapterEditById[selectedChapter.id] : null;
  const activeGenerationRun = activeBook?.activeGenerationRunId
    ? generationRuns.find((run) => run.id === activeBook.activeGenerationRunId) || null
    : null;
  const generatingRun = generationRuns.find((run) => run.status === "generating") || null;
  const renamingGenerationRun = renamingGenerationRunId
    ? generationRuns.find((run) => run.id === renamingGenerationRunId) || null
    : null;
  const selectedChapterStudySets = selectedChapter ? studySetsByChapterId[selectedChapter.id] || [] : [];
  const selectedStudySetId = selectedChapter
    ? selectedStudySetIdByChapterId[selectedChapter.id] || selectedChapterStudySets[0]?.id || null
    : null;
  const selectedStudySet = selectedStudySetId
    ? selectedChapterStudySets.find((studySet) => studySet.id === selectedStudySetId) || null
    : null;
  const selectedStudyItems = selectedStudySetId
    ? studyItemsByStudySetId[studyItemsCacheKey(selectedStudySetId, selectedChapter?.id)]
    : null;
  const selectedChapterWordCount = selectedChapterEdit
    ? selectedChapterEdit.textContent.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const selectedChapterHasUnsavedChanges = Boolean(
    selectedChapterDetail &&
    selectedChapterEdit &&
    (
      Number(selectedChapterEdit.chapterNumber) !== selectedChapterDetail.chapterNumber ||
      selectedChapterEdit.title !== (selectedChapterDetail.title || "") ||
      selectedChapterEdit.textContent !== selectedChapterDetail.textContent
    )
  );
  const t = (english: string, korean: string) => uiLanguage === "ko" ? korean : english;
  const currentUserLabel = currentUser?.displayName || currentUser?.email || t("Preferences", "설정");
  const currentUserMeta = currentUser
    ? `${currentUser.role === "admin" ? t("Admin", "관리자") : t("Member", "회원")} · ${uiLanguage === "ko" ? "KO" : "EN"} · ${themeMode === "dark" ? t("Dark", "다크") : t("Light", "라이트")}`
    : `${uiLanguage === "ko" ? "KO" : "EN"} · ${themeMode === "dark" ? t("Dark", "다크") : t("Light", "라이트")}`;
  const hasUnsavedChanges = dirtyItemIds.length > 0 || Boolean(creatingStudyItemKind) || Object.entries(chapterEditById).some(([id, draft]) => {
    const saved = chapterDetailById[id];
    return saved && (Number(draft.chapterNumber) !== saved.chapterNumber || draft.title !== saved.title || draft.textContent !== saved.textContent);
  });
  function selectBook(id: string) {
    if (isSavingNewStudyItem) return;
    if (id !== activeBook?.id && (isUploading || extractingSourceId || splittingParsedDocumentId)) { setStatusMessage(t("Wait for the import operation to finish before switching books.", "가져오기가 완료된 후 책을 전환하세요.")); return; }
    if (id !== activeBook?.id && (isGeneratingBook || generatingRun)) { setStatusMessage(t("Wait for generation to finish or cancel it before switching books.", "생성이 끝날 때까지 기다리거나 취소한 후 책을 전환하세요.")); return; }
    if (creatingStudyItemKind && !window.confirm(t("Discard the new unsaved item?", "저장되지 않은 새 항목을 버릴까요?"))) return;
    setCreatingStudyItemKind(null); setNewStudyItemDraft({});
    if (activeBook && id !== activeBook.id) {
      readingPositions.current.set(activeBook.id, { chapterId: selectedChapterId, tab: activeWorkspaceTab });
      setIsBookLoading(true);
      setActiveWorkspaceTab(readingPositions.current.get(id)?.tab || "review");
    }
    setActiveBookId(id); setLibraryOpen(false); setSaveError("");
  }
  function navigateTo(tab: WorkspaceTab) {
    if (isSavingNewStudyItem) return;
    if (creatingStudyItemKind && !window.confirm(t("Discard the new unsaved item?", "저장되지 않은 새 항목을 버릴까요?"))) return;
    setCreatingStudyItemKind(null); setNewStudyItemDraft({});
    setActiveWorkspaceTab(tab); setSaveError("");
  }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasUnsavedChanges) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);
  useEffect(() => {
    if (!modern || isLoading) return;
    const url = new URL(window.location.href);
    if (libraryOpen) {
      for (const key of ["book", "chapter", "section"]) url.searchParams.delete(key);
      window.history.replaceState(null, "", url);
      return;
    }
    if (isBookLoading || !activeBook || loadedBookId !== activeBook.id || bookLoadError) return;
    url.searchParams.set("book", activeBook.id); url.searchParams.set("section", activeWorkspaceTab);
    if (selectedChapterId) url.searchParams.set("chapter", selectedChapterId); else url.searchParams.delete("chapter");
    window.history.replaceState(null, "", url);
  }, [modern, libraryOpen, isLoading, isBookLoading, activeBook?.id, activeWorkspaceTab, selectedChapterId, bookLoadError, loadedBookId]);
  useEffect(() => {
    if (!activeBook || !selectedChapter || chapterDetailById[selectedChapter.id]) return;
    const chapter = selectedChapter;
    const abort = new AbortController();
    setLoadingChapterId(chapter.id);
    fetch(`/api/books/${activeBook.id}/chapters/${chapter.id}`, { cache: "no-store", signal: abort.signal })
      .then(async response => {
        const payload = await response.json() as ChapterDetailResponse;
        if (!response.ok || !payload.chapter) throw new Error(payload.error || "Could not load this chapter.");
        if (abort.signal.aborted) return;
        const detail = payload.chapter;
        setChapterDetailById(current => ({ ...current, [chapter.id]: detail }));
        setChapterEditById(current => ({ ...current, [chapter.id]: current[chapter.id] || { chapterNumber: String(detail.chapterNumber), title: detail.title, textContent: detail.textContent } }));
      }).catch(error => { if (!abort.signal.aborted) setSaveError(error instanceof Error ? error.message : "Could not load this chapter."); })
      .finally(() => { if (!abort.signal.aborted) setLoadingChapterId(null); });
    return () => abort.abort();
  }, [activeBook?.id, selectedChapter?.id, bookLoadAttempt]);
  function setStatusMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setStatusToasts((current) => [...current, { id, message: trimmed, closing: false }].slice(-4));

    window.setTimeout(() => {
      setStatusToasts((current) => current.map((toast) => toast.id === id ? { ...toast, closing: true } : toast));
    }, 3900);

    window.setTimeout(() => {
      setStatusToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }

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
      t(`${sourceFiles.length} source${sourceFiles.length === 1 ? "" : "s"}`, `원본 ${sourceFiles.length}개`),
      t(`${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`, `챕터 ${chapters.length}개`),
      t(`${studySetCount} study set${studySetCount === 1 ? "" : "s"}`, `학습 세트 ${studySetCount}개`)
    ]
    : [];
  const hasChapters = chapters.length > 0;
  const hasStudySets = studySetCount > 0;
  const hasSourceFiles = sourceFiles.length > 0;

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

  const suggestedGenerationPlans = useMemo(() => buildAllocatedGenerationPlans(chapters), [chapters]);
  const generationTotals = useMemo(() => chapters.reduce(
    (totals, chapter) => {
      const draft = generationPlansByChapterId[chapter.id];
      if (draft && !draft.included) {
        return totals;
      }

      const fallback = suggestedGenerationPlans[chapter.id];

      return {
        vocabularyCount: totals.vocabularyCount + Math.max(0, Number(draft?.vocabularyCount ?? fallback?.vocabularyCount) || 0),
        multipleChoiceCount: totals.multipleChoiceCount + Math.max(0, Number(draft?.multipleChoiceCount ?? fallback?.multipleChoiceCount) || 0),
        shortAnswerCount: totals.shortAnswerCount + Math.max(0, Number(draft?.shortAnswerCount ?? fallback?.shortAnswerCount) || 0)
      };
    },
    { vocabularyCount: 0, multipleChoiceCount: 0, shortAnswerCount: 0 }
  ), [chapters, generationPlansByChapterId, suggestedGenerationPlans]);
  const includedGenerationChapterCount = useMemo(() => chapters.filter((chapter) => {
    const draft = generationPlansByChapterId[chapter.id];
    if (draft && !draft.included) {
      return false;
    }

    const fallback = suggestedGenerationPlans[chapter.id];
    const vocabularyCount = Math.max(0, Number(draft?.vocabularyCount ?? fallback?.vocabularyCount) || 0);
    const multipleChoiceCount = Math.max(0, Number(draft?.multipleChoiceCount ?? fallback?.multipleChoiceCount) || 0);
    const shortAnswerCount = Math.max(0, Number(draft?.shortAnswerCount ?? fallback?.shortAnswerCount) || 0);
    return vocabularyCount + multipleChoiceCount + shortAnswerCount > 0;
  }).length, [chapters, generationPlansByChapterId, suggestedGenerationPlans]);
  const generationSliderLimits = useMemo(() => {
    const suggestedTotals = Object.values(suggestedGenerationPlans).reduce(
      (totals, chapter) => {
        return {
          vocabularyCount: totals.vocabularyCount + Math.max(0, Number(chapter.vocabularyCount) || 0),
          multipleChoiceCount: totals.multipleChoiceCount + Math.max(0, Number(chapter.multipleChoiceCount) || 0),
          shortAnswerCount: totals.shortAnswerCount + Math.max(0, Number(chapter.shortAnswerCount) || 0)
        };
      },
      { vocabularyCount: 0, multipleChoiceCount: 0, shortAnswerCount: 0 }
    );

    return {
      vocabularyCount: Math.max(20, generationTotals.vocabularyCount, suggestedTotals.vocabularyCount * 2),
      multipleChoiceCount: Math.max(20, generationTotals.multipleChoiceCount, suggestedTotals.multipleChoiceCount * 2),
      shortAnswerCount: Math.max(10, generationTotals.shortAnswerCount, suggestedTotals.shortAnswerCount * 2)
    };
  }, [generationTotals, suggestedGenerationPlans]);
  const generationTotalControls: Array<{
    field: GenerationCountField;
    label: string;
    value: number;
    max: number;
  }> = [
    {
      field: "multipleChoiceCount",
      label: t("Multiple Choice", "객관식"),
      value: generationTotals.multipleChoiceCount,
      max: generationSliderLimits.multipleChoiceCount
    },
    {
      field: "shortAnswerCount",
      label: t("Short Answer", "단답형"),
      value: generationTotals.shortAnswerCount,
      max: generationSliderLimits.shortAnswerCount
    },
    {
      field: "vocabularyCount",
      label: t("Vocabulary", "단어"),
      value: generationTotals.vocabularyCount,
      max: generationSliderLimits.vocabularyCount
    }
  ];

  const pdfExportOptions: Array<{ type: PdfExportType; label: string; description: string }> = [
    { type: "chapter-summaries", label: t("Summaries", "요약"), description: t("Chapter-by-chapter teacher summaries.", "챕터별 교사용 요약입니다.") },
    { type: "multiple-choice", label: t("Questions", "문제"), description: t("Multiple-choice questions without answers.", "정답이 표시되지 않은 객관식 문제입니다.") },
    { type: "multiple-choice-concise-key", label: t("Answer Key", "답지"), description: t("Question numbers with answer letters only.", "문제 번호와 정답 선택지만 표시합니다.") },
    { type: "multiple-choice-key", label: t("Questions + Answers", "문제 + 답지"), description: t("Questions with choices, answers, and explanations.", "선택지, 정답, 해설을 함께 표시합니다.") },
    { type: "short-answer", label: t("Questions", "문제"), description: t("Short-answer prompts with writing lines.", "답안을 적을 줄이 있는 단답형 문제입니다.") },
    { type: "short-answer-key", label: t("Questions + Answers", "문제 + 답지"), description: t("Short-answer prompts with suggested answers.", "예시 답안이 포함된 단답형 답지입니다.") },
    { type: "vocabulary-list", label: t("Vocabulary List", "단어 목록"), description: t("Words with English and Korean meanings.", "영어와 한국어 뜻이 포함된 단어 목록입니다.") },
    { type: "vocabulary-quiz", label: t("Vocabulary Quiz", "단어 퀴즈"), description: t("Words with blank answer lines.", "답을 적을 빈칸이 있는 단어 퀴즈입니다.") }
  ];
  const exportOptionGroups = [
    {
      title: t("Summaries", "요약"),
      description: t("Chapter summaries for teacher preparation.", "수업 준비를 위한 챕터 요약입니다."),
      options: pdfExportOptions.filter((option) => option.type === "chapter-summaries")
    },
    {
      title: t("Multiple Choice", "객관식"),
      description: t("Student handouts plus concise or detailed answer keys.", "학생용 문제지와 간단/상세 답지를 내보냅니다."),
      options: pdfExportOptions.filter((option) => option.type.startsWith("multiple-choice"))
    },
    {
      title: t("Short Answer", "단답형"),
      description: t("Writing prompts and suggested-answer keys.", "단답형 문제와 예시 답안을 내보냅니다."),
      options: pdfExportOptions.filter((option) => option.type.startsWith("short-answer"))
    },
    {
      title: t("Vocabulary", "단어"),
      description: t("Word lists and vocabulary quiz sheets.", "단어 목록과 단어 퀴즈를 내보냅니다."),
      options: pdfExportOptions.filter((option) => option.type.startsWith("vocabulary"))
    }
  ];
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

        next[chapter.id] = suggestedGenerationPlans[chapter.id] || {
          included: true,
          vocabularyCount: "0",
          multipleChoiceCount: "0",
          shortAnswerCount: "0"
        };
      });
      return next;
    });
  }, [chapters, suggestedGenerationPlans]);

  useEffect(() => {
    let isMounted = true;

    fetchCurrentUser()
      .then((payload) => {
        if (!isMounted) {
          return;
        }

        setCurrentUser(payload.user);
        setCurrentUserIsAdmin(payload.isAdmin);
      })
      .catch((error) => {
        if (isMounted) {
          setCurrentUser(null);
          setCurrentUserIsAdmin(false);
          setStatusMessage(error instanceof Error ? error.message : "Could not load current user.");
        }
      });

    fetchBooks()
      .then((loadedBooks) => {
        if (!isMounted) {
          return;
        }

        setBooks(loadedBooks);
        const requested = new URLSearchParams(window.location.search).get("book");
        setActiveBookId(loadedBooks.find(book => book.id === requested)?.id || loadedBooks[0]?.id || null);
        if (modern) {
          const tab = new URLSearchParams(window.location.search).get("section");
          setActiveWorkspaceTab((["source", "split", "chapters", "review", "generate", "sets", "export"].includes(tab || "") ? tab : "review") as WorkspaceTab);
          setLibraryOpen(!loadedBooks.some(book => book.id === requested));
        }
      })
      .catch((error) => {
        if (isMounted) {
          setLibraryError(error instanceof Error ? error.message : "Could not load books.");
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
    currentBookRef.current = activeBook?.id || null;
    studyRequestEpoch.current += 1;
    setStudyLoadError("");
    if (!activeBook?.id) { setIsBookLoading(false); return; }
    const bookId = activeBook.id;
    let cancelled = false;
    setIsBookLoading(true);
    setBookLoadError("");
    setSourceFiles([]); setChapters([]); setStudySetCount(0); setGenerationRuns([]);
    setSelectedChapterId(null); setSourceOpen(false);
    setParsedDocumentsBySource({}); setSplitPreviewByParsedDocument({});
    setParsedDocumentDetailById({}); setParsedPagesByDocumentId({});
    setActiveParsedToolByDocumentId({}); setTextSearchByParsedDocument({});
    setManualMarkersByParsedDocument({}); setPageMarkersByParsedDocument({});
    // Chapter and item drafts are keyed by immutable IDs; retain them when switching books.
    setStudySetsByChapterId({}); setSelectedStudySetIdByChapterId({}); setStudyItemsByStudySetId({});
    Promise.all([fetchSourceFiles(bookId), fetchChapters(bookId), fetchBookStats(bookId), fetchGenerationRuns(bookId)])
      .then(async ([sources, loadedChapters, stats, runs]) => {
        const documents = await Promise.all(sources.map(async source => [source.id, await fetchParsedDocuments(bookId, source.id)] as const));
        if (cancelled) return;
        setLoadedBookId(bookId);
        setSourceFiles(sources); setChapters(loadedChapters); setStudySetCount(stats.studySetCount); setGenerationRuns(runs);
        setParsedDocumentsBySource(Object.fromEntries(documents));
        const query = new URLSearchParams(window.location.search);
        const chapterId = readingPositions.current.get(bookId)?.chapterId || (query.get("book") === bookId ? query.get("chapter") : null);
        setSelectedChapterId(loadedChapters.find(chapter => chapter.id === chapterId)?.id || loadedChapters[0]?.id || null);
      })
      .catch(error => { if (!cancelled) setBookLoadError(error instanceof Error ? error.message : "Could not load this book."); })
      .finally(() => { if (!cancelled) setIsBookLoading(false); });
    return () => { cancelled = true; };
  }, [activeBook?.id, bookLoadAttempt]);

  useEffect(() => {
    if ((activeWorkspaceTab === "export" || activeWorkspaceTab === "review" || (modern && activeWorkspaceTab === "sets")) && selectedChapter) {
      void loadStudySets(selectedChapter);
    }
  }, [activeWorkspaceTab, selectedChapter?.id, activeBook?.activeGenerationRunId, modern]);

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
          setCancellingGenerationRunId(null);
          setStudySetsByChapterId({});
          setSelectedStudySetIdByChapterId({});
          setStudyItemsByStudySetId({});
          await refreshActiveBookStats(activeBook.id);
          if ((activeWorkspaceTab === "review" || activeWorkspaceTab === "export") && selectedChapter) {
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
    if (modern || isBookLoading) return;
    if (!activeBook) {
      if (activeWorkspaceTab !== "source") {
        setActiveWorkspaceTab("source");
      }
      return;
    }

    if (activeWorkspaceTab === "split" && !hasSourceFiles) {
      setActiveWorkspaceTab("source");
      return;
    }

    if ((activeWorkspaceTab === "chapters" || activeWorkspaceTab === "generate") && !hasChapters) {
      setActiveWorkspaceTab("source");
      return;
    }

    if ((activeWorkspaceTab === "sets" || activeWorkspaceTab === "review" || activeWorkspaceTab === "export") && !hasStudySets) {
      setActiveWorkspaceTab(hasChapters ? "generate" : "source");
    }
  }, [activeBook, activeWorkspaceTab, hasChapters, hasSourceFiles, hasStudySets]);

  async function handleCreateBook() {
    if (isSavingNewStudyItem || isUploading || extractingSourceId || splittingParsedDocumentId) return;
    if (isGeneratingBook || generatingRun) { setStatusMessage(t("Finish or cancel generation before creating another book.", "다른 책을 만들기 전에 생성을 완료하거나 취소하세요.")); return; }
    setIsCreating(true);
    setStatusMessage("");

    try {
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
      setLibraryOpen(false);
      setActiveWorkspaceTab("source");
      setStatusMessage("Book created. Use Edit Book Info to add author or reading level.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not create the book.");
    } finally { setIsCreating(false); }
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

    try {
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
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Could not upload the source file.");
    } finally { setIsUploading(false); }
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
    } catch (error) {
      setGenerationRuns([]);
      setStatusMessage(error instanceof Error ? error.message : "Could not load generation history.");
    }
  }

  function updateBookInState(book: BookSummary) {
    setBooks((current) => current.map((item) => item.id === book.id ? book : item));
  }

  async function handleToggleBookPin(book: BookSummary) {
    const response = await fetch(`/api/books/${book.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: book.title,
        author: book.author,
        readingLevel: book.readingLevel,
        pinned: !book.pinnedAt
      })
    });
    const payload = (await response.json().catch(() => ({}))) as BookResponse;

    if (!response.ok || !payload.book) {
      setStatusMessage(payload.error || "Could not update pinned book.");
      return;
    }

    updateBookInState(payload.book);
    setStatusMessage(payload.book.pinnedAt ? "Book pinned." : "Book unpinned.");
  }

  async function handleSelectActiveGenerationRun(generationRunId: string | null) {
    if (!activeBook || switchingVersion) return;
    const bookId = activeBook.id;
    setSwitchingVersion(true); setSaveError("");
    try {
      const response = await fetch(`/api/books/${bookId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeGenerationRunId: generationRunId })
      });
      const payload = await response.json() as BookResponse;
      if (!response.ok || !payload.book) throw new Error(payload.error || "Could not select guide version.");
      if (currentBookRef.current !== bookId) return;
      studyRequestEpoch.current += 1;
      setStudySetsByChapterId({}); setSelectedStudySetIdByChapterId({}); setStudyItemsByStudySetId({});
      setStudyLoadError("");
      updateBookInState(payload.book);
      setStatusMessage(t("Guide version selected.", "학습지 버전이 선택되었습니다."));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not select guide version. Try again.");
    } finally { setSwitchingVersion(false); }
  }

  useEffect(() => {
    const dialog = bookDialogRef.current;
    if (isBookMetadataOpen && dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector("input")?.focus();
    }
  }, [isBookMetadataOpen]);

  useEffect(() => {
    const dialog = renameDialogRef.current;
    if (renamingGenerationRunId && dialog && !dialog.open) dialog.showModal();
  }, [renamingGenerationRunId]);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const menu = userMenuRef.current;
    const dismiss = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Node && !menu?.contains(event.target)) setIsUserMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsUserMenuOpen(false);
      menu?.querySelector<HTMLButtonElement>(".library-user-button")?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [isUserMenuOpen]);

  function openBookMetadata() {
    if (!activeBook) return;
    setBookMetadataEdit({ title: activeBook.title, author: activeBook.author || "", readingLevel: activeBook.readingLevel || "" });
    setBookMetadataError("");
    setIsBookMetadataOpen(true);
  }

  async function handleSaveBookMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeBook) {
      return;
    }

    if (isSavingBookMetadata || deletingId === activeBook.id) return;
    setIsSavingBookMetadata(true);
    setBookMetadataError("");
    try {
      const response = await fetch(`/api/books/${activeBook.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookMetadataEdit)
      });
      const payload = (await response.json().catch(() => ({}))) as BookResponse;
      if (!response.ok || !payload.book) throw new Error(payload.error || t("Could not save book details. Try again.", "책 정보를 저장하지 못했습니다. 다시 시도하세요."));
      updateBookInState(payload.book);
      setStatusMessage(t("Book details saved.", "책 정보가 저장되었습니다."));
      bookDialogRef.current?.close();
      setIsBookMetadataOpen(false);
    } catch (error) {
      setBookMetadataError(error instanceof Error && !(error instanceof TypeError) ? error.message : t("Could not save book details. Your changes are kept here; try again.", "책 정보를 저장하지 못했습니다. 수정한 내용은 유지됩니다. 다시 시도하세요."));
    } finally { setIsSavingBookMetadata(false); }
  }

  async function handleDeleteBook() {
    if (!activeBook || !window.confirm(`Delete "${activeBook.title}" and all of its files, chapters, and study sets?`)) {
      return;
    }

    setDeletingId(activeBook.id);
    setStatusMessage("");

    let response: Response;
    try {
      response = await fetch(`/api/books/${activeBook.id}`, { method: "DELETE" });
    } catch {
      setBookMetadataError(t("Could not delete book. Try again.", "책을 삭제하지 못했습니다. 다시 시도하세요."));
      setDeletingId(null);
      return;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setBookMetadataError(payload.error || t("Could not delete book. Try again.", "책을 삭제하지 못했습니다. 다시 시도하세요."));
      setDeletingId(null);
      return;
    }

    const remaining = books.filter((book) => book.id !== activeBook.id);
    setBooks(remaining);
    setActiveBookId(remaining[0]?.id || null);
    setIsBookMetadataOpen(false);
    setIsSavingBookMetadata(false);
    setBookMetadataEdit({
      title: "",
      author: "",
      readingLevel: ""
    });
    setSourceFiles([]);
    setParsedDocumentsBySource({});
    setSplitPreviewByParsedDocument({});
    setParsedDocumentDetailById({});
    setParsedPagesByDocumentId({});
    setActiveParsedToolByDocumentId({});
    setChapters([]);
    setSelectedChapterId(null);
    discardChapterCaches(chapters.map(chapter => chapter.id));
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

    try {
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
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "The request failed. Please try again.");
    } finally { setExtractingSourceId(null); }
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

  function getPageMarkerRows(parsedDocumentId: string) {
    return pageMarkersByParsedDocument[parsedDocumentId] || [{
      chapterNumber: "1",
      pageNumber: "",
      title: "Chapter 1"
    }];
  }

  function buildPageStartsText(parsedDocumentId: string) {
    return getPageMarkerRows(parsedDocumentId)
      .map((row) => {
        const pageNumber = row.pageNumber.trim();
        if (!pageNumber) {
          return "";
        }

        const chapterTitle = row.title.trim() || `Chapter ${row.chapterNumber.trim() || ""}`.trim();
        return chapterTitle ? `${pageNumber} | ${chapterTitle}` : pageNumber;
      })
      .filter(Boolean)
      .join("\n");
  }

  function handleUpdatePageMarker(parsedDocumentId: string, index: number, field: keyof PageMarkerDraft, value: string) {
    setPageMarkersByParsedDocument((current) => {
      const rows = current[parsedDocumentId] || getPageMarkerRows(parsedDocumentId);
      return {
        ...current,
        [parsedDocumentId]: rows.map((row, rowIndex) => (
          rowIndex === index ? { ...row, [field]: value } : row
        ))
      };
    });
  }

  function handleAddPageMarker(parsedDocumentId: string) {
    setPageMarkersByParsedDocument((current) => {
      const rows = current[parsedDocumentId] || getPageMarkerRows(parsedDocumentId);
      const nextChapterNumber = String(rows.length + 1);
      return {
        ...current,
        [parsedDocumentId]: [
          ...rows,
          {
            chapterNumber: nextChapterNumber,
            pageNumber: "",
            title: `Chapter ${nextChapterNumber}`
          }
        ]
      };
    });
  }

  function handleRemovePageMarker(parsedDocumentId: string, index: number) {
    setPageMarkersByParsedDocument((current) => {
      const rows = current[parsedDocumentId] || getPageMarkerRows(parsedDocumentId);
      const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
      return {
        ...current,
        [parsedDocumentId]: nextRows.length ? nextRows : getPageMarkerRows(parsedDocumentId)
      };
    });
  }

  async function handleCreateChapters(parsedDocument: ParsedDocument, markersText = "", pageStartsText = "") {
    if (!activeBook) {
      return;
    }

    setSplittingParsedDocumentId(parsedDocument.id);
    setStatusMessage("");

    try {
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

      const added = payload.chapters;
      setChapters(current => [...current.filter(chapter => !added.some(next => next.id === chapter.id)), ...added].sort((a, b) => a.sortOrder - b.sortOrder || a.chapterNumber - b.chapterNumber));
      setSelectedChapterId(payload.chapters[0]?.id || null);
      setStudySetsByChapterId({});
      setSelectedStudySetIdByChapterId({});
      setStudyItemsByStudySetId({});
      setActiveWorkspaceTab("chapters");
      setStatusMessage(`Created ${payload.chapters.length} chapter${payload.chapters.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "The request failed. Please try again.");
    } finally { setSplittingParsedDocumentId(null); }
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
    setPageMarkersByParsedDocument((current) => current[parsedDocument.id] ? current : {
      ...current,
      [parsedDocument.id]: getPageMarkerRows(parsedDocument.id)
    });
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

    try {
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
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "The request failed. Please try again.");
    } finally { setPreviewingParsedDocumentId(null); }
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
    setPageMarkersByParsedDocument((current) => {
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
    discardChapterCaches(chapters.map(chapter => chapter.id));
    setStudySetsByChapterId({});
    setSelectedStudySetIdByChapterId({});
    setStudyItemsByStudySetId({});
    setStudySetCount(0);
    setStatusMessage("Chapters cleared.");
    setDeletingId(null);
  }

  async function loadStudyItems(studySetId: string, chapterId?: string | null) {
    const cacheKey = studyItemsCacheKey(studySetId, chapterId);
    if (!activeBook || studyItemsByStudySetId[cacheKey]) {
      return;
    }

    setLoadingStudyItemsSetId(studySetId);
    const epoch = studyRequestEpoch.current;
    setStudyLoadError("");

    try {
      const items = await fetchStudyItems(activeBook.id, studySetId, chapterId);
      if (epoch !== studyRequestEpoch.current) return;
      setStudyItemsByStudySetId((current) => ({
        ...current,
        [cacheKey]: items
      }));
    } catch (error) {
      if (epoch === studyRequestEpoch.current) setStudyLoadError(error instanceof Error ? error.message : "Could not load generated study items.");
    } finally {
      if (epoch === studyRequestEpoch.current) setLoadingStudyItemsSetId(null);
    }
  }

  async function loadStudySets(chapter: ChapterSummary, generationRunId = activeBook?.activeGenerationRunId) {
    if (!activeBook) {
      return;
    }

    setLoadingStudySetsChapterId(chapter.id);
    const epoch = studyRequestEpoch.current;
    setStudyLoadError("");

    try {
      const studySets = await fetchStudySets(activeBook.id, chapter.id, generationRunId);
      if (epoch !== studyRequestEpoch.current) return;
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
        await loadStudyItems(selectedId, chapter.id);
      } else {
        setSelectedStudySetIdByChapterId((current) => {
          const next = { ...current };
          delete next[chapter.id];
          return next;
        });
      }
    } catch (error) {
      if (epoch === studyRequestEpoch.current) setStudyLoadError(error instanceof Error ? error.message : "Could not load study sets.");
    } finally {
      if (epoch === studyRequestEpoch.current) setLoadingStudySetsChapterId(null);
    }
  }

  function handleSelectChapter(chapter: ChapterSummary) {
    if (isSavingNewStudyItem) return;
    if (creatingStudyItemKind && !window.confirm(t("Discard the new unsaved item?", "저장되지 않은 새 항목을 버릴까요?"))) return;
    setCreatingStudyItemKind(null);
    setNewStudyItemDraft({});
    setSelectedChapterId(chapter.id);
    setSaveError("");
  }

  async function handleSelectStudySet(chapterId: string, studySetId: string) {
    if (isSavingNewStudyItem) return;
    if (creatingStudyItemKind && !window.confirm(t("Discard the new unsaved item?", "저장되지 않은 새 항목을 버릴까요?"))) return;
    setCreatingStudyItemKind(null); setNewStudyItemDraft({});
    setSelectedStudySetIdByChapterId((current) => ({
      ...current,
      [chapterId]: studySetId
    }));
    await loadStudyItems(studySetId, chapterId);
  }

  function discardChapterCaches(ids: string[]) {
    setChapterDetailById(current => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))));
    setChapterEditById(current => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))));
  }

  function handleChapterEdit(chapterId: string, updates: Partial<{ chapterNumber: string; title: string; textContent: string }>) {
    if (savingChapterId === chapterId) return;
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

    setSaveError("");
    try {
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
        throw new Error(payload.error || "Could not save this chapter.");
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save changes.";
      setSaveError(`${message} ${t("Your draft is retained. Choose Save to retry.", "수정 내용이 유지됩니다. 저장을 눌러 다시 시도하세요.")}`);
    } finally {
      setSavingChapterId(null);
    }
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
      setStatusMessage("Generation queued. You can close this page; progress is saved.");
    } finally {
      window.clearInterval(pollId);
      setGeneratingChapterId(null);
      setIsGeneratingBook(false);
      setCancellingGenerationRunId(null);
      setStudySetsByChapterId({});
      setSelectedStudySetIdByChapterId({});
      setStudyItemsByStudySetId({});
      await refreshGenerationRuns(activeBook.id);
      await refreshActiveBookStats(activeBook.id);
      if ((activeWorkspaceTab === "review" || activeWorkspaceTab === "export") && selectedChapter) {
        await loadStudySets(selectedChapter, generationRun.id);
      }
    }
  }

  async function handleCancelGenerationRun() {
    if (!activeBook || !generatingRun || cancellingGenerationRunId) {
      return;
    }

    const confirmed = window.confirm(t(
      "Cancel this generation run? The current chapter may finish before the run stops.",
      "이 생성 작업을 취소할까요? 현재 처리 중인 챕터는 완료된 뒤 중단될 수 있습니다."
    ));
    if (!confirmed) {
      return;
    }

    setCancellingGenerationRunId(generatingRun.id);
    setStatusMessage("");

    const response = await fetch(`/api/books/${activeBook.id}/generation-runs/${generatingRun.id}/cancel`, {
      method: "POST"
    });
    const payload = (await response.json().catch(() => ({}))) as GenerationRunsResponse;

    if (!response.ok || !payload.generationRun) {
      setStatusMessage(payload.error || "Could not cancel generation.");
      setCancellingGenerationRunId(null);
      return;
    }

    setGenerationRuns((current) => current.map((run) => run.id === payload.generationRun?.id ? payload.generationRun : run));
    setGenerationLog(payload.generationRun.log);
    setStatusMessage("Cancellation requested.");
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

  function updateGenerationRunDraft(runId: string, value: string) {
    setGenerationRunDraftById((current) => ({
      ...current,
      [runId]: value
    }));
  }

  function openGenerationRunRenameModal(run: GenerationRunSummary) {
    setRenameError("");
    setGenerationRunDraftById((current) => ({
      ...current,
      [run.id]: run.name
    }));
    setRenamingGenerationRunId(run.id);
  }

  async function handleSaveGenerationRunName(run: GenerationRunSummary) {
    if (!activeBook || savingGenerationRunId) return;
    const nextName = (generationRunDraftById[run.id] ?? run.name).trim();
    if (!nextName) {
      setRenameError(t("Enter a version name.", "버전 이름을 입력하세요."));
      return;
    }
    if (nextName === run.name) return;
    setSavingGenerationRunId(run.id);
    setRenameError("");
    try {
      const response = await fetch(`/api/books/${activeBook.id}/generation-runs/${run.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nextName })
      });
      const payload = (await response.json().catch(() => ({}))) as GenerationRunsResponse;
      if (!response.ok || !payload.generationRun) throw new Error(payload.error || t("Could not rename this version. Try again.", "버전 이름을 변경하지 못했습니다. 다시 시도하세요."));
      const updated = payload.generationRun;
      setGenerationRuns(current => current.map(item => item.id === updated.id ? updated : item));
      setGenerationRunDraftById(current => ({ ...current, [run.id]: updated.name }));
      renameDialogRef.current?.close();
      setStatusMessage(t("Version renamed.", "버전 이름이 변경되었습니다."));
    } catch (error) {
      setRenameError(error instanceof Error && !(error instanceof TypeError) ? error.message : t("Could not connect. Try again.", "연결하지 못했습니다. 다시 시도하세요."));
    } finally {
      setSavingGenerationRunId(null);
    }
  }

  function handleExportStudySet(type: PdfExportType, format: ExportFileFormat) {
    if (!activeBook || !selectedStudySet) {
      setStatusMessage("Select a study set before exporting.");
      return;
    }

    const params = new URLSearchParams({ type, format });
    if (selectedChapter?.id) {
      params.set("chapterId", selectedChapter.id);
    }
    const url = `/api/books/${activeBook.id}/study-sets/${selectedStudySet.id}/export?${params.toString()}`;
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
    if (isSavingNewStudyItem) return;
    setEditingStudyItemId(item.id);
    if (studyItemDraftById[item.id]) return;

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
          choiceA: question.choices[0] || "",
          choiceB: question.choices[1] || "",
          choiceC: question.choices[2] || "",
          choiceD: question.choices[3] || "",
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

  function cancelStudyItemEdit(itemId: string) {
    if (savingStudyItemId === itemId) return;
    setStudyItemDraftById(current => { const next = { ...current }; delete next[itemId]; return next; });
    setDirtyItemIds(current => current.filter(id => id !== itemId));
    setEditingStudyItemId(null); setSaveError("");
  }

  function updateStudyItemDraft(itemId: string, updates: Record<string, string>) {
    if (savingStudyItemId === itemId) return;
    setDirtyItemIds(current => current.includes(itemId) ? current : [...current, itemId]);
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
        choices: [draft.choiceA, draft.choiceB, draft.choiceC, draft.choiceD].map((choice) => (choice || "").trim()),
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

  function getEmptyStudyItemDraft(kind: StudyItemKind): Record<string, string> {
    if (kind === "vocabulary") {
      return {
        term: "",
        definition: "",
        contextSentence: "",
        status: "reviewed"
      };
    }

    if (kind === "multiple-choice") {
      return {
        questionText: "",
        choiceA: "",
        choiceB: "",
        choiceC: "",
        choiceD: "",
        correctChoiceIndex: "0",
        explanation: "",
        status: "reviewed"
      };
    }

    return {
      questionText: "",
      suggestedAnswer: "",
      rubric: "",
      status: "reviewed"
    };
  }

  function startCreatingStudyItem(kind: StudyItemKind, atEnd = false) {
    if (isSavingNewStudyItem) return;
    if (editingStudyItemId && dirtyItemIds.includes(editingStudyItemId)) {setStatusMessage(t("Save or cancel your current edit first.", "현재 수정 내용을 먼저 저장하거나 취소하세요."));return;}
    if (creatingStudyItemKind === kind) {document.querySelector<HTMLInputElement | HTMLTextAreaElement>(".study-item-create-card input, .study-item-create-card textarea")?.focus();return;}
    if (creatingStudyItemKind && !window.confirm(t("Discard the new unsaved item?", "저장되지 않은 새 항목을 버릴까요?"))) return;
    setNewItemAtEnd(atEnd);
    setCreatingStudyItemKind(kind);
    setEditingStudyItemId(null);
    setNewStudyItemDraft(getEmptyStudyItemDraft(kind));
  }

  function updateNewStudyItemDraft(updates: Record<string, string>) {
    if (isSavingNewStudyItem) return;
    setNewStudyItemDraft((current) => ({
      ...current,
      ...updates
    }));
  }

  function getAddStudyItemLabel(kind: StudyItemKind) {
    if (kind === "vocabulary") {
      return t("Add Word", "단어 추가");
    }

    return t("Add Question", "문제 추가");
  }

  function buildAppendStudyItemsPayload(kind: StudyItemKind, item: ReturnType<typeof buildStudyItemPayload>) {
    if (kind === "vocabulary") {
      return { chapterSummaries: [], vocabularyItems: [item], multipleChoiceQuestions: [], shortAnswerQuestions: [] };
    }

    if (kind === "multiple-choice") {
      return { chapterSummaries: [], vocabularyItems: [], multipleChoiceQuestions: [item], shortAnswerQuestions: [] };
    }

    return { chapterSummaries: [], vocabularyItems: [], multipleChoiceQuestions: [], shortAnswerQuestions: [item] };
  }

  function getGenerationPlanPayload(chapter: ChapterSummary) {
    const draft = generationPlansByChapterId[chapter.id];
    const fallback = suggestedGenerationPlans[chapter.id];

    return {
      vocabularyCount: Math.max(0, Number(draft?.vocabularyCount ?? fallback?.vocabularyCount) || 0),
      multipleChoiceCount: Math.max(0, Number(draft?.multipleChoiceCount ?? fallback?.multipleChoiceCount) || 0),
      shortAnswerCount: Math.max(0, Number(draft?.shortAnswerCount ?? fallback?.shortAnswerCount) || 0)
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

  function updateGenerationPlan(chapterId: string, field: GenerationCountField, value: string) {
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

  function applyGenerationTotal(field: GenerationCountField, totalValue: string | number) {
    const total = Math.max(0, Math.round(Number(totalValue) || 0));

    setGenerationPlansByChapterId((current) => {
      const includedChapters = chapters.filter((chapter) => current[chapter.id]?.included !== false);
      const allocatedCounts = allocateCountByWordWeight(
        includedChapters.map((chapter) => ({ id: chapter.id, wordCount: chapter.wordCount })),
        total
      );

      if (includedChapters.length === 0) {
        return current;
      }

      const next = { ...current };
      chapters.forEach((chapter) => {
        const suggested = suggestedGenerationPlans[chapter.id];
        const existing = current[chapter.id];
        next[chapter.id] = {
          included: existing?.included ?? true,
          vocabularyCount: existing?.vocabularyCount ?? suggested?.vocabularyCount ?? "0",
          multipleChoiceCount: existing?.multipleChoiceCount ?? suggested?.multipleChoiceCount ?? "0",
          shortAnswerCount: existing?.shortAnswerCount ?? suggested?.shortAnswerCount ?? "0",
          [field]: existing?.included === false ? (existing[field] ?? "0") : String(allocatedCounts[chapter.id] ?? 0)
        };
      });

      return next;
    });
  }

  function toggleGenerationChapter(chapter: ChapterSummary, included: boolean) {
    const suggested = suggestedGenerationPlans[chapter.id];
    setGenerationPlansByChapterId((current) => ({
      ...current,
      [chapter.id]: {
        included,
        vocabularyCount: current[chapter.id]?.vocabularyCount || suggested?.vocabularyCount || "0",
        multipleChoiceCount: current[chapter.id]?.multipleChoiceCount || suggested?.multipleChoiceCount || "0",
        shortAnswerCount: current[chapter.id]?.shortAnswerCount || suggested?.shortAnswerCount || "0"
      }
    }));
  }

  function resetGenerationPlans() {
    setGenerationPlansByChapterId(suggestedGenerationPlans);
  }

  async function handleSaveStudyItem(kind: StudyItemKind, itemId: string) {
    if (!activeBook || !selectedStudySetId) {
      return;
    }

    const draft = studyItemDraftById[itemId] || {};
    setSavingStudyItemId(itemId);
    setStatusMessage("");

    const cacheKey = studyItemsCacheKey(selectedStudySetId, selectedChapter?.id);
    const params = new URLSearchParams();
    if (selectedChapter?.id) {
      params.set("chapterId", selectedChapter.id);
    }
    setSaveError("");
    try {
      const response = await fetch(`/api/books/${activeBook.id}/study-sets/${selectedStudySetId}/items/${kind}/${itemId}?${params.toString()}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildStudyItemPayload(kind, draft))
      });
      const payload = (await response.json().catch(() => ({}))) as StudyItemsResponse;

      if (!response.ok || !payload.items) {
        throw new Error(payload.error || "Could not save generated item.");
      }

      setStudyItemsByStudySetId((current) => ({
        ...current,
        [cacheKey]: payload.items as StudyItems
      }));
      setStudyItemDraftById(current => { const next = { ...current }; delete next[itemId]; return next; });
      setDirtyItemIds(current => current.filter(id => id !== itemId));
      setEditingStudyItemId(current => current === itemId ? null : current);
      setStatusMessage("Generated item saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save changes.";
      setSaveError(`${message} ${t("Your draft is retained. Choose Save to retry.", "수정 내용이 유지됩니다. 저장을 눌러 다시 시도하세요.")}`);
    } finally {
      setSavingStudyItemId(null);
    }
  }

  async function handleCreateStudyItem(kind: StudyItemKind) {
    if (!activeBook || !selectedStudySetId) {
      return;
    }

    setIsSavingNewStudyItem(true);
    setStatusMessage("");

    const cacheKey = studyItemsCacheKey(selectedStudySetId, selectedChapter?.id);
    setSaveError("");
    try {
      const response = await fetch(`/api/books/${activeBook.id}/study-sets/${selectedStudySetId}/items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chapterId: selectedChapter?.id || null,
          ...buildAppendStudyItemsPayload(kind, buildStudyItemPayload(kind, newStudyItemDraft))
        })
      });
      const payload = (await response.json().catch(() => ({}))) as StudyItemsResponse;

      if (!response.ok || !payload.items) {
        throw new Error(payload.error || "Could not add generated item.");
      }

      setStudyItemsByStudySetId((current) => ({
        ...current,
        [cacheKey]: payload.items as StudyItems
      }));
      setCreatingStudyItemKind(null);
      setNewStudyItemDraft({});
      setStatusMessage(kind === "vocabulary" ? t("Vocabulary item added.", "단어가 추가되었습니다.") : t("Question added.", "문제가 추가되었습니다."));
    } catch (error) {
      setSaveError(`${error instanceof Error ? error.message : "Could not save this item."} ${t("Your draft is retained. Check whether the item was saved before retrying.", "수정 내용이 유지됩니다. 다시 시도하기 전에 항목이 저장되었는지 확인하세요.")}`);
    } finally { setIsSavingNewStudyItem(false); }
  }

  async function handleMoveStudyItem(kind: StudyItemKind, itemId: string, direction: "up" | "down" | {targetId:string}) {
    if (!activeBook || !selectedStudySetId || movingStudyItemId || savingStudyItemId || deletingId || isSavingNewStudyItem) return;
    setMovingStudyItemId(itemId); setStatusMessage("");
    const cacheKey = studyItemsCacheKey(selectedStudySetId, selectedChapter?.id);
    const params = new URLSearchParams(selectedChapter?.id ? {chapterId:selectedChapter.id} : {});
    try {
      const response = await fetch(`/api/books/${activeBook.id}/study-sets/${selectedStudySetId}/items/${kind}/${itemId}?${params}`, {
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(typeof direction === "object" ? direction : {direction})
      });
      const payload = await response.json() as StudyItemsResponse;
      if (!response.ok || !payload.items) throw new Error(payload.error || "Could not reorder questions.");
      setStudyItemsByStudySetId(current=>({...current,[cacheKey]:payload.items!}));
      setStatusMessage(t("Order saved.", "순서가 저장되었습니다."));
    } catch(error) { setStatusMessage(error instanceof Error ? error.message : "Could not save order. Reload before retrying."); }
    finally {setMovingStudyItemId(null);}
  }

  async function handleDeleteStudyItem(kind: StudyItemKind, itemId: string) {
    if (!activeBook || !selectedStudySetId || deletingId || savingStudyItemId || movingStudyItemId) return;
    setDeletingId(itemId); setStatusMessage("");
    try {
      const response = await fetch(`/api/books/${activeBook.id}/study-sets/${selectedStudySetId}/items/${kind}/${itemId}`, {method:"DELETE"});
      if(!response.ok) throw new Error("Could not delete item.");
      const cacheKey=studyItemsCacheKey(selectedStudySetId,selectedChapter?.id);
      const items=await fetchStudyItems(activeBook.id,selectedStudySetId,selectedChapter?.id);
      setStudyItemsByStudySetId(current=>({...current,[cacheKey]:items}));
      setEditingStudyItemId(current=>current===itemId?null:current);
      setDirtyItemIds(current=>current.filter(id=>id!==itemId));
      setStudyItemDraftById(current=>{const next={...current};delete next[itemId];return next;});
      setPendingDeleteItemId(null);setStatusMessage(t("Item deleted.", "항목이 삭제되었습니다."));
    } catch(error) {setStatusMessage(error instanceof Error?error.message:"Could not delete item. Reload before retrying.");}
    finally {setDeletingId(null);}
  }

  function renderMoveStudyItemButtons(kind: StudyItemKind, itemId: string, index: number, itemCount: number) {
    return (
      <span className="study-item-move-actions" aria-label={t("Reorder item", "항목 순서 변경")}>
        <button
          type="button"
          disabled={index === 0 || movingStudyItemId === itemId}
          title={t("Move up", "위로 이동")}
          aria-label={t("Move up", "위로 이동")}
          onClick={() => handleMoveStudyItem(kind, itemId, "up")}
        >
          <UiIcon name="arrowUp" />
        </button>
        <button
          type="button"
          disabled={index === itemCount - 1 || movingStudyItemId === itemId}
          title={t("Move down", "아래로 이동")}
          aria-label={t("Move down", "아래로 이동")}
          onClick={() => handleMoveStudyItem(kind, itemId, "down")}
        >
          <UiIcon name="arrowDown" />
        </button>
      </span>
    );
  }

  function renderSecondaryStudyActions(kind: StudyItemKind, itemId: string, index: number, count: number) {
    const busy = Boolean(deletingId || savingStudyItemId || movingStudyItemId || isSavingNewStudyItem);
    return <>
      {kind === "vocabulary" && renderMoveStudyItemButtons(kind,itemId,index,count)}
      {pendingDeleteItemId === itemId ? <span className="question-delete-confirm" role="group" aria-label={t("Confirm deletion", "삭제 확인")}>
        <span>{t("Delete this item?", "이 항목을 삭제할까요?")}</span>
        <button className="danger-button" type="button" disabled={busy} onClick={()=>void handleDeleteStudyItem(kind,itemId)}>{t("Delete", "삭제")}</button>
        <button type="button" disabled={busy} onClick={()=>setPendingDeleteItemId(null)}>{t("Keep", "유지")}</button>
      </span> : <button type="button" disabled={busy} onClick={()=>setPendingDeleteItemId(itemId)}>{t("Delete", "삭제")}</button>}
    </>;
  }

  useEffect(() => {
    if (creatingStudyItemKind) {
      const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(".study-item-create-card input, .study-item-create-card textarea");
      field?.focus(); field?.scrollIntoView({block:"nearest",behavior:"smooth"});
    }
  }, [creatingStudyItemKind]);

  function renderNewStudyItemForm(kind: StudyItemKind) {
    if (creatingStudyItemKind !== kind) {
      return null;
    }

    return (
      <article className="study-item-card study-item-create-card">
        <div className="study-item-edit-form">
          {kind === "vocabulary" ? (
            <>
              <label>
                {t("Word", "단어")}
                <input
                  placeholder={t("Word", "단어")}
                  value={newStudyItemDraft.term || ""}
                  onChange={(event) => updateNewStudyItemDraft({ term: event.target.value })}
                />
              </label>
              <label>
                {t("Definition", "뜻")}
                <textarea
                  placeholder={t("English definition | Korean definition", "영어 뜻 | 한국어 뜻")}
                  rows={3}
                  value={newStudyItemDraft.definition || ""}
                  onChange={(event) => updateNewStudyItemDraft({ definition: event.target.value })}
                />
              </label>
              <label>
                {t("Example sentence", "예문")}
                <textarea
                  placeholder={t("Example sentence", "예문")}
                  rows={3}
                  value={newStudyItemDraft.contextSentence || ""}
                  onChange={(event) => updateNewStudyItemDraft({ contextSentence: event.target.value })}
                />
              </label>
            </>
          ) : kind === "multiple-choice" ? (
            <>
              <label>
                {t("Question", "문제")}
                <textarea
                  placeholder={t("Question", "문제")}
                  rows={3}
                  value={newStudyItemDraft.questionText || ""}
                  onChange={(event) => updateNewStudyItemDraft({ questionText: event.target.value })}
                />
              </label>
              <fieldset className="mcq-choices"><legend>{t("Choices", "선택지")}</legend>
                <div className="mcq-choice-field-grid">
                  {[0, 1, 2, 3].map((index) => {
                    const choiceKey = getChoiceDraftKey(index);
                    return (
                      <label className="mcq-choice-field" key={choiceKey}>
                        <span>{getChoiceLabel(index)}</span>
                        <input
                          value={newStudyItemDraft[choiceKey] || ""}
                          onChange={(event) => updateNewStudyItemDraft({ [choiceKey]: event.target.value })}
                        />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label>
                {t("Correct answer", "정답")}
                <select
                  value={newStudyItemDraft.correctChoiceIndex || "0"}
                  onChange={(event) => updateNewStudyItemDraft({ correctChoiceIndex: event.target.value })}
                >
                  {[0, 1, 2, 3].map((index) => (
                    <option key={index} value={String(index)}>
                      {getChoiceLabel(index)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Explanation", "해설")}
                <textarea
                  placeholder={t("Explanation", "해설")}
                  rows={3}
                  value={newStudyItemDraft.explanation || ""}
                  onChange={(event) => updateNewStudyItemDraft({ explanation: event.target.value })}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                {t("Question", "문제")}
                <textarea
                  placeholder={t("Question", "문제")}
                  rows={3}
                  value={newStudyItemDraft.questionText || ""}
                  onChange={(event) => updateNewStudyItemDraft({ questionText: event.target.value })}
                />
              </label>
              <label>
                {t("Suggested answer", "예시 답안")}
                <textarea
                  placeholder={t("Suggested answer", "예시 답안")}
                  rows={4}
                  value={newStudyItemDraft.suggestedAnswer || ""}
                  onChange={(event) => updateNewStudyItemDraft({ suggestedAnswer: event.target.value })}
                />
              </label>
              <label>
                {t("Rubric", "채점 기준")}
                <textarea
                  placeholder={t("Rubric", "채점 기준")}
                  rows={4}
                  value={newStudyItemDraft.rubric || ""}
                  onChange={(event) => updateNewStudyItemDraft({ rubric: event.target.value })}
                />
              </label>
            </>
          )}
        </div>
        <div className="study-item-actions">
          <button type="button" disabled={isSavingNewStudyItem} onClick={() => handleCreateStudyItem(kind)}>
            {isSavingNewStudyItem ? t("Saving...", "저장 중...") : t("Save", "저장")}
          </button>
          <button type="button" disabled={isSavingNewStudyItem} onClick={() => {
            setCreatingStudyItemKind(null);
            setNewStudyItemDraft({});
          }}>
            {t("Cancel", "취소")}
          </button>
        </div>
      </article>
    );
  }

  const preferences = (
        <div className="library-user-menu" ref={userMenuRef}>
          <button
            className="library-user-button"
            type="button"
            aria-expanded={isUserMenuOpen}
            aria-controls={isUserMenuOpen ? "account-links" : undefined}
            aria-label={t("Open user preferences", "사용자 설정 열기")}
            title={t("User preferences", "사용자 설정")}
            onClick={() => setIsUserMenuOpen((current) => !current)}
          >
            <span className="user-avatar">
              <UiIcon name="user" />
            </span>
            {!modern && !isLibraryCollapsed ? (
              <>
                <span className="user-menu-copy">
                  <strong>{currentUserLabel}</strong>
                  <small>{currentUserMeta}</small>
                </span>
                <span className="user-menu-caret">
                  <UiIcon name={isUserMenuOpen ? "chevronDown" : "chevronUp"} />
                </span>
              </>
            ) : null}
          </button>
          {isUserMenuOpen ? (
            <div id="account-links" className="library-user-popover" aria-label={t("User preferences", "사용자 설정")}>
              {currentUser ? (
                <div className="preference-user-summary">
                  <strong>{currentUser.displayName || currentUser.email}</strong>
                  <small>{currentUser.email}</small>
                </div>
              ) : null}
              {!modern && <>
              <button
                className="preference-row"
                type="button"
                onClick={() => setThemeMode((current) => current === "dark" ? "light" : "dark")}
              >
                <span className="preference-icon">
                  <UiIcon name={themeMode === "dark" ? "sun" : "moon"} />
                </span>
                <span>
                  <strong>{themeMode === "dark" ? t("Light Mode", "라이트 모드") : t("Dark Mode", "다크 모드")}</strong>
                </span>
              </button>
              <button
                className="preference-row"
                type="button"
                onClick={() => setUiLanguage((current) => current === "ko" ? "en" : "ko")}
              >
                <span className="preference-icon">
                  <UiIcon name="globe" />
                </span>
                <span>
                  <strong>{uiLanguage === "ko" ? "English" : "한국어"}</strong>
                </span>
              </button>
              </>}
              <a className="preference-row preference-row-danger" href="/api/logout">
                <span className="preference-icon">
                  <UiIcon name="logOut" />
                </span>
                <span>
                  <strong>{t("Log out", "로그아웃")}</strong>
                </span>
              </a>
              {currentUserIsAdmin ? (
              <a className="preference-row" href="/admin">
                <span className="preference-icon">
                  <UiIcon name="settings" />
                </span>
                <span>
                  <strong>{t("Admin", "관리자")}</strong>
                </span>
              </a>
              ) : null}
            </div>
          ) : null}

        </div>
  );

  return (
    <main className={`app-shell ${modern ? `reading-shell${activeWorkspaceTab === "chapters" ? " reading-text-view" : ""}` : isLibraryCollapsed ? "library-collapsed" : ""}`}>
      {modern && <WorkspaceBar books={books} bookId={activeBook?.id || ""} libraryOpen={libraryOpen}
        onLibrary={() => setLibraryOpen(true)} onBook={selectBook} preferences={<>
          <ThemeToggle dark={themeMode === "dark"} label={t("Toggle dark mode", "다크 모드 전환")} text={themeMode === "dark" ? t("Light", "라이트") : t("Dark", "다크")} onToggle={() => setThemeMode(current => current === "dark" ? "light" : "dark")} />
          <select className="reading-language-toggle" aria-label={t("Interface language", "화면 언어")} value={uiLanguage} onChange={event => setUiLanguage(event.target.value as UiLanguage)}><option value="en">English</option><option value="ko">한국어</option></select>
          {preferences}
        </>} t={t} />}
      {modern && libraryOpen && <SavedLibrary books={filteredBooks} total={books.length} search={bookSearch} onSearch={setBookSearch}
        sort={bookSortMode} onSort={value => setBookSortMode(value as BookSortMode)} onBook={selectBook}
        onPin={book => { const full = books.find(b => b.id === book.id); if (full) void handleToggleBookPin(full); }}
        onCreate={() => void handleCreateBook()} creating={isCreating} loading={isLoading} error={libraryError}
        onRetry={() => window.location.reload()} t={t} />}
      {!modern && (
      <aside className="library-panel">
        <div className="library-panel-top">
          <div className="brand-block">
            <span className="brand-mark">TR</span>
            <div>
              <h1>TopReading</h1>
              <p>{t("Study Guide Creator", "학습지 제작 도구")}</p>
            </div>
          </div>
          <button
            className="collapse-sidebar-button"
            type="button"
          aria-label={isLibraryCollapsed ? t("Expand library sidebar", "도서 목록 펼치기") : t("Collapse library sidebar", "도서 목록 접기")}
          onClick={() => setIsLibraryCollapsed((current) => !current)}
        >
          <UiIcon name={isLibraryCollapsed ? "arrowRight" : "arrowLeft"} />
        </button>
        </div>

        {!isLibraryCollapsed ? (
          <div className="library-main">
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

            <label className="book-sort">
              {t("Sort books", "도서 정렬")}
              <select value={bookSortMode} onChange={(event) => setBookSortMode(event.target.value as BookSortMode)}>
                <option value="newest">{t("Newest", "최신순")}</option>
                <option value="oldest">{t("Oldest", "오래된순")}</option>
                <option value="az">{t("A to Z", "가나다순")}</option>
                <option value="za">{t("Z to A", "가나다 역순")}</option>
              </select>
            </label>

            <section className="library-list" aria-label={t("Book library", "도서 목록")}>
              {isLoading ? <p className="muted-text">{t("Loading library...", "도서 목록을 불러오는 중...")}</p> : null}
              {!isLoading && books.length === 0 ? <p className="muted-text">{t("No books yet.", "아직 등록된 책이 없습니다.")}</p> : null}
              {!isLoading && books.length > 0 && filteredBooks.length === 0 ? <p className="muted-text">{t("No matching books.", "검색 결과가 없습니다.")}</p> : null}
              {filteredBooks.map((book) => (
                <div
                  className={`book-row ${book.id === activeBook?.id ? "active" : ""}`}
                  key={book.id}
                >
                  <button
                    className="book-row-main"
                    type="button"
                    onClick={() => selectBook(book.id)}
                  >
                    <span className="book-row-title">{book.title}</span>
                  </button>
                  <button
                    className={`book-pin-button ${book.pinnedAt ? "pinned" : ""}`}
                    type="button"
                    title={book.pinnedAt ? t("Unpin book", "고정 해제") : t("Pin book", "고정")}
                    aria-label={book.pinnedAt ? t("Unpin book", "고정 해제") : t("Pin book", "고정")}
                    onClick={() => void handleToggleBookPin(book)}
                  >
                    <UiIcon name={book.pinnedAt ? "starFilled" : "star"} />
                  </button>
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {preferences}
      </aside>)}

      <section className="workspace" hidden={modern && libraryOpen}>
        <header className="workspace-header">
          <div className="workspace-title-block">
            <h2>{activeBook?.title || t("Create a book to begin", "책을 만들어 시작하세요")}</h2>
            {activeBook ? (
              <p className="workspace-subtitle">
                {activeBook.author || t("No author provided", "저자 정보 없음")}
                {activeBook.readingLevel ? " · " : ""}
                {activeBook.readingLevel || ""}
              </p>
            ) : null}
            {activeBook ? (
              <div className="workspace-stat-row" aria-label="Book status summary">
                {bookStats.map((stat) => (
                  <span key={stat}>{stat}</span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="workspace-header-actions">
            {activeBook ? (
              <button type="button" onClick={openBookMetadata}>
                {t("Edit Book Info", "책 정보 수정")}
              </button>
            ) : null}
            {!modern && (
            <div className="workspace-tabs" role="tablist" aria-label={t("Book workspace sections", "책 작업 섹션")}>
              <button
                className={activeWorkspaceTab === "source" ? "active" : ""}
                type="button"
                disabled={!activeBook}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : t("Manage source files.", "원본 파일을 관리합니다.")}
                onClick={() => setActiveWorkspaceTab("source")}
              >
                {t("Source", "원본")}
              </button>
              <button
                className={activeWorkspaceTab === "split" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasSourceFiles}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : !hasSourceFiles ? t("Upload a source file first.", "먼저 원본 파일을 업로드하세요.") : t("Split extracted text into chapters.", "추출된 텍스트를 챕터로 나눕니다.")}
                onClick={() => setActiveWorkspaceTab("split")}
              >
                {t("Split", "분할")}
              </button>
              <button
                className={activeWorkspaceTab === "chapters" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasChapters}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : !hasChapters ? t("Create chapters from a source file first.", "먼저 원본 파일에서 챕터를 만드세요.") : t("Review and edit chapters.", "챕터를 검토하고 수정합니다.")}
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
                className={activeWorkspaceTab === "sets" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasStudySets}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : !hasStudySets ? t("Generate at least one study set first.", "먼저 학습 세트를 하나 이상 생성하세요.") : t("Manage generated study sets.", "생성된 학습 세트를 관리합니다.")}
                onClick={() => setActiveWorkspaceTab("sets")}
              >
                {t("Sets", "세트")}
              </button>
              <button
                className={activeWorkspaceTab === "review" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasStudySets}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : !hasStudySets ? t("Generate at least one study set first.", "먼저 학습 세트를 하나 이상 생성하세요.") : t("Review and edit generated items.", "생성된 항목을 검토하고 수정합니다.")}
                onClick={() => {
                  setActiveWorkspaceTab("review");
                  if (selectedChapter) {
                    void loadStudySets(selectedChapter);
                  }
                }}
              >
                {t("Review", "검토")}
              </button>
              <button
                className={activeWorkspaceTab === "export" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasStudySets}
                title={!activeBook ? t("Create or select a book first.", "먼저 책을 만들거나 선택하세요.") : !hasStudySets ? t("Generate at least one study set before exporting.", "내보내기 전에 학습 세트를 하나 이상 생성하세요.") : t("Export generated study material.", "생성된 학습 자료를 내보냅니다.")}
                onClick={() => setActiveWorkspaceTab("export")}
              >
                {t("Export", "출력")}
              </button>
            </div>
            )}
          </div>
        </header>

        {modern && <WorkspaceNavigation tab={activeWorkspaceTab} onTab={navigateTo} hasBook={Boolean(activeBook)} hasChapters={hasChapters} hasSources={hasSourceFiles} t={t} />}
        {modern && saveError && <div className="reading-save-error" role="alert">{saveError}</div>}

        {activeBook && isBookMetadataOpen ? (
          <dialog ref={bookDialogRef} className="metadata-dialog reading-book-dialog" aria-labelledby="book-details-title"
            onCancel={(event) => { if (isSavingBookMetadata || deletingId === activeBook.id) event.preventDefault(); }}
            onClose={() => setIsBookMetadataOpen(false)}>
            <header className="dialog-header">
              <h3 id="book-details-title">{t("Edit book info", "책 정보 수정")}</h3>
              <button type="button" aria-label={t("Close", "닫기")} disabled={isSavingBookMetadata || deletingId === activeBook.id}
                onClick={() => bookDialogRef.current?.close()}>×</button>
            </header>
            <form className="metadata-form" onSubmit={handleSaveBookMetadata}>
              <label>
                {t("Title", "제목")}
                <input value={bookMetadataEdit.title} required disabled={isSavingBookMetadata || deletingId === activeBook.id}
                  onChange={(event) => setBookMetadataEdit((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label>
                {t("Author", "저자")}
                <input value={bookMetadataEdit.author} placeholder={t("Optional", "선택 사항")} disabled={isSavingBookMetadata || deletingId === activeBook.id}
                  onChange={(event) => setBookMetadataEdit((current) => ({ ...current, author: event.target.value }))} />
              </label>
              <label>
                {t("Reading level", "읽기 수준")}
                <input value={bookMetadataEdit.readingLevel} placeholder={t("Optional", "선택 사항")} disabled={isSavingBookMetadata || deletingId === activeBook.id}
                  onChange={(event) => setBookMetadataEdit((current) => ({ ...current, readingLevel: event.target.value }))} />
              </label>
              {bookMetadataError && <p className="reading-book-error" role="alert">{bookMetadataError}</p>}
              <footer className="dialog-actions">
                <button className="reading-book-delete" type="button" disabled={isSavingBookMetadata || deletingId === activeBook.id} onClick={handleDeleteBook}>
                  {deletingId === activeBook.id ? t("Deleting...", "삭제 중...") : t("Delete book", "책 삭제")}
                </button>
                <button type="button" disabled={isSavingBookMetadata || deletingId === activeBook.id} onClick={() => bookDialogRef.current?.close()}>{t("Cancel", "취소")}</button>
                <button type="submit" disabled={isSavingBookMetadata || deletingId === activeBook.id}>
                  {isSavingBookMetadata ? t("Saving...", "저장 중...") : t("Save", "저장")}
                </button>
              </footer>
            </form>
          </dialog>
        ) : null}

        {!modern && activeBook && isGenerationModalOpen ? (
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
                  <span>{t("MCQ", "객관식")}</span>
                  <strong>{generationTotals.multipleChoiceCount.toLocaleString()}</strong>
                </article>
                <article>
                  <span>{t("Short Answer", "단답형")}</span>
                  <strong>{generationTotals.shortAnswerCount.toLocaleString()}</strong>
                </article>
                <article>
                  <span>{t("Vocabulary", "단어")}</span>
                  <strong>{generationTotals.vocabularyCount.toLocaleString()}</strong>
                </article>
              </div>

              <section className="generation-global-controls" aria-label={t("Whole book item targets", "책 전체 문항 목표")}>
                <div>
                  <strong>{t("Whole-book targets", "책 전체 목표")}</strong>
                  <p className="muted-text">
                    {t(
                      "Adjust totals here, then fine-tune individual chapters below.",
                      "여기에서 전체 개수를 조정한 뒤 아래에서 챕터별 값을 세부 조정하세요."
                    )}
                  </p>
                </div>
                <div className="generation-global-slider-list">
                  {generationTotalControls.map((control) => (
                    <label className="generation-global-slider" key={control.field}>
                      <span>{control.label}</span>
                      <input
                        type="range"
                        min="0"
                        max={control.max}
                        value={control.value}
                        disabled={isGeneratingBook || includedGenerationChapterCount === 0}
                        onChange={(event) => applyGenerationTotal(control.field, event.target.value)}
                      />
                      <input
                        type="number"
                        min="0"
                        value={control.value}
                        disabled={isGeneratingBook || includedGenerationChapterCount === 0}
                        onChange={(event) => applyGenerationTotal(control.field, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>

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
                  <div>{t("MCQ", "객관식")}</div>
                  <div>{t("Short Answer", "단답형")}</div>
                  <div>{t("Vocabulary", "단어")}</div>
                </div>
                {chapters.map((chapter) => {
                  const draft = generationPlansByChapterId[chapter.id] || suggestedGenerationPlans[chapter.id] || {
                    included: true,
                    vocabularyCount: "0",
                    multipleChoiceCount: "0",
                    shortAnswerCount: "0"
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
                      <input
                        className="generation-count-input"
                        type="number"
                        min="0"
                        value={draft.vocabularyCount}
                        disabled={isGeneratingBook || !draft.included}
                        onChange={(event) => updateGenerationPlan(chapter.id, "vocabularyCount", event.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}

        {renamingGenerationRun ? (
          <dialog ref={renameDialogRef} className="rename-run-dialog reading-book-dialog" aria-labelledby="rename-run-dialog-title"
            onClose={() => setRenamingGenerationRunId(null)}
            onCancel={event => { if (savingGenerationRunId) event.preventDefault(); }}>
            <form onSubmit={event => { event.preventDefault(); void handleSaveGenerationRunName(renamingGenerationRun); }}>
              <div className="dialog-header">
                <div>
                  <h3 id="rename-run-dialog-title">{t("Rename version", "버전 이름 변경")}</h3>
                </div>
              </div>
              <label className="rename-run-field">
                {t("Name", "이름")}
                <input
                  autoFocus
                  disabled={Boolean(savingGenerationRunId)}
                  value={generationRunDraftById[renamingGenerationRun.id] ?? renamingGenerationRun.name}
                  onChange={(event) => updateGenerationRunDraft(renamingGenerationRun.id, event.target.value)}
                />
              </label>
              {renameError && <p className="reading-book-error" role="alert">{renameError}</p>}
              <div className="dialog-actions">
                <button
                  type="submit"
                  disabled={
                    savingGenerationRunId === renamingGenerationRun.id ||
                    (generationRunDraftById[renamingGenerationRun.id] ?? renamingGenerationRun.name).trim() === renamingGenerationRun.name
                  }
                >
                  {savingGenerationRunId === renamingGenerationRun.id ? t("Saving...", "저장 중...") : t("Save", "저장")}
                </button>
                <button type="button" disabled={Boolean(savingGenerationRunId)} onClick={() => renameDialogRef.current?.close()}>
                  {t("Cancel", "취소")}
                </button>
              </div>
            </form>
          </dialog>
        ) : null}

        {statusToasts.length ? (
          <div className="status-toast-stack" aria-live="polite" aria-atomic="false">
            {statusToasts.map((toast) => (
              <div className={`status-toast ${toast.closing ? "closing" : ""}`} role="status" key={toast.id}>
                {toast.message}
              </div>
            ))}
          </div>
        ) : null}

        <div className="workspace-scroll">
        {modern && (isLoading || isBookLoading) && <p role="status">{t("Loading saved book…", "저장된 책을 불러오는 중…")}</p>}
        {modern && (bookLoadError || libraryError) && <p role="alert">{bookLoadError || libraryError} <button type="button" onClick={() => libraryError ? window.location.reload() : setBookLoadAttempt(n => n + 1)}>{t("Retry", "다시 시도")}</button></p>}
        <div className="workspace-stack" hidden={modern && (isLoading || isBookLoading || Boolean(bookLoadError || libraryError))}>
          {activeWorkspaceTab === "source" || activeWorkspaceTab === "split" ? (
          <section className={activeWorkspaceTab === "split" ? "split-panel" : "source-panel"}>
            <div className="panel-title-row">
              <h3>{activeWorkspaceTab === "split" ? t("Split text", "텍스트 분할") : t("Files", "파일")}</h3>
            </div>

            {activeWorkspaceTab === "source" ? (
            <form className="upload-form" onSubmit={handleSourceUpload}>
              <label className="file-picker">
                <span className="file-picker-button">{t("Browse...", "파일 선택...")}</span>
                <span className="file-picker-name">{sourceUploadFilename || t("No source file selected", "선택된 파일 없음")}</span>
                <input
                  aria-label={t("Source file", "원본 파일")}
                  disabled={!activeBook || isUploading}
                  name="sourceFile"
                  type="file"
                  accept="application/pdf,application/epub+zip,text/plain,.pdf,.epub,.txt"
                  onChange={(event) => setSourceUploadFilename(event.target.files?.[0]?.name || "")}
                />
              </label>
              <button type="submit" disabled={!activeBook || isUploading}>
                {isUploading ? t("Uploading...", "업로드 중...") : t("Upload Source", "원본 업로드")}
              </button>
            </form>
            ) : null}

            <div className="source-list">
              {isLoadingSources ? <p className="muted-text">{t("Loading source files...", "원본 파일을 불러오는 중...")}</p> : null}
              {!isLoadingSources && activeBook && sourceFiles.length === 0 ? (
                <div className="empty-state">
                  <strong>{activeWorkspaceTab === "split" ? t("No source files to split", "분할할 원본 파일이 없습니다") : t("No source files yet", "아직 원본 파일이 없습니다")}</strong>
                  <p>{activeWorkspaceTab === "split" ? t("Upload a source file and extract text before splitting chapters.", "챕터를 나누기 전에 원본 파일을 업로드하고 텍스트를 추출하세요.") : t("Upload a PDF, EPUB, or TXT file to begin extracting book text.", "책 텍스트를 추출하려면 PDF, EPUB 또는 TXT 파일을 업로드하세요.")}</p>
                </div>
              ) : null}
              {sourceFiles.map((sourceFile) => (
                <article className="source-card" key={sourceFile.id}>
                  {activeWorkspaceTab === "source" ? (
                  <div className="source-file-module">
                    <div className="source-card-header">
                      <div>
                        <span className="module-label">{t("Uploaded file", "업로드된 파일")}</span>
                        <h4>{sourceFile.originalFilename}</h4>
                        <div className="source-meta-row">
                          <span>{formatBytes(sourceFile.byteSize)}</span>
                          <span>{sourceFile.originalFilename.split(".").pop()?.toUpperCase() || "FILE"}</span>
                        </div>
                      </div>
                      {activeWorkspaceTab === "source" ? (
                      <div className="button-group">
                        <button
                          className="danger-button"
                          type="button"
                          disabled={deletingId === sourceFile.id}
                          onClick={() => handleDeleteSourceFile(sourceFile)}
                        >
                          {deletingId === sourceFile.id ? t("Deleting...", "삭제 중...") : t("Delete File", "파일 삭제")}
                        </button>
                      </div>
                      ) : null}
                    </div>

                    {!modern && <p className="source-path">{sourceFile.storedPath}</p>}
                  </div>
                  ) : null}

                  <div className="source-row-main">
                    <div className="parsed-list">
                      {(parsedDocumentsBySource[sourceFile.id] || []).length === 0 ? (
                        <div className="source-next-step">
                          <strong>{activeWorkspaceTab === "source" ? t("Text extractor", "텍스트 추출") : t("Text not extracted yet", "아직 텍스트가 추출되지 않았습니다")}</strong>
                          <p>{activeWorkspaceTab === "split" ? t("Go back to Source and run text extraction before splitting chapters.", "챕터를 나누기 전에 원본 탭으로 돌아가 텍스트 추출을 실행하세요.") : t("Run extraction to create searchable source text before splitting chapters.", "챕터를 나누기 전에 검색 가능한 원본 텍스트를 추출하세요.")}</p>
                          {activeWorkspaceTab === "source" ? (
                            <div className="button-group source-next-step-actions">
                              <button
                                type="button"
                                disabled={extractingSourceId === sourceFile.id}
                                onClick={() => handleExtractSource(sourceFile)}
                              >
                                {extractingSourceId === sourceFile.id ? t("Extracting...", "추출 중...") : t("Extract Text", "텍스트 추출")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {(parsedDocumentsBySource[sourceFile.id] || []).map((parsedDocument) => {
                        const activeParsedTool = activeParsedToolByDocumentId[parsedDocument.id];
                        const pageMarkerRows = getPageMarkerRows(parsedDocument.id);

                        return (
                        <article className={`parsed-row ${activeWorkspaceTab === "split" ? "split-workflow-row" : ""}`} key={parsedDocument.id}>
                          {activeWorkspaceTab === "source" ? (
                          <div className="parsed-row-header">
                            <div>
                              <span className="module-label">{t("Extracted text", "추출된 텍스트")}</span>
                              <span>
                                {t(`${parsedDocument.pageCount} pages`, `${parsedDocument.pageCount}쪽`)} · {t(`${parsedDocument.wordCount.toLocaleString()} words`, `${parsedDocument.wordCount.toLocaleString()}단어`)}{!modern && <> · {parsedDocument.parserName}</>}
                              </span>
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
                          ) : null}
                          {activeWorkspaceTab === "split" ? (
                          <div className="split-method-section">
                            <div className="split-method-header">
                              <div>
                                <div className="split-text-meta">
                                  <span className="module-label">{t("Extracted text", "추출된 텍스트")}</span>
                                  <span>
                                    {t(`${parsedDocument.pageCount} pages`, `${parsedDocument.pageCount}쪽`)} · {t(`${parsedDocument.wordCount.toLocaleString()} words`, `${parsedDocument.wordCount.toLocaleString()}단어`)}{!modern && <> · {parsedDocument.parserName}</>}
                                  </span>
                                </div>
                                <strong>{t("Choose a splitting method", "분할 방식 선택")}</strong>
                              </div>
                            </div>
                            <div className="split-mode-grid" aria-label={t("Split methods", "분할 방식")}>
                              <button
                                className={`split-mode-card ${activeParsedTool === "preview" ? "active" : ""}`}
                                type="button"
                                disabled={previewingParsedDocumentId === parsedDocument.id}
                                onClick={() => handlePreviewSplit(parsedDocument)}
                              >
                                <span className="split-mode-card-label">{activeParsedTool === "preview" ? t("Selected", "선택됨") : t("Recommended", "추천")}</span>
                                <strong>{t("Heading detection", "제목 감지")}</strong>
                                <span>
                                  {previewingParsedDocumentId === parsedDocument.id
                                    ? t("Checking chapter headings...", "챕터 제목을 확인하는 중...")
                                    : t("Detect chapter headings, review candidates, then create chapters.", "챕터 제목 후보를 감지하고 검토한 뒤 챕터를 만듭니다.")}
                                </span>
                              </button>
                              <button
                                className={`split-mode-card ${activeParsedTool === "inspect" ? "active" : ""}`}
                                type="button"
                                disabled={loadingTextParsedDocumentId === parsedDocument.id}
                                onClick={() => handleLoadParsedText(parsedDocument)}
                              >
                                <span className="split-mode-card-label">{activeParsedTool === "inspect" ? t("Selected", "선택됨") : t("Manual", "수동")}</span>
                                <strong>{t("Text starts", "텍스트 시작점")}</strong>
                                <span>
                                  {loadingTextParsedDocumentId === parsedDocument.id
                                    ? t("Loading extracted text...", "추출 텍스트를 불러오는 중...")
                                    : t("Search the book text and paste exact phrases where chapters begin.", "책 텍스트를 검색하고 챕터가 시작되는 정확한 문구를 붙여 넣습니다.")}
                                </span>
                              </button>
                              <button
                                className={`split-mode-card ${activeParsedTool === "pages" ? "active" : ""}`}
                                type="button"
                                disabled={loadingPagesParsedDocumentId === parsedDocument.id}
                                onClick={() => handleLoadPages(parsedDocument)}
                              >
                                <span className="split-mode-card-label">{activeParsedTool === "pages" ? t("Selected", "선택됨") : t("Manual", "수동")}</span>
                                <strong>{t("Page starts", "페이지 시작점")}</strong>
                                <span>
                                  {loadingPagesParsedDocumentId === parsedDocument.id
                                    ? t("Loading page previews...", "페이지 미리보기를 불러오는 중...")
                                    : t("Enter each chapter's starting page using a structured table.", "구조화된 표에 각 챕터의 시작 페이지를 입력합니다.")}
                                </span>
                              </button>
                            </div>
                          </div>
                          ) : null}
                          {activeWorkspaceTab === "source" ? (
                            <p>{parsedDocument.preview || t("No preview available.", "미리보기가 없습니다.")}</p>
                          ) : null}
                          {activeWorkspaceTab === "split" && activeParsedTool === "inspect" && parsedDocumentDetailById[parsedDocument.id] ? (
                            <div className="text-inspector">
                              <div className="tool-panel-header">
                                <div>
                                  <strong>{t("Text marker split", "텍스트 표시 분할")}</strong>
                                  <span>{t("Search the full text and paste one chapter-start phrase per line.", "전체 텍스트를 검색하고 챕터 시작 문구를 한 줄에 하나씩 붙여 넣으세요.")}</span>
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
                                  {t("Chapter start phrases", "챕터 시작 문구")}
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
                                  {splittingParsedDocumentId === parsedDocument.id ? t("Creating...", "생성 중...") : t("Create Chapters from Text Starts", "텍스트 시작점으로 챕터 생성")}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {activeWorkspaceTab === "split" && activeParsedTool === "pages" && parsedPagesByDocumentId[parsedDocument.id] ? (
                            <div className="page-splitter">
                              <div className="tool-panel-header">
                                <div>
                                  <strong>{t("Page start split", "페이지 시작점 분할")}</strong>
                                  <span>{t(`${parsedPagesByDocumentId[parsedDocument.id].length} extracted pages available`, `추출된 페이지 ${parsedPagesByDocumentId[parsedDocument.id].length}개 사용 가능`)}</span>
                                </div>
                                <button type="button" onClick={() => handleCloseParsedTool(parsedDocument.id)}>{t("Close", "닫기")}</button>
                              </div>
                              <div className="inspector-grid">
                                <div className="page-marker-editor">
                                  <div className="page-marker-editor-header">
                                    <strong>{t("Chapter start list", "챕터 시작 목록")}</strong>
                                    <button className="compact-icon-command" type="button" onClick={() => handleAddPageMarker(parsedDocument.id)}>
                                      <UiIcon name="plus" />
                                      {t("Add Chapter", "챕터 추가")}
                                    </button>
                                  </div>
                                  <div className="page-marker-table" role="table" aria-label={t("Chapter start list", "챕터 시작 목록")}>
                                    <div className="page-marker-table-head" role="row">
                                      <span>{t("Chapter", "챕터")}</span>
                                      <span>{t("Start page", "시작 페이지")}</span>
                                      <span>{t("Title", "제목")}</span>
                                      <span>{t("Action", "작업")}</span>
                                    </div>
                                    {pageMarkerRows.map((row, index) => (
                                      <div className="page-marker-row" role="row" key={`${parsedDocument.id}-${index}`}>
                                        <label aria-label={t("Chapter", "챕터")}>
                                          <input
                                            inputMode="numeric"
                                            value={row.chapterNumber}
                                            onChange={(event) => handleUpdatePageMarker(parsedDocument.id, index, "chapterNumber", event.target.value)}
                                          />
                                        </label>
                                        <label aria-label={t("Start page", "시작 페이지")}>
                                          <input
                                            inputMode="numeric"
                                            value={row.pageNumber}
                                            onChange={(event) => handleUpdatePageMarker(parsedDocument.id, index, "pageNumber", event.target.value)}
                                            placeholder={index === 0 ? "1" : ""}
                                          />
                                        </label>
                                        <label aria-label={t("Title", "제목")}>
                                          <input
                                            value={row.title}
                                            onChange={(event) => handleUpdatePageMarker(parsedDocument.id, index, "title", event.target.value)}
                                          />
                                        </label>
                                        <button
                                          className="icon-only-button danger-icon-button"
                                          type="button"
                                          disabled={pageMarkerRows.length === 1}
                                          onClick={() => handleRemovePageMarker(parsedDocument.id, index)}
                                          title={t("Remove chapter row", "챕터 행 삭제")}
                                        >
                                          <UiIcon name="trash" />
                                          <span className="sr-only">{t("Remove chapter row", "챕터 행 삭제")}</span>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
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
                                  disabled={!buildPageStartsText(parsedDocument.id) || splittingParsedDocumentId === parsedDocument.id}
                                  onClick={() => handleCreateChapters(parsedDocument, "", buildPageStartsText(parsedDocument.id))}
                                >
                                  {splittingParsedDocumentId === parsedDocument.id ? t("Creating...", "생성 중...") : t("Create Chapters from Page Starts", "페이지 시작점으로 챕터 생성")}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {activeWorkspaceTab === "split" && activeParsedTool === "preview" && splitPreviewByParsedDocument[parsedDocument.id] ? (
                            <div className="split-preview">
                              <div className="tool-panel-header">
                                <div>
                                  <strong>
                                    {splitPreviewByParsedDocument[parsedDocument.id].strategy === "heading"
                                      ? t("Heading detection", "제목 감지")
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
                              <div className="button-group inspector-actions">
                                <button
                                  type="button"
                                  disabled={splittingParsedDocumentId === parsedDocument.id}
                                  onClick={() => handleCreateChapters(parsedDocument)}
                                >
                                  {splittingParsedDocumentId === parsedDocument.id ? t("Creating...", "생성 중...") : t("Create Chapters from Headings", "제목으로 챕터 생성")}
                                </button>
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

          {activeWorkspaceTab === "generate" && modern ? (
          <section className="generate-panel reading-guide-page">
            <div className="reading-page-toolbar"><button type="button" onClick={() => navigateTo("review")}>← {t("Back to guide", "학습지로 돌아가기")}</button><button type="button" onClick={() => navigateTo("sets")}>{t("Manage versions", "버전 관리")}</button></div>
            <h3>{t("Generate a guide", "학습지 생성")}</h3>
            {generatingRun || isGeneratingBook ? <div className="reading-generation-progress">
              <p role="status">{t(`Generating your guide · ${Number(generatingRun?.progress.completedChapters) || 0} of ${Number(generatingRun?.progress.totalChapters) || includedGenerationChapterCount} chapters complete`, `학습지 생성 중 · ${Number(generatingRun?.progress.totalChapters) || includedGenerationChapterCount}개 중 ${Number(generatingRun?.progress.completedChapters) || 0}개 챕터 완료`)}</p>
              {generatingRun && <button type="button" disabled={cancellingGenerationRunId === generatingRun.id} onClick={handleCancelGenerationRun}>{cancellingGenerationRunId ? t("Cancelling…", "취소 중…") : t("Cancel Run", "실행 취소")}</button>}
            </div> : null}
            {generationLog.length > 0 && <details className="reading-processing-details"><summary>{t("Processing details", "처리 상세 정보")}</summary><div className="generation-terminal">{generationLog.map((entry, index) => <p className={`generation-log-line ${entry.level}`} key={index}><span>{formatLogTime(entry.timestamp)}</span><strong>{entry.level.toUpperCase()}</strong><em>{entry.message}</em></p>)}</div></details>}
            {!chapters.length ? <p>{t("Create chapters from extracted source text before starting generation.", "생성을 시작하기 전에 추출된 원본 텍스트에서 챕터를 만드세요.")}</p> : <form className="reading-generation-form" onSubmit={event => { event.preventDefault(); if (!generatingRun) void handleGenerateBook(); }}>
              <fieldset disabled={isGeneratingBook || Boolean(generatingRun)}>
                <legend>{t("Question totals", "전체 문항 수")}</legend>
                <p className="muted-text">{t("Totals are distributed across the selected chapters. Adjust individual counts below.", "선택한 챕터에 전체 문항 수를 배분합니다. 아래에서 챕터별 개수를 조정할 수 있습니다.")}</p>
                <div className="reading-generation-totals">{generationTotalControls.map(control => <label key={control.field}>{control.label}<input type="number" min="0" value={control.value} disabled={includedGenerationChapterCount === 0} onChange={event => applyGenerationTotal(control.field, event.target.value)} /></label>)}</div>
                <div className="reading-generation-chapters-heading"><h4>{t("Chapters", "챕터")}</h4><button type="button" onClick={resetGenerationPlans}>{t("Reset Suggestions", "추천값 초기화")}</button></div>
                <div className="reading-generation-chapters">{chapters.map(chapter => {
                  const draft = generationPlansByChapterId[chapter.id] || suggestedGenerationPlans[chapter.id] || { included: true, multipleChoiceCount: "0", shortAnswerCount: "0", vocabularyCount: "0" };
                  return <div className="reading-generation-chapter" key={chapter.id}>
                    <label className="reading-generation-include"><input type="checkbox" checked={draft.included} onChange={event => toggleGenerationChapter(chapter, event.target.checked)} /><span><strong>{chapter.chapterNumber}. {chapter.title}</strong><small>{t(`${chapter.wordCount.toLocaleString()} words`, `${chapter.wordCount.toLocaleString()}단어`)}</small></span></label>
                    <div className="reading-generation-counts">{generationTotalControls.map(control => <label key={control.field}>{control.label}<input aria-label={`${chapter.chapterNumber}. ${chapter.title} · ${control.label}`} type="number" min="0" value={draft[control.field]} disabled={!draft.included} onChange={event => updateGenerationPlan(chapter.id, control.field, event.target.value)} /></label>)}</div>
                  </div>;
                })}</div>
              </fieldset>
              <div className="reading-generation-submit"><span>{t(`${includedGenerationChapterCount} chapters selected`, `챕터 ${includedGenerationChapterCount}개 선택됨`)}</span><button className="primary-action" type="submit" disabled={isGeneratingBook || Boolean(generatingRun) || includedGenerationChapterCount === 0}>{isGeneratingBook || generatingRun ? t("Generating…", "생성 중…") : t("Start Generation", "생성 시작")}</button></div>
            </form>}
          </section>
          ) : activeWorkspaceTab === "generate" ? (
          <section className="generate-panel">
            <div className="panel-title-row">
              <div>
                <h3>{t("Generation", "생성")}</h3>
              </div>
              <div className="panel-actions">
                {generatingRun ? (
                  <button
                    type="button"
                    className="danger-button"
                    disabled={cancellingGenerationRunId === generatingRun.id}
                    onClick={handleCancelGenerationRun}
                  >
                    {cancellingGenerationRunId === generatingRun.id ? t("Cancelling...", "취소 중...") : t("Cancel Run", "실행 취소")}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!activeBook || chapters.length === 0 || isGeneratingBook}
                  onClick={openGenerationModal}
                >
                  {isGeneratingBook ? t("Generating...", "생성 중...") : t("Configure Generation", "생성 설정")}
                </button>
              </div>
            </div>

            {chapters.length === 0 ? (
              <div className="empty-state">
                <strong>{t("No chapters ready", "준비된 챕터가 없습니다")}</strong>
                <p>{t("Create chapters from extracted source text before starting generation.", "생성을 시작하기 전에 추출된 원본 텍스트에서 챕터를 만드세요.")}</p>
              </div>
            ) : (
              <div className="generation-plan-panel">
                {modern && <p className="reading-generation-status" role="status">{generatingRun
                  ? t(`Generating your guide · ${Number(generatingRun.progress.completedChapters) || 0} of ${Number(generatingRun.progress.totalChapters) || 0} chapters complete`, `학습지 생성 중 · ${Number(generatingRun.progress.totalChapters) || 0}개 중 ${Number(generatingRun.progress.completedChapters) || 0}개 챕터 완료`)
                  : t("Choose chapters and question counts to create a new guide version.", "챕터와 문항 수를 선택하여 새 학습지 버전을 만드세요.")}</p>}
                <details className="reading-processing-details" open={!modern}>
                  <summary>{t("Processing details", "처리 상세 정보")}</summary>
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
                </details>

                <div className="generation-total-strip" aria-label={t("Whole book generation totals", "책 전체 생성 총량")}>
                  <article>
                    <span>{t("Multiple Choice", "객관식")}</span>
                    <strong>{generationTotals.multipleChoiceCount.toLocaleString()}</strong>
                  </article>
                  <article>
                    <span>{t("Short Answer", "단답형")}</span>
                    <strong>{generationTotals.shortAnswerCount.toLocaleString()}</strong>
                  </article>
                  <article>
                    <span>{t("Vocabulary", "단어")}</span>
                    <strong>{generationTotals.vocabularyCount.toLocaleString()}</strong>
                  </article>
                </div>

                <section className="generation-history-panel">
                  <div className="study-item-section-header">
                    <strong>{t("Generation History", "생성 기록")}</strong>
                    <span>{generationRuns.length}</span>
                  </div>
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
                              {t(`${run.chapterCount} chapters`, `챕터 ${run.chapterCount}개`)} · {t(`${run.multipleChoiceCount} MCQ`, `객관식 ${run.multipleChoiceCount}개`)} · {t(`${run.shortAnswerCount} short answer`, `단답형 ${run.shortAnswerCount}개`)} · {t(`${run.vocabularyCount} vocab`, `단어 ${run.vocabularyCount}개`)}
                            </p>
                            {run.errorMessage ? <p className="generation-error-text">{run.errorMessage}</p> : null}
                          </div>
                          <div className="generation-history-status">
                            <span>{activeBook?.activeGenerationRunId === run.id ? t("Active set", "활성 세트") : formatUiStatus(run.status)}</span>
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

          {activeWorkspaceTab === "sets" ? (
          <section className={`sets-panel ${modern ? "reading-guide-page" : ""}`}>
            {modern && <div className="reading-page-toolbar"><button type="button" onClick={() => navigateTo("review")}>← {t("Back to guide", "학습지로 돌아가기")}</button><button type="button" disabled={!hasChapters} onClick={() => navigateTo("generate")}>{t("Generate a guide", "학습지 생성")}</button></div>}
            <div className="panel-title-row">
              <div>
                <h3>{modern ? t("Guide versions", "학습지 버전") : t("Study sets", "학습 세트")}</h3>
                {!modern && <p className="muted-text">
                  {t("Choose the active version, rename sets, or remove generated material you no longer need.", "활성 버전을 선택하고, 세트 이름을 바꾸거나 필요 없는 생성 자료를 삭제합니다.")}
                </p>}
              </div>
            </div>



            {generationRuns.length === 0 ? (
              <div className="empty-state">
                <strong>{t("No study sets yet", "아직 학습 세트가 없습니다")}</strong>
                <p>{t("Generate a set before managing versions.", "버전을 관리하려면 먼저 학습 세트를 생성하세요.")}</p>
              </div>
            ) : (
              <div className="set-version-list">
                {generationRuns.map((run) => {
                  const isActiveRun = activeBook?.activeGenerationRunId === run.id;
                  const canUseRun = run.status !== "generating" && run.status !== "failed";
                  return (
                    <article className={`set-version-card ${isActiveRun ? "active" : ""}`} key={run.id}>
                      <div className="set-version-main">
                        <div>
                          {!modern && <p className="step-label">{isActiveRun ? t("Active set", "활성 세트") : t("Set", "세트")}</p>}
                          <h4>{run.name}</h4>
                        </div>
                        <div className="study-set-meta-row">
                          <span>{formatUiStatus(run.status)}</span>
                          <span>{formatDateTime(run.startedAt)}</span>
                          {!modern && run.finishedAt ? <span>{t("Finished", "완료")} {formatDateTime(run.finishedAt)}</span> : null}
                        </div>
                        <p className="muted-text">
                          {t(`${run.chapterCount} chapters`, `챕터 ${run.chapterCount}개`)} · {t(`${run.multipleChoiceCount} MCQ`, `객관식 ${run.multipleChoiceCount}개`)} · {t(`${run.shortAnswerCount} short answer`, `단답형 ${run.shortAnswerCount}개`)} · {t(`${run.vocabularyCount} vocab`, `단어 ${run.vocabularyCount}개`)}
                        </p>
                        {run.errorMessage ? <p className="generation-error-text">{run.errorMessage}</p> : null}
                      </div>
                      {modern ? <div className="set-version-actions">
                        {isActiveRun ? <span className="reading-active-version">{t("Active", "활성")}</span> : <button type="button" disabled={!canUseRun || switchingVersion} onClick={() => void handleSelectActiveGenerationRun(run.id)}>{t("Use version", "이 버전 사용")}</button>}
                        <QuietMenu label={t("More", "더 보기")}>
                          <button type="button" onClick={() => openGenerationRunRenameModal(run)}>{t("Rename", "이름 변경")}</button>
                          <button type="button" className="danger-button" disabled={run.status === "generating" || deletingId === run.id} onClick={() => handleDeleteGenerationRun(run)}>{deletingId === run.id ? t("Deleting...", "삭제 중...") : t("Delete", "삭제")}</button>
                        </QuietMenu>
                      </div> : (                      <div className="set-version-actions">
                        <button
                          type="button"
                          onClick={() => openGenerationRunRenameModal(run)}
                        >
                          {t("Rename", "이름 변경")}
                        </button>
                        <button
                          type="button"
                          disabled={!canUseRun || isActiveRun}
                          onClick={() => void handleSelectActiveGenerationRun(run.id)}
                        >
                          {isActiveRun ? t("Active", "활성") : t("Use Set", "이 세트 사용")}
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          disabled={run.status === "generating" || deletingId === run.id}
                          onClick={() => handleDeleteGenerationRun(run)}
                        >
                          {deletingId === run.id ? t("Deleting...", "삭제 중...") : t("Delete", "삭제")}
                        </button>
                      </div>) }
                    </article>
                  );
                })}
              </div>
            )}
            {modern && selectedChapter && <details className="reading-version-detail"><summary>{t("Current chapter", "현재 챕터")}: {selectedChapter?.title}</summary>
                        <div className="study-set-header">
                          <div>
                            <p className="step-label">{t("Selected set", "선택된 세트")}</p>
                            {selectedStudySet ? (
                              <div className="study-set-meta-row">
                                <span>{formatUiStatus(selectedStudySet.status)}</span>
                                <span>{formatDateTime(selectedStudySet.createdAt)}</span>
                                {selectedStudySet.model ? <span>{selectedStudySet.model}</span> : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="study-set-controls">
                            {loadingStudySetsChapterId === selectedChapter?.id ? (
                              <span>{t("Loading...", "불러오는 중...")}</span>
                            ) : selectedChapterStudySets.length > 1 ? (
                              <select aria-label={t("Chapter guide version", "챕터 학습지 버전")}
                                value={selectedStudySetId || ""}
                                onChange={(event) => selectedChapter && void handleSelectStudySet(selectedChapter.id, event.target.value)}
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

                        </details>}
          </section>
          ) : null}

          {activeWorkspaceTab === "export" ? (
          <section className="export-panel flat-panel">
            <div className="panel-title-row">
              <div>
                <h3>{t("Export files", "파일 내보내기")}</h3>
              </div>
            </div>

            {chapters.length === 0 || !hasStudySets ? (
              <div className="empty-state">
                <strong>{t("No exports available", "내보낼 자료가 없습니다")}</strong>
                <p>{t("Create chapters and generate at least one study set before exporting files.", "파일을 내보내기 전에 챕터를 만들고 학습 세트를 하나 이상 생성하세요.")}</p>
              </div>
            ) : modern ? (
              <form className="reading-export-form" onSubmit={event => {
                event.preventDefault();
                if (exportScope === "all") handleExportBook(exportType, exportFormat);
                else handleExportStudySet(exportType, exportFormat);
              }}>
                <label>{t("Guide version", "학습지 버전")}<select aria-label={t("Guide version", "학습지 버전")} value={activeBook?.activeGenerationRunId || ""} disabled={switchingVersion} onChange={event => void handleSelectActiveGenerationRun(event.target.value)}>
                  {!activeBook?.activeGenerationRunId && <option value="">{t("Latest available", "사용 가능한 최신 버전")}</option>}
                  {generationRuns.filter(run => run.status !== "generating").map(run => <option key={run.id} value={run.id}>{run.name}</option>)}
                </select></label>
                <label>{t("Chapters", "챕터")}<select aria-label={t("Chapters", "챕터")} value={exportScope === "all" ? "all" : selectedChapter?.id || ""} onChange={event => {
                  setExportScope(event.target.value === "all" ? "all" : "chapter");
                  const chapter = chapters.find(chapter => chapter.id === event.target.value);
                  if (chapter) handleSelectChapter(chapter);
                }}>
                  <option value="all">{t("All chapters", "전체 챕터")}</option>
                  {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.chapterNumber}. {chapter.title}</option>)}
                </select></label>
                {exportScope === "chapter" && selectedChapterStudySets.length > 1 && <label>{t("Chapter guide version", "챕터 학습지 버전")}<select aria-label={t("Chapter guide version", "챕터 학습지 버전")} value={selectedStudySetId || ""} onChange={event => { if (selectedChapter) void handleSelectStudySet(selectedChapter.id, event.target.value); }}>
                  {selectedChapterStudySets.map(set => <option key={set.id} value={set.id}>{set.title}</option>)}
                </select></label>}
                <label>{t("Content", "내용")}<select aria-label={t("Content", "내용")} value={exportType} onChange={event => setExportType(event.target.value as PdfExportType)}>
                  {exportOptionGroups.map(group => <optgroup key={group.title} label={group.title}>{group.options.map(option => <option key={option.type} value={option.type}>{group.title === option.label ? option.label : `${group.title} · ${option.label}`}</option>)}</optgroup>)}
                </select></label>
                <label>{t("Format", "형식")}<select aria-label={t("Format", "형식")} value={exportFormat} onChange={event => setExportFormat(event.target.value as "pdf" | "docx")}><option value="pdf">PDF</option><option value="docx">Word (.docx)</option></select></label>
                {exportScope === "chapter" && (studyLoadError ? <p role="alert">{studyLoadError} <button type="button" onClick={() => selectedChapter && void loadStudySets(selectedChapter)}>{t("Retry", "다시 시도")}</button></p> : !selectedStudySet && !loadingStudySetsChapterId && <p>{t("No guide is available for this chapter and version.", "이 챕터와 버전에 사용할 수 있는 학습지가 없습니다.")}</p>)}
                <button className="primary-action" type="submit" disabled={switchingVersion || (exportScope === "chapter" && (!selectedStudySet || Boolean(loadingStudySetsChapterId) || Boolean(studyLoadError)))}>{t("Export", "내보내기")}</button>
              </form>
            ) : (
              <div className="export-page-stack">
                <div className="export-workspace">
                  <div className="export-scope-block">
                    <div>
                      <h4>{t("All chapters", "전체 챕터")}</h4>
                      <p className="muted-text">
                        {activeGenerationRun
                          ? t(`Version: ${activeGenerationRun.name}`, `버전: ${activeGenerationRun.name}`)
                          : t("Uses the newest available study set for each chapter.", "각 챕터에서 사용 가능한 최신 학습 세트를 사용합니다.")}
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
                                  <button
                                    className="export-icon-button pdf"
                                    type="button"
                                    aria-label={t(`Export ${option.label} as PDF`, `${option.label} PDF로 내보내기`)}
                                    title={t("Export as PDF", "PDF로 내보내기")}
                                    onClick={() => handleExportBook(option.type, "pdf")}
                                  >
                                    <UiIcon name="filePdf" />
                                  </button>
                                  <button
                                    className="export-icon-button word"
                                    type="button"
                                    aria-label={t(`Export ${option.label} as Word`, `${option.label} Word로 내보내기`)}
                                    title={t("Export as Word", "Word로 내보내기")}
                                    onClick={() => handleExportBook(option.type, "docx")}
                                  >
                                    <UiIcon name="fileDocx" />
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
                <div className="chapter-editor-layout export-chapter-layout">
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
                            <h4>{t("Selected chapter", "선택한 챕터")}</h4>
                            {selectedStudySet ? (
                              <p className="muted-text">
                                {selectedStudySet.title} · {formatDateTime(selectedStudySet.createdAt)}
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

                        {studyLoadError ? <p role="alert">{studyLoadError} <button type="button" onClick={() => void loadStudySets(selectedChapter)}>{t("Retry", "다시 시도")}</button></p> : !selectedStudySet ? (
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
                                        <button
                                          className="export-icon-button pdf"
                                          type="button"
                                          aria-label={t(`Export ${option.label} as PDF`, `${option.label} PDF로 내보내기`)}
                                          title={t("Export as PDF", "PDF로 내보내기")}
                                          onClick={() => handleExportStudySet(option.type, "pdf")}
                                        >
                                          <UiIcon name="filePdf" />
                                        </button>
                                        <button
                                          className="export-icon-button word"
                                          type="button"
                                          aria-label={t(`Export ${option.label} as Word`, `${option.label} Word로 내보내기`)}
                                          title={t("Export as Word", "Word로 내보내기")}
                                          onClick={() => handleExportStudySet(option.type, "docx")}
                                        >
                                          <UiIcon name="fileDocx" />
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

          {activeWorkspaceTab === "chapters" || activeWorkspaceTab === "review" ? (
          <section className="chapter-panel">
            <div className="panel-title-row">
              <div>
                <h3>{activeWorkspaceTab === "review" ? t("Review items", "항목 검토") : t("Chapter editor", "챕터 편집")}</h3>
                {activeWorkspaceTab === "review" && activeGenerationRun ? (
                  <p className="muted-text">{t("Version:", "버전:")} {activeGenerationRun.name}</p>
                ) : null}
              </div>
              {!modern && activeWorkspaceTab === "chapters" ? (
                <button
                  className="danger-button"
                  type="button"
                  disabled={chapters.length === 0 || deletingId === "chapters"}
                  onClick={handleClearChapters}
                >
                  {deletingId === "chapters" ? t("Clearing...", "삭제 중...") : t("Clear All Chapters", "모든 챕터 삭제")}
                </button>
              ) : null}
            </div>

            {chapters.length === 0 ? (
              <div className="empty-state">
                <strong>{t("No chapters created yet", "아직 생성된 챕터가 없습니다")}</strong>
                <p>{t("Import a source file and prepare chapters to begin.", "원본 파일을 가져와 챕터를 준비하세요.")}</p>
                {modern && <button type="button" onClick={() => navigateTo("source")}>{t("Import sources", "원본 가져오기")}</button>}
              </div>
            ) : (
              <>
              {modern && <label className="reading-chapter-picker">{t("Chapter", "챕터")}<select aria-label={t("Current chapter", "현재 챕터")} value={selectedChapter?.id || ""} onChange={event => { const chapter = chapters.find(c => c.id === event.target.value); if (chapter) handleSelectChapter(chapter); }}>
                {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.chapterNumber}. {chapter.title}</option>)}
              </select></label>}
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
                    </button>
                  ))}
                </div>

                <div className="chapter-editor">
                  {!selectedChapter ? (
                    <p className="muted-text">{t("Select a chapter to continue.", "계속하려면 챕터를 선택하세요.")}</p>
                  ) : loadingChapterId === selectedChapter.id ? (
                    <p className="muted-text">{t("Loading chapter...", "챕터를 불러오는 중...")}</p>
                  ) : activeWorkspaceTab === "review" ? (
                    <>
                      <div className="study-set-panel">
                        {modern && <>
                          <div className="reading-guide-toolbar">
                            <label>{t("Guide version", "학습지 버전")}<select aria-label={t("Guide version", "학습지 버전")} value={activeBook?.activeGenerationRunId || ""} disabled={switchingVersion || !generationRuns.length}
                              onChange={event => { if (creatingStudyItemKind) { setSaveError(t("Save or cancel the new item first.", "새 항목을 먼저 저장하거나 취소하세요.")); return; } void handleSelectActiveGenerationRun(event.target.value); }}>
                              {!activeBook?.activeGenerationRunId && <option value="">{t("Latest available", "사용 가능한 최신 버전")}</option>}
                              {generationRuns.filter(run => run.status !== "generating").map(run => <option key={run.id} value={run.id}>{run.name} · {formatUiStatus(run.status)}</option>)}
                            </select></label>
                            <button type="button" onClick={() => navigateTo("sets")}>{t("Manage versions", "버전 관리")}</button>
                            <button type="button" onClick={() => navigateTo("generate")}>{t("Generate a guide", "학습지 생성")}</button>
                            <button type="button" aria-expanded={sourceOpen} onClick={() => setSourceOpen(open => !open)}>{t("Source passage", "원문 보기")}</button>
                          </div>
                          <div className="reading-document-heading"><p className="reading-kicker">{t("Chapter", "챕터")} {selectedChapter.chapterNumber}</p><h3>{selectedChapter.title || t("Study guide", "학습지")}</h3></div>
                          {sourceOpen && <section className="reading-source" aria-label={t("Source passage", "원문")}><h4>{t("Source passage", "원문")}</h4><p>{selectedChapterDetail?.textContent || t("Source text is unavailable. Reopen the book to retry.", "원문을 불러오지 못했습니다. 책을 다시 여세요.")}</p></section>}
                        </>}
                        {!modern && <>
                        <details className="reading-guide-details"><summary>{t("Guide details", "학습지 상세 정보")}</summary>
                        <div className="study-set-header">
                          <div>
                            <p className="step-label">{t("Selected set", "선택된 세트")}</p>
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
                            ) : selectedChapterStudySets.length > 1 ? (
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
                            ) : selectedStudySet ? (
                              <p className="muted-text">{t("Using active version", "활성 버전 사용 중")}</p>
                            ) : null}
                          </div>
                        </div>

                        </details>
                        </>}

                        {studyLoadError ? <p role="alert">{studyLoadError} <button type="button" onClick={() => void loadStudySets(selectedChapter)}>{t("Retry", "다시 시도")}</button></p> : !selectedStudySet ? (
                          <div className="empty-state"><p>{t("No guide is available for this chapter and version.", "이 챕터와 버전에 사용할 수 있는 학습지가 없습니다.")}</p>{!modern && <button type="button" onClick={() => navigateTo("generate")}>{t("Generate a guide", "학습지 생성")}</button>}</div>
                        ) : loadingStudyItemsSetId === selectedStudySet.id ? (
                          <p className="muted-text">{t("Loading generated items...", "생성된 항목을 불러오는 중...")}</p>
                        ) : selectedStudyItems ? (
                          <>
                          <div className="reading-item-toolbar"><div className="study-set-subtabs" role="tablist" aria-label={t("Study set item type", "학습 세트 항목 종류")}>
                            <button
                              className={activeStudySetView === "multiple-choice" ? "active" : ""}
                              type="button"
                              onClick={() => {
                                if (isSavingNewStudyItem) return;
                                if (creatingStudyItemKind && !window.confirm(t("Discard the new unsaved item?", "저장되지 않은 새 항목을 버릴까요?"))) return;
                                setCreatingStudyItemKind(null); setNewStudyItemDraft({});
                                setActiveStudySetView("multiple-choice");
                              }}
                            >
                              {t("Multiple Choice", "객관식")}
                              <span>{selectedStudyItems.multipleChoiceQuestions.length}</span>
                            </button>
                            <button
                              className={activeStudySetView === "short-answer" ? "active" : ""}
                              type="button"
                              onClick={() => {
                                if (isSavingNewStudyItem) return;
                                if (creatingStudyItemKind && !window.confirm(t("Discard the new unsaved item?", "저장되지 않은 새 항목을 버릴까요?"))) return;
                                setCreatingStudyItemKind(null); setNewStudyItemDraft({});
                                setActiveStudySetView("short-answer");
                              }}
                            >
                              {t("Short Answer", "단답형")}
                              <span>{selectedStudyItems.shortAnswerQuestions.length}</span>
                            </button>
                            <button
                              className={activeStudySetView === "vocabulary" ? "active" : ""}
                              type="button"
                              onClick={() => {
                                if (isSavingNewStudyItem) return;
                                if (creatingStudyItemKind && !window.confirm(t("Discard the new unsaved item?", "저장되지 않은 새 항목을 버릴까요?"))) return;
                                setCreatingStudyItemKind(null); setNewStudyItemDraft({});
                                setActiveStudySetView("vocabulary");
                              }}
                            >
                              {t("Vocabulary", "단어")}
                              <span>{selectedStudyItems.vocabularyItems.length}</span>
                            </button>
                          </div>
                          <div className="study-item-toolbar">
                            {activeStudySetView !== "vocabulary" && <>
                              <button type="button" onClick={()=>setQuestionExpansion(v=>({open:true,version:v.version+1}))}>{t("Expand all", "모두 펼치기")}</button>
                              <button type="button" onClick={()=>setQuestionExpansion(v=>({open:false,version:v.version+1}))}>{t("Collapse all", "모두 접기")}</button>
                            </>}
                            <button
                              type="button"
                              onClick={() => startCreatingStudyItem(activeStudySetView)}
                            >
                              {getAddStudyItemLabel(activeStudySetView)}
                            </button>
                          </div></div>

                          {activeStudySetView === "vocabulary" ? (
                          <div className="study-items-grid single-column">
                            <section className="study-item-section">
                              {renderNewStudyItemForm("vocabulary")}
                              {selectedStudyItems.vocabularyItems.map((item, index) => (
                                <article className="study-item-card" key={item.id}>
                                  {editingStudyItemId === item.id ? (
                                    <div className="study-item-edit-form">
                                      <label>
                                        {t("Word", "단어")}
                                        <input value={studyItemDraftById[item.id]?.term || ""} onChange={(event) => updateStudyItemDraft(item.id, { term: event.target.value })} />
                                      </label>
                                      <label>
                                        {t("Definition", "뜻")}
                                        <textarea rows={3} value={studyItemDraftById[item.id]?.definition || ""} onChange={(event) => updateStudyItemDraft(item.id, { definition: event.target.value })} />
                                      </label>
                                      <label>
                                        {t("Example sentence", "예문")}
                                        <textarea rows={3} value={studyItemDraftById[item.id]?.contextSentence || ""} onChange={(event) => updateStudyItemDraft(item.id, { contextSentence: event.target.value })} />
                                      </label>
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
                                        {modern && dirtyItemIds.includes(item.id) && <span className="reading-unsaved" role="status">{t("Unsaved changes", "저장되지 않은 변경")}</span>}
                                        <button type="button" disabled={savingStudyItemId === item.id} onClick={() => handleSaveStudyItem("vocabulary", item.id)}>{savingStudyItemId === item.id ? t("Saving...", "저장 중...") : t("Save", "저장")}</button>
                                        <button type="button" onClick={() => cancelStudyItemEdit(item.id)}>{t("Cancel", "취소")}</button>
                                      </>
                                    ) : (
                                      <button type="button" onClick={() => startEditingStudyItem("vocabulary", item)}>{t("Edit", "수정")}</button>
                                    )}
                                    {renderSecondaryStudyActions("vocabulary", item.id, index, selectedStudyItems.vocabularyItems.length)}
                                  </div>
                                </article>
                              ))}
                            </section>
                          </div>
                          ) : activeStudySetView === "multiple-choice" ? (
                          <div className="study-items-grid single-column">
                            <section className="study-item-section">
                              {!newItemAtEnd && renderNewStudyItemForm("multiple-choice")}
                              {selectedStudyItems.multipleChoiceQuestions.map((item, index) => (
                                <QuestionCard id={item.id} group={`${selectedStudySetId}:${selectedChapter.id}:multiple-choice`} index={index} title={item.questionText}
                                  editing={editingStudyItemId === item.id} busy={Boolean(movingStudyItemId || savingStudyItemId || deletingId || isSavingNewStudyItem || editingStudyItemId)}
                                  review={item.status === "needs_review"} expansion={questionExpansion} korean={uiLanguage === "ko"} key={item.id}
                                  onMove={direction=>{if((direction === "up" && index>0)||(direction === "down" && index<selectedStudyItems.multipleChoiceQuestions.length-1)) void handleMoveStudyItem("multiple-choice",item.id,direction);}}
                                  onDrop={targetId=>void handleMoveStudyItem("multiple-choice",item.id,{targetId})}
                                  actions={<div className="study-item-actions">
                                    {editingStudyItemId === item.id ? (
                                      <>
                                        {modern && dirtyItemIds.includes(item.id) && <span className="reading-unsaved" role="status">{t("Unsaved changes", "저장되지 않은 변경")}</span>}
                                        <button type="button" disabled={savingStudyItemId === item.id} onClick={() => handleSaveStudyItem("multiple-choice", item.id)}>{savingStudyItemId === item.id ? t("Saving...", "저장 중...") : t("Save", "저장")}</button>
                                        <button type="button" onClick={() => cancelStudyItemEdit(item.id)}>{t("Cancel", "취소")}</button>
                                      </>
                                    ) : (
                                      <button type="button" onClick={() => startEditingStudyItem("multiple-choice", item)}>{t("Edit", "수정")}</button>
                                    )}
                                    {renderSecondaryStudyActions("multiple-choice", item.id, index, selectedStudyItems.multipleChoiceQuestions.length)}
                                  </div>}>
                                  {item.status === "needs_review" && <div className="question-review-reasons"><strong>{t("Why this needs review", "검토가 필요한 이유")}</strong>
                                    <ul>{(item.reviewFlags?.length ? item.reviewFlags : ["unavailable"]).map(flag=><li key={flag}>{reviewReasonLabels[flag] ? t(...reviewReasonLabels[flag]) : t("The original review reason is unavailable for this question. Check the answer against the passage.", "이 문제의 원래 검토 사유를 확인할 수 없습니다. 본문과 정답을 대조하세요.")}</li>)}</ul>
                                  </div>}
                                  {editingStudyItemId === item.id ? (
                                    <div className="study-item-edit-form">
                                      <label>
                                        {t("Question", "문제")}
                                        <textarea rows={3} value={studyItemDraftById[item.id]?.questionText || ""} onChange={(event) => updateStudyItemDraft(item.id, { questionText: event.target.value })} />
                                      </label>
                                      <fieldset className="mcq-choices"><legend>{t("Choices", "선택지")}</legend>
                                        <div className="mcq-choice-field-grid">
                                          {[0, 1, 2, 3].map((choiceIndex) => {
                                            const choiceKey = getChoiceDraftKey(choiceIndex);
                                            return (
                                              <label className="mcq-choice-field" key={choiceKey}>
                                                <span>{getChoiceLabel(choiceIndex)}</span>
                                                <input value={studyItemDraftById[item.id]?.[choiceKey] || ""} onChange={(event) => updateStudyItemDraft(item.id, { [choiceKey]: event.target.value })} />
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </fieldset>
                                      <label>
                                        {t("Correct answer", "정답")}
                                        <select value={studyItemDraftById[item.id]?.correctChoiceIndex || "0"} onChange={(event) => updateStudyItemDraft(item.id, { correctChoiceIndex: event.target.value })}>
                                          {[0, 1, 2, 3].map((choiceIndex) => (
                                            <option key={choiceIndex} value={String(choiceIndex)}>
                                              {getChoiceLabel(choiceIndex)}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label>
                                        {t("Explanation", "해설")}
                                        <textarea rows={3} value={studyItemDraftById[item.id]?.explanation || ""} onChange={(event) => updateStudyItemDraft(item.id, { explanation: event.target.value })} />
                                      </label>
                                      {item.status === "needs_review" ? <label><input type="checkbox" checked={studyItemDraftById[item.id]?.status === "reviewed"} onChange={event => updateStudyItemDraft(item.id, { status: event.target.checked ? "reviewed" : "needs_review" })} />{t("I checked the answer and distractors against the passage", "본문과 대조하여 정답과 오답을 확인했습니다")}</label> : null}
                                    </div>
                                  ) : (
                                    <>

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
                                      {item.explanation ? <small className="multiple-choice-explanation">{item.explanation}</small> : null}
                                    </>
                                  )}

                                </QuestionCard>
                              ))}
                              {newItemAtEnd && renderNewStudyItemForm(activeStudySetView)}
                              <button type="button" className="question-add-bottom" disabled={isSavingNewStudyItem} onClick={()=>startCreatingStudyItem(activeStudySetView, true)}>{getAddStudyItemLabel(activeStudySetView)}</button>
                            </section>
                          </div>
                          ) : (
                          <div className="study-items-grid single-column">
                            <section className="study-item-section">
                              {!newItemAtEnd && renderNewStudyItemForm("short-answer")}
                              {selectedStudyItems.shortAnswerQuestions.map((item, index) => (
                                <QuestionCard id={item.id} group={`${selectedStudySetId}:${selectedChapter.id}:short-answer`} index={index} title={item.questionText}
                                  editing={editingStudyItemId === item.id} busy={Boolean(movingStudyItemId || savingStudyItemId || deletingId || isSavingNewStudyItem || editingStudyItemId)}
                                  review={false} expansion={questionExpansion} korean={uiLanguage === "ko"} key={item.id}
                                  onMove={direction=>{if((direction === "up" && index>0)||(direction === "down" && index<selectedStudyItems.shortAnswerQuestions.length-1)) void handleMoveStudyItem("short-answer",item.id,direction);}}
                                  onDrop={targetId=>void handleMoveStudyItem("short-answer",item.id,{targetId})}
                                  actions={<div className="study-item-actions">
                                    {editingStudyItemId === item.id ? (
                                      <>
                                        {modern && dirtyItemIds.includes(item.id) && <span className="reading-unsaved" role="status">{t("Unsaved changes", "저장되지 않은 변경")}</span>}
                                        <button type="button" disabled={savingStudyItemId === item.id} onClick={() => handleSaveStudyItem("short-answer", item.id)}>{savingStudyItemId === item.id ? t("Saving...", "저장 중...") : t("Save", "저장")}</button>
                                        <button type="button" onClick={() => cancelStudyItemEdit(item.id)}>{t("Cancel", "취소")}</button>
                                      </>
                                    ) : (
                                      <button type="button" onClick={() => startEditingStudyItem("short-answer", item)}>{t("Edit", "수정")}</button>
                                    )}
                                    {renderSecondaryStudyActions("short-answer", item.id, index, selectedStudyItems.shortAnswerQuestions.length)}
                                  </div>}>
                                  {editingStudyItemId === item.id ? (
                                    <div className="study-item-edit-form">
                                      <label>
                                        {t("Question", "문제")}
                                        <textarea rows={3} value={studyItemDraftById[item.id]?.questionText || ""} onChange={(event) => updateStudyItemDraft(item.id, { questionText: event.target.value })} />
                                      </label>
                                      <label>
                                        {t("Suggested answer", "예시 답안")}
                                        <textarea rows={4} value={studyItemDraftById[item.id]?.suggestedAnswer || ""} onChange={(event) => updateStudyItemDraft(item.id, { suggestedAnswer: event.target.value })} />
                                      </label>
                                      <label>
                                        {t("Rubric", "채점 기준")}
                                        <textarea rows={4} value={studyItemDraftById[item.id]?.rubric || ""} onChange={(event) => updateStudyItemDraft(item.id, { rubric: event.target.value })} />
                                      </label>
                                    </div>
                                  ) : (
                                    <>

                                      <p>{item.suggestedAnswer}</p>
                                      {item.rubric ? <small className="short-answer-rubric">{item.rubric}</small> : null}
                                    </>
                                  )}

                                </QuestionCard>
                              ))}
                              {newItemAtEnd && renderNewStudyItemForm(activeStudySetView)}
                              <button type="button" className="question-add-bottom" disabled={isSavingNewStudyItem} onClick={()=>startCreatingStudyItem(activeStudySetView, true)}>{getAddStudyItemLabel(activeStudySetView)}</button>
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
                      <div className="chapter-document-editor">
                        {modern ? <>
                          <div className="reading-chapter-toolbar"><span>{t("Chapter", "챕터")} {selectedChapter.chapterNumber} · {t(`${selectedChapterWordCount.toLocaleString()} words`, `${selectedChapterWordCount.toLocaleString()}단어`)}</span>
                            <QuietMenu label={t("Chapter settings", "챕터 설정")}>
                              <label>{t("Number", "번호")}<input min="1" type="number" value={selectedChapterEdit.chapterNumber} onChange={event => handleChapterEdit(selectedChapter.id, { chapterNumber: event.target.value })} /></label>
                              <button type="button" className="danger-button" disabled={Boolean(deletingId) || Boolean(savingChapterId)} onClick={() => handleDeleteChapter(selectedChapter)}>{t("Delete Chapter", "챕터 삭제")}</button>
                              <button type="button" className="danger-button" disabled={Boolean(deletingId) || Boolean(savingChapterId)} onClick={handleClearChapters}>{t("Clear All Chapters", "모든 챕터 삭제")}</button>
                            </QuietMenu>
                          </div>
                          <input className="reading-chapter-title" aria-label={t("Title", "제목")} value={selectedChapterEdit.title} onChange={event => handleChapterEdit(selectedChapter.id, { title: event.target.value })} placeholder={`${t("Chapter", "챕터")} ${selectedChapter.chapterNumber}`} />
                        </> : <>
                        <div className="chapter-editor-header">
                          <div>
                            <p className="step-label">{t("Editing", "편집 중")}</p>
                            <h4>{t("Chapter", "챕터")} {selectedChapter.chapterNumber}{selectedChapter.title ? `: ${selectedChapter.title}` : ""}</h4>
                          </div>
                          <div className="chapter-editor-status">
                            <span>{t(`${selectedChapterWordCount.toLocaleString()} words`, `${selectedChapterWordCount.toLocaleString()}단어`)}</span>
                            {savingChapterId === selectedChapter.id || selectedChapterHasUnsavedChanges ? (
                              <strong className={selectedChapterHasUnsavedChanges ? "unsaved" : "saved"}>
                                {savingChapterId === selectedChapter.id
                                  ? t("Saving...", "저장 중...")
                                  : t("Unsaved changes", "저장되지 않은 변경")}
                              </strong>
                            ) : null}
                          </div>
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

                        </>}

                        <label className="chapter-text-field">
                          <span className={modern ? "visually-hidden" : undefined}>{t("Chapter text", "챕터 텍스트")}</span>
                          <textarea
                            rows={modern ? undefined : 22}
                            value={selectedChapterEdit.textContent}
                            onChange={(event) => handleChapterEdit(selectedChapter.id, { textContent: event.target.value })}
                          />
                        </label>
                      </div>

                      <div className="button-group editor-actions chapter-editor-actions">
                        {modern && selectedChapterHasUnsavedChanges && <span className="reading-unsaved" role="status">{t("Unsaved changes", "저장되지 않은 변경")}</span>}
                        <button
                          type="button"
                          disabled={savingChapterId === selectedChapter.id}
                          onClick={() => handleSaveChapter(selectedChapter)}
                        >
                          {savingChapterId === selectedChapter.id ? t("Saving...", "저장 중...") : t("Save Chapter", "챕터 저장")}
                        </button>
                        {!modern && activeWorkspaceTab === "chapters" ? (
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
              </>
            )}
          </section>
          ) : null}
        </div>
        </div>
      </section>
    </main>
  );
}
