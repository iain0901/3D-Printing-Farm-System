// Local fixtures only. Simulates the worker result; does not run Orca, OpenAI or printer commands.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const base = process.env.BASE_URL || 'http://127.0.0.1:8812';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Local fixture server only');
const worker = { 'x-layerpilot-worker-token': 'hi-local-worker-fixture' };
async function main() {
  const configuration = await (await fetch(base + '/api/public/slicing-quotes/config')).json();
  assert.equal(configuration.profileBundle?.version, 'synthetic-fixture-v1', 'must be an isolated synthetic profile');
  const member = await fetch(base + '/api/customer-auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Profile fixture', email: `hi-${Date.now()}@example.test`, password: 'hi-fixture-123' }) });
  assert.equal(member.status, 201); const { token } = await member.json();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], output = mkdtempSync(join(tmpdir(), '3drfm-hi-browser-evidence-'));
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.addInitScript((t) => { localStorage.setItem('layerpilot-customer-token', t); sessionStorage.setItem('3drfm-purpose-asked', '1') }, token);
    await page.goto(base + '/#/quote');
    const { testStl } = await import(pathToFileURL(resolve(__dirname, '../api/test-helpers/stl.mjs')));
    await page.getByLabel('選擇 STL 模型', { exact: true }).setInputFiles({ name: 'hi-fixture.stl', mimeType: 'application/octet-stream', buffer: testStl() });
    const submit = page.getByRole('button', { name: '切片並取得 NT$2／克報價', exact: true });
    await submit.waitFor();
    const [created] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/public/slicing-quotes') && r.request().method() === 'POST'), submit.click()]);
    assert.equal(created.status(), 202); const payload = await created.json();
    assert.equal(payload.slicingQuote.profileBundle.machine, 'Creality Hi');
    assert.equal(payload.slicingQuote.materialLabel, '3DSTU_PETG');
    const claim = await fetch(base + '/api/internal/orca/jobs/claim', { method: 'POST', headers: { ...worker, 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await claim.json()).job.id, payload.slicingQuote.id);
    const form = new FormData();
    for (const [key, value] of Object.entries({ estimatedMinutes: '142', modelGrams: '40.5', supportGrams: '6.25', otherGrams: '1.75', totalGrams: '48.5',
      profileName: 'Creality Hi synthetic fixture', profileBundle: JSON.stringify(configuration.profileBundle), effectiveProfileHashes: JSON.stringify(configuration.profileBundle.hashes), workerVersion: '2.4.2' })) form.append(key, value);
    form.append('file', new Blob(['; synthetic local worker fixture only\n; printer_model = Creality Hi\n; nozzle_diameter = 0.4\n; filament_type = PETG\nG1 X1 E1\n']), 'fixture.gcode');
    const measured = await fetch(base + `/api/internal/orca/jobs/${payload.slicingQuote.id}/result`, { method: 'POST', headers: worker, body: form });
    assert.equal(measured.status, 200); assert.equal((await measured.json()).slicingQuote.price, 97);
    await page.locator('.quote-not-ready strong').filter({ hasText: 'NT$ 97' }).waitFor();
    await page.getByRole('button', { name: '確認設定，帶入會員資料', exact: true }).click();
    await page.getByRole('checkbox', { name: /我已確認材料、尺寸與配色/ }).check();
    const [submitted] = await Promise.all([page.waitForResponse((r) => /\/drafts\/[^/]+\/submit$/.test(r.url())), page.getByRole('button', { name: '送交確認本次切片報價', exact: true }).click()]);
    const caseResult = await submitted.json();
    assert.equal(submitted.status(), 201, JSON.stringify(caseResult));
    assert.equal(caseResult.case.slicingQuote.price, 97);
    assert.equal(caseResult.case.slicingQuote.profileBundle.version, 'synthetic-fixture-v1');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
      await page.screenshot({ path: join(output, `quote-${width}.png`), fullPage: true });
    }
    await page.getByLabel('填充率（%）', { exact: true }).fill('20');
    assert.equal(await page.getByRole('button', { name: '送交確認本次切片報價', exact: true }).count(), 0);
    assert.equal(await page.locator('.quote-not-ready strong').filter({ hasText: 'NT$ 97' }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, output, scope: 'synthetic-worker-not-real-Orca', checks: ['real-public-quote-request', 'pinned-Creality-Hi-profile', '48.5g-times-2-equals-97', 'draft-model-settings-verified', 'case-persists-slice-version-and-price', 'edited-settings-clear-old-price', '1440-390px'] }));
  } catch (e) {
    console.error('Fixture errors:', errors, await page.locator('[role="alert"]').allTextContents());
    await page.screenshot({ path: join(output, 'failure.png'), fullPage: true }); console.error(output); throw e;
  } finally { await browser.close() }
}
main().catch((e) => { console.error(e); process.exitCode = 1 });
