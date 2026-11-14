import type { OpenAIUsageSummary } from "./openai-generator";

/** Usage reported by a received response still counts when its content is rejected. */
export class ChapterGenerationError extends Error {
  constructor(
    message: string,
    public readonly usage: OpenAIUsageSummary | null,
    public readonly model: string,
  ) {
    super(message);
    this.name = "ChapterGenerationError";
  }
}
