import { expect, test, type Page } from '@playwright/test'

const baseURL = 'http://127.0.0.1:3100'
const viewports = [{ width: 430, height: 932 }, { width: 393, height: 852 }, { width: 390, height: 844 }, { width: 375, height: 812 }, { width: 360, height: 800 }, { width: 320, height: 568 }, { width: 844, height: 390 }]

async function loadCss(page: Page) {
  await page.goto('/pos/login')
  const css = await page.evaluate(async () => (await Promise.all([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((link) => fetch(link.href).then((response) => response.text())))).join('\n'))
  await page.goto('about:blank')
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><body></body>')
  await page.addStyleTag({ content: css })
}

async function renderHeader(page: Page, title: string) {
  await page.evaluate((heading) => {
    document.body.innerHTML = `<div class="afex-pos-app-shell is-pos-subroute is-sale-route" dir="rtl"><header class="afex-pos-sale-header"><a href="#step" aria-label="الرجوع من ${heading}">‹</a><button type="button" class="afex-pos-sale-home" aria-label="العودة إلى نقطة البيع"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z M8 9h8 M8 13h5"></path></svg><span>نقطة البيع</span></button><strong>${heading}</strong><button type="button" class="afex-pos-theme-toggle"><span>◐</span><b>المظهر</b></button></header></div>`
  }, title)
}

test.describe('Phase 6F-R2 sale home geometry', () => {
  test.use({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
  for (const mode of ['light', 'dark'] as const) for (const viewport of viewports) {
    test(`${mode} ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode }); await page.setViewportSize(viewport); await loadCss(page)
      for (const title of ['اختيار العميل', 'اختيار المنتجات', 'الدفع وإتمام الطلب']) {
        await renderHeader(page, title)
        const boxes = await page.locator('.afex-pos-sale-header > *').evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } }))
        expect(boxes).toHaveLength(4)
        for (const box of boxes) { expect(box.left).toBeGreaterThanOrEqual(-1); expect(box.right).toBeLessThanOrEqual(viewport.width + 1) }
        const home = boxes[1]; expect(home.width).toBeGreaterThanOrEqual(44); expect(home.height).toBeGreaterThanOrEqual(44)
        for (let index = 0; index < boxes.length; index += 1) for (let other = index + 1; other < boxes.length; other += 1) {
          const overlapX = Math.min(boxes[index].right, boxes[other].right) - Math.max(boxes[index].left, boxes[other].left)
          const overlapY = Math.min(boxes[index].bottom, boxes[other].bottom) - Math.max(boxes[index].top, boxes[other].top)
          expect(overlapX > 0 && overlapY > 0).toBe(false)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
      }
    })
  }
})
