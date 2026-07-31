import 'server-only'

import {
  COMMAND_DISPOSITIONS,
  CORE_V2_RUNTIME_STATES,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  IDEMPOTENCY_KEY_PATTERN,
  LEGACY_PATH_MIGRATION_DISPOSITIONS,
  RECOGNIZED_COMMAND_TYPES,
  type ActorId,
  type BranchId,
  type CommandDisposition,
  type CommandId,
  type CommandType,
  type CoreV2RuntimeState,
  type CorrelationId,
  type IdempotencyKey,
  type LegacyPathMigrationDisposition,
  type LedgerId,
  type OutboxEventId,
  type ReplayRequestId,
  type TenantId,
} from '../contracts'
import { CoreV2ContractValidationError } from './errors'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CORRELATION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new CoreV2ContractValidationError(
      'INVALID_STRING',
      field,
      `${field} must be a string`
    )
  }
  return value
}

export function validateUuidIdentity(value: unknown, field = 'identity'): string {
  const candidate = requireString(value, field)
  if (!UUID_PATTERN.test(candidate)) {
    throw new CoreV2ContractValidationError(
      'INVALID_UUID',
      field,
      `${field} must be a lowercase canonical UUID`
    )
  }
  return candidate
}

export const asTenantId = (value: unknown) =>
  validateUuidIdentity(value, 'tenantId') as TenantId
export const asBranchId = (value: unknown) =>
  validateUuidIdentity(value, 'branchId') as BranchId
export const asActorId = (value: unknown) =>
  validateUuidIdentity(value, 'actorId') as ActorId
export const asCommandId = (value: unknown) =>
  validateUuidIdentity(value, 'commandId') as CommandId
export const asLedgerId = (value: unknown) =>
  validateUuidIdentity(value, 'ledgerId') as LedgerId
export const asReplayRequestId = (value: unknown) =>
  validateUuidIdentity(value, 'replayRequestId') as ReplayRequestId
export const asOutboxEventId = (value: unknown) =>
  validateUuidIdentity(value, 'outboxEventId') as OutboxEventId

export function asCorrelationId(value: unknown): CorrelationId {
  const candidate = requireString(value, 'correlationId')
  if (!CORRELATION_PATTERN.test(candidate)) {
    throw new CoreV2ContractValidationError(
      'INVALID_CORRELATION_ID',
      'correlationId',
      'correlationId must contain 1 to 128 safe ASCII characters'
    )
  }
  return candidate as CorrelationId
}

export function validateIdempotencyKey(value: unknown): IdempotencyKey {
  const candidate = requireString(value, 'idempotencyKey')
  if (
    candidate.length < IDEMPOTENCY_KEY_MIN_LENGTH ||
    candidate.length > IDEMPOTENCY_KEY_MAX_LENGTH ||
    !IDEMPOTENCY_KEY_PATTERN.test(candidate)
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_IDEMPOTENCY_KEY',
      'idempotencyKey',
      'idempotencyKey must contain 1 to 512 safe ASCII characters'
    )
  }
  return candidate as IdempotencyKey
}

export function validateCommandType(value: unknown): CommandType {
  if (
    typeof value !== 'string' ||
    !RECOGNIZED_COMMAND_TYPES.includes(
      value as (typeof RECOGNIZED_COMMAND_TYPES)[number]
    )
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_COMMAND_TYPE',
      'commandType',
      'commandType is not recognized'
    )
  }
  return value as CommandType
}

export function validateRuntimeState(value: unknown): CoreV2RuntimeState {
  if (
    typeof value !== 'string' ||
    !CORE_V2_RUNTIME_STATES.includes(value as CoreV2RuntimeState)
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_RUNTIME_STATE',
      'runtimeState',
      'runtimeState is not recognized'
    )
  }
  return value as CoreV2RuntimeState
}

export function validateMigrationDisposition(
  value: unknown
): LegacyPathMigrationDisposition {
  if (
    typeof value !== 'string' ||
    !LEGACY_PATH_MIGRATION_DISPOSITIONS.includes(
      value as LegacyPathMigrationDisposition
    )
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_MIGRATION_DISPOSITION',
      'migrationDisposition',
      'migrationDisposition is not recognized'
    )
  }
  return value as LegacyPathMigrationDisposition
}

export function validateCommandDisposition(value: unknown): CommandDisposition {
  if (
    typeof value !== 'string' ||
    !COMMAND_DISPOSITIONS.includes(value as CommandDisposition)
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_COMMAND_DISPOSITION',
      'commandDisposition',
      'commandDisposition is not recognized'
    )
  }
  return value as CommandDisposition
}
