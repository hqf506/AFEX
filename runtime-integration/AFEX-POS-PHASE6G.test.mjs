import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const catalog = readFileSync(new URL('../components/invoice-items-step.tsx', import.meta.url), 'utf8')
const navigation = readFileSync(new URL('../components/pos-mobile-bottom-navigation.tsx', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../components/pos-shell/pos-responsive-shell.tsx', import.meta.url), 'utf8')
const checkout = readFileSync(new URL('../app/pos/sale/checkout/page.tsx', import.meta.url), 'utf8')
const mobileViewport = readFileSync(new URL('../hooks/use-mobile-viewport.ts', import.meta.url), 'utf8')

test('catalog checkmark is cart-state scoped without geometry drift', () => {
  assert.match(catalog, /aria-pressed=\{productCartQuantity > 0\}/)
  assert.match(catalog, /data-cart-quantity=\{productCartQuantity\}/)
  assert.equal(css.split(/\r?\n/).some((line) => line.trimStart().startsWith('.afex-sale-product-copy') && line.includes("::after { content: '✓'")), false)
  assert.match(css, /\.afex-sale-product-card\.is-selected \.afex-sale-product-copy[^\n]*::after \{ content: '✓'/)
  assert.doesNotMatch(css, /\.afex-sale-product-card\.is-selected \{[^}]*border-width: 2px/)
})

test('cart summary uses the safe bottom edge after navigation is scoped to POS home', () => {
  assert.match(css, /\.afex-sale-mobile-summary \{[\s\S]*?inset: auto 0 0/)
  assert.match(css, /\.afex-pos-bottom-navigation \{[\s\S]*?bottom: 0;[\s\S]*?env\(safe-area-inset-bottom\)/)
  assert.match(css, /padding: 14px 16px calc\(72px \+ env\(safe-area-inset-bottom\)\)/)
})

test('bottom navigation exposes the closed four-destination contract', () => {
  const labels = [...navigation.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(labels, ['الإعدادات', 'حالة الطلبات', 'الفواتير', 'الرئيسية'])
  assert.doesNotMatch(navigation, /المزيد/)
  assert.doesNotMatch(navigation, /\/admin/)
  assert.match(navigation, /label: 'الفواتير', href: null/)
  assert.match(shell, /\{isPosHome \? <PosMobileBottomNavigation \/> : null\}/)
  assert.match(mobileViewport, /max-height: 500px[^\n]*pointer: coarse/)
})

test('mobile checkout uses compact sections and owns its safe bottom action', () => {
  for (const section of ['customer', 'items', 'payment', 'totals', 'note']) {
    assert.match(checkout, new RegExp(`data-checkout-section="${section}"`))
  }
  assert.match(checkout, /<details data-checkout-section="items"/)
  assert.match(checkout, /data-checkout-submit-bar/)
  assert.match(checkout, /data-checkout-submit-bar className="absolute inset-x-0 bottom-0/)
  assert.doesNotMatch(checkout, /afex-mobile-checkout fixed inset-0/)
})
