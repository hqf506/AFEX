import { createSecureUuidV4 } from '@/lib/offline/phase1'

export const POS_CHECKOUT_IDENTITY_STORAGE_KEY = 'afex_pos_checkout_identity_v1'

export type PosCheckoutIdentityRecord = {
  version: 1
  requestId: string
  fingerprint: string
  state: 'pending' | 'succeeded'
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    )
  }
  return value ?? null
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

export async function fingerprintPosCheckoutDraft(value: unknown) {
  return sha256(JSON.stringify(canonicalize(value)))
}

export function readPosCheckoutIdentity(): PosCheckoutIdentityRecord | null {
  if (typeof window === 'undefined') return null

  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(POS_CHECKOUT_IDENTITY_STORAGE_KEY) || ''
    ) as Partial<PosCheckoutIdentityRecord>

    if (
      parsed.version !== 1 ||
      typeof parsed.requestId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(parsed.requestId) ||
      typeof parsed.fingerprint !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(parsed.fingerprint) ||
      (parsed.state !== 'pending' && parsed.state !== 'succeeded')
    ) {
      return null
    }

    return parsed as PosCheckoutIdentityRecord
  } catch {
    return null
  }
}

export function writePosCheckoutIdentity(record: PosCheckoutIdentityRecord) {
  window.sessionStorage.setItem(
    POS_CHECKOUT_IDENTITY_STORAGE_KEY,
    JSON.stringify(record)
  )
}

export async function acquirePosCheckoutIdentity(draft: unknown) {
  const fingerprint = await fingerprintPosCheckoutDraft(draft)
  const existing = readPosCheckoutIdentity()

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new Error('POS_CHECKOUT_IDENTITY_FINGERPRINT_CONFLICT')
    }
    return existing
  }

  const created: PosCheckoutIdentityRecord = {
    version: 1,
    requestId: createSecureUuidV4(),
    fingerprint,
    state: 'pending',
  }
  writePosCheckoutIdentity(created)
  return created
}

export function markPosCheckoutIdentitySucceeded(requestId: string) {
  const current = readPosCheckoutIdentity()
  if (!current || current.requestId !== requestId) return false
  writePosCheckoutIdentity({ ...current, state: 'succeeded' })
  return true
}

export function clearPosCheckoutIdentity() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(POS_CHECKOUT_IDENTITY_STORAGE_KEY)
}

export function getPosCheckoutIdentityTestMarker() {
  const current = readPosCheckoutIdentity()
  if (!current) return null
  return `${current.requestId}:${current.fingerprint.slice(0, 16)}:${current.state}`
}
