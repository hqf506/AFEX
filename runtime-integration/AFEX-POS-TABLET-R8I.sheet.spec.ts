import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const css = [readFileSync('app/globals.css', 'utf8'), readFileSync('app/pos-tablet.css', 'utf8')].join('\n')
const sizes = [
  { width: 768, height: 1024 }, { width: 820, height: 1180 },
  { width: 834, height: 1194 }, { width: 1024, height: 1366 },
  { width: 1024, height: 768 }, { width: 1180, height: 820 },
  { width: 1194, height: 834 }, { width: 1366, height: 1024 },
]

const lines = Array.from({ length: 40 }, (_, index) => `<div><div><b>خدمة ${index + 1}</b><span>1 × 23 ر.س</span></div><strong>23 ر.س</strong></div>`).join('')

test.use({ hasTouch: true })

for (const theme of ['dark', 'light']) {
  test(`R8I ${theme} sheet fills every tablet viewport with one scroll owner`, async ({ page }) => {
    await page.setContent(`<html data-pos-theme="${theme}" dir="rtl"><body><div class="pos-order-history-page"><main style="height:2000px"></main><div class="pos-invoice-sheet-backdrop"><section class="pos-invoice-sheet" role="dialog" aria-modal="true" aria-labelledby="title"><header><div><small>تفاصيل الطلب</small><h2 id="title">01-0009</h2></div><button aria-label="إغلاق تفاصيل الطلب">إغلاق</button></header><div class="pos-invoice-sheet-body"><section class="pos-invoice-lines">${lines}</section><section class="pos-invoice-totals"><div><span>الإجمالي</span><b>276 ر.س</b></div></section><section class="pos-invoice-payment"><div><span>طريقة الدفع</span><b>نقدي</b></div><div class="pos-invoice-cash-details"><div><span>المبلغ المستلم</span><b>300</b></div><div><span>المبلغ المطبق</span><b>276</b></div><div><span>الباقي</span><b>24</b></div></div></section></div></section></div></div></body></html>`)
    await page.evaluate((styles) => {
      const element = document.createElement('style')
      element.textContent = styles
      document.head.append(element)
      document.body.style.overflow = 'hidden'
    }, css)

    for (const size of sizes) {
      await page.setViewportSize(size)
      const dialog = page.getByRole('dialog', { name: '01-0009' })
      await expect(dialog).toBeVisible()
      const metrics = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const body = element.querySelector<HTMLElement>('.pos-invoice-sheet-body')!
        const close = element.querySelector<HTMLButtonElement>('button')!
        const closeRect = close.getBoundingClientRect()
        const scrollOwners = [...element.querySelectorAll<HTMLElement>('*')].filter((node) => {
          const style = getComputedStyle(node)
          return /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight
        })
        const center = document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2)
        return {
          top: Math.round(rect.top), bottom: Math.round(innerHeight - rect.bottom),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          closeHeight: closeRect.height, closeClickable: center === close || close.contains(center),
          scrollOwners: scrollOwners.length, bodyOwnsScroll: scrollOwners[0] === body,
          bodyBottom: Math.round(rect.bottom - body.getBoundingClientRect().bottom),
        }
      })
      expect(metrics).toMatchObject({ top: 0, bottom: 0, overflow: 0, closeHeight: 44, closeClickable: true, scrollOwners: 1, bodyOwnsScroll: true })
      expect(metrics.bodyBottom).toBeLessThanOrEqual(1)
    }
  })
}
