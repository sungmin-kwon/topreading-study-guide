/* Run only against a disposable restored database. Existing content is restored
 * in finally; a temporary empty guide version is created, never executed. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.LIVE_UI_TEST_URL;
if (!base || process.env.ALLOW_TEST_WRITES !== '1' || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('Set LIVE_UI_TEST_URL to a localhost server with a disposable database and ALLOW_TEST_WRITES=1.');
}
const evidence = path.resolve(__dirname, '../backups/live-ui-check');
fs.mkdirSync(evidence, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const api = async (url, method = 'get', data) => {
    const response = await context.request[method](base + url, { data, timeout: 60000 });
    assert(response.ok(), `${method} ${url}: ${response.status()} ${await response.text()}`);
    return response.json();
  };
  let chapter, question, book, set, temporaryRun;
  try {
    const books = (await api('/api/books')).books;
    assert(books.length >= 2, 'Use a restored library containing at least two books.');
    // Find a chapter with saved MCQs, without hardcoding private titles or IDs.
    for (const candidate of books) {
      const chapters = (await api(`/api/books/${candidate.id}/chapters`)).chapters;
      for (const candidateChapter of chapters.slice(0, 3)) {
        const params = candidate.activeGenerationRunId ? `?generationRunId=${candidate.activeGenerationRunId}` : '';
        const sets = (await api(`/api/books/${candidate.id}/chapters/${candidateChapter.id}/study-sets${params}`)).studySets;
        if (!sets.length) continue;
        const items = (await api(`/api/books/${candidate.id}/study-sets/${sets[0].id}/items?chapterId=${candidateChapter.id}`)).items;
        if (items.multipleChoiceQuestions.length) {
          book = candidate; set = sets[0]; question = items.multipleChoiceQuestions[0];
          chapter = (await api(`/api/books/${book.id}/chapters/${candidateChapter.id}`)).chapter;
          break;
        }
      }
      if (book) break;
    }
    assert(book && chapter && question, 'A saved chapter with MCQs is required.');
    const start = `${base}/?book=${book.id}&chapter=${chapter.id}&section=review`;
    const itemUrl = `/api/books/${book.id}/study-sets/${set.id}/items/multiple-choice/${question.id}?chapterId=${chapter.id}`;
    const chapterUrl = `/api/books/${book.id}/chapters/${chapter.id}`;
    await page.goto(start, { waitUntil: 'networkidle', timeout: 60000 });
    const cards = page.locator('.study-item-card');
    await cards.first().getByRole('button', { name: 'Edit', exact: true }).waitFor();
    assert.equal(await page.locator('.reading-book-switcher option').count(), books.length);
    assert.equal(await page.locator('aside.library-panel').count(), 0);
    await page.getByRole('button', { name: 'Source passage', exact: true }).click();
    assert.equal(await page.locator('.reading-source p').innerText(), chapter.textContent);
    await page.getByRole('button', { name: 'Source passage', exact: true }).click();
    await cards.first().getByRole('button', { name: 'Edit', exact: true }).click();
    const draft = question.questionText + ' [UI save check]';
    await page.getByRole('textbox', { name: 'Question', exact: true }).fill(draft);
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    await page.getByRole('button', { name: 'Study guides', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Question', exact: true }).inputValue(), draft);
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByLabel('Search library', { exact: true }).fill(book.title);
    assert(await page.locator('.reading-book-list article').count() >= 1);
    await page.locator('.reading-book-switcher select').selectOption(books.find(b => b.id !== book.id).id);
    await page.locator('.reading-book-switcher select').selectOption(book.id);
    await page.getByRole('textbox', { name: 'Question', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Question', exact: true }).inputValue(), draft);
    const failItem = route => route.request().method() === 'PATCH' ? route.abort('failed') : route.continue();
    await page.route('**/items/multiple-choice/*', failItem);
    await cards.first().getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Your draft is retained' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Question', exact: true }).inputValue(), draft);
    await page.unroute('**/items/multiple-choice/*', failItem);
    await cards.first().getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('textbox', { name: 'Question', exact: true }).waitFor({ state: 'hidden' });
    await page.reload({ waitUntil: 'networkidle' });
    await cards.first().getByText(draft, { exact: true }).waitFor();
    const saved = (await api(`/api/books/${book.id}/study-sets/${set.id}/items?chapterId=${chapter.id}`)).items.multipleChoiceQuestions.find(q => q.id === question.id);
    assert.equal(saved.questionText, draft);
    assert.deepEqual(saved.choices, question.choices);
    assert.equal(saved.correctChoiceIndex, question.correctChoiceIndex);
    // Cancel removes the draft rather than unexpectedly restoring it on Edit.
    await cards.first().getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('textbox', { name: 'Question', exact: true }).fill('Discard this edit');
    await cards.first().getByRole('button', { name: 'Cancel', exact: true }).click();
    await cards.first().getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Question', exact: true }).inputValue(), draft);
    await cards.first().getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    const title = page.locator('.chapter-form-grid').getByLabel('Title', { exact: true });
    await title.fill(chapter.title + ' [UI check]');
    const failChapter = route => route.request().method() === 'PATCH' ? route.abort('failed') : route.continue();
    await page.route(`**/chapters/${chapter.id}`, failChapter);
    await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Your draft is retained' }).waitFor();
    assert.equal(await title.inputValue(), chapter.title + ' [UI check]');
    await page.unroute(`**/chapters/${chapter.id}`, failChapter);
    await page.getByRole('button', { name: 'Save Chapter', exact: true }).click();
    await page.getByRole('button', { name: 'Save Chapter', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.reading-save-state').textContent.includes('Unsaved edits'));
    await page.reload({ waitUntil: 'networkidle' });
    await title.waitFor();
    assert.equal(await title.inputValue(), chapter.title + ' [UI check]');
    assert.equal(new URL(page.url()).searchParams.get('chapter'), chapter.id);
    const sourceFailure = route => route.abort('failed');
    await page.route(`**/api/books/${book.id}/source-files`, sourceFailure);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).waitFor();
    await page.unroute(`**/api/books/${book.id}/source-files`, sourceFailure);
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
    await title.waitFor();
    assert.equal(await title.inputValue(), chapter.title + ' [UI check]');
    // A real, empty version checks version switching without an AI request.
    temporaryRun = (await api(`/api/books/${book.id}/generation-runs`, 'post', { name: 'UI check — empty version' })).generationRun;
    await api(`/api/books/${book.id}/generation-runs/${temporaryRun.id}`, 'patch', { status: 'failed' });
    await page.goto(start, { waitUntil: 'networkidle' });
    await page.getByRole('combobox', { name: 'Guide version', exact: true }).selectOption(temporaryRun.id);
    await page.getByText('No guide is available for this chapter and version.', { exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Guide version', exact: true }).selectOption(book.activeGenerationRunId || '');
    await cards.first().getByText(draft, { exact: true }).waitFor();
    // The existing PDF/DOCX exporters must still use the selected version.
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    for (const [format, label, signature] of [['pdf', 'Export Answer Key as PDF', '%PDF'], ['docx', 'Export Answer Key as Word', 'PK']]) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.getByRole('button', { name: label, exact: true }).first().click()
      ]);
      const file = path.join(evidence, `live-answer-key.${format}`);
      await download.saveAs(file);
      assert(fs.readFileSync(file).subarray(0, signature.length).toString() === signature);
    }
    await page.getByRole('button', { name: 'Study guides', exact: true }).click();
    await cards.first().waitFor();
    await page.screenshot({ path: path.join(evidence, 'saved-book-desktop.png') });
    await page.getByRole('button', { name: 'Open user preferences', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Dark Mode', exact: true }).click();
    await page.getByRole('menuitem', { name: '한국어', exact: true }).click();
    await page.getByRole('button', { name: '사용자 설정 열기', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('combobox', { name: '현재 챕터', exact: true }).waitFor();
    assert.equal(await page.locator('.chapter-panel .chapter-list').isVisible(), false);
    await page.screenshot({ path: path.join(evidence, 'saved-book-mobile-ko-dark.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: saved library, source passage, draft navigation, failed-save retry, server persistence, correct-answer preservation, cancel, chapter save, reload position, version selection, PDF/DOCX, Korean/dark mobile.');
  } finally {
    if (book && chapter && question && set) {
      await api(`/api/books/${book.id}/study-sets/${set.id}/items/multiple-choice/${question.id}?chapterId=${chapter.id}`, 'patch', question);
      await api(`/api/books/${book.id}/chapters/${chapter.id}`, 'patch', chapter);
      await api(`/api/books/${book.id}`, 'patch', { activeGenerationRunId: book.activeGenerationRunId });
      if (temporaryRun) await api(`/api/books/${book.id}/generation-runs/${temporaryRun.id}`, 'delete');
    }
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
