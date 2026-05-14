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

export function isSendableWhatsAppPhone(phone: string) {
  const digitsOnly = phone.replace(/\D/g, '')
  return digitsOnly.length >= 10
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
