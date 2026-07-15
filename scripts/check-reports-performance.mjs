import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

function assert(value, message) {
  if (!value) throw new Error(message)
}

const cache = new Map()
function load(relativePath) {
  const file = path.join(process.cwd(), `${relativePath}.ts`)
  if (cache.has(file)) return cache.get(file).exports
  const moduleValue = { exports: {} }
  cache.set(file, moduleValue)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(output, {
    exports: moduleValue.exports,
    module: moduleValue,
    require(specifier) {
      if (specifier.startsWith('@/')) return load(specifier.slice(2))
      throw new Error(`Unexpected dependency: ${specifier}`)
    },
    Array, Date, Intl, Map, Math, Number, Object, RegExp, Set, String,
  })
  return moduleValue.exports
}

const routePath = 'app/api/admin/reports/sales-performance/route.ts'
const route = fs.readFileSync(path.join(process.cwd(), routePath), 'utf8')
const reportPages = [
  'sales-by-item/page.tsx',
  'sales-by-category/page.tsx',
  'sales-trend/page.tsx',
  'sales-by-customer/page.tsx',
  'sales-by-employee/page.tsx',
].map((file) => fs.readFileSync(path.join(process.cwd(), 'app/admin/reports', file), 'utf8'))

assert(!route.includes("select('*')"), 'Reports API must not use select(*).')
assert(route.includes('applyTenantFilter(ordersQuery, tenantId)'), 'Tenant scope must remain.')
assert(route.includes('applyBranchFilter(ordersQuery, auth, branchId)'), 'Branch scope must remain.')
assert(route.includes('canViewReportRange(auth.profile.role, fromIso, toIso)'), '31-day employee limit must remain.')
assert(route.includes(".select('id, created_at, invoices(invoice_items(quantity, line_total))')"), 'Trend projection must remain minimal.')
assert(route.includes("type: true, itemRows:") || route.includes('itemRows: buildSalesByItemRows'), 'Item response contract must remain.')
assert(route.includes('categoryRows: buildSalesByCategoryRows'), 'Category response contract must remain.')
assert(route.includes('trendRows: buildSalesTrendRows'), 'Trend response contract must remain.')
for (const page of reportPages.slice(0, 3)) {
  assert(!page.includes(".from('orders')"), 'Detailed orders must not be fetched by report clients.')
  assert(page.includes('/api/admin/reports/sales-performance?'), 'Report client must use the bounded API.')
  assert(page.includes('requestSeqRef.current !== requestSeq'), 'Stale responses must not overwrite current report data.')
}

const { buildSalesByItemRows } = load('lib/reports/sales-by-item')
const { buildSalesByCategoryRows } = load('lib/reports/sales-by-category')
const { buildSalesByCustomerRows } = load('lib/reports/sales-by-customer')
const { buildSalesByEmployeeRows } = load('lib/reports/sales-by-employee')
const { buildSalesTrendRows } = load('lib/reports/sales-trend')
const { canViewReportRange } = load('lib/permissions')

const item = (name, category, quantity, sales, cost) => ({
  name, type: 'product', category, quantity, unit_price: quantity ? sales / quantity : 0,
  line_total: sales, cost_price: cost, cost_total: cost * quantity,
  profit: sales - cost * quantity, has_known_cost: true,
})
const order = (id, customer, employeeId, payment, items, createdAt = '2026-07-10T12:00:00Z') => ({
  id, order_number: id, customer_name: customer, customer_phone: customer,
  status: 'in_progress', created_at: createdAt, invoice_number: id,
  payment_method: payment, payment_status: 'paid', subtotal: 100,
  discount: 10, tax: 13.5, total: 103.5, cash_received: 103.5,
  remaining_from_customer: 0, cash_change: 0, note: '', items, employeeId,
})
const fixtures = [
  order('1', 'A', 'e1', 'cash', [item('Tie A', 'Care', 2, 100, 20)]),
  order('2', 'B', 'e2', 'card', [item('Tie B', 'Repair', 2, 100, 20)]),
  order('3', 'A', 'e1', 'transfer', [item('Zero', 'Care', 0, 0, 0)]),
]

const itemRows = buildSalesByItemRows(fixtures)
const categoryRows = buildSalesByCategoryRows(fixtures)
const customerRows = buildSalesByCustomerRows(fixtures)
const employeeRows = buildSalesByEmployeeRows(fixtures, [
  { id: 'e1', username: 'one', full_name: 'One', role: 'employee' },
  { id: 'e2', username: 'two', full_name: 'Two', role: 'employee' },
])
const trendRows = buildSalesTrendRows(fixtures, 'day', {
  start: '2026-07-09T00:00:00Z', end: '2026-07-11T23:59:59Z',
})

assert(itemRows.length === 3 && itemRows[0].itemName === 'Tie A', 'Item grouping and tied ordering changed.')
assert(categoryRows.length === 2 && categoryRows[0].categoryName === 'Care', 'Category grouping changed.')
assert(customerRows.length === 2 && customerRows.some((row) => row.ordersCount === 2), 'Customer grouping changed.')
assert(employeeRows.length === 2 && employeeRows[0].employeeId === 'e1', 'Employee totals or tied ranking changed.')
assert(trendRows.length === 3 && trendRows[1].grossSales === 200, 'Trend bounds or empty periods changed.')
assert([itemRows, categoryRows, customerRows, employeeRows, trendRows].flat(2).every((row) =>
  Object.values(row).every((value) => typeof value !== 'number' || Number.isFinite(value))
), 'Reports must never return NaN or Infinity.')
assert(canViewReportRange('employee', '2026-07-01T00:00:00Z', '2026-07-31T23:59:59Z'), '31-day range must remain allowed.')
assert(!canViewReportRange('employee', '2026-07-01T00:00:00Z', '2026-08-01T23:59:59Z'), 'Ranges over 31 days must remain blocked.')
assert(buildSalesByItemRows([]).length === 0 && buildSalesTrendRows([], 'day', { start: '', end: '' }).length === 0, 'Empty reports changed.')

console.log('Reports performance and correctness checks passed.')
