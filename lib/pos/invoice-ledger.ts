export const POS_BUSINESS_TIME_ZONE = 'Asia/Riyadh'
const POS_DATE_LOCALE = 'ar-SA-u-ca-gregory-nu-latn'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export function normalizeInvoiceLedgerSearch(value: string) {
  return value.trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ar')
}

export function getRiyadhDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'invalid'
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: POS_BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function formatRiyadhTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(POS_DATE_LOCALE, { timeZone: POS_BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
}

export function formatRiyadhDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(POS_DATE_LOCALE, { timeZone: POS_BUSINESS_TIME_ZONE, day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
}

export function formatInvoiceDateGroupLabel(value: string, now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'تاريخ غير متاح'
  const key = getRiyadhDateKey(date)
  const today = getRiyadhDateKey(now)
  const yesterday = getRiyadhDateKey(new Date(now.getTime() - 86_400_000))
  const dateLabel = new Intl.DateTimeFormat(POS_DATE_LOCALE, { timeZone: POS_BUSINESS_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  if (key === today) return `اليوم — ${dateLabel}`
  if (key === yesterday) return `أمس — ${dateLabel}`
  return dateLabel
}

export function groupInvoicesByRiyadhDate<T extends { created_at: string }>(invoices: T[], now = new Date()) {
  const groups: Array<{ key: string; label: string; invoices: T[] }> = []
  for (const invoice of invoices) {
    const key = getRiyadhDateKey(invoice.created_at)
    const current = groups.at(-1)
    if (current?.key === key) current.invoices.push(invoice)
    else groups.push({ key, label: formatInvoiceDateGroupLabel(invoice.created_at, now), invoices: [invoice] })
  }
  return groups
}
