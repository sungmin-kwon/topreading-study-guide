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
  const bookStats = activeBook
    ? [
      `${sourceFiles.length} source${sourceFiles.length === 1 ? "" : "s"}`,
      `${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`,
      `${studySetCount} study set${studySetCount === 1 ? "" : "s"}`
    ]
    : [];
  const hasChapters = chapters.length > 0;
  const hasStudySets = studySetCount > 0;
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
    { type: "vocabulary-list", label: "Vocabulary List", description: "Words with English and Korean meanings." },
    { type: "vocabulary-quiz", label: "Vocabulary Quiz", description: "Words with blank answer lines." },
    { type: "multiple-choice", label: "MCQs", description: "Multiple-choice questions without answers." },
    { type: "multiple-choice-concise-key", label: "MCQ Concise Key", description: "Question numbers with answer letters only." },
    { type: "multiple-choice-key", label: "MCQ Detailed Key", description: "Questions with choices, answers, and explanations." },
    { type: "short-answer", label: "Short Answer", description: "Short-answer prompts with writing lines." },
    { type: "short-answer-key", label: "Short Answer Key", description: "Short-answer prompts with suggested answers." }
  ];
  const exportOptionGroups = [
    {
      title: "Vocabulary",
      description: "Word lists and vocabulary quiz sheets.",
      options: pdfExportOptions.filter((option) => option.type.startsWith("vocabulary"))
    },
    {
      title: "Multiple Choice",
      description: "Student handouts plus concise or detailed answer keys.",
      options: pdfExportOptions.filter((option) => option.type.startsWith("multiple-choice"))
    },
    {
      title: "Short Answer",
      description: "Writing prompts and suggested-answer keys.",
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
              <p>Study Guide Studio</p>
            </div>
          </div>
          <button
            className="collapse-sidebar-button"
            type="button"
            aria-label={isLibraryCollapsed ? "Expand library sidebar" : "Collapse library sidebar"}
            onClick={() => setIsLibraryCollapsed((current) => !current)}
          >
            {isLibraryCollapsed ? ">" : "<"}
          </button>
        </div>

        {!isLibraryCollapsed ? (
          <>
            <button className="primary-action" type="button" disabled={isCreating} onClick={handleCreateBook}>
              {isCreating ? "Creating..." : "New Book"}
            </button>

            <label className="book-search">
              Search library
              <input
                value={bookSearch}
                onChange={(event) => setBookSearch(event.target.value)}
                placeholder="Title or author"
              />
            </label>

            <section className="library-list" aria-label="Book library">
              {isLoading ? <p className="muted-text">Loading library...</p> : null}
              {!isLoading && books.length === 0 ? <p className="muted-text">No books yet.</p> : null}
              {!isLoading && books.length > 0 && filteredBooks.length === 0 ? <p className="muted-text">No matching books.</p> : null}
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
            <p className="eyebrow">Book Workspace</p>
            <h2>{activeBook?.title || "Create a book to begin"}</h2>
            <p className="workspace-subtitle">
              {activeBook?.author || "Upload a source file, review chapters, then generate a study set."}
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
            {activeBook ? (
              <button type="button" onClick={() => setIsBookMetadataOpen(true)}>
                Edit Details
              </button>
            ) : null}
            <div className="workspace-tabs" role="tablist" aria-label="Book workspace sections">
              <button
                className={activeWorkspaceTab === "source" ? "active" : ""}
                type="button"
                disabled={!activeBook}
                title={!activeBook ? "Create or select a book first." : "Manage source files."}
                onClick={() => setActiveWorkspaceTab("source")}
              >
                Source
              </button>
              <button
                className={activeWorkspaceTab === "chapters" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasChapters}
                title={!activeBook ? "Create or select a book first." : !hasChapters ? "Create chapters from a source file first." : "Review and edit chapters."}
                onClick={() => setActiveWorkspaceTab("chapters")}
              >
                Chapters
              </button>
              <button
                className={activeWorkspaceTab === "generate" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasChapters}
                title={!activeBook ? "Create or select a book first." : !hasChapters ? "Create chapters before generating study material." : "Generate study material."}
                onClick={() => setActiveWorkspaceTab("generate")}
              >
                Generate
              </button>
              <button
                className={activeWorkspaceTab === "study-sets" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasStudySets}
                title={!activeBook ? "Create or select a book first." : !hasStudySets ? "Generate at least one study set first." : "Review generated study sets."}
                onClick={() => {
                  setActiveWorkspaceTab("study-sets");
                  if (selectedChapter) {
                    void loadStudySets(selectedChapter);
                  }
                }}
              >
                Study Sets
              </button>
              <button
                className={activeWorkspaceTab === "export" ? "active" : ""}
                type="button"
                disabled={!activeBook || !hasStudySets}
                title={!activeBook ? "Create or select a book first." : !hasStudySets ? "Generate at least one study set before exporting." : "Export generated study material."}
                onClick={() => setActiveWorkspaceTab("export")}
              >
                Export
              </button>
            </div>
          </div>
        </header>

        {activeBook && isBookMetadataOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section className="metadata-dialog" role="dialog" aria-modal="true" aria-labelledby="book-details-title">
              <div className="dialog-header">
                <div>
                  <p className="eyebrow">Book Details</p>
                  <h3 id="book-details-title">{activeBook.title}</h3>
                </div>
                <button type="button" onClick={() => setIsBookMetadataOpen(false)}>
                  Close
                </button>
              </div>
              <form className="metadata-form" onSubmit={handleSaveBookMetadata}>
                <label>
                  Title
                  <input
                    value={bookMetadataEdit.title}
                    onChange={(event) => setBookMetadataEdit((current) => ({ ...current, title: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Author
                  <input
                    value={bookMetadataEdit.author}
                    onChange={(event) => setBookMetadataEdit((current) => ({ ...current, author: event.target.value }))}
                    placeholder="Optional"
                  />
                </label>
                <label>
                  Reading level
                  <input
                    value={bookMetadataEdit.readingLevel}
                    onChange={(event) => setBookMetadataEdit((current) => ({ ...current, readingLevel: event.target.value }))}
                    placeholder="Optional"
                  />
                </label>
                <div className="dialog-actions">
                  <button type="submit" disabled={isSavingBookMetadata}>
                    {isSavingBookMetadata ? "Saving..." : "Save Details"}
                  </button>
                  <button type="button" onClick={() => setIsBookMetadataOpen(false)}>
                    Cancel
                  </button>
                </div>
              </form>
              <div className="dialog-danger-zone">
                <div>
                  <strong>Delete book</strong>
                  <p className="muted-text">Removes the source files, extracted text, chapters, and generated sets for this book.</p>
                </div>
                <button
                  className="danger-button"
                  type="button"
                  disabled={deletingId === activeBook.id}
                  onClick={handleDeleteBook}
                >
                  {deletingId === activeBook.id ? "Deleting..." : "Delete Book"}
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
                  <p className="eyebrow">Generate</p>
                  <h3 id="generation-dialog-title">Configure Generation</h3>
                  <p className="muted-text">Select chapters and adjust item counts before starting a new run.</p>
                </div>
                <div className="dialog-actions">
                  <button type="button" disabled={isGeneratingBook || includedGenerationChapterCount === 0} onClick={handleGenerateBook}>
                    Start Generation
                  </button>
                  <button type="button" onClick={() => setIsGenerationModalOpen(false)}>
                    Cancel
                  </button>
                </div>
              </div>

              <div className="generation-total-strip" aria-label="Configured generation totals">
                <article>
                  <span>Chapters</span>
                  <strong>{includedGenerationChapterCount.toLocaleString()}</strong>
                </article>
                <article>
                  <span>Vocabulary</span>
                  <strong>{generationTotals.vocabularyCount.toLocaleString()}</strong>
                </article>
                <article>
                  <span>MCQ</span>
                  <strong>{generationTotals.multipleChoiceCount.toLocaleString()}</strong>
                </article>
                <article>
                  <span>Short Answer</span>
                  <strong>{generationTotals.shortAnswerCount.toLocaleString()}</strong>
                </article>
              </div>

              <div className="generation-modal-toolbar">
                <button type="button" disabled={isGeneratingBook} onClick={resetGenerationPlans}>
                  Reset Suggestions
                </button>
              </div>

              <div className="generation-plan-table generation-modal-plan-table">
                <div className="generation-plan-head">
                  <div>Use</div>
                  <div>Chapter</div>
                  <div>Words</div>
                  <div>Vocabulary</div>
                  <div>MCQ</div>
                  <div>Short Answer</div>
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
              <p className="step-label">Source</p>
              <h3>Source Files</h3>
            </div>

            <form className="upload-form" onSubmit={handleSourceUpload}>
              <label className="file-picker">
                <span className="file-picker-button">Browse...</span>
                <span className="file-picker-name">{sourceUploadFilename || "No source file selected"}</span>
                <input
                  aria-label="Source file"
                  disabled={!activeBook || isUploading}
                  name="sourceFile"
                  type="file"
                  accept="application/pdf,application/epub+zip,text/plain,.pdf,.epub,.txt"
                  onChange={(event) => setSourceUploadFilename(event.target.files?.[0]?.name || "")}
                />
              </label>
              <button type="submit" disabled={!activeBook || isUploading}>
                {isUploading ? "Uploading..." : "Upload Source"}
              </button>
            </form>

            <div className="source-list">
              {isLoadingSources ? <p className="muted-text">Loading source files...</p> : null}
              {!isLoadingSources && activeBook && sourceFiles.length === 0 ? (
                <div className="empty-state">
                  <strong>No source files yet</strong>
                  <p>Upload a PDF, EPUB, or TXT file to begin extracting book text.</p>
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
                        {extractingSourceId === sourceFile.id ? "Extracting..." : "Extract Text"}
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={deletingId === sourceFile.id}
                        onClick={() => handleDeleteSourceFile(sourceFile)}
                      >
                        {deletingId === sourceFile.id ? "Deleting..." : "Delete Source"}
                      </button>
                    </div>
                  </div>

                  <p className="source-path">{sourceFile.storedPath}</p>

                  <div className="source-row-main">
                    <div className="parsed-list">
                      {(parsedDocumentsBySource[sourceFile.id] || []).length === 0 ? (
                        <div className="source-next-step">
                          <strong>Text not extracted yet</strong>
                          <p>Run extraction to create searchable source text before splitting chapters.</p>
                        </div>
                      ) : null}
                      {(parsedDocumentsBySource[sourceFile.id] || []).map((parsedDocument) => {
                        const activeParsedTool = activeParsedToolByDocumentId[parsedDocument.id];

                        return (
                        <article className="parsed-row" key={parsedDocument.id}>
                          <div className="parsed-row-header">
                            <div>
                              <strong>Extracted Text</strong>
                              <span>
                                {parsedDocument.pageCount} pages · {parsedDocument.wordCount.toLocaleString()} words · {parsedDocument.parserName}
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
                                {splittingParsedDocumentId === parsedDocument.id ? "Creating..." : "Create Chapters"}
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
                                  ? "Previewing..."
                                  : activeParsedTool === "preview"
                                    ? "Hide Preview"
                                    : "Preview Split"}
                              </button>
                              <button
                                className={activeParsedTool === "inspect" ? "active-tool-button" : ""}
                                type="button"
                                disabled={loadingTextParsedDocumentId === parsedDocument.id}
                                onClick={() => handleLoadParsedText(parsedDocument)}
                              >
                                {loadingTextParsedDocumentId === parsedDocument.id
                                  ? "Loading..."
                                  : activeParsedTool === "inspect"
                                    ? "Hide Text"
                                    : "Inspect Text"}
                              </button>
                              <button
                                className={activeParsedTool === "pages" ? "active-tool-button" : ""}
                                type="button"
                                disabled={loadingPagesParsedDocumentId === parsedDocument.id}
                                onClick={() => handleLoadPages(parsedDocument)}
                              >
                                {loadingPagesParsedDocumentId === parsedDocument.id
                                  ? "Loading..."
                                  : activeParsedTool === "pages"
                                    ? "Hide Pages"
                                    : "Page Split"}
                              </button>
                            </div>
                            <div className="button-group parsed-danger-actions">
                              <button
                                className="danger-button"
                                type="button"
                                disabled={deletingId === parsedDocument.id}
                                onClick={() => handleDeleteParsedDocument(sourceFile, parsedDocument)}
                              >
                                {deletingId === parsedDocument.id ? "Deleting..." : "Delete Text"}
                              </button>
                            </div>
                          </div>
                          <p>{parsedDocument.preview || "No preview available."}</p>
                          {activeParsedTool === "inspect" && parsedDocumentDetailById[parsedDocument.id] ? (
                            <div className="text-inspector">
                              <div className="tool-panel-header">
                                <div>
                                  <strong>Inspect extracted text</strong>
                                  <span>Search the full parse or create chapters from exact text markers.</span>
                                </div>
                                <button type="button" onClick={() => handleCloseParsedTool(parsedDocument.id)}>Close</button>
                              </div>
                              <div className="inspector-grid">
                                <label>
                                  Search extracted text
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
                                  Manual chapter markers
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
                                  {splittingParsedDocumentId === parsedDocument.id ? "Creating..." : "Create From Markers"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {activeParsedTool === "pages" && parsedPagesByDocumentId[parsedDocument.id] ? (
                            <div className="page-splitter">
                              <div className="tool-panel-header">
                                <div>
                                  <strong>Page-based split</strong>
                                  <span>{parsedPagesByDocumentId[parsedDocument.id].length} extracted pages available</span>
                                </div>
                                <button type="button" onClick={() => handleCloseParsedTool(parsedDocument.id)}>Close</button>
                              </div>
                              <div className="inspector-grid">
                                <label>
                                  Chapter start pages
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
                                    <p className="muted-text">No page rows found. Delete this extracted text and run Extract Text again.</p>
                                  ) : null}
                                  {parsedPagesByDocumentId[parsedDocument.id].slice(0, 24).map((page) => (
                                    <article className="page-preview-row" key={page.id}>
                                      <strong>Page {page.pageNumber}</strong>
                                      <span>{page.wordCount.toLocaleString()} words</span>
                                      <p>{page.preview || "No text on this page."}</p>
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
                                  {splittingParsedDocumentId === parsedDocument.id ? "Creating..." : "Create From Pages"}
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
                                      ? "Heading split preview"
                                      : "Single-chapter fallback"}
                                  </strong>
                                  <span>
                                    {splitPreviewByParsedDocument[parsedDocument.id].acceptedCandidates} accepted /{" "}
                                    {splitPreviewByParsedDocument[parsedDocument.id].totalCandidates} candidates
                                  </span>
                                </div>
                                <button type="button" onClick={() => handleCloseParsedTool(parsedDocument.id)}>Close</button>
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
                                        {candidate.chapterNumber ? ` · chapter ${candidate.chapterNumber}` : ""}
                                        {candidate.accepted ? " · accepted" : ""}
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
                <p className="step-label">Generate</p>
                <h3>Generation Plan</h3>
              </div>
              <button
                type="button"
                disabled={!activeBook || chapters.length === 0 || isGeneratingBook}
                onClick={openGenerationModal}
              >
                {isGeneratingBook ? "Generating..." : "Configure Generation"}
              </button>
            </div>

            {chapters.length === 0 ? (
              <div className="empty-state">
                <strong>No chapters ready</strong>
                <p>Create chapters from extracted source text before starting generation.</p>
              </div>
            ) : (
              <div className="generation-plan-panel">
                <div className="generation-terminal" aria-live="polite">
                  {generationLog.length === 0 ? (
                    <p>$ waiting for generation job...</p>
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
                    {includedGenerationChapterCount} of {chapters.length} chapter{chapters.length === 1 ? "" : "s"} selected.
                    Use Configure Generation to choose chapters and adjust item counts before the run.
                  </p>
                  <button type="button" disabled={isGeneratingBook} onClick={openGenerationModal}>
                    Configure
                  </button>
                </div>

                <div className="generation-total-strip" aria-label="Whole book generation totals">
                  <article>
                    <span>Vocabulary</span>
                    <strong>{generationTotals.vocabularyCount.toLocaleString()}</strong>
                  </article>
                  <article>
                    <span>Multiple Choice</span>
                    <strong>{generationTotals.multipleChoiceCount.toLocaleString()}</strong>
                  </article>
                  <article>
                    <span>Short Answer</span>
                    <strong>{generationTotals.shortAnswerCount.toLocaleString()}</strong>
                  </article>
                </div>

                <section className="generation-history-panel">
                  <div className="study-item-section-header">
                    <strong>Generation History</strong>
                    <span>{generationRuns.length}</span>
                  </div>
                  {generationRuns.length > 0 ? (
                    <div className="active-run-selector">
                      <label htmlFor="active-generation-run">Active version</label>
                      <select
                        id="active-generation-run"
                        value={activeBook?.activeGenerationRunId || ""}
                        onChange={(event) => void handleSelectActiveGenerationRun(event.target.value || null)}
                      >
                        <option value="">Latest study sets across all runs</option>
                        {generationRuns.map((run) => (
                          <option key={run.id} value={run.id}>
                            {run.name} ({run.status})
                          </option>
                        ))}
                      </select>
                      <p>
                        Study Sets and whole-book exports use this version.
                      </p>
                    </div>
                  ) : null}
                  {generationRuns.length === 0 ? (
                    <div className="empty-state">
                      <strong>No generation runs yet</strong>
                      <p>Completed runs will appear here with chapter and item totals.</p>
                    </div>
                  ) : (
                    <div className="generation-history-list">
                      {generationRuns.map((run) => (
                        <article className="generation-history-card" key={run.id}>
                          <div>
                            <strong>{run.name}{activeBook?.activeGenerationRunId === run.id ? " · Active" : ""}</strong>
                            <p>
                              {formatDateTime(run.startedAt)} · {run.status}
                              {run.finishedAt ? ` · finished ${formatDateTime(run.finishedAt)}` : ""}
                            </p>
                            <p>
                              {run.chapterCount} chapters · {run.vocabularyCount} vocab · {run.multipleChoiceCount} MCQ · {run.shortAnswerCount} short answer
                            </p>
                            {run.errorMessage ? <p className="generation-error-text">{run.errorMessage}</p> : null}
                          </div>
                          <div className="generation-history-actions">
                            <button
                              type="button"
                              disabled={activeBook?.activeGenerationRunId === run.id}
                              onClick={() => void handleSelectActiveGenerationRun(run.id)}
                            >
                              {activeBook?.activeGenerationRunId === run.id ? "Active" : "Use Run"}
                            </button>
                            <button
                              className="danger-button"
                              type="button"
                              disabled={run.status === "generating" || deletingId === run.id}
                              onClick={() => handleDeleteGenerationRun(run)}
                            >
                              {deletingId === run.id ? "Deleting..." : "Delete Run"}
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
                <p className="step-label">Export</p>
                <h3>Exports</h3>
              </div>
            </div>

            {chapters.length === 0 ? (
              <div className="empty-state">
                <strong>No exports available</strong>
                <p>Create chapters and generate at least one study set before exporting files.</p>
              </div>
            ) : (
              <div className="export-page-stack">
                <div className="export-workspace">
                  <div className="export-scope-block">
                    <div>
                      <p className="step-label">Whole Book</p>
                      <h4>{activeGenerationRun ? `Export ${activeGenerationRun.name}` : "Export latest generated set for every chapter"}</h4>
                      <p className="muted-text">
                        {activeGenerationRun
                          ? "Uses study sets from the active generation run."
                          : "Uses the newest study set for each chapter that has generated material."}
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
                                    Word
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
                    {showSingleChapterExport ? "Hide Single-Chapter Export" : "Show Single-Chapter Export"}
                  </button>
                  <p className="muted-text">Use this only when you need a one-chapter handout.</p>
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
                            Chapter {chapter.chapterNumber}{chapter.title ? `: ${chapter.title}` : ""}
                          </strong>
                          <span>{chapter.wordCount.toLocaleString()} words</span>
                        </div>
                        <p>{chapter.preview}</p>
                      </button>
                    ))}
                  </div>

                  <div className="export-workspace">
                    <div className="export-scope-block">
                    {!selectedChapter ? (
                      <p className="muted-text">Select a chapter to export.</p>
                    ) : (
                      <>
                        <div className="study-set-header">
                          <div>
                            <p className="step-label">Single Chapter</p>
                            <h4>{selectedStudySet?.title || "No generated study set selected"}</h4>
                            {selectedStudySet ? (
                              <p className="muted-text">
                                Generated {formatDateTime(selectedStudySet.createdAt)}
                                {selectedStudySet.model ? ` with ${selectedStudySet.model}` : ""}
                              </p>
                            ) : null}
                          </div>
                          <div className="study-set-controls">
                            {loadingStudySetsChapterId === selectedChapter.id ? (
                              <span>Loading...</span>
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
                          <p className="muted-text">Generate a study set for this chapter before exporting.</p>
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
                                          Word
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
                <p className="step-label">{activeWorkspaceTab === "study-sets" ? "Study Sets" : "Chapters"}</p>
                <h3>{activeWorkspaceTab === "study-sets" ? "Study Set Review" : "Chapter Review"}</h3>
                {activeWorkspaceTab === "study-sets" && activeGenerationRun ? (
                  <p className="muted-text">Viewing active version: {activeGenerationRun.name}</p>
                ) : null}
              </div>
              {activeWorkspaceTab === "chapters" ? (
                <button
                  className="danger-button"
                  type="button"
                  disabled={chapters.length === 0 || deletingId === "chapters"}
                  onClick={handleClearChapters}
                >
                  {deletingId === "chapters" ? "Clearing..." : "Clear Chapters"}
                </button>
              ) : null}
            </div>

            {chapters.length === 0 ? (
              <div className="empty-state">
                <strong>No chapters created yet</strong>
                <p>Use the Source tab to extract text and split the book into chapters.</p>
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
                          Chapter {chapter.chapterNumber}{chapter.title ? `: ${chapter.title}` : ""}
                        </strong>
                        <span>{chapter.wordCount.toLocaleString()} words</span>
                      </div>
                      <p>{chapter.preview}</p>
                    </button>
                  ))}
                </div>

                <div className="chapter-editor">
                  {!selectedChapter ? (
                    <p className="muted-text">Select a chapter to continue.</p>
                  ) : loadingChapterId === selectedChapter.id ? (
                    <p className="muted-text">Loading chapter...</p>
                  ) : activeWorkspaceTab === "study-sets" ? (
                    <>
                      <div className="study-set-panel">
                        <div className="study-set-header">
                          <div>
                            <p className="step-label">Study Set</p>
                            <h4>{selectedStudySet?.title || "No study set yet"}</h4>
                            {selectedStudySet ? (
                              <div className="study-set-meta-row">
                                <span>{selectedStudySet.status}</span>
                                <span>{formatDateTime(selectedStudySet.createdAt)}</span>
                                {selectedStudySet.model ? <span>{selectedStudySet.model}</span> : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="study-set-controls">
                            {loadingStudySetsChapterId === selectedChapter.id ? (
                              <span>Loading...</span>
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
                                {deletingId === selectedStudySet.id ? "Deleting..." : "Delete Study Set"}
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {selectedStudySet ? (
                          <div className="study-set-edit-panel">
                            <label>
                              Rename
                              <input
                                value={studySetDraftById[selectedStudySet.id]?.title || selectedStudySet.title}
                                onChange={(event) => updateStudySetDraft(selectedStudySet.id, { title: event.target.value })}
                              />
                            </label>
                            <label>
                              Status
                              <select
                                value={studySetDraftById[selectedStudySet.id]?.status || selectedStudySet.status}
                                onChange={(event) => updateStudySetDraft(selectedStudySet.id, { status: event.target.value })}
                              >
                                {studySetStatuses.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={savingStudySetId === selectedStudySet.id}
                              onClick={() => handleSaveStudySet(selectedStudySet)}
                            >
                              {savingStudySetId === selectedStudySet.id ? "Saving..." : "Save Study Set"}
                            </button>
                          </div>
                        ) : null}

                        {!selectedStudySet ? (
                          <p className="muted-text">Generate a study set to review vocabulary and questions.</p>
                        ) : loadingStudyItemsSetId === selectedStudySet.id ? (
                          <p className="muted-text">Loading generated items...</p>
                        ) : selectedStudyItems ? (
                          <>
                          <div className="study-set-subtabs" role="tablist" aria-label="Study set item type">
                            <button
                              className={activeStudySetView === "vocabulary" ? "active" : ""}
                              type="button"
                              onClick={() => setActiveStudySetView("vocabulary")}
                            >
                              Vocabulary
                              <span>{selectedStudyItems.vocabularyItems.length}</span>
                            </button>
                            <button
                              className={activeStudySetView === "multiple-choice" ? "active" : ""}
                              type="button"
                              onClick={() => setActiveStudySetView("multiple-choice")}
                            >
                              Multiple Choice
                              <span>{selectedStudyItems.multipleChoiceQuestions.length}</span>
                            </button>
                            <button
                              className={activeStudySetView === "short-answer" ? "active" : ""}
                              type="button"
                              onClick={() => setActiveStudySetView("short-answer")}
                            >
                              Short Answer
                              <span>{selectedStudyItems.shortAnswerQuestions.length}</span>
                            </button>
                          </div>

                          {activeStudySetView === "vocabulary" ? (
                          <div className="study-items-grid single-column">
                            <section className="study-item-section">
                              <div className="study-item-section-header">
                                <strong>Vocabulary</strong>
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
                                        <button type="button" disabled={savingStudyItemId === item.id} onClick={() => handleSaveStudyItem("vocabulary", item.id)}>{savingStudyItemId === item.id ? "Saving..." : "Save"}</button>
                                        <button type="button" onClick={() => setEditingStudyItemId(null)}>Cancel</button>
                                      </>
                                    ) : (
                                      <button type="button" onClick={() => startEditingStudyItem("vocabulary", item)}>Edit</button>
                                    )}
                                    <button className="danger-button" type="button" disabled={deletingId === item.id} onClick={() => handleDeleteStudyItem("vocabulary", item.id)}>{deletingId === item.id ? "Deleting..." : "Delete"}</button>
                                  </div>
                                </article>
                              ))}
                            </section>
                          </div>
                          ) : activeStudySetView === "multiple-choice" ? (
                          <div className="study-items-grid single-column">
                            <section className="study-item-section">
                              <div className="study-item-section-header">
                                <strong>Multiple Choice</strong>
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
                                      <ol>
                                        {item.choices.map((choice, index) => (
                                          <li className={index === item.correctChoiceIndex ? "correct-choice" : ""} key={`${item.id}-${choice}`}>{choice}</li>
                                        ))}
                                      </ol>
                                      {item.explanation ? <small>{item.explanation}</small> : null}
                                    </>
                                  )}
                                  <div className="study-item-actions">
                                    {editingStudyItemId === item.id ? (
                                      <>
                                        <button type="button" disabled={savingStudyItemId === item.id} onClick={() => handleSaveStudyItem("multiple-choice", item.id)}>{savingStudyItemId === item.id ? "Saving..." : "Save"}</button>
                                        <button type="button" onClick={() => setEditingStudyItemId(null)}>Cancel</button>
                                      </>
                                    ) : (
                                      <button type="button" onClick={() => startEditingStudyItem("multiple-choice", item)}>Edit</button>
                                    )}
                                    <button className="danger-button" type="button" disabled={deletingId === item.id} onClick={() => handleDeleteStudyItem("multiple-choice", item.id)}>{deletingId === item.id ? "Deleting..." : "Delete"}</button>
                                  </div>
                                </article>
                              ))}
                            </section>
                          </div>
                          ) : (
                          <div className="study-items-grid single-column">
                            <section className="study-item-section">
                              <div className="study-item-section-header">
                                <strong>Short Answer</strong>
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
                                        <button type="button" disabled={savingStudyItemId === item.id} onClick={() => handleSaveStudyItem("short-answer", item.id)}>{savingStudyItemId === item.id ? "Saving..." : "Save"}</button>
                                        <button type="button" onClick={() => setEditingStudyItemId(null)}>Cancel</button>
                                      </>
                                    ) : (
                                      <button type="button" onClick={() => startEditingStudyItem("short-answer", item)}>Edit</button>
                                    )}
                                    <button className="danger-button" type="button" disabled={deletingId === item.id} onClick={() => handleDeleteStudyItem("short-answer", item.id)}>{deletingId === item.id ? "Deleting..." : "Delete"}</button>
                                  </div>
                                </article>
                              ))}
                            </section>
                          </div>
                          )}
                          </>
                        ) : (
                          <p className="muted-text">Select a study set to load its generated items.</p>
                        )}
                      </div>
                    </>
                  ) : !selectedChapterEdit ? (
                    <div className="empty-editor">
                      <h4>Chapter {selectedChapter.chapterNumber}</h4>
                      <p className="muted-text">Open this chapter to load the full text for editing.</p>
                      <button type="button" onClick={() => handleSelectChapter(selectedChapter)}>
                        Open Chapter
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="chapter-editor-header">
                        <div>
                          <p className="step-label">Editor</p>
                          <h4>Chapter {selectedChapter.chapterNumber}</h4>
                        </div>
                        <span>{selectedChapterWordCount.toLocaleString()} words</span>
                      </div>

                      <div className="chapter-form-grid">
                        <label>
                          Number
                          <input
                            min="1"
                            type="number"
                            value={selectedChapterEdit.chapterNumber}
                            onChange={(event) => handleChapterEdit(selectedChapter.id, { chapterNumber: event.target.value })}
                          />
                        </label>
                        <label>
                          Title
                          <input
                            value={selectedChapterEdit.title}
                            onChange={(event) => handleChapterEdit(selectedChapter.id, { title: event.target.value })}
                            placeholder={`Chapter ${selectedChapter.chapterNumber}`}
                          />
                        </label>
                      </div>

                      <label className="chapter-text-field">
                        Chapter text
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
                          {savingChapterId === selectedChapter.id ? "Saving..." : "Save Chapter"}
                        </button>
                        {activeWorkspaceTab === "chapters" ? (
                          <button
                            className="danger-button"
                            type="button"
                            disabled={deletingId === selectedChapter.id}
                            onClick={() => handleDeleteChapter(selectedChapter)}
                          >
                            {deletingId === selectedChapter.id ? "Deleting..." : "Delete Chapter"}
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
