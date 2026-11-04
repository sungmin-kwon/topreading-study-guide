// Run only against a disposable local library. Creates/deletes one test book.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.LIVE_UI_TEST_URL;
if (process.env.ALLOW_TEST_WRITES !== '1' || !base || !['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Use disposable localhost library');
(async () => {
 const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const context = await browser.newContext({viewport:{width:1280,height:900}}), page = await context.newPage();
 const api = async (path,method='GET',data) => {const r=await context.request.fetch(base+path,{method,data});assert(r.ok(),await r.text());return r.json();};
 let created;
 try {
  const books=(await api('/api/books')).books;
  let book, chapters;
  for (const b of books) {const cs=(await api(`/api/books/${b.id}/chapters`)).chapters;if(cs.length>1){book=b;chapters=cs;break;}}
  assert(book);
  const chapter=chapters[0];
  // Slow both stages of guide loading; never mistake an unresolved request for an empty guide.
  await page.route('**/study-sets*',async route=>{await new Promise(r=>setTimeout(r,700));await route.continue().catch(()=>{});});
  await page.addInitScript(() => {window.emptyFlashes=[];new MutationObserver(()=>{if(document.querySelector('.chapter-editor .empty-state')?.textContent.includes('No guide is available'))window.emptyFlashes.push(Date.now());}).observe(document,{childList:true,subtree:true});});
  await page.goto(`${base}/?book=${book.id}&chapter=${chapter.id}&section=review`,{waitUntil:'domcontentloaded'});
  await page.getByText('Loading study guide...', {exact:true}).waitFor();
  await page.locator('.question-card').first().waitFor();
  assert.equal((await page.evaluate(()=>window.emptyFlashes)).length,0);
  // Text loading uses the same centered status component.
  await page.getByRole('button',{name:'Text',exact:true}).click();
  await page.route(`**/chapters/${chapters[1].id}`,async route=>{await new Promise(r=>setTimeout(r,900));await route.continue().catch(()=>{});});
  await page.locator('.chapter-list:visible .chapter-row').nth(1).click();
  const loading=page.locator('.chapter-editor .reading-load-state');await loading.waitFor();
  const box=await loading.boundingBox(), label=await loading.locator('p').boundingBox();assert(Math.abs(box.x+box.width/2-label.x-label.width/2)<3);
  await page.waitForLoadState('networkidle');
  await page.route(`**/chapters/${chapters[1].id}/study-sets*`,async route=>{await new Promise(r=>setTimeout(r,700));await route.fulfill({json:{studySets:[]}}).catch(()=>{});});
  await page.getByRole('button',{name:'Study guides',exact:true}).click();
  await page.getByText('Loading study guide...', {exact:true}).waitFor();
  await page.locator('.chapter-editor .empty-state').getByText('No guide is available for this chapter and version.',{exact:true}).waitFor();
  created=(await api('/api/books','POST',{title:'Disposable deletion navigation check'})).book;
  await page.goto(`${base}/?book=${created.id}&section=info`,{waitUntil:'networkidle'});
  const del=page.getByRole('button',{name:'Delete book',exact:true});await del.waitFor();
  const color=await del.evaluate(el=>getComputedStyle(el).backgroundColor);const channels=color.match(/[\d.]+/g).map(Number);assert(channels[0]>channels[1] && channels[0]>channels[2],color);
  page.once('dialog',d=>d.accept());await del.click();
  await page.locator('.reading-book-list').waitFor();
  await page.waitForFunction(()=>!new URL(location.href).searchParams.has('book'));
  assert.equal(await page.locator('.workspace').isVisible(),false);
  assert(!(await api('/api/books')).books.some(b=>b.id===created.id));created=null;
  console.log('PASS: no premature empty guide, centered chapter loading, red delete, deletion returns to Library.');
 } finally {if(created)await context.request.delete(`${base}/api/books/${created.id}`);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
