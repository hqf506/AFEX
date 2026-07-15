/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const messages = read('lib/invoice-ux-messages.ts')
const orders = read('app/admin/orders/page.tsx')
const receipts = read('app/admin/receipts/page.tsx')
const thermalPreview = read('app/thermal-invoice-preview/page.tsx')
const digitalTemplate = read('lib/invoices/receipt-template.ts')
const thermalTemplate = read('lib/invoices/thermal-template.ts')
const paymentMethods = read('lib/invoices/payment-method.ts')

for (const key of [
  'pdfFailureAfterSavedOrder', 'previewFailure', 'thermalPreviewLoading',
  'printPreparing', 'printDialogOpened', 'printPreparationFailure',
  'whatsappSuccess', 'whatsappFailure', 'whatsappTimeout', 'missingPhone',
  'providerDisabled', 'missingPdf', 'logoFailure',
]) {
  assert.match(messages, new RegExp(`\\b${key}:`), `missing invoice UX message: ${key}`)
}

assert.ok(!orders.includes("throw new Error(pdfResult?.error"), 'raw PDF response reaches invoice UI')
assert.ok(!orders.includes("throw new Error(whatsappResult?.error"), 'raw provider response reaches invoice UI')
assert.ok(orders.includes('INVOICE_UX_MESSAGES.whatsappTimeout'), 'WhatsApp timeout guidance is not used')
assert.ok(orders.includes("sendStage: 'pdf' | 'whatsapp'"), 'PDF and WhatsApp outcomes are not separated')
assert.ok(receipts.includes('INVOICE_UX_MESSAGES.printDialogOpened'), 'receipt print-dialog wording is missing')
assert.ok(!messages.includes('تمت الطباعة بنجاح'), 'print dialog falsely claims completed printing')
assert.ok(thermalPreview.includes('INVOICE_UX_MESSAGES.thermalPreviewLoading'), 'thermal preview loading is not standardized')

assert.ok(digitalTemplate.includes('globalNote'), 'fixed digital note is missing')
assert.ok(digitalTemplate.includes('payload.note'), 'customer digital note is missing')
assert.ok(thermalTemplate.includes('thermalNote'), 'fixed thermal note is missing')
assert.ok(thermalTemplate.includes('payload.note'), 'customer thermal note is missing')

for (const label of ['نقدي', 'مدى', 'فيزا', 'الدفع عند الاستلام']) {
  assert.ok(paymentMethods.includes(label), `Arabic payment label is missing: ${label}`)
}

for (const source of [messages, orders, receipts, thermalPreview]) {
  assert.ok(!/\b(?:Failed to generate PDF|Print failed|Sending WhatsApp|Loading preview)\b/.test(source), 'English invoice fallback reaches UI')
}

console.log('Invoice and communication UX contract checks passed.')
