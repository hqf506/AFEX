/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const messages = read('lib/pos-ux-messages.ts')
const checkout = read('hooks/use-invoice-checkout.ts')
const drafts = read('app/pos/offline-drafts/page.tsx')
const pin = read('app/pos/employee-pin/page.tsx')
const login = read('app/pos/login/page.tsx')
const globalStyles = read('app/globals.css')
const paymentMethods = read('lib/invoices/payment-method.ts')
const tabletFrame = read('components/pos-tablet-frame.tsx')
const posHome = read('app/pos/page.tsx')
const customerStep = read('components/invoice-customer-step.tsx')
const addCustomerModal = read('components/pos-add-customer-modal.tsx')
const itemsStep = read('components/invoice-items-step.tsx')
const checkoutStep = read('app/pos/sale/checkout/page.tsx')
const saleReset = read('lib/invoices/sale-reset.ts')
const successStep = read('app/pos/sale/success/page.tsx')
const successWorkspace = read('components/pos-invoice-success-workspace.tsx')
const posLayout = read('app/pos/layout.tsx')
const posThemeToggle = read('components/pos-theme-toggle.tsx')
const activePosItemsLayout = itemsStep.slice(
  itemsStep.indexOf("if (variant === 'pos')"),
  itemsStep.indexOf('const renderLegacyPosItemsLayout')
)
const interactiveCheckoutLayout = checkoutStep.slice(
  checkoutStep.indexOf('{hasInvalidBranchContext ?'),
  checkoutStep.indexOf('<div id="print-area"')
)

assert.equal(
  (tabletFrame.match(/\{children\}/g) || []).length,
  1,
  'PosTabletFrame must render the POS subtree exactly once'
)
assert.ok(
  tabletFrame.includes('pos-tablet-frame-root') &&
    tabletFrame.includes('pos-tablet-frame-shell') &&
    tabletFrame.includes('xl:h-[100dvh]') &&
    tabletFrame.includes('xl:bg-black'),
  'Single POS tree must preserve the responsive desktop tablet frame'
)
assert.ok(
  !tabletFrame.includes('pos-tablet-frame-mobile') &&
    !tabletFrame.includes('pos-tablet-frame-desktop'),
  'Separate mobile and desktop POS wrapper copies must not return'
)
assert.ok(
  login.includes('pos-entry-login') &&
    login.includes('autoComplete="username"') &&
    login.includes('autoComplete="current-password"') &&
    globalStyles.includes('.pos-entry-login form button[type=\'submit\']'),
  'Organization login must preserve password-manager semantics and the flat AFEX entry surface'
)
assert.ok(
  pin.includes('pos-entry-pin') &&
    pin.includes('getPinIndicatorState(pin.length, PIN_LENGTH)') &&
    pin.includes("const keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']") &&
    globalStyles.includes('.pos-entry-pin button'),
  'Employee PIN must preserve four closed indicators, the complete keypad and responsive touch targets'
)
assert.ok(
  posHome.includes('مرحباً بك، {employeeDisplayName}') &&
    globalStyles.includes('.pos-home-legacy-root > section'),
  'POS Home must use the effective employee identity inside the flat AFEX surface'
)
assert.ok(
  posHome.includes('function PosOperationalHome') &&
    posHome.includes('بدء عملية بيع') &&
    posHome.includes('عرض جميع الطلبات') &&
    posHome.includes('orders={recentOrders}') &&
    globalStyles.includes('.pos-operational-canvas') &&
    globalStyles.includes('.pos-orders-list-head') &&
    globalStyles.includes('@media (max-width: 767px)'),
  'POS Home must expose the compact operational dashboard and responsive order list'
)
assert.equal(
  (posHome.match(/fetch\(`\/api\/orders\?/g) || []).length,
  1,
  'POS Home redesign must retain exactly one recent-orders request owner'
)
assert.ok(
  !posHome.toLowerCase().includes('leather fix'),
  'POS Home must not contain legacy Leather Fix branding'
)
assert.ok(
  posHome.includes('flex-col items-stretch justify-between') &&
    posHome.includes('min-h-[44px] min-w-[44px]') &&
    posHome.includes('className="min-h-[44px] rounded-2xl'),
  'POS Home phone header and core touch targets must remain responsive'
)
assert.ok(
  posHome.includes('overflow-y-auto overscroll-contain p-3') &&
    posHome.includes('aria-label="تنقل نقطة البيع"') &&
    posHome.includes("aria-current={item.active ? 'page' : undefined}") &&
    posHome.includes('grid grid-cols-2 gap-3') &&
    posHome.includes('aria-label="ملخص الطلبات الظاهرة"') &&
    posHome.includes('grid-cols-1 gap-3 overflow-visible sm:grid-cols-2'),
  'POS Home must preserve its single-tree touch-first phone hierarchy'
)
assert.equal(
  (posHome.match(/recentOrders\.map\(/g) || []).length,
  1,
  'Recent orders must render from one shared map only'
)
assert.ok(
  customerStep.includes('flex-col gap-4 overflow-y-auto') &&
    customerStep.includes('sm:flex-row sm:overflow-hidden') &&
    customerStep.includes('order-6 hidden w-full') &&
    customerStep.includes('sm:order-3 sm:flex sm:w-[206px]'),
  'Customer POS sidebars must stack on phones and preserve tablet widths'
)
assert.equal(
  (customerStep.match(/visibleCustomerCards\.slice\(0, customerListLimit\)\.map/g) || []).length,
  2,
  'Customer results must keep one mobile-card map and one desktop-table map'
)
assert.ok(
  customerStep.includes('{isMobileViewport ? (') &&
    customerStep.includes(') : ('),
  'Customer result variants must be mutually exclusive at runtime'
)
assert.equal(
  (addCustomerModal.match(/onClick=\{handleCreateCustomer\}/g) || []).length,
  1,
  'Customer creation must keep one guarded save action'
)
assert.ok(
  addCustomerModal.includes('if (saving) return') &&
    addCustomerModal.includes('disabled={saving || !phoneValidation.valid}'),
  'Customer creation must reject duplicate saves and invalid phone input'
)
assert.ok(
  customerStep.includes('contents sm:order-1 sm:flex') &&
    customerStep.includes('contents sm:order-2 sm:flex') &&
    addCustomerModal.includes('role="dialog"') &&
    addCustomerModal.includes('aria-modal="true"') &&
    addCustomerModal.includes('className="pos-add-customer-backdrop"') &&
    addCustomerModal.includes('className="pos-add-customer-body"'),
  'Customer step must preserve one responsive tree and a keyboard-safe dialog'
)
assert.ok(
  (customerStep.match(/window\.clearTimeout\(loadingTimeoutId\)/g) || []).length >= 3,
  'Recent customer cache success, failure, and cleanup must not leave loading active'
)
assert.equal(
  (activePosItemsLayout.match(/paginatedProducts\.map\(/g) || []).length,
  2,
  'Active POS items layout must keep one mobile map and one desktop map'
)
assert.ok(
  activePosItemsLayout.includes('{isMobileViewport ? (') &&
    activePosItemsLayout.includes(') : ('),
  'Active POS product variants must be mutually exclusive at runtime'
)
assert.equal(
  (activePosItemsLayout.match(/squarePosCategoryLabels\.map\(/g) || []).length,
  1,
  'Active POS items layout must render categories from one shared map'
)
assert.equal(
  (activePosItemsLayout.match(/placeholder="ابحث عن منتج أو خدمة"/g) || []).length,
  1,
  'Active POS items layout must keep one search input'
)
assert.equal(
  (activePosItemsLayout.match(/setShowItemsModal\(true\)/g) || []).length,
  1,
  'Active POS items layout must keep one phone cart opener'
)
assert.ok(
  activePosItemsLayout.includes('aria-label="تصنيفات العناصر"') &&
    activePosItemsLayout.includes('aria-pressed={active}') &&
    activePosItemsLayout.includes('aria-controls="pos-cart-panel"') &&
    activePosItemsLayout.includes('afex-sale-product-grid--mobile') &&
    activePosItemsLayout.includes('afex-sale-product-grid--desktop') &&
    !activePosItemsLayout.includes('window.innerWidth'),
  'POS product browsing must remain single-tree, touch-first, and CSS responsive'
)
assert.ok(
  activePosItemsLayout.includes("'is-open pos-mobile-sheet-enter'") &&
    activePosItemsLayout.includes('afex-sale-cart') &&
    activePosItemsLayout.includes('afex-sale-mobile-summary') &&
    activePosItemsLayout.includes('data-mobile-cart-scroll-body') &&
    activePosItemsLayout.includes('data-mobile-cart-footer') &&
    (activePosItemsLayout.match(/className="flex h-11 w-11/g) || []).length >= 3,
  'Phone cart must use one full-width scroll surface with accessible item controls'
)
assert.ok(
  checkoutStep.includes('overflow-y-auto overscroll-contain') &&
    checkoutStep.includes('md:flex-row md:overflow-hidden') &&
    checkoutStep.includes('aria-pressed={selected}') &&
    checkoutStep.includes('inputMode="decimal"') &&
    checkoutStep.includes('md:overflow-y-auto md:pr-1') &&
    checkoutStep.includes('min-h-16 w-full flex-1') &&
    checkoutStep.includes('flex h-11 w-11 flex-none'),
  'POS checkout must keep one mobile scroll surface and accessible payment controls'
)
assert.equal(
  (interactiveCheckoutLayout.match(/PAYMENT_METHODS\.map\(/g) || []).length,
  2,
  'Interactive POS checkout must keep one mobile and one desktop payment-method control'
)
assert.equal(
  (interactiveCheckoutLayout.match(/invoiceItems\.map\(/g) || []).length,
  2,
  'Interactive POS checkout must keep one mobile and one desktop order-item list'
)
assert.equal(
  (interactiveCheckoutLayout.match(/placeholder="المبلغ المستلم"/g) || []).length,
  2,
  'Interactive POS checkout must keep one mobile and one desktop cash input'
)
assert.ok(
  interactiveCheckoutLayout.includes('{isMobileViewport ? (') &&
    interactiveCheckoutLayout.includes(') : ('),
  'Interactive POS checkout variants must be mutually exclusive at runtime'
)
assert.ok(
  !interactiveCheckoutLayout.includes('window.innerWidth'),
  'POS checkout responsive presentation must remain CSS-only'
)
assert.equal(
  (successWorkspace.match(/snapshot\.invoiceItems\.map\(/g) || []).length,
  1,
  'POS success receipt must render one responsive order-item list'
)
assert.ok(
  successWorkspace.includes('afex-success-mobile-card') &&
    successWorkspace.includes('afex-success-receipt'),
  'POS success workspace must expose responsive summary and receipt surfaces'
)
assert.equal(
  (successWorkspace.match(/onClick=\{props\.onNewSale\}/g) || []).length,
  1,
  'POS success page must keep one responsive New Sale action'
)
assert.ok(
  !successWorkspace.includes('/admin') &&
    successWorkspace.includes('aria-expanded={detailsOpen}') &&
    successWorkspace.includes('disabled={!snapshot.customerPhone'),
  'POS success page must preserve contained actions, disclosure semantics, and WhatsApp gating'
)
assert.ok(
  !successStep.includes('window.innerWidth'),
  'POS success responsive presentation must remain CSS-only'
)

for (const contractKey of [
  'wrongPin',
  'duplicatePin',
  'pinRateLimit',
  'uncertainSubmission',
  'orderSuccess',
  'orderFailure',
  'duplicateSubmission',
  'draftSaved',
  'draftSaveFailure',
  'draftSyncSuccess',
  'draftSyncUncertain',
  'printFailure',
  'whatsappFailure',
]) {
  assert.match(messages, new RegExp(`\\b${contractKey}:`), `missing POS UX message: ${contractKey}`)
}

assert.ok(checkout.includes('POS_UX_MESSAGES.uncertainSubmission'), 'uncertain checkout outcome is not explicit')
assert.match(
  checkout,
  /finally\s*\{\s*setLoading\(false\)/,
  'checkout loading is not reset in finally'
)
assert.ok(!checkout.includes('createOrderResult?.error ||'), 'checkout consumes a raw API error')

const clearSaleStateBody = saleReset.match(
  /export function clearCompletedInvoiceSaleState\(\)\s*\{([\s\S]*?)\n\}/
)?.[1]
assert.ok(clearSaleStateBody, 'completed sale cleanup helper is missing')

const createStorage = (entries) => {
  const values = new Map(entries)
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
  }
}
const successLocalStorage = createStorage([
  ['invoice_customer', 'customer'],
  ['invoice_sale_items', 'items'],
  ['unrelated', 'keep'],
])
const successSessionStorage = createStorage([
  ['invoice_success', 'previous-success'],
  ['pos_employee_session', 'keep'],
])
new Function(
  'window',
  'INVOICE_CUSTOMER_STORAGE_KEY',
  'INVOICE_SALE_ITEMS_STORAGE_KEY',
  'INVOICE_SUCCESS_STORAGE_KEY',
  'clearCompletedInvoiceDraftState',
  'clearPosCheckoutIdentity',
  clearSaleStateBody
)(
  { localStorage: successLocalStorage, sessionStorage: successSessionStorage },
  'invoice_customer',
  'invoice_sale_items',
  'invoice_success',
  () => {
    successLocalStorage.removeItem('invoice_customer')
    successLocalStorage.removeItem('invoice_sale_items')
    successSessionStorage.removeItem('invoice_success')
  },
  () => undefined
)
assert.equal(successLocalStorage.getItem('invoice_customer'), null)
assert.equal(successLocalStorage.getItem('invoice_sale_items'), null)
assert.equal(successSessionStorage.getItem('invoice_success'), null)
assert.equal(successLocalStorage.getItem('unrelated'), 'keep')
assert.equal(successSessionStorage.getItem('pos_employee_session'), 'keep')

const successCleanupIndex = checkoutStep.indexOf('clearCompletedInvoiceDraftState()')
const successSnapshotIndex = checkoutStep.indexOf(
  'sessionStorage.setItem(',
  successCleanupIndex
)
const successNavigationIndex = checkoutStep.indexOf(
  "router.push('/pos/sale/success')",
  successSnapshotIndex
)
assert.ok(
  successCleanupIndex > checkoutStep.indexOf('onInvoiceCreated:') &&
    successSnapshotIndex > successCleanupIndex &&
    successNavigationIndex > successSnapshotIndex,
  'successful sale must clear customer/cart state before storing success and navigating'
)
assert.equal(
  (checkout.match(/onInvoiceCreated\?\.\(/g) || []).length,
  1,
  'failure paths must not invoke successful sale cleanup'
)
assert.ok(drafts.includes('POS_UX_MESSAGES.draftSyncUncertain'), 'offline uncertain outcome is missing')
assert.ok(drafts.includes('window.confirm('), 'offline draft deletion confirmation is missing')
assert.ok(pin.includes('POS_UX_MESSAGES.networkFailure'), 'PIN network failure is not separated')

for (const label of ['نقدي', 'مدى', 'فيزا', 'الدفع عند الاستلام']) {
  assert.ok(paymentMethods.includes(label), `standard payment label is missing: ${label}`)
}

for (const file of [messages, checkout, drafts, pin, paymentMethods]) {
  assert.ok(!/\b(?:Loading|Submitting|Try again|Something went wrong)\b/.test(file), 'English POS fallback remains')
}

for (const color of [
  '#0d0e10', '#15171a', '#1b1d20', '#24262a', '#393a3d', '#f4f1ea',
  '#a9a49b', '#b89a64', '#9a7540', '#c7aa72', '#fbf8f2', '#eee9e0',
  '#e5ded2', '#d3c8b7', '#25221e', '#756f65', '#a6844f', '#8a6537', '#9b7440',
]) {
  assert.ok(globalStyles.toLowerCase().includes(color), `approved POS token is missing: ${color}`)
}
assert.ok(
  posLayout.includes("matchMedia('(prefers-color-scheme: light)')") &&
    posLayout.includes("localStorage.getItem(k)") &&
    posLayout.includes('dataset.posTheme'),
  'POS theme must initialize before hydration from persistence or system preference'
)
assert.ok(
  posThemeToggle.includes("window.localStorage.setItem(STORAGE_KEY, nextTheme)") &&
    posThemeToggle.includes('aria-label="التبديل بين الوضع الفاتح والداكن"'),
  'POS theme toggle must be persistent and keyboard accessible'
)
assert.ok(
  globalStyles.includes('grid-template-columns: minmax(0, 72fr) minmax(248px, 28fr)') &&
    globalStyles.includes('grid-template-columns: minmax(280px, 32fr) minmax(0, 68fr)') &&
    globalStyles.includes('grid-template-columns: repeat(4, minmax(0, 1fr))') &&
    globalStyles.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'),
  'POS catalog must preserve the approved desktop, tablet and mobile geometry'
)

console.log('POS UX recovery contract checks passed.')
