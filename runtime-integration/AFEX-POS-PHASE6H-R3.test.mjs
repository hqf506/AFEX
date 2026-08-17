import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const css = read('app/globals.css')
const home = read('app/pos/page.tsx')
const items = read('components/invoice-items-step.tsx')
const checkout = read('components/pos-checkout-workspace.tsx')
const checkoutPage = read('app/pos/sale/checkout/page.tsx')
const thermal = read('components/pos-thermal-draft-preview.tsx')

test('POS home has one scroll owner and no forced empty viewport filler', () => {
  assert.match(home, /className="pos-operational-home"/)
  assert.match(css, /\.pos-operational-home \{[^}]*min-height: 0;[^}]*overflow: visible/)
  assert.match(css, /\.pos-operational-canvas \{[\s\S]*?min-height: 0;/)
  assert.match(css, /\.afex-pos-route-content:has\(\.pos-operational-home\) \{ height: auto; min-height: 0; \}/)
})

test('catalog reserves exactly the 72px cart bar and one safe area', () => {
  assert.match(css, /padding: 14px 16px calc\(72px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(css, /\.afex-sale-mobile-summary \{[\s\S]*?height: 72px;/)
  assert.doesNotMatch(css, /padding: 14px 16px calc\(144px/)
})

test('cart item, stepper and totals geometry is stable and adjacent', () => {
  assert.match(css, /\.afex-mobile-cart-item \{[^}]*min-height: 104px/)
  assert.doesNotMatch(css, /\.afex-mobile-cart-item \{[^}]*max-height/)
  assert.match(css, /\.afex-mobile-quantity-stepper \{[^}]*width: 152px;[^}]*grid-template-columns: 46px 36px 46px/)
  assert.match(css, /\.afex-mobile-quantity-stepper > button \{[^}]*min-width: 46px;[^}]*min-height: 46px/)
  assert.match(items, /المجموع من غير الضريبة:/)
  assert.match(css, /\.afex-mobile-cart-total-lines > div \{[^}]*justify-content: flex-start;[^}]*gap: 6px/)
  assert.match(css, /font-variant-numeric: tabular-nums/)
})

test('checkout final action owns a solid dock and removed obsolete copy', () => {
  assert.doesNotMatch(checkout, /لن يعتبر الطلب ناجحًا قبل استجابة الخادم|لن يُعتبر الطلب ناجحًا قبل استجابة الخادم/)
  assert.match(checkout, /data-checkout-action-dock/)
  assert.match(css, /\.afex-checkout-action-dock \{ position: fixed;[^}]*bottom: 0;[^}]*background: var\(--afex-pos-panel\)/)
  assert.match(css, /\.afex-checkout-submit \{ position: static; width: 100%; min-height: 56px;/)
})

test('thermal draft preview is reachable and uses the authoritative renderer', () => {
  assert.match(checkoutPage, /<PosThermalDraftPreview[\s\S]*open=\{showThermalPreview\}/)
  assert.match(checkoutPage, /onPreview=\{\(\) => setShowThermalPreview\(true\)\}/)
  assert.match(thermal, /renderThermalInvoiceHtml/)
  assert.match(thermal, /prepareThermalInvoicePreviewHtml/)
  assert.match(thermal, /event\.key === 'Escape'/)
  assert.match(thermal, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(thermal, /returnFocusRef\.current\?\.focus\(\)/)
  assert.match(thermal, /querySelectorAll<HTMLElement>\('button, iframe/)
  assert.doesNotMatch(checkout, /router\.back\(/)
})
