import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const mobile = readFileSync('app/pos-mobile-defects.css', 'utf8')
const layout = readFileSync('app/layout.tsx', 'utf8')
const home = readFileSync('app/pos/page.tsx', 'utf8')
const history = readFileSync('app/pos/order-history/operations-history.module.css', 'utf8')
const customer = readFileSync('components/pos-customer-workspace.tsx', 'utf8')
const items = readFileSync('components/pos-items-model-one.module.css', 'utf8')
const checkout = readFileSync('components/pos-checkout-workspace.module.css', 'utf8')
const success = readFileSync('components/pos-invoice-success-workspace.module.css', 'utf8')

test('mobile corrections load after the protected tablet contract and stay phone bounded', () => {
  assert.ok(layout.indexOf("'./pos-mobile-defects.css'") > layout.indexOf("'./pos-tablet.css'"))
  assert.match(mobile, /@media \(max-width: 767\.98px\),\s*\(max-height: 500px\) and \(hover: none\) and \(pointer: coarse\)/)
  assert.doesNotMatch(mobile, /@media\s*\(min-width:\s*768px\)/)
})

test('dashboard has one bottom reserve and compact structured order cards', () => {
  assert.match(mobile, /\.afex-pos-app-shell\.is-pos-home\s*\{[^}]*padding-bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/s)
  assert.match(mobile, /\.afex-pos-app-shell\.is-pos-home > \.afex-pos-shell-content\s*\{[^}]*padding-bottom:\s*0;/s)
  assert.match(mobile, /\.pos-order-row\s*\{[^}]*min-height:\s*0;/s)
  assert.match(mobile, /\.pos-order-action a\s*\{[^}]*min-height:\s*44px;/s)
  assert.match(home, /pos-order-number[^\n]*<strong dir="ltr">/)
  assert.match(home, /pos-order-date[^\n]*<bdi>/)
  assert.match(home, /pos-order-total[^\n]*<strong dir="ltr">/)
})

test('invoice mobile layout has fixed controls and one content-sized ledger viewport', () => {
  assert.match(mobile, /\.pos-invoices-page > main\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/s)
  assert.match(mobile, /\.pos-invoice-ledger\s*\{[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;/s)
  assert.match(mobile, /\.pos-invoice-ledger-row\s*\{[^}]*height:\s*auto;/s)
  assert.match(mobile, /content:\s*attr\(data-label\)/)
})

test('order status constrains search icons and separates all mobile controls', () => {
  assert.match(mobile, /\.pos-status-search label > svg\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;/s)
  assert.match(mobile, /\.pos-status-header-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s)
  assert.match(mobile, /\.pos-status-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s)
  assert.match(mobile, /\.pos-status-workspace\s*\{[^}]*overflow-y:\s*auto;/s)
})

test('settings remove inherited spacer and keep every link in natural flow', () => {
  assert.match(mobile, /\.afex-pos-app-shell:has\(\.pos-settings-page\)[\s\S]*?padding-bottom:\s*0;/)
  assert.match(mobile, /\.pos-settings-page\s*\{[^}]*min-height:\s*0;[^}]*height:\s*auto;/s)
  assert.match(mobile, /\.pos-settings-links > a\s*\{[^}]*min-height:\s*56px;/s)
})

test('customer last order uses separate bidi-safe identity, date and time fields', () => {
  assert.match(customer, /className="is-customer-last-order"/)
  assert.match(customer, /className="afex-customer-last-order-value"/)
  assert.match(customer, /<bdi dir="ltr">\{profile\.lastOrderNumber/)
  assert.match(customer, /<time dateTime=\{profile\.lastOrderAt \|\| undefined\}>/)
  assert.equal((customer.match(/lastOrderDateTime\?\.(?:date|time)/g) || []).length, 2)
  assert.match(mobile, /\.afex-customer-detail-row\.is-customer-last-order\s*\{[^}]*height:\s*auto;/s)
})

test('mobile cart drawer is above the shell and has one real close control', () => {
  const mobileBlock = items.slice(items.indexOf('@media (max-width: 767px)'))
  assert.match(mobileBlock, /\.cartBackdrop\s*\{[^}]*z-index:\s*90;/s)
  assert.match(mobileBlock, /\.cart\s*\{[^}]*z-index:\s*100 !important;/s)
  assert.match(mobileBlock, /\.cartClose\s*\{[^}]*display:\s*inline-flex;/s)
})

test('checkout mobile contract compacts presentation while retaining 44px targets', () => {
  assert.match(checkout, /@media \(max-width: 767\.98px\),[\s\S]*?\.methods > button\s*\{[^}]*min-height:\s*72px;/s)
  assert.match(checkout, /@media \(max-width: 767\.98px\),[\s\S]*?\.discountOptions button\s*\{[^}]*min-height:\s*44px;/s)
  assert.match(checkout, /@media \(max-width: 767\.98px\),[\s\S]*?\.submit\s*\{[^}]*min-height:\s*48px;/s)
  assert.match(checkout, /@media \(max-width: 767\.98px\),[\s\S]*?\.mobileSummaryBar button:last-child\s*\{[^}]*min-width:\s*44px;[^}]*flex-basis:\s*44px;/s)
})

test('success Model 4 balances phone height without changing the landscape contract', () => {
  assert.match(success, /@media \(max-width: 540px\)\s*\{[\s\S]*?\.primaryScreen\s*\{[^}]*justify-content:\s*center;/s)
  assert.match(success, /\.primaryScreen\s*\{[^}]*height:\s*100%;/s)
  assert.match(success, /@media \(orientation: landscape\) and \(max-width: 932px\) and \(max-height: 430px\)/)
})

test('operations history keeps controls fixed and makes the timeline the sole scroll owner', () => {
  assert.match(history, /@media \(max-width: 767\.98px\),[\s\S]*?\.main\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s)
  assert.match(history, /@media \(max-width: 767\.98px\),[\s\S]*?\.scroll\s*\{[^}]*overflow-y:\s*auto;/s)
  assert.match(history, /\.card\s*\{[^}]*grid-template-areas:\s*'operation operation' 'reference customer' 'status action';/s)
})
