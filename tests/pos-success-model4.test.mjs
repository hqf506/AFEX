import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const componentPath = new URL('../components/pos-invoice-success-workspace.tsx', import.meta.url)
const modulePath = new URL('../components/pos-invoice-success-workspace.module.css', import.meta.url)
const pagePath = new URL('../app/pos/sale/success/page.tsx', import.meta.url)
const component = fs.readFileSync(componentPath, 'utf8')
const css = fs.readFileSync(modulePath, 'utf8')
const page = fs.readFileSync(pagePath, 'utf8')

test('Model 4 uses the exact approved Arabic hierarchy', () => {
  for (const label of ['تم إنشاء الفاتورة', 'بدء عملية بيع جديدة', 'واتساب', 'طباعة', 'عرض الفاتورة', 'عودة تلقائية خلال']) {
    assert.match(component, new RegExp(label))
  }
  assert.ok(component.indexOf('data-success-icon') < component.indexOf('<h1>تم إنشاء الفاتورة</h1>'))
  assert.ok(component.indexOf('<h1>تم إنشاء الفاتورة</h1>') < component.indexOf('className={styles.invoiceNumber}'))
  assert.ok(component.indexOf('className={styles.invoiceNumber}') < component.indexOf('className={styles.total}'))
})

test('there is one guarded primary new-sale action', () => {
  assert.equal((component.match(/data-success-primary-action/g) || []).length, 1)
  assert.match(component, /if \(navigationPending\) return/)
  assert.match(component, /setNavigationPending\(true\)/)
  assert.match(component, /props\.onNewSale\(\)/)
})

test('there are exactly three approved secondary actions', () => {
  assert.equal((component.match(/data-success-secondary-action=/g) || []).length, 3)
  for (const key of ['whatsapp', 'print', 'invoice']) {
    assert.match(component, new RegExp(`data-success-secondary-action="${key}"`))
  }
  assert.doesNotMatch(component, /طباعة الإيصال الحراري|طباعة الفاتورة PDF/)
})

test('invoice number and total use authoritative snapshot data and formatter', () => {
  assert.match(component, /snapshot\.invoiceNumber \|\| '—'/)
  assert.match(component, /formatCurrency\(snapshot\.finalTotal\)/)
  assert.doesNotMatch(component, /02-0039|276\.00/)
})

test('the primary screen has no receipt, item list, customer profile, or financial breakdown', () => {
  const start = component.indexOf('<section className={styles.primaryScreen}')
  const end = component.indexOf('{detailsOpen ? (')
  const primary = component.slice(start, end)
  assert.doesNotMatch(primary, /invoiceItems\.map|المجموع الفرعي|الضريبة|طريقة الدفع|customerName/)
})

test('WhatsApp exposes a truthful unavailable state without revealing a phone number', () => {
  assert.match(component, /const whatsappAvailable = Boolean\(snapshot\.customerPhone && props\.whatsappEnabled\)/)
  assert.match(component, /disabled=\{!whatsappAvailable \|\| props\.whatsappOpening\}/)
  assert.match(component, /واتساب غير متاح/)
  assert.match(component, /تم فتح نافذة المشاركة — لم يُثبت التسليم/)
  assert.match(component, /تعذر تجهيز رقم العميل للمشاركة/)
  assert.doesNotMatch(component, /\{snapshot\.customerPhone\}/)
})

test('page preserves stored success data and does not recreate an invoice on refresh', () => {
  assert.match(page, /parseStoredInvoiceSuccessSnapshot/)
  assert.match(page, /sessionStorage\.getItem\(INVOICE_SUCCESS_STORAGE_KEY\)/)
  assert.doesNotMatch(page, /fetch\(['"]\/api\/orders/)
  assert.doesNotMatch(page, /fetch\(['"]\/api\/invoices\/(?:create|checkout)/)
  assert.doesNotMatch(page, /method:\s*['"]POST['"]/)
})

test('countdown owns one timed redirect and clears both timers on unmount', () => {
  const start = page.indexOf('const redirectTimer = window.setTimeout')
  const end = page.indexOf('}, [router, snapshot])', start)
  const countdownEffect = page.slice(start, end)
  assert.equal((countdownEffect.match(/router\.push\('\/pos'\)/g) || []).length, 1)
  assert.match(countdownEffect, /window\.clearTimeout\(redirectTimer\)/)
  assert.match(countdownEffect, /window\.clearInterval\(countdownTimer\)/)
})

test('invoice view is contained, internally scrollable, and accessible', () => {
  assert.match(component, /role="dialog"/)
  assert.match(component, /aria-modal="true"/)
  assert.match(component, /event\.key === 'Escape'/)
  assert.match(component, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(component, /const returnFocus = detailsTriggerRef\.current/)
  assert.match(component, /returnFocus\?\.focus\(\)/)
  assert.match(css, /max-height:\s*calc\(100dvh/)
  assert.match(css, /\.dialogScroll[\s\S]*overflow-y:\s*auto/)
})

test('touch targets and tablet responsive contracts are explicit', () => {
  assert.match(css, /\.newSale[\s\S]*min-height:\s*72px/)
  assert.match(css, /\.secondaryActions button[\s\S]*min-height:\s*78px/)
  assert.match(css, /\.returnNow[\s\S]*min-height:\s*44px/)
  assert.match(css, /width:\s*min\(100%, 920px\)/)
  assert.match(css, /overflow:\s*hidden/)
})

test('short mobile landscape keeps the primary action visible and owns vertical overflow', () => {
  assert.match(css, /@media \(orientation: landscape\) and \(max-width: 932px\) and \(max-height: 430px\)/)
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*?\.primaryScreen \{[\s\S]*?justify-content: flex-start;[\s\S]*?overflow-y: auto;/)
  assert.match(css, /@media \(orientation: landscape\)[\s\S]*?\.newSale \{ min-height: 48px;/)
})

test('active Model 4 styles contain no forbidden visual identities', () => {
  assert.doesNotMatch(css, /green|cyan|emerald|gradient/i)
  assert.doesNotMatch(css, /backdrop-filter|backdrop-blur/i)
})

test('the page preserves existing WhatsApp, official PDF, thermal auto-print, reset, and redirect contracts', () => {
  for (const contract of [
    'normalizeWhatsAppDestination',
    'loadOfficialInvoicePdf',
    'runThermalPrint',
    'beginNewInvoiceSaleCycle',
    "router.replace('/pos/sale/customer')",
    "router.push('/pos')",
  ]) assert.ok(page.includes(contract), `missing ${contract}`)
})
