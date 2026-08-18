import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const css = [readFileSync('app/globals.css', 'utf8'), readFileSync('app/pos-tablet.css', 'utf8')].join('\n')
const sizes = [
  { width: 768, height: 1024 }, { width: 820, height: 1180 },
  { width: 834, height: 1194 }, { width: 1024, height: 1366 },
  { width: 1024, height: 768 }, { width: 1180, height: 820 },
  { width: 1194, height: 834 }, { width: 1366, height: 1024 },
]
const evidence = 'C:/AFEX-Evidence/R8K-AUTOMATION-SCREENSHOTS'
mkdirSync(evidence, { recursive: true })

const rows = Array.from({ length: 30 }, (_, index) => `<button class="pos-status-row" data-order-status-row data-selected="${index === 0}" aria-pressed="${index === 0}"><span class="pos-status-row-identity"><strong>01-${String(index + 1).padStart(4, '0')}</strong><small>عميل ذو اسم تشغيلي طويل · 05••••8082</small></span><time>18/08/2026 15:00</time><b>276 ر.س</b><span>قيد التنفيذ</span></button>`).join('')

test.use({ hasTouch: true })

for (const theme of ['dark', 'light']) {
  test(`R8K ${theme} master-detail tablet matrix`, async ({ page, browserName }) => {
    await page.setContent(`<html data-pos-theme="${theme}" dir="rtl"><body><div class="pos-invoice-history pos-order-status-workflow" data-order-status-page><main><header class="pos-status-header" data-order-status-header><div class="pos-history-heading"><div><h1>حالة الطلبات</h1><p>عرض ومتابعة الطلبات الحالية وتحديث حالتها</p></div></div><div class="pos-status-header-actions"><button>↻ <span>تحديث</span></button><button>← <span>إغلاق وعودة إلى POS</span></button></div></header><section class="pos-status-metrics"><article><span class="pos-status-dot is-progress"></span><div><small>قيد التنفيذ</small><strong>18</strong></div></article><article><span class="pos-status-dot is-ready"></span><div><small>جاهزة</small><strong>12</strong></div></article></section><section class="pos-status-workspace"><section class="pos-status-list" data-order-status-list><div class="pos-status-list-labels"><span>الطلب والعميل</span><span>التاريخ</span><span>الإجمالي</span><span>الحالة</span></div>${rows}</section><aside class="pos-status-details" data-order-status-details><header><div><small>تفاصيل الطلب</small><h2>01-0001</h2></div><span>قيد التنفيذ</span></header><div class="pos-status-details-body"><dl class="pos-status-details-meta"><div><dt>العميل</dt><dd>عميل نقدي</dd></div><div><dt>الهاتف</dt><dd>غير متاح</dd></div><div><dt>التاريخ والوقت</dt><dd>18/08/2026 15:00</dd></div><div><dt>طريقة الدفع</dt><dd>مدى</dd></div></dl><section class="pos-status-details-items"><h3>العناصر</h3><article><div><strong>خدمة معتمدة</strong><small>1 × 276 ر.س</small></div><b>276 ر.س</b></article></section><dl class="pos-status-totals"><div><dt>المجموع قبل الضريبة</dt><dd>240 ر.س</dd></div><div><dt>الضريبة</dt><dd>36 ر.س</dd></div><div><dt>الخصم</dt><dd>0 ر.س</dd></div><div class="is-grand-total"><dt>الإجمالي النهائي</dt><dd>276 ر.س</dd></div></dl><div class="pos-status-history"><span>سجل الحالة</span><strong>غير متاح</strong></div></div><footer data-order-status-action><button>نقل إلى جاهز</button></footer></aside></section></main></div></body></html>`)
    await page.evaluate((styles) => { const style = document.createElement('style'); style.textContent = styles; document.head.append(style); document.body.style.margin = '0'; document.body.style.height = '100dvh'; document.body.style.overflow = 'hidden' }, css)

    for (const size of sizes) {
      await page.setViewportSize(size)
      const metrics = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[data-order-status-page]')!
        const list = document.querySelector<HTMLElement>('[data-order-status-list]')!
        const details = document.querySelector<HTMLElement>('[data-order-status-details]')!
        const headerButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-order-status-header] button')]
        const action = document.querySelector<HTMLButtonElement>('[data-order-status-action] button')!
        list.scrollTop = 250
        const listOwners = [list, ...list.querySelectorAll<HTMLElement>('*')].filter((node) => /(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight)
        const buttons = [...headerButtons, action]
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          rootGap: Math.max(0, innerWidth - root.getBoundingClientRect().width),
          listOwners: listOwners.length,
          listScrolled: list.scrollTop > 0,
          detailsVisible: details.getBoundingClientRect().width > 0 && details.getBoundingClientRect().bottom <= innerHeight + 1,
          shortTargets: buttons.filter((button) => button.getBoundingClientRect().height < 44 || button.getBoundingClientRect().width < 44).length,
          centerClickable: buttons.every((button) => { const rect = button.getBoundingClientRect(); const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return hit === button || button.contains(hit) }),
          selected: document.querySelectorAll('[data-order-status-row][data-selected="true"]').length,
        }
      })
      expect(metrics).toMatchObject({ overflow: 0, listOwners: 1, listScrolled: true, detailsVisible: true, shortTargets: 0, centerClickable: true, selected: 1 })
      expect(metrics.rootGap).toBeLessThanOrEqual(32)

      if ([834, 1194, 1366].includes(size.width) && [1194, 834, 1024].includes(size.height)) {
        await page.screenshot({ path: `${evidence}/${browserName}-${theme}-${size.width}x${size.height}.png`, fullPage: false })
      }
    }
  })
}
