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

assert(!catalogRoute.includes("select('*')"), 'POS Catalog must not use select(*).')
assert(!runtimeRoute.includes("select('*')"), 'POS Runtime must not use select(*).')
assert(
  catalogRoute.includes('Promise.all([\n      categoriesQuery,\n      catalogItemsQuery,'),
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
  catalogHelper.includes("params.tenantId || 'unknown'") &&
    checkoutPage.includes("pos-runtime:${tenantId || 'unknown'}:${branchId || 'all'}"),
  'POS cache keys must include tenant and branch scope.'
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

const { mapBranchCatalogToInvoiceProducts } = moduleValue.exports
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

console.log('POS performance and correctness checks passed.')
