"use client";
import {useEffect, useRef, useState, type ReactNode} from 'react';
export function QuestionCard({id,group,index,title,editing,busy,review,expansion,actions,children,onMove,onDrop,korean}: {
  id:string;group:string;index:number;title:string;editing:boolean;busy:boolean;review:boolean;
  expansion:{open:boolean;version:number};actions:ReactNode;children:ReactNode;
  onMove:(direction:'up'|'down')=>void;onDrop:(target:string)=>void;korean:boolean;
}) {
  const [open,setOpen]=useState(false);
  const [dragging,setDragging]=useState(false);
  const target=useRef<HTMLElement|null>(null);
  const start=useRef<{x:number;y:number}|null>(null);
  const moved=useRef(false);
  function clear(){target.current?.removeAttribute('data-drop-target');target.current=null;start.current=null;moved.current=false;setDragging(false);}
  useEffect(()=>{setOpen(expansion.open);},[expansion]);
  useEffect(()=>()=>{target.current?.removeAttribute('data-drop-target');},[]);
  const expanded=editing||open;
  return <article className={`study-item-card question-card ${dragging?'is-dragging':''}`} data-question-id={id} data-question-group={group}>
    <div className="question-row-heading">
      <button type="button" className="question-drag-handle" disabled={busy||editing}
        aria-label={korean?`문제 ${index+1} 순서 변경: 드래그하거나 위아래 방향키 사용`:`Reorder question ${index+1}: drag or use Up and Down arrow keys`}
        onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();onMove(e.key==='ArrowUp'?'up':'down');} if(e.key==='Escape')clear();}}
        onPointerDown={e=>{if(e.button!==0)return;start.current={x:e.clientX,y:e.clientY};moved.current=false;e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{
          if(!start.current)return;
          if(Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)<6&&!moved.current)return;
          moved.current=true;setDragging(true);
          const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-question-id]');
          target.current?.removeAttribute('data-drop-target');target.current=null;
          if(hit&&hit.dataset.questionGroup===group&&hit.dataset.questionId!==id){target.current=hit;hit.setAttribute('data-drop-target',e.currentTarget.closest('[data-question-id]')!.compareDocumentPosition(hit) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before');}
          let scroller=e.currentTarget.parentElement;
          while(scroller&&!(scroller.scrollHeight>scroller.clientHeight&&/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement;
          const bounds=scroller?.getBoundingClientRect();const top=bounds?.top||0,bottom=bounds?.bottom||window.innerHeight;
          const step=e.clientY<top+48?-20:e.clientY>bottom-48?20:0;
          if(step){if(scroller)scroller.scrollBy(0,step);else window.scrollBy(0,step);}
        }}
        onPointerUp={e=>{const destination=moved.current?target.current?.dataset.questionId:null;clear();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(destination)onDrop(destination);}}
        onPointerCancel={clear} onLostPointerCapture={clear}>
        <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden="true">{[5,10,15].flatMap(y=>[5,11].map(x=><circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="currentColor"/>))}</svg>
      </button>
      <button type="button" className="question-disclosure" aria-expanded={expanded} aria-controls={`answer-${id}`} disabled={editing} onClick={()=>setOpen(!open)}>
        <span className="question-number">{index+1}.</span><span>{title}</span>
        <svg className={expanded?'expanded':''} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
      </button>
      {review&&<span className="question-review-badge">{korean?'검토 필요':'Needs review'}</span>}
    </div>
    <div id={`answer-${id}`} hidden={!expanded} className="question-answer">{children}</div>
    {actions}
  </article>;
}
