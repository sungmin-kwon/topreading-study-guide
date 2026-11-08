const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exp={};vm.runInThisContext(`(function(exports){${ts.transpileModule(fs.readFileSync('apps/web/src/lib/source-boundaries.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}})`)(exp);
const {splitAtBoundaries:split}=exp;
const pages=[{pageNumber:1,textContent:'Front matter. First chapter. Second chapter.'},{pageNumber:3,textContent:'End of second. Appendix.'}];
test('mid-page starts, missing blank pages and explicit end preserve exact text',()=>{
 const result=split(pages,{starts:[{page:1,offset:14,title:'One'},{page:1,offset:29,title:'Two'}],end:{page:3,offset:15}});
 assert.equal(result[0].textContent,'First chapter.');assert.equal(result[1].textContent,'Second chapter.\n\nEnd of second.');
 assert(!result.some(c=>c.textContent.includes('Front')||c.textContent.includes('Appendix')));
});
test('invalid, duplicate, empty and reversed boundaries are rejected',()=>{
 for(const plan of [{starts:[],end:null},{starts:[{page:2,offset:0,title:''}],end:null},{starts:[{page:1,offset:0},{page:1,offset:0}],end:null},{starts:[{page:1,offset:999}],end:null},{starts:[{page:3,offset:2}],end:{page:1,offset:0}}])assert.throws(()=>split(pages,plan));
});
test('text positions use browser UTF-16 offsets without dropping Unicode',()=>{
 const p=[{pageNumber:1,textContent:'😀 intro. 새로운 chapter.'}];
 const r=split(p,{starts:[{page:1,offset:10,title:'한국어'}],end:null});assert.equal(r[0].textContent,'새로운 chapter.');
});

test('printed-page ranges reject overlap and non-integer labels',()=>{
 const base={starts:[{page:1,offset:0,title:''}],end:null};
 assert.throws(()=>split(pages,{...base,pageLabels:[{from:1,to:5,first:1},{from:5,to:8,first:1}]}),/overlap/);
 assert.throws(()=>split(pages,{...base,pageLabels:[{from:1,to:5,first:1.5}]}),/whole numbers/);
 assert.equal(split(pages,{...base,pageLabels:[{from:1,to:3,first:12}]}).length,1);
});
