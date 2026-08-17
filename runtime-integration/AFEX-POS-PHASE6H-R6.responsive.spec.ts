import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')
const viewports = [
  { width: 1440, height: 1024 }, { width: 1280, height: 800 }, { width: 1024, height: 768 },
  { width: 834, height: 1194 }, { width: 768, height: 1024 }, { width: 430, height: 932 },
  { width: 393, height: 852 }, { width: 390, height: 844 }, { width: 375, height: 812 }, { width: 360, height: 800 },
  { width: 320, height: 568 }, { width: 844, height: 390 },
]

const markup = `<!doctype html><html data-pos-theme="dark" dir="rtl"><body><div class="pos-invoice-history"><main><header class="pos-history-header"><div class="pos-history-heading"><span></span><div><h1>آخر الفواتير</h1><p>السجل</p></div></div><button aria-label="العودة">←</button></header><div class="pos-history-tools"><label><input placeholder="بحث"></label><button>تحديث</button></div><section class="pos-history-grid"><article class="pos-history-card"><div class="pos-history-card-top"><div><small>رقم الفاتورة</small><strong>01-0001</strong></div><span>مدفوعة</span></div><dl><div class="is-customer"><dt>العميل</dt><dd>اسم عميل طويل لا يكسر حدود البطاقة</dd></div><div><dt>التاريخ والوقت</dt><dd>17/08/2026 12:00</dd></div><div class="is-total"><dt>الإجمالي</dt><dd>276 ر.س</dd></div></dl><button data-testid="details"><svg></svg><span>عرض التفاصيل</span></button></article></section><div class="pos-invoice-cash-details"><div><span>المبلغ المستلم من العميل</span><b>300 ر.س</b></div><div><span>المبلغ المطبق على الطلب</span><b>276 ر.س</b></div><div><span>الباقي للعميل</span><b>24 ر.س</b></div></div></main></div><div class="pos-settings-page"><main class="pos-settings-panel"><header class="pos-settings-header"><div><p>AFEX</p><h1>إعدادات نقطة البيع</h1><span>إدارة الجلسة</span></div><a href="/pos" data-testid="close"><span>←</span><b>العودة إلى نقطة البيع</b></a></header><section class="pos-settings-section"><div class="pos-settings-section-heading"><div><h2>المظهر</h2><p>فاتح وداكن</p></div><button class="afex-pos-theme-toggle">المظهر</button></div></section><section class="pos-settings-section"><nav class="pos-settings-links"><a href="#"><svg></svg><span><b>عملية بيع جديدة</b><small>اختيار العميل</small></span><i>←</i></a><a href="#"><svg></svg><span><b>الطلبات والفواتير</b><small>عرض السجل</small></span><i>←</i></a><a href="#"><svg></svg><span><b>المسودات</b><small>إدارة المسودات</small></span><i>←</i></a></nav></section></main></div></body></html>`

for (const viewport of viewports) for (const theme of ['dark', 'light']) {
  test(`${viewport.width}x${viewport.height} ${theme}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.setContent(markup)
    await page.evaluate((styles) => {
      const element = document.createElement('style')
      element.textContent = styles
      document.head.append(element)
    }, css)
    await page.evaluate((value) => document.documentElement.dataset.posTheme = value, theme)
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement
      const visible = [...document.querySelectorAll<HTMLElement>('button, a')].filter((el) => getComputedStyle(el).display !== 'none')
      const clipped = visible.filter((el) => { const r = el.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth || r.top < 0 || r.width === 0 || r.height === 0 })
      const undersized = visible.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 44 || r.height < 44 })
      const card = document.querySelector('.pos-history-card')!.getBoundingClientRect()
      const history = document.querySelector('.pos-invoice-history')!.getBoundingClientRect()
      const cash = [...document.querySelectorAll<HTMLElement>('.pos-invoice-cash-details > div')].map((el) => el.getBoundingClientRect())
      const cashOverlaps = cash.some((a, index) => cash.some((b, other) => other > index && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top))
      return { overflow: doc.scrollWidth - doc.clientWidth, clipped: clipped.length, undersized: undersized.length, cardWidth: card.width, bottomGap: history.bottom - document.querySelector('.pos-invoice-cash-details')!.getBoundingClientRect().bottom, cashCount: cash.length, cashOverlaps }
    })
    expect(metrics.overflow).toBeLessThanOrEqual(0)
    expect(metrics.clipped).toBe(0)
    expect(metrics.undersized).toBe(0)
    expect(metrics.cardWidth).toBeGreaterThan(0)
    expect(metrics.bottomGap).toBeLessThan(40)
    expect(metrics.cashCount).toBe(3)
    expect(metrics.cashOverlaps).toBe(false)
    for (const id of ['details', 'close']) {
      const control = page.getByTestId(id)
      await expect(control).toBeVisible()
      const box = await control.boundingBox(); expect(box).not.toBeNull()
      await control.click({ trial: true, position: { x: box!.width / 2, y: box!.height / 2 } })
    }
  })
}

test('portrait landscape portrait remains bounded without reload', async ({ page }) => {
  await page.setContent(markup)
  await page.evaluate((styles) => { const element = document.createElement('style'); element.textContent = styles; document.head.append(element) }, css)
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  }
})
