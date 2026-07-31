import 'server-only'

import type { UntrustedJsonValue } from '../contracts/outbox'
import { CoreV2ContractValidationError } from './errors'
import { readPlainDataRecord } from './object-shape'
import { hasOnlyUnicodeScalarValues } from './unicode'

const MAX_DEPTH = 32
const MAX_NODES = 10_000

function normalize(
  value: unknown,
  field: string,
  depth: number,
  state: { nodes: number; ancestors: Set<object> }
): UntrustedJsonValue {
  state.nodes += 1
  if (state.nodes > MAX_NODES || depth > MAX_DEPTH) {
    throw new CoreV2ContractValidationError(
      'JSON_LIMIT_EXCEEDED',
      field,
      'JSON value exceeds its validation limits'
    )
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value
  if (typeof value === 'string') {
    if (!hasOnlyUnicodeScalarValues(value))
      throw new CoreV2ContractValidationError(
        'INVALID_UNICODE_SCALAR',
        field,
        'JSON strings must contain valid Unicode scalar values'
      )
    return value
  }
  if (typeof value !== 'object') {
    throw new CoreV2ContractValidationError(
      'INVALID_JSON_VALUE',
      field,
      'Value is not JSON-compatible'
    )
  }
  if (state.ancestors.has(value)) {
    throw new CoreV2ContractValidationError(
      'CYCLIC_JSON_VALUE',
      field,
      'Cyclic JSON values are forbidden'
    )
  }
  state.ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        Object.getOwnPropertySymbols(value).length > 0
      )
        throw new CoreV2ContractValidationError(
          'INVALID_JSON_ARRAY',
          field,
          'JSON arrays must use the standard Array prototype'
        )
      const descriptors = Object.getOwnPropertyDescriptors(
        value
      ) as unknown as Record<string, PropertyDescriptor>
      const unexpected = Object.keys(descriptors).filter(
        (key) => key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key)
      )
      const lengthDescriptor = descriptors.length
      const arrayLength = lengthDescriptor?.value
      if (
        !lengthDescriptor ||
        !('value' in lengthDescriptor) ||
        typeof arrayLength !== 'number' ||
        !Number.isSafeInteger(arrayLength) ||
        arrayLength < 0
      )
        throw new CoreV2ContractValidationError(
          'INVALID_JSON_ARRAY',
          field,
          'JSON array length is invalid'
        )
      if (unexpected.length > 0)
        throw new CoreV2ContractValidationError(
          'INVALID_JSON_ARRAY',
          field,
          'JSON arrays cannot contain named properties'
        )
      const result: UntrustedJsonValue[] = []
      for (let index = 0; index < arrayLength; index += 1) {
        const descriptor = descriptors[String(index)]
        if (
          !descriptor ||
          !('value' in descriptor) ||
          descriptor.get ||
          descriptor.set
        )
          throw new CoreV2ContractValidationError(
            'INVALID_JSON_ARRAY',
            `${field}.${index}`,
            'Sparse or accessor array entries are forbidden'
          )
        result.push(
          normalize(
            descriptor.value,
            `${field}.${index}`,
            depth + 1,
            state
          )
        )
      }
      return Object.freeze(result)
    }
    const record = readPlainDataRecord(value, field)
    const result: Record<string, UntrustedJsonValue> = Object.create(null)
    for (const [key, entry] of Object.entries(record))
      Object.defineProperty(result, key, {
        value: normalize(entry, `${field}.${key}`, depth + 1, state),
        enumerable: true,
        writable: false,
        configurable: false,
      })
    Object.setPrototypeOf(result, Object.prototype)
    return Object.freeze(result)
  } finally {
    state.ancestors.delete(value)
  }
}

export function normalizePlainJsonObject(
  value: unknown,
  field: string
): Readonly<Record<string, UntrustedJsonValue>> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new CoreV2ContractValidationError(
      'JSON_OBJECT_REQUIRED',
      field,
      'A plain JSON object is required'
    )
  }
  return normalize(value, field, 0, {
    nodes: 0,
    ancestors: new Set(),
  }) as Readonly<Record<string, UntrustedJsonValue>>
}
