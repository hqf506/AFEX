import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const cart = read('components/invoice-items-step.tsx')
const checkout = read('app/pos/sale/checkout/page.tsx')
const workspace = read('components/pos-checkout-workspace.tsx')
const shell = read('components/pos-shell/pos-responsive-shell.tsx')
const css = read('app/globals.css')

test('cart is a strict header, scroll body and footer grid', () => {
  const sheet = cart.slice(cart.indexOf('<aside id="pos-cart-panel"'), cart.indexOf('</aside>', cart.indexOf('<aside id="pos-cart-panel"')))
  assert.ok(sheet.includes('data-mobile-cart-header'))
  assert.ok(sheet.includes('data-mobile-cart-scroll-body'))
  assert.ok(sheet.includes('data-mobile-cart-footer'))
  assert.match(css, /grid-template-rows: auto minmax\(0, 1fr\) auto/)
  assert.match(css, /\[data-mobile-cart-scroll-body\] \{[^}]*overflow-y: auto/)
  assert.doesNotMatch(css, /\[data-mobile-cart-item-list\] \{[^}]*overflow/)
})

test('compact customer, item and footer geometry is closed', () => {
  assert.match(css, /\[data-mobile-cart-customer\] \{[^}]*min-height: 54px/)
  assert.match(css, /\.afex-mobile-cart-item \{[^}]*min-height: 104px/)
  assert.match(css, /\[data-mobile-cart-actions\] button \{[^}]*min-height: 52px; max-height: 56px/)
  assert.match(css, /\.afex-mobile-cart-item-controls > div \{ min-width: 152px; flex: 0 0 152px/)
  assert.match(css, /text-overflow: ellipsis/)
})

test('checkout has no post-submit copy or operational element below create invoice', () => {
  assert.doesNotMatch(workspace, /لن يُعتبر الطلب ناجحًا قبل استجابة الخادم/)
  assert.doesNotMatch(checkout, /لن يُعتبر الطلب ناجحًا قبل استجابة الخادم/)
  assert.match(checkout, /<div data-checkout-submit-bar[\s\S]*afex-mobile-checkout-submit[\s\S]*إنشاء الفاتورة — \{formatCurrency\(checkout\.finalTotal\)\}[\s\S]*<\/button>\s*<\/div>\s*<\/div>\s*\) : \(/)
  assert.doesNotMatch(checkout, /data-checkout-submit-bar[\s\S]{0,1000}الرجوع إلى العناصر/)
  assert.match(checkout, /data-checkout-submit-bar[\s\S]{0,300}bg-\[#020817\]/)
  assert.doesNotMatch(checkout, /data-checkout-submit-bar[\s\S]{0,300}backdrop-blur/)
  assert.match(css, /\.afex-mobile-checkout-content \{ padding-bottom: calc\(84px \+ env\(safe-area-inset-bottom\)\)/)
})

test('bottom navigation remains exact-POS-home only', () => {
  assert.match(shell, /\{isPosHome \? <PosMobileBottomNavigation \/> : null\}/)
  assert.doesNotMatch(checkout, /PosMobileBottomNavigation/)
  assert.doesNotMatch(cart, /PosMobileBottomNavigation/)
})

test('business and authority contracts are untouched by R1', () => {
  for (const forbidden of ['/api/orders', 'request_identity', 'fingerprint', 'service_role', 'supabase.rpc']) {
    assert.doesNotMatch(cart, new RegExp(forbidden.replace('/', '\\/')))
  }
})
