import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const history = read('app/pos/order-status/page.tsx')
const drafts = read('app/pos/offline-drafts/page.tsx')
const modal = read('components/pos-add-customer-modal.tsx')
const css = read('app/globals.css')

test('invoice history uses the authoritative read-only orders contract', () => {
  assert.match(history, /mode: 'full'/)
  assert.match(history, /mode: 'details'/)
  assert.match(history, /detailed\.id !== order\.id/)
  assert.match(history, /invoice_number, order\.order_number, order\.customer_name/)
  assert.doesNotMatch(history, /method: 'PATCH'|\/api\/admin\/orders|\/api\/whatsapp\/send/)
  assert.doesNotMatch(history, /قيد التجهيز|تم التجهيز|تم التسليم/)
})

test('details sheet is identity-safe and complete', () => {
  for (const value of ['customer_phone', 'selected.items', 'selected.subtotal', 'selected.tax', 'selected.discount', 'selected.total', 'selected.payment_method', 'selected.payment_status']) assert.match(history, new RegExp(value.replace('.', '\\.')))
  assert.match(history, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(history, /event\.key === 'Escape'/)
  assert.match(history, /returnFocusRef/)
})

test('customer dialog owns one internal scroll region and restores focus', () => {
  assert.match(modal, /dialogRef/)
  assert.match(modal, /previouslyFocusedRef/)
  assert.match(modal, /event\.key === 'Tab'/)
  assert.match(css, /\.pos-add-customer-body \{[^}]*overflow-y: auto/)
  assert.match(css, /\.pos-add-customer-dialog \{[^}]*overflow: hidden/)
  assert.match(css, /\.pos-add-customer-backdrop \{[^}]*align-items: center/)
})

test('offline drafts retain their real persistence and use POS theme surfaces', () => {
  assert.match(drafts, /readPosOfflineInvoiceDrafts/)
  assert.match(drafts, /deletePosOfflineInvoiceDraft/)
  assert.match(drafts, /clientIdempotencyKey: draft\.clientIdempotencyKey/)
  assert.match(drafts, /className="pos-drafts-page"/)
  assert.doesNotMatch(drafts, /bg-white|bg-slate-50|text-slate-950/)
  assert.match(css, /\.pos-drafts-page \{[^}]*var\(--afex-pos-base\)/)
})

test('R5 adds no admin navigation or fake business actions', () => {
  assert.doesNotMatch(history + drafts, /href="\/admin|router\.push\('\/admin/)
  assert.doesNotMatch(history, /POST|PATCH|DELETE/)
})
