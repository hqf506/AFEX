import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const invoices = readFileSync(new URL('../app/pos/invoices/page.tsx', import.meta.url), 'utf8')
const orderHistory = readFileSync(new URL('../app/pos/order-history/page.tsx', import.meta.url), 'utf8')
const orderStatus = readFileSync(new URL('../app/pos/order-status/page.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('invoices use a fixed controls row and a dedicated invoices viewport', () => {
  assert.match(invoices, /className="pos-invoices-controls"/)
  assert.match(invoices, /className="pos-invoices-scroll"/)
  assert.match(css, /\.pos-invoices-page > main \{[^}]*grid-template-rows: auto minmax\(0, 1fr\);[^}]*overflow: hidden;/s)
  assert.match(css, /\.pos-invoices-scroll \{[^}]*min-height: 0;[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/s)
})

test('invoices suppress shell scrolling and hidden bottom navigation reserve only for their route', () => {
  assert.match(css, /\.afex-pos-shell-content:has\(\.pos-invoices-page\) \{ overflow: hidden; \}/)
  assert.match(css, /\.afex-pos-app-shell:has\(\.pos-invoices-page\) \{ padding-bottom: 0; \}/)
  assert.doesNotMatch(invoices, /fetch\([^\n]*method:\s*['"](?:POST|PATCH|DELETE)/)
})

test('server search, progressive loading, deduplication, and details remain intact', () => {
  assert.match(invoices, /if \(search\.trim\(\)\) params\.set\('search', search\.trim\(\)\)/)
  assert.match(invoices, /const unique = new Map/)
  assert.match(invoices, /unique\.set\(order\.id, order\)/)
  assert.match(invoices, /loadInvoices\(page \+ 1\)/)
  assert.match(invoices, /void openDetails\(order, event\.currentTarget\)/)
  assert.match(invoices, /pos-invoice-cash-details/)
})

test('R10 does not change order-history or order-status route structure', () => {
  assert.match(orderHistory, /pos-order-history-page/)
  assert.doesNotMatch(orderStatus, /pos-invoices-page|pos-invoices-scroll/)
})
