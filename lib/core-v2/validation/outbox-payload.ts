import 'server-only'

import type {
  UntrustedJsonValue,
  ValidatedOutboxPayload,
} from '../contracts/outbox'
import { CoreV2ContractValidationError } from './errors'
import { readPlainDataRecord } from './object-shape'
import { hasOnlyUnicodeScalarValues } from './unicode'

export const OUTBOX_SAFE_PAYLOAD_MAX_DEPTH = 8
export const OUTBOX_SAFE_PAYLOAD_MAX_KEYS = 256
export const OUTBOX_SAFE_PAYLOAD_MAX_ARRAY_LENGTH = 256
export const OUTBOX_SAFE_PAYLOAD_MAX_UTF8_BYTES = 16_384
const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const FORBIDDEN_KEY =
  /(?:password|passwd|token|secret|authorization|idempotency.*key|stack|sql|sqlstate|database|constraint|function|role|cause)/i
const DANGEROUS_OBJECT_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
])
const RESERVED_NORMALIZED_KEYS = new Set([
  'provider',
  'providerid',
  'providername',
  'providerreference',
  'providermessageid',
  'providerstatus',
  'providerresponse',
  'providerpayload',
  'deliveryprovider',
  'channelprovider',
  'recipientprovider',
  'diagnostic',
  'diagnostics',
  'internaldiagnostic',
  'internaldiagnostics',
  'debug',
  'debuginfo',
  'trace',
  'stack',
  'cause',
  'errordetail',
  'failuredetail',
  'lastfailurestage',
  'retrymetadata',
  'deliveryattempt',
  'attemptmetadata',
  'workermetadata',
  'internalmetadata',
])
const validatedPayloads = new WeakSet<object>()

function normalizePolicyKey(key: string) {
  return key.toLowerCase().replaceAll('_', '').replaceAll('-', '')
}

function inspectArray(
  value: unknown[],
  field: string,
  depth: number,
  state: { keys: number }
): readonly UntrustedJsonValue[] {
  let prototype: object | null
  let descriptors: Record<string, PropertyDescriptor>
  let symbols: symbol[]
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
    symbols = Object.getOwnPropertySymbols(value)
  } catch {
    throw new CoreV2ContractValidationError(
      'OUTBOX_ARRAY_INSPECTION',
      'safePayload',
      'Outbox array could not be inspected safely'
    )
  }
  if (prototype !== Array.prototype || symbols.length > 0) {
    throw new CoreV2ContractValidationError(
      'OUTBOX_ARRAY_PROTOTYPE',
      'safePayload',
      'Outbox arrays must use the standard Array prototype'
    )
  }
  const lengthDescriptor = descriptors.length
  if (
    !lengthDescriptor ||
    !('value' in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    throw new CoreV2ContractValidationError(
      'OUTBOX_ARRAY_SHAPE',
      'safePayload',
      'Outbox array length is invalid'
    )
  }
  if (lengthDescriptor.value > OUTBOX_SAFE_PAYLOAD_MAX_ARRAY_LENGTH) {
    throw new CoreV2ContractValidationError(
      'OUTBOX_ARRAY',
      'safePayload',
      'Outbox array is too large'
    )
  }
  const result: UntrustedJsonValue[] = []
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor || !('value' in descriptor) || descriptor.get || descriptor.set) {
      throw new CoreV2ContractValidationError(
        'OUTBOX_ARRAY_SHAPE',
        `${field}.${index}`,
        'Sparse or accessor array entries are forbidden'
      )
    }
    result.push(inspect(descriptor.value, `${field}.${index}`, depth + 1, state))
  }
  const unexpected = Object.keys(descriptors).filter(
    (key) => key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key)
  )
  if (unexpected.length > 0) {
    throw new CoreV2ContractValidationError(
      'OUTBOX_ARRAY_KEYS',
      'safePayload',
      'Outbox arrays cannot contain named properties'
    )
  }
  return Object.freeze(result)
}

function inspect(
  value: unknown,
  field: string,
  depth: number,
  state: { keys: number }
): UntrustedJsonValue {
  if (depth > OUTBOX_SAFE_PAYLOAD_MAX_DEPTH)
    throw new CoreV2ContractValidationError('OUTBOX_DEPTH', 'safePayload', 'Outbox payload is too deep')
  if (value === null || typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    if (!hasOnlyUnicodeScalarValues(value))
      throw new CoreV2ContractValidationError(
        'OUTBOX_UNICODE',
        'safePayload',
        'Outbox strings must contain valid Unicode scalar values'
      )
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new CoreV2ContractValidationError(
        'OUTBOX_NUMBER',
        'safePayload',
        'Outbox numbers must be finite and must not be negative zero'
      )
    return value
  }
  if (Array.isArray(value)) {
    return inspectArray(value, field, depth, state)
  }
  if (typeof value !== 'object')
    throw new CoreV2ContractValidationError('OUTBOX_TYPE', 'safePayload', 'Outbox payload contains a non-JSON value')
  const record = readPlainDataRecord(value, field)
  const result: Record<string, UntrustedJsonValue> = Object.create(null)
  for (const [key, entry] of Object.entries(record)) {
    state.keys += 1
    if (
      state.keys > OUTBOX_SAFE_PAYLOAD_MAX_KEYS ||
      !SAFE_KEY.test(key) ||
      DANGEROUS_OBJECT_KEYS.has(key) ||
      RESERVED_NORMALIZED_KEYS.has(normalizePolicyKey(key)) ||
      FORBIDDEN_KEY.test(key)
    )
      throw new CoreV2ContractValidationError('OUTBOX_KEY', `${field}.${key}`, 'Outbox payload key is unsafe')
    Object.defineProperty(result, key, {
      value: inspect(entry, `${field}.${key}`, depth + 1, state),
      enumerable: true,
      writable: false,
      configurable: false,
    })
  }
  Object.setPrototypeOf(result, Object.prototype)
  return Object.freeze(result)
}

export function validateOutboxSafePayload(
  value: unknown
): ValidatedOutboxPayload {
  const result = inspect(value, 'safePayload', 0, { keys: 0 })
  let serialized: string
  try {
    serialized = JSON.stringify(result)
  } catch {
    throw new CoreV2ContractValidationError('OUTBOX_SERIALIZATION', 'safePayload', 'Outbox payload is not serializable')
  }
  if (new TextEncoder().encode(serialized).byteLength > OUTBOX_SAFE_PAYLOAD_MAX_UTF8_BYTES)
    throw new CoreV2ContractValidationError('OUTBOX_SIZE', 'safePayload', 'Outbox payload is too large')
  const validated = Object.freeze({ value: result })
  validatedPayloads.add(validated)
  return validated as ValidatedOutboxPayload
}

export function hasValidatedOutboxPayloadProvenance(
  value: unknown
): value is ValidatedOutboxPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    validatedPayloads.has(value)
  )
}
