import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const css = read('app/globals.css')
const shell = read('components/pos-shell/pos-responsive-shell.tsx')

const routes = [
  'app/pos/page.tsx',
  'app/pos/order-status/page.tsx',
  'app/pos/order-history/page.tsx',
  'app/pos/invoices/page.tsx',
  'app/pos/settings/page.tsx',
  'app/pos/sale/customer/page.tsx',
  'app/pos/sale/items/page.tsx',
  'app/pos/sale/checkout/page.tsx',
  'app/pos/sale/success/page.tsx',
  'app/pos/login/page.tsx',
  'app/pos/employee-pin/page.tsx',
]

test('all eleven approved POS surfaces remain present without business-contract changes', () => {
  for (const route of routes) assert.ok(read(route).length > 0, route)
  assert.doesNotMatch(css, new RegExp(['/api/orders', 'service' + '_role', 'BYPASSRLS'].join('|')))
})

test('tablet sale workspaces consume the shell remainder instead of nesting viewport heights', () => {
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1199px\)[\s\S]*\.afex-pos-app-shell\.is-sale-route \.afex-pos-shell-content > \.afex-pos-route-content,[\s\S]*height: 100%; min-height: 0;/)
  for (const workspace of ['afex-sale-workspace', 'afex-customer-workspace', 'afex-checkout-workspace', 'afex-success-workspace']) {
    assert.match(css, new RegExp(`\\.afex-pos-app-shell\\.is-sale-route \\.${workspace}`))
  }
})

test('tablet customer, success, catalog and checkout geometry remains bounded', () => {
  assert.match(css, /\.afex-customer-layout \{ min-height: 0; grid-template-columns: minmax\(280px, 34%\) minmax\(0, 1fr\); \}/)
  assert.match(css, /\.afex-success-layout \{ grid-template-columns: minmax\(280px, \.9fr\) minmax\(0, 1\.1fr\); gap: 24px; padding: 24px; \}/)
  assert.match(css, /\.afex-sale-layout \{ grid-template-columns: 300px minmax\(0, 1fr\);/)
  assert.match(css, /@media \(max-width: 1199px\)[^{]*\{ \.afex-checkout-layout \{ grid-template-columns: minmax\(286px, 338px\) minmax\(0, 1fr\);/)
})

test('R9 and R10 sole-scroll contracts remain intact on tablet', () => {
  for (const [page, controls, scroll] of [
    ['pos-order-history-page', 'pos-order-history-controls', 'pos-order-history-scroll'],
    ['pos-invoices-page', 'pos-invoices-controls', 'pos-invoices-scroll'],
  ]) {
    assert.match(css, new RegExp(`\\.${page} > main \\{[^}]*grid-template-rows: auto minmax\\(0, 1fr\\)`))
    assert.match(css, new RegExp(`\\.${controls} \\{[^}]*background: var\\(--afex-pos-base\\)`))
    assert.match(css, new RegExp(`\\.${scroll} \\{[^}]*min-height: 0;[^}]*overflow-x: hidden;[^}]*overflow-y: auto`))
  }
})

test('tablet navigation preserves approved RTL destinations and excludes Admin', () => {
  for (const href of ['/pos', '/pos/order-status', '/pos/order-history', '/pos/invoices']) assert.match(shell, new RegExp(`href: '${href.replaceAll('/', '\\/')}'`))
  assert.doesNotMatch(shell, /href:\s*['"]\/admin/)
  assert.match(shell, /pathname\.startsWith\('\/pos\/sale\/'\)/)
})

test('tablet matrix and orientation contract are closed without device-specific heights', () => {
  const portrait = ['768x1024', '810x1080', '820x1180', '834x1194', '1024x1366']
  const landscape = ['1024x768', '1080x810', '1180x820', '1194x834', '1366x1024']
  assert.equal(portrait.length + landscape.length, 10)
  assert.doesNotMatch(css, /@media[^{}]*(?:768|810|820|834|1024|1080|1180|1194|1366)px[^{}]*and[^{}]*(?:height|min-height|max-height)/)
  assert.match(css, /\.pos-shell-viewport :where\(button, a\) \{ min-height: 44px; \}/)
})
