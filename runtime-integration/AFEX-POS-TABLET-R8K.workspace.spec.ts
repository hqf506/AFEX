import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const css = [readFileSync('app/globals.css', 'utf8'), readFileSync('app/pos-tablet.css', 'utf8')].join('\n')
const sizes = [
  { width: 768, height: 1024 }, { width: 820, height: 1180 },
  { width: 834, height: 1194 }, { width: 1024, height: 1366 },
  { width: 1024, height: 768 }, { width: 1180, height: 820 },
  { width: 1194, height: 834 }, { width: 1366, height: 1024 },
]
const evidence = 'C:/AFEX-Evidence/R8K.2-AUTOMATION-SCREENSHOTS'
mkdirSync(evidence, { recursive: true })

const rows = Array.from({ length: 40 }, (_, index) => `<button class="pos-status-row" data-order-status-row data-order-number="02-${String(index + 1).padStart(4, '0')}" data-selected="${index === 0}" aria-pressed="${index === 0}"><span class="pos-status-row-identity"><strong>02-${String(index + 1).padStart(4, '0')}</strong><small>عميل ذو اسم تشغيلي طويل · 05••••8082</small></span><time>18/08/2026 15:00</time><b>276 ر.س</b><span>قيد التنفيذ</span></button>`).join('')

const fixture = (theme: string) => `<html data-pos-theme="${theme}" dir="rtl"><body><div class="pos-shell-viewport"><div class="pos-shell-inner"><div class="afex-pos-app-shell is-pos-subroute"><header class="afex-pos-responsive-header"><strong>نقطة البيع</strong></header><div class="afex-pos-shell-content"><div class="afex-pos-route-content"><div class="pos-invoice-history pos-order-status-workflow" data-order-status-page><main><header class="pos-status-header" data-order-status-header><div class="pos-history-heading"><div><h1>حالة الطلبات</h1><p>عرض ومتابعة الطلبات الحالية وتحديث حالتها</p></div></div><div class="pos-status-header-actions"><button>↻ <span>تحديث</span></button><button aria-label="إغلاق">← <span>إغلاق</span></button></div></header><section class="pos-status-metrics"><article><span class="pos-status-dot is-progress"></span><div><small>قيد التنفيذ</small><strong>28</strong></div></article><article><span class="pos-status-dot is-ready"></span><div><small>جاهزة</small><strong>12</strong></div></article></section><section class="pos-status-workspace"><section class="pos-status-list"><div class="pos-status-search"><label><svg></svg><input type="search" placeholder="البحث برقم الفاتورة" aria-label="البحث برقم الفاتورة"></label><button type="button" aria-label="مسح البحث" hidden>مسح</button></div><div class="pos-status-list-scroll" data-order-status-list><div class="pos-status-list-labels"><span>الطلب والعميل</span><span>التاريخ</span><span>الإجمالي</span><span>الحالة</span></div>${rows}<div class="pos-status-search-empty" hidden><strong>لا توجد فاتورة مطابقة</strong><button type="button">مسح البحث</button></div></div></section><aside class="pos-status-details" data-order-status-details><header><div><small>تفاصيل الطلب</small><h2>02-0001</h2></div><span data-detail-status>قيد التنفيذ</span></header><div class="pos-status-details-body"><dl class="pos-status-details-meta"><div><dt>العميل</dt><dd>عميل نقدي</dd></div><div><dt>الهاتف</dt><dd>غير متاح</dd></div><div><dt>التاريخ والوقت</dt><dd>18/08/2026 15:00</dd></div><div><dt>طريقة الدفع</dt><dd>مدى</dd></div></dl><section class="pos-status-details-items"><h3>العناصر</h3><article><div><strong>خدمة معتمدة</strong><small>1 × 276 ر.س</small></div><b>276 ر.س</b></article></section><dl class="pos-status-totals"><div><dt>المجموع قبل الضريبة</dt><dd>240 ر.س</dd></div><div><dt>الضريبة</dt><dd>36 ر.س</dd></div><div><dt>الخصم</dt><dd>0 ر.س</dd></div><div class="is-grand-total"><dt>الإجمالي النهائي</dt><dd>276 ر.س</dd></div></dl><div class="pos-status-history"><span>سجل الحالة</span><strong>غير متاح</strong></div></div><footer data-order-status-action><button>نقل إلى جاهز</button></footer></aside></section></main></div></div></div></div></div></div></body></html>`

test.use({ hasTouch: true })
test.setTimeout(120_000)

for (const theme of ['dark', 'light']) {
  test(`R8K.1 ${theme} complete master-list access and action geometry`, async ({ page, browserName }) => {
    await page.setContent(fixture(theme))
    await page.evaluate((styles) => {
      const style = document.createElement('style')
      style.textContent = styles
      document.head.append(style)
      document.body.style.margin = '0'
      document.body.style.height = '100dvh'
      document.body.style.overflow = 'hidden'
      document.querySelectorAll<HTMLButtonElement>('[data-order-status-row]').forEach((row) => row.addEventListener('click', () => {
        document.querySelectorAll<HTMLButtonElement>('[data-order-status-row]').forEach((candidate) => {
          const selected = candidate === row
          candidate.dataset.selected = String(selected)
          candidate.setAttribute('aria-pressed', String(selected))
        })
        document.querySelector('[data-order-status-details] h2')!.textContent = row.dataset.orderNumber ?? ''
      }))
      const normalize = (value: string) => value.trim().replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[\s\u00a0\u2000-\u200b\u2010-\u2015-]+/g, '').toLowerCase()
      const input = document.querySelector<HTMLInputElement>('.pos-status-search input')!
      const clear = document.querySelector<HTMLButtonElement>('.pos-status-search > button')!
      const empty = document.querySelector<HTMLElement>('.pos-status-search-empty')!
      clear.style.display = 'none'
      empty.style.display = 'none'
      const applySearch = (value: string) => {
        input.value = value
        clear.hidden = value.length === 0
        clear.style.display = value.length === 0 ? 'none' : ''
        const query = normalize(value)
        const candidates = [...document.querySelectorAll<HTMLButtonElement>('[data-order-status-row]')]
        const matches = candidates.filter((row) => !query || normalize(row.dataset.orderNumber ?? '').includes(query))
        candidates.forEach((row) => { row.style.display = matches.includes(row) ? '' : 'none' })
        empty.hidden = matches.length > 0
        empty.style.display = matches.length > 0 ? 'none' : ''
        const selected = matches.find((row) => row.dataset.selected === 'true') ?? matches[0]
        candidates.forEach((row) => { const active = row === selected; row.dataset.selected = String(active); row.setAttribute('aria-pressed', String(active)) })
        document.querySelector('[data-order-status-details] h2')!.textContent = selected?.dataset.orderNumber ?? 'لا توجد فاتورة مطابقة'
      }
      input.addEventListener('input', () => applySearch(input.value))
      clear.addEventListener('click', () => applySearch(''))
      empty.querySelector('button')!.addEventListener('click', () => applySearch(''))
    }, css)

    await page.setViewportSize({ width: 1194, height: 834 })
    const search = page.getByLabel('البحث برقم الفاتورة')
    await page.screenshot({ path: `${evidence}/${browserName}-${theme}-1194x834-empty-search.png`, fullPage: false })
    await search.fill('0034')
    await expect(page.locator('[data-order-status-row]:visible')).toHaveCount(1)
    await expect(page.locator('[data-order-status-details] h2')).toHaveText('02-0034')
    await page.screenshot({ path: `${evidence}/${browserName}-${theme}-1194x834-search-0034.png`, fullPage: false })
    await search.fill(' 02 - 0024 ')
    await expect(page.locator('[data-order-status-details] h2')).toHaveText('02-0024')
    await search.fill('٠٢ - ٠٠٢٤')
    await expect(page.locator('[data-order-status-details] h2')).toHaveText('02-0024')
    await page.screenshot({ path: `${evidence}/${browserName}-${theme}-1194x834-search-arabic-0024.png`, fullPage: false })
    await search.fill('۹۹۹۹')
    await expect(page.locator('.pos-status-search-empty')).toBeVisible()
    await expect(page.locator('[data-order-status-details] h2')).toHaveText('لا توجد فاتورة مطابقة')
    await page.screenshot({ path: `${evidence}/${browserName}-${theme}-1194x834-no-match.png`, fullPage: false })
    await page.getByLabel('مسح البحث').click()
    await expect(page.locator('[data-order-status-row]:visible')).toHaveCount(40)
    await expect(page.locator('[data-order-status-details] h2')).toHaveText('02-0001')

    for (const size of sizes) {
      await page.setViewportSize(size)
      for (const orderNumber of ['02-0001', '02-0020', '02-0024', '02-0040']) {
        const row = page.locator(`[data-order-number="${orderNumber}"]`)
        await row.scrollIntoViewIfNeeded()
        await row.click()
        await expect(page.locator('[data-order-status-details] h2')).toHaveText(orderNumber)
      }

      const metrics = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('[data-order-status-page]')!
        const list = document.querySelector<HTMLElement>('[data-order-status-list]')!
        const details = document.querySelector<HTMLElement>('[data-order-status-details]')!
        const finalRow = document.querySelector<HTMLElement>('[data-order-number="02-0040"]')!
        const action = document.querySelector<HTMLButtonElement>('[data-order-status-action] button')!
        const headerButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-order-status-header] button')]
        const listOwners = [list, ...list.querySelectorAll<HTMLElement>('*')].filter((node) => /(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight)
        const finalRect = finalRow.getBoundingClientRect()
        const listRect = list.getBoundingClientRect()
        const actionRect = action.getBoundingClientRect()
        const detailsRect = details.getBoundingClientRect()
        const buttons = [...headerButtons, action]
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          rootBottom: Math.round(root.getBoundingClientRect().bottom),
          viewportBottom: innerHeight,
          listOwners: listOwners.length,
          finalFullyVisible: finalRect.top >= listRect.top && finalRect.bottom <= listRect.bottom + 1,
          finalSelected: finalRow.dataset.selected === 'true',
          selectedDetails: document.querySelector('[data-order-status-details] h2')?.textContent,
          actionVisible: actionRect.top >= detailsRect.top && actionRect.bottom <= detailsRect.bottom + 1,
          actionHeight: actionRect.height,
          shortTargets: buttons.filter((button) => button.getBoundingClientRect().height < 44 || button.getBoundingClientRect().width < 44).length,
          centerClickable: buttons.every((button) => { const rect = button.getBoundingClientRect(); const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); return hit === button || button.contains(hit) }),
          shellScroll: document.querySelector<HTMLElement>('.afex-pos-shell-content')!.scrollTop,
          closeText: document.querySelector('[data-order-status-header] button:last-child span')?.textContent,
          searchHeight: document.querySelector<HTMLInputElement>('.pos-status-search input')!.getBoundingClientRect().height,
        }
      })
      expect(metrics).toMatchObject({ overflow: 0, rootBottom: metrics.viewportBottom, listOwners: 1, finalFullyVisible: true, finalSelected: true, selectedDetails: '02-0040', actionVisible: true, shortTargets: 0, centerClickable: true, shellScroll: 0, closeText: 'إغلاق', searchHeight: 44 })
      expect(metrics.actionHeight).toBeGreaterThanOrEqual(44)

      if ([834, 1194, 1366].includes(size.width) && [1194, 834, 1024].includes(size.height)) {
        await page.screenshot({ path: `${evidence}/${browserName}-${theme}-${size.width}x${size.height}-final-selected.png`, fullPage: false })
      }
    }
  })
}

test('R8K.1 mocked transition keeps pending, success, failure and terminal states closed', async ({ page }) => {
  await page.setContent('<button data-action>نقل إلى جاهز</button><span data-row-status>قيد التنفيذ</span><span data-detail-status>قيد التنفيذ</span><p data-error></p>')
  const action = page.locator('[data-action]')
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-action]')!
    let pending = false
    button.addEventListener('click', async () => {
      if (pending) return
      pending = true
      button.disabled = true
      button.textContent = 'جارٍ التحديث...'
      const outcome = button.dataset.outcome
      await Promise.resolve()
      if (outcome === 'success') {
        document.querySelector('[data-row-status]')!.textContent = 'جاهز'
        document.querySelector('[data-detail-status]')!.textContent = 'جاهز'
        button.textContent = 'تم التسليم'
      } else {
        document.querySelector('[data-error]')!.textContent = 'تعذر تحديث حالة الطلب. أعد تحميل الصفحة للتحقق.'
        button.textContent = 'نقل إلى جاهز'
      }
      pending = false
      button.disabled = false
    })
  })
  await action.evaluate((button) => { button.dataset.outcome = 'success' })
  await action.dblclick()
  await expect(page.locator('[data-row-status]')).toHaveText('جاهز')
  await expect(page.locator('[data-detail-status]')).toHaveText('جاهز')
  await action.evaluate((button) => { button.dataset.outcome = 'failure' })
  await action.click()
  await expect(page.locator('[data-row-status]')).toHaveText('جاهز')
  await expect(page.locator('[data-error]')).toContainText('تعذر تحديث')
})
