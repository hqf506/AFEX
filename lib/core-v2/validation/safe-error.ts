import 'server-only'

import {
  SAFE_ARABIC_MESSAGE_MAX_LENGTH,
  SAFE_CORRELATION_ID_MAX_LENGTH,
  SAFE_ERROR_CODE_MAX_LENGTH,
  type SafeExternalError,
} from '../contracts/errors'
import { CoreV2ContractValidationError } from './errors'
import { readPlainDataRecord } from './object-shape'
import { asCorrelationId } from './primitives'
import { hasOnlyUnicodeScalarValues } from './unicode'

const SAFE_ERROR_KEYS = [
  'code',
  'messageAr',
  'retryable',
  'correlationId',
  'httpStatus',
] as const

const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/
const ARABIC_PATTERN = /[\u0600-\u06ff]/
const INTERNAL_DETAIL_PATTERN =
  /\b(?:sql|sqlstate|relation|constraint|function|table|database|role|stack|supabase|service[_ -]?role)\b/i
const FORBIDDEN_IDEMPOTENCY_TERMS = [
  'idempotency',
  'xidempotencykey',
  'requestkey',
  'deduplicationkey',
  'duplicatecommandkey',
  'commandkey',
  'مفتاحعدمالتكرار',
  'مفتاحالطلبالداخلي',
  'مفتاحالتكرار',
  'معرفمنعالتكرار',
] as const

function containsForbiddenIdempotencyTerminology(message: string): boolean {
  const normalized = message
    .toLocaleLowerCase('en-US')
    .replace(/[\s_-]+/gu, '')
  return FORBIDDEN_IDEMPOTENCY_TERMS.some((term) =>
    normalized.includes(term)
  )
}

export function validateSafeExternalError(value: unknown): SafeExternalError {
  const record = readPlainDataRecord(value, 'error', SAFE_ERROR_KEYS)
  if (
    typeof record.messageAr === 'string' &&
    containsForbiddenIdempotencyTerminology(record.messageAr)
  ) {
    throw new CoreV2ContractValidationError(
      'SAFE_ERROR_IDEMPOTENCY_LEAK',
      'messageAr',
      'Safe external messages must use an approved non-sensitive message'
    )
  }
  if (
    typeof record.code !== 'string' ||
    !SAFE_CODE_PATTERN.test(record.code) ||
    record.code.length > SAFE_ERROR_CODE_MAX_LENGTH ||
    typeof record.messageAr !== 'string' ||
    record.messageAr.trim().length < 1 ||
    record.messageAr.length > SAFE_ARABIC_MESSAGE_MAX_LENGTH ||
    !hasOnlyUnicodeScalarValues(record.messageAr) ||
    !ARABIC_PATTERN.test(record.messageAr) ||
    INTERNAL_DETAIL_PATTERN.test(record.messageAr) ||
    typeof record.retryable !== 'boolean' ||
    !Number.isInteger(record.httpStatus) ||
    Number(record.httpStatus) < 400 ||
    Number(record.httpStatus) > 599
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_SAFE_ERROR',
      'error',
      'Safe external error fields are invalid'
    )
  }
  if (
    typeof record.correlationId !== 'string' ||
    record.correlationId.length > SAFE_CORRELATION_ID_MAX_LENGTH
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_SAFE_ERROR',
      'correlationId',
      'Safe correlation ID exceeds its Runtime policy'
    )
  }
  asCorrelationId(record.correlationId)
  return Object.freeze(record) as SafeExternalError
}

export function buildSafeExternalError(
  value: SafeExternalError
): SafeExternalError {
  return validateSafeExternalError(value)
}
