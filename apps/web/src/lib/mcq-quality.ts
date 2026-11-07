import { createHash } from "node:crypto";
import { checkMcq, type Mcq } from "./mcq-checks";
export type BlindQuestion = { questionText: string; choices: string[] };
export type Review = { supported_index: number; ambiguous: boolean; stem_supported: boolean; cues: string[]; evidence_quote: string; choice_reasons: string[] };
export type QualityProvider = { review: (passage: string, question: BlindQuestion) => Promise<Review>; repair: (passage: string, question: Mcq, issues: string[]) => Promise<Mcq> };
export type QualityRecord = { original: Mcq; final: Mcq; flags: string[]; initialFlags: string[]; repairs: number; reviewed: boolean; evidence: string | null; reviews: { choices: string[]; verdict: Review }[]; status: "draft" | "needs_review" };
function blind(q: Mcq) {
  const order = q.choices.map((_,i) => i);
  for (let i=order.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [order[i],order[j]]=[order[j],order[i]]; }
  return { order, question: { questionText:q.questionText, choices:order.map(i=>q.choices[i]) } };
}
export async function assessMcqs(questions: Mcq[], passage: string, provider: QualityProvider, maxCalls = 40): Promise<{ questions: Mcq[]; records: QualityRecord[]; calls: number }> {
  let calls=0; const records: QualityRecord[]=[];
  for (const question of questions) if (checkMcq(question).includes("invalid_structure")) throw new Error("Generated MCQ has an invalid structure; no placeholder answers were created.");
  // Content-ranked sampling is reproducible but independent of list position.
  // Keep the existing ~10% sample size and always include structural warnings.
  const sample = new Set(questions.map((q, index) => ({ index, rank: createHash("sha256").update(JSON.stringify([passage, q.questionText, [...q.choices].sort()])).digest("hex") }))
    .sort((a,b) => a.rank.localeCompare(b.rank)).slice(0, Math.ceil(questions.length / 10)).map(q => q.index));
  const normalizeEvidence = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
  for (const [index, original] of questions.entries()) {
    let candidate=structuredClone(original); const initialFlags=checkMcq(candidate); let flags=[...initialFlags]; let repairs=0; let reviewed=false; let evidence:string|null=null; const reviews: { choices: string[]; verdict: Review }[]=[];
    // Review every flagged item plus a reproducible sample of otherwise unflagged items.
    const selected=flags.length>0 || sample.has(index);
    if (selected) {
      for (;;) {
        if (calls>=maxCalls) { flags=[...flags,"review_budget_exhausted"]; break; }
        try {
          const hidden=blind(candidate); calls++;
          const verdict=await provider.review(passage,hidden.question);
          if (!Number.isInteger(verdict.supported_index) || verdict.supported_index < -1 || verdict.supported_index > 3 || typeof verdict.ambiguous!=="boolean" || typeof verdict.stem_supported!=="boolean" || !Array.isArray(verdict.cues) || verdict.cues.some(c=>typeof c!=="string") || typeof verdict.evidence_quote!=="string" || !Array.isArray(verdict.choice_reasons) || verdict.choice_reasons.length!==4 || verdict.choice_reasons.some(r=>typeof r!=="string" || !r.trim())) throw new Error("Invalid review");
          reviewed=true;
          reviews.push({choices:hidden.question.choices,verdict});
          flags=checkMcq(candidate);
          if (verdict.ambiguous || hidden.order[verdict.supported_index]!==candidate.correctChoiceIndex) flags.push("semantic_disagreement");
          if (!verdict.stem_supported) flags.push("unsupported_premise");
          if (verdict.cues.length) flags.push("wording_cues");
          if (!verdict.evidence_quote.trim() || verdict.evidence_quote.length>240 || !normalizeEvidence(passage).includes(normalizeEvidence(verdict.evidence_quote))) flags.push("unsupported_evidence");
          evidence=flags.includes("unsupported_evidence")?null:verdict.evidence_quote;
          if (!flags.length || repairs>=2) break;
          if (calls>=maxCalls) { flags.push("review_budget_exhausted"); break; }
          calls++; const repaired=await provider.repair(passage,candidate,flags.concat(verdict.cues)); repairs++;
          if (checkMcq(repaired).includes("invalid_structure")) { flags.push("invalid_repair"); break; }
          candidate={...candidate,...repaired,sortOrder:original.sortOrder};
          // A repair is never accepted without a fresh blind review.
        } catch { flags=[...flags,"review_unavailable"]; break; }
      }
    }
    const status=flags.length?"needs_review":"draft";
    records.push({original,final:candidate,initialFlags,flags:[...new Set(flags)],repairs,reviewed,evidence,reviews,status});
  }
  // Cross-item checks run after repairs, which can introduce duplicate stems.
  const stemKey = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const counts = new Map<string, number>();
  for (const record of records) { const key = stemKey(record.final.questionText); counts.set(key, (counts.get(key) || 0) + 1); }
  for (const record of records) {
    if ((counts.get(stemKey(record.final.questionText)) || 0) > 1) { record.flags.push("duplicate_question"); record.status = "needs_review"; }
  }
  return { questions:records.map(r=>({...r.final,status:r.status})), records, calls };
}
