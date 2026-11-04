const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../apps/web/src/lib/mcq-review-reasons.ts'),'utf8');
const exportsObject={};vm.runInThisContext(`(function(exports){${ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText}})`)(exportsObject);
const {reviewFlags}=exportsObject;
const q={questionText:'Who opened the gate?',choices:['Mina','Daniel','Sam','Lee']};
const record={final:q,flags:['semantic_disagreement']};
test('saved reasons survive choice shuffle and chapter/list reordering',()=>{
 const raw={chapters:[{chapterId:'other',output:{mcq_quality:{records:[{...record,flags:['wording_cues']}]}}},{chapterId:'chapter',output:{mcq_quality:{records:[record]}}}]};
 assert.deepEqual(reviewFlags(raw,'chapter',{...q,choices:[...q.choices].reverse()}),['semantic_disagreement']);
});
test('edited, missing and ambiguous historical matches never borrow another question reason',()=>{
 const raw={mcq_quality:{records:[record]}};
 assert.deepEqual(reviewFlags(raw,null,{...q,questionText:'Edited question'}),[]);
 assert.deepEqual(reviewFlags(null,null,q),[]);
 assert.deepEqual(reviewFlags({mcq_quality:{records:[record,record]}},null,q),[]);
});
