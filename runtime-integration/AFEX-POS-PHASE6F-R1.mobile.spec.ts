import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const baseURL = 'http://127.0.0.1:3100'
const evidenceRoot = path.join(process.env.USERPROFILE || '.', 'Downloads', 'AFEX-POS-PHASE6F-R1-EVIDENCE')

async function loadCssSurface(page: Page) {
  await page.goto('/pos/login')
  await page.waitForLoadState('domcontentloaded')
  const css = await page.evaluate(async () => {
    const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    const linked = await Promise.all(links.map(async (link) => fetch(link.href).then((response) => response.text())))
    return [...linked, ...[...document.querySelectorAll('style')].map((style) => style.textContent || '')].join('\n')
  })
  await page.goto('about:blank')
  await page.setContent('<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body></body></html>')
  await page.addStyleTag({ content: css })
}

async function renderSuccessFixture(page: Page) {
  await page.evaluate(() => {
    document.body.innerHTML = `<main class="afex-success-workspace" dir="rtl"><header class="afex-success-header"><h1>اكتملت العملية</h1><span>نقطة البيع • الفاتورة محفوظة</span></header><div class="afex-success-layout"><aside class="afex-success-receipt"></aside><section class="afex-success-actions"><div class="afex-success-title"><span>✓</span><h2>تم إنشاء الفاتورة</h2><strong>R1-0001</strong><p>تم تنفيذ الطلب مرة واحدة.</p></div><div class="afex-success-mobile-card"><div><span>الإجمالي</span><b>276 ر.س</b></div><div><span>الدفع</span><b>مدى — مدفوع</b></div><p>عنصر واحد • رقم الطلب R1-0001</p></div><div class="afex-success-action-grid"><button class="is-whatsapp"><span>و</span><div><strong>إرسال عبر WhatsApp</strong><small>غير منفذ في الاختبار</small></div></button><button><span>PDF</span><div><strong>طباعة الفاتورة PDF</strong><small>النسخة الرقمية الرسمية</small></div></button><button><span>ط</span><div><strong>طباعة الإيصال الحراري</strong><small>نسخة الطابعة</small></div></button><button><span>←</span><div><strong>عرض الفاتورة</strong><small>تفاصيل الفاتورة</small></div></button></div><button class="afex-success-new-sale"><span>＋</span>بدء عملية بيع جديدة</button><p class="afex-success-new-sale-note">يمسح مسودة البيع المكتملة فقط، ولا يعيد الطلب السابق.</p><div class="afex-success-footer-status"><span>عودة تلقائية إلى POS خلال <b>00:30</b></span><button>العودة الآن</button></div></section></div></main>`
  })
}

async function renderOrdersFixture(page: Page) {
  await page.evaluate(() => {
    const cards = Array.from({ length: 8 }, (_, index) => `<article class="pos-order-status-card min-w-0 overflow-hidden rounded-[20px] bg-white/[0.035] p-4"><div class="pos-order-card-head grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div class="min-w-0"><p dir="ltr" class="break-words text-right text-base font-black text-white [overflow-wrap:anywhere]">R1-LONG-ORDER-${String(index + 1).padStart(4, '0')}</p><p class="mt-1 truncate text-sm font-bold text-slate-300">عميل هندسي باسم طويل ${index + 1}</p><p class="mt-1 text-xs font-bold text-slate-500">منذ دقيقة</p></div><span class="pos-order-status-badge inline-flex min-w-0 max-w-full shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-black bg-cyan-300/15 text-cyan-100"><span class="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300"></span>${index % 2 ? 'جاهز للتسليم' : 'قيد التنفيذ'}</span></div><div class="pos-order-card-actions mt-4 grid grid-cols-2 gap-2.5"><button class="min-h-[48px] min-w-0 rounded-[15px] px-2 text-[13px] font-black">تم التجهيز</button><button class="min-h-[48px] min-w-0 rounded-[15px] px-2 text-[13px] font-black">تم التسليم</button></div></article>`).join('')
    document.body.innerHTML = `<div class="min-h-[100dvh] w-full overflow-x-clip bg-[#020817] text-white" dir="rtl"><main class="pos-order-status-page relative min-h-[100dvh] w-full min-w-0 overflow-x-clip px-4"><div class="mx-auto w-full max-w-5xl"><header class="pos-order-status-header flex min-w-0 items-start justify-between gap-3"><div class="min-w-0"><h1>حالة الطلبات</h1><p>طلبات فرعك الحالي</p></div><button class="pos-order-back-button grid h-12 w-12 shrink-0 place-items-center" aria-label="العودة إلى نقطة البيع">←</button></header><section class="mt-5 grid gap-3 sm:grid-cols-2">${cards}</section></div></main></div>`
  })
}

const viewports = [{ width: 430, height: 932 }, { width: 393, height: 852 }, { width: 390, height: 844 }, { width: 375, height: 812 }, { width: 360, height: 800 }, { width: 320, height: 568 }, { width: 932, height: 430 }, { width: 852, height: 393 }, { width: 844, height: 390 }]

test.describe('Phase 6F-R1 iPhone geometry', () => {
  test.use({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile/15E148 Safari/604.1' })
  for (const colorScheme of ['light', 'dark'] as const) for (const viewport of viewports) {
    test(`${colorScheme} ${viewport.width}x${viewport.height}`, async ({ page, browserName }) => {
      await mkdir(evidenceRoot, { recursive: true })
      await page.emulateMedia({ colorScheme }); await page.setViewportSize(viewport); await loadCssSurface(page); await renderSuccessFixture(page)
      const sequence = await page.locator('.afex-success-actions').evaluate((root) => ['.afex-success-new-sale', '.afex-success-new-sale-note', '.afex-success-footer-status'].map((selector) => { const element = root.querySelector<HTMLElement>(selector)!; const rect = element.getBoundingClientRect(); return { top: rect.top + scrollY, bottom: rect.bottom + scrollY, position: getComputedStyle(element).position, height: rect.height } }))
      expect(sequence.every((item) => item.position === 'static'), JSON.stringify(sequence)).toBe(true); expect(sequence[0].bottom).toBeLessThanOrEqual(sequence[1].top + 1); expect(sequence[1].bottom).toBeLessThanOrEqual(sequence[2].top + 1); expect(sequence[0].height).toBeGreaterThanOrEqual(44)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
      if ((viewport.width === 320 || viewport.width === 932) && colorScheme === 'dark') await page.screenshot({ path: path.join(evidenceRoot, `success-${browserName}-${viewport.width}x${viewport.height}.png`), fullPage: true })
      await renderOrdersFixture(page)
      const cards = await page.locator('.pos-order-status-card').evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); const badge = element.querySelector<HTMLElement>('.pos-order-status-badge')!.getBoundingClientRect(); const buttons = [...element.querySelectorAll<HTMLElement>('.pos-order-card-actions button')].map((button) => button.getBoundingClientRect()); return { left: rect.left, right: rect.right, height: rect.height, badgeLeft: badge.left, badgeRight: badge.right, buttonHeights: buttons.map((button) => button.height) } }))
      for (const card of cards) { expect(card.left).toBeGreaterThanOrEqual(-1); expect(card.right).toBeLessThanOrEqual(viewport.width + 1); expect(card.height).toBeGreaterThanOrEqual(150); expect(card.height).toBeLessThanOrEqual(190); expect(card.badgeLeft).toBeGreaterThanOrEqual(card.left); expect(card.badgeRight).toBeLessThanOrEqual(card.right); expect(card.buttonHeights.every((height) => height >= 44)).toBe(true) }
      const back = await page.getByRole('button', { name: 'العودة إلى نقطة البيع' }).boundingBox(); expect(back?.width ?? 0).toBeGreaterThanOrEqual(44); expect(back?.height ?? 0).toBeGreaterThanOrEqual(44)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
      if ((viewport.width === 320 || viewport.width === 932) && colorScheme === 'dark') await page.screenshot({ path: path.join(evidenceRoot, `orders-${browserName}-${viewport.width}x${viewport.height}.png`), fullPage: true })
    })
  }
})
