export type Mcq = { questionText: string; choices: string[]; correctChoiceIndex: number; explanation: string; skill?: string; difficulty?: string; status?: string; sortOrder?: number };
export function hasAnswerLetterReference(text: string) { return /\b(?:option|choice|answer)\s*[([]?[A-D]\b|\b[A-D]\s+(?:is|would be)\s+(?:correct|incorrect)\b/i.test(text); }
// A conservative wording warning, not a judgment about source support. Short
// parallel answers (names, dates, concise contrasts) should remain unflagged.
function hasRepetitiveChoiceTemplates(choices: string[]): boolean {
  const tokens = choices.map(choice => (choice.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).slice(0, 160));
  if (tokens.some(words => words.length < 8)) return false;
  const similarity = (a: string[], b: string[]) => {
    let row = new Array<number>(b.length + 1).fill(0);
    for (const word of a) {
      const next = [0];
      for (let j = 0; j < b.length; j++) next.push(word === b[j] ? row[j] + 1 : Math.max(row[j + 1], next[j]));
      row = next;
    }
    return 2 * row[b.length] / (a.length + b.length);
  };
  let sharedPrefix = 0;
  while (sharedPrefix < Math.min(...tokens.map(words => words.length)) && tokens.every(words => words[sharedPrefix] === tokens[0][sharedPrefix])) sharedPrefix++;
  // A long repeated lead-in is another pattern: choices may only diverge in
  // their final clause, obscuring the actual distinction behind repeated text.
  if (sharedPrefix >= 6 && tokens.every(words => sharedPrefix / words.length >= 0.4)) return true;
  // Otherwise all six pairs must share most wording in the same order.
  return tokens.every((a, i) => tokens.slice(i + 1).every(b => similarity(a, b) >= 0.72));
}
export function checkMcq(q: Mcq): string[] {
  const flags: string[] = [];
  if (typeof q.questionText !== "string" || !q.questionText.trim() || typeof q.explanation !== "string" || !Array.isArray(q.choices) || q.choices.length !== 4 || q.choices.some(c => typeof c !== "string" || !c.trim()) || !Number.isInteger(q.correctChoiceIndex) || q.correctChoiceIndex < 0 || q.correctChoiceIndex >= q.choices.length) return ["invalid_structure"];
  const lengths = q.choices.map(c => c.trim().split(/\s+/).length);
  const correct = lengths[q.correctChoiceIndex]; const others = lengths.filter((_,i) => i !== q.correctChoiceIndex);
  if (new Set(q.choices.map(c => c.trim().toLowerCase().replace(/\s+/g," "))).size !== q.choices.length) flags.push("duplicate_choices");
  if (hasRepetitiveChoiceTemplates(q.choices)) flags.push("repetitive_choice_templates");
  if (correct > 1.5 * Math.max(...others) && correct - Math.max(...others) >= 5) flags.push("correct_answer_length");
  if (correct >= 8 && Math.min(...others) <= 2) flags.push("very_short_distractor");
  if (q.choices.some(c => /^(?:all|none) of (?:the above|these|them)[.!]?$/i.test(c.trim()))) flags.push("collective_choice");
  if (hasAnswerLetterReference(`${q.questionText} ${q.explanation} ${q.choices.join(" ")}`)) flags.push("answer_letter_reference");
  return flags;
}
