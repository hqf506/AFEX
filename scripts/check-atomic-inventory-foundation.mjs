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

const inventory = loadTypeScriptModule('lib/inventory/core.ts', {
  '@/lib/idempotency/core': {
    canonicalJson: (value) => JSON.stringify(canonicalize(value)),
  },
})

const quoteItem = (line, catalogItemId, quantity, priceSource = 'catalog_default') => ({
  line,
  catalogItemId,
  quantity,
  priceSource,
})
const catalog = [
  {
    id: 'tracked-b',
    tenantId: 'tenant-1',
    itemType: 'product',
    trackInventory: true,
    isComposite: false,
    updatedAt: '2026-07-24T00:00:00.000Z',
  },
  {
    id: 'service-a',
    tenantId: 'tenant-1',
    itemType: 'service',
    trackInventory: true,
    isComposite: false,
    updatedAt: '2026-07-24T00:00:00.000Z',
  },
  {
    id: 'untracked-c',
    tenantId: 'tenant-1',
    itemType: 'product',
    trackInventory: false,
    isComposite: false,
    updatedAt: '2026-07-24T00:00:00.000Z',
  },
]
const derived = inventory.deriveInventoryRequirements({
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  quoteItems: [
    quoteItem(1, 'tracked-b', 2),
    quoteItem(2, 'tracked-b', 3, 'branch_override'),
    quoteItem(3, 'service-a', 1),
    quoteItem(4, 'untracked-c', 1),
  ],
  catalogEvidence: catalog,
})

assert.equal(derived.length, 3)
assert.equal(derived.find((entry) => entry.catalogItemId === 'tracked-b').requestedQuantity, '5')
assert.deepEqual(derived.find((entry) => entry.catalogItemId === 'tracked-b').sourceLines, [1, 2])
assert.equal(derived.find((entry) => entry.catalogItemId === 'service-a').trackingMode, 'service')
assert.equal(derived.find((entry) => entry.catalogItemId === 'untracked-c').trackingMode, 'untracked_product')

const validated = inventory.validateInventoryStock({
  requirements: derived,
  stockEvidence: [{
    id: 'stock-2',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    catalogItemId: 'tracked-b',
    quantityOnHand: '8',
    version: null,
    updatedAt: '2026-07-24T00:00:00.000Z',
  }],
  actor: { type: 'pos_employee', id: 'employee-1' },
  correlationId: 'correlation-1',
})

assert.equal(validated.lockPlan.length, 1)
assert.equal(validated.lockPlan[0].catalogItemId, 'tracked-b')
assert.equal(validated.snapshotCandidates[0].quantityBefore, '8')
assert.equal(validated.snapshotCandidates[0].quantityDelta, '-5')
assert.equal(validated.snapshotCandidates[0].quantityAfter, '3')
assert.match(validated.snapshotCandidates[0].snapshotHash, /^[a-f0-9]{64}$/)
assert.equal(
  validated.requirements.find((entry) => entry.catalogItemId === 'service-a').validationStatus,
  'not_required'
)

assert.throws(
  () => inventory.validateInventoryStock({
    requirements: derived,
    stockEvidence: [],
    actor: { type: 'user', id: 'user-1' },
    correlationId: 'correlation-2',
  }),
  (error) => error.code === 'STOCK_NOT_FOUND'
)
assert.throws(
  () => inventory.validateInventoryStock({
    requirements: derived,
    stockEvidence: [{
      id: 'stock-2',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      catalogItemId: 'tracked-b',
      quantityOnHand: '4',
      version: null,
      updatedAt: '2026-07-24T00:00:00.000Z',
    }],
    actor: { type: 'user', id: 'user-1' },
    correlationId: 'correlation-3',
  }),
  (error) => error.code === 'INSUFFICIENT_STOCK'
)
assert.throws(
  () => inventory.validateInventoryStock({
    requirements: derived,
    stockEvidence: [{
      id: 'stock-2',
      tenantId: 'tenant-2',
      branchId: 'branch-1',
      catalogItemId: 'tracked-b',
      quantityOnHand: '8',
      version: null,
      updatedAt: '2026-07-24T00:00:00.000Z',
    }],
    actor: { type: 'user', id: 'user-1' },
    correlationId: 'correlation-4',
  }),
  (error) => error.code === 'INVENTORY_SCOPE_CONFLICT'
)

console.log('Atomic inventory foundation checks passed.')
