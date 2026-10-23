import { hasAnswerLetterReference } from "./mcq-checks";
type MultipleChoiceLike = { choices: string[]; correctChoiceIndex: number; questionText?: string; explanation?: string | null };
function shuffle<T>(items:T[]) { for(let i=items.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [items[i],items[j]]=[items[j],items[i]]; } return items; }
export function balanceCorrectChoicePositions<T extends MultipleChoiceLike>(questions:T[]):T[] {
  const positions=new Map<number,number[]>();
  return questions.map(q=>{
    if (!Number.isInteger(q.correctChoiceIndex) || q.correctChoiceIndex<0 || q.correctChoiceIndex>=q.choices.length) throw new Error("Cannot shuffle an invalid answer index.");
    if(q.choices.length<2 || hasAnswerLetterReference(`${q.questionText || ""} ${q.explanation || ""} ${q.choices.join(" ")}`)) return {...q,choices:[...q.choices]};
    let pool=positions.get(q.choices.length);
    if(!pool?.length) {pool=shuffle(q.choices.map((_,i)=>i));positions.set(q.choices.length,pool);}
    const correctChoiceIndex=pool.pop()!;
    const choices=shuffle(q.choices.filter((_,i)=>i!==q.correctChoiceIndex)); choices.splice(correctChoiceIndex,0,q.choices[q.correctChoiceIndex]);
    return {...q,choices,correctChoiceIndex};
  });
}
