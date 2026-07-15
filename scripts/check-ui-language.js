/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const sidebar = read('components/admin-shell-layout.tsx')
const customerStep = read('components/invoice-customer-step.tsx')
const thermalSettings = read('app/admin/settings/invoices/thermal/page.tsx')
const roles = read('lib/app-roles.ts')
const orders = read('app/admin/orders/page.tsx')
const movements = read('app/admin/inventory/movements/page.tsx')
const audit = read('app/admin/audit-logs/page.tsx')
const catalog = read('app/admin/catalog/page.tsx')

for (const marker of ['>MAIN<', '>ACTIONS<', 'AFEX AUDIT']) {
  assert.ok(!sidebar.includes(marker), `visible navigation marker remains: ${marker}`)
}

for (const marker of ['>CUSTOMER<', 'AFEX CUSTOMER']) {
  assert.ok(!customerStep.includes(marker), `visible customer marker remains: ${marker}`)
}

for (const marker of ['>Thermal<', '>Live<']) {
  assert.ok(!thermalSettings.includes(marker), `visible invoice badge remains: ${marker}`)
}

for (const label of ["admin: 'مدير النظام'", "manager: 'مدير'", "employee: 'موظف'", "cashier: 'أمين الصندوق'"]) {
  assert.ok(roles.includes(label), `approved role label is missing: ${label}`)
}
assert.ok(!roles.includes("'أدمن'") && !roles.includes("'كاشير'"), 'raw role label remains visible')

for (const label of ['قيد التجهيز', 'جاهز', 'تم التسليم', 'ملغي']) {
  assert.ok(orders.includes(label), `Arabic order status is missing: ${label}`)
}

const visibleOrderSection = orders.slice(orders.indexOf('return ('), orders.length)
for (const rawStatus of ['>pending<', '>completed<', '>cancelled<', '>preparing<', '>ready<']) {
  assert.ok(!visibleOrderSection.includes(rawStatus), `raw order status is visible: ${rawStatus}`)
}

for (const note of [
  'pos sale stock deduction', 'manual stock increase', 'manual stock decrease',
  'stock received', 'transfer in', 'transfer out', 'order cancelled stock restore',
]) {
  assert.ok(movements.includes(`'${note}':`), `inventory note translation is missing: ${note}`)
}
assert.ok(movements.includes("'حركة مخزون'"), 'unknown movement types need a business fallback')

assert.ok(audit.includes("return EVENT_LABELS[action] || 'عملية داخل النظام'"), 'audit fallback is not business-safe')
assert.ok(audit.includes('placeholder="مثال: تم إنشاء طلب جديد"'), 'audit search example is not business-friendly')
assert.ok(!audit.includes('placeholder="user.created"'), 'developer audit search example remains')

assert.ok(
  catalog.includes('هل تريد حذف العناصر المحددة؟ لن تظهر هذه العناصر في الكتالوج بعد الحذف.'),
  'catalog deletion confirmation is missing'
)
assert.ok(!catalog.includes('?? ???? ???'), 'corrupted catalog confirmation remains')

console.log('Arabic UI terminology checks passed.')
