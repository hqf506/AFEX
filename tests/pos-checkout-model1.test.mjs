import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const component = readFileSync('components/pos-checkout-workspace.tsx', 'utf8')
const css = readFileSync('components/pos-checkout-workspace.module.css', 'utf8')
const page = readFileSync('app/pos/sale/checkout/page.tsx', 'utf8')
const paymentContract = readFileSync('lib/invoices/payment-method.ts', 'utf8')

test('checkout renders the authoritative model-1 workspace through the existing page contract', () => {
  assert.match(component, /data-checkout-model="model-1"/)
  assert.match(page, /<PosCheckoutWorkspace/)
  assert.match(page, /onSubmit=\{handleCreateInvoice\}/)
})

test('the same authoritative final total is rendered in summary, due amount, payment context, and submit action', () => {
  const uses = component.match(/formatCurrency\(props\.finalTotal\)/g) ?? []
  assert.equal(uses.length, 4)
  assert.match(component, /data-checkout-summary-totals/)
  assert.match(component, /data-checkout-due/)
  assert.match(component, /إنشاء الفاتورة — \$\{formatCurrency\(props\.finalTotal\)\}/)
})

test('all four existing payment methods remain available without changing their internal values', () => {
  for (const method of ["'mada'", "'cash'", "'visa'", "'cod'"]) {
    assert.match(paymentContract, new RegExp(`id: ${method}`))
  }
  assert.match(component, /PAYMENT_METHODS\.map/)
  assert.match(component, /onPaymentChange\(method\.id\)/)
  assert.match(component, /aria-pressed=\{selected\}/)
  assert.match(page, /checkout\.setPaymentMethod\('mada'\)/)
})

test('cash state preserves received, change, and remaining values from the checkout hook', () => {
  assert.match(component, /value=\{props\.cashReceived\}/)
  assert.match(component, /type="number" min="0" step="0\.01"/)
  assert.match(component, /props\.onCashReceivedChange/)
  assert.match(component, /formatCurrency\(props\.cashChange\)/)
  assert.match(component, /formatCurrency\(props\.remainingFromCustomer\)/)
})

test('discount and note controls preserve their existing callbacks and disabled state', () => {
  assert.match(component, /props\.onDiscountChange\(null\)/)
  assert.match(component, /props\.onDiscountChange\(discount\)/)
  assert.match(component, /props\.onNoteChange\(event\.target\.value\)/)
  assert.match(component, /disabled=\{props\.loading \|\| props\.loadingDiscounts\}/)
})

test('submission remains guarded by the existing eligibility and pending contract', () => {
  assert.match(component, /disabled=\{!props\.canSubmit \|\| props\.loading\}/)
  assert.match(component, /onClick=\{props\.onSubmit\}/)
  assert.match(component, /جارٍ إنشاء الفاتورة…/)
  assert.match(page, /submitLockedRef\.current/)
})

test('summary owns item scrolling while the root prevents document overflow', () => {
  assert.match(component, /data-checkout-items-scroll/)
  assert.match(css, /\.workspace\s*\{[^}]*overflow:\s*hidden/s)
  assert.match(css, /\.items\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto/s)
  assert.match(css, /\.paymentScroll\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto/s)
})

test('landscape uses a fixed summary rail and a two-by-two payment grid', () => {
  assert.match(css, /grid-template-columns:\s*minmax\(296px, 29%\) minmax\(0, 1fr\)/)
  assert.match(css, /\.summary\s*\{[^}]*grid-column:\s*1/s)
  assert.match(css, /\.payment\s*\{[^}]*grid-column:\s*2/s)
  assert.match(css, /\.methods\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s)
})

test('portrait summary is an accessible full-height drawer with focus and background locking', () => {
  assert.match(component, /role="dialog"/)
  assert.match(component, /aria-modal="true"/)
  assert.match(component, /event\.key === 'Escape'/)
  assert.match(component, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(component, /summaryTrigger\?\.focus\(\)/)
  assert.match(css, /\.drawer\s*\{[^}]*height:\s*100dvh/s)
})

test('all primary controls meet the 44px tablet touch target floor', () => {
  assert.match(css, /\.methods > button\s*\{[^}]*min-height:\s*108px/s)
  assert.match(css, /\.paymentReady\s*\{[^}]*min-height:\s*44px/s)
  assert.match(css, /\.discountOptions button\s*\{[^}]*min-height:\s*48px/s)
  assert.match(css, /\.drawerHeader button\s*\{[^}]*min-height:\s*44px/s)
  assert.match(css, /\.submit\s*\{[^}]*min-height:\s*60px/s)
})

test('the scoped theme contains no forbidden green, cyan, emerald, or gradient styling', () => {
  assert.doesNotMatch(css, /green|cyan|emerald|gradient/i)
  assert.doesNotMatch(component, /green|cyan|emerald/i)
  assert.match(css, /--ivory:\s*#fbf8f2/)
  assert.match(css, /--brown:\s*#8a5f2b/)
  assert.match(css, /--gold:\s*#a87635/)
})

test('the submit action is a structural bottom row rather than a viewport overlay', () => {
  assert.match(css, /\.workspace\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto/s)
  assert.match(component, /data-checkout-action-dock/)
  assert.doesNotMatch(css, /\.actionDock\s*\{[^}]*(position:\s*fixed|position:\s*absolute)/s)
})

test('customer and order data remain safe and do not expose internal identifiers', () => {
  assert.match(component, /معرف العميل مرتبط/)
  assert.doesNotMatch(component, /\{props\.customerId\}/)
  assert.match(css, /unicode-bidi:\s*isolate/)
})

test('safe loading and error messaging remain rendered without changing invoice creation behavior', () => {
  assert.match(component, /role="alert"/)
  assert.match(component, /props\.offlineMessage/)
  assert.match(page, /checkout\.errorMessage/)
  assert.match(page, /checkout\.createInvoice\(\)/)
})
