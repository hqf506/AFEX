type ReadyOrderStatusMessageInput = {
  customerName: string
  orderNumber: string
  total: number
}

export function isSendableWhatsAppPhone(phone: string) {
  const digitsOnly = phone.replace(/\D/g, '')
  return digitsOnly.length >= 10
}

export function buildReadyOrderStatusWhatsAppMessage(
  input: ReadyOrderStatusMessageInput
) {
  return (
    `مرحباً ${input.customerName}\n` +
    `طلبك رقم ${input.orderNumber} أصبح جاهزاً للاستلام.\n` +
    `الإجمالي: ${input.total} ر.س\n` +
    'شكراً لتعاملك معنا.'
  )
}
