import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const css = [readFileSync('app/globals.css', 'utf8'), readFileSync('app/pos-tablet.css', 'utf8')].join('\n')
const sizes = [
  { width: 768, height: 1024 }, { width: 820, height: 1180 },
  { width: 834, height: 1194 }, { width: 1024, height: 1366 },
  { width: 1024, height: 768 }, { width: 1180, height: 820 },
  { width: 1194, height: 834 }, { width: 1307, height: 1272 },
  { width: 1366, height: 1024 },
]

test.use({ hasTouch: true })

for (const theme of ['dark', 'light']) {
  test(`R8H ${theme} keeps all PIN states in one non-overlapping row`, async ({ page }) => {
    await page.setContent(`<html data-pos-theme="${theme}"><body><main class="pos-entry-pin"><section><section><div><h1>إدخال الرقم السري</h1><p data-pin-description>أدخل رمز الموظف لفتح جلسة نقطة البيع.</p><div class="pos-pin-indicators" dir="ltr">${'<span class="pos-pin-indicator"></span>'.repeat(4)}</div><div data-pin-status>PIN مكون من 4 أرقام</div><div data-pin-keypad>${'<button>1</button>'.repeat(12)}</div></div></section></section></main></body></html>`)
    await page.evaluate((styles) => {
      const element = document.createElement('style')
      element.textContent = styles
      document.head.append(element)
    }, css)

    for (const size of sizes) {
      await page.setViewportSize(size)
      for (const entered of [0, 1, 2, 3, 4, 3, 0]) {
        await page.locator('.pos-pin-indicator').evaluateAll((dots, count) => dots.forEach((dot, index) => dot.classList.toggle('bg-cyan-300', index < count)), entered)
        const metrics = await page.locator('.pos-pin-indicators').evaluate((container) => {
          const rect = container.getBoundingClientRect()
          const dots = [...container.children].map((child) => child.getBoundingClientRect())
          const description = document.querySelector('[data-pin-description]')!.getBoundingClientRect()
          const status = document.querySelector('[data-pin-status]')!.getBoundingClientRect()
          return {
            count: dots.length,
            rows: new Set(dots.map((dot) => Math.round(dot.top))).size,
            clipped: dots.filter((dot) => dot.left < rect.left || dot.right > rect.right || dot.top < rect.top || dot.bottom > rect.bottom).length,
            overlapsDescription: dots.some((dot) => dot.top < description.bottom),
            overlapsStatus: dots.some((dot) => dot.bottom > status.top),
            width: rect.width,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          }
        })
        expect(metrics).toMatchObject({ count: 4, rows: 1, clipped: 0, overlapsDescription: false, overlapsStatus: false, width: 148, overflow: 0 })
      }
    }
  })
}
