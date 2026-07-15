import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const moduleCache = new Map()
function loadTypeScriptModule(relativePath) {
  const normalizedPath = relativePath.endsWith('.ts')
    ? relativePath
    : `${relativePath}.ts`
  const absolutePath = path.join(process.cwd(), normalizedPath)

  if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath).exports

  const source = fs.readFileSync(absolutePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const moduleValue = { exports: {} }
  moduleCache.set(absolutePath, moduleValue)

  vm.runInNewContext(compiled, {
    exports: moduleValue.exports,
    module: moduleValue,
    require(specifier) {
      if (specifier.startsWith('@/')) {
        return loadTypeScriptModule(specifier.slice(2))
      }

      throw new Error(`Unexpected test dependency: ${specifier}`)
    },
    Array,
    Date,
    Intl,
    Map,
    Math,
    Number,
    Object,
    RegExp,
    Set,
    String,
  })

  return moduleValue.exports
}

const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'app', 'api', 'admin', 'reports', 'summary', 'route.ts'),
  'utf8'
)
const dashboardPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app', 'admin', 'dashboard', 'page.tsx'),
  'utf8'
)
const helperSource = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'reports', 'dashboard-aggregation.ts'),
  'utf8'
)
const dashboardRouteSource = routeSource.slice(
  routeSource.indexOf('async function getDashboardResponse'),
  routeSource.indexOf('function parseReportRange')
)

assert(!routeSource.includes("select('*')"), 'Dashboard reports must not use select(*).')
assert(
  dashboardRouteSource.includes(".from('orders')") &&
    dashboardRouteSource.includes('.gte(\'created_at\', previousRange.start || fromIso)') &&
    dashboardRouteSource.includes(".lte('created_at', toIso)"),
  'Current and comparison periods must share one bounded orders query.'
)
assert(
  !dashboardRouteSource.includes('item_name_snapshot') &&
    !dashboardRouteSource.includes('item_type_snapshot') &&
    !dashboardRouteSource.includes('quantity') &&
    !dashboardRouteSource.includes('unit_price'),
  'Dashboard invoice-item projection must contain only fields used by its response.'
)
assert(
  helperSource.includes('.slice(0, 5)') &&
    helperSource.includes('recentOrders: orders.slice(0, 5)'),
  'Top categories and recent orders must remain limited to five rows.'
)
assert(
  routeSource.includes('applyTenantFilter(ordersQuery, tenantId)') &&
    routeSource.includes("ordersQuery = ordersQuery.eq('branch_id', branchId)"),
  'Dashboard orders must remain tenant and branch scoped.'
)
assert(
  (dashboardPageSource.match(/\/api\/admin\/reports\/summary\?/g) || []).length === 1,
  'Dashboard must have one summary fetch path.'
)
assert(
  !dashboardPageSource.includes('buildDashboardPeriodPayload') &&
    !dashboardPageSource.includes('buildExecutiveDashboardData'),
  'Dashboard aggregation must remain on the server.'
)
assert(
  dashboardPageSource.includes('requestSeqRef.current !== requestSeq'),
  'An older Dashboard response must not overwrite a newer response.'
)

const {
  buildDashboardPeriodPayload,
  filterDashboardOrdersByRange,
} = loadTypeScriptModule('lib/reports/dashboard-aggregation')
const { buildExecutiveDashboardData } = loadTypeScriptModule(
  'lib/reports/executive-dashboard'
)
const { buildPreviousComparisonRange } = loadTypeScriptModule(
  'lib/reports/comparison'
)
const { buildReportOrderSummary, mapOrderSourceRowToReportOrderRecord } =
  loadTypeScriptModule('lib/reports/core')

function item(name, category, quantity, lineTotal, costPrice) {
  return {
    name,
    type: 'product',
    category,
    quantity,
    unit_price: quantity > 0 ? lineTotal / quantity : 0,
    line_total: lineTotal,
    cost_price: costPrice,
    cost_total: costPrice * quantity,
    profit: lineTotal - costPrice * quantity,
    has_known_cost: costPrice > 0,
  }
}

function order({
  id,
  createdAt,
  total,
  subtotal = total,
  discount = 0,
  tax = 0,
  status = 'in_progress',
  paymentMethod = 'cash',
  customer = 'Customer',
  items = [],
}) {
  return {
    id,
    order_number: id,
    customer_name: customer,
    customer_phone: '',
    status,
    created_at: createdAt,
    invoice_number: `INV-${id}`,
    payment_method: paymentMethod,
    payment_status: 'paid',
    total,
    subtotal,
    discount,
    tax,
    cash_received: paymentMethod === 'cash' ? total : 0,
    remaining_from_customer: 0,
    cash_change: 0,
    note: '',
    items,
  }
}

const currentOrders = [
  order({
    id: 'order-7',
    createdAt: '2026-07-07T23:59:59.999Z',
    subtotal: 100,
    discount: 10,
    tax: 13.5,
    total: 103.5,
    paymentMethod: 'cash',
    customer: 'A',
    items: [item('A', 'Care', 1, 90, 40)],
  }),
  order({
    id: 'order-6',
    createdAt: '2026-07-06T12:00:00.000Z',
    total: 80,
    status: 'ready',
    paymentMethod: 'card',
    customer: 'B',
    items: [item('B', 'Repair', 2, 80, 20)],
  }),
  order({
    id: 'order-5',
    createdAt: '2026-07-05T12:00:00.000Z',
    total: 70,
    status: 'closed',
    paymentMethod: 'transfer',
    customer: 'A',
    items: [item('C', 'Care', 1, 70, 30)],
  }),
  order({
    id: 'order-4',
    createdAt: '2026-07-04T12:00:00.000Z',
    total: 50,
    items: [item('D', 'Alpha', 1, 50, 10)],
  }),
  order({
    id: 'order-3',
    createdAt: '2026-07-03T12:00:00.000Z',
    total: 50,
    items: [item('E', 'Beta', 1, 50, 10)],
  }),
  order({
    id: 'order-2',
    createdAt: '2026-07-02T12:00:00.000Z',
    total: 25,
    items: [item('F', 'Other', 1, 25, 5)],
  }),
  order({
    id: 'order-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    total: 15,
    items: [item('G', 'Other', 1, 15, 5)],
  }),
]

const options = {
  range: 'custom',
  dateFrom: '2026-07-01',
  dateTo: '2026-07-07',
  includeDetails: true,
}
const optimized = buildDashboardPeriodPayload(currentOrders, options)
const legacyDashboard = buildExecutiveDashboardData(currentOrders, {
  range: options.range,
  dateFrom: options.dateFrom,
  dateTo: options.dateTo,
  trendGrouping: 'day',
  topLimit: 5,
})
const legacyContract = {
  summary: {
    totalSales: legacyDashboard.summary.totalSales,
    totalOrders: legacyDashboard.summary.totalOrders,
  },
  uniqueCustomersCount: new Set(
    currentOrders.map((currentOrder) => currentOrder.customer_name.trim()).filter(Boolean)
  ).size,
  activeOrdersCount: currentOrders.filter(
    (currentOrder) => currentOrder.status !== 'closed'
  ).length,
  topCategories: legacyDashboard.topCategories.map((category) => ({
    categoryKey: category.categoryKey,
    categoryName: category.categoryName,
    grossSales: category.grossSales,
  })),
  trend: legacyDashboard.trend.map((period) => ({
    periodKey: period.periodKey,
    periodLabel: period.periodLabel,
    grossSales: period.grossSales,
  })),
  recentOrders: currentOrders.slice(0, 5).map((currentOrder) => ({
    id: currentOrder.id,
    order_number: currentOrder.order_number,
    customer_name: currentOrder.customer_name,
    status: currentOrder.status,
    total: currentOrder.total,
  })),
}

assert(
  JSON.stringify(optimized) === JSON.stringify(legacyContract),
  'Optimized Dashboard aggregation must preserve the response contract.'
)
assert(
  optimized.summary.totalSales === 393.5 && optimized.summary.totalOrders === 7,
  'Dashboard totals must preserve discounts, VAT, and invoice totals.'
)
assert(
  optimized.recentOrders.length === 5 && optimized.recentOrders[0].id === 'order-7',
  'Recent orders must preserve their limit and source ordering.'
)
assert(
  optimized.topCategories.findIndex((row) => row.categoryKey === 'Alpha') <
    optimized.topCategories.findIndex((row) => row.categoryKey === 'Beta'),
  'Top-category ties must preserve the existing key ordering.'
)
assert(
  optimized.trend.every((row, index, rows) =>
    index === 0 || rows[index - 1].periodKey < row.periodKey
  ),
  'Trend buckets must remain chronologically ordered.'
)

const range = {
  start: '2026-07-01T00:00:00.000Z',
  end: '2026-07-07T23:59:59.999Z',
}
const previousRange = buildPreviousComparisonRange(range)
assert(
  new Date(previousRange.end).getTime() < new Date(range.start).getTime(),
  'Current and comparison periods must not overlap.'
)
assert(
  filterDashboardOrdersByRange(currentOrders, range.start, range.end).length === 7,
  'Orders on both inclusive boundaries must remain in the current period.'
)
assert(
  filterDashboardOrdersByRange(currentOrders, previousRange.start, previousRange.end)
    .length === 0,
  'A zero comparison period must remain empty.'
)

const financialSummary = buildReportOrderSummary(currentOrders)
assert(
  financialSummary.totalProfit ===
    currentOrders.reduce(
      (orderSum, currentOrder) =>
        orderSum +
        currentOrder.items.reduce((itemSum, currentItem) => itemSum + currentItem.profit, 0),
      0
    ),
  'Profit must preserve the existing line-profit aggregation.'
)
assert(
  Number.isFinite(financialSummary.profitMarginPercent),
  'Profit margin must never be NaN or Infinity.'
)
assert(
  financialSummary.cashTotal +
    financialSummary.cardTotal +
    financialSummary.transferTotal ===
    financialSummary.totalSales,
  'Payment-method totals must equal total sales.'
)
assert(
  financialSummary.inProgressCount +
    financialSummary.readyCount +
    financialSummary.closedCount ===
    financialSummary.totalOrders,
  'Status counts must equal total orders.'
)

const zeroSalesSummary = buildReportOrderSummary([
  order({ id: 'zero', createdAt: range.start, total: 0, items: [] }),
])
assert(
  zeroSalesSummary.profitMarginPercent === 0 &&
    Number.isFinite(zeroSalesSummary.profitMarginPercent),
  'Zero sales must produce a finite zero margin.'
)

const simpleProfitSummary = buildReportOrderSummary([
  order({
    id: 'simple-profit',
    createdAt: range.start,
    total: 100,
    items: [item('Profit', 'Care', 1, 100, 40)],
  }),
])
assert(
  simpleProfitSummary.totalProfit ===
    simpleProfitSummary.totalSales - simpleProfitSummary.totalCost,
  'Profit must remain sales minus cost when invoice and line totals match.'
)

const cancelledOrder = mapOrderSourceRowToReportOrderRecord(
  {
    id: 'cancelled-order',
    order_number: 'cancelled-order',
    status: 'cancelled',
    created_at: range.start,
    customers: { name: 'Customer' },
    invoices: [
      {
        total: 40,
        invoice_items: [
          {
            item_name_snapshot: 'Cancelled',
            item_category_snapshot: 'Care',
            quantity: 1,
            line_total: 40,
            cost_price: 10,
          },
        ],
      },
    ],
  },
  0
)
const cancelledPayload = buildDashboardPeriodPayload(
  [cancelledOrder],
  options
)
assert(
  cancelledOrder.status === 'in_progress' &&
    cancelledPayload.summary.totalSales === 40 &&
    cancelledPayload.activeOrdersCount === 1,
  'Cancelled aliases must preserve the current Dashboard status semantics.'
)

console.log('Dashboard performance and correctness checks passed.')
