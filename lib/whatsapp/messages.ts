import { normalizeSaudiCustomerPhone } from '@/lib/customers'

type ReadyOrderStatusMessageInput = {
  customerName: string
  orderNumber: string
  storeName?: string
  branchName: string
  mapUrl: string
}

type DeliveredOrderStatusMessageInput = {
  customerName: string
  orderNumber: string
  storeName?: string
  branchName: string
}

type OrderStatusWhatsAppTemplateInput = {
  template: string | null | undefined
  orderNumber: string
  customerName: string
  branchName: string
  storeName: string
  total: number
  mapUrl: string
}

export function isSendableWhatsAppPhone(phone: string) {
  return normalizeSaudiCustomerPhone(phone) !== null
}

export function normalizeWhatsAppDestination(phone: string | null) {
  const normalized = normalizeSaudiCustomerPhone(phone)
  return normalized ? `+${normalized}` : null
}

export function applyOrderStatusWhatsAppTemplate(
  input: OrderStatusWhatsAppTemplateInput
) {
  const trimmedTemplate = input.template?.trim() || ''

  if (!trimmedTemplate) {
    return ''
  }

  const values: Record<string, string> = {
    store_name: input.storeName,
    storeName: input.storeName,
    branch_name: input.branchName,
    branchName: input.branchName,
    customer_name: input.customerName,
    customerName: input.customerName,
    order_number: input.orderNumber,
    orderNumber: input.orderNumber,
    total: String(input.total),
    map_url: input.mapUrl,
    mapUrl: input.mapUrl,
  }

  return trimmedTemplate.replace(
    /\{\{\s*(store_name|storeName|branch_name|branchName|customer_name|customerName|order_number|orderNumber|total|map_url|mapUrl)\s*\}\}|\{\s*(store_name|storeName|branch_name|branchName|customer_name|customerName|order_number|orderNumber|total|map_url|mapUrl)\s*\}/g,
    (_match, doubleBraceKey: string | undefined, singleBraceKey: string | undefined) =>
      values[doubleBraceKey || singleBraceKey || ''] || ''
  )
}

export function buildReadyOrderStatusWhatsAppMessage(
  input: ReadyOrderStatusMessageInput
) {
  const storeName = input.storeName?.trim()

  return [
    '\u200F━━━━━━━━━━━━━━━',
    ...(storeName ? [`المحل: ${storeName}`] : []),
    `الفرع: ${input.branchName}`,
    '',
    `طلبك ، ${input.customerName}`,
    '',
    'جاهز للاستلام ✅',
    '',
    `رقم الفاتورة: ‎${input.orderNumber}`,
    'الموقع 📍:',
    'اضغط هنا 👇',
    input.mapUrl,
    '',
    '━━━━━━━━━━━━━━━',
    'ننتظرك تنورنا 🌹',
  ].join('\n')
}

export function buildDeliveredOrderStatusWhatsAppMessage(
  input: DeliveredOrderStatusMessageInput
) {
  const storeName = input.storeName?.trim()

  return [
    '\u200F━━━━━━━━━━━━━━━',
    ...(storeName ? [`المحل: ${storeName}`] : []),
    `الفرع: ${input.branchName}`,
    '',
    `تم تسليم طلبك ، ${input.customerName} ✅`,
    '',
    `رقم الفاتورة: ‎${input.orderNumber}`,
    '━━━━━━━━━━━━━━━',
    'شكراً لزيارتك ونتمنى رؤيتكم قريباً 🌹',
  ].join('\n')
}
