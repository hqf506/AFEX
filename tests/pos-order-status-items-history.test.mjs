import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  formatOrderStatusHistoryDateTime,
  normalizeOrderStatusHistory,
  parseOrderStatusHistoryEntries,
} from '../lib/orders/order-status-details.ts'
import { normalizeOrderRecord } from '../lib/orders/normalize.ts'

const page = readFileSync(new URL('../app/pos/order-status/page.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../app/api/orders/route.ts', import.meta.url), 'utf8')
const historyServer = readFileSync(new URL('../lib/server/orders/order-status-history.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/pos/order-status/order-status.module.css', import.meta.url), 'utf8')

function createOrder(invoiceItems) {
  return normalizeOrderRecord({
    id: 'order-authorized',
    order_number: '02-0043',
    branch_id: 'branch-authorized',
    status: 'ready',
    created_at: '2026-08-24T10:00:00.000Z',
    invoices: [{ invoice_items: invoiceItems }],
  }, 0)
}

test('authorized detail items preserve multiple authoritative line items and amounts', () => {
  const order = createOrder([
    { item_name_snapshot: 'إصلاح شنطة جلد', quantity: 1, unit_price: 240, line_total: 240 },
    { item_name_snapshot: 'إصلاح حذاء', quantity: '2', unit_price: '18.50', line_total: '37.00' },
  ])
  assert.equal(order.items.length, 2)
  assert.deepEqual(order.items.map(({ name, quantity, unitPrice, lineTotal }) => ({ name, quantity, unitPrice, lineTotal })), [
    { name: 'إصلاح شنطة جلد', quantity: 1, unitPrice: 240, lineTotal: 240 },
    { name: 'إصلاح حذاء', quantity: 2, unitPrice: 18.5, lineTotal: 37 },
  ])
})

test('long Arabic item names remain text and the UI labels quantity and authoritative total', () => {
  const longName = 'إصلاح وترميم حقيبة جلدية عربية طويلة الاسم مع معالجة الحواف والمقابض'
  assert.equal(createOrder([{ item_name_snapshot: longName, quantity: 3, unit_price: 10, line_total: 30 }]).items[0].name, longName)
  assert.match(page, /الكمية: \{item\.quantity\} × \{formatCurrency\(item\.unit_price\)\}/)
  assert.match(page, /الإجمالي: \{formatCurrency\(item\.line_total\)\}/)
  assert.match(css, /overflow-wrap: anywhere/)
})

test('empty authoritative items and read failures have distinct exact states', () => {
  assert.equal(createOrder([]).items.length, 0)
  assert.match(page, /لا توجد عناصر مسجلة لهذا الطلب/)
  assert.match(page, /detailsReadState === 'error'[\s\S]*?تعذر تحميل عناصر الطلب/)
  assert.doesNotMatch(page, /<p>غير متاح<\/p>/)
})

test('detail reads use the existing authorized server endpoint and include invoice items', () => {
  assert.match(page, /new URLSearchParams\(\{ mode: 'details', id: orderId \}\)/)
  assert.match(api, /const ORDERS_DETAILS_SELECT = `[\s\S]*?invoice_items \(/)
  assert.match(api, /\.eq\('id', query\.id\)/)
  assert.match(api, /applyTenantFilter\([\s\S]*?auth\.profile\.tenant_id/)
})

test('status history accepts persisted status events only and sorts newest first', () => {
  const history = normalizeOrderStatusHistory([
    { id: 'older', action: 'order.status_updated', actor_user_id: 'employee-1', created_at: '2026-08-24T10:00:00.000Z', metadata: { new_status: 'in_progress' } },
    { id: 'ignored', action: 'order.created', created_at: '2026-08-24T09:00:00.000Z', metadata: { new_status: 'in_progress' } },
    { id: 'newer', action: 'order.status_updated', actor_user_id: 'employee-1', created_at: '2026-08-24T11:15:00.000Z', metadata: { new_status: 'ready' } },
  ], { 'employee-1': 'موظف الاختبار' }, 'ready')
  assert.deepEqual(history.map((entry) => entry.id), ['newer', 'older'])
  assert.equal(history[0].isCurrent, true)
  assert.equal(history[1].isCurrent, false)
  assert.equal(history[0].employeeName, 'موظف الاختبار')
})

test('Riyadh status timestamps use Gregorian dates and the Asia/Riyadh timezone', () => {
  assert.equal(formatOrderStatusHistoryDateTime('2026-08-24T11:15:00.000Z'), '24/08/2026، 02:15 م')
  assert.equal(formatOrderStatusHistoryDateTime('invalid'), '—')
})

test('missing employee names are omitted without breaking a valid event', () => {
  const [entry] = normalizeOrderStatusHistory([
    { id: 'event-1', action: 'order.status_updated', actor_user_id: 'missing', created_at: '2026-08-24T11:15:00.000Z', metadata: { new_status: 'ready' } },
  ], {}, 'ready')
  assert.equal(entry.employeeName, undefined)
  assert.equal(entry.status, 'ready')
})

test('client response parsing rejects malformed or internal-looking history payloads', () => {
  const parsed = parseOrderStatusHistoryEntries([
    { id: 'safe', status: 'ready', createdAt: '2026-08-24T11:15:00.000Z', employeeName: 'فيصل', isCurrent: true },
    { id: 'bad-status', status: 'raw_internal', createdAt: '2026-08-24T11:15:00.000Z', isCurrent: false },
    { id: 'bad-date', status: 'ready', createdAt: 'not-a-date', isCurrent: false },
  ])
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].id, 'safe')
})

test('history source is server-only and tenant, branch, entity, and action scoped', () => {
  assert.match(historyServer, /import 'server-only'/)
  assert.match(historyServer, /\.eq\('tenant_id', tenantId\)/)
  assert.match(historyServer, /\.eq\('entity_type', 'order'\)/)
  assert.match(historyServer, /\.eq\('entity_id', orderId\)/)
  assert.match(historyServer, /\.eq\('action', 'order\.status_updated'\)/)
  assert.match(historyServer, /shouldFilterByBranch\(scopeType, branchId\)[\s\S]*?\.eq\('branch_id', branchId as string\)/)
  assert.doesNotMatch(page, /from\('audit_logs'\)|from\('invoice_items'\)/)
})

test('history empty and failure states are truthful and independently retryable', () => {
  assert.match(page, /لا يوجد سجل تغييرات لهذا الطلب/)
  assert.match(page, /historyReadState === 'error'[\s\S]*?تعذر تحميل سجل الحالة/)
  assert.match(page, /onRetryDetails\(order\.id\)/)
  assert.match(api, /statusHistory,/)
})

test('switching orders cannot display stale details from another id', () => {
  assert.match(page, /if \(detailedOrder\.id !== orderId\) throw new Error\('ORDER_DETAILS_ID_MISMATCH'\)/)
  assert.match(page, /orderDetailsById\[order\.id\]/)
  assert.match(page, /orderDetailsById\[selectedOrder\.id\]/)
})

test('collapse and reopen reuse the per-order cache and in-flight guard', () => {
  assert.match(page, /cached\?\.readState === 'success'/)
  assert.match(page, /orderDetailsInFlightRef\.current\.has\(orderId\)/)
  assert.match(page, /orderDetailsInFlightRef\.current\.set\(orderId, controller\)/)
  assert.match(page, /controller\.abort\(\)/)
})

test('status transition behavior remains unchanged and details opening performs no mutation', () => {
  assert.match(page, /in_progress: 'ready',[\s\S]*?ready: 'closed'/)
  assert.match(page, /nextStatus === 'ready' \? 'نقل إلى جاهز' : 'تم التسليم'/)
  assert.match(page, /supabase\.from\('orders'\)\.update\(\{ status: nextStatus \}\)/)
  const detailsLoader = page.slice(page.indexOf('const loadOrderDetails'), page.indexOf('const loadOrders'))
  assert.doesNotMatch(detailsLoader, /\.update\(|method:\s*'POST'|method:\s*'PATCH'/)
})

test('current history uses existing AFEX token without changing action styling', () => {
  assert.match(css, /\.historyList li\[data-current='true'\] \{[\s\S]*?var\(--afex-pos-emerald\)/)
  assert.match(css, /\[data-order-status-action\] button \{[\s\S]*?min-height: 48px[\s\S]*?background-color: color-mix\(in srgb, var\(--afex-pos-emerald-strong\) 90%, #2f1a08\)/)
})

test('tablet and desktop detail structure remains in the existing panel', () => {
  assert.match(page, /inline \? 'تفاصيل الطلب المحدد' : 'تفاصيل الطلب'/)
  assert.match(page, /className=\{`pos-status-details \$\{inline \? styles\.inlineDetails : styles\.desktopDetails\}`\}/)
  assert.doesNotMatch(css, /@media \(min-width: 768px\)[\s\S]*?grid-template-columns:/)
})
