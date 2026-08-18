import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync('app/pos/order-history/page.tsx', 'utf8')
const css = readFileSync('app/pos-tablet.css', 'utf8')

test('R8J closes tablet history grids to two portrait and four landscape columns', () => {
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1366px\)[\s\S]*?\.pos-order-history-page \.pos-history-grid\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/)
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1366px\) and \(orientation: landscape\)[\s\S]*?\.pos-order-history-page \.pos-history-grid\s*\{\s*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/)
  assert.doesNotMatch(css, /\.pos-order-history-page \.pos-history-grid\s*\{[^}]*repeat\(auto-fit/s)
})

test('R8J is a same-page top curtain with reduced-motion and locked background', () => {
  assert.match(css, /@keyframes afex-tablet-order-sheet-enter\s*\{\s*from \{ transform: translateY\(-100%\); \}\s*to \{ transform: translateY\(0\); \}/)
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?\.pos-order-history-page \.pos-invoice-sheet \{ animation: none; \}/)
  assert.match(css, /\.pos-order-history-page:has\(\.pos-invoice-sheet-backdrop\) \.pos-order-history-scroll\s*\{\s*overflow-y:\s*hidden;/)
  assert.match(css, /orientation: landscape[\s\S]*?\.pos-order-history-page \.pos-invoice-sheet\s*\{\s*width:\s*clamp\(520px, 46vw, 680px\);/)
  assert.doesNotMatch(page, /router\.(push|replace|back)\([^)]*details|window\.location|location\.reload/)
})

test('R8J ignores stale detail responses without changing the read-only API contract', () => {
  assert.match(page, /const detailsRequestRef = useRef\(0\)/)
  assert.match(page, /detailsRequestRef\.current === requestSequence/)
  assert.match(page, /fetch\(`\/api\/orders\?\$\{params\}`,[^)]*cache: 'no-store'/)
  assert.doesNotMatch(page, /method:\s*['"](?:POST|PATCH|DELETE)['"]/)
})
