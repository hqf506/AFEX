import type { AuthScopeType } from '@/lib/auth-profile'
import type { AdminBranchRecord } from '@/lib/admin/branches'
import type { AdminCatalogItemRecord } from '@/lib/admin/catalog'

export type AdminBranchCatalogItemRecord = AdminCatalogItemRecord & {
  branch_catalog_item_id: string | null
  branch_price: number
  branch_is_active: boolean
  display_order: number | null
}

export type BranchCatalogDraft = {
  price: string
  isActive: 'true' | 'false'
  displayOrder: string
}

export type BranchCatalogPayload = {
  branchId: string
  catalogItemId: string
  price: string
  isActive: 'true' | 'false'
  displayOrder: string
}

export function isSystemScopedBranchCatalogAdmin(scopeType: AuthScopeType) {
  return scopeType === 'system'
}

export function normalizeBranchCatalogBranchId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeBranchCatalogItemId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeBranchCatalogPrice(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return NaN
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : NaN
  }

  return NaN
}

export function normalizeBranchCatalogDisplayOrder(value: unknown) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : NaN
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isInteger(parsed) ? parsed : NaN
  }

  return null
}

export function isValidBranchCatalogPrice(value: number) {
  return Number.isFinite(value) && value >= 0
}

export function isValidBranchCatalogDisplayOrder(value: number | null) {
  return value === null || (Number.isInteger(value) && value >= 0)
}

export function createBranchCatalogDraft(
  item: AdminBranchCatalogItemRecord
): BranchCatalogDraft {
  return {
    price: item.branch_price.toString(),
    isActive: item.branch_is_active ? 'true' : 'false',
    displayOrder:
      typeof item.display_order === 'number' ? item.display_order.toString() : '',
  }
}

export function canSubmitBranchCatalogDraft(
  draft: BranchCatalogDraft | undefined
) {
  if (!draft) return false

  return (
    isValidBranchCatalogPrice(normalizeBranchCatalogPrice(draft.price)) &&
    isValidBranchCatalogDisplayOrder(
      normalizeBranchCatalogDisplayOrder(draft.displayOrder)
    )
  )
}

export function resolveSelectedBranch(
  branches: AdminBranchRecord[],
  selectedBranchId: string
) {
  return branches.find((branch) => branch.id === selectedBranchId) || null
}
