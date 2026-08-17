import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const history = readFileSync('app/pos/order-status/page.tsx', 'utf8')
const settings = readFileSync('app/pos/settings/page.tsx', 'utf8')
const shell = readFileSync('components/pos-shell/pos-responsive-shell.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')
const route = readFileSync('app/api/orders/route.ts', 'utf8')

test('invoice cards expose the required hierarchy and a real details action', () => {
  for (const label of ['رقم الفاتورة', 'العميل', 'التاريخ والوقت', 'الإجمالي', 'عرض التفاصيل']) assert.ok(history.includes(label), label)
  assert.match(history, /<button[^>]*onClick=\{\(event\) => void openDetails[\s\S]*?<DetailsIcon \/>[\s\S]*?عرض التفاصيل/)
  assert.match(css, /\.pos-history-card > button \{[^}]*min-height: 44px;[^}]*background: var\(--afex-pos-bronze\);[^}]*color: #fff;/)
})

test('invoice history ends naturally without a viewport-height spacer', () => {
  assert.match(css, /\.pos-invoice-history \{ min-height: 0;/)
  assert.doesNotMatch(css, /\.pos-invoice-history \{[^}]*min-height:\s*100dvh/)
})

test('cash payment evidence comes from official selected invoice fields', () => {
  assert.match(route, /cash_received/)
  assert.match(route, /remaining_from_customer/)
  assert.match(route, /cash_change/)
  assert.match(history, /payment_method_key === 'cash'/)
  for (const field of ['selected.cash_received', 'selected.remaining_from_customer', 'selected.cash_change']) assert.ok(history.includes(field), field)
  assert.doesNotMatch(history, /cash_received\s*[-+*/]|cash_change\s*[-+*/]/)
})

test('successive invoice openings replace details and reject mismatched payloads', () => {
  assert.match(history, /setSelected\(order\)/)
  assert.match(history, /if \(detailed\.id !== order\.id\) throw/)
  assert.match(history, /setSelected\(detailed\)/)
  assert.match(history, /setSelected\(null\)/)
})

test('invoice sheet has one scroll owner and complete modal accessibility', () => {
  assert.match(history, /role="dialog" aria-modal="true"/)
  assert.match(history, /event\.key === 'Escape'/)
  assert.match(history, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(css, /\.pos-invoice-sheet \{[^}]*overflow: hidden;/)
  assert.match(css, /\.pos-invoice-sheet-body \{[^}]*overflow-y: auto;/)
})

test('settings have an explicit POS return and professional grouped actions', () => {
  assert.match(settings, /href="\/pos" aria-label="العودة إلى نقطة البيع"/)
  for (const label of ['جلسة الموظف', 'المظهر', 'العمل اليومي', 'إدارة الجلسة']) assert.ok(settings.includes(label), label)
  assert.match(settings, /href="\/pos\/sale\/customer"/)
  assert.match(settings, /href="\/pos\/order-status"/)
  assert.doesNotMatch(settings, /href="\/admin/)
})

test('settings render exactly one theme control', () => {
  assert.equal((settings.match(/<PosThemeToggle \/>/g) || []).length, 1)
  assert.doesNotMatch(shell, /afex-pos-mobile-more">\{menu\}/)
  assert.match(shell, /isMore \? null : <header className="afex-pos-responsive-header">/)
})

test('R6 controls preserve 44px targets and themed tokens', () => {
  assert.match(css, /\.pos-settings-header > a \{[^}]*min-height: 44px;/)
  assert.match(css, /\.pos-settings-danger-actions button \{[^}]*min-height: 44px;/)
  assert.match(css, /background: var\(--afex-pos-panel\)/)
  assert.match(css, /color: var\(--afex-pos-text\)/)
})
