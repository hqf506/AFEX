import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')
const viewports = [
  { width: 1440, height: 1024 }, { width: 1180, height: 820 }, { width: 1024, height: 768 },
  { width: 834, height: 1194 }, { width: 768, height: 1024 }, { width: 430, height: 932 },
  { width: 390, height: 844 }, { width: 375, height: 812 }, { width: 360, height: 800 },
  { width: 844, height: 390 },
]

const card = (kind: string, action: string) => `<article class="pos-history-card" data-kind="${kind}"><div class="pos-history-card-top"><div><small>رقم الطلب / الفاتورة</small><strong>01-0009</strong></div><span>قيد التنفيذ</span></div><dl><div class="is-customer"><dt>العميل</dt><dd>عميل اختبار طويل</dd></div><div><dt>التاريخ والوقت</dt><dd>17/08/2026 12:00</dd></div><div class="is-total"><dt>الإجمالي</dt><dd>276 ر.س</dd></div></dl><button data-action="${kind}">${action}</button></article>`
const markup = `<!doctype html><html data-pos-theme="dark" dir="rtl"><body>
<section class="pos-invoice-history pos-order-status-workflow"><main><header class="pos-history-header"><div class="pos-history-heading"><span></span><div><h1>حالة الطلبات</h1><p>workflow</p></div></div><button>←</button></header><div class="pos-status-columns"><section class="pos-status-column"><header><span>قيد التنفيذ</span><b>1</b></header><div>${card('status', 'نقل إلى جاهز')}</div></section><section class="pos-status-column"><header><span>جاهز</span><b>1</b></header><div>${card('status-ready', 'تم التسليم')}</div></section></div></main></section>
<section class="pos-invoice-history"><main><header class="pos-history-header"><div class="pos-history-heading"><span></span><div><h1>سجل الطلبات</h1><p>آخر 48 ساعة</p></div></div><button>←</button></header><section class="pos-history-grid">${card('history', 'عرض التفاصيل')}</section></main></section>
<section class="pos-invoice-history"><main><header class="pos-history-header"><div class="pos-history-heading"><span></span><div><h1>آخر الفواتير</h1><p>كامل السجل</p></div></div><button>←</button></header><section class="pos-history-grid">${card('invoice', 'عرض التفاصيل')}</section></main></section>
</body></html>`

for (const viewport of viewports) for (const theme of ['dark', 'light']) {
  test(`${viewport.width}x${viewport.height} ${theme} three-way separation`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.setContent(markup)
    await page.evaluate((styles) => { const element = document.createElement('style'); element.textContent = styles; document.head.append(element) }, css)
    await page.evaluate((value) => document.documentElement.dataset.posTheme = value, theme)
    const metrics = await page.evaluate(() => {
      const controls = [...document.querySelectorAll<HTMLElement>('button, a')].filter((el) => getComputedStyle(el).display !== 'none')
      const clipped = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth || r.width === 0 || r.height === 0 })
      const undersized = controls.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44 })
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        clipped: clipped.length,
        undersized: undersized.length,
        statusActions: document.querySelectorAll('[data-kind^="status"] [data-action]').length,
        historyStatusActions: document.querySelectorAll('[data-kind="history"] [data-action="status"]').length,
        invoiceStatusActions: document.querySelectorAll('[data-kind="invoice"] [data-action="status"]').length,
      }
    })
    expect(metrics).toEqual({ overflow: 0, clipped: 0, undersized: 0, statusActions: 2, historyStatusActions: 0, invoiceStatusActions: 0 })
  })
}

test('portrait landscape portrait retains geometry without reload', async ({ page }) => {
  await page.setContent(markup)
  await page.evaluate((styles) => { const element = document.createElement('style'); element.textContent = styles; document.head.append(element) }, css)
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped: [...document.querySelectorAll<HTMLElement>('button')].filter((el) => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth }).length,
    }))
    expect(metrics).toEqual({ overflow: 0, clipped: 0 })
  }
})
