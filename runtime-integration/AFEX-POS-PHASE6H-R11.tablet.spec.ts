import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')
const viewports = [
  { width: 768, height: 1024 }, { width: 810, height: 1080 }, { width: 820, height: 1180 },
  { width: 834, height: 1194 }, { width: 1024, height: 1366 }, { width: 1024, height: 768 },
  { width: 1080, height: 810 }, { width: 1180, height: 820 }, { width: 1194, height: 834 },
  { width: 1366, height: 1024 },
]

const cards = Array.from({ length: 36 }, (_, index) => `<article class="pos-history-card" style="min-height:220px"><strong>02-${String(index + 1).padStart(4, '0')}</strong><button>عرض التفاصيل</button></article>`).join('')
const markup = `<!doctype html><html data-pos-theme="dark" dir="rtl" style="height:100%"><body style="height:100%;margin:0"><div class="pos-shell-viewport" style="height:100%"><div class="pos-shell-inner"><div class="afex-pos-app-shell is-pos-subroute"><header class="afex-pos-responsive-header"><strong>نقطة البيع</strong><button>القائمة</button></header><div class="afex-pos-shell-content"><div class="afex-pos-route-content"><section class="pos-invoice-history pos-invoices-page"><main><div class="pos-invoices-controls"><header class="pos-history-header"><h1>آخر الفواتير</h1><button>رجوع</button></header><div class="pos-history-tools"><input aria-label="بحث"><button>تحديث</button></div></div><div class="pos-invoices-scroll"><section class="pos-history-grid">${cards}</section></div></main></section></div></div></div></div></div></body></html>`

async function install(page: Page, viewport: { width: number, height: number }, theme: 'light' | 'dark') {
  await page.setViewportSize(viewport)
  await page.setContent(markup)
  await page.evaluate((styles) => { const style = document.createElement('style'); style.textContent = styles; document.head.append(style) }, css)
  await page.evaluate((value) => { document.documentElement.dataset.posTheme = value }, theme)
}

for (const viewport of viewports) for (const theme of ['light', 'dark'] as const) {
  test(`${viewport.width}x${viewport.height} ${theme} tablet invoice geometry`, async ({ page }) => {
    await install(page, viewport, theme)
    const result = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.pos-invoices-scroll')!
      const controls = document.querySelector<HTMLElement>('.pos-invoices-controls')!
      const before = controls.getBoundingClientRect()
      list.scrollTop = 500
      const after = controls.getBoundingClientRect()
      const interactive = [...document.querySelectorAll<HTMLElement>('.pos-invoices-controls button, .pos-invoices-controls input')].filter((element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 })
      const clipped = interactive.filter((element) => { const rect = element.getBoundingClientRect(); return rect.left < 0 || rect.right > innerWidth || rect.top < 0 || rect.bottom > innerHeight }).length
      const undersized = interactive.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width < 44 || rect.height < 44 }).length
      const owners = [...document.querySelectorAll<HTMLElement>('*')].filter((element) => /(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1)
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        documentScroll: scrollY,
        owners: owners.length,
        controlsFixed: Math.abs(before.top - after.top) < .5,
        clipped,
        undersized,
      }
    })
    expect(result).toEqual({ overflow: 0, documentScroll: 0, owners: 1, controlsFixed: true, clipped: 0, undersized: 0 })
  })
}

test('portrait landscape portrait remains bounded without reload', async ({ page }) => {
  await page.setContent(markup)
  await page.evaluate((styles) => { const style = document.createElement('style'); style.textContent = styles; document.head.append(style) }, css)
  const path = await page.evaluate(() => location.pathname)
  for (const viewport of [{ width: 834, height: 1194 }, { width: 1194, height: 834 }, { width: 834, height: 1194 }]) {
    await page.setViewportSize(viewport)
    const result = await page.evaluate(() => ({ path: location.pathname, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, documentScroll: scrollY }))
    expect(result).toEqual({ path, overflow: 0, documentScroll: 0 })
  }
})
