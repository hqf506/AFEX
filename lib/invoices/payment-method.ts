export type PosPaymentMethod =
  | 'mada'
  | 'cash'
  | 'visa'
  | 'cod'
  | 'card'
  | 'bank_transfer'
  | 'transfer'
  | 'on_delivery'

export const PAYMENT_METHODS: Array<{
  id: PosPaymentMethod
  label: string
}> = [
  { id: 'mada', label: 'مدى' },
  { id: 'cash', label: 'نقدي' },
  { id: 'visa', label: 'فيزا' },
  { id: 'cod', label: 'الدفع عند الاستلام' },
  { id: 'card', label: 'بطاقة' },
  { id: 'bank_transfer', label: 'تحويل بنكي' },
  { id: 'transfer', label: 'تحويل' },
  { id: 'on_delivery', label: 'عند الاستلام' },
]

export function normalizeUiPaymentMethod(method?: string): PosPaymentMethod {
  const value = String(method || '')
    .trim()
    .toLowerCase()

  if (value === 'cash') return 'cash'
  if (value === 'visa') return 'visa'
  if (value === 'cod') return 'cod'
  if (value === 'on_delivery') return 'on_delivery'
  if (value === 'card') return 'card'
  if (value === 'bank_transfer') return 'bank_transfer'
  if (value === 'transfer') return 'transfer'
  if (value === 'mada') return 'mada'

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
  return normalizedMethod === 'cash'
}

export function toApiPaymentMethod(
  method: PosPaymentMethod
): 'cash' | 'card' {
  const normalizedMethod = normalizeUiPaymentMethod(method)

  if (
    normalizedMethod === 'mada' ||
    normalizedMethod === 'visa' ||
    normalizedMethod === 'card' ||
    normalizedMethod === 'bank_transfer' ||
    normalizedMethod === 'transfer'
  ) {
    return 'card'
  }

  return 'cash'
}
