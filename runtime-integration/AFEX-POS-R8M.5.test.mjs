import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync('app/pos/invoices/page.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')
const columns = ['invoice-number', 'customer', 'time', 'payment', 'total', 'status']

test('R8M.5 gives every header and row cell the same semantic six-column identity', () => {
  for (const column of columns) {
    assert.match(page, new RegExp(`data-column="${column}" role="columnheader"`))
    assert.match(page, new RegExp(`role="gridcell" data-column="${column}"`))
  }
  assert.equal((page.match(/role="gridcell"/g) || []).length, 6)
  assert.doesNotMatch(page, /className="is-identity"/)
})

test('R8M.5 centers wide ledger text and isolates the LTR invoice identifier', () => {
  assert.match(page, /className="is-invoice-number" dir="ltr"/)
  assert.match(css, /@media \(min-width: 921px\)[\s\S]*\.pos-invoice-ledger-columns > span,[\s\S]*\.pos-invoice-ledger-row > \[role='gridcell'\][^{]*\{[^}]*justify-self:\s*stretch;[^}]*padding-inline:\s*8px;[^}]*text-align:\s*center;/)
  assert.match(css, /\.pos-invoice-ledger-row \.is-invoice-number \{[^}]*direction:\s*ltr;[^}]*unicode-bidi:\s*isolate;[^}]*font-variant-numeric:\s*tabular-nums;/)
})

test('R8M.5 leaves narrow labeled and mobile grid contracts intact', () => {
  assert.match(css, /@media \(max-width: 920px\) and \(min-width: 768px\)[\s\S]*\.pos-invoice-ledger-columns \{ display: none; \}/)
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*grid-template-areas: 'invoice total' 'customer status' 'time payment'/)
  assert.match(page, /title=\{order\.customer_name \|\| 'عميل نقدي'\}/)
})

test('R8M.5 remains presentation-only and read-only', () => {
  assert.doesNotMatch(page, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/)
  const scopedRule = css.match(/@media \(min-width: 921px\) \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.doesNotMatch(scopedRule, /nth-child|nth-of-type/)
})
