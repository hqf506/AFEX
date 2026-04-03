import type { AuthScopeType } from '@/lib/auth-profile'

export type CatalogItemType = 'product' | 'service'

export type AdminCatalogItemRecord = {
  id: string
  code: string
  name: string
  category: string
  item_type: CatalogItemType
  default_price: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AdminCatalogFormPayload = {
  name: string
  code: string
  category: string
  itemType: CatalogItemType
  defaultPrice: string
}

export const CATALOG_CODE_PATTERN = /^[a-z0-9-]{2,64}$/

export const CATALOG_ITEM_TYPE_OPTIONS: Array<{
  value: CatalogItemType
  label: string
}> = [
  { value: 'service', label: 'خدمة' },
  { value: 'product', label: 'منتج' },
]

export function createEmptyCatalogFormPayload(): AdminCatalogFormPayload {
  return {
    name: '',
    code: '',
    category: '',
    itemType: 'service',
    defaultPrice: '',
  }
}

export function normalizeCatalogItemId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeCatalogName(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeCatalogCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function normalizeCatalogCategory(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeCatalogPrice(value: unknown) {
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

export function isValidCatalogCode(value: string) {
  return CATALOG_CODE_PATTERN.test(value)
}

export function isValidCatalogItemType(value: unknown): value is CatalogItemType {
  return value === 'product' || value === 'service'
}

export function isValidCatalogPrice(value: number) {
  return Number.isFinite(value) && value >= 0
}

export function canSubmitCatalogForm(payload: AdminCatalogFormPayload) {
  return (
    normalizeCatalogName(payload.name).length > 0 &&
    normalizeCatalogCode(payload.code).length > 0 &&
    normalizeCatalogCategory(payload.category).length > 0 &&
    isValidCatalogItemType(payload.itemType) &&
    isValidCatalogPrice(normalizeCatalogPrice(payload.defaultPrice))
  )
}

export function isSystemScopedCatalogAdmin(scopeType: AuthScopeType) {
  return scopeType === 'system'
}
