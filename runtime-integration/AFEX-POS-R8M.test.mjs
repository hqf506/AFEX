import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolveInvoicePaymentDisplay } from '../lib/invoices/order-payment.ts'
import { formatInvoiceDateGroupLabel, getRiyadhDateKey, groupInvoicesByRiyadhDate, normalizeInvoiceLedgerSearch } from '../lib/pos/invoice-ledger.ts'

const page = readFileSync(new URL('../app/pos/invoices/page.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/orders/route.ts', import.meta.url), 'utf8')

test('payment presentation classifies every approved branch without ambiguous zero facts', () => {
  assert.deepEqual(resolveInvoicePaymentDisplay({ paymentMethod: 'mada', paymentStatus: 'paid', total: 100, cashReceived: 0, remainingFromCustomer: 0 }), { kind: 'non-cash' })
  assert.deepEqual(resolveInvoicePaymentDisplay({ paymentMethod: 'cash', paymentStatus: 'paid', total: 100, cashReceived: 100, remainingFromCustomer: 0 }), { kind: 'cash-details-available', received: 100, change: 0 })
  assert.deepEqual(resolveInvoicePaymentDisplay({ paymentMethod: 'cash', paymentStatus: 'paid', total: 99.99, cashReceived: 100, remainingFromCustomer: 0 }), { kind: 'cash-details-available', received: 100, change: 0.01 })
  for (const cashReceived of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
    assert.deepEqual(resolveInvoicePaymentDisplay({ paymentMethod: 'cash', paymentStatus: 'paid', total: 100, cashReceived, remainingFromCustomer: 0 }), { kind: 'cash-details-unavailable' })
  }
  assert.deepEqual(resolveInvoicePaymentDisplay({ paymentMethod: 'on_delivery', paymentStatus: 'pending', total: 100, cashReceived: 0, remainingFromCustomer: 75 }), { kind: 'deferred-balance-available', outstanding: 75 })
  assert.deepEqual(resolveInvoicePaymentDisplay({ paymentMethod: 'on_delivery', paymentStatus: 'pending', total: 100, cashReceived: 0, remainingFromCustomer: 0 }), { kind: 'deferred-balance-unavailable' })
  assert.deepEqual(resolveInvoicePaymentDisplay({ paymentMethod: 'cash', paymentStatus: 'refunded', total: 100, cashReceived: 100, remainingFromCustomer: 0 }), { kind: 'refunded-without-refund-amount' })
})

test('Riyadh grouping preserves order and handles the UTC midnight boundary', () => {
  const now = new Date('2026-08-18T12:00:00.000Z')
  const invoices = [
    { id: 'a', created_at: '2026-08-17T21:30:00.000Z' },
    { id: 'b', created_at: '2026-08-17T20:59:59.000Z' },
    { id: 'c', created_at: '2026-08-16T20:59:59.000Z' },
  ]
  assert.equal(getRiyadhDateKey(invoices[0].created_at), '2026-08-18')
  assert.equal(getRiyadhDateKey(invoices[1].created_at), '2026-08-17')
  const groups = groupInvoicesByRiyadhDate(invoices, now)
  assert.deepEqual(groups.map((group) => group.invoices.map((invoice) => invoice.id)), [['a'], ['b'], ['c']])
  assert.match(groups[0].label, /^اليوم —/)
  assert.match(groups[1].label, /^أمس —/)
  assert.doesNotMatch(formatInvoiceDateGroupLabel(invoices[2].created_at, now), /اليوم|أمس/)
})

test('invoice search normalizes Western, Arabic, Persian digits and hyphen variants', () => {
  assert.equal(normalizeInvoiceLedgerSearch(' ٠١ – ٠٠٠٩ '), '01-0009')
  assert.equal(normalizeInvoiceLedgerSearch('۰۱ - ۰۰۰۹'), '01-0009')
  assert.equal(normalizeInvoiceLedgerSearch('عميل   نقدي'), 'عميل نقدي')
})

test('R8M source binds existing scoped APIs and never derives VAT rate or refund amount', () => {
  assert.match(page, /<h1>الفواتير<\/h1>/)
  assert.match(page, /سجل المبيعات والفواتير/)
  assert.match(page, /تفاصيل التحصيل النقدي غير متاحة لهذه الفاتورة/)
  assert.match(page, /<dt>الضريبة<\/dt><dd>\{formatCurrency\(selected\.tax\)\}/)
  assert.doesNotMatch(page, /vat.?rate|tax\s*\/|15%|مبلغ الاسترداد<\/dt>/i)
  assert.match(page, /router\.push\('\/pos'\)/)
  assert.match(page, /mode: 'full'/)
  assert.match(page, /mode: 'details'/)
  assert.match(page, /loadingRef\.current/)
  assert.match(api, /applyTenantFilter/)
  assert.match(api, /shouldFilterByBranch/)
})
