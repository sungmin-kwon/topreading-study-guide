const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function loader(overrides={}){overrides={'@/lib/admin-settings':{getRuntimeSetting:async key=>process.env[key]||({OPENAI_MODEL:'gpt-6-luna',MAX_GENERATION_CHAPTERS:'80',MAX_GENERATION_ITEMS:'2500'}[key])},...overrides};const cache=new Map();return function load(name){if(overrides[name])return overrides[name];let file=name.startsWith('@/')?path.join(root,'apps/web/src',name.slice(2)):path.resolve(root,'apps/web/src/lib',name);if(!file.endsWith('.ts'))file+='.ts';if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const req=n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n)):n.startsWith('@/')||overrides[n]?load(n):require(n);vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(req,module,module.exports);cache.set(file,module.exports);return module.exports;};}
const load=loader();const {checkMcq}=load('mcq-checks');const {assessMcqs}=load('mcq-quality');const {balanceCorrectChoicePositions}=load('mcq-shuffle');
const passage='Mina opened the gate. Daniel stayed inside.';
const q=()=>({questionText:'Who opened the gate?',choices:['Mina','Daniel','The librarian','The neighbour'],correctChoiceIndex:0,explanation:'Mina opened it; the others did not.',sortOrder:1});
const verdict=(question)=>({supported_index:question.choices.indexOf('Mina'),ambiguous:false,stem_supported:true,cues:[],evidence_quote:'Mina opened the gate.',choice_reasons:question.choices.map(c=>c==='Mina'?'Supported by passage':'Not the person named in the passage')});
const provider={review:async(_,question)=>verdict(question),repair:async()=>q()};
test('length, duplicates and invalid index are distinguished',()=>{assert.deepEqual(checkMcq(q()),[]);assert(checkMcq({...q(),choices:['Mina is the person who opened the gate in this particular passage','Daniel','The librarian','The neighbour']}).includes('correct_answer_length'));assert(checkMcq({...q(),choices:['Mina',' mina ','Daniel','Someone']}).includes('duplicate_choices'));assert.deepEqual(checkMcq({...q(),correctChoiceIndex:4}),['invalid_structure']);});
test('blind review gets no answer, explanation or quality flags',async()=>{const original=q();const result=await assessMcqs([original],passage,{...provider,review:async(p,question)=>{assert.deepEqual(Object.keys(question).sort(),['choices','questionText']);return verdict(question);}});assert.equal(result.questions[0].status,'draft');assert.deepEqual(original,q());assert.equal(result.records[0].reviewed,true);});
test('repairs are reviewed again and stop at two attempts',async()=>{let repairs=0;const r=await assessMcqs([q()],passage,{review:async(_,question)=>({...verdict(question),ambiguous:true}),repair:async()=>{repairs++;return q();}});assert.equal(repairs,2);assert.equal(r.calls,5);assert.equal(r.questions[0].status,'needs_review');});
test('unavailable reviewer retains question and flags review',async()=>{const r=await assessMcqs([q()],passage,{...provider,review:async()=>{throw Error('offline')}});assert.equal(r.questions[0].status,'needs_review');assert.deepEqual(r.questions[0].choices,q().choices);});
test('repair cannot bypass budget or re-review',async()=>{const r=await assessMcqs([q()],passage,{...provider,review:async(_,question)=>({...verdict(question),ambiguous:true})},2);assert.equal(r.calls,2);assert.equal(r.questions[0].status,'needs_review');assert(r.records[0].flags.includes('review_budget_exhausted'));});
test('invented evidence cannot pass even with matching answer',async()=>{const r=await assessMcqs([q()],passage,{...provider,review:async(_,question)=>({...verdict(question),evidence_quote:'A fabricated quotation'})});assert.equal(r.questions[0].status,'needs_review');assert.equal(r.records[0].evidence,null);});
test('successful repair clears flags after fresh independent review',async()=>{let seen=0;const r=await assessMcqs([q()],passage,{...provider,review:async(_,question)=>({...verdict(question),ambiguous:seen++===0})});assert.equal(r.records[0].repairs,1);assert.equal(r.questions[0].status,'draft');assert.equal(r.calls,3);});
test('shuffle preserves answer content, never mutates source and balances full blocks',()=>{const input=Array.from({length:20},q);const copy=structuredClone(input);const result=balanceCorrectChoicePositions(input);assert.deepEqual(input,copy);const counts=[0,0,0,0];for(const r of result){assert.equal(r.choices[r.correctChoiceIndex],'Mina');assert.deepEqual([...r.choices].sort(),[...q().choices].sort());counts[r.correctChoiceIndex]++;}assert.deepEqual(counts,[5,5,5,5]);assert.throws(()=>balanceCorrectChoicePositions([{...q(),correctChoiceIndex:8}]));});
test('letter-dependent explanations retain their ordering until repaired',()=>{const original={...q(),explanation:'Option A is correct.'};assert.deepEqual(balanceCorrectChoicePositions([original])[0],original);assert(checkMcq(original).includes('answer_letter_reference'));});
test('actual generation integration reviews before saving and accounts for usage',async()=>{const originalFetch=global.fetch;const originalKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-placeholder';let calls=0;
try {global.fetch=async(_url,init)=>{const body=JSON.parse(init.body);calls++;let output;if(body.text.format.name==='chapter_study_guide'){output={chapter_summary:'Mina opened the gate.',vocabulary_items:[],short_answer_questions:[],multiple_choice_questions:[{question_text:q().questionText,choices:q().choices,correct_choice_index:0,explanation:q().explanation,skill:'literal',difficulty:'standard'}]};}else {const data=JSON.parse(body.input[1].content);assert.equal(data.question.correctChoiceIndex,undefined);output=verdict(data.question);}return {ok:true,json:async()=>({output_text:JSON.stringify(output),usage:{input_tokens:10,output_tokens:5,total_tokens:15}})};};
const generate=loader({'@topreading/core':{deriveGenerationPlan:()=>({vocabularyCount:0,multipleChoiceCount:1,shortAnswerCount:0})},'@/lib/study-items':{},'@/lib/study-sets':{}})('openai-generator').generateOpenAIChapterItems;
const r=await generate({title:'Fixture',author:'Fixture'},{chapterNumber:1,title:'Gate',wordCount:9,textContent:passage},{vocabularyCount:0,multipleChoiceCount:1,shortAnswerCount:0});assert.equal(calls,2);assert.equal(r.usage.total_tokens,30);const item=r.generatedItems.multipleChoiceQuestions[0];assert.equal(item.choices[item.correctChoiceIndex],'Mina');assert.equal(r.rawOutput.mcq_quality.calls,1);
}finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;}});
function runExecutorHarness(existing=false, failSecond=false) {
 const run={id:'run',bookId:'book',name:'Practice',status:'draft',configJson:JSON.stringify({chapters:[1,2].map(n=>({chapterId:'chapter-'+n,chapterNumber:n,plan:{vocabularyCount:0,multipleChoiceCount:1,shortAnswerCount:0}}))})};
 const state={appended:[],updates:[],generated:0};
 const execute=loader({
  '@/lib/db/client':{atomic:async fn=>fn()},
  '@/lib/generation-queue':{cancellationRequested:async()=>false},
  'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
  '@/lib/auth':{requireActiveUser:async()=>true,requireBookAccess:async()=>true}, '@/lib/books':{getBook:async()=>({id:'book',title:'Test'})}, '@/lib/chapters':{getChapter:async id=>({id,bookId:'book',chapterNumber:Number(id.slice(-1)),title:'Gate',wordCount:9})},
  '@/lib/generation-runs':{getGenerationRun:async()=>run,getGeneratingRunForBook:async()=>null,updateGenerationRun:async patch=>({...run,...patch}),summarizeGenerationRun:async r=>r},
  '@/lib/openai-generator':{generateOpenAIChapterItems:async()=>{if(++state.generated===2&&failSecond)throw Error('Simulated model error');return {generatedItems:{multipleChoiceQuestions:[q()]},rawOutput:{},plan:{},usage:{input_tokens:10,output_tokens:5,total_tokens:15},model:'test-model'}}},
  '@/lib/study-items':{appendStudyItems:async(_id,items)=>state.appended.push(items),listStudyItems:async()=>({}),summarizeStudyItems:()=>({})},
  '@/lib/study-sets':{listStudySetsForRun:async()=>existing?[{id:'saved'}]:[],createStudySet:async()=>({id:'set'}),updateStudySet:async patch=>{state.updates.push(patch);return patch}}
 })('generation-executor').executeGeneration;
 return {state,post:()=>execute('book','run')};
}
test('saved guide versions cannot be overwritten by generation',async()=>{const h=runExecutorHarness(true);const result=await h.post();assert.match(result.error,/already contains saved results/);assert.equal(h.state.generated,0);assert.equal(h.state.appended.length,0);});
test('a later generation failure preserves completed chapter results',async()=>{const h=runExecutorHarness(false,true);const result=await h.post();assert.equal(result.error,'Simulated model error');assert.equal(h.state.appended.length,1);const saved=h.state.updates.at(-1);assert.equal(saved.status,'failed');assert.equal(saved.rawOutput.incomplete,true);assert.equal(saved.rawOutput.chapters.length,1);});
test('preview loader rejects malformed nested content instead of overwriting it',()=>{
 const storage=load(path.join(root,'apps/web/src/app/prototype/preview-storage.ts'));
 const fixture={version:2,books:storage.withSourceSnapshots(),position:{bookId:'garden',chapterId:'garden-1',guideId:'guide-2',view:'guides',kind:'multiple-choice'},drafts:{},history:[],language:'en',dark:false};
 assert.equal(storage.readPreview(JSON.stringify(fixture)).books.length,2);
 fixture.books[0].chapters[0].text=null;
 assert.throws(()=>storage.readPreview(JSON.stringify(fixture)),/Invalid preview data/);
});

test('a true answer does not excuse an unsupported question premise',async()=>{
 const r=await assessMcqs([q()],passage,{...provider,review:async(_,question)=>({...verdict(question),stem_supported:false})},1);
 assert.equal(r.questions[0].status,'needs_review');assert(r.records[0].flags.includes('unsupported_premise'));
 assert.equal(r.records[0].reviews[0].verdict.supported_index>=0,true);
});
test('missing premise verdict is an incomplete review, not an approval',async()=>{
 const r=await assessMcqs([q()],passage,{...provider,review:async(_,question)=>{const v=verdict(question);delete v.stem_supported;return v;}},1);
 assert(r.records[0].flags.includes('review_unavailable'));assert.equal(r.questions[0].status,'needs_review');
});
test('collective options are flagged without flagging ordinary negative answers',()=>{
 assert(checkMcq({...q(),choices:['Mina','Daniel','All of the above','Neither person opened it']} ).includes('collective_choice'));
 assert(!checkMcq({...q(),choices:['Mina','Daniel','No one opened the gate','The gate was already open']}).includes('collective_choice'));
});
test('duplicate question stems remain flagged even after otherwise successful reviews',async()=>{
 const r=await assessMcqs([q(),{...q(),questionText:'WHO opened the gate ?'}],passage,provider);
 assert(r.records.every(r=>r.flags.includes('duplicate_question')));assert(r.questions.every(q=>q.status==='needs_review'));
});
test('complete vocabulary and written answers are validated before normalization',()=>{
 const {validateGeneratedContent}=load('generation-content-checks');
 const plan={vocabularyCount:1,multipleChoiceCount:0,shortAnswerCount:1};
 const data={chapter_summary:'Mina opens a gate.',vocabulary_items:[{term:'gate',english_definition:'a barrier that opens at an entrance',korean_definition:'문',context_sentence:'Mina opens the gate.',part_of_speech:'noun'}],multiple_choice_questions:[],short_answer_questions:[{question_text:'Name the person who opens the gate.',suggested_answer:'Mina.',rubric:'1 point: identifies Mina; 0: another person or no answer. Total: 1.'}]};
 assert.doesNotThrow(()=>validateGeneratedContent(data,plan));
 for(const [group,field] of [['vocabulary_items','context_sentence'],['vocabulary_items','english_definition'],['short_answer_questions','rubric'],['short_answer_questions','suggested_answer']]) {
  const invalid=structuredClone(data);invalid[group][0][field]='  ';assert.throws(()=>validateGeneratedContent(invalid,plan),/missing required content/);
 }
 for(const group of ['vocabulary_items','short_answer_questions']){
  const missing=structuredClone(data);missing[group]=[];assert.throws(()=>validateGeneratedContent(missing,plan),/count/);
  const extra=structuredClone(data);extra[group].push(extra[group][0]);assert.throws(()=>validateGeneratedContent(extra,plan),/count/);
 }
});
test('mixed chapter generation retains all sections and the shared quality provenance',async()=>{
 const oldFetch=global.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-placeholder';let mainRequest;
 const payload={chapter_summary:'Mina opened the gate.',vocabulary_items:[{term:'gate',english_definition:'a movable entrance barrier',korean_definition:'문',context_sentence:'Mina opened the gate.',part_of_speech:'noun',difficulty:'core'}],short_answer_questions:[{question_text:'Who opened the gate?',suggested_answer:'Mina.',rubric:'1 point: Mina. 0 points: incorrect or absent. Total: 1.',skill:'literal-comprehension',difficulty:'standard'}],multiple_choice_questions:[{question_text:q().questionText,choices:q().choices,correct_choice_index:0,explanation:q().explanation,skill:'literal-comprehension',difficulty:'standard'}]};
 try {
  global.fetch=async(_url,init)=>{const body=JSON.parse(init.body);let output;if(body.text.format.name==='chapter_study_guide'){mainRequest=body;output=payload;}else output=verdict(JSON.parse(body.input[1].content).question);return {ok:true,json:async()=>({output_text:JSON.stringify(output),usage:{input_tokens:10,output_tokens:5,total_tokens:15}})};};
  const generate=loader({'@topreading/core':{deriveGenerationPlan:()=>({vocabularyCount:1,multipleChoiceCount:1,shortAnswerCount:1})},'@/lib/study-items':{},'@/lib/study-sets':{}})('openai-generator').generateOpenAIChapterItems;
  const r=await generate({title:'Fixture',author:'Fixture',readingLevel:'Intermediate; concise language'},{chapterNumber:1,title:'Gate',wordCount:9,textContent:passage});
  assert.equal(r.generatedItems.vocabularyItems[0].contextSentence,payload.vocabulary_items[0].context_sentence);
  assert.equal(r.generatedItems.shortAnswerQuestions[0].rubric,payload.short_answer_questions[0].rubric);
  assert.equal(r.generatedItems.chapterSummaries.length,1);assert.equal(r.generatedItems.multipleChoiceQuestions.length,1);
  assert(mainRequest.input[1].content.includes('Intermediate; concise language'));
  assert.deepEqual(mainRequest.text.format.schema.properties.short_answer_questions.items.properties.skill.enum,load('generation-guidance').generationSkills);
  assert.equal(r.usage.total_tokens,30);
 } finally {global.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});

test('verified evidence tolerates line wrapping but not paraphrase or changed words',async()=>{
 const wrapped='Mina\n opened\t the gate. Daniel stayed inside.';
 const good=await assessMcqs([q()],wrapped,provider,1);assert.equal(good.records[0].status,'draft');
 const bad=await assessMcqs([q()],wrapped,{...provider,review:async(_,question)=>({...verdict(question),evidence_quote:'Mina closed the gate.'})},1);
 assert(bad.records[0].flags.includes('unsupported_evidence'));
});
test('content sampling is stable across list order and not tied to the first question',async()=>{
 const questions=Array.from({length:20},(_,i)=>({...q(),questionText:`Who opened gate number ${i+1}?`}));
 const a=await assessMcqs(questions,passage,provider,40),b=await assessMcqs([...questions].reverse(),passage,provider,40);
 const selected=r=>r.records.filter(x=>x.reviewed).map(x=>x.original.questionText).sort();
 assert.deepEqual(selected(a),selected(b));assert.equal(selected(a).length,2);
 assert(a.records.some((r,i)=>r.reviewed && i!==0 && i!==10));
});
test('several defective questions in one chapter can all need review',async()=>{
 const questions=Array.from({length:4},(_,i)=>({...q(),questionText:`Who opened gate ${i}?`,choices:['Mina','Mina','Daniel','Sam']}));
 const result=await assessMcqs(questions,passage,provider,0);
 assert.equal(result.questions.filter(q=>q.status==='needs_review').length,4);
});
