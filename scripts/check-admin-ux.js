/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const messages = read('lib/admin-ux-messages.ts')
const orders = read('app/admin/orders/page.tsx')
const receipts = read('app/admin/receipts/page.tsx')
const inventory = read('app/admin/inventory/page.tsx')
const branches = read('app/admin/branches/page.tsx')
const users = read('app/admin/users/page.tsx')
const customers = read('app/admin/customers/page.tsx')
const categories = read('app/admin/categories/page.tsx')
const reports = [
  'app/admin/reports/page.tsx',
  'app/admin/reports/sales-by-category/page.tsx',
  'app/admin/reports/sales-by-customer/page.tsx',
  'app/admin/reports/sales-by-item/page.tsx',
  'app/admin/reports/sales-trend/page.tsx',
].map(read)

for (const key of [
  'saveFailure', 'deleteFailure', 'orderStatusSuccess', 'orderStatusFailure',
  'receiptCancelSuccess', 'receiptCancelFailure', 'inventorySuccess',
  'inventoryFailure', 'lowStockSuccess', 'lowStockFailure', 'settingsSuccess',
  'reportFailure', 'reportEmpty', 'exportPreparing', 'exportFailure',
  'staleRefreshFailure', 'noPermission',
]) {
  assert.match(messages, new RegExp(`\\b${key}:`), `missing Admin UX message: ${key}`)
}

assert.ok(orders.includes('ADMIN_UX_MESSAGES.orderStatusFailure'), 'order status failure does not preserve-state wording')
assert.ok(receipts.includes('ADMIN_UX_MESSAGES.receiptCancelFailure'), 'receipt cancellation outcome is ambiguous')
assert.ok(inventory.includes('ADMIN_UX_MESSAGES.inventoryFailure'), 'inventory failure does not say quantity was unchanged')
assert.ok(branches.includes('هل تريد تعطيل هذا الفرع؟'), 'branch disable confirmation is missing')
assert.ok(users.includes('لا يمكن التراجع عن هذه العملية'), 'permanent user deletion is not explicit')
assert.ok(categories.includes('لا يمكن التراجع عن هذه العملية'), 'category deletion is not explicit')
assert.ok(!customers.includes("currency: 'SAR'"), 'customer money UI still depends on an English currency code')

for (const report of reports) {
  assert.ok(!report.includes("toLocaleTimeString('en-GB')"), 'report time remains in an English locale')
}

for (const source of [orders, receipts, inventory, branches, users, categories, ...reports]) {
  assert.ok(!source.includes('جاري '), 'incorrect Arabic loading grammar remains')
}

assert.ok(messages.includes('لم يتم تحديث البيانات'), 'save failure does not state data was unchanged')
assert.ok(messages.includes('آخر نسخة محملة'), 'stale background refresh wording is missing')
assert.ok(messages.includes('لا تملك صلاحية'), 'Arabic permission wording is missing')

console.log('Admin UX message and state contract checks passed.')
