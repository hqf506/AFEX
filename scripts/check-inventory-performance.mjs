import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const helperSource = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'inventory', 'data-loading.ts'),
  'utf8'
)
const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'app', 'api', 'admin', 'inventory', 'route.ts'),
  'utf8'
)
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText
const moduleValue = { exports: {} }

vm.runInNewContext(compiled, {
  exports: moduleValue.exports,
  module: moduleValue,
})

const {
  normalizeAndFilterInventoryRows,
  runWithConcurrency,
  sortInventoryRows,
} = moduleValue.exports

const branch = { id: 'branch-a', name: 'الروضة' }
const sourceRows = [
  {
    catalog_item_id: 'item-b',
    item_name: 'WIPES',
    category_id: 'care',
    quantity_on_hand: 0,
    low_stock_threshold: 2,
  },
  {
    catalog_item_id: 'item-a',
    item_name: 'POLISH',
    category_id: 'care',
    quantity_on_hand: 8,
    low_stock_threshold: 2,
  },
  {
    catalog_item_id: 'item-c',
    item_name: 'SERVICE',
    category_id: 'service',
    quantity_on_hand: 1,
    low_stock_threshold: 3,
  },
]

const allRows = normalizeAndFilterInventoryRows(sourceRows, branch, {
  search: '',
  categoryId: '',
  stockStatus: '',
})
sortInventoryRows(allRows)
assert(allRows.length === 3, 'Total must be calculated before pagination.')
assert(
  allRows.map((row) => row.item_name).join(',') === 'POLISH,SERVICE,WIPES',
  'Inventory sorting semantics must remain stable.'
)
assert(
  allRows.filter((row) => row.is_low_stock).length === 2,
  'Low-stock rows must be derived from all filtered rows, not one page.'
)
assert(
  normalizeAndFilterInventoryRows(sourceRows, branch, {
    search: 'WIPES',
    categoryId: '',
    stockStatus: '',
  }).length === 1,
  'Inventory search semantics must remain stable.'
)
assert(
  normalizeAndFilterInventoryRows(sourceRows, branch, {
    search: '',
    categoryId: 'care',
    stockStatus: 'available',
  }).length === 1,
  'Category and stock-status filters must remain stable.'
)

let activeTasks = 0
let maxActiveTasks = 0
let calls = 0
await runWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
  calls += 1
  activeTasks += 1
  maxActiveTasks = Math.max(maxActiveTasks, activeTasks)
  await new Promise((resolve) => setTimeout(resolve, 5))
  activeTasks -= 1
})
assert(calls === 5, 'Each allowed branch must be loaded exactly once.')
assert(maxActiveTasks === 2, 'Inventory RPC fan-out must respect its limit.')

let singleBranchCalls = 0
await runWithConcurrency([branch], 4, async () => {
  singleBranchCalls += 1
})
assert(singleBranchCalls === 1, 'A single branch must trigger one task only.')

assert(
  routeSource.includes(".eq('is_active', true)"),
  'Inventory must exclude inactive branches before RPC fan-out.'
)
assert(
  routeSource.includes("branchQuery = branchQuery.eq('id', targetBranchId)"),
  'A selected branch must constrain the branch query before RPC loading.'
)
assert(
  routeSource.includes('await runWithConcurrency('),
  'All-branches inventory must use bounded concurrency.'
)
assert(
  routeSource.indexOf('const total = filteredRows.length') <
    routeSource.indexOf('const pagedRows = filteredRows.slice'),
  'Exact total must be calculated before pagination.'
)

console.log('Inventory performance and correctness checks passed.')
