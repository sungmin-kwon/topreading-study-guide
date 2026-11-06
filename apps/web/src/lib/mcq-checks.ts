export type Mcq = { questionText: string; choices: string[]; correctChoiceIndex: number; explanation: string; skill?: string; difficulty?: string; status?: string; sortOrder?: number };
export function hasAnswerLetterReference(text: string) { return /\b(?:option|choice|answer)\s*[([]?[A-D]\b|\b[A-D]\s+(?:is|would be)\s+(?:correct|incorrect)\b/i.test(text); }
export function checkMcq(q: Mcq): string[] {
  const flags: string[] = [];
  if (typeof q.questionText !== "string" || !q.questionText.trim() || typeof q.explanation !== "string" || !Array.isArray(q.choices) || q.choices.length !== 4 || q.choices.some(c => typeof c !== "string" || !c.trim()) || !Number.isInteger(q.correctChoiceIndex) || q.correctChoiceIndex < 0 || q.correctChoiceIndex >= q.choices.length) return ["invalid_structure"];
  const lengths = q.choices.map(c => c.trim().split(/\s+/).length);
  const correct = lengths[q.correctChoiceIndex]; const others = lengths.filter((_,i) => i !== q.correctChoiceIndex);
  if (new Set(q.choices.map(c => c.trim().toLowerCase().replace(/\s+/g," "))).size !== q.choices.length) flags.push("duplicate_choices");
  if (correct > 1.5 * Math.max(...others) && correct - Math.max(...others) >= 5) flags.push("correct_answer_length");
  if (correct >= 8 && Math.min(...others) <= 2) flags.push("very_short_distractor");
  if (q.choices.some(c => /^(?:all|none) of (?:the above|these|them)[.!]?$/i.test(c.trim()))) flags.push("collective_choice");
  if (hasAnswerLetterReference(`${q.questionText} ${q.explanation} ${q.choices.join(" ")}`)) flags.push("answer_letter_reference");
  return flags;
}
