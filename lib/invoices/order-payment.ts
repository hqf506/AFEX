export type OrderPaymentMethod =
  | 'cash'
  | 'card'
  | 'transfer'
  | 'mada'
  | 'visa'
  | 'cod'
  | 'on_delivery'

export type PersistedInvoicePaymentMethod = Exclude<
  OrderPaymentMethod,
  'cod'
>

export type PersistedInvoicePaymentSnapshot = {
  paymentMethod: PersistedInvoicePaymentMethod
  cashReceived: number
  remainingFromCustomer: number
  cashChange: number
}

const ORDER_PAYMENT_METHODS = new Set<OrderPaymentMethod>([
  'cash',
  'card',
  'transfer',
  'mada',
  'visa',
  'cod',
  'on_delivery',
])

export function normalizeOrderPaymentMethod(
  value: unknown
): OrderPaymentMethod | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase() as OrderPaymentMethod
  return ORDER_PAYMENT_METHODS.has(normalized) ? normalized : null
}

export function getPersistedInvoicePaymentMethod(
  paymentMethod: OrderPaymentMethod
): PersistedInvoicePaymentMethod {
  return paymentMethod === 'cod' ? 'on_delivery' : paymentMethod
}

export function buildPersistedInvoicePaymentSnapshot({
  paymentMethod,
  invoiceTotal,
  cashReceived,
}: {
  paymentMethod: OrderPaymentMethod
  invoiceTotal: number
  cashReceived: number
}): PersistedInvoicePaymentSnapshot {
  const total = roundCurrency(Math.max(invoiceTotal, 0))
  const normalizedReceived = roundCurrency(Math.max(cashReceived, 0))
  const persistedPaymentMethod = getPersistedInvoicePaymentMethod(paymentMethod)
  const isCard =
    paymentMethod === 'mada' ||
    paymentMethod === 'visa' ||
    paymentMethod === 'card'
  const persistedCashReceived = isCard
    ? total
    : persistedPaymentMethod === 'on_delivery'
      ? Math.min(normalizedReceived, total)
      : paymentMethod === 'transfer'
        ? 0
        : normalizedReceived
  const persistedRemaining =
    persistedPaymentMethod === 'on_delivery' || paymentMethod === 'cash'
      ? roundCurrency(Math.max(total - persistedCashReceived, 0))
      : paymentMethod === 'transfer'
        ? total
        : 0
  const persistedCashChange =
    paymentMethod === 'cash'
      ? roundCurrency(Math.max(persistedCashReceived - total, 0))
      : 0

  return {
    paymentMethod: persistedPaymentMethod,
    cashReceived: persistedCashReceived,
    remainingFromCustomer: persistedRemaining,
    cashChange: persistedCashChange,
  }
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
