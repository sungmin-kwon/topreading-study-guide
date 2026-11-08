const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function loader(overrides={}){overrides={'@/lib/admin-settings':{getRuntimeSetting:async key=>process.env[key]||({OPENAI_MODEL:'gpt-6-luna',MAX_GENERATION_CHAPTERS:'80',MAX_GENERATION_ITEMS:'2500'}[key])},...overrides};const cache=new Map();return function load(name){if(overrides[name])return overrides[name];let file=name.startsWith('@/')?path.join(root,'apps/web/src',name.slice(2)):path.resolve(root,'apps/web/src/lib',name);if(!file.endsWith('.ts'))file+='.ts';if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const req=n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n)):n.startsWith('@/')||overrides[n]?load(n):require(n);vm.runInThisContext(`(function(require,module,exports){${code}\n})`,{filename:file})(req,module,module.exports);cache.set(file,module.exports);return module.exports;};}

const load=loader({'@/lib/generation-runs':{},'@/lib/books':{},'@/lib/chapters':{},'@/lib/env':{},'@/lib/study-items':{},'@/lib/study-sets':{}});
const {parseExportSelection,buildSelectedExportPayload}=load('pdf-export');
const items={summaries:[{summaryText:'Teacher-only summary.'}],vocabulary:[{term:'gate',definition:'an entrance\nKorean: 문'}],multipleChoice:[{questionText:'Who opened the gate?',choicesJson:JSON.stringify(['Mina','Dan','Lee','Sam']),correctChoiceIndex:0,explanation:'Only Mina opened it.'}],shortAnswer:[{questionText:'Explain the action.',suggestedAnswer:'Teacher-only answer.',rubric:'Teacher-only rubric.'}]};
const chapters=[1,2].map(n=>({chapterNumber:n,chapterTitle:'Chapter '+n,items}));
test('selection parsing preserves legacy exports and rejects unsupported or empty content',()=>{
 assert.deepEqual(parseExportSelection(new URLSearchParams('type=multiple-choice')),['multiple-choice']);
 assert.deepEqual(parseExportSelection(new URLSearchParams('types=multiple-choice&types=vocabulary-list')),['multiple-choice','vocabulary-list']);
 for(const q of ['','types=','types=unknown','types=multiple-choice&types=unknown'])assert.equal(parseExportSelection(new URLSearchParams(q)),null);
});
test('selected student content excludes answers and unselected sections',()=>{
 const p=buildSelectedExportPayload('Fixture',['multiple-choice','short-answer'],chapters);
 assert.equal(p.sections.length,4);const text=JSON.stringify(p);
 assert(!text.includes('Teacher-only'));assert(!text.includes('Only Mina'));assert(!text.includes('Vocabulary'));
 assert(p.sections[2].items[0].text.startsWith('2. '));
});
test('concise keys follow all questions with matching numbering and unchanged choice order',()=>{
 const p=buildSelectedExportPayload('Fixture',['multiple-choice','multiple-choice-concise-key'],chapters);
 assert.equal(p.sections.length,4);assert(p.sections[2].heading.includes('Answer Key'));
 assert.equal(p.sections[2].items[0].text,'1. A');assert.equal(p.sections[3].items[0].text,'2. A');
 assert.equal(p.sections[0].items[1].text,'A. Mina');
});
test('empty selections fail instead of returning a misleading empty document',()=>{
 assert.throws(()=>buildSelectedExportPayload('Fixture',[],chapters),/No items/);
 const empty={summaries:[],vocabulary:[],multipleChoice:[],shortAnswer:[]};
 assert.throws(()=>buildSelectedExportPayload('Fixture',['vocabulary-list'],[{...chapters[0],items:empty}]),/No items/);
});
test('teacher sections and both document renderers receive the selected content',()=>{
 const p=buildSelectedExportPayload('Fixture',['chapter-summaries','multiple-choice','short-answer-key','vocabulary-list','multiple-choice-concise-key'],chapters);
 const dir=fs.mkdtempSync('/tmp/topreading-export-check-');const input=path.join(dir,'input.json');fs.writeFileSync(input,JSON.stringify(p));
 const python=process.env.EXPORT_TEST_PYTHON;if(!python)return;
 for(const format of ['pdf','docx']) require('node:child_process').execFileSync(python,[path.join(root,'scripts',`render_study_set_${format}.py`),input,path.join(dir,`guide.${format}`)]);
 assert(fs.statSync(path.join(dir,'guide.pdf')).size>1000);assert(fs.statSync(path.join(dir,'guide.docx')).size>1000);
 console.log('Rendered export fixtures:',dir);
});
