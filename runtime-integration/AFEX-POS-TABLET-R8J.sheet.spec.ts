import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const css = [readFileSync('app/globals.css', 'utf8'), readFileSync('app/pos-tablet.css', 'utf8')].join('\n')
const sizes = [
  { width: 768, height: 1024 }, { width: 820, height: 1180 },
  { width: 834, height: 1194 }, { width: 1024, height: 1366 },
  { width: 1024, height: 768 }, { width: 1180, height: 820 },
  { width: 1194, height: 834 }, { width: 1366, height: 1024 },
]
const evidence = 'C:/AFEX-Evidence/R8J-AUTOMATION-SCREENSHOTS'
mkdirSync(evidence, { recursive: true })

const card = (index: number) => `<article class="pos-history-card"><div class="pos-history-card-top"><div><small>رقم الطلب / الفاتورة</small><strong>01-${String(index).padStart(4, '0')}</strong></div><span>قيد التنفيذ</span></div><dl><div><dt>العميل</dt><dd>اسم عميل طويل لا يضغط البطاقة أو التاريخ</dd></div><div><dt>التاريخ والوقت</dt><dd>18/08/2026 15:00</dd></div><div><dt>الإجمالي</dt><dd>276 ر.س</dd></div></dl><button>عرض التفاصيل</button></article>`
const lines = Array.from({ length: 30 }, (_, index) => `<div><div><b>خدمة ${index + 1}</b><span>1 × 23 ر.س</span></div><strong>23 ر.س</strong></div>`).join('')

test.use({ hasTouch: true })

for (const theme of ['dark', 'light']) {
  test(`R8J ${theme} qualifies the grid and same-page curtain tablet matrix`, async ({ page, browserName }) => {
    await page.setContent(`<html data-pos-theme="${theme}" dir="rtl"><body><div class="pos-order-history-page"><main><div class="pos-order-history-controls"><h1>سجل الطلبات</h1></div><div class="pos-order-history-scroll"><section class="pos-history-grid">${Array.from({ length: 20 }, (_, index) => card(index + 1)).join('')}</section></div></main><div class="pos-invoice-sheet-backdrop"><section class="pos-invoice-sheet" role="dialog" aria-modal="true" aria-labelledby="title"><header><div><small>تفاصيل الطلب</small><h2 id="title">01-0001</h2></div><button aria-label="إغلاق تفاصيل الطلب">إغلاق</button></header><div class="pos-invoice-sheet-body"><section class="pos-invoice-lines">${lines}</section><section class="pos-invoice-payment"><div><span>طريقة الدفع</span><b>نقدي</b></div><div class="pos-invoice-cash-details"><div><span>المبلغ المستلم</span><b>300</b></div><div><span>المبلغ المطبق</span><b>276</b></div><div><span>الباقي</span><b>24</b></div></div></section></div></section></div></div></body></html>`)
    await page.evaluate((styles) => {
      const element = document.createElement('style')
      element.textContent = styles
      document.head.append(element)
      document.body.style.overflow = 'hidden'
    }, css)
    await page.locator('.pos-invoice-sheet').evaluate(async (element) => { await Promise.all(element.getAnimations().map((animation) => animation.finished)) })

    for (const size of sizes) {
      await page.setViewportSize(size)
      const metrics = await page.evaluate(() => {
        const sheet = document.querySelector<HTMLElement>('.pos-invoice-sheet')!
        const body = document.querySelector<HTMLElement>('.pos-invoice-sheet-body')!
        const grid = document.querySelector<HTMLElement>('.pos-history-grid')!
        const close = sheet.querySelector<HTMLButtonElement>('button')!
        const sheetRect = sheet.getBoundingClientRect()
        const closeRect = close.getBoundingClientRect()
        const center = document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2)
        const owners = [...sheet.querySelectorAll<HTMLElement>('*')].filter((node) => /(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight)
        return {
          columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          top: Math.abs(Math.round(sheetRect.top)), bottom: Math.abs(Math.round(innerHeight - sheetRect.bottom)), right: Math.abs(Math.round(innerWidth - sheetRect.right)),
          sheetWidth: Math.round(sheetRect.width), viewportWidth: innerWidth,
          scrollOwners: owners.length, bodyOwnsScroll: owners[0] === body,
          backgroundLocked: getComputedStyle(document.querySelector<HTMLElement>('.pos-order-history-scroll')!).overflowY === 'hidden',
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          closeHeight: closeRect.height, closeClickable: center === close || close.contains(center),
        }
      })
      const landscape = size.width > size.height
      expect(metrics.columns).toBe(landscape ? 4 : 2)
      expect(metrics).toMatchObject({ top: 0, bottom: 0, right: 0, scrollOwners: 1, bodyOwnsScroll: true, backgroundLocked: true, overflow: 0, closeHeight: 44, closeClickable: true })
      if (landscape) {
        expect(metrics.sheetWidth).toBeLessThan(metrics.viewportWidth)
        expect(metrics.sheetWidth).toBeGreaterThanOrEqual(520)
        expect(metrics.sheetWidth).toBeLessThanOrEqual(680)
      } else expect(metrics.sheetWidth).toBe(metrics.viewportWidth)
    }

    for (const size of [{ width: 1194, height: 834 }, { width: 834, height: 1194 }]) {
      await page.setViewportSize(size)
      await page.screenshot({ path: `${evidence}/${browserName}-${theme}-${size.width}x${size.height}.png`, fullPage: false })
    }
  })
}
