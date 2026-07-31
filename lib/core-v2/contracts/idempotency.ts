import 'server-only'

import type { BranchId, TenantId } from './identities'

declare const idempotencyBrand: unique symbol
declare const fingerprintBrand: unique symbol
declare const canonicalBytesBrand: unique symbol

export type IdempotencyKey = string & {
  readonly [idempotencyBrand]: 'IdempotencyKey'
}

export type RequestFingerprint = string & {
  readonly [fingerprintBrand]: 'RequestFingerprintSha256Hex'
}

export type CanonicalJsonBytes = string & {
  readonly [canonicalBytesBrand]: 'CanonicalJsonUtf8Bytes'
}

export const IDEMPOTENCY_KEY_MIN_LENGTH = 1
export const IDEMPOTENCY_KEY_MAX_LENGTH = 512
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,512}$/
export const CANONICAL_PAYLOAD_MAX_UTF8_BYTES = 262_144
export const FINGERPRINT_PROJECTION_MAX_UTF8_BYTES = 262_144

export type IdempotencyIdentity = Readonly<{
  tenantId: TenantId
  branchId: BranchId
  commandType: 'order.create'
  key: IdempotencyKey
}>

export type CanonicalFingerprintContract = Readonly<{
  version: 'order-request-fingerprint-v1'
  canonicalProjection: CanonicalJsonBytes
  fingerprint: RequestFingerprint
}>

export const IDEMPOTENCY_RULES = Object.freeze({
  owner: 'trusted_runtime_request',
  normalization: 'identity_no_trim_no_case_fold',
  propagation: 'same_key_for_every_retry_of_same_logical_request',
  immutableAfterAcceptance: true,
  sameKeySamePayload: 'created_in_progress_or_replay',
  sameKeyConflictingPayload: 'fingerprint_conflict',
  missingKey: 'reject',
  malformedKey: 'reject',
  replacementKey: 'forbidden',
  logging: 'never_log_raw_key_log_only_approved_digest_reference',
} as const)
