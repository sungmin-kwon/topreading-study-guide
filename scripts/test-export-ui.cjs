const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LIVE_UI_TEST_URL;
if(!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Use disposable localhost library');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true}),page=await context.newPage();
 const api=async path=>{const r=await context.request.get(base+path);assert(r.ok(),await r.text());return r.json();};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const books=(await api('/api/books')).books;const book=books.find(b=>b.title==='1984')||books[0];
  const chapter=(await api(`/api/books/${book.id}/chapters`)).chapters[0];
  await page.goto(`${base}/?book=${book.id}&chapter=${chapter.id}&section=export`,{waitUntil:'networkidle'});
  const form=page.locator('.reading-export-form');await form.waitFor();
  const mcq=form.getByRole('checkbox',{name:'Multiple choice',exact:true}),vocab=form.getByRole('checkbox',{name:'Vocabulary',exact:true});
  assert(await mcq.isChecked());assert(!await vocab.isChecked());
  await form.getByRole('combobox',{name:'Chapters',exact:true}).selectOption(chapter.id);
  await form.getByRole('combobox',{name:'Multiple choice layout',exact:true}).selectOption('multiple-choice,multiple-choice-concise-key');
  await vocab.check();await form.getByRole('combobox',{name:'Format',exact:true}).selectOption('docx');
  const download=page.waitForEvent('download');await form.getByRole('button',{name:'Download',exact:true}).click();
  const file=await download;assert.equal(await file.failure(),null);await file.saveAs('/tmp/topreading-selected.docx');
  assert(file.suggestedFilename().endsWith('.docx'));
  await page.reload({waitUntil:'networkidle'});assert(await vocab.isChecked());
  assert.equal(await form.getByRole('combobox',{name:'Multiple choice layout',exact:true}).inputValue(),'multiple-choice,multiple-choice-concise-key');
  await mcq.uncheck();await vocab.uncheck();assert(await form.getByRole('button',{name:'Download',exact:true}).isDisabled());
  await mcq.check();
  await page.route('**/export?**',route=>route.fulfill({status:400,json:{error:'Test export failure'}}));
  await form.getByRole('button',{name:'Download',exact:true}).click();await form.getByRole('alert').waitFor();assert(await mcq.isChecked());
  await page.unroute('**/export?**');
  await form.getByRole('combobox',{name:'Chapters',exact:true}).selectOption(chapter.id);
  await form.getByRole('combobox',{name:'Format',exact:true}).selectOption('pdf');
  const pdf=page.waitForEvent('download');await form.getByRole('button',{name:'Download',exact:true}).click();const file2=await pdf;assert.equal(await file2.failure(),null);await file2.saveAs('/tmp/topreading-selected.pdf');
  await page.screenshot({path:'/tmp/export-selection-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/export-selection-mobile.png',fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
  const invalid=await context.request.get(`${base}/api/books/${book.id}/export?types=bad`);assert.equal(invalid.status(),400);
  console.log('PASS: section controls, remembered preferences, empty selection, failure retention, PDF/DOCX downloads, mobile fit and invalid API selection.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
