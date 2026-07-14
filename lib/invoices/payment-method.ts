export type PosPaymentMethod = 'mada' | 'cash' | 'visa' | 'cod'

export const PAYMENT_METHODS: Array<{
  id: PosPaymentMethod
  label: string
}> = [
  { id: 'mada', label: 'مدى' },
  { id: 'cash', label: 'نقدي' },
  { id: 'visa', label: 'فيزا' },
  { id: 'cod', label: 'عند الاستلام' },
]

export function normalizeUiPaymentMethod(method?: string): PosPaymentMethod {
  const value = String(method || '')
    .trim()
    .toLowerCase()

  if (value === 'cash') return 'cash'
  if (value === 'visa') return 'visa'
  if (value === 'cod') return 'cod'
  if (value === 'card' || value === 'mada') return 'mada'

  return 'mada'
}

export function getPaymentMethodLabel(method?: string) {
  const normalizedMethod = normalizeUiPaymentMethod(method)

  return (
    PAYMENT_METHODS.find((paymentMethod) => paymentMethod.id === normalizedMethod)
      ?.label ?? 'مدى'
  )
}

export function isReceivedAmountEditable(method?: string) {
  const normalizedMethod = normalizeUiPaymentMethod(method)
  return normalizedMethod === 'cash' || normalizedMethod === 'cod'
}

export function toApiPaymentMethod(
  method: PosPaymentMethod
): 'cash' | 'card' {
  const normalizedMethod = normalizeUiPaymentMethod(method)

  if (normalizedMethod === 'mada' || normalizedMethod === 'visa') {
    return 'card'
  }

  return 'cash'
}
