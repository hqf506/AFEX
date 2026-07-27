import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createIdempotencyCommandIdentity,
  redactIdempotencyKey,
  type IdempotencyActor,
  type IdempotencyCommandIdentity,
  type IdempotencyEngineVersion,
} from '@/lib/idempotency/core'

export type IdempotencyReplayResult = {
  customer_id: string
  order_id: string
  order_number: string
  invoice_id: string
  invoice_number: string
  status: string
  customerId: string
  orderId: string
  orderNumber: string
  invoiceId: string
  invoiceNumber: string
  subtotal?: number
  discount?: number
  tax?: number
  total?: number
  itemsCount?: number
}

export type IdempotencyResolution =
  | { kind: 'continue'; source: 'legacy' | 'future-unavailable' }
  | {
      kind: 'replay'
      source: 'legacy' | 'core-v2'
      result: IdempotencyReplayResult
    }
  | {
      kind: 'conflict'
      code:
        | 'IDEMPOTENCY_FINGERPRINT_CONFLICT'
        | 'IDEMPOTENCY_FINGERPRINT_VERSION_CONFLICT'
        | 'IDEMPOTENCY_ACTOR_CONFLICT'
        | 'IDEMPOTENCY_ENGINE_CONFLICT'
        | 'IDEMPOTENCY_SCOPE_CONFLICT'
    }
  | { kind: 'in_progress'; code: 'IDEMPOTENCY_IN_PROGRESS' }
  | {
      kind: 'terminal'
      code: 'IDEMPOTENCY_COMMAND_REJECTED' | 'IDEMPOTENCY_COMMAND_FAILED_FINAL'
    }
  | { kind: 'invalid'; code: 'IDEMPOTENCY_RESOLVER_INVALID' }

type DatabaseError = {
  code?: string
  message?: string
  details?: string
}

export type CoreV2ResolverResult = {
  command_id: string
  tenant_id: string
  branch_id: string
  command_type: string
  request_fingerprint: string
  fingerprint_version: string
  actor_type: IdempotencyActor['type']
  actor_id: string | null
  engine_version: IdempotencyEngineVersion
  state:
    | 'started'
    | 'committed'
    | 'rejected'
    | 'failed_retryable'
    | 'failed_final'
  error_category: string | null
  error_code: string | null
  response_version: string | null
  response_hash: string | null
  customer_id: string | null
  order_id: string | null
  order_number: string | null
  invoice_id: string | null
  invoice_number: string | null
  initial_status: string | null
  subtotal: number | null
  discount: number | null
  tax: number | null
  total: number | null
  items_count: number | null
}

const FUTURE_SCHEMA_MISSING_CODES = new Set([
  '3F000',
  '42P01',
  '42883',
  'PGRST202',
  'PGRST204',
])

export class IdempotencyServiceError extends Error {
  constructor(
    readonly code:
      | 'IDEMPOTENCY_FINGERPRINT_CONFLICT'
      | 'IDEMPOTENCY_FINGERPRINT_VERSION_CONFLICT'
      | 'IDEMPOTENCY_ACTOR_CONFLICT'
      | 'IDEMPOTENCY_ENGINE_CONFLICT'
      | 'IDEMPOTENCY_SCOPE_CONFLICT'
      | 'IDEMPOTENCY_IN_PROGRESS'
      | 'IDEMPOTENCY_COMMAND_REJECTED'
      | 'IDEMPOTENCY_COMMAND_FAILED_FINAL'
      | 'IDEMPOTENCY_RESOLVER_INVALID',
    message: string
  ) {
    super(message)
    this.name = 'IdempotencyServiceError'
  }
}

function parseResolverRow(
  value: unknown
):
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'row'; row: Record<string, unknown> } {
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'none' }
    if (value.length !== 1) return { kind: 'invalid' }

    return value[0] && typeof value[0] === 'object'
      ? { kind: 'row', row: value[0] as Record<string, unknown> }
      : { kind: 'invalid' }
  }

  if (value === null || value === undefined) return { kind: 'none' }

  return value && typeof value === 'object'
    ? { kind: 'row', row: value as Record<string, unknown> }
    : { kind: 'invalid' }
}

function isFutureSchemaUnavailable(error: DatabaseError | null) {
  if (!error) return false

  if (FUTURE_SCHEMA_MISSING_CODES.has(error.code || '')) {
    return true
  }

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return (
    message.includes('resolve_idempotency_command') &&
    (message.includes('not found') || message.includes('does not exist'))
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeResolverResult(
  row: Record<string, unknown>
): CoreV2ResolverResult | null {
  const validState = [
    'started',
    'committed',
    'rejected',
    'failed_retryable',
    'failed_final',
  ].includes(String(row.state))
  const validActorType = [
    'user',
    'pos_employee',
    'system',
    'integration',
  ].includes(String(row.actor_type))
  const validEngine = ['v1', 'v2'].includes(String(row.engine_version))

  if (
    !isNonEmptyString(row.command_id) ||
    !isNonEmptyString(row.tenant_id) ||
    !isNonEmptyString(row.branch_id) ||
    !isNonEmptyString(row.command_type) ||
    !isNonEmptyString(row.request_fingerprint) ||
    !isNonEmptyString(row.fingerprint_version) ||
    !validActorType ||
    !isNullableString(row.actor_id) ||
    !validEngine ||
    !validState ||
    !isNullableString(row.error_category) ||
    !isNullableString(row.error_code) ||
    !isNullableString(row.response_version) ||
    !isNullableString(row.response_hash) ||
    !isNullableString(row.customer_id) ||
    !isNullableString(row.order_id) ||
    !isNullableString(row.order_number) ||
    !isNullableString(row.invoice_id) ||
    !isNullableString(row.invoice_number) ||
    !isNullableString(row.initial_status) ||
    !(row.subtotal === null || isFiniteNumber(row.subtotal)) ||
    !(row.discount === null || isFiniteNumber(row.discount)) ||
    !(row.tax === null || isFiniteNumber(row.tax)) ||
    !(row.total === null || isFiniteNumber(row.total)) ||
    !(
      row.items_count === null ||
      (Number.isInteger(row.items_count) && Number(row.items_count) >= 0)
    )
  ) {
    return null
  }

  return {
    ...(row as CoreV2ResolverResult),
  }
}

function normalizeFutureReplay(
  row: CoreV2ResolverResult
): IdempotencyReplayResult | null {
  if (
    !row.order_id ||
    !row.invoice_id ||
    !row.customer_id ||
    !row.order_number ||
    !row.invoice_number ||
    !row.initial_status ||
    !row.response_version ||
    !row.response_hash ||
    !/^[0-9a-f]{64}$/.test(row.response_hash) ||
    !isFiniteNumber(row.subtotal) ||
    !isFiniteNumber(row.discount) ||
    !isFiniteNumber(row.tax) ||
    !isFiniteNumber(row.total) ||
    !Number.isInteger(row.items_count) ||
    (row.items_count as number) < 1
  ) {
    return null
  }

  return {
    customer_id: row.customer_id,
    order_id: row.order_id,
    order_number: row.order_number,
    invoice_id: row.invoice_id,
    invoice_number: row.invoice_number,
    status: row.initial_status,
    customerId: row.customer_id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    subtotal: row.subtotal ?? undefined,
    discount: row.discount ?? undefined,
    tax: row.tax ?? undefined,
    total: row.total ?? undefined,
    itemsCount: row.items_count ?? undefined,
  }
}

export function createIdempotencyService(input: {
  supabase: SupabaseClient
  tenantId: string
  branchId: string
  actor: IdempotencyActor
  correlationId: string
  engineVersion?: IdempotencyEngineVersion
  futureReadsEnabled?: boolean
}) {
  const engineVersion = input.engineVersion || 'v1'
  const futureReadsEnabled =
    input.futureReadsEnabled ??
    process.env.AFEX_CORE_V2_IDEMPOTENCY_READS === 'true'

  const createCommand = ({
    clientKey,
    commandType,
    intent,
  }: {
    clientKey: string
    commandType: string
    intent: unknown
  }) =>
    createIdempotencyCommandIdentity({
      tenantId: input.tenantId,
      branchId: input.branchId,
      actor: input.actor,
      commandType,
      clientKey,
      intent,
      engineVersion,
      correlationId: input.correlationId,
    })

  const resolveFuture = async (
    command: IdempotencyCommandIdentity
  ): Promise<IdempotencyResolution> => {
    const { data, error } = await input.supabase.rpc(
      'resolve_idempotency_command',
      {
        p_tenant_id: command.tenantId,
        p_branch_id: command.branchId,
        p_command_type: command.commandType,
        p_idempotency_key_hash: command.keyHash,
      }
    )

    if (error) {
      if (isFutureSchemaUnavailable(error)) {
        return { kind: 'continue', source: 'future-unavailable' }
      }

      throw error
    }

    const parsed = parseResolverRow(data)
    if (parsed.kind === 'none') {
      return { kind: 'continue', source: 'legacy' }
    }
    if (parsed.kind === 'invalid') {
      return { kind: 'invalid', code: 'IDEMPOTENCY_RESOLVER_INVALID' }
    }

    const row = normalizeResolverResult(parsed.row)
    if (!row) {
      return { kind: 'invalid', code: 'IDEMPOTENCY_RESOLVER_INVALID' }
    }

    if (
      row.tenant_id !== command.tenantId ||
      row.branch_id !== command.branchId ||
      row.command_type !== command.commandType
    ) {
      return { kind: 'conflict', code: 'IDEMPOTENCY_SCOPE_CONFLICT' }
    }

    if (row.request_fingerprint !== command.requestFingerprint) {
      return {
        kind: 'conflict',
        code: 'IDEMPOTENCY_FINGERPRINT_CONFLICT',
      }
    }

    if (row.fingerprint_version !== command.fingerprintVersion) {
      return {
        kind: 'conflict',
        code: 'IDEMPOTENCY_FINGERPRINT_VERSION_CONFLICT',
      }
    }

    if (
      row.actor_type !== command.actor.type ||
      (row.actor_id || null) !== command.actor.id
    ) {
      return { kind: 'conflict', code: 'IDEMPOTENCY_ACTOR_CONFLICT' }
    }

    if (row.engine_version !== command.engineVersion) {
      return { kind: 'conflict', code: 'IDEMPOTENCY_ENGINE_CONFLICT' }
    }

    if (row.state === 'started' || row.state === 'failed_retryable') {
      return { kind: 'in_progress', code: 'IDEMPOTENCY_IN_PROGRESS' }
    }

    if (row.state === 'rejected') {
      return { kind: 'terminal', code: 'IDEMPOTENCY_COMMAND_REJECTED' }
    }

    if (row.state === 'failed_final') {
      return {
        kind: 'terminal',
        code: 'IDEMPOTENCY_COMMAND_FAILED_FINAL',
      }
    }

    const result = normalizeFutureReplay(row)
    return result
      ? { kind: 'replay', source: 'core-v2', result }
      : { kind: 'invalid', code: 'IDEMPOTENCY_RESOLVER_INVALID' }
  }

  const resolveLegacy = async (
    clientKey: string
  ): Promise<IdempotencyResolution> => {
    const { data, error } = await input.supabase
      .from('orders')
      .select(
        `
          id,
          order_number,
          customer_id,
          status,
          invoices (
            id,
            invoice_number
          )
        `
      )
      .eq('client_idempotency_key', clientKey)
      .eq('tenant_id', input.tenantId)
      .maybeSingle()

    if (error) throw error
    if (!data) return { kind: 'continue', source: 'legacy' }

    const invoices = Array.isArray(data.invoices)
      ? data.invoices
      : data.invoices
        ? [data.invoices]
        : []
    const invoice = invoices[0] as
      | { id?: string | null; invoice_number?: string | null }
      | undefined
    const orderId = data.id || ''
    const invoiceId = invoice?.id || ''

    return {
      kind: 'replay',
      source: 'legacy',
      result: {
        customer_id: data.customer_id || '',
        order_id: orderId,
        order_number: data.order_number || '',
        invoice_id: invoiceId,
        invoice_number: invoice?.invoice_number || '',
        status: data.status || '',
        customerId: data.customer_id || '',
        orderId,
        orderNumber: data.order_number || '',
        invoiceId,
        invoiceNumber: invoice?.invoice_number || '',
      },
    }
  }

  const resolveBeforeExecution = async ({
    clientKey,
    command,
  }: {
    clientKey: string
    command: IdempotencyCommandIdentity
  }) => {
    try {
      if (futureReadsEnabled) {
        const future = await resolveFuture(command)
        if (future.kind !== 'continue') return future
      }

      return await resolveLegacy(clientKey)
    } catch (error) {
      console.warn('[idempotency] resolution failed', {
        correlationId: command.correlationId,
        commandType: command.commandType,
        key: redactIdempotencyKey(clientKey),
        category:
          error && typeof error === 'object' && 'code' in error
            ? String(error.code)
            : 'IDEMPOTENCY_RESOLUTION_FAILED',
      })
      throw error
    }
  }

  return {
    createCommand,
    resolveBeforeExecution,
    async recoverAfterUncertainResult({
      clientKey,
      command,
    }: {
      clientKey: string
      command: IdempotencyCommandIdentity
    }) {
      return resolveBeforeExecution({ clientKey, command })
    },
    redactedKey(clientKey: string) {
      return redactIdempotencyKey(clientKey)
    },
  }
}
