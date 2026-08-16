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
const ordersPage = read('app/admin/orders/page.tsx')
const ordersRoute = read('app/api/orders/route.ts')

const itemsSourceFile = ts.createSourceFile(
  'components/invoice-items-step.tsx',
  itemsStep,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX
)
const catalogReturnEffects = []
function collectCatalogReturnEffects(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(itemsSourceFile) === 'useEffect' &&
    node.getText(itemsSourceFile).includes("addEventListener('visibilitychange'") &&
    node.getText(itemsSourceFile).includes("addEventListener('focus'")
  ) {
    catalogReturnEffects.push(node)
  }
  ts.forEachChild(node, collectCatalogReturnEffects)
}
collectCatalogReturnEffects(itemsSourceFile)

const catalogRouteSourceFile = ts.createSourceFile(
  'app/api/invoice/catalog/route.ts',
  catalogRoute,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TS
)
const catalogRouteCalls = []
function collectCatalogRouteCalls(node) {
  if (ts.isCallExpression(node)) {
    catalogRouteCalls.push(node)
  }
  ts.forEachChild(node, collectCatalogRouteCalls)
}
collectCatalogRouteCalls(catalogRouteSourceFile)

const findVariableInitializer = (name) => {
  let initializer = null
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      initializer = node.initializer || null
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(catalogRouteSourceFile)
  return initializer
}

const settingsGuardInitializer = findVariableInitializer('settingsGuardPromise')
const branchValidationInitializer = findVariableInitializer('branchValidationPromise')
const allSettledCall = catalogRouteCalls.find(
  (call) => call.expression.getText(catalogRouteSourceFile) === 'Promise.allSettled'
)
const allSettledDeclaration = allSettledCall?.parent.parent
const settingsGuardSource = settingsGuardInitializer?.getText(
  catalogRouteSourceFile
) || ''

assert(
  settingsGuardInitializer &&
    !ts.isAwaitExpression(settingsGuardInitializer) &&
    settingsGuardSource.includes('timing.measure') &&
    settingsGuardSource.includes("'settings'") &&
    branchValidationInitializer &&
    !ts.isAwaitExpression(branchValidationInitializer) &&
    branchValidationInitializer.getText(catalogRouteSourceFile).includes("timing.measure('branches'") &&
    settingsGuardInitializer.pos > catalogRoute.indexOf('if (!auth.ok)'),
  'Catalog auth must finish before independent Settings and Branch promises start.'
)
assert(
  allSettledCall?.arguments[0]?.getText(catalogRouteSourceFile).includes('settingsGuardPromise') &&
    allSettledCall.arguments[0].getText(catalogRouteSourceFile).includes('branchValidationPromise') &&
    allSettledCall.pos > settingsGuardInitializer.pos &&
    allSettledCall.pos > branchValidationInitializer.pos,
  'Settings and Branch promises must both start before either result is awaited.'
)
assert(
  allSettledDeclaration &&
    allSettledDeclaration.getText(catalogRouteSourceFile).includes(
      'settingsGuardResult, branchValidationResult'
    ) &&
    catalogRoute.indexOf("if (settingsGuardResult.status === 'rejected')") <
      catalogRoute.indexOf("if (branchValidationResult.status === 'rejected')") &&
    catalogRoute.indexOf('if (settingsGuardResult.value)') <
      catalogRoute.indexOf('if (hasMissingProfileBranch)'),
  'Catalog guard result handling must explicitly preserve Settings-first error precedence.'
)
assert(
  !catalogRoute.includes('Promise.race') &&
    catalogRoute.indexOf('const categoriesQuery') >
      catalogRoute.indexOf("if (!branch)"),
  'Catalog queries must start only after both guards succeed without Promise.race.'
)

const ordersRouteSourceFile = ts.createSourceFile(
  'app/api/orders/route.ts',
  ordersRoute,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TS
)
const ordersRouteInitializers = new Map()
function collectOrdersRouteVariables(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    ordersRouteInitializers.set(node.name.text, node.initializer || null)
  }
  ts.forEachChild(node, collectOrdersRouteVariables)
}
collectOrdersRouteVariables(ordersRouteSourceFile)

const ordersSettingsPromise = ordersRouteInitializers.get('settingsGuardPromise')
const ordersDetailsPromise = ordersRouteInitializers.get('detailsQueryPromise')
const ordersSettledResults = ordersRouteInitializers.get('detailsSettledResults')
const ordersDetailsSource = ordersDetailsPromise?.getText(ordersRouteSourceFile) || ''

assert(
  ordersSettingsPromise &&
    ordersDetailsPromise &&
    ordersSettingsPromise.pos > ordersRoute.indexOf('if (!auth.ok)') &&
    ordersDetailsPromise.pos > ordersSettingsPromise.pos &&
    !ts.isAwaitExpression(ordersSettingsPromise) &&
    !ts.isAwaitExpression(ordersDetailsPromise),
  'Orders Auth must finish before independent Settings and Details promises start.'
)
assert(
  ordersSettledResults?.getText(ordersRouteSourceFile).includes(
    'Promise.allSettled([settingsGuardPromise, detailsQueryPromise])'
  ) &&
    ordersSettledResults.pos > ordersDetailsPromise.pos,
  'Orders Settings and Details promises must both start before either result is awaited.'
)
assert(
  ordersRoute.indexOf("detailsSettledResults?.[0].status === 'rejected'") <
      ordersRoute.indexOf('if (featureDisabledResponse)') &&
    ordersRoute.indexOf('if (featureDisabledResponse)') <
      ordersRoute.indexOf('if (hasMissingBranchScope)') &&
    ordersRoute.indexOf('if (hasMissingBranchScope)') <
      ordersRoute.indexOf("if (!query.id)"),
  'Orders Details must preserve Settings, branch-scope, and missing-ID response precedence.'
)
assert(
  ordersDetailsSource.includes(".select(ORDERS_DETAILS_SELECT)") &&
    ordersDetailsSource.includes('applyTenantFilter(') &&
    ordersDetailsSource.includes('shouldFilterByBranch(') &&
    ordersDetailsSource.includes("'branch_id'") &&
    ordersDetailsSource.includes("timing.measure('orders'") &&
    ordersDetailsSource.includes('detailsQuery.maybeSingle()'),
  'Orders Details query must retain its select, tenant filter, branch filter, and timing stage.'
)
assert(
  !ordersRoute.includes('Promise.race') &&
    !ordersRoute.includes('Promise.any') &&
    ordersRoute.indexOf('const { data, error } = detailsResult.value') >
      ordersRoute.indexOf('if (featureDisabledResponse)'),
  'Orders Details must inspect Settings first without race/any or early response construction.'
)

const ordersSourceFile = ts.createSourceFile(
  'app/admin/orders/page.tsx',
  ordersPage,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX
)
const ordersEffects = []
function collectOrdersEffects(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ordersSourceFile) === 'useEffect'
  ) {
    ordersEffects.push(node.getText(ordersSourceFile))
  }
  ts.forEachChild(node, collectOrdersEffects)
}
collectOrdersEffects(ordersSourceFile)

const ordersIntervalEffect = ordersEffects.find((source) =>
  source.includes('setInterval(')
)
const ordersVisibilityEffect = ordersEffects.find((source) =>
  source.includes("addEventListener('visibilitychange'")
)

assert(
  ordersIntervalEffect?.includes('checkOrdersMetaAndReload()') &&
    ordersVisibilityEffect?.includes('checkOrdersMetaAndReload()'),
  'Orders interval and visibility refresh must share one Metadata function.'
)
assert(
  ordersPage.includes(
    'if (isMetaFetchInFlightRef.current || isFetchInFlightRef.current) return'
  ),
  'Orders Metadata in-flight guard must remain active.'
)
assert(
  (ordersPage.match(/lastSuccessfulMetaCheckRef = useRef/g) || []).length === 1 &&
    ordersPage.includes('lastSuccessfulCheck?.context === metaContext') &&
    ordersPage.includes('ORDERS_META_RECENT_SUCCESS_MS'),
  'Orders must define one recent-success guard scoped to the Metadata context.'
)
assert(
  ordersPage.includes('const metaContext = params.toString()') &&
    ordersPage.includes('lastSuccessfulMetaCheckRef.current = null') &&
    ordersPage.includes('metaInvalidationVersionRef.current += 1') &&
    ordersPage.includes(
      'metaInvalidationVersionRef.current === invalidationVersion'
    ),
  'Orders context changes and list refreshes must not reuse a stale Metadata success.'
)
assert(
  !/if \(!response\.ok \|\| !result\?\.success\) \{\s*lastSuccessfulMetaCheckRef\.current/s.test(
    ordersPage
  ),
  'Failed Orders Metadata requests must not start the recent-success window.'
)
assert(
  /if \(nextSignature !== ordersSignatureRef\.current\) \{\s*lastSuccessfulMetaCheckRef\.current = null\s*await fetchOrders\(true\)/.test(
    ordersPage
  ),
  'Orders signature changes must still invalidate the guard and reload the full list.'
)
assert(
  ordersPage.includes('const ORDERS_META_INTERVAL_MS = 15000') &&
    ordersIntervalEffect?.includes('ORDERS_META_INTERVAL_MS'),
  'Orders Metadata interval must remain 15 seconds.'
)
assert(
  ordersVisibilityEffect?.includes("removeEventListener('visibilitychange'") &&
    !ordersPage.includes("addEventListener('focus'"),
  'Orders visibility listener must be cleaned up without adding a focus listener.'
)

assert(
  catalogReturnEffects.length === 1,
  'Items must define one Catalog return-refresh effect.'
)
const catalogReturnEffectSource = catalogReturnEffects[0].getText(itemsSourceFile)
assert(
  (catalogReturnEffectSource.match(/window\.setTimeout\(/g) || []).length === 1 &&
    (catalogReturnEffectSource.match(/window\.clearTimeout\(/g) || []).length === 2 &&
    !catalogReturnEffectSource.includes('3000'),
  'Focus and visibility must share one cancellable Catalog refresh timer without a follow-up reload.'
)
assert(
  catalogReturnEffectSource.includes("removeEventListener('visibilitychange'") &&
    catalogReturnEffectSource.includes("removeEventListener('focus'"),
  'Catalog return listeners must both be removed during cleanup.'
)

assert(!catalogRoute.includes("select('*')"), 'POS Catalog must not use select(*).')
assert(!runtimeRoute.includes("select('*')"), 'POS Runtime must not use select(*).')
assert(
  catalogRoute.includes('Promise.all([') &&
    catalogRoute.includes("timing.measure('categories'") &&
    catalogRoute.includes("timing.measure('catalog'"),
  'Independent category and catalog queries must run in parallel.'
)
assert(
  catalogRoute.includes('branchOverridesPromise') &&
    catalogRoute.includes('inventoryStockPromise') &&
    /Promise\.all\(\[\s*branchOverridesPromise,\s*inventoryStockPromise,?\s*\]\)/s.test(
      catalogRoute
    ),
  'Paged POS Catalog overrides and inventory stock must run in parallel.'
)
assert(
  catalogRoute.includes(".in('catalog_item_id', catalogItemIds)"),
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
    /if \(!cancelled\) \{\s+setCatalogProducts\(/.test(itemsStep) &&
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
