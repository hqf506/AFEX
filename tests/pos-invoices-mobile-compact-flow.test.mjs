import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync('app/pos/invoices/page.tsx', 'utf8')
const mobile = readFileSync('app/pos-mobile-defects.css', 'utf8')
const globals = readFileSync('app/globals.css', 'utf8')
const invoiceBlock = mobile.slice(
  mobile.indexOf('/* Defect 2: invoices'),
  mobile.indexOf('/* Defect 3:'),
)

test('mobile invoice controls retain continuous source order', () => {
  const search = page.indexOf('className="pos-invoices-search"')
  const filters = page.indexOf('aria-label="تصفية الفواتير"')
  const dateHeading = page.indexOf('className="pos-invoice-date-group"')
  const card = page.indexOf('data-mobile-invoice-row')
  assert.ok(search > 0 && search < filters && filters < dateHeading && dateHeading < card)
})

test('search cannot retain the desktop 420px flex basis on mobile', () => {
  assert.match(invoiceBlock, /\.pos-invoices-toolbar label\s*\{[^}]*height:\s*44px;[^}]*flex:\s*0 0 44px;/s)
  assert.doesNotMatch(invoiceBlock, /margin-top:\s*auto|position:\s*absolute|transform:\s*translateY/)
})

test('search, filters, date heading and cards use compact explicit gaps', () => {
  assert.match(invoiceBlock, /\.pos-invoices-toolbar\s*\{[^}]*gap:\s*10px;/s)
  assert.match(invoiceBlock, /\.pos-invoices-workspace\s*\{[^}]*padding:\s*8px 10px 0;/s)
  assert.match(invoiceBlock, /\.pos-invoice-date-group\s*\{[^}]*gap:\s*10px;/s)
  assert.match(invoiceBlock, /\.pos-invoice-date-group > div\s*\{[^}]*gap:\s*10px;/s)
})

test('three filters stay in one touch-safe row', () => {
  assert.equal((page.match(/setFilter\('(all|paid|refunded)'\)/g) || []).length, 3)
  assert.match(globals, /\.pos-invoices-toolbar \[role='group'\]\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/s)
  assert.match(invoiceBlock, /\.pos-invoices-toolbar \[role='group'\] button\s*\{[^}]*min-height:\s*44px;/s)
})

test('cards use natural compact height without clipping offsets', () => {
  const cardRule = invoiceBlock.match(/\.pos-invoice-ledger-row\s*\{([^}]*)\}/s)?.[1] || ''
  assert.match(cardRule, /height:\s*auto;[^}]*min-height:\s*132px;/s)
  assert.match(cardRule, /border-radius:\s*15px;[^}]*padding:\s*12px;/s)
  assert.equal(cardRule.split(';').map((value) => value.trim()).filter((value) => value.startsWith('height:')).join(';'), 'height: auto')
  assert.doesNotMatch(cardRule, /margin-(?:top|bottom):\s*-|translate/)
})

test('card rows preserve all authoritative invoice fields', () => {
  for (const field of ['invoice-number', 'customer', 'time', 'payment', 'total', 'status']) {
    assert.match(page, new RegExp(`data-column="${field}"`))
  }
  assert.match(page, /data-mobile-invoice-details-trigger[^>]*aria-label=\{`عرض تفاصيل الفاتورة/)
})

test('invoice and monetary values remain bidi isolated and tabular', () => {
  assert.match(page, /className="is-invoice-number" dir="ltr"/)
  assert.match(invoiceBlock, /font-variant-numeric:\s*tabular-nums;[^}]*unicode-bidi:\s*isolate;/s)
})

test('search and clearing behavior remain unchanged', () => {
  assert.match(page, /onChange=\{\(event\) => updateSearch\(event\.target\.value\)\}/)
  assert.match(page, /aria-label="مسح البحث"[^>]*onClick=\{\(\) => updateSearch\(''\)\}/)
  assert.match(page, /if \(!nextQuery\) \{\s*setSearchResults\(null\)/s)
})

test('paid refunded and all filters retain the existing state contract', () => {
  assert.match(page, /filter === 'all'/)
  assert.match(page, /filter === 'paid'/)
  assert.match(page, /filter === 'refunded'/)
  assert.match(page, /status === 'refunded'/)
})

test('only the invoice ledger owns vertical scrolling', () => {
  assert.match(invoiceBlock, /\.pos-invoices-page\s*\{[^}]*overflow:\s*hidden;/s)
  assert.match(invoiceBlock, /\.pos-invoices-workspace\s*\{[^}]*overflow:\s*hidden;/s)
  assert.match(invoiceBlock, /\.pos-invoice-ledger\s*\{[^}]*overflow-y:\s*auto;/s)
})

test('safe-area reservation exists once on the real scroll owner', () => {
  assert.match(invoiceBlock, /\.pos-invoices-workspace\s*\{[^}]*padding:\s*8px 10px 0;/s)
  assert.equal((invoiceBlock.match(/max\(12px, calc\(env\(safe-area-inset-bottom\) \+ 8px\)\)/g) || []).length, 1)
  assert.match(invoiceBlock, /padding-bottom:\s*var\(--pos-invoice-mobile-bottom-clearance\)/)
})

test('loading empty and error states stay compact', () => {
  assert.match(invoiceBlock, /\.pos-invoice-ledger-empty,[\s\S]*?\.pos-invoice-ledger-loading,[\s\S]*?\.pos-invoice-ledger \.pos-history-error\s*\{[^}]*min-height:\s*0;[^}]*padding:\s*28px 16px;/s)
})

test('mobile rules remain bounded below the protected tablet breakpoint', () => {
  assert.match(mobile, /@media \(max-width: 767\.98px\),\s*\(max-height: 500px\) and \(hover: none\) and \(pointer: coarse\)/)
  assert.doesNotMatch(invoiceBlock, /@media\s*\(min-width:\s*768px\)/)
})

test('the change introduces no API SQL or business mutation surface', () => {
  assert.doesNotMatch(invoiceBlock, /fetch\(|supabase|insert|update|delete|rpc\(/i)
  assert.doesNotMatch(page, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/)
})
