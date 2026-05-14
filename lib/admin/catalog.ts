import type { AuthScopeType } from '@/lib/auth-profile'

export type CatalogItemType = 'product' | 'service'

export type CatalogItemTypePreset =
  | 'services'
  | 'products'
  | 'cleaning'
  | 'repair'
  | 'care'

export type AdminCatalogItemRecord = {
  id: string
  code: string
  name: string
  category: string
  item_type: CatalogItemType
  default_price: number
  cost_price: number
  image_url: string | null
  pos_display_mode: 'style' | 'image'
  pos_color: string | null
  pos_shape: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AdminCatalogFormPayload = {
  name: string
  code: string
  category: string
  itemType: CatalogItemType
  itemTypePreset: CatalogItemTypePreset
  costPrice: string
  defaultPrice: string
}

export const CATALOG_CODE_PATTERN = /^(#[0-9]{4,}|[a-z0-9-]{2,64})$/
export const CATALOG_IMAGE_BUCKET = 'catalog-items'
export const CATALOG_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const CATALOG_ITEM_TYPE_OPTIONS: Array<{
  value: CatalogItemTypePreset
  label: string
}> = [
  { value: 'services', label: 'الخدمات' },
  { value: 'products', label: 'المنتجات' },
  { value: 'cleaning', label: 'تنظيف' },
  { value: 'repair', label: 'إصلاح' },
  { value: 'care', label: 'عناية' },
]

export function createEmptyCatalogFormPayload(): AdminCatalogFormPayload {
  return {
    name: '',
    code: '',
    category: '',
    itemType: 'service',
    itemTypePreset: 'services',
    costPrice: '',
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
  return typeof value === 'string' ? value.trim() : ''
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
    isValidCatalogPrice(normalizeCatalogPrice(payload.costPrice)) &&
    isValidCatalogPrice(normalizeCatalogPrice(payload.defaultPrice))
  )
}

export function isSystemScopedCatalogAdmin(scopeType: AuthScopeType) {
  return scopeType === 'system'
}

export function getCatalogImagePath(
  itemId: string,
  extension: string,
  timestamp = Date.now()
) {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
  return `catalog-items/${itemId}-${timestamp}.${safeExtension}`
}

export function isAllowedCatalogImageMimeType(value: string) {
  return CATALOG_IMAGE_ALLOWED_MIME_TYPES.includes(
    value as (typeof CATALOG_IMAGE_ALLOWED_MIME_TYPES)[number]
  )
}

export function getCatalogItemTypeLabel(itemType: CatalogItemType) {
  return itemType === 'service' ? 'خدمة' : 'منتج'
}

export function getCatalogItemTypePreset(
  itemType: CatalogItemType,
  category: string
): CatalogItemTypePreset {
  const normalizedCategory = normalizeCatalogCategory(category)

  if (itemType === 'service' && normalizedCategory === 'تنظيف') {
    return 'cleaning'
  }

  if (itemType === 'service' && normalizedCategory === 'إصلاح') {
    return 'repair'
  }

  if (normalizedCategory === 'عناية') {
    return 'care'
  }

  return itemType === 'service' ? 'services' : 'products'
}

export function resolveCatalogItemTypePreset(
  preset: CatalogItemTypePreset
): {
  itemType: CatalogItemType
  categorySuggestion: string
} {
  if (preset === 'products') {
    return {
      itemType: 'product',
      categorySuggestion: '',
    }
  }

  if (preset === 'cleaning') {
    return {
      itemType: 'service',
      categorySuggestion: 'تنظيف',
    }
  }

  if (preset === 'repair') {
    return {
      itemType: 'service',
      categorySuggestion: 'إصلاح',
    }
  }

  if (preset === 'care') {
    return {
      itemType: 'service',
      categorySuggestion: 'عناية',
    }
  }

  return {
    itemType: 'service',
    categorySuggestion: '',
  }
}

export function extractCatalogCodeSequence(code: string) {
  const match = normalizeCatalogCode(code).match(/^#([0-9]+)$/)
  if (!match) return null

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

export function formatCatalogCode(sequence: number) {
  const safeSequence = Math.max(1, Math.floor(sequence))
  return `#${String(safeSequence).padStart(4, '0')}`
}

export function getNextCatalogCode(codes: string[]) {
  let highestSequence = 0

  for (const code of codes) {
    const sequence = extractCatalogCodeSequence(code)
    if (sequence && sequence > highestSequence) {
      highestSequence = sequence
    }
  }

  return formatCatalogCode(highestSequence + 1)
}
