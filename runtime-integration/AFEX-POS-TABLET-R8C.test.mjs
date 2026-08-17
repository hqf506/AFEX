import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('app/globals.css', 'utf8')
const marker = '/* AFEX POS R8C: tablet-only geometry.'
const start = css.indexOf(marker)
const end = css.indexOf('@media (prefers-reduced-motion: reduce)', start)
const tabletBlock = css.slice(start, end)

test('R8C correction is isolated to tablet media contracts', () => {
  assert.ok(start >= 0)
  assert.match(tabletBlock, /min-width:\s*768px/)
  assert.match(tabletBlock, /max-width:\s*1199px/)
  assert.match(tabletBlock, /min-width:\s*1200px[\s\S]*max-width:\s*1366px[\s\S]*pointer:\s*coarse/)
  assert.doesNotMatch(tabletBlock, /max-width:\s*(?:767|430|390|375|360|320)px/)
})

test('tablet PIN uses dynamic viewport height and one page scroll surface', () => {
  assert.match(tabletBlock, /\.pos-entry-pin\s*\{[^}]*height:\s*100dvh[^}]*overflow-y:\s*auto/)
  assert.match(tabletBlock, /\.pos-entry-pin button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/)
  assert.doesNotMatch(tabletBlock, /100vh/)
})

test('tablet history and status consume the complete route width', () => {
  assert.match(tabletBlock, /\.pos-invoice-history > main\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/)
  assert.match(tabletBlock, /\.pos-order-history-page \.pos-history-grid\s*\{[^}]*auto-fit/)
  assert.match(tabletBlock, /\.pos-order-status-workflow \.pos-status-columns\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/)
})

test('tablet cart retains semantic three-row ownership and bottom footer', () => {
  assert.match(tabletBlock, /\.afex-sale-cart\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/)
  assert.match(tabletBlock, /\[data-mobile-cart-scroll-body\][^}]*overflow-y:\s*auto/)
  assert.match(tabletBlock, /\[data-mobile-cart-footer\][^}]*align-self:\s*end/)
  assert.doesNotMatch(tabletBlock, /nth-child|nth-of-type|margin-(?:top|bottom|block):\s*-/)
})

test('R8C tablet CSS contains no business or authority surface', () => {
  assert.doesNotMatch(tabletBlock, /\/api\/|supabase|checkout\(|fetch\(|sessionStorage|localStorage/)
})
