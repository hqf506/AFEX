/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const messages = read('lib/pos-ux-messages.ts')
const checkout = read('hooks/use-invoice-checkout.ts')
const drafts = read('app/pos/offline-drafts/page.tsx')
const pin = read('app/pos/employee-pin/page.tsx')
const paymentMethods = read('lib/invoices/payment-method.ts')

for (const contractKey of [
  'wrongPin',
  'duplicatePin',
  'pinRateLimit',
  'uncertainSubmission',
  'orderSuccess',
  'orderFailure',
  'duplicateSubmission',
  'draftSaved',
  'draftSaveFailure',
  'draftSyncSuccess',
  'draftSyncUncertain',
  'printFailure',
  'whatsappFailure',
]) {
  assert.match(messages, new RegExp(`\\b${contractKey}:`), `missing POS UX message: ${contractKey}`)
}

assert.ok(checkout.includes('POS_UX_MESSAGES.uncertainSubmission'), 'uncertain checkout outcome is not explicit')
assert.ok(checkout.includes('finally {\n      setLoading(false)'), 'checkout loading is not reset in finally')
assert.ok(!checkout.includes('createOrderResult?.error ||'), 'checkout consumes a raw API error')
assert.ok(drafts.includes('POS_UX_MESSAGES.draftSyncUncertain'), 'offline uncertain outcome is missing')
assert.ok(drafts.includes('window.confirm('), 'offline draft deletion confirmation is missing')
assert.ok(pin.includes('POS_UX_MESSAGES.networkFailure'), 'PIN network failure is not separated')

for (const label of ['نقدي', 'مدى', 'فيزا', 'الدفع عند الاستلام']) {
  assert.ok(paymentMethods.includes(label), `standard payment label is missing: ${label}`)
}

for (const file of [messages, checkout, drafts, pin, paymentMethods]) {
  assert.ok(!/\b(?:Loading|Submitting|Try again|Something went wrong)\b/.test(file), 'English POS fallback remains')
}

console.log('POS UX recovery contract checks passed.')
