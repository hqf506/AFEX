import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const history = readFileSync('app/pos/order-status/page.tsx', 'utf8')
const home = readFileSync('app/pos/page.tsx', 'utf8')
const settings = readFileSync('app/pos/settings/page.tsx', 'utf8')
const shell = readFileSync('components/pos-shell/pos-responsive-shell.tsx', 'utf8')
const bottomNav = readFileSync('components/pos-mobile-bottom-navigation.tsx', 'utf8')
const normalize = readFileSync('lib/orders/normalize.ts', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')

test('subroutes own no phantom bottom-navigation reservation', () => {
  assert.match(css, /\.afex-pos-app-shell:not\(\.is-pos-home\) > \.afex-pos-shell-content \{ padding-bottom: 0; \}/)
  assert.match(css, /\.pos-invoice-history \{ min-height: 0;/)
  assert.doesNotMatch(css, /negative-margin|margin-bottom:\s*-/)
})

test('settings root cause is closed and real settings content remains visible', () => {
  assert.match(css, /\.afex-pos-shell-content\.is-more-route \.afex-pos-route-content \{ display: block; \}/)
  assert.match(shell, /isMore \? 'is-more-route'/)
  assert.ok(settings.includes('إعدادات نقطة البيع'))
  assert.match(settings, /href="\/pos" aria-label="العودة إلى نقطة البيع"/)
  assert.equal((settings.match(/<PosThemeToggle \/>/g) || []).length, 1)
  assert.doesNotMatch(settings, /href="\/admin/)
})

test('home and invoice history are separate bounded scopes', () => {
  assert.match(home, /const recentOrders = orders\.slice\(0, 6\)/)
  assert.match(home, /orders=\{recentOrders\}/)
  assert.match(history, /const PAGE_SIZE = 24/)
  assert.match(history, /result\.hasMore/)
  assert.match(history, /loadInvoices\(page \+ 1\)/)
  assert.match(history, /params\.set\('search', search\.trim\(\)\)/)
  assert.match(bottomNav, /label: 'الفواتير', href: '\/pos\/order-status'/)
  assert.match(bottomNav, /label: 'آخر الطلبات', href: '\/pos#pos-recent-orders-title'/)
})

test('full invoice pagination deduplicates identities', () => {
  assert.match(history, /new Map\(current\.map\(\(order\) => \[order\.id, order\]\)\)/)
  assert.match(history, /unique\.set\(order\.id, order\)/)
  assert.match(history, /detailed\.id !== order\.id/)
})

test('details action is a bounded underlined control in both themes', () => {
  assert.match(history, /<DetailsIcon \/><span>عرض التفاصيل<\/span>/)
  assert.match(css, /\.pos-history-card > button \{[^}]*min-height: 44px;[^}]*color: var\(--afex-pos-text\);[^}]*text-decoration: underline;/)
})

test('cash cards use only official availability-aware snapshot fields', () => {
  for (const field of ['cashReceivedAvailable', 'appliedAmountAvailable', 'cashChangeAvailable']) assert.ok(normalize.includes(field), field)
  assert.match(history, /selected\.cash_received_available \? formatCurrency\(selected\.cash_received\) : 'غير متاح'/)
  assert.match(history, /selected\.applied_amount_available \? formatCurrency\(selected\.total\) : 'غير متاح'/)
  assert.match(history, /selected\.cash_change_available \? formatCurrency\(selected\.cash_change\) : 'غير متاح'/)
  assert.match(css, /\.pos-invoice-cash-details \{[^}]*grid-template-columns: repeat\(3/)
})

test('R7 introduces no business writes or authority surface', () => {
  const combined = [history, settings, bottomNav].join('\n')
  assert.doesNotMatch(combined, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/)
  assert.doesNotMatch(combined, /\/api\/whatsapp|\/api\/orders\/[^'"`]+\/status|\/admin/)
})
