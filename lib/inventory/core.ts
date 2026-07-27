import 'server-only'

import { createHash } from 'node:crypto'
import { canonicalJson } from '@/lib/idempotency/core'
import type {
  FinancialPriceSource,
  FinancialQuoteItem,
} from '@/lib/financial/core'

export const INVENTORY_ENGINE_VERSION = 'inventory-engine-v2-r1' as const
export const INVENTORY_SNAPSHOT_VERSION = 'inventory-snapshot-v1' as const

export type InventoryTrackingMode =
  | 'tracked_product'
  | 'untracked_product'
  | 'service'

export type InventoryValidationStatus = 'validated' | 'not_required'

export type InventoryErrorCode =
  | 'STOCK_NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'NEGATIVE_STOCK_BLOCKED'
  | 'INVENTORY_CONFIGURATION_INVALID'
  | 'INVENTORY_SCOPE_CONFLICT'
  | 'INVENTORY_CONFLICT'
  | 'INVENTORY_LOCK_TIMEOUT'

export class InventoryCoreError extends Error {
  constructor(
    readonly code: InventoryErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'InventoryCoreError'
  }
}

export type InventoryCatalogEvidence = {
  id: string
  tenantId: string
  itemType: 'product' | 'service'
  trackInventory: boolean
  isComposite: boolean
  updatedAt: string
}

export type InventoryStockEvidence = {
  id: string
  tenantId: string
  branchId: string
  catalogItemId: string
  quantityOnHand: string
  version: number | null
  updatedAt: string
}

export type InventoryRequirement = {
  tenantId: string
  branchId: string
  catalogItemId: string
  itemType: 'product' | 'service'
  trackingMode: InventoryTrackingMode
  requestedQuantity: string
  availableQuantity: string | null
  projectedQuantity: string | null
  stockRowId: string | null
  stockVersion: number | null
  stockUpdatedAt: string | null
  validationStatus: InventoryValidationStatus
  sourceLines: number[]
  priceSources: FinancialPriceSource[]
}

export type InventoryLockPlanEntry = {
  tenantId: string
  branchId: string
  catalogItemId: string
  stockRowId: string
  order: number
}

export type InventorySnapshotCandidate = {
  tenantId: string
  branchId: string
  catalogItemId: string
  stockRowId: string
  quantityBefore: string
  quantityDelta: string
  quantityAfter: string
  movementType: 'sale'
  sourceType: 'invoice_item'
  sourceId: null
  orderId: null
  invoiceId: null
  invoiceItemId: null
  actor: {
    type: 'user' | 'pos_employee'
    id: string
  }
  correlationId: string
  inventoryEngineVersion: typeof INVENTORY_ENGINE_VERSION
  snapshotVersion: typeof INVENTORY_SNAPSHOT_VERSION
  snapshotHash: string
}

export type DerivedInventoryRequirement = Omit<
  InventoryRequirement,
  | 'availableQuantity'
  | 'projectedQuantity'
  | 'stockRowId'
  | 'stockVersion'
  | 'stockUpdatedAt'
  | 'validationStatus'
>

const QUANTITY_SCALE = BigInt(1_000_000)

function parseQuantity(value: string | number) {
  const source = String(value).trim()
  const match = /^([+-]?)(\d+)(?:\.(\d{1,6}))?$/.exec(source)
  if (!match) {
    throw new InventoryCoreError(
      'INVENTORY_CONFIGURATION_INVALID',
      'Inventory quantity is not a valid fixed-point value'
    )
  }
  const sign = match[1] === '-' ? BigInt(-1) : BigInt(1)
  return (
    sign *
    (BigInt(match[2]) * QUANTITY_SCALE +
      BigInt((match[3] || '').padEnd(6, '0')))
  )
}

function formatQuantity(value: bigint) {
  const negative = value < BigInt(0)
  const absolute = negative ? -value : value
  const whole = absolute / QUANTITY_SCALE
  const fraction = (absolute % QUANTITY_SCALE)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '')
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`
}

function classifyCatalogItem(
  evidence: InventoryCatalogEvidence
): InventoryTrackingMode {
  if (evidence.itemType === 'service') return 'service'
  return evidence.trackInventory ? 'tracked_product' : 'untracked_product'
}

export function deriveInventoryRequirements(input: {
  tenantId: string
  branchId: string
  quoteItems: FinancialQuoteItem[]
  catalogEvidence: InventoryCatalogEvidence[]
}): DerivedInventoryRequirement[] {
  const aggregated = new Map<
    string,
    {
      quantity: bigint
      sourceLines: number[]
      priceSources: Set<FinancialPriceSource>
    }
  >()

  for (const item of input.quoteItems) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new InventoryCoreError(
        'INVENTORY_CONFIGURATION_INVALID',
        'Inventory requirement contains an invalid quantity'
      )
    }
    const current = aggregated.get(item.catalogItemId) || {
      quantity: BigInt(0),
      sourceLines: [],
      priceSources: new Set<FinancialPriceSource>(),
    }
    current.quantity += BigInt(item.quantity) * QUANTITY_SCALE
    current.sourceLines.push(item.line)
    current.priceSources.add(item.priceSource)
    aggregated.set(item.catalogItemId, current)
  }

  return [...aggregated.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([catalogItemId, requirement]) => {
      const matches = input.catalogEvidence.filter(
        (entry) => entry.id === catalogItemId
      )
      if (matches.length !== 1) {
        throw new InventoryCoreError(
          'INVENTORY_CONFIGURATION_INVALID',
          matches.length === 0
            ? 'Catalog evidence is missing for an inventory requirement'
            : 'Catalog evidence is ambiguous for an inventory requirement'
        )
      }
      const catalog = matches[0]
      if (catalog.tenantId !== input.tenantId) {
        throw new InventoryCoreError(
          'INVENTORY_SCOPE_CONFLICT',
          'Catalog evidence does not belong to the trusted tenant'
        )
      }
      return {
        tenantId: input.tenantId,
        branchId: input.branchId,
        catalogItemId,
        itemType: catalog.itemType,
        trackingMode: classifyCatalogItem(catalog),
        requestedQuantity: formatQuantity(requirement.quantity),
        sourceLines: [...requirement.sourceLines].sort((a, b) => a - b),
        priceSources: [...requirement.priceSources].sort(),
      }
    })
}

export function validateInventoryStock(input: {
  requirements: DerivedInventoryRequirement[]
  stockEvidence: InventoryStockEvidence[]
  actor: InventorySnapshotCandidate['actor']
  correlationId: string
}) {
  const requirements: InventoryRequirement[] = []
  const snapshotCandidates: InventorySnapshotCandidate[] = []

  for (const requirement of input.requirements) {
    if (requirement.trackingMode !== 'tracked_product') {
      requirements.push({
        ...requirement,
        availableQuantity: null,
        projectedQuantity: null,
        stockRowId: null,
        stockVersion: null,
        stockUpdatedAt: null,
        validationStatus: 'not_required',
      })
      continue
    }

    const matches = input.stockEvidence.filter(
      (entry) => entry.catalogItemId === requirement.catalogItemId
    )
    if (
      matches.some(
        (entry) =>
          entry.tenantId !== requirement.tenantId ||
          entry.branchId !== requirement.branchId
      )
    ) {
      throw new InventoryCoreError(
        'INVENTORY_SCOPE_CONFLICT',
        'Stock evidence does not belong to the trusted tenant and branch'
      )
    }
    if (matches.length === 0) {
      throw new InventoryCoreError(
        'STOCK_NOT_FOUND',
        'Tracked inventory stock row was not found'
      )
    }
    if (matches.length !== 1) {
      throw new InventoryCoreError(
        'INVENTORY_CONFLICT',
        'Tracked inventory has ambiguous stock rows'
      )
    }

    const stock = matches[0]
    const available = parseQuantity(stock.quantityOnHand)
    const requested = parseQuantity(requirement.requestedQuantity)
    if (available < BigInt(0)) {
      throw new InventoryCoreError(
        'NEGATIVE_STOCK_BLOCKED',
        'Tracked inventory already has a negative balance'
      )
    }
    if (available < requested) {
      throw new InventoryCoreError(
        'INSUFFICIENT_STOCK',
        'Tracked inventory does not have sufficient quantity'
      )
    }
    const projected = available - requested
    const validated: InventoryRequirement = {
      ...requirement,
      availableQuantity: formatQuantity(available),
      projectedQuantity: formatQuantity(projected),
      stockRowId: stock.id,
      stockVersion: stock.version,
      stockUpdatedAt: stock.updatedAt,
      validationStatus: 'validated',
    }
    requirements.push(validated)

    const quantityBefore = formatQuantity(available)
    const quantityAfter = formatQuantity(projected)
    const candidateWithoutHash = {
      tenantId: requirement.tenantId,
      branchId: requirement.branchId,
      catalogItemId: requirement.catalogItemId,
      stockRowId: stock.id,
      quantityBefore,
      quantityDelta: formatQuantity(-requested),
      quantityAfter,
      movementType: 'sale' as const,
      sourceType: 'invoice_item' as const,
      sourceId: null,
      orderId: null,
      invoiceId: null,
      invoiceItemId: null,
      actor: input.actor,
      correlationId: input.correlationId,
      inventoryEngineVersion: INVENTORY_ENGINE_VERSION,
      snapshotVersion: INVENTORY_SNAPSHOT_VERSION,
    }
    snapshotCandidates.push({
      ...candidateWithoutHash,
      snapshotHash: createHash('sha256')
        .update(canonicalJson(candidateWithoutHash), 'utf8')
        .digest('hex'),
    })
  }

  const lockPlan: InventoryLockPlanEntry[] = requirements
    .filter(
      (requirement): requirement is InventoryRequirement & {
        stockRowId: string
      } => requirement.trackingMode === 'tracked_product' && !!requirement.stockRowId
    )
    .sort(
      (left, right) =>
        left.catalogItemId.localeCompare(right.catalogItemId) ||
        left.stockRowId.localeCompare(right.stockRowId)
    )
    .map((requirement, index) => ({
      tenantId: requirement.tenantId,
      branchId: requirement.branchId,
      catalogItemId: requirement.catalogItemId,
      stockRowId: requirement.stockRowId,
      order: index + 1,
    }))

  return { requirements, lockPlan, snapshotCandidates }
}
