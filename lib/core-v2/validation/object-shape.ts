import 'server-only'

import { CoreV2ContractValidationError } from './errors'

export function readPlainDataRecord(
  value: unknown,
  field: string,
  expectedKeys?: readonly string[]
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CoreV2ContractValidationError(
      'INVALID_PLAIN_RECORD',
      field,
      `${field} must be a plain object`
    )
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  let symbols: symbol[]
  try {
    prototype = Object.getPrototypeOf(value)
    descriptors = Object.getOwnPropertyDescriptors(value)
    symbols = Object.getOwnPropertySymbols(value)
  } catch {
    throw new CoreV2ContractValidationError(
      'UNSAFE_OBJECT_INSPECTION',
      field,
      `${field} could not be inspected safely`
    )
  }
  if (prototype !== Object.prototype || symbols.length > 0) {
    throw new CoreV2ContractValidationError(
      'UNSAFE_OBJECT_PROTOTYPE',
      field,
      `${field} must have the standard Object prototype and no symbol keys`
    )
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!('value' in descriptor) || descriptor.get || descriptor.set) {
      throw new CoreV2ContractValidationError(
        'ACCESSOR_PROPERTY_FORBIDDEN',
        `${field}.${key}`,
        'Accessor properties are forbidden'
      )
    }
  }
  const keys = Object.keys(descriptors).sort()
  if (expectedKeys) {
    const expected = [...expectedKeys].sort()
    if (
      keys.length !== expected.length ||
      keys.some((key, index) => key !== expected[index])
    ) {
      throw new CoreV2ContractValidationError(
        'INVALID_OBJECT_KEYS',
        field,
        `${field} contains missing or unknown fields`
      )
    }
  }
  return Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [
      key,
      descriptor.value,
    ])
  )
}
