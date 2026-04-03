export function getTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function hasTrimmedString(value: unknown) {
  return getTrimmedString(value).length > 0
}

export function isBooleanValue(value: unknown): value is boolean {
  return typeof value === 'boolean'
}
