/* Destructive fixture checks: localhost + a disposable restored schema only.
 * No provider network calls, real credentials, or paid generation calls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { eq, sql } = require('drizzle-orm');
const base = process.env.AUTH_TEST_URL;
const schemaName = process.env.DATABASE_SCHEMA;
if (process.env.ALLOW_TEST_WRITES !== '1' || !base ||
    !['localhost', '127.0.0.1'].includes(new URL(base).hostname) ||
    !['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname) ||
    !/^(test_|topreading_runtime)[a-z0-9_]*$/.test(schemaName || '')) {
  throw Error('Use a local disposable schema, AUTH_TEST_URL and ALLOW_TEST_WRITES=1');
}
const root = path.resolve(__dirname, '..');
let oauth;
const overrides = {
  'next-auth': config => { oauth = config; return {}; },
  'next-auth/providers/google': config => config
};
const cache = new Map();
function load(name) {
  if (overrides[name]) return overrides[name];
  let file = name.startsWith('@/') ? path.join(root, 'apps/web/src', name.slice(2)) : path.resolve(root, 'apps/web/src/lib', name);
  if (!file.endsWith('.ts')) file += '.ts';
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} }; cache.set(file, module.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = n => n.startsWith('.') ? load(path.resolve(path.dirname(file), n)) : n.startsWith('@/') || overrides[n] ? load(n) : require(n);
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(req, module, module.exports);
  cache.set(file, module.exports); return module.exports;
}
const { pool, db, atomic } = load('db/client');
const tables = load('db/schema');
const { createUser, updateUser, listUsers } = load('users');
const { createBook } = load('books');
const { tokenHash } = load('auth-sessions');
const { requireAdmin } = load('auth');
const { verifyCloudflareIdentity, validateAuthConfiguration } = load('auth-identity');
const { replaceStudyItems, appendStudyItems, listStudyItems } = load('study-items');
const { updateChapter, getChapter } = load('chapters');
const { updateAdminSettings } = load('admin-settings');
const table = name => `"${schemaName}"."${name}"`;
const fixtureUsers = [], fixtureLibraries = [], fixtureBooks = [];
const request = (url, token, method = 'GET', data, origin = base) => fetch(base + url, {
  method, redirect: 'manual', headers: {
    ...(token ? { cookie: `authjs.session-token=${token}` } : {}),
    origin, 'content-type': 'application/json',
    'cf-access-authenticated-user-email': 'live-ui-test@topreading.local',
    'x-forwarded-email': 'live-ui-test@topreading.local'
  }, ...(data === undefined ? {} : { body: JSON.stringify(data) })
});
async function session(user, expires = new Date(Date.now() + 600000)) {
  const token = randomUUID();
  await oauth.adapter.createSession({ sessionToken: token, userId: user.id, expires });
  return token;
}
async function fixtureUser(lib, role = 'member') {
  const user = await createUser({ email: `${randomUUID()}@example.test`, role }, lib);
  fixtureUsers.push(user.id); return user;
}
(async () => {
  process.env.AUTH_MODE = 'google';
  process.env.APP_BASE_URL = base;
  load('auth-google');
  const library = (await pool.query(`SELECT id FROM ${table('libraries')} LIMIT 1`)).rows[0].id;
  const outsiderLibrary = randomUUID(); fixtureLibraries.push(outsiderLibrary);
  await pool.query(`INSERT INTO ${table('libraries')}(id,name) VALUES($1,'Authorization fixture')`, [outsiderLibrary]);
  const member = await fixtureUser(library), outsider = await fixtureUser(outsiderLibrary), admin = await fixtureUser(library, 'admin');
  const memberToken = await session(member), outsiderToken = await session(outsider), adminToken = await session(admin);
  const outsiderBook = await createBook({ libraryId: outsiderLibrary, title: 'Authorization fixture' }); fixtureBooks.push(outsiderBook.id);
  const targetBook = (await pool.query(`SELECT id FROM ${table('books')} WHERE library_id=$1 LIMIT 1`, [library])).rows[0].id;
  const targetChapter = (await pool.query(`SELECT id FROM ${table('chapters')} WHERE book_id=$1 LIMIT 1`, [targetBook])).rows[0].id;
  const targetSet = (await pool.query(`SELECT id FROM ${table('study_sets')} WHERE book_id=$1 LIMIT 1`, [targetBook])).rows[0].id;
  const targetRun = (await pool.query(`SELECT id FROM ${table('generation_runs')} WHERE book_id=$1 LIMIT 1`, [targetBook])).rows[0].id;
  const fake = randomUUID();
  assert.equal((await request('/api/books')).status, 401, 'Spoofed identity headers must not authenticate');
  assert.equal((await request('/api/books', 'forged')).status, 401);
  assert.equal((await request('/')).status, 307);
  assert((await (await request('/login')).text()).includes('Continue with Google'));
  const authSession = await (await request('/api/auth/session', memberToken)).json();
  assert.equal(authSession.user.email, member.email, 'Actual Auth.js adapter must resolve the opaque session');
  assert.equal((await request('/api/books', await session(member, new Date(Date.now() - 1000)))).status, 401);
  const visible = await (await request('/api/books', outsiderToken)).json();
  assert.deepEqual(visible.books.map(b => b.id), [outsiderBook.id]);
  assert.equal((await request(`/api/books/${targetBook}`, memberToken)).status, 200);
  assert.equal((await request(`/api/books/${outsiderBook.id}/chapters/${targetChapter}`, outsiderToken)).status, 404);
  assert.equal((await request(`/api/books/${outsiderBook.id}/study-sets/${targetSet}`, outsiderToken)).status, 404);
  // Discover every book-resource handler, including bulk PUT, nested exports and generation.
  const routesRoot = path.join(root, 'apps/web/src/app/api/books/[bookId]');
  const params = { bookId: targetBook, chapterId: targetChapter, studySetId: targetSet, generationRunId: targetRun, sourceFileId: fake, parsedDocumentId: fake, kind: 'multiple-choice', itemId: fake };
  let denied = 0;
  function* files(dir) { for (const file of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, file.name); if (file.isDirectory()) yield* files(full); else if (file.name === 'route.ts') yield full; } }
  for (const file of files(routesRoot)) {
    const route = '/api/books/[bookId]' + path.relative(routesRoot, file).replace(/route\.ts$/, '').replaceAll(path.sep, '/').replace(/^([^/])/, '/$1');
    const url = route.replace(/\[(\w+)\]/g, (_, name) => params[name]).replace(/\/$/, '');
    for (const [, method] of fs.readFileSync(file, 'utf8').matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\(/g)) {
      const response = await request(url, outsiderToken, method, method === 'GET' ? undefined : {});
      assert.equal(response.status, 404, `${method} ${url} must hide another library`);
      const anonymous = await request(url, null, method, method === 'GET' ? undefined : {});
      assert([401, 404].includes(anonymous.status), `${method} ${url} must deny anonymous access`); denied++;
    }
  }
  assert(denied > 30);
  assert.equal((await request('/api/admin/users', memberToken)).status, 403);
  assert.equal((await request('/api/admin/settings', memberToken)).status, 403);
  assert.equal((await request(`/api/books/${targetBook}`, memberToken, 'PATCH', {}, 'https://foreign.example')).status, 403);
  assert.equal((await fetch(base + '/api/books', { method: 'POST', headers: { cookie: `authjs.session-token=${memberToken}` }, body: '{}' })).status, 403);
  assert.equal((await request('/api/admin/users', adminToken)).status, 200);
  process.env.APP_ADMIN_EMAILS = admin.email;
  await updateUser(admin.id, { status: ' Disabled ' });
  await listUsers();
  assert.equal(await requireAdmin(new Headers({ cookie: `authjs.session-token=${adminToken}` })), null);
  assert.equal((await request('/api/admin/users', adminToken)).status, 403);
  await updateUser(admin.id, { status: 'active' });
  assert.equal((await request('/api/books', adminToken)).status, 401, 'Reactivation must not restore a revoked session');
  assert.equal(await oauth.callbacks.signIn({ account: { provider: 'google' }, profile: { email: member.email, email_verified: true } }), true);
  for (const profile of [{ email: member.email, email_verified: false }, { email: 'uninvited@example.test', email_verified: true }]) {
    assert.equal(await oauth.callbacks.signIn({ account: { provider: 'google' }, profile }), false);
  }
  await assert.rejects(oauth.adapter.createUser({ email: 'uninvited@example.test' }), /Invitation/);
  await oauth.adapter.linkAccount({ provider: 'google', providerAccountId: fake, userId: member.id });
  assert.equal((await oauth.adapter.getUserByAccount({ provider: 'google', providerAccountId: fake })).id, member.id);
  const sessionRows = (await pool.query(`SELECT token_hash FROM ${table('auth_sessions')} WHERE user_id=$1`, [member.id])).rows;
  assert(sessionRows.some(row => row.token_hash === tokenHash(memberToken)));
  assert(!sessionRows.some(row => row.token_hash === memberToken));
  const csrfResponse = await request('/api/auth/csrf', memberToken);
  const csrf = await csrfResponse.json();
  const csrfCookies = csrfResponse.headers.getSetCookie().map(cookie => cookie.split(';')[0]);
  const logout = await fetch(base + '/api/auth/signout', {
    method: 'POST', redirect: 'manual', headers: {
      origin: base, 'content-type': 'application/x-www-form-urlencoded',
      cookie: [`authjs.session-token=${memberToken}`, ...csrfCookies].join('; ')
    }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: base + '/login' })
  });
  assert([302, 303].includes(logout.status));
  assert.equal((await request('/api/books', memberToken)).status, 401);
  await assert.rejects(updateAdminSettings({ AUTH_MODE: 'off' }), /Deployment/);
  await assert.rejects(updateAdminSettings({ toString: 'off' }), /Deployment/);
  console.log(`PASS: ${denied} cross-library handlers, nested IDs, header/cookie forgery, expiry, CSRF, disabled admins, invitation checks and hashed/revoked sessions.`);

  const before = await listStudyItems(targetSet);
  await assert.rejects(replaceStudyItems(targetSet, { multipleChoiceQuestions: [{ questionText: 'Broken', choices: ['A', 'B'], correctChoiceIndex: 9 }] }));
  assert.deepEqual(await listStudyItems(targetSet), before, 'Failed replacement must restore all deleted item types');
  await assert.rejects(appendStudyItems(targetSet, { vocabularyItems: [{ term: 'fixture', definition: 'Rollback check' }], multipleChoiceQuestions: [{ chapterId: fake, questionText: 'Broken FK', choices: ['A', 'B'], correctChoiceIndex: 0 }] }));
  assert.deepEqual(await listStudyItems(targetSet), before, 'A later failed INSERT must roll back earlier inserts');
  const foreignChapter = (await pool.query(`SELECT id FROM ${table('chapters')} WHERE book_id<>$1 LIMIT 1`, [targetBook])).rows[0].id;
  await assert.rejects(appendStudyItems(targetSet, { vocabularyItems: [{ chapterId: foreignChapter, term: 'foreign', definition: 'Must be rejected' }] }));
  assert.deepEqual(await listStudyItems(targetSet), before);
  const chapter = await getChapter(targetChapter);
  const abort = new Error('Rollback fixture');
  await assert.rejects(atomic(async () => {
    const changed = await updateChapter({ chapterId: chapter.id, chapterNumber: chapter.chapterNumber, title: chapter.title, textContent: chapter.textContent + '\nRevision fixture.' });
    assert.notEqual(changed.currentRevisionId, chapter.currentRevisionId);
    const snapshot = await db.execute(sql.raw(`SELECT text_content FROM "${schemaName}".chapter_revisions WHERE id='${chapter.currentRevisionId}'`));
    assert.equal(snapshot.rows[0].text_content, chapter.textContent);
    await appendStudyItems(targetSet, { vocabularyItems: [{ term: 'revision-fixture', definition: 'Uses source read before edit' }] }, { chapterId: chapter.id, chapterRevisionId: chapter.currentRevisionId });
    const [item] = await db.select().from(tables.vocabularyItems).where(eq(tables.vocabularyItems.term, 'revision-fixture'));
    assert.equal(item.chapterRevisionId, chapter.currentRevisionId);
    throw abort;
  }), error => error === abort);
  assert.deepEqual(await getChapter(targetChapter), chapter);
  assert.deepEqual(await listStudyItems(targetSet), before);
  await assert.rejects(atomic(async () => {
    await db.delete(tables.books).where(eq(tables.books.id, targetBook));
    assert.equal(await getChapter(targetChapter), null);
    assert.equal((await listStudyItems(targetSet)).multipleChoice.length, 0);
    throw abort;
  }), error => error === abort);
  assert.deepEqual(await getChapter(targetChapter), chapter);
  assert.deepEqual(await listStudyItems(targetSet), before);
  console.log('PASS: atomic replace/append rollback, same-book constraints, cascade deletion, chapter snapshots, and generation provenance across concurrent source edits.');

  const { generateKeyPair, SignJWT } = require('jose');
  const keys = await generateKeyPair('RS256');
  process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = 'fixture.cloudflareaccess.com';
  process.env.CLOUDFLARE_ACCESS_AUD = 'fixture-aud';
  delete process.env.AUTH_ALLOWED_EMAILS;
  const sign = (aud = 'fixture-aud', expiry = '5m', issuer = 'https://fixture.cloudflareaccess.com') => new SignJWT({ email: member.email }).setProtectedHeader({ alg: 'RS256' }).setSubject('fixture').setIssuer(issuer).setAudience(aud).setExpirationTime(expiry).sign(keys.privateKey);
  const verify = token => verifyCloudflareIdentity(new Headers({ 'cf-access-jwt-assertion': token }), async () => keys.publicKey);
  assert.equal(await verify(await sign()), member.email);
  assert.equal(await verifyCloudflareIdentity(new Headers({ 'cf-access-authenticated-user-email': member.email }), async () => keys.publicKey), null);
  assert.equal(await verify(await sign('wrong-aud')), null);
  assert.equal(await verify(await sign('fixture-aud', '-1s')), null);
  assert.equal(await verify(await sign('fixture-aud', '5m', 'https://wrong.example')), null);
  const forged = await sign(); assert.equal(await verify(forged.slice(0, -12) + 'AAAAAAAAAAAA'), null);
  process.env.AUTH_MODE = 'cloudflare_access';
  process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN = 'top.dubugimchi.com';
  assert.throws(validateAuthConfiguration, /TEAM_DOMAIN/);
  console.log('PASS: signed Cloudflare identity, wrong issuer/audience, expiry, tampering, and public-hostname configuration rejection.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const id of fixtureBooks) await pool.query(`DELETE FROM ${table('books')} WHERE id=$1`, [id]);
  for (const id of fixtureUsers) {
    await pool.query(`DELETE FROM ${table('library_memberships')} WHERE user_id=$1`, [id]);
    await pool.query(`DELETE FROM ${table('users')} WHERE id=$1`, [id]);
  }
  for (const id of fixtureLibraries) await pool.query(`DELETE FROM ${table('libraries')} WHERE id=$1`, [id]);
  await pool.end();
});
