import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const root = process.cwd()
const require = createRequire(import.meta.url)

function loadTypeScriptModule(relativePath, imports = {}) {
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
  new Function('require', 'module', 'exports', output)(
    localRequire,
    commonJsModule,
    commonJsModule.exports
  )
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
  return value ?? null
}
const canonicalJson = (value) => JSON.stringify(canonicalize(value))
const sha256Hex = (value) =>
  require('node:crypto').createHash('sha256').update(value).digest('hex')

const numbering = loadTypeScriptModule('lib/numbering/core.ts')
class AtomicOrderError extends Error {
  constructor(code, stage, retryable, message) {
    super(message)
    this.code = code
    this.stage = stage
    this.retryable = retryable
  }
}
const contracts = {
  ATOMIC_ORDER_ENGINE_VERSION: 'atomic-order-v2-r1',
  AtomicOrderError,
}
const persistence = loadTypeScriptModule('lib/atomic-order/persistence.ts', {
  '@/lib/atomic-order/contracts': contracts,
  '@/lib/idempotency/core': { canonicalJson, sha256Hex },
})

const numberingCandidate = numbering.buildNumberAllocationCandidate({
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  configuration: {
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    branchPrefix: '01',
  },
  transactionTimestamp: '2026-07-24T09:00:00.000Z',
  idempotencyCommandId: null,
  idempotencyKeyHash: 'hashed-key',
  correlationId: 'correlation-1',
})
assert.equal(numberingCandidate.lockStrategy, 'sequence_row_for_update')
assert.equal(numberingCandidate.allocationStatus, 'pending_database_allocation')
assert.equal(numberingCandidate.orderNumber, null)
assert.equal(numberingCandidate.invoiceNumber, null)
assert.equal(numberingCandidate.sequenceValue, null)
assert.equal(numberingCandidate.sequenceMonth, '2026-07-01')

const quoteItems = [
  {
    line: 1,
    catalogItemId: 'item-1',
    nameSnapshot: 'Item',
    categorySnapshot: 'Category',
    typeSnapshot: 'product',
    quantity: 1,
    unitPrice: '60.00',
    priceSource: 'catalog_default',
    sourceCatalogUpdatedAt: '2026-07-24T00:00:00.000Z',
    sourceBranchPriceId: null,
    sourceBranchPriceUpdatedAt: null,
    grossLineAmount: '60.00',
    discountAmount: '6.00',
    taxableLineAmount: '54.00',
    costSnapshot: '20.00',
  },
  {
    line: 2,
    catalogItemId: 'item-1',
    nameSnapshot: 'Item',
    categorySnapshot: 'Category',
    typeSnapshot: 'product',
    quantity: 1,
    unitPrice: '40.00',
    priceSource: 'branch_override',
    sourceCatalogUpdatedAt: '2026-07-24T00:00:00.000Z',
    sourceBranchPriceId: 'price-1',
    sourceBranchPriceUpdatedAt: '2026-07-24T00:00:00.000Z',
    grossLineAmount: '40.00',
    discountAmount: '4.00',
    taxableLineAmount: '36.00',
    costSnapshot: '10.00',
  },
]
const snapshot = {
  currencyCode: 'SAR',
  subtotal: '100.00',
  discountIdSnapshot: 'discount-1',
  discountNameSnapshot: 'Discount',
  discountTypeSnapshot: 'percentage',
  discountValueSnapshot: '10.00',
  discountAmount: '10.00',
  taxableSubtotal: '90.00',
  vatSettingIdSnapshot: 'vat-1',
  vatRateSnapshot: '15.00',
  vatAmount: '13.50',
  total: '103.50',
  paymentMethod: 'cash',
  cashReceived: '110.00',
  remainingFromCustomer: '0.00',
  cashChange: '6.50',
  requestFingerprintVersion: 'financial-request-v1',
  requestFingerprint: 'request-fingerprint',
  quoteVersion: 'financial-quote-v1',
  quoteFingerprint: 'quote-fingerprint',
  financialEngineVersion: 'financial-engine-v2-r1',
  ruleVersions: {
    pricing: 'pricing-1',
    vat: 'vat-1',
    discount: 'discount-1',
    rounding: 'invoice-half-up-v1',
  },
  items: quoteItems,
  snapshotVersion: 'financial-snapshot-v1',
  snapshotHash: 'financial-snapshot-hash',
}
const financial = {
  request: {
    amountTendered: '110.00',
  },
  quote: {
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    quoteFingerprint: 'quote-fingerprint',
    items: quoteItems,
  },
  snapshot,
  snapshotCandidate: {
    complete: true,
    reasons: [],
    paymentStatusIntent: 'paid',
    lines: [
      {
        line: 1,
        catalogItemId: 'item-1',
        costSnapshot: '20.00',
        profitSnapshot: '34.00',
        sourceEvidenceComplete: true,
      },
      {
        line: 2,
        catalogItemId: 'item-1',
        costSnapshot: '10.00',
        profitSnapshot: '26.00',
        sourceEvidenceComplete: true,
      },
    ],
  },
}
const input = {
  intent: {
    customer: {
      customerId: 'customer-1',
      name: 'Customer',
      phone: '0500000000',
      email: null,
      notes: null,
    },
  },
  authorization: {
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    actor: { type: 'pos_employee', id: 'employee-1' },
    authorization: { user: { id: 'user-1' } },
  },
  customer: {
    mode: 'existing',
    customerId: 'customer-1',
    normalizedPhone: '966500000000',
    expectedRecordVersion: 1,
  },
  idempotency: {
    commandId: null,
    command: {
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      keyHash: 'hashed-key',
    },
  },
  financial,
  inventory: {
    complete: true,
    requirements: [{
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      catalogItemId: 'item-1',
      itemType: 'product',
      trackingMode: 'tracked_product',
      requestedQuantity: '2',
      availableQuantity: '5',
      projectedQuantity: '3',
      stockRowId: 'stock-1',
      stockVersion: null,
      stockUpdatedAt: '2026-07-24T00:00:00.000Z',
      validationStatus: 'validated',
      sourceLines: [1, 2],
      priceSources: ['branch_override', 'catalog_default'],
    }],
    lockPlan: [],
    snapshotCandidates: [{
      snapshotHash: 'inventory-hash',
      inventoryEngineVersion: 'inventory-engine-v2-r1',
    }],
  },
  numbering: numberingCandidate,
  correlationId: 'correlation-1',
}

const first = persistence.buildAtomicCommittedSnapshotCandidate(input)
const second = persistence.buildAtomicCommittedSnapshotCandidate(input)
assert.equal(first.candidateStatus, 'pending_database_commit')
assert.equal(first.candidateHash, second.candidateHash)
assert.equal(first.order.orderNumber, null)
assert.equal(first.invoice.invoiceNumber, null)
assert.equal(first.invoiceItems.length, 2)
assert.equal(first.inventorySnapshots.length, 1)
assert.equal(JSON.stringify(first).includes('raw-client-key'), false)
assert.equal(first.order.fieldTrust.status, 'derived_authoritative')
assert.equal(first.order.fieldTrust.orderNumber, 'database_generated')

const source = fs.readFileSync(
  path.join(root, 'lib/atomic-order/contracts.ts'),
  'utf8'
)
assert.match(
  source,
  /number_allocation:[\s\S]*requiredPreviousStage: 'inventory_validation'/
)
const serviceSource = fs.readFileSync(
  path.join(root, 'lib/atomic-order/service.ts'),
  'utf8'
)
assert.match(serviceSource, /coreV2AtomicOrderEnabled/)
assert.match(serviceSource, /create_invoice_with_items_safe/)
const adapterSource = fs.readFileSync(
  path.join(root, 'lib/atomic-order/adapters.ts'),
  'utf8'
)
assert.doesNotMatch(
  adapterSource,
  /\.from\(|\.insert\(|\.update\(|\.rpc\(|fetch\(/
)

console.log('Atomic persistence foundation checks passed.')
