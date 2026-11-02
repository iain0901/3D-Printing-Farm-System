// Isolated localhost fixtures. OpenAI routes are mocked or deliberately disabled.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const base = process.env.BASE_URL || 'http://127.0.0.1:8811';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Local fixtures only');
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--enable-unsafe-swiftshader'] });
  const output = mkdtempSync(join(tmpdir(), '3drfm-poster-ai-'));
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const member = await fetch(base + '/api/customer-auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Poster fixture', email: `poster-${Date.now()}@example.test`, password: 'fixture-poster-123' }) });
    assert.equal(member.status, 201);
    const { token } = await member.json();
    await page.addInitScript((t) => { localStorage.setItem('layerpilot-customer-token', t); sessionStorage.setItem('3drfm-purpose-asked', '1') }, token);
    await page.goto(base + '/#/quote');
    const { testStl } = await import(pathToFileURL(resolve(__dirname, '../api/test-helpers/stl.mjs')));
    await page.getByLabel('選擇 STL 模型', { exact: true }).setInputFiles({ name: 'poster-fixture.stl', mimeType: 'application/octet-stream', buffer: testStl() });
    await page.locator('.object-row').first().waitFor();
    await page.getByPlaceholder('用途、尺寸公差、配色說明或組裝需求').fill('室內展示支架，受力未知');
    await page.route('**/api/customer/agent/review', async (route) => {
      const body = route.request().postDataJSON();
      assert.equal(body.models.length, 1); assert.ok(body.models[0].geometryHash); assert.ok(body.models[0].triangleCount);
      assert.equal(typeof body.settings.supports, 'boolean');
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ verdict: 'insufficient_information', message: 'fixture：請確認模型外框與用途，不能保證承重', suggestedInfill: 25, suggestedWalls: 3 }) });
    });
    await page.getByRole('button', { name: '確認設定，帶入會員資料', exact: true }).click();
    await page.getByRole('button', { name: '套用建議後返回檢查', exact: true }).click();
    assert.equal(await page.getByLabel('填充率（%）', { exact: true }).inputValue(), '25');
    assert.equal(await page.getByLabel('外壁圈數', { exact: true }).inputValue(), '3');
    await page.route('**/api/customer/agent/illustration', async (route) => {
      const body = route.request().postDataJSON();
      assert.ok(body.image.startsWith('data:image/png;base64,')); assert.ok(body.image.length > 500);
      assert.equal(body.settings.infill, 25); assert.equal(body.settings.walls, 3);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB2kAAAAASUVORK5CYII=' }) });
    });
    await page.getByRole('button', { name: '生成目前模型的 AI 列印外觀預估', exact: true }).click();
    await page.getByAltText('依目前模型、配色與設定生成的 AI 外觀預估').waitFor();
    await page.getByLabel('填充率（%）', { exact: true }).fill('30');
    assert.equal(await page.getByAltText('依目前模型、配色與設定生成的 AI 外觀預估').count(), 0);
    await page.goto(base + '/#/portal/workspace?section=agent');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下載 FDM 建模 Skill 套件', exact: true }).click()]);
    assert.equal(download.suggestedFilename(), '3drfm-model-skill.zip');
    const staff = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'demo@layerpilot.test', password: 'layerpilot' }) });
    assert.equal(staff.status, 200);
    const staffToken = (await staff.json()).token;
    // UI-only Operator fixture avoids enrolling real 2FA or weakening the existing admin policy.
    await page.route('**/api/auth/me', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (body.user) body.user = { ...body.user, role: 'Operator', scopes: ['maintenance:write'] };
      else Object.assign(body, { role: 'Operator', scopes: ['maintenance:write'] });
      await route.fulfill({ response, json: body });
    });
    await page.evaluate((t) => { localStorage.setItem('layerpilot-token', t); localStorage.removeItem('layerpilot-customer-token') }, staffToken);
    await page.goto(base + '/#/maintenance/index'); await page.reload();
    await page.getByRole('heading', { name: '設備診斷與保養顧問', exact: true }).waitFor();
    await page.getByLabel('顧問機台', { exact: true }).selectOption('p3');
    await page.getByText('跨機保養資料與推估', { exact: true }).click();
    await page.getByRole('button', { name: '重新推估保養區間', exact: true }).click();
    await page.getByText('資料不足，尚不能推估。', { exact: true }).first().waitFor();
    await page.reload();
    await page.getByText('資料不足，尚不能推估。', { exact: true }).first().waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width < 768 && await page.locator('.mask').count()) {
        await page.locator('.mask').click({ position: { x: width - 20, y: 180 } });
        await page.locator('.mask').waitFor({ state: 'detached' });
      }
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: join(output, `maintenance-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, output, checks: ['paid-purpose-model-settings-review-fixture', 'applied-infill-and-walls', 'actual-current-stage-capture-fixture', 'setting-change-invalidates-preview', 'skill-ZIP-download', 'staff-forecast-insufficient-data', 'forecast-refresh-persistence', '1440-390px'] }));
  } catch (e) {
    console.error('Browser fixture status:', await page.locator('[role="status"], [role="alert"]').allTextContents());
    console.error('Browser fixture page errors:', errors);
    await page.screenshot({ path: join(output, 'failure.png'), fullPage: true });
    console.error('Fixture evidence:', output);
    throw e;
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1 });
