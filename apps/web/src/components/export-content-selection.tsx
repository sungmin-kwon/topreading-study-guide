"use client";
import type { PdfExportType } from "@/lib/pdf-export";

type Translate = (en: string, ko: string) => string;
export function ExportContentSelection({value, onChange, t}: {value: PdfExportType[]; onChange: (value: PdfExportType[]) => void; t: Translate}) {
  const groups: {id: string; label: string; options: {value: PdfExportType[]; label: string}[]}[] = [
    {id:"mcq",label:t("Multiple choice", "객관식"),options:[
      {value:["multiple-choice"],label:t("Questions only", "문제만")},
      {value:["multiple-choice","multiple-choice-concise-key"],label:t("Questions + answer key at the end", "문제 + 마지막에 답지")},
      {value:["multiple-choice-key"],label:t("Questions, answers and explanations", "문제, 정답 및 해설")},
      {value:["multiple-choice-concise-key"],label:t("Answer key only", "답지만")}]},
    {id:"short",label:t("Short answers", "단답형"),options:[
      {value:["short-answer"],label:t("Questions with writing space", "문제와 답안 작성 공간")},
      {value:["short-answer-key"],label:t("Questions, answers and rubrics", "문제, 예시 답안 및 채점 기준")}]},
    {id:"vocab",label:t("Vocabulary", "단어"),options:[
      {value:["vocabulary-list"],label:t("Words and meanings", "단어와 뜻")},
      {value:["vocabulary-quiz"],label:t("Quiz with blank answers", "빈칸 단어 퀴즈")}]},
    {id:"summary",label:t("Chapter summaries", "챕터 요약"),options:[{value:["chapter-summaries"],label:t("Teacher summaries", "교사용 요약")}]}
  ];
  return <fieldset className="reading-export-content"><legend>{t("Include", "포함할 내용")}</legend>{groups.map(group=>{
    const family=new Set(group.options.flatMap(option=>option.value));
    const selected=value.filter(type=>family.has(type));
    const enabled=selected.length>0;
    const current=group.options.find(option=>option.value.length===selected.length&&option.value.every(type=>selected.includes(type)))||group.options[0];
    const update=(next: PdfExportType[])=>onChange([...value.filter(type=>!family.has(type)),...next]);
    return <div className="reading-export-content-row" key={group.id}>
      <label><input type="checkbox" checked={enabled} onChange={event=>update(event.target.checked?group.options[0].value:[])} />{group.label}</label>
      {enabled&&group.options.length>1&&<select aria-label={`${group.label} ${t("layout", "형식")}`} value={current.value.join(",")} onChange={event=>{const option=group.options.find(option=>option.value.join(",")===event.target.value);if(option)update(option.value);}}>{group.options.map(option=><option key={option.value.join(",")} value={option.value.join(",")}>{option.label}</option>)}</select>}
    </div>;
  })}</fieldset>;
}
