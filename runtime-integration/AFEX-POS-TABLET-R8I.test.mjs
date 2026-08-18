import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync('app/pos/order-history/page.tsx', 'utf8')
const css = readFileSync('app/pos-tablet.css', 'utf8')

test('R8I keeps the existing accessible dialog contract and uses a textual close control', () => {
  assert.match(page, /role="dialog" aria-modal="true" aria-labelledby="pos-invoice-sheet-title"/)
  assert.match(page, /aria-label="إغلاق تفاصيل الطلب">إغلاق<\/button>/)
  assert.match(page, /event\.key === 'Escape'/)
  assert.match(page, /returnFocusRef\.current\?\.focus/)
  assert.match(page, /document\.body\.style\.overflow = 'hidden'/)
})

test('R8I applies a full-height, single-scroll-owner sheet only to tablet order history', () => {
  const tabletStart = css.indexOf('@media (min-width: 768px) and (max-width: 1366px)')
  const sheetStart = css.indexOf('.pos-order-history-page .pos-invoice-sheet-backdrop')
  const landscapeStart = css.indexOf('@media (min-width: 768px) and (max-width: 1366px) and (orientation: landscape)')
  assert.ok(tabletStart >= 0 && sheetStart > tabletStart && sheetStart < landscapeStart)
  const contract = css.slice(sheetStart, landscapeStart)
  assert.match(contract, /\.pos-order-history-page \.pos-invoice-sheet\s*\{[^}]*width:\s*100%;[^}]*height:\s*calc\(100dvh[^}]*max-height:\s*none;[^}]*border-radius:\s*0;/s)
  assert.match(contract, /\.pos-order-history-page \.pos-invoice-sheet-body\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s)
  assert.match(contract, /\.pos-order-history-page \.pos-invoice-sheet > header button\s*\{[^}]*min-width:\s*76px;[^}]*height:\s*44px;[^}]*var\(--afex-pos-danger\)/s)
  assert.doesNotMatch(contract, /\.pos-invoices-page|@media\s*\(max-width:\s*767px\)|@media\s*\(min-width:\s*1367px\)/)
})
