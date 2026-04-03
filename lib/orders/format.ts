import type { PaymentMethodKey } from '@/lib/orders/normalize'

export function formatCurrency(value: number) {
  return `${value.toFixed(2)} ر.س`
}

export function formatDateTime(value: string, locale = 'ar-SA') {
  if (!value || value === '—') return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString(locale)
}

export function formatPaymentMethod(
  value: PaymentMethodKey,
  fallback = 'غير محدد'
) {
  if (value === 'cash') return 'كاش'
  if (value === 'card') return 'شبكة'
  if (value === 'transfer') return 'تحويل'
  return fallback
}

export function getDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}
