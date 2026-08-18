import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const css = `${readFileSync('app/globals.css', 'utf8')}\n${readFileSync('app/pos-tablet.css', 'utf8')}`
const evidence = 'C:/AFEX-Evidence/R8M-AUTOMATION-SCREENSHOTS'
mkdirSync(evidence, { recursive: true })
const sizes = [{ width: 768, height: 1024 }, { width: 810, height: 1080 }, { width: 820, height: 1180 }, { width: 834, height: 1194 }, { width: 1024, height: 768 }, { width: 1080, height: 810 }, { width: 1180, height: 820 }, { width: 1194, height: 834 }, { width: 1366, height: 1024 }]
const rows = [
  ['cash-change','01-0101','عميل نقدي','نقدي','300.00 ر.س','مدفوعة'],
  ['cash-exact','01-0100','عميل نقدي','نقدي','276.00 ر.س','مدفوعة'],
  ['mada','01-0099','عميل مدى','مدى','276.00 ر.س','مدفوعة'],
  ['legacy','01-0098','عميل تاريخي','نقدي','276.00 ر.س','مدفوعة'],
  ['deferred','01-0097','عميل آجل','عند الاستلام','276.00 ر.س','غير مكتملة'],
  ['refunded','01-0096','عميل مسترد','مدى','276.00 ر.س','مستردة'],
]
const row = (entry: string[]) => `<button type="button" class="pos-invoice-ledger-row" data-kind="${entry[0]}" data-selected="${entry[0] === 'cash-change'}"><strong data-label="رقم الفاتورة">${entry[1]}</strong><span data-label="اسم العميل" class="is-customer">${entry[2]}</span><time data-label="التوقيت">03:30 م</time><span data-label="طريقة الدفع" class="is-payment">${entry[3]}</span><b data-label="الإجمالي">${entry[4]}</b><i data-label="حالة الفاتورة">${entry[5]}</i></button>`
const fillerRows = Array.from({ length: 18 }, (_, index) => row([
  `filler-${index}`,
  `01-${String(200 + index).padStart(4, '0')}`,
  `عميل ${index + 1}`,
  index % 2 === 0 ? 'مدى' : 'نقدي',
  '276.00 ر.س',
  'مدفوعة',
])).join('')
const detail = (kind: string) => {
  const payment = kind === 'cash-change' ? '<section class="pos-invoice-cash-breakdown"><h3>تفاصيل الدفع النقدي</h3><dl><div><dt>إجمالي الفاتورة</dt><dd>276.00 ر.س</dd></div><div><dt>المبلغ المستلم من العميل</dt><dd>300.00 ر.س</dd></div><div><dt>الباقي للعميل</dt><dd>24.00 ر.س</dd></div></dl></section>' : kind === 'cash-exact' ? '<section class="pos-invoice-cash-breakdown"><h3>تفاصيل الدفع النقدي</h3><dl><div><dt>إجمالي الفاتورة</dt><dd>276.00 ر.س</dd></div><div><dt>المبلغ المستلم من العميل</dt><dd>276.00 ر.س</dd></div><div><dt>الباقي للعميل</dt><dd>0.00 ر.س</dd></div></dl></section>' : kind === 'legacy' ? '<p class="pos-invoice-payment-unavailable">تفاصيل التحصيل النقدي غير متاحة لهذه الفاتورة</p>' : kind === 'deferred' ? '<section class="pos-invoice-outstanding"><span>المبلغ المتبقي على العميل</span><b>76.00 ر.س</b></section>' : kind === 'refunded' ? '<p class="pos-invoice-refund-note">الفاتورة مستردة. مبلغ الاسترداد التفصيلي غير متاح.</p>' : ''
  return `<header><div><small>تفاصيل الفاتورة</small><h2>01-0101</h2></div><i>${kind === 'refunded' ? 'مستردة' : 'مدفوعة'}</i><button class="pos-invoice-mobile-close">إغلاق</button></header><div class="pos-invoice-detail-scroll"><dl class="pos-invoice-detail-meta"><div><dt>العميل</dt><dd>عميل معتمد</dd></div><div><dt>التاريخ والوقت</dt><dd>18 أغسطس 2026، 03:30 م</dd></div><div><dt>طريقة الدفع</dt><dd>${kind === 'mada' || kind === 'refunded' ? 'مدى' : 'نقدي'}</dd></div><div><dt>رقم الطلب</dt><dd>02-0101</dd></div></dl><section class="pos-invoice-detail-items"><h3>المنتجات والخدمات</h3><div><span><b>خدمة معتمدة</b><small>1 × 276.00 ر.س</small></span><strong>276.00 ر.س</strong></div></section><dl class="pos-invoice-detail-totals"><div><dt>المجموع قبل الضريبة</dt><dd>240.00 ر.س</dd></div><div><dt>الضريبة</dt><dd>36.00 ر.س</dd></div><div class="is-total"><dt>الإجمالي</dt><dd>276.00 ر.س</dd></div></dl>${payment}</div><footer><button>الفاتورة الحرارية</button><button>عرض الفاتورة الرقمية</button></footer>`
}
const fixture = (theme: string) => `<html data-pos-theme="${theme}" dir="rtl"><body><div class="pos-shell-viewport" style="height:100dvh"><div class="pos-shell-inner"><div class="afex-pos-app-shell is-pos-subroute"><div class="afex-pos-shell-content"><div class="afex-pos-route-content"><div class="pos-invoice-history pos-invoices-page"><main><header class="pos-invoices-header"><div class="pos-history-heading"><span><svg></svg></span><div><h1>الفواتير</h1><p>سجل المبيعات والفواتير</p></div></div><div><button class="is-close">إغلاق</button><button>تحديث</button></div></header><div class="pos-invoices-toolbar"><label><input placeholder="ابحث برقم الفاتورة أو اسم العميل"></label><div role="group"><button data-active="true">الكل</button><button>مدفوعة</button><button>مستردة</button></div></div><section class="pos-invoices-workspace"><div class="pos-invoice-ledger"><div class="pos-invoice-ledger-columns"><span>رقم الفاتورة</span><span>اسم العميل</span><span>التوقيت</span><span>طريقة الدفع</span><span>الإجمالي</span><span>حالة الفاتورة</span></div><section class="pos-invoice-date-group"><h2>اليوم — 18 أغسطس 2026</h2><div>${rows.slice(0,3).map(row).join('')}</div></section><section class="pos-invoice-date-group"><h2>أمس — 17 أغسطس 2026</h2><div>${rows.slice(3,5).map(row).join('')}</div></section><section class="pos-invoice-date-group"><h2>16 أغسطس 2026</h2><div>${row(rows[5])}${fillerRows}</div></section></div><aside class="pos-invoice-detail-pane" data-open="false">${detail('cash-change')}</aside></section></main></div></div></div></div></div></div></body></html>`

test.setTimeout(120_000)
for (const theme of ['light','dark']) test(`R8M ${theme} ledger geometry and financial states`, async ({ page, browserName }) => {
  await page.setContent(fixture(theme))
  await page.evaluate((stylesheet) => { const style = document.createElement('style'); style.textContent = stylesheet; document.head.append(style) }, css)
  await page.evaluate((details) => document.querySelectorAll<HTMLButtonElement>('.pos-invoice-ledger-row').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.pos-invoice-ledger-row').forEach((row) => row.setAttribute('data-selected','false')); button.setAttribute('data-selected','true'); const pane = document.querySelector<HTMLElement>('.pos-invoice-detail-pane')!; pane.dataset.open='true'; pane.innerHTML = details[button.dataset.kind!] })), Object.fromEntries(rows.map((entry) => [entry[0], detail(entry[0])])) )
  for (const size of sizes) {
    await page.setViewportSize(size)
    const metrics = await page.evaluate(() => { const route=document.querySelector<HTMLElement>('.afex-pos-route-content')!; const root=document.querySelector<HTMLElement>('.pos-invoices-page')!; const main=document.querySelector<HTMLElement>('.pos-invoices-page > main')!; const workspace=document.querySelector<HTMLElement>('.pos-invoices-workspace')!; const list=document.querySelector<HTMLElement>('.pos-invoice-ledger')!; const detailPane=document.querySelector<HTMLElement>('.pos-invoice-detail-pane')!; const detailScroll=document.querySelector<HTMLElement>('.pos-invoice-detail-scroll')!; const buttons=[...document.querySelectorAll<HTMLElement>('button')]; list.scrollTop=list.scrollHeight; detailScroll.scrollTop=detailScroll.scrollHeight; const ledgerRows=[...document.querySelectorAll<HTMLElement>('.pos-invoice-ledger-row')]; const last=ledgerRows.at(-1)!; const routeRect=route.getBoundingClientRect(); const rootRect=root.getBoundingClientRect(); const mainRect=main.getBoundingClientRect(); const workspaceRect=workspace.getBoundingClientRect(); const listRect=list.getBoundingClientRect(); const detailRect=detailPane.getBoundingClientRect(); const lastRect=last.getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth-window.innerWidth, listOwners: Number(list.scrollHeight>list.clientHeight), detailOwners: Number(detailScroll.scrollHeight>detailScroll.clientHeight), documentScroll: document.documentElement.scrollHeight-window.innerHeight, shortTargets: buttons.filter((button)=>{const style=getComputedStyle(button); const r=button.getBoundingClientRect(); return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0&&(r.width<44||r.height<44)}).length, lastReachable: lastRect.bottom<=listRect.bottom+1&&lastRect.top>=listRect.top-1, rootUtilization:rootRect.width/routeRect.width, mainUtilization:mainRect.width/routeRect.width, leftGutter:mainRect.left-routeRect.left, rightGutter:routeRect.right-mainRect.right, workspaceBottomGap:rootRect.bottom-workspaceRect.bottom, masterRatio:listRect.width/(listRect.width+detailRect.width), aligned:Math.abs(mainRect.left-workspaceRect.left)<=.5&&Math.abs(mainRect.right-workspaceRect.right)<=.5 } })
    expect(metrics.overflow).toBe(0); expect(metrics.listOwners).toBe(1); expect(metrics.detailOwners).toBeLessThanOrEqual(1); expect(metrics.documentScroll).toBe(0); expect(metrics.shortTargets).toBe(0); expect(metrics.lastReachable).toBe(true); expect(metrics.rootUtilization).toBeGreaterThanOrEqual(.95); expect(metrics.mainUtilization).toBeGreaterThanOrEqual(.95); expect(Math.abs(metrics.leftGutter-metrics.rightGutter)).toBeLessThanOrEqual(1); expect(metrics.workspaceBottomGap).toBeLessThanOrEqual(9); expect(metrics.masterRatio).toBeGreaterThan(.55); expect(metrics.masterRatio).toBeLessThan(.66); expect(metrics.aligned).toBe(true)
  }
  await page.setViewportSize({ width:1194,height:834 })
  for (const kind of ['cash-change','cash-exact','mada','legacy','deferred','refunded']) {
    await page.locator(`[data-kind="${kind}"]`).click()
    const evidenceBlock = page.locator('.pos-invoice-cash-breakdown, .pos-invoice-payment-unavailable, .pos-invoice-outstanding, .pos-invoice-refund-note')
    if (await evidenceBlock.count()) await evidenceBlock.first().scrollIntoViewIfNeeded()
    await page.screenshot({ path:`${evidence}/${browserName}-${theme}-${kind}.png` })
  }
  await page.locator('.pos-invoices-toolbar input').fill('۹۹۹۹')
  await page.locator('.pos-invoice-ledger').evaluate((element) => { element.innerHTML='<section class="pos-invoice-ledger-empty"><h2>لا توجد فواتير مطابقة</h2><p>غيّر البحث أوعامل التصفية لعرض الفواتير.</p></section>' })
  await page.screenshot({ path:`${evidence}/${browserName}-${theme}-no-results.png` })
  await page.setViewportSize({ width:834,height:1194 }); await page.screenshot({ path:`${evidence}/${browserName}-${theme}-portrait.png` })
})
