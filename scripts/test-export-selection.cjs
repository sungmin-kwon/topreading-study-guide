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
 assert(p.sections[2].items[0].text.startsWith('MCQ 2. '));
});
test('concise keys follow all questions with matching numbering and unchanged choice order',()=>{
 const p=buildSelectedExportPayload('Fixture',['multiple-choice','multiple-choice-concise-key'],chapters);
 assert.equal(p.sections.length,4);assert.equal(p.sections[2].chapter_heading,'Multiple Choice Answer Key');assert.equal(p.sections[2].heading,'Chapter 1');
 assert.equal(p.sections[2].items[0].text,'MCQ 1. A');assert.equal(p.sections[3].items[0].text,'MCQ 2. A');
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


test('chapter headings occur once with section headings beneath and a break only at chapter boundaries',()=>{
 const p=buildSelectedExportPayload('Fixture',['vocabulary-list','multiple-choice','short-answer'],chapters);
 assert.equal(p.sections.length,6);
 assert.deepEqual(p.sections.map(s=>Boolean(s.page_break_before)),[true,false,false,true,false,false]);
 assert.deepEqual(p.sections.map(s=>s.heading),['Vocabulary List','Multiple Choice','Short Answer','Vocabulary List','Multiple Choice','Short Answer']);
 assert.equal(p.sections.filter(s=>s.chapter_heading).length,2);
 assert(p.sections.every(s=>s.heading_level===2));
 const skipped=buildSelectedExportPayload('Fixture',['vocabulary-list'],[{...chapters[0],items:{...items,vocabulary:[]}},chapters[1]]);
 assert.equal(skipped.sections.length,1);assert(skipped.sections[0].chapter_heading.startsWith('Chapter 2'));
});

test('rendered PDF separates chapters and Word carries matching heading hierarchy and page breaks',()=>{
 const python=process.env.EXPORT_TEST_PYTHON;if(!python)return;
 const p=buildSelectedExportPayload('Fixture',['vocabulary-list','multiple-choice','short-answer'],chapters);
 const dir=fs.mkdtempSync('/tmp/topreading-chapter-export-');
 try {
  const input=path.join(dir,'input.json');fs.writeFileSync(input,JSON.stringify(p));
  const exec=require('node:child_process').execFileSync;
  for(const format of ['pdf','docx'])exec(python,[path.join(root,'scripts',`render_study_set_${format}.py`),input,path.join(dir,`guide.${format}`)]);
  exec(python,['-c',`
import sys,json,zipfile,xml.etree.ElementTree as ET,pymupdf
from pathlib import Path
root=Path(sys.argv[1]); payload=json.loads((root/'input.json').read_text())
with pymupdf.open(root/'guide.pdf') as doc:
 assert len(doc)==2, len(doc)
 for page,chapter in zip(doc,['Chapter 1','Chapter 2']):
  text=page.get_text();assert text.count(chapter)==1,text
  for heading in ['Vocabulary List','Multiple Choice','Short Answer']:assert heading in text
  assert '• gate: an entrance | 문' in text
  assert 'MCQ ' in text and 'SA ' in text
  words=page.get_text('words')
  vocab=next(w for w in words if w[4]=='•')
  heading=next(w for w in words if w[4]=='Vocabulary')
  mcq=next(w for w in words if w[4]=='MCQ')
  choice=next(w for w in words if w[4]=='A.')
  assert vocab[0]>heading[0] and mcq[0]>heading[0] and choice[0]>mcq[0]
with zipfile.ZipFile(root/'guide.docx') as archive:
 ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 tree=ET.fromstring(archive.read('word/document.xml'))
 paragraphs=tree.findall('w:body/w:p',ns)
 headings=[];breaks=[]
 for p in paragraphs:
  text=''.join(p.itertext());style=p.find('w:pPr/w:pStyle',ns)
  if style is not None and style.attrib['{'+ns['w']+'}val'] in ['Heading1','Heading2']:headings.append((text,style.attrib['{'+ns['w']+'}val']))
  if p.find('w:pPr/w:pageBreakBefore',ns) is not None:breaks.append(text)
 assert [style for _,style in headings]==['Heading1','Heading2','Heading2','Heading2']*2,headings
 assert len(breaks)==1 and breaks[0].startswith('Chapter 2'),breaks
 assert '문' in ''.join(tree.itertext())
 for p in paragraphs:
  text=''.join(p.itertext())
  if text.startswith(('• ', 'MCQ ', 'SA ')):
   indent=p.find('w:pPr/w:ind',ns)
   assert indent is not None and int(indent.attrib['{'+ns['w']+'}left'])>0,text
`,dir]);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});


test('mixed sections identify questions and indent bodies while preserving choice nesting',()=>{
 const p=buildSelectedExportPayload('Fixture',['vocabulary-list','multiple-choice-key','short-answer-key','multiple-choice-concise-key'],chapters);
 assert(p.sections[0].items[0].text.startsWith('• gate:'));
 assert(p.sections[1].items[0].text.startsWith('MCQ 1.'));
 assert(p.sections[2].items[0].text.startsWith('SA 1.'));
 assert(p.sections[4].items[0].text.startsWith('MCQ 2.'));
 assert(p.sections[5].items[0].text.startsWith('SA 2.'));
 assert.equal(p.sections[6].items[0].text,'MCQ 1. A');
 assert(p.sections.every(section=>section.items.every(item=>item.indent>=16)));
 assert(p.sections[1].items[1].indent>p.sections[1].items[0].indent);
 assert(p.sections[2].items[1].indent>p.sections[2].items[0].indent);
 const quiz=buildSelectedExportPayload('Fixture',['vocabulary-quiz'],chapters);
 assert.equal(quiz.sections[0].items[0].text,'1. gate');
});
