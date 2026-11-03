// Isolated browser acceptance: synthetic identities only, no Google/network credentials or hardware.
// npm run build first; PLAYWRIGHT_MODULE may point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer, openDatabase } from '../api/server.mjs';
import { googleConfig } from '../api/google-auth.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repository = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), 'rfm-google-browser-'));
process.chdir(path.join(repository, 'frontend-vue'));
process.env.LAYERPILOT_STORAGE_DIR = path.join(directory, 'storage');
const db = await openDatabase(path.join(directory, 'db.json'));
const config = googleConfig({ GOOGLE_CLIENT_ID: 'browser-fixture', GOOGLE_CLIENT_SECRET: 'synthetic-not-a-secret',
  GOOGLE_REDIRECT_URI: 'http://127.0.0.1:8797/api/customer-auth/google/callback' });
let identity = { sub: 'browser-google-fixture', email: 'browser-google@example.test', name: 'Google 測試會員' };
const app = await buildServer({ db, serveStatic: true, emailClient: null, stripeClient: null,
  googleAuth: { config, verifyIdentity: async () => identity } });
let browser;
try {
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  config.origin = base;
  config.redirectUri = `${base}/api/customer-auth/google/callback`;
  process.env.LAYERPILOT_PUBLIC_URL = base;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(15000);
  const errors = [];
  context.on('page', (page) => page.on('pageerror', (e) => errors.push(e.message)));
  await context.route('https://accounts.google.com/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ status: 302, headers: { location: `${base}/api/customer-auth/google/callback?state=${encodeURIComponent(url.searchParams.get('state'))}&code=browser-fixture` }, body: '' });
  });
  const page = await context.newPage();
  const signIn = () => page.getByRole('button', { name: '使用 Google 帳戶登入', exact: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['/portal/login', '/portal/register']) {
      await page.goto(`${base}/#${route}`);
      await signIn().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(directory, `${route.split('/').pop()}-${width}.png`), fullPage: true });
    }
  }
  console.log('PASS login/register Google button and responsive layout (1440, 390, 320px)');
  await page.goto(`${base}/#/portal/login?redirect=${encodeURIComponent('/portal/workspace?section=settings')}`);
  await signIn().click();
  await page.getByText('已連結 Google 帳戶，可使用 Google 登入此會員帳號。').waitFor();
  await page.getByRole('link', { name: '寄送設定密碼驗證信' }).waitFor();
  assert.match(await page.evaluate(() => localStorage.getItem('layerpilot-customer-token')), /^[A-Za-z0-9_-]+$/);
  assert.equal(await page.evaluate(() => localStorage.getItem('layerpilot-token')), null);
  console.log('PASS real callback, member session, settings return and Google-only password guidance');
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}/#/portal/login?google=cancelled`);
  await page.reload();
  await page.getByText('已取消 Google 登入，你仍可使用 Email 登入。').waitFor();
  console.log('PASS cancellation remains on usable login form');

  identity = { sub: 'linked-browser-google', email: 'existing-browser@example.test', name: '既有會員' };
  const registered = await context.request.post(`${base}/api/customer-auth/register`, { data: { name: '既有會員', email: identity.email, password: 'fixture-password-123' } });
  assert.equal(registered.status(), 201);
  await page.goto(`${base}/#/portal/login`);
  await signIn().click();
  await page.getByRole('status').filter({ hasText: '此 Email 已有會員資料' }).waitFor();
  await page.getByPlaceholder('請輸入電子郵件', { exact: true }).fill(identity.email);
  await page.getByPlaceholder('請輸入密碼', { exact: true }).fill('fixture-password-123');
  await page.getByRole('button', { name: '登入會員中心', exact: true }).click();
  await page.waitForURL('**/#/portal/dashboard');
  await page.goto(`${base}/#/portal/workspace?section=settings`);
  await page.getByRole('button', { name: '連結 Google 帳戶' }).click();
  await page.getByText('已連結 Google 帳戶，可使用 Google 登入此會員帳號。').waitFor();
  console.log('PASS email collision guidance, original password login and explicit Google linking');

  await page.evaluate(() => localStorage.clear());
  await context.clearCookies();
  identity = { sub: 'inline-browser-google', email: 'inline-browser@example.test', name: '切片會員' };
  await page.goto(`${base}/#/quote`);
  await page.reload();
  const { BoxGeometry, Mesh } = await import(new URL('../frontend-vue/node_modules/three/build/three.module.js', import.meta.url));
  const { STLExporter } = await import(new URL('../frontend-vue/node_modules/three/examples/jsm/exporters/STLExporter.js', import.meta.url));
  const geometry = new BoxGeometry(10, 20, 30);
  const bytes = Buffer.from(new STLExporter().parse(new Mesh(geometry), { binary: true }).buffer);
  geometry.dispose();
  await page.getByLabel('選擇 STL 模型', { exact: true }).setInputFiles({ name: 'preserved-model.stl', mimeType: 'application/octet-stream', buffer: bytes });
  await page.getByRole('button', { name: '確認設定，帶入會員資料', exact: true }).click();
  await page.locator('.quote-account .google-sign-in button').waitFor();
  await page.screenshot({ path: path.join(directory, 'quote-before-google.png'), fullPage: true });
  // Store a marker in the live page; a same-tab navigation/reload would destroy it.
  await page.evaluate(() => { window.__quoteModelState = { name: '保留的模型.stl', orientation: 90 }; });
  const popupPromise = context.waitForEvent('page');
  await page.locator('.quote-account .google-sign-in button').click();
  const popup = await popupPromise;
  await page.locator('.quote-account .account-card').getByText('切片會員').waitFor();
  assert.deepEqual(await page.evaluate(() => window.__quoteModelState), { name: '保留的模型.stl', orientation: 90 });
  assert.match(page.url(), /#\/quote$/);
  assert.ok(await page.getByText('preserved-model.stl', { exact: true }).count());
  await page.screenshot({ path: path.join(directory, 'quote-after-google.png'), fullPage: true });
  await popup.close();
  console.log('PASS quote Google sign-in in separate tab, cross-tab member update, no editor navigation/reload');

  const hidden = await context.newPage();
  await hidden.route('**/api/customer-auth/google/config', (route) => route.fulfill({ json: { enabled: false } }));
  await hidden.goto(`${base}/#/portal/login`);
  await hidden.getByPlaceholder('請輸入電子郵件', { exact: true }).waitFor();
  assert.equal(await hidden.locator('.google-sign-in').count(), 0);
  assert.deepEqual(errors, []);
  console.log(`PASS unconfigured provider hides button; no browser exceptions. Screenshots: ${directory}`);
} finally {
  await browser?.close();
  await app.close();
  // Keep only screenshots for manual review, never the synthetic database.
  await rm(path.join(directory, 'db.json'), { force: true });
  await rm(path.join(directory, 'storage'), { recursive: true, force: true });
}
