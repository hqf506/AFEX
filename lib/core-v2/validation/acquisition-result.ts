import 'server-only'

import type { P2D20RawAcquisitionRow } from '../contracts/authorization'
import { CoreV2ContractValidationError } from './errors'
import { normalizePlainJsonObject } from './json-value'
import { readPlainDataRecord } from './object-shape'

const KEYS = [
  'acquisition_result',
  'authorization_context_id',
  'atomic_command_id',
  'correlation_reference',
  'command_status',
  'response_version',
  'response_snapshot',
  'completed_at',
  'error_code',
  'error_detail',
  'last_failure_stage',
  'stored_request_fingerprint',
] as const
const STATUSES = [
  'reserved',
  'processing',
  'succeeded',
  'failed_retryable',
  'failed_final',
]

const isText = (value: unknown) => typeof value === 'string' && value.length > 0
const allNull = (record: Record<string, unknown>, keys: readonly string[]) =>
  keys.every((key) => record[key] === null)

export function validateP2D20RawAcquisitionRow(
  value: unknown
): P2D20RawAcquisitionRow {
  const row = readPlainDataRecord(value, 'acquisitionResult', KEYS)
  if (
    !['created', 'replay', 'in_progress', 'fingerprint_conflict'].includes(
      String(row.acquisition_result)
    ) ||
    !isText(row.atomic_command_id) ||
    !isText(row.correlation_reference) ||
    !STATUSES.includes(String(row.command_status)) ||
    row.stored_request_fingerprint === null ||
    row.stored_request_fingerprint === undefined
  ) {
    throw new CoreV2ContractValidationError(
      'INVALID_ACQUISITION_RESULT',
      'acquisitionResult',
      'P2D.20 result contains invalid common fields'
    )
  }
  const terminalFields = [
    'response_version',
    'response_snapshot',
    'completed_at',
    'error_code',
    'error_detail',
    'last_failure_stage',
  ]
  switch (row.acquisition_result) {
    case 'created':
      if (
        !isText(row.authorization_context_id) ||
        row.command_status !== 'reserved' ||
        !allNull(row, terminalFields)
      )
        break
      return Object.freeze(row) as P2D20RawAcquisitionRow
    case 'in_progress':
      if (
        !isText(row.authorization_context_id) ||
        !['reserved', 'processing', 'failed_retryable'].includes(
          String(row.command_status)
        ) ||
        !allNull(row, terminalFields)
      )
        break
      return Object.freeze(row) as P2D20RawAcquisitionRow
    case 'fingerprint_conflict':
      if (
        row.authorization_context_id !== null ||
        !allNull(row, terminalFields)
      )
        break
      return Object.freeze(row) as P2D20RawAcquisitionRow
    case 'replay':
      if (!isText(row.authorization_context_id)) break
      if (
        row.command_status === 'succeeded' &&
        isText(row.response_version) &&
        isText(row.completed_at) &&
        allNull(row, ['error_code', 'error_detail', 'last_failure_stage'])
      ) {
        const responseSnapshot = normalizePlainJsonObject(
          row.response_snapshot,
          'acquisitionResult.response_snapshot'
        )
        return Object.freeze({
          ...row,
          response_snapshot: responseSnapshot,
        }) as P2D20RawAcquisitionRow
      }
      if (
        row.command_status === 'failed_final' &&
        allNull(row, ['response_version', 'response_snapshot', 'completed_at']) &&
        isText(row.error_code) &&
        isText(row.last_failure_stage) &&
        (row.error_detail === null || typeof row.error_detail === 'string')
      )
        return Object.freeze(row) as P2D20RawAcquisitionRow
  }
  throw new CoreV2ContractValidationError(
    'DISPOSITION_FIELD_CONFLICT',
    'acquisitionResult',
    'P2D.20 disposition fields are inconsistent'
  )
}
