const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { default: AxeBuilder } = require(process.env.AXE_MODULE || '@axe-core/playwright')
const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const base = process.env.BASE_URL || 'http://127.0.0.1:5174'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
async function main() {
  const { publicPages } = await import('../src/content/publicPages.mjs')
  const { services, audiences } = await import('../src/content/fdmServices.mjs')
  const routes = [...new Set(['/', '/services', '/portal/login', '/quote', '/cloud-slicer', '/free-print', ...publicPages.map((page) => page.path), ...services.map((service) => `/services/${service.id}`), ...audiences.map((audience) => `/for/${audience.id}`)])]
  const browser = await chromium.launch()
  const results = []
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } })
      const page = await context.newPage()
      for (const route of routes) {
        await page.goto(`${base}/#${route}`)
        await page.locator('h1').first().waitFor()
        const audit = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
        results.push({ route, width, violations: audit.violations, incomplete: audit.incomplete })
      }
      await context.close()
    }
  } finally { await browser.close() }
  const output = resolve(process.env.UI_REVIEW_OUTPUT || 'collaboration/evidence/2026-10-25-ui')
  mkdirSync(output, { recursive: true })
  writeFileSync(`${output}/contrast.json`, JSON.stringify(results, null, 2) + '\n')
  assert.ok(results.every((result) => result.violations.length === 0), 'Contrast violations; see contrast.json')
  console.log(`Passed ${results.length} axe color-contrast audits (incomplete items still need human review).`)
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
