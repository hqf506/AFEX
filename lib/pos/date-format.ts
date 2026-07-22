const POS_GREGORIAN_LOCALE = 'ar-SA-u-ca-gregory-nu-latn'

type PosDateValue = Date | string | number | null | undefined

function toValidDate(value: PosDateValue) {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatPosGregorianDate(value: PosDateValue) {
  const date = toValidDate(value)
  if (!date) return '—'

  const parts = new Intl.DateTimeFormat(POS_GREGORIAN_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${values.day}/${values.month}/${values.year}`
}

export function formatPosTime(value: PosDateValue) {
  const date = toValidDate(value)
  if (!date) return '—'

  return new Intl.DateTimeFormat(POS_GREGORIAN_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatPosGregorianDateTime(value: PosDateValue) {
  const date = toValidDate(value)
  if (!date) return '—'
  return `${formatPosGregorianDate(date)} ${formatPosTime(date)}`
}

export function formatPosWeekday(value: PosDateValue) {
  const date = toValidDate(value)
  if (!date) return '—'

  return new Intl.DateTimeFormat(POS_GREGORIAN_LOCALE, {
    weekday: 'long',
  }).format(date)
}
