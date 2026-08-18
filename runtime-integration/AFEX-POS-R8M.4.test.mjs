import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isLatestInvoiceLedgerRequest, mergeInvoiceLedgerPage, selectInvoiceLedgerCollection } from '../lib/pos/invoice-ledger-collection.ts'
import { normalizeInvoiceLedgerSearch } from '../lib/pos/invoice-ledger.ts'

const page = readFileSync('app/pos/invoices/page.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')
const labels = ['رقم الفاتورة', 'اسم العميل', 'التوقيت', 'طريقة الدفع', 'الإجمالي', 'حالة الفاتورة']

test('R8M.4 uses one shared six-column authority and separates every ledger field', () => {
  for (const label of labels) assert.match(page, new RegExp(`role="columnheader">${label}`))
  assert.match(css, /--pos-invoice-ledger-columns:/)
  assert.match(css, /\.pos-invoice-ledger-columns[^}]*grid-template-columns:\s*var\(--pos-invoice-ledger-columns\)/)
  assert.match(css, /\.pos-invoice-ledger-row[^}]*grid-template-columns:\s*var\(--pos-invoice-ledger-columns\)/)
  assert.doesNotMatch(page, /className="is-identity"/)
  assert.equal((page.match(/role="gridcell"/g) || []).length, 6)
  assert.match(page, /title=\{order\.customer_name \|\| 'عميل نقدي'\}/)
})

test('R8M.4 retains an immutable authoritative collection when search results change or clear', () => {
  const authoritative = [{ id: '3' }, { id: '2' }, { id: '1' }]
  const searched = [{ id: '2' }]
  assert.deepEqual(selectInvoiceLedgerCollection('01-0002', authoritative, searched), searched)
  assert.deepEqual(selectInvoiceLedgerCollection('', authoritative, searched), authoritative)
  assert.deepEqual(authoritative.map((item) => item.id), ['3', '2', '1'])
  assert.deepEqual(mergeInvoiceLedgerPage(authoritative, [{ id: '1' }, { id: '0' }], 2).map((item) => item.id), ['3', '2', '1', '0'])
})

test('R8M.4 normalizes every approved empty, digit, and hyphen path', () => {
  assert.equal(normalizeInvoiceLedgerSearch('   '), '')
  assert.equal(normalizeInvoiceLedgerSearch('٠١‐٠٠١٢'), '01-0012')
  assert.equal(normalizeInvoiceLedgerSearch('۰۱ — ۰۰۱۲'), '01-0012')
  assert.equal(normalizeInvoiceLedgerSearch('  عميل طويل  '), 'عميل طويل')
})

test('R8M.4 stale responses cannot overwrite the latest search or cleared authority', () => {
  assert.equal(isLatestInvoiceLedgerRequest(7, 7, false), true)
  assert.equal(isLatestInvoiceLedgerRequest(8, 7, false), false)
  assert.equal(isLatestInvoiceLedgerRequest(7, 7, true), false)
  assert.match(page, /invoiceRequestControllerRef\.current\?\.abort\(\)/)
  assert.match(page, /invoiceRequestRef\.current \+= 1/)
  assert.match(page, /setSearchResults\(null\)/)
  assert.match(page, /signal:\s*controller\.signal/)
  assert.doesNotMatch(page, /window\.location\.reload|router\.refresh|setOrders\([^)]*filter/)
})

test('R8M.4 preserves API, financial, grouping, preview, and read-only contracts', () => {
  assert.match(page, /mode:\s*'full'/)
  assert.match(page, /groupInvoicesByRiyadhDate/)
  assert.match(page, /resolveInvoicePaymentDisplay/)
  assert.match(page, /PosInvoicePreviewCurtain/)
  assert.doesNotMatch(page, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/)
})
