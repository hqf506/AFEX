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
const paymentMethods = read('lib/invoices/payment-method.ts')
const tabletFrame = read('components/pos-tablet-frame.tsx')
const posHome = read('app/pos/page.tsx')
const customerStep = read('components/invoice-customer-step.tsx')
const itemsStep = read('components/invoice-items-step.tsx')
const activePosItemsLayout = itemsStep.slice(
  itemsStep.indexOf("if (variant === 'pos')"),
  itemsStep.indexOf('const renderLegacyPosItemsLayout')
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
    customerStep.includes('order-6 flex w-full') &&
    customerStep.includes('sm:w-[206px]'),
  'Customer POS sidebars must stack on phones and preserve tablet widths'
)
assert.equal(
  (customerStep.match(/visibleCustomerCards\.slice\(0, customerListLimit\)\.map/g) || []).length,
  1,
  'Customer results must keep one shared responsive map'
)
assert.equal(
  (customerStep.match(/onClick=\{handleCreateCustomer\}/g) || []).length,
  1,
  'Customer creation must keep one guarded save action'
)
assert.ok(
  customerStep.includes('contents sm:order-1 sm:flex') &&
    customerStep.includes('contents sm:order-2 sm:flex') &&
    customerStep.includes('role="dialog"') &&
    customerStep.includes('aria-modal="true"') &&
    customerStep.includes('items-start justify-center overflow-y-auto'),
  'Customer step must preserve one responsive tree and a keyboard-safe dialog'
)
assert.ok(
  (customerStep.match(/window\.clearTimeout\(loadingTimeoutId\)/g) || []).length >= 3,
  'Recent customer cache success, failure, and cleanup must not leave loading active'
)
assert.equal(
  (activePosItemsLayout.match(/paginatedProducts\.map\(/g) || []).length,
  1,
  'Active POS items layout must render products from one shared map'
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
    activePosItemsLayout.includes('grid-cols-2') &&
    !activePosItemsLayout.includes('window.innerWidth'),
  'POS product browsing must remain single-tree, touch-first, and CSS responsive'
)
assert.ok(
  activePosItemsLayout.includes("'fixed inset-0 z-50 flex'") &&
    activePosItemsLayout.includes('overflow-y-auto overscroll-contain rounded-none') &&
    activePosItemsLayout.includes('md:overflow-hidden md:rounded-[28px]') &&
    activePosItemsLayout.includes('md:flex-1 md:overflow-y-auto') &&
    (activePosItemsLayout.match(/className="flex h-11 w-11/g) || []).length >= 3,
  'Phone cart must use one full-width scroll surface with accessible item controls'
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
assert.ok(drafts.includes('POS_UX_MESSAGES.draftSyncUncertain'), 'offline uncertain outcome is missing')
assert.ok(drafts.includes('window.confirm('), 'offline draft deletion confirmation is missing')
assert.ok(pin.includes('POS_UX_MESSAGES.networkFailure'), 'PIN network failure is not separated')

for (const label of ['نقدي', 'مدى', 'فيزا', 'الدفع عند الاستلام']) {
  assert.ok(paymentMethods.includes(label), `standard payment label is missing: ${label}`)
}

for (const file of [messages, checkout, drafts, pin, paymentMethods]) {
  assert.ok(!/\b(?:Loading|Submitting|Try again|Something went wrong)\b/.test(file), 'English POS fallback remains')
}

console.log('POS UX recovery contract checks passed.')
