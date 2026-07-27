import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const root = process.cwd()
const require = createRequire(import.meta.url)

function loadTypeScriptModule(relativePath, imports) {
  const filename = path.join(root, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
  const commonJsModule = { exports: {} }
  const localRequire = (specifier) => {
    if (specifier === 'server-only') return {}
    if (specifier in imports) return imports[specifier]
    return require(specifier)
  }
  const evaluate = new Function('require', 'module', 'exports', output)
  evaluate(localRequire, commonJsModule, commonJsModule.exports)
  return commonJsModule.exports
}

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    )
  }
  return typeof value === 'string' ? value.normalize('NFC') : (value ?? null)
}
const core = loadTypeScriptModule('lib/financial/core.ts', {
  '@/lib/idempotency/core': {
    canonicalJson: (value) => JSON.stringify(canonicalize(value)),
  },
})
const service = loadTypeScriptModule('lib/financial/service.ts', {
  '@/lib/financial/core': core,
  '@/lib/core-v2-flags': {
    coreV2FinancialQuotesEnabled: (explicit) => explicit ?? false,
    coreV2FinancialShadowEnabled: (explicit) => explicit ?? false,
  },
})

const request = service.buildFinancialQuoteRequest({
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  actor: { type: 'user', id: 'user-1' },
  customerId: 'customer-1',
  items: [{ catalogItemId: 'item-1', quantity: 2 }],
  discountId: 'discount-1',
  paymentMethod: 'cash',
  amountTendered: '200',
  note: 'test',
  unitPrice: '0.01',
  subtotal: '0.02',
  tax: '0',
  total: '0.02',
})

assert.equal('unitPrice' in request, false)
assert.equal('subtotal' in request, false)
assert.equal('tax' in request, false)
assert.equal('total' in request, false)

const configuration = {
  catalog: [{
    id: 'item-1',
    tenantId: 'tenant-1',
    name: 'Item',
    category: 'Category',
    itemType: 'product',
    defaultPrice: '100.00',
    costPrice: '40.00',
    isActive: true,
    deletedAt: null,
    updatedAt: '2026-07-24T00:00:00.000Z',
  }],
  branchPrices: [{
    id: 'override-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    catalogItemId: 'item-1',
    price: '90.00',
    isActive: true,
    updatedAt: '2026-07-24T00:00:00.000Z',
  }],
  vat: [
    {
      id: 'vat-global',
      tenantId: 'tenant-1',
      branchId: null,
      rate: '5',
      isActive: true,
      updatedAt: '2026-07-24T00:00:00.000Z',
    },
    {
      id: 'vat-branch',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      rate: '15',
      isActive: true,
      updatedAt: '2026-07-24T00:00:00.000Z',
    },
  ],
  discounts: [{
    id: 'discount-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    name: 'Ten percent',
    type: 'percentage',
    value: '10',
    isActive: true,
    deletedAt: null,
    updatedAt: '2026-07-24T00:00:00.000Z',
  }],
  ruleVersions: {
    pricing: 'pricing-v1',
    vat: 'vat-v1',
    discount: 'discount-v1',
  },
}
const now = new Date('2026-07-24T12:00:00.000Z')
const trustedFingerprint = 'a'.repeat(64)
const quote = service.calculateLegacyCompatibleQuote({
  request,
  configuration,
  requestFingerprint: trustedFingerprint,
  now,
})

assert.equal(quote.requestFingerprint, trustedFingerprint)
assert.equal(quote.items[0].priceSource, 'branch_override')
assert.equal(quote.items[0].unitPrice, '90.00')
assert.equal(quote.subtotal, '180.00')
assert.equal(quote.discount.amount, '18.00')
assert.equal(quote.taxableSubtotal, '162.00')
assert.equal(quote.vat.id, 'vat-branch')
assert.equal(quote.vat.amount, '24.30')
assert.equal(quote.total, '186.30')
assert.equal(quote.payment.remainingFromCustomer, '0.00')
assert.equal(quote.payment.cashChange, '13.70')

const underpaidQuote = service.calculateLegacyCompatibleQuote({
  request: { ...request, amountTendered: '100.00' },
  configuration,
  requestFingerprint: trustedFingerprint,
  now,
})
assert.equal(underpaidQuote.payment.remainingFromCustomer, '86.30')
assert.equal(underpaidQuote.payment.cashChange, '0.00')

const sameQuote = service.calculateLegacyCompatibleQuote({
  request,
  configuration,
  requestFingerprint: trustedFingerprint,
  now,
})
assert.equal(sameQuote.quoteFingerprint, quote.quoteFingerprint)
assert.equal(
  core.buildFinancialSnapshot(sameQuote).snapshotHash,
  core.buildFinancialSnapshot(quote).snapshotHash
)

const fallbackQuote = service.calculateLegacyCompatibleQuote({
  request,
  configuration: { ...configuration, branchPrices: [] },
  requestFingerprint: trustedFingerprint,
  now,
})
assert.equal(fallbackQuote.items[0].priceSource, 'catalog_default')
assert.equal(fallbackQuote.items[0].unitPrice, '100.00')

assert.throws(
  () => service.calculateLegacyCompatibleQuote({
    request,
    configuration: {
      ...configuration,
      catalog: [{ ...configuration.catalog[0], defaultPrice: null }],
      branchPrices: [],
    },
    now,
  }),
  (error) => error.code === 'PRICE_NOT_FOUND'
)
assert.throws(
  () => service.calculateLegacyCompatibleQuote({
    request,
    configuration: {
      ...configuration,
      branchPrices: [...configuration.branchPrices, {
        ...configuration.branchPrices[0],
        id: 'override-2',
      }],
    },
    now,
  }),
  (error) => error.code === 'PRICE_CONFIGURATION_AMBIGUOUS'
)
assert.throws(
  () => service.calculateLegacyCompatibleQuote({
    request,
    configuration: {
      ...configuration,
      vat: [...configuration.vat, {
        ...configuration.vat[1],
        id: 'vat-branch-2',
      }],
    },
    now,
  }),
  (error) => error.code === 'VAT_CONFIGURATION_AMBIGUOUS'
)
assert.throws(
  () => service.calculateLegacyCompatibleQuote({
    request,
    configuration: {
      ...configuration,
      discounts: [{ ...configuration.discounts[0], value: '101' }],
    },
    now,
  }),
  (error) => error.code === 'DISCOUNT_NOT_ELIGIBLE'
)

const roundedQuote = service.calculateLegacyCompatibleQuote({
  request: { ...request, discountId: null, amountTendered: '0.00' },
  configuration: {
    ...configuration,
    catalog: [{ ...configuration.catalog[0], defaultPrice: '33.33' }],
    branchPrices: [],
    discounts: [],
  },
  requestFingerprint: trustedFingerprint,
  now,
})
assert.equal(roundedQuote.vat.amount, '10.00')
assert.equal(roundedQuote.total, '76.66')

const adaptersSource = fs.readFileSync(
  path.join(root, 'lib/atomic-order/adapters.ts'),
  'utf8'
)
const pipelineSource = fs.readFileSync(
  path.join(root, 'lib/atomic-order/pipeline.ts'),
  'utf8'
)
assert.match(adaptersSource, /requestFingerprint:\s*idempotency\.command\.requestFingerprint/)
assert.match(adaptersSource, /resolution\.quote\.requestFingerprint/)
assert.match(pipelineSource, /STAGE_DEPENDENCY_MISSING/)
assert.match(pipelineSource, /STAGE_ORDER_INVALID/)

console.log('Atomic financial foundation checks passed.')
