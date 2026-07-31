import 'server-only'

import type { CommandEnvelope } from '../contracts'
import { hasDatabaseAuthorityProvenance } from '../internal/authority-provenance'
import { CoreV2ContractValidationError } from './errors'
import { readPlainDataRecord } from './object-shape'
import {
  validateCanonicalPayloadText,
  validateFingerprintProjectionText,
  validateRequestFingerprint,
} from './canonical-text'
import {
  asCorrelationId,
  validateCommandType,
  validateIdempotencyKey,
  validateUuidIdentity,
} from './primitives'

const ENVELOPE_KEYS = [
  'authorization',
  'identity',
  'idempotency',
  'correlationId',
  'commandType',
  'payload',
  'diagnostics',
] as const

const FORBIDDEN_CALLER_AUTHORITY_KEYS = new Set([
  'tenant',
  'tenantid',
  'branch',
  'branchid',
  'role',
  'roles',
  'permission',
  'permissions',
  'scope',
  'scopes',
  'capability',
  'capabilities',
  'accessiblebranchids',
  'employeesource',
  'employeesourceid',
  'createdbyidentity',
  'contextauthority',
  'authorizationscope',
  'commandscope',
])
const MAX_TRAVERSAL_DEPTH = 16
const MAX_TRAVERSAL_NODES = 2_048

function normalizedAuthorityKey(key: string) {
  return key.toLowerCase().replaceAll('_', '').replaceAll('-', '')
}

function isAllowedScopedIdentity(field: string, key: string) {
  return (
    field === 'envelope.idempotency' &&
    (key === 'tenantid' || key === 'branchid')
  )
}

function inspectCallerAuthority(
  value: unknown,
  field: string,
  depth: number,
  state: { nodes: number; ancestors: Set<object> }
) {
  state.nodes += 1
  if (
    depth > MAX_TRAVERSAL_DEPTH ||
    state.nodes > MAX_TRAVERSAL_NODES
  ) {
    throw new CoreV2ContractValidationError(
      'COMMAND_ENVELOPE_TRAVERSAL_LIMIT',
      field,
      'Command envelope exceeds traversal limits'
    )
  }
  if (typeof value !== 'object' || value === null) return
  if (state.ancestors.has(value)) {
    throw new CoreV2ContractValidationError(
      'CYCLIC_COMMAND_ENVELOPE',
      field,
      'Cyclic command-envelope values are forbidden'
    )
  }
  state.ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      let descriptors: Record<string, PropertyDescriptor>
      try {
        if (
          Object.getPrototypeOf(value) !== Array.prototype ||
          Object.getOwnPropertySymbols(value).length > 0
        )
          throw new Error('unsafe array')
        descriptors = Object.getOwnPropertyDescriptors(value)
      } catch {
        throw new CoreV2ContractValidationError(
          'UNSAFE_COMMAND_ENVELOPE_ARRAY',
          field,
          'Command-envelope arrays must be standard data arrays'
        )
      }
      const unexpected = Object.keys(descriptors).filter(
        (key) => key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key)
      )
      const lengthDescriptor = descriptors.length
      if (
        !lengthDescriptor ||
        !('value' in lengthDescriptor) ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0
      )
        throw new CoreV2ContractValidationError(
          'UNSAFE_COMMAND_ENVELOPE_ARRAY',
          field,
          'Command-envelope array length is invalid'
        )
      if (unexpected.length > 0)
        throw new CoreV2ContractValidationError(
          'UNSAFE_COMMAND_ENVELOPE_ARRAY',
          field,
          'Command-envelope arrays cannot contain named properties'
        )
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = descriptors[String(index)]
        if (
          !descriptor ||
          !('value' in descriptor) ||
          descriptor.get ||
          descriptor.set
        )
          throw new CoreV2ContractValidationError(
            'ACCESSOR_PROPERTY_FORBIDDEN',
            `${field}.${index}`,
            'Sparse or accessor array entries are forbidden'
          )
        inspectCallerAuthority(
          descriptor.value,
          `${field}.${index}`,
          depth + 1,
          state
        )
      }
      return
    }
    const record = readPlainDataRecord(value, field)
    for (const [key, child] of Object.entries(record)) {
      if (field === 'envelope' && key === 'authorization') continue
      const normalized = normalizedAuthorityKey(key)
      if (
        FORBIDDEN_CALLER_AUTHORITY_KEYS.has(normalized) &&
        !isAllowedScopedIdentity(field, normalized)
      ) {
        throw new CoreV2ContractValidationError(
          'CALLER_AUTHORITY_FORBIDDEN',
          `${field}.${key}`,
          'Caller-controlled authorization facts are forbidden'
        )
      }
      inspectCallerAuthority(
        child,
        `${field}.${key}`,
        depth + 1,
        state
      )
    }
  } finally {
    state.ancestors.delete(value)
  }
}

export function validateCommandEnvelope(
  value: unknown
): asserts value is CommandEnvelope {
  inspectCallerAuthority(value, 'envelope', 0, {
    nodes: 0,
    ancestors: new Set(),
  })
  const envelope = readPlainDataRecord(value, 'envelope', ENVELOPE_KEYS)
  if (!hasDatabaseAuthorityProvenance(envelope.authorization)) {
    throw new CoreV2ContractValidationError(
      'DATABASE_AUTHORITY_PROVENANCE_REQUIRED',
      'authorization',
      'authorization lacks trusted database provenance'
    )
  }
  const authorization = readPlainDataRecord(
    envelope.authorization,
    'authorization',
    [
      'contextId',
      'authenticatedActorId',
      'tenantId',
      'branchId',
      'roleSnapshot',
      'capabilityVersion',
      'employeeSource',
      'employeeSourceId',
      'commandType',
      'issuedAt',
      'expiresAt',
    ]
  )
  validateUuidIdentity(authorization.contextId, 'authorization.contextId')
  validateUuidIdentity(
    authorization.authenticatedActorId,
    'authorization.authenticatedActorId'
  )
  validateUuidIdentity(authorization.tenantId, 'authorization.tenantId')
  validateUuidIdentity(authorization.branchId, 'authorization.branchId')
  if (
    !['admin', 'manager', 'employee', 'cashier'].includes(
      String(authorization.roleSnapshot)
    ) ||
    typeof authorization.capabilityVersion !== 'bigint' ||
    !['profile', 'none'].includes(String(authorization.employeeSource)) ||
    (authorization.employeeSourceId !== null &&
      typeof authorization.employeeSourceId !== 'string') ||
    authorization.commandType !== 'order.create' ||
    typeof authorization.issuedAt !== 'string' ||
    typeof authorization.expiresAt !== 'string'
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_AUTHORIZATION_CONTEXT',
      'authorization',
      'database-authoritative authorization context is invalid'
    )
  }
  asCorrelationId(envelope.correlationId)
  validateCommandType(envelope.commandType)

  const identity = readPlainDataRecord(
    envelope.identity,
    'identity',
    ['commandId', 'ledgerId']
  )
  validateUuidIdentity(identity.commandId, 'identity.commandId')
  validateUuidIdentity(identity.ledgerId, 'identity.ledgerId')

  const idempotency = readPlainDataRecord(
    envelope.idempotency,
    'idempotency',
    ['tenantId', 'branchId', 'commandType', 'key'],
  )
  validateUuidIdentity(idempotency.tenantId, 'idempotency.tenantId')
  validateUuidIdentity(idempotency.branchId, 'idempotency.branchId')
  validateCommandType(idempotency.commandType)
  validateIdempotencyKey(idempotency.key)

  const payload = readPlainDataRecord(
    envelope.payload,
    'payload',
    ['version', 'canonicalBytes', 'fingerprint'],
  )
  const fingerprint = readPlainDataRecord(
    payload.fingerprint,
    'payload.fingerprint',
    ['version', 'canonicalProjection', 'fingerprint']
  )
  if (
    payload.version !== 'order-command-payload-v1'
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_COMMAND_PAYLOAD',
      'payload',
      'payload contract is invalid'
    )
  }
  if (
    fingerprint.version !== 'order-request-fingerprint-v1' ||
    typeof fingerprint.canonicalProjection !== 'string'
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_FINGERPRINT',
      'payload.fingerprint',
      'fingerprint contract is invalid'
    )
  }
  validateCanonicalPayloadText(payload.canonicalBytes)
  validateFingerprintProjectionText(
    fingerprint.canonicalProjection
  )
  validateRequestFingerprint(fingerprint.fingerprint)
  const diagnostics = readPlainDataRecord(
    envelope.diagnostics,
    'diagnostics',
    ['requestReference', 'source'],
  )
  if (
    (diagnostics.requestReference !== null &&
      typeof diagnostics.requestReference !== 'string') ||
    !['pos', 'admin', 'api'].includes(String(diagnostics.source))
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_DIAGNOSTICS',
      'diagnostics',
      'diagnostics contract is invalid'
    )
  }
}
