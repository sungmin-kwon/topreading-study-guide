// Match historical reviews by chapter + content, never by mutable list position.
// Duplicate/edited questions deliberately fall back to an unavailable reason.
export function reviewFlags(raw: unknown, chapterId: string | null, question: {questionText: string; choices: string[]}) : string[] {
  const root = raw as any;
  const outputs = Array.isArray(root?.chapters)
    ? root.chapters.filter((c: any) => c.chapterId === chapterId).map((c: any) => c.output)
    : [root];
  const signature = (choices: unknown) => Array.isArray(choices) ? JSON.stringify([...choices].sort()) : null;
  const matches = outputs.flatMap((o: any) => Array.isArray(o?.mcq_quality?.records) ? o.mcq_quality.records : [])
    .filter((r: any) => r?.final?.questionText === question.questionText && signature(r.final.choices) === signature(question.choices));
  return matches.length === 1 && Array.isArray(matches[0].flags)
    ? matches[0].flags.filter((f: unknown): f is string => typeof f === 'string') : [];
}
export const reviewReasonLabels: Record<string, [string, string]> = {
  correct_answer_length: ['The correct answer is noticeably longer than the distractors.', '정답이 오답보다 눈에 띄게 깁니다.'],
  very_short_distractor: ['Some distractors are much shorter than the correct answer.', '일부 오답이 정답보다 훨씬 짧습니다.'],
  duplicate_choices: ['Two or more choices have the same wording.', '같은 내용의 선택지가 있습니다.'],
  answer_letter_reference: ['The wording refers to choice letters and may give away the answer.', '선택지 기호를 언급하여 정답을 암시할 수 있습니다.'],
  semantic_disagreement: ['The reviewer found ambiguity or disagreed with the answer key.', '검토 모델이 모호함을 발견했거나 정답에 동의하지 않았습니다.'],
  wording_cues: ['The reviewer found wording that may give away the answer.', '정답을 암시하는 표현이 발견되었습니다.'],
  unsupported_evidence: ['The reviewer could not supply a verified quotation from the passage.', '본문에서 근거 인용을 확인하지 못했습니다.'],
  review_budget_exhausted: ['The automatic review limit was reached before verification finished.', '자동 검토 한도에 도달하여 확인이 완료되지 않았습니다.'],
  review_unavailable: ['The automatic reviewer failed or returned an unusable response.', '자동 검토가 실패했거나 응답을 사용할 수 없었습니다.'],
  invalid_repair: ['An automatic revision failed validation; check the retained question.', '자동 수정안이 검증에 실패했습니다. 저장된 문제를 확인하세요.'],
  invalid_structure: ['The question or choices have an invalid structure.', '문제 또는 선택지 형식에 문제가 있습니다.']
};
