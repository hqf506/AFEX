export type DigitalInvoicePaymentMethod =
  | 'cash'
  | 'card'
  | 'transfer'
  | 'mada'
  | 'visa'
  | 'cod'

function getKnownDigitalInvoicePaymentMethod(
  value?: string
): DigitalInvoicePaymentMethod | null {
  const raw = String(value || '').trim()
  const normalized = raw.toLowerCase()

  if (
    normalized === 'cash' ||
    raw === 'نقدي' ||
    raw === 'كاش' ||
    normalized.includes('نقد')
  ) {
    return 'cash'
  }

  if (normalized === 'visa' || raw === 'فيزا') return 'visa'
  if (normalized === 'mada' || raw === 'مدى') return 'mada'

  if (
    normalized === 'cod' ||
    normalized === 'on delivery' ||
    normalized === 'cash on delivery' ||
    raw === 'عند الاستلام' ||
    raw === 'الدفع عند الاستلام'
  ) {
    return 'cod'
  }

  if (
    normalized === 'card' ||
    raw === 'بطاقة' ||
    raw === 'شبكة' ||
    normalized.includes('master')
  ) {
    return 'card'
  }

  if (
    normalized === 'transfer' ||
    raw === 'تحويل' ||
    normalized.includes('bank')
  ) {
    return 'transfer'
  }

  return null
}

export function normalizeDigitalInvoicePaymentMethod(
  value?: string
): DigitalInvoicePaymentMethod {
  return getKnownDigitalInvoicePaymentMethod(value) || 'cash'
}

export function getDigitalInvoicePaymentMethodLabel(value?: string): string {
  const raw = String(value || '').trim()
  const paymentMethod = getKnownDigitalInvoicePaymentMethod(raw)

  if (paymentMethod === 'cash') return 'نقدي'
  if (paymentMethod === 'mada') return 'مدى'
  if (paymentMethod === 'visa') return 'فيزا'
  if (paymentMethod === 'cod') return 'الدفع عند الاستلام'
  if (paymentMethod === 'card') return 'بطاقة'
  if (paymentMethod === 'transfer') return 'تحويل'

  return raw
}

export function normalizeDigitalInvoiceNote(value?: string): string {
  const note = String(value || '').trim()
  return note === '-' || note === '—' ? '' : note
}
