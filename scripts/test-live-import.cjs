const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.LIVE_UI_TEST_URL;
if (!base || process.env.ALLOW_TEST_WRITES !== '1' || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) {
  throw new Error('Use a localhost disposable database and set ALLOW_TEST_WRITES=1.');
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let bookId;
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    const [created] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/books' && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'New book', exact: true }).click()
    ]);
    assert(created.ok()); bookId = (await created.json()).book.id;
    const text = 'Chapter 1: The garden\n\nMina walked into the garden. She carried a small blue notebook and wrote down the names of the flowers.\n\nChapter 2: The library\n\nDaniel met Mina at the library. They borrowed a book about plants and decided to visit the garden again tomorrow.';
    await page.getByLabel('Source file', { exact: true }).setInputFiles({ name: 'ui-import-check.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
    await page.getByRole('button', { name: 'Upload Source', exact: true }).click();
    await page.getByRole('button', { name: 'Extract Text', exact: true }).click();
    await page.getByText('Source text extracted and saved.', { exact: true }).waitFor();
    await page.locator('.reading-navigation summary').click();
    await page.getByRole('button', { name: 'Chapter boundaries', exact: true }).click();
    await page.getByRole('button', { name: /Heading detection/ }).click();
    await page.getByRole('button', { name: 'Create Chapters from Headings', exact: true }).click();
    const chapterText = page.getByRole('textbox', { name: 'Chapter text', exact: true });
    await chapterText.waitFor();
    assert((await chapterText.inputValue()).includes('Mina walked into the garden.'));
    const response = await page.request.get(`${base}/api/books/${bookId}/chapters`);
    const chapters = (await response.json()).chapters;
    assert.equal(chapters.length, 2);
    await page.reload({ waitUntil: 'networkidle' });
    await chapterText.waitFor();
    assert((await chapterText.inputValue()).includes('Mina walked into the garden.'));
    await page.getByRole('button', { name: 'Study guides', exact: true }).click();
    await page.getByText('No guide is available for this chapter and version.', { exact: true }).waitFor();
    // Configure, but never execute generation: no paid AI request is part of this test.
    await page.getByRole('button', { name: 'Generate a guide', exact: true }).first().click();
    const setup = page.locator('.reading-generation-form');
    await setup.waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    const totals = setup.locator('.reading-generation-totals');
    await totals.getByLabel('Multiple Choice', { exact: true }).fill('6');
    const counts = setup.locator('.reading-generation-counts');
    assert.equal((await counts.locator('input').evaluateAll(inputs => inputs.filter((_, i) => i % 3 === 0).reduce((n, input) => n + Number(input.value), 0))), 6);
    const secondChapter = setup.locator('.reading-generation-chapter').nth(1);
    await secondChapter.getByRole('checkbox').uncheck();
    assert(await secondChapter.getByRole('spinbutton').first().isDisabled());
    await secondChapter.getByRole('checkbox').check();
    await setup.getByRole('button', { name: 'Reset Suggestions', exact: true }).click();
    // Never submit: production generation would make a paid model request.
    assert(await setup.getByRole('button', { name: 'Start Generation', exact: true }).isEnabled());
    await page.screenshot({ path: 'backups/live-ui-check/generate-guide-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: 'backups/live-ui-check/generate-guide-mobile.png' });
    await page.getByRole('button', { name: 'Toggle dark mode', exact: true }).click();
    await page.getByRole('combobox', { name: 'Interface language', exact: true }).selectOption('ko');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.getByRole('combobox', { name: '화면 언어', exact: true }).inputValue(), 'ko');
    await page.screenshot({ path: 'backups/live-ui-check/generate-guide-mobile-ko-dark.png' });
    await page.getByRole('combobox', { name: '화면 언어', exact: true }).selectOption('en');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByText('No exports available', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: create book, upload TXT, extract, preview headings, create two chapters, reload, empty guide/export states. No AI calls.');
  } finally {
    if (bookId) {
      const response = await page.request.delete(`${base}/api/books/${bookId}`);
      assert(response.ok(), 'Could not delete temporary import test book');
    }
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
