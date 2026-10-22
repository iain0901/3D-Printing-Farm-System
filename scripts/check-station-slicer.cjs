// Default: deterministic browser/API-contract checks. REAL_SLICE=1: actual configured Orca worker.
// Run against an isolated local test database, never a live customer endpoint.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const base = process.env.BASE_URL || 'http://127.0.0.1:8798';
const real = process.env.REAL_SLICE === '1';
const auto = real && process.env.AUTO_LAYOUT === '1';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use an isolated local test server');

async function main() {
  const threeRoot = resolve(__dirname, '../frontend-vue/node_modules/three');
  const { BoxGeometry, Mesh } = await import(pathToFileURL(join(threeRoot, 'build/three.module.js')));
  const { STLExporter } = await import(pathToFileURL(join(threeRoot, 'examples/jsm/exporters/STLExporter.js')));
  const geometry = new BoxGeometry(10, 20, 30);
  const bytes = Buffer.from(new STLExporter().parse(new Mesh(geometry), { binary: true }).buffer);
  geometry.dispose();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--enable-unsafe-swiftshader'] });
  const screenshots = mkdtempSync(join(tmpdir(), '3drfm-station-slicer-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [], forbidden = [];
    let polls = 0, submissions = 0, mode = 'success', settings, previewRequests = 0, actualPreview;
    if (real) page.on('response', async response => { if (response.url().endsWith('/layers') && response.ok()) actualPreview = (await response.json()).preview; });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/\/api\/(public\/cases|printers|queue)/.test(request.url())) forbidden.push(request.url()); });
    if (!real) await page.route('**/api/public/slicing-quotes**', async route => {
      const request = route.request();
      const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (request.method() === 'POST') {
        submissions++; polls = 0;
        assert.match(request.postDataBuffer().toString(), /"purpose":"free-print"/);
        assert.match(request.postDataBuffer().toString(), /"stationId":"nthu-shuimu"/);
        settings = JSON.parse(request.postDataBuffer().toString().match(/name="payload"\r\n\r\n([^\r]+)/)[1]);
        assert.equal(settings.material, 'PETG');
        assert.equal(settings.autoArrange, false);
        if (submissions === 1) assert.deepEqual(settings.placements, [{ x: 40, y: 50 }, { x: 90, y: 100 }]);
        if (mode === 'upload-error') return reply({ error: '切片服務暫時無法接收工作' }, 503);
        return reply({ accessToken: 'browser-test-token', slicingQuote: job('queued') }, 202);
      }
      assert.equal(request.headers()['x-slicing-token'], 'browser-test-token');
      assert.ok(!request.url().includes('token='));
      if (request.method() === 'DELETE') return reply({ slicingQuote: job('cancelled') });
      if (request.url().endsWith('/layers')) {
        previewRequests++;
        return reply({ preview: { layers: [{ z: 0.2, segments: [[0,0,10,0],[10,0,10,10]] }, { z: 0.4, segments: [[0,0,5,5]] }], truncated: false, warning: '' } });
      }
      polls++;
      return reply({ slicingQuote: job(mode === 'failed' ? 'failed' : mode === 'waiting' ? 'queued' : polls < 3 ? 'processing' : 'completed') });
    });
    function job(status) {
      return { ...settings, materialLabel: '3DSTU_PETG', id: 'slice-browser-test', status, createdAt: new Date().toISOString(), engine: 'OrcaSlicer', engineVersion: '2.4.2', profileName: '測試參考設定', totalGrams: 3, modelGrams: 2, supportGrams: 1, otherGrams: 0, estimatedMinutes: 15, warnings: [], error: status === 'failed' ? '模型超出列印範圍' : undefined };
    }
    await page.goto(base + '/#/free-print/nthu-shuimu');
    await page.getByRole('link', { name: '開啟線上切片' }).click();
    await page.waitForURL('**/slicer');
    await page.getByRole('heading', { level: 1, name: '讓模型，準備成形。' }).waitFor();
    const upload = page.getByLabel('選擇 STL 模型');
    await upload.setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') });
    await page.getByRole('alert').filter({ hasText: '請選擇非空白 STL' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '開始切片' }).isDisabled(), true);
    await upload.setInputFiles({ name: 'test-box.stl', mimeType: 'application/octet-stream', buffer: bytes });
    await page.waitForFunction(() => document.querySelector('.model-dimensions')?.textContent.includes('10.00 × 20.00 × 30.00'));
    await page.getByLabel('等比例縮放（%）').fill('50');
    await page.getByLabel('X 軸旋轉（°）').fill('90');
    await page.waitForFunction(() => document.querySelector('.model-dimensions')?.textContent.includes('5.00 × 15.00 × 10.00'));
    await page.waitForFunction(() => Number(document.querySelector('.model-viewer canvas')?.dataset.renderedTriangles) > 0);
    assert.equal(await page.locator('.fixed-material strong').innerText(), '3DSTU_PETG');
    assert.equal(await page.getByRole('combobox', { name: /^材料/ }).count(), 0);
    await page.getByLabel('自動平躺', { exact: false }).check();
    await page.waitForFunction(() => document.querySelector('.model-dimensions')?.textContent.includes('10.00 × 15.00 × 5.00'));
    await page.getByLabel('自動平躺', { exact: false }).uncheck();
    await page.waitForFunction(() => document.querySelector('.model-dimensions')?.textContent.includes('5.00 × 15.00 × 10.00'));
    await upload.setInputFiles({ name: 'second-box.stl', mimeType: 'application/octet-stream', buffer: bytes });
    await page.waitForFunction(() => document.querySelectorAll('.model-tabs button').length === 2 && document.querySelector('.model-dimensions')?.textContent.includes('10.00 × 20.00 × 30.00'));
    await page.getByRole('button', { name: '選取模型置中' }).click();
    await page.getByRole('button', { name: '1・test-box.stl', exact: true }).click();
    await page.getByRole('button', { name: '選取模型置中' }).click();
    await page.getByRole('alert').filter({ hasText: '重疊' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '開始切片' }).isDisabled(), true);
    await page.getByRole('button', { name: '自動排版', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.layout-error'));
    await page.getByLabel('中心 X（mm）').fill('40');
    await page.getByLabel('中心 Y（mm）').fill('50');
    const model = page.getByRole('button', { name: /^模型 1：/ });
    await model.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByLabel('中心 X（mm）').inputValue(), '41');
    const box = await model.boundingBox();
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width/2 + 15, box.y + box.height/2 - 15); await page.mouse.up();
    assert.notEqual(await page.getByLabel('中心 X（mm）').inputValue(), '41');
    await page.getByLabel('中心 X（mm）').fill('1');
    await page.getByRole('alert').filter({ hasText: '邊界' }).waitFor();
    await page.getByLabel('中心 X（mm）').fill('40'); await page.getByLabel('中心 Y（mm）').fill('50');
    await page.getByRole('button', { name: '2・second-box.stl', exact: true }).click();
    await page.getByLabel('中心 X（mm）').fill('90'); await page.getByLabel('中心 Y（mm）').fill('100');
    await page.getByLabel('交由切片器自動選擇擺放方向').check();
    assert.equal(await page.getByLabel('切片時由 Orca 自動排版').isChecked(), true);
    await page.getByLabel('切片時由 Orca 自動排版').uncheck();
    assert.equal(await page.getByLabel('交由切片器自動選擇擺放方向').isChecked(), false);
    await page.locator('.model-viewer-overlay').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => Number(document.querySelector('.model-viewer canvas')?.dataset.renderedTriangles) > 0);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}`);
      if ([1440,390].includes(width)) {
        await page.locator('#nprogress').waitFor({ state: 'detached' });
        await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0,0); });
        await page.screenshot({ path: join(screenshots, `workspace-${width}.png`), fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    if (auto) await page.getByLabel('交由切片器自動選擇擺放方向').check();
    await page.getByRole('button', { name: '開始切片' }).click();
    await page.locator('.slice-job-status').waitFor();
    await page.reload();
    await page.getByText('切片完成', { exact: true }).waitFor({ timeout: real ? 180000 : 20000 });
    await page.locator('.layer-preview path').waitFor();
    assert.ok((await page.locator('.layer-preview path').getAttribute('d')).length > 0);
    assert.match(await page.locator('.slice-metrics').innerText(), /g/);
    const slider = page.getByLabel('選擇層數', { exact: true });
    await slider.focus(); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.layer-heading span')?.textContent.includes('第 2'));
    if (real && !auto) {
      assert.ok(actualPreview);
      const layer = actualPreview.layers.find(layer => Math.abs(layer.z - 0.4) < 0.001);
      assert.ok(layer.segments.some(([x,y]) => x > 37 && x < 43 && y > 42 && y < 58), 'first model must retain its manual position');
      assert.ok(layer.segments.some(([x,y]) => x > 84 && x < 96 && y > 89 && y < 111), 'second model must retain its manual position');
      assert.ok(layer.segments.every(([x,y]) => x > 36 && x < 97 && y > 41 && y < 112), 'CLI must not recenter the manual layout');
    }
    if (!real) { assert.equal(submissions, 1); assert.ok(previewRequests >= 1); }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('#nprogress').waitFor({ state: 'detached' });
      await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0,0); });
      await page.screenshot({ path: join(screenshots, `slicer-${real ? 'real' : 'contract'}-${width}.png`), fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    if (!real) {
      await page.getByRole('combobox', { name: /^層高/ }).selectOption('0.16');
      assert.equal(await page.locator('.slice-metrics').count(), 0, 'edited settings must invalidate old results');
      await upload.setInputFiles({ name: 'retry.stl', mimeType: 'application/octet-stream', buffer: bytes });
      await page.waitForFunction(() => !!document.querySelector('.model-dimensions'));
      mode = 'failed';
      await page.getByRole('button', { name: '開始切片' }).click();
      await page.getByText('切片失敗', { exact: true }).waitFor();
      assert.equal(await page.locator('.slice-metrics').count(), 0);
      mode = 'upload-error';
      await page.getByRole('button', { name: '開始切片' }).click();
      await page.getByRole('alert').filter({ hasText: '切片服務暫時無法接收工作' }).waitFor();
      mode = 'waiting';
      await page.getByRole('button', { name: '開始切片' }).click();
      await page.getByRole('button', { name: '取消這次工作' }).click();
      await page.getByText('已取消切片', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '開始切片' }).isEnabled(), true);
      await page.getByRole('button', { name: '移除選取模型' }).click();
      await page.waitForFunction(() => document.querySelectorAll('.model-tabs button').length === 0);
      assert.equal(await page.getByRole('button', { name: '開始切片' }).isDisabled(), true);
    }
    assert.deepEqual(forbidden, []);
    assert.deepEqual(errors, []);
    console.log(`PASS ${auto ? 'REAL Orca automatic orientation and arrangement' : real ? 'REAL Orca slice and exact two-object placement' : 'browser API contracts, failed job and upload recovery'}: locked 3DSTU_PETG, multi-model layout, drag and keyboard placement, auto packing, rotation, lay-flat, boundaries, STL transforms, 3D rendering, session resume, layer slider, responsive UI`);
    console.log(screenshots);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
