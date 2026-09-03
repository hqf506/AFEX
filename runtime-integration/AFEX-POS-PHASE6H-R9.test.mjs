import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/pos/order-history/page.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('order history has a fixed controls row and a dedicated list viewport', () => {
  assert.match(page, /className="pos-order-history-controls"/)
  assert.match(page, /className="pos-order-history-scroll"/)
  assert.match(css, /\.pos-order-history-page > main \{[^}]*grid-template-rows: auto minmax\(0, 1fr\);[^}]*overflow: hidden;/s)
  assert.match(css, /\.pos-order-history-scroll \{[^}]*min-height: 0;[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/s)
})

test('order history removes shell scrolling and mobile bottom navigation reserve only for this route', () => {
  assert.match(css, /\.afex-pos-shell-content:has\(\.pos-order-history-page\) \{ overflow: hidden; \}/)
  assert.match(css, /\.afex-pos-app-shell:has\(\.pos-order-history-page\) \{ padding-bottom: 0; \}/)
  assert.doesNotMatch(page, /fetch\([^\n]*method:\s*['"](?:POST|PATCH|DELETE)/)
})

test('the server-side 48-hour filter and progressive deduplication contract remain intact', () => {
  assert.match(page, /recentHours: '48'/)
  assert.match(page, /const unique = new Map/)
  assert.match(page, /unique\.set\(order\.id, order\)/)
  assert.match(page, /loadInvoices\(page \+ 1\)/)
})
