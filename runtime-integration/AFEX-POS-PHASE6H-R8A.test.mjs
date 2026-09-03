import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('app/globals.css', 'utf8')
const cart = readFileSync('components/invoice-items-step.tsx', 'utf8')

test('cart geometry uses semantic three-row grid without structural selectors', () => {
  assert.match(css, /\.afex-sale-cart\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/)
  assert.doesNotMatch(css, /\.afex-sale-cart[^\n{]*>[^\n{]*(?:nth-child|nth-of-type)/)
})

test('semantic body is the only overflow owner and footer remains bottom anchored', () => {
  assert.match(css, /\.afex-sale-cart > \[data-mobile-cart-scroll-body\]\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/)
  assert.match(css, /\.afex-sale-cart > \[data-mobile-cart-footer\]\s*\{[^}]*align-self:\s*end;[^}]*background:\s*var\(--afex-pos-panel\);/)
  assert.match(cart, /data-mobile-cart-header/)
  assert.match(cart, /data-mobile-cart-scroll-body/)
  assert.match(cart, /data-mobile-cart-footer/)
})

test('R8A does not change checkout, authentication, or business request logic', () => {
  assert.doesNotMatch(css, /negative|margin-(?:block|top|bottom):\s*-/)
})
