import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const shell = read('components/pos-shell/pos-responsive-shell.tsx')
const items = read('components/invoice-items-step.tsx')
const checkout = read('app/pos/sale/checkout/page.tsx')
const success = read('components/pos-invoice-success-workspace.tsx')
const css = read('app/globals.css')

test('bottom navigation is rendered only on exact POS home', () => {
  assert.match(shell, /const isPosHome = pathname === '\/pos'/)
  assert.match(shell, /\{isPosHome \? <PosMobileBottomNavigation \/> : null\}/)
})

test('mobile cart owns the viewport and scrolls only its body', () => {
  for (const marker of ['data-mobile-cart-sheet', 'data-mobile-cart-header', 'data-mobile-cart-customer', 'data-mobile-cart-items', 'data-mobile-cart-totals', 'data-mobile-cart-actions']) {
    assert.ok(items.includes(marker), `missing ${marker}`)
  }
  assert.match(css, /\[data-mobile-cart-scroll-body\] \{[^}]*overflow-y: auto/)
  assert.match(css, /\.afex-mobile-cart-item \{[^}]*min-height: 104px/)
  assert.match(css, /\.afex-sale-cart \{[\s\S]*?inset: 68px 0 0;/)
})

test('mobile checkout starts collapsed and has one safe-area sticky action', () => {
  const details = checkout.match(/<details data-checkout-section="items"[^>]*>/)?.[0] ?? ''
  assert.ok(details)
  assert.doesNotMatch(details, /\sopen(?:\s|>)/)
  assert.match(checkout, /data-checkout-submit-bar className="absolute inset-x-0 bottom-0/)
  assert.match(checkout, /afex-mobile-checkout-submit/)
  assert.match(css, /\.afex-mobile-payment-grid > button \{ min-height: 96px; max-height: 108px; \}/)
})

test('mobile success hierarchy preserves one handoff and compact primary actions', () => {
  assert.equal((success.match(/onClick=\{props\.onWhatsApp\}/g) ?? []).length, 1)
  assert.equal((success.match(/onClick=\{props\.onNewSale\}/g) ?? []).length, 1)
  assert.match(css, /\.afex-success-action-grid button:nth-child\(4\) \{ grid-column: 1\/-1; \}/)
  assert.match(css, /\.afex-success-new-sale \{[^}]*min-height: 56px/)
})

test('sale routes reserve no bottom-navigation gap', () => {
  assert.match(css, /\.afex-pos-app-shell\.is-sale-route > \.afex-pos-shell-content \{ padding-bottom: 0; \}/)
  assert.match(css, /\.afex-pos-app-shell:not\(\.is-pos-home\) > \.afex-pos-bottom-navigation \{ display: none; \}/)
  assert.doesNotMatch(checkout, /bottom-\[calc\(64px\+env\(safe-area-inset-bottom\)\)\]/)
})
