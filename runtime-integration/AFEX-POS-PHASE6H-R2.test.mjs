import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const items = read('components/invoice-items-step.tsx')
const checkout = read('app/pos/sale/checkout/page.tsx')
const hook = read('hooks/use-invoice-checkout.ts')
const nav = read('components/pos-mobile-bottom-navigation.tsx')
const shell = read('components/pos-shell/pos-responsive-shell.tsx')
const css = read('app/globals.css')

test('catalog continuation is automatic, sequential and has no manual load control', () => {
  assert.doesNotMatch(items, />\s*تحميل المزيد\s*</)
  assert.match(items, /window\.setTimeout\(loadNextCatalogPage, 80\)/)
  assert.match(items, /catalogAdvancePendingRef\.current/)
  assert.match(items, /catalogProducts\.length/)
  assert.match(items, /afex-catalog-background-status/)
})

test('cart is compact and header has left close without branch copy', () => {
  const sheet = items.slice(items.indexOf('<aside id="pos-cart-panel"'), items.indexOf('</aside>', items.indexOf('<aside id="pos-cart-panel"')))
  assert.doesNotMatch(sheet, /الفرع: \{invoiceBranchName\}/)
  assert.match(sheet, /ملخص الفاتورة[\s\S]*\{invoiceItemCount\}[\s\S]*aria-label="إغلاق ملخص الفاتورة"/)
  assert.match(css, /min-height: 104px/)
  assert.match(css, /\[data-mobile-cart-footer\][^{]*\{[^}]*background: var\(--afex-pos-panel\)/)
})

test('thermal curtain uses the authoritative print renderer without routing', () => {
  assert.match(checkout, /onPreview=\{\(\) => setShowThermalPreview\(true\)\}/)
  assert.match(checkout, /<PosThermalDraftPreview/)
  assert.doesNotMatch(checkout, /onBack=\{\(\) => router\.push\('\/pos\/sale\/items'\)\}/)
})

test('cash starts empty and insufficient cash cannot reach submit', () => {
  assert.match(hook, /setCashReceivedInput\(\(\) => \{[\s\S]*return ''/)
  assert.match(checkout, /numericCashReceived < checkout\.finalTotal/)
  assert.match(checkout, /showCashAmountDialog/)
  assert.match(checkout, /أدخل المبلغ المستلم من العميل/)
  assert.match(checkout, /تأكيد المبلغ/)
  assert.match(checkout, /submitLockedRef\.current/)
})

test('checkout dock is solid and bottom navigation order is exact', () => {
  assert.match(checkout, /data-checkout-submit-bar[^\n]*bg-\[#020817\]/)
  assert.doesNotMatch(checkout, /data-checkout-submit-bar[^\n]*backdrop-blur/)
  const labels = [...nav.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(labels, ['الإعدادات', 'حالة الطلبات', 'الفواتير', 'الرئيسية'])
  assert.match(shell, /\{isPosHome \? <PosMobileBottomNavigation \/> : null\}/)
})
