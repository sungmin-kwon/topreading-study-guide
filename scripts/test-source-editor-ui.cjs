// Disposable local library only; creates and removes its own synthetic book.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {execFileSync}=require('node:child_process'),os=require('node:os'),path=require('node:path');
const base=process.env.LIVE_UI_TEST_URL;
if(process.env.ALLOW_TEST_WRITES!=='1'||!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Use disposable localhost library');
(async()=>{
 const fixtureDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'topreading-source-ui-'));
 const fixture=path.join(fixtureDirectory,'source.pdf');
 execFileSync(process.env.PYTHON_EXECUTABLE||'python3',['-c',`
import pymupdf,sys
doc=pymupdf.open()
for n in range(1,33):
 p=doc.new_page()
 if n==1:
  p.draw_rect(pymupdf.Rect(60,60,535,780),color=(.2,.35,.25),fill=(.8,.85,.8))
  continue
 p.insert_text((60,60),f'Section {n}\\nOpening words for section {n}.\\nSecond scene starts here.\\nClosing words for this source page.')
 p.insert_textbox(pymupdf.Rect(60,150,535,780),('A teacher reads the passage carefully, looking for changes in setting, character, and tone. Each chapter offers a new point of view and a chance to discuss the evidence.\\n\\n')*12,fontsize=11)
doc.set_page_labels([{'startpage':0,'prefix':'','style':'r','firstpagenum':1},{'startpage':4,'prefix':'','style':'D','firstpagenum':1}])
doc.set_toc([[1,'First section',2],[1,'Later section',16]])
doc.save(sys.argv[1])
`,fixture]);
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage();
 const api=async(path,method='GET',data)=>{const r=await context.request.fetch(base+path,{method,data});assert(r.ok(),`${r.status()} ${await r.text()}`);return r.json();};let book;
 try{
  book=(await api('/api/books','POST',{title:'Source editor fixture'})).book;
  await page.goto(`${base}/?book=${book.id}&section=source`,{waitUntil:'networkidle'});
  await page.locator('input[name=sourceFile]').setInputFiles({name:'source-editor-test.pdf',mimeType:'application/pdf',buffer:fs.readFileSync(fixture)});
  const uploadResponse=page.waitForResponse(r=>r.url().endsWith('/source-files')&&r.request().method()==='POST');
  const extractionResponse=page.waitForResponse(r=>r.url().endsWith('/parsed-documents')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Upload Source',exact:true}).click();
  const upload=await uploadResponse;assert(upload.ok(),await upload.text());const source=(await upload.json()).sourceFile;
  const extracted=await extractionResponse;assert(extracted.ok(),await extracted.text());const doc=(await extracted.json()).parsedDocument;
  await page.getByRole('region',{name:'Chapter boundary editor'}).waitFor();
  assert(await page.getByRole('button',{name:'Start chapter on this page',exact:true}).isDisabled());
  const original=(await api(`/api/books/${book.id}/chapters`,'POST',{parsedDocumentId:doc.id,pageStarts:[{pageNumber:1},{pageNumber:16}]})).chapters;
  // A saved mock guide contains actual items but invokes no model.
  await api(`/api/books/${book.id}/chapters/${original[0].id}/mock-generation`,'POST',{plan:{vocabularyCount:2,multipleChoiceCount:2,shortAnswerCount:1}});
  const runs=(await api(`/api/books/${book.id}/generation-runs`)).generationRuns;const oldRun=runs[0];assert(oldRun);
  const staleRun=(await api(`/api/books/${book.id}/generation-runs`,'POST',{config:{chapters:[{chapterId:original[0].id,plan:{multipleChoiceCount:1}}]}})).generationRun;
  const endpoint=`/api/books/${book.id}/parsed-documents/${doc.id}/editor`;
  const initial=await api(endpoint);assert.equal(initial.pages.length,32);
  await page.goto(`${base}/?book=${book.id}&section=split`,{waitUntil:'networkidle'});
  const editor=page.getByRole('region',{name:'Chapter boundary editor'});await editor.waitFor();
  await editor.getByRole('spinbutton',{name:'Source page',exact:true}).fill('30');
  await editor.getByRole('button',{name:'Original PDF',exact:true}).click();await editor.getByRole('img',{name:'Original page 30',exact:true}).waitFor();
  assert((await editor.innerText()).includes('26'));
  await page.screenshot({path:'/tmp/source-editor-original.png',fullPage:true});
  await editor.getByRole('button',{name:'Suggest starts',exact:true}).click();
  assert.equal(await editor.getByRole('textbox',{name:'Chapter title 1',exact:true}).inputValue(),'First section');
  await editor.getByRole('button',{name:'Discard changes',exact:true}).click();
  await editor.getByRole('button',{name:'Extracted text',exact:true}).click();
  await editor.getByRole('spinbutton',{name:'Source page',exact:true}).fill('2');await editor.getByRole('button',{name:'Start at cursor',exact:true}).click();
  const text=editor.getByRole('textbox',{name:'Page text',exact:true});
  await text.evaluate(el=>{el.focus();const at=el.value.indexOf('Second scene');el.setSelectionRange(at-1,at-1);});
  await text.press('ArrowRight');await editor.getByRole('button',{name:'Start at cursor',exact:true}).click();
  assert((await editor.locator('.boundary-row').first().boundingBox()).height<60,'Chapter rows should stay compact');
  await editor.getByRole('spinbutton',{name:'Source page',exact:true}).fill('3');
  await editor.getByRole('button',{name:'Original PDF',exact:true}).click();
  await editor.getByRole('button',{name:'End reading after this page',exact:true}).click();
  assert((await editor.locator('.boundary-end').innerText()).includes('After page 3'));
  await editor.getByRole('button',{name:'Extracted text',exact:true}).click();
  await text.evaluate(el=>{el.focus();const at=el.value.indexOf('Closing words');el.setSelectionRange(at-1,at-1);});
  await text.press('ArrowRight');
  await editor.getByRole('button',{name:'End reading at cursor',exact:true}).click();
  assert((await editor.locator('.boundary-end').innerText()).includes('Within page 3'));
  await editor.getByRole('button',{name:'Preview chapters',exact:true}).click();
  await page.getByRole('button',{name:'Library',exact:true}).first().click();assert(await editor.isVisible());
  await editor.getByRole('button',{name:'Tools',exact:true}).click();
  await editor.locator('.boundary-numbering summary').click();
  await editor.getByRole('button',{name:'Add numbering range',exact:true}).click();
  await editor.getByRole('spinbutton',{name:'Printed start',exact:true}).fill('10');
  await editor.getByRole('button',{name:'Close tools',exact:true}).click();
  const saveResponse=page.waitForResponse(r=>r.url().endsWith('/editor')&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Save draft',exact:true}).click();const sr=await saveResponse;assert(sr.ok(),await sr.text());
  let saved=await api(endpoint);assert.equal(saved.draft.plan.starts.length,2);assert.equal(saved.draft.plan.starts[0].page,2);assert(saved.draft.plan.starts[1].offset>0);assert.equal(saved.draft.plan.pageLabels[0].first,10);assert.equal(saved.draft.plan.end.page,3);assert(saved.draft.plan.end.offset>0);
  await editor.getByRole('button',{name:'Chapter actions 1',exact:true}).click();
  await editor.getByRole('button',{name:'Remove boundary 1',exact:true}).click();
  assert.equal(await editor.getByRole('textbox',{name:/Chapter title/}).count(),1);
  await editor.getByRole('button',{name:'Discard changes',exact:true}).click();
  assert.equal(await editor.getByRole('textbox',{name:/Chapter title/}).count(),2);
  assert((await editor.locator('.boundary-end').innerText()).includes('Within page 3'));
  const conflict=await context.request.put(base+endpoint,{data:{version:0,fingerprint:initial.fingerprint,plan:saved.draft.plan}});assert.equal(conflict.status(),400);
  await page.reload({waitUntil:'networkidle'});assert.equal(await editor.getByRole('textbox',{name:/Chapter title/}).count(),2);
  await editor.getByRole('button',{name:'Extracted text',exact:true}).click();
  await page.screenshot({path:'/tmp/source-editor-text.png',fullPage:true});
  const textBox=await editor.getByRole('textbox',{name:'Page text',exact:true}).boundingBox();assert(textBox.y+textBox.height<=1000,'Reading surface must fit below its controls');
  page.once('dialog',d=>d.accept());const applyResponse=page.waitForResponse(r=>r.url().endsWith('/editor')&&r.request().method()==='PUT');await editor.getByRole('button',{name:'Use these chapters',exact:true}).click();const ar=await applyResponse;assert(ar.ok(),await ar.text());await page.waitForLoadState('networkidle');
  const updated=(await api(`/api/books/${book.id}/chapters`)).chapters;assert.equal(updated.length,2);assert(!updated.some(c=>original.some(o=>o.id===c.id)));
  const lastChapter=(await api(`/api/books/${book.id}/chapters/${updated[1].id}`)).chapter;
  assert(lastChapter.textContent.endsWith('Second scene starts here.'));assert(!lastChapter.textContent.includes('Section 4'));
  const staleEnqueue=await context.request.post(`${base}/api/books/${book.id}/generation-runs/${staleRun.id}/execute`);assert.equal(staleEnqueue.status(),409);
  const staleSelection=await context.request.post(`${base}/api/books/${book.id}/generation-runs`,{data:{config:{chapters:[{chapterId:original[0].id}]}}});assert.equal(staleSelection.status(),400);
  const old=(await api(`/api/books/${book.id}/chapters/${original[0].id}`)).chapter;assert(old);
  // Restore the old guide version; it must restore its chapter IDs and exports.
  await api(`/api/books/${book.id}`,'PATCH',{activeGenerationRunId:oldRun.id});
  assert.deepEqual((await api(`/api/books/${book.id}/chapters`)).chapters.map(c=>c.id),original.map(c=>c.id));
  const exportResponse=await context.request.get(`${base}/api/books/${book.id}/export?types=multiple-choice&format=docx&generationRunId=${oldRun.id}`);assert(exportResponse.ok(),await exportResponse.text());
  saved=await api(endpoint);const layout=saved.layouts[0];assert(layout);
  await api(endpoint,'PUT',{action:'restore',layoutId:layout.id});assert.deepEqual((await api(`/api/books/${book.id}/chapters`)).chapters.map(c=>c.id),updated.map(c=>c.id));
  // Explicit old-version export must still work while a different layout is active.
  const oldExport=await context.request.get(`${base}/api/books/${book.id}/export?types=multiple-choice&format=pdf&generationRunId=${oldRun.id}`);assert(oldExport.ok(),await oldExport.text());
  const foreign=(await api('/api/books')).books.find(b=>b.id!==book.id);
  const wrong=await context.request.get(`${base}/api/books/${foreign.id}/source-files/${source.id}/preview?page=1`);assert.equal(wrong.status(),404);
  await api(`/api/books/${book.id}/source-files/${source.id}/parsed-documents`,'POST');
  await page.goto(`${base}/?book=${book.id}&section=split`,{waitUntil:'networkidle'});
  await page.locator('.source-document-selector select').selectOption(doc.id);
  await editor.getByRole('textbox',{name:'Chapter title 2',exact:true}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Chapter boundary editor'}).count(),1);
  // Keep both the document and page controls visible without scrolling the shell.
  for (const viewport of [{width:1536,height:864},{width:1366,height:768},{width:800,height:900},{width:390,height:844},{width:375,height:667},{width:320,height:640}]) {
    await page.setViewportSize(viewport);
    await editor.getByRole('button',{name:'Original PDF',exact:true}).click();
    await editor.getByRole('img',{name:/Original page/}).waitFor();
    await page.screenshot({path:`/tmp/source-compact-${viewport.width}.png`});
    const frame=await editor.locator('.boundary-page-image').boundingBox();
    const controls=await editor.locator('.boundary-page-controls').boundingBox();
    assert(frame.height>=viewport.height*.42,`Document too short at ${viewport.width}: ${frame.height}`);
    assert(frame.y>=0&&frame.y+frame.height<=viewport.height,`Document outside viewport at ${viewport.width}`);
    assert(controls.y+controls.height<=viewport.height+1,`Navigation outside viewport at ${viewport.width}`);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert(await page.locator('.workspace-scroll').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'Outer workspace must not scroll');
    await editor.getByRole('button',{name:'Next page',exact:true}).click();
    await editor.getByRole('img',{name:/Original page/}).waitFor();
    await page.screenshot({path:`/tmp/source-compact-${viewport.width}.png`});
  }
  await editor.getByRole('button',{name:'Chapters (2)',exact:true}).click();
  await editor.getByRole('textbox',{name:'Chapter title 2',exact:true}).fill('Temporary edit');
  await editor.getByRole('button',{name:'Back to source',exact:true}).click();
  assert(await editor.getByRole('button',{name:'Discard changes',exact:true}).isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'/tmp/source-compact-dirty-320.png'});
  await editor.getByRole('button',{name:'Discard changes',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await editor.getByRole('combobox',{name:'Zoom',exact:true}).selectOption('200');
  await editor.locator('.boundary-page-image').evaluate(el=>el.scrollTo(120,200));
  assert(await editor.locator('.boundary-page-image').evaluate(el=>el.scrollTop>0));
  await editor.getByRole('button',{name:'Next page',exact:true}).click();
  await editor.getByRole('img',{name:/Original page/}).waitFor();
  assert(await editor.locator('.boundary-page-image').evaluate(el=>el.scrollTop===0&&el.scrollLeft===0));
  await editor.getByRole('combobox',{name:'Zoom',exact:true}).selectOption('0');
  const completePage=await editor.getByRole('img',{name:/Original page/}).boundingBox();
  const viewer=await editor.locator('.boundary-page-image').boundingBox();
  assert(completePage.height<=viewer.height&&completePage.width<=viewer.width);
  await editor.getByRole('combobox',{name:'Zoom',exact:true}).selectOption('100');
  await editor.getByRole('button',{name:'Chapters (2)',exact:true}).click();
  await editor.getByRole('textbox',{name:'Chapter title 2',exact:true}).waitFor();
  await editor.getByRole('button',{name:'Go to chapter 1',exact:true}).click();
  assert(await editor.getByRole('textbox',{name:'Page text',exact:true}).isVisible());
  await editor.getByRole('button',{name:'Tools',exact:true}).click();
  await editor.getByRole('textbox',{name:'Find in source',exact:true}).fill('Second scene');
  await editor.locator('.boundary-search-results button').first().click();
  assert(!(await editor.getByRole('dialog',{name:'Source tools',exact:true}).isVisible()));
  await page.waitForFunction(()=>{const el=document.querySelector('.boundary-text');return el&&el.value.slice(el.selectionStart,el.selectionEnd)==='Second scene';},{},{timeout:3000});
  await editor.getByRole('button',{name:'Tools',exact:true}).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Tools');
  await editor.getByRole('button',{name:'Original PDF',exact:true}).click();
  await editor.getByRole('img',{name:/Original page/}).waitFor();
  await page.getByRole('button',{name:'Toggle dark mode',exact:true}).click();
  await page.screenshot({path:'/tmp/source-compact-mobile-dark.png'});
  await page.locator('.reading-language-toggle').selectOption('ko');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'/tmp/source-compact-mobile-ko.png'});
  const touchContext=await browser.newContext({viewport:{width:390,height:760},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const touchPage=await touchContext.newPage();
  await touchPage.goto(`${base}/?book=${book.id}&section=split`,{waitUntil:'networkidle'});
  const touchEditor=touchPage.getByRole('region',{name:'Chapter boundary editor'});
  await touchEditor.getByRole('button',{name:'Next page',exact:true}).tap();
  await touchEditor.getByRole('img',{name:'Original page 2',exact:true}).waitFor();
  const touchControls=await touchEditor.locator('.boundary-page-controls').boundingBox();assert(touchControls.y+touchControls.height<=761);
  await touchPage.screenshot({path:'/tmp/source-compact-touch.png'});
  await touchContext.close();
  console.log('PASS: compact chapter rows, direct Discard restoration, page/cursor reading end, exclusion of trailing content, automatic upload/extraction/editor transition, bookmarks, printed numbering, unsaved navigation guard, multiple extraction selection, stale generation rejection, original page 30 and printed label, mid-page split, saved/conflicting drafts, safe layout apply/restore, old guide exports, source ownership and desktop/mobile reader height, pinned navigation, mobile outline return, search cursor focus, Escape focus restoration, dark/Korean layout and touch page navigation.');
 }finally{if(book)await context.request.delete(`${base}/api/books/${book.id}`);await browser.close();fs.rmSync(fixtureDirectory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
