// Presentation-only smoke review. Never submits forms or calls hardware commands.
// PLAYWRIGHT_MODULE=/path/to/playwright BASE_URL=http://127.0.0.1:5174 node frontend-vue/tests/public-ui-review.cjs
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const base = process.env.BASE_URL || 'http://127.0.0.1:5174'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local review only')
const output = resolve(process.env.UI_REVIEW_OUTPUT || 'collaboration/evidence/2026-10-25-ui')
mkdirSync(output, { recursive: true })
async function main() {
  const { publicPages } = await import('../src/content/publicPages.mjs')
  const { services, audiences } = await import('../src/content/fdmServices.mjs')
  const routes = [...new Set([
    '/', '/services', '/materials', '/process', '/portal/login', '/quote', '/cloud-slicer', '/free-print',
    ...publicPages.map((page) => page.path),
    ...services.map((service) => `/services/${service.id}`),
    ...audiences.map((audience) => `/for/${audience.id}`),
  ])]
  const results = []
  for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
    const browser = await browserType.launch()
    try {
      for (const width of [1440, 390, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } })
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        for (const route of routes) {
          await page.goto(`${base}/#${route}`)
          await page.locator('h1').first().waitFor()
          await page.evaluate(() => document.fonts.ready)
          const metrics = await page.evaluate(() => ({
            viewport: innerWidth,
            width: document.documentElement.scrollWidth,
            heading: document.querySelector('h1')?.textContent.trim(),
            internalArrows: [...document.querySelectorAll('a:not([target="_blank"])')].filter((a) => a.textContent.includes('↗') && a.origin === location.origin).length,
          }))
          assert.ok(metrics.width <= width + 1, `${engine} ${width} ${route}: overflow ${metrics.width}`)
          assert.equal(metrics.internalArrows, 0)
          if (route === '/') {
            assert.equal(await page.locator('.material-tabs button').count(), 6)
            await page.locator('.material-question select').selectOption('4')
            await page.locator('.material-selected').filter({ hasText: 'TPU' }).waitFor()
          }
          if (route === '/portal/login') {
            await page.locator('.guest-estimate').waitFor()
            assert.equal(await page.locator('input[type="password"]').count(), 1)
            await page.locator('input[type="password"]').fill('ui-review-only')
            await page.locator('.el-input__password').click()
            assert.equal(await page.locator('input[type="password"]').count(), 0)
            await page.locator('.el-input__password').click()
            await page.locator('input[type="password"]').fill('')
          }
          if (route === '/cloud-slicer') {
            await page.locator('.file-menu summary').click()
            await page.getByRole('button', { name: '開啟專案', exact: true }).waitFor()
            assert.equal(await page.locator('.lab-machine details').getAttribute('open'), null)
            await page.locator('.file-menu summary').click()
            const infill = await page.getByLabel('切片填充密度', { exact: true }).inputValue()
            await page.getByLabel('切片層高', { exact: true }).selectOption('0.12')
            assert.equal(await page.getByLabel('切片填充密度', { exact: true }).inputValue(), infill)
          }
          results.push({ engine, width, route, ...metrics })
          if (engine === 'chromium' && width !== 320 && ['/', '/materials', '/cloud-slicer', '/portal/login'].includes(route)) {
            await page.locator('img[loading="lazy"]').evaluateAll((images) => images.forEach((img) => img.loading = 'eager'))
            await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))))
            await page.screenshot({ path: `${output}/${width}-${route.replaceAll('/', '') || 'home'}.png`, fullPage: true })
          }
        }
        assert.deepEqual(errors, [], `${engine} ${width}: JavaScript errors`)
        await page.close()
      }
    } finally { await browser.close() }
  }
  writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2) + '\n')
  console.log(`Passed ${results.length} page/engine/viewport checks; ${output}`)
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
