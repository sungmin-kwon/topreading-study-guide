type Counts = {
  vocabularyCount: number;
  multipleChoiceCount: number;
  shortAnswerCount: number;
};
// Validate before normalization: never silently truncate excess items or invent missing text.
// These checks establish completeness, not semantic correctness or teacher approval.
export function validateGeneratedContent(payload: unknown, plan: Counts): void {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Generated guide is not an object.");
  const data = payload as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0;
  if (!text(data.chapter_summary))
    throw new Error("Generated chapter summary is missing.");
  const groups: [string, number, string[]][] = [
    [
      "vocabulary_items",
      plan.vocabularyCount,
      [
        "term",
        "english_definition",
        "korean_definition",
        "context_sentence",
        "part_of_speech",
      ],
    ],
    [
      "multiple_choice_questions",
      plan.multipleChoiceCount,
      ["question_text", "explanation"],
    ],
    [
      "short_answer_questions",
      plan.shortAnswerCount,
      ["question_text", "suggested_answer", "rubric"],
    ],
  ];
  for (const [key, count, fields] of groups) {
    const items = data[key];
    if (!Array.isArray(items) || items.length !== count) {
      const label =
        key === "multiple_choice_questions"
          ? "MCQ"
          : key === "short_answer_questions"
            ? "short-answer question"
            : "vocabulary item";
      throw new Error(
        `Generated ${label} count mismatch: expected ${count}, received ${Array.isArray(items) ? items.length : "a missing or invalid list"}.`,
      );
    }
    items.forEach((item, index) => {
      if (
        !item ||
        typeof item !== "object" ||
        fields.some((field) => !text(item[field]))
      ) {
        throw new Error(
          `Generated ${key} item ${index + 1} has missing required content. No placeholder was saved.`,
        );
      }
    });
  }
}
