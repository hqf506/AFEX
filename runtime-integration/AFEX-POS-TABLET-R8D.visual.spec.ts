import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

test.use({ hasTouch: true })

const css = readFileSync('app/globals.css', 'utf8')
const evidenceDir = process.env.AFEX_R8D_EVIDENCE_DIR || join('test-results', 'r8d')
const sizes = [
  { width: 768, height: 1024 }, { width: 810, height: 1080 },
  { width: 820, height: 1180 }, { width: 834, height: 1194 },
  { width: 1024, height: 768 }, { width: 1080, height: 810 },
  { width: 1180, height: 820 }, { width: 1194, height: 834 },
]

const card = '<article class="pos-history-card"><div class="pos-history-card-top"><div><small>رقم الطلب</small><strong>01-0009</strong></div><span>قيد التنفيذ</span></div><dl><div class="is-customer"><dt>العميل</dt><dd>عميل تجريبي</dd></div><div><dt>التاريخ</dt><dd>18/08/2026</dd></div><div class="is-total"><dt>الإجمالي</dt><dd>276 ر.س</dd></div></dl><button>عرض التفاصيل</button></article>'
const item = '<article class="afex-mobile-cart-item"><div class="afex-mobile-cart-item-main"><div><p>خدمة إصلاح جلد</p><p>240 ر.س</p></div><button aria-label="حذف العنصر">×</button></div><div class="afex-mobile-cart-item-controls"><div class="afex-mobile-quantity-stepper"><button aria-label="تقليل">−</button><span>1</span><button aria-label="زيادة">+</button></div><p>240 ر.س</p></div></article>'

const screens = {
  login: `<main class="pos-entry-login" data-r8d-screen="login"><div aria-hidden="true"></div><div><section><div dir="rtl"><form style="width:min(440px,100%);margin:auto"><label>اسم المستخدم<input /></label><label>كلمة المرور<input /></label><button type="submit" style="width:100%;min-height:56px">تسجيل الدخول</button></form></div><div dir="rtl" aria-hidden="true"></div></section></div></main>`,
  pin: `<main class="pos-entry-pin" data-r8d-screen="pin"><div class="pos-pin-frame"><section><aside><button>تسجيل الخروج</button><p>معلومات الجلسة</p></aside><section><div><h1>إدخال الرقم السري</h1><div dir="ltr">${Array.from({ length: 12 }, (_, i) => `<button>${i < 9 ? i + 1 : i === 10 ? 0 : '⌫'}</button>`).join('')}</div></div></section></section></div></main>`,
  history: `<div class="afex-pos-shell-content" data-r8d-screen="history"><div class="afex-pos-route-content"><section class="pos-invoice-history pos-order-history-page"><main><div class="pos-order-history-controls"><header class="pos-history-header"><div class="pos-history-heading"><div><h1>سجل الطلبات</h1><p>آخر 48 ساعة</p></div></div><button aria-label="العودة إلى نقطة البيع">×</button></header><div class="pos-history-tools"><label><input placeholder="البحث" /></label><button>تحديث</button></div></div><div class="pos-order-history-scroll"><section class="pos-history-grid">${card.repeat(9)}</section></div></main></section></div></div>`,
  status: `<div class="afex-pos-shell-content" data-r8d-screen="status"><div class="afex-pos-route-content"><section class="pos-invoice-history pos-order-status-workflow"><main><header class="pos-history-header"><div class="pos-history-heading"><div><h1>حالة الطلبات</h1></div></div><button aria-label="العودة إلى نقطة البيع">×</button></header><div class="pos-history-tools"><p>الانتقالات القانونية فقط</p><button>تحديث</button></div><section class="pos-status-columns"><section class="pos-status-column"><header><span>قيد التنفيذ</span></header><div>${card.repeat(3)}</div></section><section class="pos-status-column"><header><span>جاهز</span></header><div>${card.repeat(3)}</div></section></section></main></section></div></div>`,
  cart: `<div class="afex-pos-app-shell is-sale-route" data-r8d-screen="cart"><header class="afex-pos-sale-header"><a href="#">←</a><strong>اختيار العناصر</strong></header><div class="afex-pos-shell-content"><div class="afex-pos-route-content"><main class="afex-sale-layout"><aside class="afex-sale-cart"><div data-mobile-cart-header><h2>ملخص الفاتورة</h2></div><div data-mobile-cart-scroll-body><div data-mobile-cart-customer><b>العميل</b><span>عميل تجريبي</span></div><section><div data-mobile-cart-items-heading><h3>العناصر</h3></div><div data-mobile-cart-item-list>${item.repeat(12)}</div></section></div><footer data-mobile-cart-footer><div data-mobile-cart-totals><div class="afex-mobile-cart-total-lines"><div><span>الإجمالي</span><span>276 ر.س</span></div></div></div><div data-mobile-cart-actions><button class="afex-sale-complete-button">إتمام البيع</button><button class="afex-sale-cancel-button">إلغاء الفاتورة</button></div></footer></aside><section class="afex-sale-catalog"><div class="afex-sale-tools"><h1>الكتالوج</h1></div><div class="afex-sale-product-grid">${card.repeat(8)}</div></section></main></div></div></div>`,
} as const

async function mount(page: Page, markup: string, theme: string) {
  await page.setContent(`<!doctype html><html dir="rtl" data-pos-theme="${theme}"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${markup}</body></html>`)
  await page.evaluate((styles) => {
    const element = document.createElement('style')
    element.textContent = styles
    document.head.append(element)
  }, css)
}

for (const [screen, markup] of Object.entries(screens)) {
  for (const theme of ['dark', 'light']) {
    test(`${screen} ${theme} tablet matrix`, async ({ page, browserName }) => {
      await mount(page, markup, theme)
      for (const size of sizes) {
        await page.setViewportSize(size)
        const metrics = await page.evaluate(() => {
          const screen = document.querySelector<HTMLElement>('[data-r8d-screen]')?.dataset.r8dScreen
          const primarySelector = screen === 'login'
            ? '.pos-entry-login button[type="submit"]'
            : screen === 'pin'
              ? '.pos-entry-pin button'
              : screen === 'history'
                ? '.pos-order-history-controls button'
                : screen === 'status'
                  ? '.pos-order-status-workflow > main > .pos-history-header button, .pos-order-status-workflow > main > .pos-history-tools button'
                  : '.afex-pos-sale-header > a, [data-mobile-cart-footer] button'
          const primaryControls = [...document.querySelectorAll<HTMLElement>(primarySelector)]
          const invalidPrimary = primaryControls.filter((el) => {
            const r = el.getBoundingClientRect()
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            const style = getComputedStyle(el)
            return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.9 || r.width < 44 || r.height < 44 || r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight || !hit || !el.contains(hit)
          })
          const touchTargets = [...document.querySelectorAll<HTMLElement>('.pos-history-card button, .afex-mobile-cart-item button')]
          const undersizedTargets = touchTargets.filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width < 44 || r.height < 44
          })
          const scrollRoot = screen === 'cart'
            ? document.querySelector('.afex-sale-cart')
            : screen === 'history'
              ? document.querySelector('.pos-order-history-page')
              : screen === 'status'
                ? document.querySelector('.pos-order-status-workflow')
                : document.querySelector('[data-r8d-screen]')
          const scrollOwners = [...(scrollRoot?.querySelectorAll<HTMLElement>('*') ?? [])].filter((el) => {
            const style = getComputedStyle(el)
            return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1
          })
          const history = document.querySelector<HTMLElement>('.pos-invoice-history')
          const cart = document.querySelector<HTMLElement>('.afex-sale-cart')
          const cartFooter = document.querySelector<HTMLElement>('[data-mobile-cart-footer]')
          return {
            horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
            invalidControls: invalidPrimary.map((el) => {
              const r = el.getBoundingClientRect()
              return { label: el.getAttribute('aria-label') || el.textContent?.trim(), x: r.x, y: r.y, width: r.width, height: r.height }
            }),
            undersizedTargets: undersizedTargets.map((el) => {
              const r = el.getBoundingClientRect()
              return { label: el.getAttribute('aria-label') || el.textContent?.trim(), width: r.width, height: r.height }
            }),
            sideGap: history ? Math.max(0, history.getBoundingClientRect().left, innerWidth - history.getBoundingClientRect().right) : 0,
            cartBottomGap: cart && cartFooter
              ? Math.abs(cart.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(cart).borderBottomWidth || '0') - cartFooter.getBoundingClientRect().bottom)
              : 0,
            scrollOwners: scrollOwners.length,
            viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height ?? innerHeight },
          }
        })
        expect(metrics.horizontalOverflow).toBe(0)
        expect(metrics.invalidControls, JSON.stringify(metrics.invalidControls)).toHaveLength(0)
        expect(metrics.undersizedTargets, JSON.stringify(metrics.undersizedTargets)).toHaveLength(0)
        expect(metrics.sideGap).toBeLessThanOrEqual(18)
        expect(metrics.cartBottomGap).toBeLessThanOrEqual(1)
        expect(metrics.scrollOwners).toBeLessThanOrEqual(1)
        expect(metrics.viewport.visualHeight).toBe(metrics.viewport.height)

        if ((size.width === 834 && size.height === 1194) || (size.width === 1194 && size.height === 834)) {
          mkdirSync(evidenceDir, { recursive: true })
          await page.screenshot({ path: join(evidenceDir, `${browserName}-${screen}-${theme}-${size.width}x${size.height}.png`), fullPage: false })
        }
      }
    })
  }
}

test('portrait landscape portrait preserves the mounted sale state without reload', async ({ page }) => {
  await mount(page, screens.cart, 'dark')
  const marker = await page.locator('[data-mobile-cart-item-list] article').count()
  for (const size of [{ width: 834, height: 1194 }, { width: 1194, height: 834 }, { width: 834, height: 1194 }]) {
    await page.setViewportSize(size)
    await expect(page.locator('[data-mobile-cart-item-list] article')).toHaveCount(marker)
    await expect(page.locator('[data-mobile-cart-footer]')).toBeVisible()
  }
})
