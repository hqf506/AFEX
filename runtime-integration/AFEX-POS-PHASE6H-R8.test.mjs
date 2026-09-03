import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  POS_ORDER_HISTORY_WINDOW_MS,
  getPosOrderHistoryCutoffIso,
  isInsidePosOrderHistoryWindow,
} from '../lib/orders/recent-window.ts'

const api = readFileSync('app/api/orders/route.ts', 'utf8')
const home = readFileSync('app/pos/page.tsx', 'utf8')
const statusPage = readFileSync('app/pos/order-status/page.tsx', 'utf8')
const orderHistory = readFileSync('app/pos/order-history/page.tsx', 'utf8')
const invoices = readFileSync('app/pos/invoices/page.tsx', 'utf8')
const bottomNav = readFileSync('components/pos-mobile-bottom-navigation.tsx', 'utf8')
const shell = readFileSync('components/pos-shell/pos-responsive-shell.tsx', 'utf8')

test('three POS order destinations are explicit and non-overlapping', () => {
  assert.match(bottomNav, /label: 'حالة الطلبات', href: '\/pos\/order-status'/)
  assert.match(bottomNav, /label: 'الفواتير', href: '\/pos\/invoices'/)
  assert.match(home, /<b>سجل الطلبات<\/b><small>طلبات آخر 48 ساعة<\/small>/)
  assert.match(home, /href="\/pos\/order-history">عرض سجل الطلبات/)
  assert.match(shell, /label: 'سجل الطلبات', href: '\/pos\/order-history'/)
})
test('48-hour boundary is UTC timestamp based and strict at the cutoff', () => {
  const now = Date.parse('2026-08-17T12:00:00.000Z')
  assert.equal(getPosOrderHistoryCutoffIso(now), '2026-08-15T12:00:00.000Z')
  assert.equal(isInsidePosOrderHistoryWindow(new Date(now - POS_ORDER_HISTORY_WINDOW_MS + 1000).toISOString(), now), true)
  assert.equal(isInsidePosOrderHistoryWindow(new Date(now - POS_ORDER_HISTORY_WINDOW_MS).toISOString(), now), false)
  assert.equal(isInsidePosOrderHistoryWindow(new Date(now - POS_ORDER_HISTORY_WINDOW_MS - 1).toISOString(), now), false)
  assert.equal(isInsidePosOrderHistoryWindow(new Date(now).toISOString(), now), true)
  assert.match(api, /nextQuery\.gt\('created_at', getPosOrderHistoryCutoffIso\(\)\)/)
  assert.doesNotMatch(api, /toLocaleString|localeCompare/)
})

test('home preview is server-filtered to 48 hours and capped at six', () => {
  assert.match(home, /const POS_HOME_ORDERS_PAGE_SIZE = 6/)
  assert.match(home, /searchParams\.set\('pageSize', POS_HOME_ORDERS_PAGE_SIZE\.toString\(\)\)/)
  assert.match(home, /searchParams\.set\('recentHours', '48'\)/)
  assert.match(home, /const recentOrders = orders\.slice\(0, 6\)/)
})

test('order history loads every recent page, deduplicates, and stays read-only', () => {
  assert.match(orderHistory, /recentHours: '48'/)
  assert.match(orderHistory, /const PAGE_SIZE = 24/)
  assert.match(orderHistory, /loadInvoices\(page \+ 1\)/)
  assert.match(orderHistory, /new Map\(current\.map\(\(order\) => \[order\.id, order\]\)\)/)
  assert.match(orderHistory, /لا توجد طلبات خلال آخر 48 ساعة/)
  assert.doesNotMatch(orderHistory, /\.update\(|method:\s*['"](?:POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(orderHistory, /نقل إلى جاهز|تم التسليم['"]\s*}/)
})

test('complete invoice history has no 48-hour or workflow filter', () => {
  assert.doesNotMatch(invoices, /recentHours|listFilter/)
  assert.match(invoices, /loadInvoices\(page \+ 1\)/)
  assert.match(invoices, /params\.set\('search', search\.trim\(\)\)/)
  assert.doesNotMatch(invoices, /\.update\(|نقل إلى جاهز/)
})

test('status transitions exist only in the operational status page', () => {
  assert.match(statusPage, /in_progress: 'ready'/)
  assert.match(statusPage, /ready: 'closed'/)
  assert.match(statusPage, /\.eq\('tenant_id', access\.tenantId\)/)
  assert.match(statusPage, /\.eq\('branch_id', access\.branchId\)/)
  assert.match(statusPage, /\.eq\('status', order\.status\)/)
  assert.doesNotMatch(home, /\.from\('orders'\)\.update|handleAdvanceOrderStatus/)
})

test('details fail closed against stale identity and preserve official cash fields', () => {
  for (const source of [orderHistory, invoices]) {
    assert.match(source, /detailed\.id !== order\.id/)
    assert.match(source, /setSelected\(order\); setDetailsLoading\(true\); setDetailsError\(''\)/)
    assert.match(source, /cash_received_available \? formatCurrency\(selected\.cash_received\) : 'غير متاح'/)
    assert.match(source, /applied_amount_available \? formatCurrency\(selected\.total\) : 'غير متاح'/)
    assert.match(source, /cash_change_available \? formatCurrency\(selected\.cash_change\) : 'غير متاح'/)
  }
})

test('R8 display qualification contains no business creation request', () => {
  const combined = [home, statusPage, orderHistory, invoices, bottomNav, shell].join('\n')
  assert.doesNotMatch(combined, /method:\s*['"]POST['"]|\/api\/whatsapp|clientIdempotencyKey/)
})
