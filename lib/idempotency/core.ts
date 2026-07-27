import { createHash } from 'node:crypto'

export type IdempotencyEngineVersion = 'v1' | 'v2'

export type IdempotencyActor = {
  type: 'user' | 'pos_employee' | 'system' | 'integration'
  id: string | null
}

export type IdempotencyCommandIdentity = {
  tenantId: string
  branchId: string
  actor: IdempotencyActor
  commandType: string
  keyHash: string
  requestFingerprint: string
  fingerprintVersion: string
  engineVersion: IdempotencyEngineVersion
  correlationId: string
}

export type OrderCommandIntent = {
  contractVersion: 'order-command-v1'
  commandType: 'order.create'
  tenantId: string
  branchId: string
  actor: IdempotencyActor
  customer: {
    name: string | null
    phone: string | null
  }
  items: Array<{
    line: number
    itemId: string
    quantity: string
  }>
  payment: {
    method: string | null
    amountTendered: string | null
  }
  note: string | null
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().normalize('NFC')
  return normalized || null
}

function normalizeDecimal(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  if (Object.is(value, -0)) return '0'
  return value.toString()
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)])
    )
  }

  if (typeof value === 'string') {
    return value.normalize('NFC')
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical idempotency input must be finite')
    }

    return Object.is(value, -0) ? 0 : value
  }

  return value ?? null
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value))
}

export function sha256Hex(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function hashIdempotencyKey(key: string) {
  return sha256Hex(key.trim())
}

export function fingerprintIdempotencyRequest(intent: unknown) {
  return sha256Hex(canonicalJson(intent))
}

export function redactIdempotencyKey(key: string) {
  return `sha256:${hashIdempotencyKey(key).slice(0, 12)}`
}

export function buildOrderCommandIntent(input: {
  tenantId: string
  branchId: string
  actor: IdempotencyActor
  customerName: unknown
  customerPhoneNormalized: unknown
  items: Array<{
    item_id?: string | null
    quantity?: number
  }>
  paymentMethod: unknown
  amountTendered: unknown
  note: unknown
}): OrderCommandIntent {
  return {
    contractVersion: 'order-command-v1',
    commandType: 'order.create',
    tenantId: input.tenantId,
    branchId: input.branchId,
    actor: input.actor,
    customer: {
      name: normalizeText(input.customerName),
      phone: normalizeText(input.customerPhoneNormalized),
    },
    items: input.items
      .map((item, index) => ({
        line: index + 1,
        itemId: normalizeText(item.item_id) || '',
        quantity: normalizeDecimal(item.quantity) || '0',
      }))
      .filter((item) => item.itemId),
    payment: {
      method: normalizeText(input.paymentMethod),
      amountTendered: normalizeDecimal(input.amountTendered),
    },
    note: normalizeText(input.note),
  }
}

export function createIdempotencyCommandIdentity(input: {
  tenantId: string
  branchId: string
  actor: IdempotencyActor
  commandType: string
  clientKey: string
  intent: unknown
  engineVersion: IdempotencyEngineVersion
  correlationId: string
}): IdempotencyCommandIdentity {
  return {
    tenantId: input.tenantId,
    branchId: input.branchId,
    actor: input.actor,
    commandType: input.commandType,
    keyHash: hashIdempotencyKey(input.clientKey),
    requestFingerprint: fingerprintIdempotencyRequest(input.intent),
    fingerprintVersion: 'order-command-v1',
    engineVersion: input.engineVersion,
    correlationId: input.correlationId,
  }
}
