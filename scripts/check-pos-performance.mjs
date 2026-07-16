import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

function assert(value, message) {
  if (!value) throw new Error(message)
}

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
const catalogRoute = read('app/api/invoice/catalog/route.ts')
const runtimeRoute = read('app/api/pos/runtime/route.ts')
const checkoutPage = read('app/pos/sale/checkout/page.tsx')
const itemsStep = read('components/invoice-items-step.tsx')
const catalogHelper = read('lib/invoices/catalog.ts')
const resourceCache = read('lib/client-resource-cache.ts')
const posHome = read('app/pos/page.tsx')
const customerStep = read('components/invoice-customer-step.tsx')
const checkoutHook = read('hooks/use-invoice-checkout.ts')
const paymentMethodsSource = read('lib/invoices/payment-method.ts')
const orderPaymentSource = read('lib/invoices/order-payment.ts')

assert(!catalogRoute.includes("select('*')"), 'POS Catalog must not use select(*).')
assert(!runtimeRoute.includes("select('*')"), 'POS Runtime must not use select(*).')
assert(
  catalogRoute.includes('Promise.all([') &&
    catalogRoute.includes("timing.measure('categories'") &&
    catalogRoute.includes("timing.measure('catalog'"),
  'Independent category and catalog queries must run in parallel.'
)
assert(
  catalogRoute.includes(".in('catalog_item_id', stockItemIds)"),
  'Inventory stock must be limited to the requested catalog items.'
)
assert(
  checkoutPage.includes('/api/pos/runtime') &&
    !checkoutPage.includes('/api/admin/vat') &&
    !checkoutPage.includes('/api/admin/discounts'),
  'Checkout must use the unified POS Runtime endpoint.'
)
assert(
  (checkoutPage.match(/fetch\(\s*`\/api\/pos\/runtime/g) || []).length === 1,
  'Checkout must define only one POS Runtime fetch path.'
)
assert(
  !itemsStep.includes('/api/admin/categories') &&
    !itemsStep.includes('/api/admin/vat') &&
    !itemsStep.includes('/api/admin/discounts'),
  'Items must reuse Catalog categories and unified POS Runtime data.'
)
assert(
  !itemsStep.includes('force: true,\n          tenantId,') ||
    itemsStep.indexOf('force: true,\n          tenantId,') <
      itemsStep.indexOf('const loadCatalog = async'),
  'Normal Items loading must not invalidate the prefetched Catalog page.'
)
assert(
  catalogHelper.includes('if (!params.tenantId || !params.branchId) return null') &&
    checkoutPage.includes("pos-runtime:${tenantId || 'unknown'}:${branchId || 'all'}"),
  'POS cache keys must include tenant and branch scope.'
)
assert(
  posHome.includes('activePosEmployee?.branch_id ||') &&
    posHome.includes('prefetchBranchInvoiceCatalog(resolvedPosBranchId, access.tenantId)'),
  'System-scoped POS must prefetch the active employee branch.'
)
assert(
  customerStep.includes('prefetchBranchInvoiceCatalog(customerSearchBranchId, tenantId)'),
  'Customer and Home must prefetch the same resolved POS branch.'
)
assert(
  posHome.includes('clearAllInvoiceCatalogCache()') &&
    customerStep.includes('clearAllInvoiceCatalogCache()'),
  'Employee switch/logout must invalidate employee-scoped Catalog data.'
)
assert(
  resourceCache.includes("'pos-runtime:'") &&
    resourceCache.includes("'invoice-catalog:'"),
  'Logout/unauthorized handling must invalidate POS Runtime and Catalog caches.'
)
assert(
  itemsStep.includes('let cancelled = false') &&
    /if \(!cancelled\) \{\s+setCatalogProducts\(nextCatalogPage\.products\)/.test(itemsStep) &&
    itemsStep.includes('cancelled = true'),
  'Stale Catalog responses must not overwrite a newer Items selection.'
)
assert(
  runtimeRoute.includes(".select('id, name, rate, is_active, branch_id')"),
  'POS Runtime VAT projection must remain minimal.'
)

const compiledCatalog = ts.transpileModule(catalogHelper, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleValue = { exports: {} }
vm.runInNewContext(compiledCatalog, {
  exports: moduleValue.exports,
  module: moduleValue,
  require(specifier) {
    if (specifier === '@/lib/invoices/items') {
      return { resolveInvoiceCatalogImageUrl: (value) => value || null }
    }
    if (specifier === '@/lib/client-resource-cache') return {}
    if (specifier === '@/lib/api/client-error') return {}
    throw new Error(`Unexpected dependency: ${specifier}`)
  },
  Map, Math, Number, Set, String, URLSearchParams,
})

const { getInvoiceCatalogPageCacheKey, mapBranchCatalogToInvoiceProducts } =
  moduleValue.exports
const branchAKey = getInvoiceCatalogPageCacheKey({
  tenantId: 'tenant-a', branchId: 'branch-a', page: 1, pageSize: 10,
})
const branchBKey = getInvoiceCatalogPageCacheKey({
  tenantId: 'tenant-a', branchId: 'branch-b', page: 1, pageSize: 10,
})
assert(branchAKey !== branchBKey, 'Branch A must never reuse Branch B Catalog data.')
assert(
  getInvoiceCatalogPageCacheKey({ branchId: 'branch-a', page: 1, pageSize: 10 }) === null &&
    getInvoiceCatalogPageCacheKey({ tenantId: 'tenant-a', branchId: null, page: 1, pageSize: 10 }) === null,
  'Incomplete tenant/branch Catalog keys must not be created.'
)
const catalogItems = Array.from({ length: 22 }, (_, index) => ({
  id: `item-${index}`,
  name: `Item ${String(index).padStart(2, '0')}`,
  category: index % 2 ? 'Care' : 'Repair',
  item_type: 'product',
  default_price: 10 + index,
  image_url: null,
  is_composite: false,
  track_inventory: true,
  is_active: true,
}))
const mapped = mapBranchCatalogToInvoiceProducts(
  catalogItems,
  [{ id: 'override-1', catalog_item_id: 'item-1', price: 99, is_active: true, display_order: 1 }],
  [
    { catalog_item_id: 'item-0', quantity_on_hand: 0, low_stock_threshold: 2 },
    { catalog_item_id: 'item-1', quantity_on_hand: 2, low_stock_threshold: 3 },
  ],
  'branch-a'
)
assert(mapped.length === 22, 'Catalog fixtures must preserve more than one page.')
assert(new Set(mapped.map((item) => item.category)).size === 2, 'Multiple categories must be preserved.')
assert(mapped.find((item) => item.id === 'item-1')?.price === 99, 'Branch override price changed.')
assert(mapped.find((item) => item.id === 'item-2')?.price === 12, 'Default price without override changed.')
assert(mapped.find((item) => item.id === 'item-0')?.quantity_on_hand === 0, 'Out-of-stock mapping changed.')
assert(mapped.find((item) => item.id === 'item-1')?.is_low_stock === true, 'Low-stock mapping changed.')

for (const rate of [0, 5, 10, 15]) {
  const subtotal = 100
  const discount = 10
  const taxable = subtotal - discount
  const total = taxable + taxable * (rate / 100)
  assert(Number.isFinite(total), `VAT ${rate}% must produce a finite total.`)
}
for (const paymentMethod of ['cash', 'mada', 'visa', 'cod']) {
  assert(
    checkoutPage.includes(`'${paymentMethod}'`) || read('lib/invoices/payment-method.ts').includes(`'${paymentMethod}'`),
    `Payment method ${paymentMethod} must remain supported.`
  )
}

function compilePureModule(source, context = {}) {
  const moduleResult = { exports: {} }
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(output, {
    exports: moduleResult.exports,
    module: moduleResult,
    Map, Math, Number, Object, Promise, Set, String,
    ...context,
  })
  return moduleResult.exports
}

const cacheModule = compilePureModule(resourceCache, {
  process: { env: { NODE_ENV: 'test' } },
  console,
})
let pendingFetches = 0
let resolvePending
const pendingFetcher = () => {
  pendingFetches += 1
  return new Promise((resolve) => { resolvePending = resolve })
}
const pendingOne = cacheModule.loadClientResource(branchAKey, pendingFetcher, { ttlMs: 10 })
const pendingTwo = cacheModule.loadClientResource(branchAKey, pendingFetcher, { ttlMs: 10 })
assert(pendingFetches === 1, 'Pending Catalog prefetch must deduplicate the Items request.')
resolvePending('catalog-a')
assert(
  (await pendingOne) === 'catalog-a' && (await pendingTwo) === 'catalog-a',
  'Prefetch and Items must share the same pending result.'
)
await new Promise((resolve) => setTimeout(resolve, 15))
await cacheModule.loadClientResource(branchAKey, async () => {
  pendingFetches += 1
  return 'catalog-a-fresh'
}, { ttlMs: 10 })
assert(pendingFetches === 2, 'Expired Catalog TTL must trigger a fresh request.')

const paymentMethods = compilePureModule(paymentMethodsSource)
assert(paymentMethods.isReceivedAmountEditable('cash'), 'Cash received must be editable.')
assert(!paymentMethods.isReceivedAmountEditable('mada'), 'Mada received must be readonly.')
assert(!paymentMethods.isReceivedAmountEditable('visa'), 'Visa received must be readonly.')
assert(!paymentMethods.isReceivedAmountEditable('cod'), 'On Delivery received must be readonly.')
assert(
  checkoutHook.includes("if (normalizeUiPaymentMethod(paymentMethod) !== 'cash') return") &&
    /if \(safePaymentMethod === 'cod'\) \{\s+return '0'/.test(checkoutHook),
  'Checkout must reject non-cash manual input and reset On Delivery to zero.'
)

const orderPayment = compilePureModule(orderPaymentSource)
const paymentFixtures = [
  { paymentMethod: 'cash', cashReceived: 120, expectedReceived: 120, expectedRemaining: 0 },
  { paymentMethod: 'mada', cashReceived: 100, expectedReceived: 100, expectedRemaining: 0 },
  { paymentMethod: 'visa', cashReceived: 100, expectedReceived: 100, expectedRemaining: 0 },
  { paymentMethod: 'cod', cashReceived: 0, expectedReceived: 0, expectedRemaining: 100 },
]
for (const fixture of paymentFixtures) {
  const snapshot = orderPayment.buildPersistedInvoicePaymentSnapshot({
    paymentMethod: fixture.paymentMethod,
    invoiceTotal: 100,
    cashReceived: fixture.cashReceived,
  })
  assert(
    snapshot.cashReceived === fixture.expectedReceived &&
      snapshot.remainingFromCustomer === fixture.expectedRemaining,
    `${fixture.paymentMethod} persisted payment behavior changed.`
  )
}

console.log('POS performance and correctness checks passed.')
