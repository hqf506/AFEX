import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { hasPersistedInvoiceSaleDraft } from '../lib/invoices/sale-navigation-decision.ts'

const shell = readFileSync(new URL('../components/pos-shell/pos-responsive-shell.tsx', import.meta.url), 'utf8')
const shellLayout = readFileSync(new URL('../components/pos-shell-layout.tsx', import.meta.url), 'utf8')
const dialog = readFileSync(new URL('../components/pos-shell/pos-sale-home-confirmation-dialog.tsx', import.meta.url), 'utf8')
const checkoutHook = readFileSync(new URL('../hooks/use-invoice-checkout.ts', import.meta.url), 'utf8')
const customer = readFileSync(new URL('../components/invoice-customer-step.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return { getItem: (key) => values.get(key) ?? null, snapshot: () => Object.fromEntries(values) }
}

test('all three sale routes share one explicit POS-home control', () => {
  assert.match(shell, /const isSaleRoute = pathname\.startsWith\('\/pos\/sale\/'\)/)
  assert.match(shell, /className="afex-pos-sale-home"[^>]*aria-label="العودة إلى نقطة البيع"/)
  assert.match(shell, /router\.replace\('\/pos'\)/)
  assert.doesNotMatch(shell, /router\.back\(/)
})

test('empty draft navigates directly while every persisted draft class confirms', () => {
  const keys = { customer: 'invoice_customer', items: 'invoice_sale_items', checkout: 'invoice_sale_checkout' }
  assert.equal(hasPersistedInvoiceSaleDraft(storage(), keys), false)
  assert.equal(hasPersistedInvoiceSaleDraft(storage({ invoice_customer: JSON.stringify({ customerId: 'c', name: 'عميل', phone: '0500000000' }) }), keys), true)
  assert.equal(hasPersistedInvoiceSaleDraft(storage({ invoice_sale_items: JSON.stringify({ items: [{ item_name: 'خدمة' }] }) }), keys), true)
  assert.equal(hasPersistedInvoiceSaleDraft(storage({ invoice_sale_checkout: JSON.stringify({ selectedDiscount: { id: 'd' }, note: '' }) }), keys), true)
  assert.equal(hasPersistedInvoiceSaleDraft(storage({ invoice_sale_checkout: JSON.stringify({ selectedDiscount: null, note: 'ملاحظة محفوظة' }) }), keys), true)
})

test('confirmation copy and outcomes preserve the draft', () => {
  assert.match(dialog, /العودة إلى نقطة البيع؟/)
  assert.match(dialog, /ستبقى مسودة عملية البيع محفوظة ويمكنك متابعتها لاحقًا/)
  assert.match(dialog, />العودة إلى نقطة البيع</)
  assert.match(dialog, />متابعة عملية البيع</)
  assert.match(shell, /PosSaleHomeConfirmationDialog open=\{saleHomeConfirmOpen\}[\s\S]{0,180}onConfirm=\{\(\) => router\.replace\('\/pos'\)\}/)
  assert.match(shell, /PosSaleHomeConfirmationDialog open=\{saleHomeConfirmOpen\} onCancel=\{\(\) => setSaleHomeConfirmOpen\(false\)\}/)
  const navigationBlock = shell.slice(shell.indexOf('const returnToPosHome'), shell.indexOf('const menu'))
  assert.doesNotMatch(navigationBlock, /removeItem|clear|cancel|request/i)
})

test('customer, items, discount and note drafts remain locally resumable', () => {
  assert.match(customer, /selectExistingCustomer[\s\S]*localStorage\.setItem\(INVOICE_CUSTOMER_STORAGE_KEY/)
  assert.match(checkoutHook, /INVOICE_SALE_CHECKOUT_STORAGE_KEY/)
  assert.match(checkoutHook, /serializeInvoiceSaleCheckoutDraft\(\{ paymentMethod, selectedDiscount, note, cashReceivedInput \}\)/)
  assert.match(checkoutHook, /persistSaleDraft/)
})

test('header control is structural, safe-area aware and at least 44px', () => {
  assert.match(css, /\.afex-pos-sale-header \{[^}]*grid-template-columns: 44px max-content minmax\(0, 1fr\) max-content;[^}]*safe-area-inset-left[^}]*safe-area-inset-right/s)
  assert.match(css, /\.afex-pos-sale-home \{[^}]*min-width: 44px;[^}]*min-height: 44px;/s)
  assert.doesNotMatch(css, /\.afex-pos-sale-home \{[^}]*position: fixed;/s)
  assert.match(css, /@media \(max-width: 339px\)[\s\S]*\.afex-pos-sale-home span/)
  const textHideRule = css.indexOf('.afex-pos-sale-home span { position: absolute')
  assert.ok(textHideRule > css.indexOf('@media (max-width: 339px)'))
})

test('the production header establishes a normal-flow sticky stacking layer above route content', () => {
  assert.match(shellLayout, /<PosResponsiveShell>\{children\}<\/PosResponsiveShell>/)
  assert.match(css, /\.afex-pos-sale-header \{[^}]*position: sticky;[^}]*z-index: 60;[^}]*isolation: isolate;/s)
  assert.doesNotMatch(css, /\.afex-pos-sale-header \{[^}]*(?:position: fixed|position: absolute)/s)
})

test('navigation does not touch authority, checkout, Core or business APIs', () => {
  const handler = shell.slice(shell.indexOf('const returnToPosHome'), shell.indexOf('const menu'))
  assert.doesNotMatch(handler, /endPosActorSession|signOut|clearActive|fetch\(|\/api\/|checkout|execute|acquire/i)
})
