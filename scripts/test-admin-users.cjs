/* Creates/drops its own test_admin_* schema. Requires a local disposable DB,
 * owner + restricted app connections, a built app and Playwright. No real users
 * are modified and no Google/OpenAI requests are made. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const ownerUrl = process.env.ADMIN_TEST_OWNER_URL, appUrl = process.env.ADMIN_TEST_APP_URL;
if (process.env.ALLOW_TEST_WRITES !== '1' || [ownerUrl, appUrl].some(url => !url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname))) throw Error('Use local disposable PostgreSQL URLs and ALLOW_TEST_WRITES=1');
const schema = `test_admin_${randomUUID().replaceAll('-', '')}`;
const port = Number(process.env.ADMIN_TEST_PORT || 3197), base = `http://127.0.0.1:${port}`;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid test port');
const table = name => `"${schema}"."${name}"`;
const owner = new Pool({ connectionString: ownerUrl });
const cache = new Map();
function load(name) {
  let file = name.startsWith('@/') ? path.join(root, 'apps/web/src', name.slice(2)) : path.resolve(root, 'apps/web/src/lib', name);
  if (!file.endsWith('.ts')) file += '.ts';
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} }; cache.set(file, module.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = n => n.startsWith('.') ? load(path.resolve(path.dirname(file), n)) : n.startsWith('@/') ? load(n) : require(n);
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(req, module, module.exports);
  cache.set(file, module.exports); return module.exports;
}
const tokenHash = token => createHash('sha256').update(token).digest('hex');
async function tokenFor(id) {
  const token = randomUUID();
  await owner.query(`INSERT INTO ${table('auth_sessions')}(token_hash,user_id,expires) VALUES($1,$2,now()+interval '1 hour')`, [tokenHash(token), id]);
  return token;
}
async function api(route, token, method = 'GET', body, origin = base) {
  return fetch(base + route, { method, redirect: 'manual', headers: { origin, ...(token ? { cookie: `authjs.session-token=${token}` } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
(async () => {
  let server, browser, applicationPool;
  try {
    // Fail before launching if the port belongs to another process.
    const net = require('node:net'); const probe = net.createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
    await new Promise(resolve => probe.close(resolve));
    const connection = await owner.connect();
    try {
      await connection.query(`CREATE SCHEMA "${schema}"`);
      await connection.query(`SET search_path TO "${schema}",pg_catalog`);
      for (const file of fs.readdirSync(path.join(root, 'database/migrations')).filter(file => /^\d{4}.*\.sql$/.test(file)).sort()) {
        await connection.query(fs.readFileSync(path.join(root, 'database/migrations', file), 'utf8'));
      }
      const appRole = decodeURIComponent(new URL(appUrl).username);
      assert(/^[a-z_][a-z0-9_]*$/.test(appRole));
      await connection.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${appRole}"`);
      await connection.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${appRole}"`);
    } finally { connection.release(); }
    Object.assign(process.env, { DATABASE_URL: appUrl, DATABASE_SCHEMA: schema });
    const { createUser, updateUser, deleteUser } = load('users'); applicationPool = load('db/client').pool;
    const library = randomUUID(), book = randomUUID();
    await owner.query(`INSERT INTO ${table('libraries')}(id,name) VALUES($1,'Admin test library')`, [library]);
    await owner.query(`INSERT INTO ${table('books')}(id,library_id,title,created_at,updated_at) VALUES($1,$2,'Shared fixture book',now(),now())`, [book, library]);
    const admin = await createUser({ email: 'admin@example.test', displayName: 'Library administrator', role: 'admin' }, library);
    await assert.rejects(updateUser(admin.id, { status: 'disabled' }), /at least one active administrator/);
    await assert.rejects(updateUser(admin.id, { role: 'member' }), /at least one active administrator/);
    const member = await createUser({ email: 'member@example.test', displayName: 'Active reader' }, library);
    const disabled = await createUser({ email: 'disabled@example.test', displayName: 'Former reader', status: 'disabled' }, library);
    const adminToken = await tokenFor(admin.id), memberToken = await tokenFor(member.id), disabledToken = await tokenFor(disabled.id);
    server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: path.join(root, 'apps/web'), stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, NODE_ENV: 'production', AUTH_MODE: 'google', APP_BASE_URL: base, AUTH_URL: base, AUTH_GOOGLE_ID: 'fixture.apps.googleusercontent.com', AUTH_GOOGLE_SECRET: 'fixture-client-secret', AUTH_SECRET: 'fixture-session-secret-for-admin-tests-only', ALLOW_INSECURE_LOCAL_AUTH: 'false' }
    });
    for (let i = 0; i < 50; i++) {
      if (server.exitCode !== null) throw Error('Test server failed to start');
      try { if ((await api('/api/admin/me', adminToken)).ok) break; } catch {}
      if (i === 49) throw Error('Test server did not become ready');
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const route = id => `/api/admin/users/${id}`;
    for (const token of [null, memberToken, disabledToken, 'forged']) assert.equal((await api(route(disabled.id), token, 'DELETE')).status, 403);
    assert.equal((await api(route(disabled.id), adminToken, 'DELETE', undefined, 'https://untrusted.example')).status, 403);
    assert.equal((await api(route(admin.id), adminToken, 'DELETE')).status, 400);
    assert.equal((await api(route(admin.id), adminToken, 'PATCH', { status: 'disabled' })).status, 400);
    assert.equal((await api(route(admin.id), adminToken, 'PATCH', { role: 'member' })).status, 400);
    assert.equal((await api(route(member.id), adminToken, 'DELETE')).status, 400);
    assert.equal((await api(route(randomUUID()), adminToken, 'DELETE')).status, 404);
    const job = randomUUID();
    await owner.query(`INSERT INTO ${table('jobs')}(id,library_id,book_id,requested_by,kind,idempotency_key,status) VALUES($1,$2,$3,$4,'export',$5,'completed')`, [job, library, book, disabled.id, job]);
    await owner.query(`INSERT INTO ${table('auth_accounts')}(provider,provider_account_id,user_id) VALUES('google',$1,$2)`, [randomUUID(), disabled.id]);
    // Inject a final-step failure and prove earlier cleanup is rolled back.
    await owner.query(`CREATE FUNCTION "${schema}".refuse_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture delete failure'; END; $$`);
    await owner.query(`CREATE TRIGGER refuse_delete BEFORE DELETE ON ${table('users')} FOR EACH ROW EXECUTE FUNCTION "${schema}".refuse_delete()`);
    assert.equal((await api(route(disabled.id), adminToken, 'DELETE')).status, 400);
    assert.equal((await owner.query(`SELECT requested_by FROM ${table('jobs')} WHERE id=$1`, [job])).rows[0].requested_by, disabled.id);
    assert.equal((await owner.query(`SELECT 1 FROM ${table('library_memberships')} WHERE user_id=$1`, [disabled.id])).rowCount, 1);
    await owner.query(`DROP TRIGGER refuse_delete ON ${table('users')}`);
    assert.equal((await api(route(disabled.id), adminToken, 'DELETE')).status, 200);
    for (const [name, column] of [['users', 'id'], ['auth_accounts', 'user_id'], ['auth_sessions', 'user_id'], ['library_memberships', 'user_id']]) {
      assert.equal((await owner.query(`SELECT 1 FROM ${table(name)} WHERE ${column}=$1`, [disabled.id])).rowCount, 0);
    }
    assert.equal((await owner.query(`SELECT requested_by FROM ${table('jobs')} WHERE id=$1`, [job])).rows[0].requested_by, null);
    assert.equal((await owner.query(`SELECT 1 FROM ${table('books')} WHERE id=$1`, [book])).rowCount, 1);
    assert.equal((await api('/api/books', disabledToken)).status, 401);
    // Two admins acting concurrently cannot disable each other and leave none.
    const secondAdmin = await createUser({ email: 'second-admin@example.test', role: 'admin' }, library);
    const outcomes = await Promise.allSettled([
      updateUser(secondAdmin.id, { status: 'disabled' }, admin.id), updateUser(admin.id, { status: 'disabled' }, secondAdmin.id)
    ]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await owner.query(`SELECT 1 FROM ${table('users')} WHERE status='active' AND role='admin'`)).rowCount, 1);
    // Restore fixtures for browser checks, then issue a fresh admin session.
    await owner.query(`UPDATE ${table('users')} SET status='active' WHERE id=$1`, [admin.id]);
    await owner.query(`UPDATE ${table('users')} SET status='disabled' WHERE id=$1`, [secondAdmin.id]);
    const browserToken = await tokenFor(admin.id);
    const { getRuntimeSetting } = load('admin-settings');
    await owner.query(`INSERT INTO ${table('app_settings')}(key,value) VALUES('OPENAI_MODEL','gpt-5-mini')`);
    assert.equal(await getRuntimeSetting('OPENAI_MODEL'), 'gpt-6-luna', 'Legacy saved default upgrades without a migration');
    console.log('PASS: admin-only deletion, CSRF, self/active-account guards, final-admin and concurrent-admin protection, atomic rollback, session/account removal, preserved shared book/job');

    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: 'authjs.session-token', value: browserToken, url: base }]);
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/admin', { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Administration', exact: true }).waitFor();
    const roles = page.locator('.admin-person-role');
    assert.deepEqual(await roles.allTextContents(), ['Admin', 'Admin', 'Member']);
    const evidence = path.join(root, 'backups/admin-ui-check'); fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, 'desktop.png'), fullPage: true });
    await page.getByRole('button', { name: 'Add user', exact: true }).click();
    const add = page.locator('#admin-add-user');
    await add.getByLabel('Email', { exact: true }).fill('browser-reader@example.test');
    await add.getByLabel('Name', { exact: true }).fill('Browser reader');
    await add.getByRole('button', { name: 'Add', exact: true }).click();
    const row = page.locator('.admin-person').filter({ hasText: 'browser-reader@example.test' });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await row.locator('textarea').count(), 0);
    await row.getByLabel('Name', { exact: true }).fill('Discard this');
    await row.getByRole('button', { name: 'Cancel', exact: true }).click();
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await row.getByLabel('Name', { exact: true }).inputValue(), 'Browser reader');
    await row.getByLabel('Name', { exact: true }).fill('Saved reader');
    await row.getByRole('combobox', { name: 'Role', exact: true }).selectOption('admin');
    const failure = route => route.request().method() === 'PATCH' ? route.abort('failed') : route.continue();
    await page.route('**/api/admin/users/*', failure);
    await row.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('.admin-feedback[role=alert]').waitFor();
    assert.equal(await row.getByLabel('Name', { exact: true }).inputValue(), 'Saved reader');
    await page.unroute('**/api/admin/users/*', failure);
    await row.getByRole('button', { name: 'Save', exact: true }).click();
    await row.getByRole('heading', { name: 'Saved reader', exact: true }).waitFor();
    assert.deepEqual(await roles.allTextContents(), ['Admin', 'Admin', 'Admin', 'Member']);
    await page.reload({ waitUntil: 'networkidle' });
    await row.getByRole('button', { name: 'Edit', exact: true }).click();
    assert.equal(await row.getByLabel('Name', { exact: true }).inputValue(), 'Saved reader');
    assert(await row.getByRole('button', { name: 'Delete user', exact: true }).isDisabled());
    await row.getByRole('combobox', { name: 'Status', exact: true }).selectOption('disabled');
    await row.getByRole('button', { name: 'Save', exact: true }).click();
    await row.getByRole('button', { name: 'Delete user', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.admin-person:has(.admin-editor) .admin-delete')?.disabled);
    page.once('dialog', dialog => dialog.dismiss());
    await row.getByRole('button', { name: 'Delete user', exact: true }).click();
    assert.equal(await row.count(), 1);
    page.once('dialog', dialog => dialog.accept());
    await row.getByRole('button', { name: 'Delete user', exact: true }).click();
    await row.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Generation settings', exact: true }).click();
    const model = page.getByRole('combobox', { name: 'Generation model', exact: true });
    assert.equal(await model.inputValue(), 'gpt-6-luna');
    assert.deepEqual(await model.locator('option').evaluateAll(options => options.map(option => option.value)), ['gpt-6-luna', 'gpt-5-nano']);
    await model.selectOption('gpt-5-nano');
    await page.getByLabel('Maximum chapters per run', { exact: true }).fill('77');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Settings saved.' }).waitFor();
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Generation settings', exact: true }).click();
    assert.equal(await page.getByLabel('Maximum chapters per run', { exact: true }).inputValue(), '77');
    assert.equal(await model.inputValue(), 'gpt-5-nano');
    assert.equal(await getRuntimeSetting('OPENAI_MODEL'), 'gpt-5-nano');
    await model.selectOption('gpt-6-luna');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Settings saved.' }).waitFor();
    assert.equal(await getRuntimeSetting('OPENAI_MODEL'), 'gpt-6-luna');
    await page.screenshot({ path: path.join(evidence, 'generation-models.png'), fullPage: true });
    await page.getByRole('button', { name: 'Users', exact: true }).click();
    await page.getByLabel('Search users', { exact: true }).fill('member@example.test');
    assert.equal(await page.locator('.admin-person').count(), 1);
    await page.getByLabel('Search users', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Toggle dark mode', exact: true }).click();
    await page.getByLabel('Interface language', { exact: true }).selectOption('ko');
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(evidence, 'mobile-dark-korean.png'), fullPage: true });
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '관리', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.deepEqual(errors, []);
    console.log('PASS: Admin desktop/mobile, theme/language persistence, add/edit/cancel, network retry, reload persistence, disable/delete confirmation, search, administrator ordering and persistent model selection');
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve)); }
    if (applicationPool) await applicationPool.end();
    if (/^test_admin_[a-f0-9]+$/.test(schema)) await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await owner.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
