import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const success = readFileSync(new URL('../components/pos-invoice-success-workspace.tsx', import.meta.url), 'utf8')
const orders = readFileSync(new URL('../app/pos/order-status/page.tsx', import.meta.url), 'utf8')

test('mobile success actions remain in normal document flow through iPhone landscape', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 932px)'), css.indexOf('@media (max-width: 359px)'))
  for (const selector of ['afex-success-new-sale', 'afex-success-new-sale-note', 'afex-success-footer-status']) {
    assert.match(mobile, new RegExp(`\\.${selector} \\{[^}]*position: static;`, 's'))
  }
  assert.doesNotMatch(mobile, /\.afex-success-(?:new-sale|new-sale-note|footer-status) \{[^}]*position: fixed;/s)
  assert.match(mobile, /\.afex-success-workspace \{[^}]*min-height: 100dvh;[^}]*safe-area-inset-bottom/s)
  assert.match(mobile, /\.afex-success-layout \{[^}]*display: flex;[^}]*flex-direction: column/s)
})

test('success content order keeps the CTA before its note and countdown', () => {
  const cta = success.indexOf('className="afex-success-new-sale"')
  const note = success.indexOf('className="afex-success-new-sale-note"')
  const footer = success.indexOf('className="afex-success-footer-status"')
  assert.ok(cta > 0 && note > cta && footer > note)
})

test('mobile order cards are bounded and expose complete status and controls', () => {
  assert.match(orders, /pos-order-status-card min-w-0 overflow-hidden/)
  assert.match(orders, /pos-order-card-head grid min-w-0 grid-cols-\[minmax\(0,1fr\)_auto\]/)
  assert.match(orders, /break-words text-right text-base font-black text-white \[overflow-wrap:anywhere\]/)
  assert.match(orders, /pos-order-status-badge[^`]*whitespace-nowrap/)
  assert.match(orders, /pos-order-card-actions[^`]*grid-cols-2/)
  assert.equal((orders.match(/min-h-\[48px\]/g) ?? []).length, 2)
  assert.match(css, /\.pos-order-status-card \{[^}]*min-height: 150px;/)
  assert.match(css, /\.pos-order-status-badge \{[^}]*overflow: visible;[^}]*text-overflow: clip;/)
  assert.doesNotMatch(css, /\.pos-order-status-badge \{[^}]*text-overflow: ellipsis;/)
})

test('back control is structural, safe and returns to exact POS root', () => {
  assert.match(orders, /pos-order-back-button/)
  assert.match(orders, /router\.push\('\/pos'\)/)
  assert.match(orders, /aria-label="العودة إلى نقطة البيع"/)
  assert.match(css, /\.pos-order-back-button \{[^}]*min-width: 48px;[^}]*max-width: 48px;/)
  assert.doesNotMatch(css, /\.pos-order-back-button \{[^}]*position: fixed;/)
})

test('R1 remains visual-only and does not add business operations', () => {
  for (const source of [css, success]) {
    assert.doesNotMatch(source, /execute_atomic_order|acquire_atomic_order|\/api\/orders/)
  }
})
