import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../app/pos/page.tsx', import.meta.url), 'utf8')
const modal = readFileSync(new URL('../components/pos-add-customer-modal.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('POS home restores four functional authoritative actions', () => {
  assert.match(home, /className="pos-home-action is-primary" onClick=\{onStartSale\}[\s\S]*?<b>بيع جديد<\/b>[\s\S]*?ابدأ عملية بيع جديدة/)
  assert.match(home, /className="pos-home-action" onClick=\{onAddCustomer\}[\s\S]*?<b>إضافة عميل<\/b>/)
  assert.match(home, /className="pos-home-action" href="\/pos\/order-status"[\s\S]*?<b>آخر الطلبات<\/b>/)
  assert.match(home, /className="pos-home-action is-drafts" href="\/pos\/offline-drafts"[\s\S]*?<b>مسودات الفواتير<\/b>/)
})

test('home action hierarchy is bronze, responsive and interaction-complete', () => {
  assert.match(css, /\.pos-home-action \{[^}]*min-height: 76px;[^}]*border: 1px solid var\(--afex-pos-border\)/)
  assert.match(css, /\.pos-home-action\.is-primary \{[^}]*background: var\(--afex-pos-emerald-strong\);[^}]*color: #fff/)
  assert.match(css, /\.pos-home-action:focus-visible \{[^}]*outline: 2px solid var\(--afex-pos-cyan\)/)
  assert.match(css, /\.pos-home-action:active \{ transform: scale\(\.99\)/)
  assert.doesNotMatch(home.slice(home.indexOf('function PosOperationalHome'), home.indexOf('export default function PosPage')), /عميل سريع|مسح منتج/)
})

test('customer modal uses theme-aware high-contrast structure', () => {
  for (const className of ['pos-add-customer-backdrop', 'pos-add-customer-dialog', 'pos-add-customer-field', 'pos-add-customer-save', 'pos-add-customer-cancel']) {
    assert.match(modal, new RegExp(`className="[^"]*${className}`))
  }
  assert.match(css, /\.pos-add-customer-dialog \{[^}]*border: 1px solid color-mix[^}]*background: var\(--afex-pos-panel\)/)
  assert.match(css, /\.pos-add-customer-field \{[^}]*border: 1px solid color-mix[^}]*font-size: 16px/)
  assert.match(css, /\.pos-add-customer-field:focus \{[^}]*border-color: var\(--afex-pos-emerald-strong\)/)
  assert.match(css, /\.pos-add-customer-save \{[^}]*background: var\(--afex-pos-emerald-strong\);[^}]*color: #fff/)
  assert.match(css, /\.pos-add-customer-cancel \{[^}]*border: 1px solid color-mix/)
})

test('customer authority and duplicate-submit contracts remain unchanged', () => {
  assert.match(modal, /if \(saving\) return/)
  assert.equal((modal.match(/fetch\('\/api\/customers'/g) || []).length, 1)
  assert.match(modal, /validateSaudiCustomerPhone\(normalizedPhone\)/)
  assert.match(modal, /branchId,/)
})
