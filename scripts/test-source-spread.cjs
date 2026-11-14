const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exp={};vm.runInThisContext(`(function(exports){${ts.transpileModule(fs.readFileSync('apps/web/src/lib/source-spread.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}})`)(exp);
const {sourceSpread:spread,nearbySourcePages:nearby}=exp;
test('source spreads cover every physical page without duplicates or off-document neighbors',()=>{
 for(const count of [1,2,3,32,39])for(const mode of ['single','pairs','facing']){
  const seen=[];
  for(let page=1;page<=count;){const pages=spread(page,count,mode);seen.push(...pages);assert(nearby(pages,count,mode).every(n=>n>=1&&n<=count&&!pages.includes(n)));page=pages.at(-1)+1;}
  assert.deepEqual(seen,Array.from({length:count},(_,i)=>i+1));
 }
});
test('book spreads isolate cover, preserve even-left pairs and handle last unpaired page',()=>{
 assert.deepEqual(spread(1,32,'facing'),[1]);assert.deepEqual(spread(3,32,'facing'),[2,3]);assert.deepEqual(spread(32,32,'facing'),[32]);
 assert.deepEqual(spread(2,39,'pairs'),[1,2]);assert.deepEqual(spread(39,39,'pairs'),[39]);
});
