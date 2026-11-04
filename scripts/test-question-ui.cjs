// Only use a disposable local restored library. Restores existing positions and
// deletes its own fixture question in finally. No generation/model requests.
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.LIVE_UI_TEST_URL;
if(process.env.ALLOW_TEST_WRITES!=='1'||!base||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Use a disposable localhost library');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const api=async(url,method='GET',data)=>{const r=await context.request.fetch(base+url,{method,data});assert(r.ok(),`${r.status()} ${await r.text()}`);return r.json();};
 let book,chapter,set,original,added;
 const itemsPath=()=>`/api/books/${book.id}/study-sets/${set.id}/items`;
 const itemPath=id=>`${itemsPath()}/multiple-choice/${id}?chapterId=${chapter.id}`;
 const list=async()=>(await api(itemsPath()+`?chapterId=${chapter.id}`)).items.multipleChoiceQuestions;
 try {
  for(const b of (await api('/api/books')).books){for(const c of (await api(`/api/books/${b.id}/chapters`)).chapters.slice(0,3)){
   const sets=(await api(`/api/books/${b.id}/chapters/${c.id}/study-sets${b.activeGenerationRunId?'?generationRunId='+b.activeGenerationRunId:''}`)).studySets;
   if(!sets.length)continue;const qs=(await api(`/api/books/${b.id}/study-sets/${sets[0].id}/items?chapterId=${c.id}`)).items.multipleChoiceQuestions;
   if(qs.length>=4){book=b;chapter=c;set=sets[0];original=qs;break;}
  }if(book)break;}
  assert(original,'Need at least four saved questions');
  await page.goto(`${base}/?book=${book.id}&chapter=${chapter.id}&section=review`,{waitUntil:'networkidle'});
  const cards=page.locator('.question-card');await cards.first().waitFor();
  assert.equal(await cards.count(),original.length);assert.equal(await page.locator('.question-answer:visible').count(),0);
  await cards.first().locator('.question-disclosure').click();assert(await cards.first().locator('.choice-list').isVisible());
  await page.getByRole('button',{name:'Expand all',exact:true}).click();assert.equal(await page.locator('.question-answer:visible').count(),original.length);
  await cards.first().getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('button',{name:'Collapse all',exact:true}).click();assert(await cards.first().getByRole('textbox',{name:'Question',exact:true}).isVisible());
  await cards.first().getByRole('button',{name:'Cancel',exact:true}).click();
  const next=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/items/'));
  await cards.first().locator('.question-drag-handle').press('ArrowDown');assert.equal((await next).status(),200);
  assert.equal((await list())[1].id,original[0].id);
  await page.reload({waitUntil:'networkidle'});assert.equal(await cards.nth(1).getAttribute('data-question-id'),original[0].id);
  const from=await cards.first().locator('.question-drag-handle').boundingBox(),to=await cards.nth(2).locator('.question-disclosure').boundingBox();
  const movedId=await cards.first().getAttribute('data-question-id');
  const dragResponse=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/items/'));
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:15});await page.mouse.up();
  assert.equal((await dragResponse).status(),200);assert.equal((await list())[2].id,movedId);
  const beforeInvalid=(await list()).map(q=>q.id);
  const invalid=await context.request.patch(base+itemPath(beforeInvalid[0]),{data:{targetId:require('node:crypto').randomUUID()}});
  assert.equal(invalid.status(),400);assert.deepEqual((await list()).map(q=>q.id),beforeInvalid);
  await page.route('**/items/multiple-choice/*',route=>route.request().method()==='PATCH'?route.abort('failed'):route.continue());
  const failed=page.waitForEvent('requestfailed',r=>r.method()==='PATCH');
  await cards.first().locator('.question-drag-handle').press('ArrowDown');await failed;
  await page.waitForFunction(()=>!document.querySelector('.question-drag-handle').disabled);
  assert.deepEqual((await list()).map(q=>q.id),beforeInvalid);
  await page.unroute('**/items/multiple-choice/*');
  console.log('PASS: compact outline, disclosure, expand/collapse, editing stays visible, keyboard and mouse reorder persist; invalid/failed moves preserve order.');
  // Display saved reasons via a read-response fixture; no real question is edited.
  await page.route('**/items?*',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch();const payload=await response.json();if(payload.items?.multipleChoiceQuestions?.length){payload.items.multipleChoiceQuestions[0].status='needs_review';payload.items.multipleChoiceQuestions[0].reviewFlags=['review_budget_exhausted','semantic_disagreement'];}await route.fulfill({response,json:payload});});
  await page.reload({waitUntil:'networkidle'});await cards.first().locator('.question-disclosure').click();
  assert(await cards.first().getByText('The automatic review limit was reached before verification finished.',{exact:true}).isVisible());
  assert(await cards.first().getByText('The reviewer found ambiguity or disagreed with the answer key.',{exact:true}).isVisible());
  await page.unroute('**/items?*');
  await page.getByRole('button',{name:'Add Question',exact:true}).last().click();const form=page.locator('.study-item-create-card');
  await form.getByRole('textbox',{name:'Question',exact:true}).fill('Temporary outline UI test question');
  const choices=form.locator('.mcq-choice-field input');for(let i=0;i<4;i++)await choices.nth(i).fill('Fixture choice '+i);
  await form.getByRole('textbox',{name:'Explanation',exact:true}).fill('Temporary fixture explanation');
  await form.getByRole('button',{name:'Save',exact:true}).click();await form.waitFor({state:'hidden'});
  added=(await list()).find(q=>!original.some(o=>o.id===q.id));assert(added);assert.equal((await list()).at(-1).id,added.id);
  const row=page.locator(`[data-question-id="${added.id}"]`);await row.getByRole('button',{name:'Delete',exact:true}).click();await row.getByRole('button',{name:'Keep',exact:true}).click();assert((await list()).some(q=>q.id===added.id));
  await row.getByRole('button',{name:'Delete',exact:true}).click();await row.getByRole('button',{name:'Delete',exact:true}).click();await row.waitFor({state:'hidden'});assert(!(await list()).some(q=>q.id===added.id));added=null;
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Collapse all',exact:true}).click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await cards.first().scrollIntoViewIfNeeded();
  const touchSource=await cards.first().locator('.question-drag-handle').boundingBox(),touchTarget=await cards.nth(1).locator('.question-disclosure').boundingBox();
  const touchedId=await cards.first().getAttribute('data-question-id');
  const cdp=await context.newCDPSession(page);
  const touchResponse=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/items/'));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchSource.x+8,y:touchSource.y+10}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchTarget.x+20,y:touchTarget.y+10}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal((await touchResponse).status(),200);assert.equal((await list())[1].id,touchedId);
  await page.screenshot({path:'/tmp/question-outline-mobile.png',fullPage:false});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/tmp/question-outline-desktop.png',fullPage:false});
  console.log('PASS: simulated touch drag persists.');
  console.log('PASS: specific reasons, add at end, inline delete/keep, mobile layout; no browser errors.');assert.deepEqual(errors,[]);
 } finally {
  if(added)await api(itemPath(added.id),'DELETE');
  if(original)for(const q of original)await api(itemPath(q.id),'PATCH',{sortOrder:q.sortOrder});
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
