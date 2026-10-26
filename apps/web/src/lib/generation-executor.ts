import { getRuntimeSetting } from "@/lib/admin-settings";
import { atomic } from "@/lib/db/client";
import { cancellationRequested } from "@/lib/generation-queue";
const outcome = (body: { error?: string; generationRun?: unknown }, _options?: unknown) => body;
import { getBook } from "@/lib/books";
import { getChapter } from "@/lib/chapters";
import { getGenerationRun, summarizeGenerationRun, updateGenerationRun, type GenerationLogEntry } from "@/lib/generation-runs";
import { generateOpenAIChapterItems, type OpenAIUsageSummary } from "@/lib/openai-generator";
import { appendStudyItems, listStudyItems, summarizeStudyItems, type StudyItemsInput } from "@/lib/study-items";
import { createStudySet, listStudySetsForRun, updateStudySet } from "@/lib/study-sets";

type ChapterPlanConfig = {
  chapterId: string;
  chapterNumber: number;
  plan: {
    vocabularyCount: number;
    multipleChoiceCount: number;
    shortAnswerCount: number;
  };
};

function parseRunConfig(value: unknown): ChapterPlanConfig[] {
  const config = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const chapters = Array.isArray(config.chapters) ? config.chapters : [];

  return chapters
    .map((item) => {
      const chapter = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const plan = chapter.plan && typeof chapter.plan === "object" ? chapter.plan as Record<string, unknown> : {};

      return {
        chapterId: String(chapter.chapterId || ""),
        chapterNumber: Number(chapter.chapterNumber) || 0,
        plan: {
          vocabularyCount: Math.max(0, Number(plan.vocabularyCount) || 0),
          multipleChoiceCount: Math.max(0, Number(plan.multipleChoiceCount) || 0),
          shortAnswerCount: Math.max(0, Number(plan.shortAnswerCount) || 0)
        }
      };
    })
    .filter((chapter) => chapter.chapterId && (
      chapter.plan.vocabularyCount > 0
      || chapter.plan.multipleChoiceCount > 0
      || chapter.plan.shortAnswerCount > 0
    ));
}

async function getPositiveIntegerEnv(name: "MAX_GENERATION_CHAPTERS" | "MAX_GENERATION_ITEMS", fallback: number) {
  const value = Number(await getRuntimeSetting(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getPlanItemCount(chapter: ChapterPlanConfig) {
  return chapter.plan.vocabularyCount + chapter.plan.multipleChoiceCount + chapter.plan.shortAnswerCount;
}

function nowIso() {
  return new Date().toISOString();
}

function logEntry(level: GenerationLogEntry["level"], message: string): GenerationLogEntry {
  return {
    timestamp: nowIso(),
    level,
    message
  };
}

function normalizeVocabularyTerm(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function vocabularyTermKeys(value: unknown) {
  const normalized = normalizeVocabularyTerm(value);
  if (!normalized) {
    return [];
  }

  const keys = new Set([normalized]);
  const words = normalized.split(" ");
  const lastWord = words[words.length - 1];
  if (
    words.length === 1
    && normalized.length > 4
    && normalized.endsWith("s")
    && !/(ss|us|is)$/.test(lastWord)
  ) {
    keys.add(normalized.slice(0, -1));
  }

  return [...keys];
}

function filterDuplicateVocabularyItems(input: StudyItemsInput, seenVocabularyTerms: Set<string>) {
  const skippedTerms: string[] = [];
  const vocabularyItems = (input.vocabularyItems || []).filter((item) => {
    const keys = vocabularyTermKeys(item.term);
    if (!keys.length) {
      return false;
    }

    if (keys.some((key) => seenVocabularyTerms.has(key))) {
      skippedTerms.push(String(item.term || "").trim() || "untitled term");
      return false;
    }

    keys.forEach((key) => seenVocabularyTerms.add(key));
    return true;
  });

  return {
    generatedItems: {
      ...input,
      vocabularyItems
    },
    skippedTerms
  };
}

function addUsage(total: Required<RunUsageSummary>, usage: OpenAIUsageSummary | null | undefined, model: string | null | undefined) {
  total.model = total.model || model || null;
  total.inputTokens += Number(usage?.input_tokens || 0);
  total.cachedInputTokens += Number(usage?.input_tokens_details?.cached_tokens || 0);
  total.outputTokens += Number(usage?.output_tokens || 0);
  total.reasoningTokens += Number(usage?.output_tokens_details?.reasoning_tokens || 0);
  total.totalTokens += Number(usage?.total_tokens || 0);
}

type RunUsageSummary = {
  model: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
};

function resolveModelPricing(modelName: string | null | undefined) {
  const normalized = String(modelName || "").trim().toLowerCase();
  const pricingByModel: Record<string, { input: number; cachedInput: number; output: number }> = {
    "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14.0 },
    "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10.0 },
    "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10.0 },
    "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
    "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
    "gpt-4.1": { input: 2.0, cachedInput: 0.5, output: 8.0 },
    "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
    "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
    "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10.0 },
    "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 }
  };

  return pricingByModel[normalized] || pricingByModel[normalized.replace(/-\d{4}-\d{2}-\d{2}$/, "")] || null;
}

function finalizeUsage(summary: Required<RunUsageSummary>): RunUsageSummary {
  const pricing = resolveModelPricing(summary.model);
  if (!pricing) {
    return { ...summary, estimatedCostUsd: null };
  }

  const uncachedInputTokens = Math.max(summary.inputTokens - summary.cachedInputTokens, 0);
  return {
    ...summary,
    estimatedCostUsd:
      (uncachedInputTokens / 1_000_000) * pricing.input
      + (summary.cachedInputTokens / 1_000_000) * pricing.cachedInput
      + (summary.outputTokens / 1_000_000) * pricing.output
  };
}

function formatUsageLine(summary: RunUsageSummary) {
  return `Run usage: model=${summary.model || "unknown"}, input=${summary.inputTokens.toLocaleString()} tokens (cached=${summary.cachedInputTokens.toLocaleString()}), output=${summary.outputTokens.toLocaleString()} tokens (reasoning=${summary.reasoningTokens.toLocaleString()}), total=${summary.totalTokens.toLocaleString()} tokens${summary.estimatedCostUsd === null ? "" : `, estimated cost=$${summary.estimatedCostUsd.toFixed(4)}`}.`;
}

export async function executeGeneration(bookId: string, generationRunId: string) {
  const book = await getBook(bookId);
  const generationRun = book ? await getGenerationRun(generationRunId) : null;

  if (!book || !generationRun || generationRun.bookId !== book.id) {
    return outcome({ error: "Generation run not found." }, { status: 404 });
  }

  const chaptersToGenerate = parseRunConfig(JSON.parse(generationRun.configJson || "{}"));
  if (!chaptersToGenerate.length) {
    return outcome({ error: "Generation run has no usable chapter plan." }, { status: 400 });
  }

  const maxChaptersPerRun = await getPositiveIntegerEnv("MAX_GENERATION_CHAPTERS", 80);
  if (chaptersToGenerate.length > maxChaptersPerRun) {
    return outcome({ error: `This run includes ${chaptersToGenerate.length} chapters. The configured limit is ${maxChaptersPerRun}.` }, { status: 400 });
  }

  const maxItemsPerRun = await getPositiveIntegerEnv("MAX_GENERATION_ITEMS", 2500);
  const requestedItems = chaptersToGenerate.reduce((total, chapter) => total + getPlanItemCount(chapter), 0);
  if (requestedItems > maxItemsPerRun) {
    return outcome({ error: `This run requests ${requestedItems} generated items. The configured limit is ${maxItemsPerRun}.` }, { status: 400 });
  }

  let runLog: GenerationLogEntry[] = [
    logEntry("info", `Starting OpenAI generation for "${book.title}".`),
    logEntry("info", `Queued ${chaptersToGenerate.length} chapter${chaptersToGenerate.length === 1 ? "" : "s"}.`)
  ];
  const usageSummary: Required<RunUsageSummary> = {
    model: null,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: null
  };

  // Never erase a saved version (including manually edited partial results) on rerun.
  if ((await listStudySetsForRun(generationRun.id)).length) {
    return outcome({ error: "This version already contains saved results. Create a new guide version to generate again; existing edits have been preserved." }, { status: 409 });
  }
  const runStudySet = await createStudySet({
    bookId: book.id,
    generationRunId: generationRun.id,
    chapter: null,
    title: generationRun.name || `${book.title} - ${nowIso().slice(0, 16).replace("T", " ")}`,
    generator: "openai",
    model: await getRuntimeSetting("OPENAI_MODEL"),
    promptVersion: "openai-study-guide-v2-mcq-quality",
    settings: JSON.parse(generationRun.configJson || "{}")
  });
  await updateGenerationRun({
    id: generationRun.id,
    status: "generating",
    progress: {
      completedChapters: 0,
      totalChapters: chaptersToGenerate.length,
      currentChapterId: null,
      currentChapterNumber: null
    },
    log: runLog,
    errorMessage: null,
    finishedAt: null
  });

  const rawChapters: unknown[] = [];
  let completedChapters = 0;
  try {
    let skippedDuplicateVocabularyCount = 0;
    const seenVocabularyTerms = new Set<string>();

    const finishCancelled = async (message: string) => {
      const finalUsage = finalizeUsage(usageSummary);
      const finalItems = await listStudyItems(runStudySet.id);
      const generatedCollections = summarizeStudyItems(finalItems);
      runLog = [
        ...runLog,
        logEntry("warn", message),
        logEntry("info", formatUsageLine(finalUsage)),
        logEntry("warn", "Generation cancelled. Partial results from completed chapters were kept.")
      ];

      await updateStudySet({
        studySetId: runStudySet.id,
        status: completedChapters > 0 ? "ready" : "failed",
        model: finalUsage.model,
        rawOutput: {
          bookTitle: book.title,
          chapters: rawChapters,
          ...generatedCollections,
          cancelled: true,
          skippedDuplicateVocabularyCount,
          usage: finalUsage
        }
      });

      const cancelled = await updateGenerationRun({
        id: generationRun.id,
        status: "cancelled",
        progress: {
          completedChapters,
          totalChapters: chaptersToGenerate.length,
          currentChapterId: null,
          currentChapterNumber: null,
          usage: finalUsage
        },
        log: runLog,
        errorMessage: null,
        finishedAt: nowIso()
      });

      return outcome({ generationRun: await summarizeGenerationRun(cancelled || generationRun) });
    };

    for (const [index, chapterConfig] of chaptersToGenerate.entries()) {
      if (await cancellationRequested(generationRun.id)) {
        return finishCancelled(`Cancellation received before Chapter ${chapterConfig.chapterNumber || index + 1}.`);
      }

      const chapter = await getChapter(chapterConfig.chapterId);
      if (!chapter || chapter.bookId !== book.id) {
        throw new Error(`Chapter ${chapterConfig.chapterNumber || index + 1} was not found.`);
      }

      runLog = [...runLog, logEntry("info", `Generating Chapter ${chapter.chapterNumber}${chapter.title ? `: ${chapter.title}` : ""}...`)];
      await updateGenerationRun({
        id: generationRun.id,
        status: "generating",
        progress: {
          completedChapters: index,
          totalChapters: chaptersToGenerate.length,
          currentChapterId: chapter.id,
          currentChapterNumber: chapter.chapterNumber
        },
        log: runLog
      });

      const result = await generateOpenAIChapterItems(book, chapter, chapterConfig.plan);
      const reviewCount = result.generatedItems.multipleChoiceQuestions?.filter(q => q.status === "needs_review").length || 0;
      if (reviewCount) runLog = [...runLog, logEntry("warn", `${reviewCount} MCQ(s) in Chapter ${chapter.chapterNumber} need human review after quality checks.`)];
      const deduplicated = filterDuplicateVocabularyItems(result.generatedItems, seenVocabularyTerms);
      skippedDuplicateVocabularyCount += deduplicated.skippedTerms.length;
      await atomic(async () => {
        await appendStudyItems(runStudySet.id, deduplicated.generatedItems, { chapterId: chapter.id, chapterRevisionId: chapter.currentRevisionId });
        completedChapters = index + 1;
        addUsage(usageSummary, result.usage, result.model);
        rawChapters.push({
          chapterId: chapter.id,
          chapterNumber: chapter.chapterNumber,
          chapterTitle: chapter.title,
          wordCount: chapter.wordCount,
          plan: result.plan,
          output: result.rawOutput,
          skippedDuplicateVocabularyTerms: deduplicated.skippedTerms,
          usage: result.usage
        });

        runLog = [
          ...runLog,
          ...(deduplicated.skippedTerms.length
            ? [logEntry("info", `Skipped ${deduplicated.skippedTerms.length} duplicate vocab term${deduplicated.skippedTerms.length === 1 ? "" : "s"} in Chapter ${chapter.chapterNumber}: ${deduplicated.skippedTerms.slice(0, 8).join(", ")}${deduplicated.skippedTerms.length > 8 ? ", ..." : ""}.`)]
            : []),
          logEntry("success", `Done Chapter ${chapter.chapterNumber}: ${deduplicated.generatedItems.vocabularyItems?.length || 0} vocab, ${deduplicated.generatedItems.multipleChoiceQuestions?.length || 0} MCQ, ${deduplicated.generatedItems.shortAnswerQuestions?.length || 0} short answer.`)
        ];

        await updateStudySet({studySetId: runStudySet.id, status: "generating", rawOutput: {
          chapters: rawChapters, incomplete: true, usage: finalizeUsage(usageSummary)
        }});
        await updateGenerationRun({
          id: generationRun.id,
          status: "generating",
          progress: {
            usage: finalizeUsage(usageSummary),
            completedChapters: index + 1,
            totalChapters: chaptersToGenerate.length,
            currentChapterId: chapter.id,
            currentChapterNumber: chapter.chapterNumber
          },
          log: runLog
        });
      });
      if (await cancellationRequested(generationRun.id)) {
        return finishCancelled(`Cancellation received after Chapter ${chapter.chapterNumber}.`);
      }

    }

    const finalUsage = finalizeUsage(usageSummary);
    const finalItems = await listStudyItems(runStudySet.id);
    const generatedCollections = summarizeStudyItems(finalItems);
    await updateStudySet({
      studySetId: runStudySet.id,
      status: "ready",
      model: finalUsage.model,
      rawOutput: {
        bookTitle: book.title,
        chapters: rawChapters,
        ...generatedCollections,
        skippedDuplicateVocabularyCount,
        usage: finalUsage
      }
    });
    runLog = [
      ...runLog,
      ...(skippedDuplicateVocabularyCount
        ? [logEntry("info", `Skipped ${skippedDuplicateVocabularyCount} duplicate vocabulary term${skippedDuplicateVocabularyCount === 1 ? "" : "s"} across this run.`)]
        : []),
      logEntry("info", formatUsageLine(finalUsage)),
      logEntry("success", "Generation complete. Review results in Study Sets.")
    ];
    const completed = await updateGenerationRun({
      id: generationRun.id,
      status: "completed",
      progress: {
        completedChapters: chaptersToGenerate.length,
        totalChapters: chaptersToGenerate.length,
        currentChapterId: null,
        currentChapterNumber: null,
        usage: finalUsage
      },
      log: runLog,
      finishedAt: nowIso()
    });

    return outcome({ generationRun: await summarizeGenerationRun(completed || generationRun) });
  } catch (error) {
    await updateStudySet({ studySetId: runStudySet.id, status: "failed", rawOutput: { chapters: rawChapters, incomplete: true, usage: finalizeUsage(usageSummary) } });
    const message = error instanceof Error ? error.message : "Generation failed.";
    const finalUsage = finalizeUsage(usageSummary);
    runLog = [...runLog, logEntry("error", `Failed: ${message}`)];
    const failed = await updateGenerationRun({
      id: generationRun.id,
      status: "failed",
      progress: {
        completedChapters: Math.max(0, runLog.filter((line) => line.message.startsWith("Done Chapter ")).length),
        totalChapters: chaptersToGenerate.length,
        currentChapterId: null,
        currentChapterNumber: null,
        usage: finalUsage
      },
      log: runLog,
      errorMessage: message,
      finishedAt: nowIso()
    });

    return outcome(
      { error: message, generationRun: failed ? await summarizeGenerationRun(failed) : null },
      { status: 400 }
    );
  }
}
