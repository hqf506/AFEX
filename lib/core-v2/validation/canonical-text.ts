import 'server-only'

import {
  CANONICAL_PAYLOAD_MAX_UTF8_BYTES,
  FINGERPRINT_PROJECTION_MAX_UTF8_BYTES,
  type CanonicalJsonBytes,
  type RequestFingerprint,
} from '../contracts/idempotency'
import { CoreV2ContractValidationError } from './errors'
import { hasOnlyUnicodeScalarValues } from './unicode'

function validateCanonicalText(
  value: unknown,
  field: string,
  maximumBytes: number
): CanonicalJsonBytes {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CoreV2ContractValidationError(
      'INVALID_CANONICAL_TEXT',
      field,
      `${field} must be a non-empty string`
    )
  }
  if (!hasOnlyUnicodeScalarValues(value)) {
    throw new CoreV2ContractValidationError(
      'INVALID_UNICODE_SCALAR',
      field,
      `${field} contains an unpaired UTF-16 surrogate`
    )
  }
  if (new TextEncoder().encode(value).byteLength > maximumBytes) {
    throw new CoreV2ContractValidationError(
      'CANONICAL_TEXT_TOO_LARGE',
      field,
      `${field} exceeds the Runtime byte limit`
    )
  }
  return value as CanonicalJsonBytes
}

export const validateCanonicalPayloadText = (value: unknown) =>
  validateCanonicalText(
    value,
    'canonicalPayload',
    CANONICAL_PAYLOAD_MAX_UTF8_BYTES
  )

export const validateFingerprintProjectionText = (value: unknown) =>
  validateCanonicalText(
    value,
    'fingerprintProjection',
    FINGERPRINT_PROJECTION_MAX_UTF8_BYTES
  )

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

export function validateRequestFingerprint(
  value: unknown
): RequestFingerprint {
  if (typeof value !== 'string' || !SHA256_HEX_PATTERN.test(value)) {
    throw new CoreV2ContractValidationError(
      'INVALID_REQUEST_FINGERPRINT',
      'fingerprint',
      'fingerprint must be exactly 32 bytes encoded as lowercase hexadecimal'
    )
  }
  return value as RequestFingerprint
}
