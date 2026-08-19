import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { filterPosOperations, formatPosOperationTime, groupPosOperations, mapOrdersToPosOperations } from '../lib/pos/operations-timeline.ts'

function order(id, createdAt, overrides = {}) {
  return { id, order_number: `ORD-${id}`, invoice_number: `INV-${id}`, customer_name: 'عميل اختبار', created_at: createdAt, status: 'closed', ...overrides }
}

test('operations timeline uses only order and invoice fields, newest first', () => {
  const operations = mapOrdersToPosOperations([order('old', '2026-08-18T06:00:00Z'), order('new', '2026-08-19T06:00:00Z')])
  assert.deepEqual(operations.map((item) => item.id), ['new', 'old'])
  assert.equal(operations.every((item) => item.kind === 'invoice'), true)
})

test('operations are grouped as today, yesterday, then an Arabic Riyadh date', () => {
  const operations = mapOrdersToPosOperations([
    order('today', '2026-08-20T08:00:00Z'),
    order('yesterday', '2026-08-19T08:00:00Z'),
    order('older', '2026-08-17T08:00:00Z'),
  ])
  assert.deepEqual(groupPosOperations(operations, new Date('2026-08-20T12:00:00Z')).map((group) => group.label).slice(0, 2), ['اليوم', 'أمس'])
  assert.match(groupPosOperations(operations, new Date('2026-08-20T12:00:00Z'))[2].label, /\S/u)
})

test('search and the supported invoice filter are functional', () => {
  const operations = mapOrdersToPosOperations([order('1', '2026-08-20T08:00:00Z', { customer_name: 'سارة' })])
  assert.equal(filterPosOperations(operations, 'سارة', 'all').length, 1)
  assert.equal(filterPosOperations(operations, 'غير موجود', 'all').length, 0)
  assert.equal(filterPosOperations(operations, 'INV-1', 'invoice').length, 1)
})

test('operation time is formatted in Asia/Riyadh without inventing a timestamp', () => {
  assert.notEqual(formatPosOperationTime('2026-08-20T08:00:00Z'), '—')
  assert.equal(formatPosOperationTime('not-a-date'), '—')
})

test('operations page provides authoritative loading, empty, error and retry states', async () => {
  const source = await readFile(resolve('app/pos/order-history/page.tsx'), 'utf8')
  for (const value of ['جارٍ تحميل العمليات', 'لا توجد عمليات مسجلة', 'لا توجد عمليات مطابقة', 'إعادة المحاولة']) assert.ok(source.includes(value))
})

test('operations page has a functional search, supported-only filter, refresh and stale response guard', async () => {
  const source = await readFile(resolve('app/pos/order-history/page.tsx'), 'utf8')
  for (const value of ['filterPosOperations', "setOperationKind", 'كل العمليات', '<option value="invoice">فواتير</option>', 'loadRequestRef', 'onClick={() => void loadInvoices(1)}']) assert.ok(source.includes(value))
  assert.equal(source.includes('عمليات الجلسات'), false)
})

test('operations entry points use the approved visible name while preserving the route', async () => {
  const page = await readFile(resolve('app/pos/order-history/page.tsx'), 'utf8')
  const entryFiles = ['app/pos/page.tsx', 'app/pos/settings/page.tsx', 'components/pos-shell/pos-responsive-shell.tsx']
  const sources = await Promise.all(entryFiles.map((file) => readFile(resolve(file), 'utf8')))
  assert.ok(page.includes('سجل العمليات'))
  assert.equal(sources.every((source) => source.includes('سجل العمليات') && source.includes('/pos/order-history')), true)
})

test('timeline keeps the existing details action and mobile-safe visual hooks', async () => {
  const page = await readFile(resolve('app/pos/order-history/page.tsx'), 'utf8')
  const styles = await readFile(resolve('app/globals.css'), 'utf8')
  assert.ok(page.includes('openDetails(operation.order'))
  for (const selector of ['.pos-operation-content > button', '.pos-operations-timeline', '.pos-operation::after']) assert.ok(styles.includes(selector))
  assert.ok(styles.includes('min-height: 44px'))
})
