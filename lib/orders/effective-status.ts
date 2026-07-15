export type EffectiveOrderStatus =
  | 'in_progress'
  | 'ready'
  | 'delivered'
  | 'cancelled'
  | 'unknown'

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled'])
const DELIVERED_STATUSES = new Set(['closed', 'delivered', 'completed'])

function normalizeStatus(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function resolveEffectiveOrderStatus(
  orderStatus: unknown,
  paymentStatus: unknown
): EffectiveOrderStatus {
  const normalizedOrderStatus = normalizeStatus(orderStatus)
  const normalizedPaymentStatus = normalizeStatus(paymentStatus)

  if (
    CANCELLED_STATUSES.has(normalizedOrderStatus) ||
    CANCELLED_STATUSES.has(normalizedPaymentStatus)
  ) {
    return 'cancelled'
  }

  if (normalizedOrderStatus === 'in_progress') return 'in_progress'
  if (normalizedOrderStatus === 'ready') return 'ready'
  if (DELIVERED_STATUSES.has(normalizedOrderStatus)) return 'delivered'
  return 'unknown'
}
