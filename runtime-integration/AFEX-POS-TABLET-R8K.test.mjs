import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync('app/pos/order-status/page.tsx', 'utf8')
const tablet = readFileSync('app/pos-tablet.css', 'utf8')

test('R8K exposes a semantic tablet master-detail workspace', () => {
  for (const attribute of [
    'data-order-status-page', 'data-order-status-header', 'data-order-status-list',
    'data-order-status-row', 'data-order-status-details', 'data-order-status-action',
  ]) assert.match(page, new RegExp(attribute))
  assert.match(page, /عرض ومتابعة الطلبات الحالية وتحديث حالتها/)
  assert.doesNotMatch(page, /إغلاق وعودة إلى POS/)
  assert.match(page, /<span>إغلاق<\/span>/)
  assert.match(page, /router\.push\('\/pos'\)/)
  assert.doesNotMatch(page, /router\.back/)
})

test('R8K derives only supported states and preserves the existing mutation boundary', () => {
  assert.match(page, /in_progress:\s*'ready'/)
  assert.match(page, /ready:\s*'closed'/)
  assert.doesNotMatch(page, /في الطريق/)
  assert.match(page, /supabase\.from\('orders'\)\.update\(\{ status: nextStatus \}\)/)
  assert.match(page, /if \(!nextStatus \|\| updatingId/)
  assert.match(page, /\.eq\('tenant_id', access\.tenantId\)\.eq\('branch_id', access\.branchId\)\.eq\('status', order\.status\)/)
  assert.match(page, /disabled=\{updatingId !== null\}/)
  assert.match(page, /لا يوجد انتقال حالة متاح لهذا الطلب/)
  assert.match(page, /scrollIntoView\(\{ block: 'nearest', inline: 'nearest', behavior: 'smooth' \}\)/)
  assert.match(page, /normalizeDisplayedOrderNumber\(order\.order_number\)\.includes\(normalizedSearchQuery\)/)
  assert.match(page, /البحث برقم الفاتورة/)
  assert.match(page, /لا توجد فاتورة مطابقة/)
  assert.match(page, /onClick=\{\(\) => updateSearch\(''\)\}/)
  assert.match(page, /filteredOrders\.find\(\(order\) => order\.id === selectedId\) \?\? filteredOrders\[0\] \?\? null/)
})

test('R8K tablet CSS is closed to 768–1366 and avoids DOM-order geometry', () => {
  assert.match(tablet, /@media \(min-width: 768px\) and \(max-width: 1366px\)/)
  const r8kStart = tablet.indexOf('.pos-order-status-workflow .pos-status-header')
  assert.ok(r8kStart > 0)
  const r8kCss = tablet.slice(r8kStart, tablet.indexOf('.afex-pos-app-shell.is-sale-route', r8kStart))
  assert.doesNotMatch(r8kCss, /nth-(?:child|of-type)/)
  assert.match(r8kCss, /grid-template-columns:\s*minmax\(0, 1\.94fr\) minmax\(300px, 1fr\)/)
  assert.match(r8kCss, /overflow-y:\s*auto/)
  assert.match(tablet, /afex-pos-shell-content:has\(\.pos-order-status-workflow\) > \.afex-pos-route-content[\s\S]*height:\s*100%/)
  assert.match(r8kCss, /-webkit-overflow-scrolling:\s*touch/)
  assert.match(r8kCss, /min-height:\s*44px/)
})
