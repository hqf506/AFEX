export const PROFILE_PRESENTATION_KEYS = Object.freeze([
  'username',
  'full_name',
  'contact_email',
  'phone',
  'tenant_name',
  'branch_name',
  'ui_capabilities',
] as const)

export const PROFILE_PRESENTATION_CAPABILITIES = Object.freeze([
  'admin:full',
  'orders:read',
  'orders:write',
  'pos:access',
  'reports:read',
  'support:access',
] as const)

export type ProfilePresentationCapability =
  (typeof PROFILE_PRESENTATION_CAPABILITIES)[number]

export type ProfilePresentation = Readonly<{
  username: string | null
  full_name: string | null
  contact_email: string | null
  phone: string | null
  tenant_name: string | null
  branch_name: string | null
  ui_capabilities: readonly ProfilePresentationCapability[]
}>

type ProfilePresentationInput = Omit<ProfilePresentation, 'ui_capabilities'> & {
  ui_capabilities: Iterable<string>
}

const capabilitySet = new Set<string>(PROFILE_PRESENTATION_CAPABILITIES)

function normalizePresentationText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

export function createProfilePresentation(
  input: ProfilePresentationInput
): ProfilePresentation {
  const uiCapabilities = [...new Set(input.ui_capabilities)]
    .filter(
      (capability): capability is ProfilePresentationCapability =>
        capabilitySet.has(capability)
    )
    .sort()

  return Object.freeze({
    username: normalizePresentationText(input.username),
    full_name: normalizePresentationText(input.full_name),
    contact_email: normalizePresentationText(input.contact_email),
    phone: normalizePresentationText(input.phone),
    tenant_name: normalizePresentationText(input.tenant_name),
    branch_name: normalizePresentationText(input.branch_name),
    ui_capabilities: Object.freeze(uiCapabilities),
  })
}

export function parseProfilePresentation(value: unknown): ProfilePresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('PROFILE_PRESENTATION_INVALID_RESPONSE')
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  const expectedKeys = [...PROFILE_PRESENTATION_KEYS].sort()
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error('PROFILE_PRESENTATION_INVALID_RESPONSE')
  }

  for (const key of PROFILE_PRESENTATION_KEYS.slice(0, 6)) {
    if (record[key] !== null && typeof record[key] !== 'string') {
      throw new Error('PROFILE_PRESENTATION_INVALID_RESPONSE')
    }
  }

  if (
    !Array.isArray(record.ui_capabilities) ||
    record.ui_capabilities.some(
      (capability) =>
        typeof capability !== 'string' || !capabilitySet.has(capability)
    )
  ) {
    throw new Error('PROFILE_PRESENTATION_INVALID_RESPONSE')
  }

  return createProfilePresentation({
    username: record.username as string | null,
    full_name: record.full_name as string | null,
    contact_email: record.contact_email as string | null,
    phone: record.phone as string | null,
    tenant_name: record.tenant_name as string | null,
    branch_name: record.branch_name as string | null,
    ui_capabilities: record.ui_capabilities,
  })
}
