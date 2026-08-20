import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { countUniqueOperationCustomers, currentRiyadhDayOperations, filterPosOperations, formatPosOperationTime, getRiyadhDayLabel, mapOrdersToPosOperations, millisecondsUntilNextRiyadhMidnight } from '../lib/pos/operations-timeline.ts'

function order(id, createdAt, overrides = {}) {
  return { id, order_number: `ORD-${id}`, invoice_number: `INV-${id}`, customer_name: 'عميل اختبار', created_at: createdAt, status: 'closed', ...overrides }
}

test('operations timeline uses only order and invoice fields, newest first', () => {
  const operations = mapOrdersToPosOperations([order('old', '2026-08-18T06:00:00Z'), order('new', '2026-08-19T06:00:00Z')])
  assert.deepEqual(operations.map((item) => item.id), ['new', 'old'])
  assert.equal(operations.every((item) => item.kind === 'invoice'), true)
})

test('only current Riyadh-day operations remain after midnight', () => {
  const operations = mapOrdersToPosOperations([
    order('today', '2026-08-20T08:00:00Z'),
    order('yesterday', '2026-08-19T08:00:00Z'),
    order('older', '2026-08-17T08:00:00Z'),
  ])
  const current = currentRiyadhDayOperations(operations, new Date('2026-08-20T12:00:00Z'))
  assert.deepEqual(current.map((operation) => operation.id), ['today'])
  assert.match(getRiyadhDayLabel(new Date('2026-08-20T12:00:00Z')), /^اليوم — الخميس، ٢٠ أغسطس ٢٠٢٦$/u)
})

test('unique customer count is factual and next Riyadh midnight has a finite refresh delay', () => {
  const operations = mapOrdersToPosOperations([order('1', '2026-08-20T08:00:00Z', { customer_name: 'سارة' }), order('2', '2026-08-20T09:00:00Z', { customer_name: 'سارة' }), order('3', '2026-08-20T10:00:00Z', { customer_name: 'محمد' })])
  assert.equal(countUniqueOperationCustomers(operations), 2)
  assert.ok(millisecondsUntilNextRiyadhMidnight(new Date('2026-08-20T12:00:00Z')) > 0)
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
  for (const value of ['filterPosOperations', "setOperationKind", 'كل العمليات', '<option value="invoice">فواتير</option>', 'loadRequestRef', 'todayRiyadh', 'millisecondsUntilNextRiyadhMidnight']) assert.ok(source.includes(value))
  assert.equal(source.includes("recentHours: '48'"), false)
  assert.equal(source.includes('عمليات الجلسات'), false)
})

test('server applies the current Riyadh day boundary before returning orders', async () => {
  const source = await readFile(resolve('app/api/orders/route.ts'), 'utf8')
  for (const value of ["todayRiyadh: params.get('todayRiyadh') === '1'", "timeZone: 'Asia/Riyadh'", "nextQuery = nextQuery.gte('created_at', start).lte('created_at', now.toISOString())"]) assert.ok(source.includes(value))
})

test('operations entry points use the approved visible name while preserving the route', async () => {
  const page = await readFile(resolve('app/pos/order-history/page.tsx'), 'utf8')
  const entryFiles = ['app/pos/page.tsx', 'app/pos/settings/page.tsx', 'components/pos-shell/pos-responsive-shell.tsx']
  const sources = await Promise.all(entryFiles.map((file) => readFile(resolve(file), 'utf8')))
  assert.ok(page.includes('سجل العمليات'))
  assert.equal(sources.every((source) => source.includes('سجل العمليات') && source.includes('/pos/order-history')), true)
})

test('timeline keeps an icon-only details control and compact reference scale', async () => {
  const page = await readFile(resolve('app/pos/order-history/page.tsx'), 'utf8')
  const styles = await readFile(resolve('app/pos/order-history/operations-history.module.css'), 'utf8')
  assert.ok(page.includes('openDetails(operation.order'))
  for (const contract of ['font-size: 32px', 'height: 58px', 'height: 52px', 'height: 78px', 'height: 74px', 'height: 48px', 'overflow-x: hidden']) assert.ok(styles.includes(contract), `missing compact contract: ${contract}`)
  assert.equal(page.includes('<span>عرض التفاصيل</span>'), false)
})

test('order details dialog is viewport-contained with one scrolling body and accessible dismissal', async () => {
  const page = await readFile(resolve('app/pos/order-history/page.tsx'), 'utf8')
  const styles = await readFile(resolve('app/pos/order-history/operations-history.module.css'), 'utf8')
  for (const contract of ['.dialogBackdrop', '.dialogHeader', '.dialogBody', 'position: fixed', 'inset: 0', 'max-height: calc(100dvh - 48px)', 'max-height: calc(100dvh - 24px)', 'overflow-y: auto', 'min-height: 0', '.dialogClose:focus-visible']) assert.ok(styles.includes(contract), `missing dialog contract: ${contract}`)
  for (const contract of ['styles.dialogBackdrop', 'styles.dialog', 'styles.dialogHeader', 'styles.dialogClose', 'styles.dialogBody', 'document.body.style.overflow = \'hidden\'', "event.key === 'Escape'", 'aria-modal="true"']) assert.ok(page.includes(contract), `missing dialog behavior: ${contract}`)
  for (const detail of ['المنتجات والخدمات', 'المجموع قبل الضريبة', 'طريقة الدفع', 'المبلغ المستلم من العميل', 'الباقي للعميل']) assert.ok(page.includes(detail), `missing existing detail: ${detail}`)
  assert.equal(page.includes('className="pos-invoice-sheet"'), false)
})
