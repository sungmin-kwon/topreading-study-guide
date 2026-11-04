// Disposable localhost library only. Restores metadata/order and removes its word.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LIVE_UI_TEST_URL;
if(process.env.ALLOW_TEST_WRITES!=='1'||!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Use disposable localhost library');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const api=async(url,method='GET',data)=>{const r=await context.request.fetch(base+url,{method,data});assert(r.ok(),`${r.status()} ${await r.text()}`);return r.json();};
 let book,chapter,set,original,added,release;
 const itemsPath=()=>`/api/books/${book.id}/study-sets/${set.id}/items`;
 const itemPath=id=>`${itemsPath()}/vocabulary/${id}?chapterId=${chapter.id}`;
 const list=async()=>(await api(itemsPath()+`?chapterId=${chapter.id}`)).items.vocabularyItems;
 try {
  for(const b of (await api('/api/books')).books){for(const c of (await api(`/api/books/${b.id}/chapters`)).chapters.slice(0,3)){
   const sets=(await api(`/api/books/${b.id}/chapters/${c.id}/study-sets${b.activeGenerationRunId?'?generationRunId='+b.activeGenerationRunId:''}`)).studySets;
   if(!sets.length)continue;const words=(await api(`/api/books/${b.id}/study-sets/${sets[0].id}/items?chapterId=${c.id}`)).items.vocabularyItems;
   if(words.length>=4){book=b;chapter=c;set=sets[0];original=words;break;}
  }if(book)break;}
  assert(original);
  await page.goto(base,{waitUntil:'networkidle'});
  const libraryRow=await page.locator('.reading-book-list article').first().boundingBox();assert(libraryRow.height<90,`Library row height ${libraryRow.height}`);
  await page.screenshot({path:'/tmp/compact-library.png'});
  const gate=new Promise(resolve=>release=resolve);
  await page.route(`**/api/books/${book.id}/source-files`,async route=>{await gate;await route.continue().catch(()=>{});});
  await page.goto(`${base}/?book=${book.id}&chapter=${chapter.id}&section=info`,{waitUntil:'domcontentloaded'});
  const loading=page.locator('.reading-load-state');await loading.waitFor();
  const bounds=await loading.boundingBox(),text=await loading.locator('p').boundingBox();
  assert(Math.abs((bounds.x+bounds.width/2)-(text.x+text.width/2))<3);assert(text.y>bounds.y+80);
  await page.screenshot({path:'/tmp/centered-book-loading.png'});
  release();await page.unroute(`**/api/books/${book.id}/source-files`);await page.waitForLoadState('networkidle');
  const form=page.locator('.reading-book-info');await form.waitFor();
  assert.equal(await page.getByRole('button',{name:'Edit Book Info',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Book info',exact:true}).getAttribute('aria-current'),'page');
  const title=book.title+' [metadata UI test]';await form.getByLabel('Title',{exact:true}).fill(title);
  await page.getByRole('button',{name:'Text',exact:true}).click();await page.getByRole('button',{name:'Book info',exact:true}).click();assert.equal(await form.getByLabel('Title',{exact:true}).inputValue(),title);
  await page.route(`**/api/books/${book.id}`,route=>route.request().method()==='PATCH'?route.abort('failed'):route.continue());
  await form.getByRole('button',{name:'Save',exact:true}).click();await form.getByRole('alert').waitFor();assert.equal(await form.getByLabel('Title',{exact:true}).inputValue(),title);
  await page.unroute(`**/api/books/${book.id}`);await form.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForFunction(expected=>document.querySelector('.workspace-title-block h2').textContent===expected,title);
  await page.reload({waitUntil:'networkidle'});assert.equal(await form.getByLabel('Title',{exact:true}).inputValue(),title);
  await form.getByLabel('Title',{exact:true}).fill('Unsaved reset');await form.getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await form.getByLabel('Title',{exact:true}).inputValue(),title);
  console.log('PASS: compact library, centered loading, Book info deep link/draft retention/save/error/reset.');
  await page.goto(`${base}/?book=${book.id}&chapter=${chapter.id}&section=review`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/^Vocabulary/}).click();const cards=page.locator('.question-card');assert.equal(await cards.count(),original.length);
  assert.equal(await page.locator('.question-answer:visible').count(),0);await cards.first().locator('.question-disclosure').click();assert(await cards.first().locator('.question-answer').isVisible());
  await cards.first().getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'Collapse all',exact:true}).click();assert(await cards.first().getByLabel('Word',{exact:true}).isVisible());await cards.first().getByRole('button',{name:'Cancel',exact:true}).click();
  let response=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/items/'));
  await cards.first().locator('.question-drag-handle').press('ArrowDown');assert.equal((await response).status(),200);assert.equal((await list())[1].id,original[0].id);
  const moved=await cards.first().getAttribute('data-question-id');const from=await cards.first().locator('.question-drag-handle').boundingBox(),to=await cards.nth(2).locator('.question-disclosure').boundingBox();
  response=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/items/'));
  await page.mouse.move(from.x+8,from.y+10);await page.mouse.down();await page.mouse.move(to.x+20,to.y+10,{steps:12});await page.mouse.up();assert.equal((await response).status(),200);assert.equal((await list())[2].id,moved);
  await page.getByRole('button',{name:'Add Word',exact:true}).last().click();const create=page.locator('.study-item-create-card');
  await create.getByLabel('Word',{exact:true}).fill('temporary-ui-word');await create.getByLabel('Definition',{exact:true}).fill('Temporary test definition');await create.getByRole('button',{name:'Save',exact:true}).click();await create.waitFor({state:'hidden'});
  added=(await list()).find(w=>!original.some(o=>o.id===w.id));assert(added);const row=page.locator(`[data-question-id="${added.id}"]`);
  await row.getByRole('button',{name:'Delete',exact:true}).click();await row.getByRole('button',{name:'Delete',exact:true}).click();await row.waitFor({state:'hidden'});added=null;
  await page.screenshot({path:'/tmp/compact-vocabulary.png'});
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Book info',exact:true}).click();assert(await form.isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:'/tmp/book-info-mobile.png'});
  assert.deepEqual(errors,[]);console.log('PASS: vocabulary collapse/edit, mouse/keyboard persistence, add/delete, mobile Book info layout.');
 } finally {
  release?.();
  if(added)await api(itemPath(added.id),'DELETE');
  if(original)for(const w of original)await api(itemPath(w.id),'PATCH',{sortOrder:w.sortOrder});
  if(book)await api(`/api/books/${book.id}`,'PATCH',{title:book.title,author:book.author,readingLevel:book.readingLevel});
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
