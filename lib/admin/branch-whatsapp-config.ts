import { getTrimmedString, isBooleanValue } from '@/lib/api/validation'
import type { AuthScopeType } from '@/lib/auth-profile'

export const BRANCH_WHATSAPP_PROVIDERS = ['ultramsg', 'meta'] as const

export type BranchWhatsAppProvider = (typeof BRANCH_WHATSAPP_PROVIDERS)[number]

export type BranchWhatsAppConfigRow = {
  id: string
  branch_id: string
  provider: BranchWhatsAppProvider
  phone_number: string
  instance_id: string
  token: string
  api_url: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type BranchWhatsAppConfigRecord = Omit<BranchWhatsAppConfigRow, 'token'> & {
  has_token: boolean
  token_masked: string
}

export type BranchWhatsAppConfigPayload = {
  branchId: string
  provider: BranchWhatsAppProvider
  phoneNumber: string
  instanceId: string
  token: string
  apiUrl: string
  isActive: boolean
}

export const BRANCH_WHATSAPP_PROVIDER_OPTIONS: Array<{
  value: BranchWhatsAppProvider
  label: string
}> = [
  { value: 'ultramsg', label: 'UltraMsg' },
  { value: 'meta', label: 'Meta / Official' },
]

export function createEmptyBranchWhatsAppConfigPayload(): BranchWhatsAppConfigPayload {
  return {
    branchId: '',
    provider: 'ultramsg',
    phoneNumber: '',
    instanceId: '',
    token: '',
    apiUrl: '',
    isActive: false,
  }
}

export function normalizeBranchWhatsAppBranchId(value: unknown) {
  return getTrimmedString(value)
}

export function normalizeBranchWhatsAppProvider(
  value: unknown
): BranchWhatsAppProvider | null {
  const normalized = getTrimmedString(value).toLowerCase()

  if (normalized === 'ultramsg' || normalized === 'meta') {
    return normalized
  }

  return null
}

export function normalizeBranchWhatsAppPhoneNumber(value: unknown) {
  return getTrimmedString(value)
}

export function normalizeBranchWhatsAppInstanceId(value: unknown) {
  return getTrimmedString(value)
}

export function normalizeBranchWhatsAppToken(value: unknown) {
  return getTrimmedString(value)
}

export function normalizeBranchWhatsAppApiUrl(value: unknown) {
  return getTrimmedString(value)
}

export function normalizeBranchWhatsAppIsActive(value: unknown) {
  if (isBooleanValue(value)) {
    return value
  }

  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }

  return null
}

export function isValidBranchWhatsAppProvider(
  value: unknown
): value is BranchWhatsAppProvider {
  return value === 'ultramsg' || value === 'meta'
}

export function isValidBranchWhatsAppPhoneNumber(value: string) {
  return value.length >= 6
}

export function isValidBranchWhatsAppInstanceId(value: string) {
  return value.length >= 2
}

export function isValidBranchWhatsAppApiUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

export function isSystemScopedBranchWhatsAppAdmin(scopeType: AuthScopeType) {
  return scopeType === 'system'
}

export function resolveManagedBranchWhatsAppBranchId(
  scopeType: AuthScopeType,
  actorBranchId: string | null,
  requestedBranchId: string
) {
  if (scopeType === 'system') {
    return requestedBranchId
  }

  return actorBranchId || ''
}

export function canManageBranchWhatsAppConfig(
  scopeType: AuthScopeType,
  actorBranchId: string | null,
  requestedBranchId: string
) {
  if (scopeType === 'system') {
    return true
  }

  return Boolean(actorBranchId) && actorBranchId === requestedBranchId
}

export function maskBranchWhatsAppToken(token: string) {
  const normalized = token.trim()

  if (!normalized) return ''
  if (normalized.length <= 6) return '••••••'

  return `${normalized.slice(0, 3)}••••••${normalized.slice(-3)}`
}

export function sanitizeBranchWhatsAppConfig(
  config: BranchWhatsAppConfigRow
): BranchWhatsAppConfigRecord {
  return {
    id: config.id,
    branch_id: config.branch_id,
    provider: config.provider,
    phone_number: config.phone_number,
    instance_id: config.instance_id,
    api_url: config.api_url,
    is_active: config.is_active,
    created_at: config.created_at,
    updated_at: config.updated_at,
    has_token: Boolean(config.token.trim()),
    token_masked: maskBranchWhatsAppToken(config.token),
  }
}

export function canSubmitBranchWhatsAppConfig(
  payload: BranchWhatsAppConfigPayload,
  hasStoredToken = false
) {
  return (
    normalizeBranchWhatsAppBranchId(payload.branchId).length > 0 &&
    isValidBranchWhatsAppProvider(payload.provider) &&
    isValidBranchWhatsAppPhoneNumber(
      normalizeBranchWhatsAppPhoneNumber(payload.phoneNumber)
    ) &&
    isValidBranchWhatsAppInstanceId(
      normalizeBranchWhatsAppInstanceId(payload.instanceId)
    ) &&
    isValidBranchWhatsAppApiUrl(normalizeBranchWhatsAppApiUrl(payload.apiUrl)) &&
    (normalizeBranchWhatsAppToken(payload.token).length > 0 || hasStoredToken)
  )
}
