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

function paginate(rows, page, pageSize) {
  const from = (page - 1) * pageSize
  return {
    items: rows.slice(from, from + pageSize),
    total: rows.length,
    lowStockRows: rows.filter((row) => row.is_low_stock),
  }
}

const fixtureBranches = [
  { id: 'branch-alpha', name: 'Alpha' },
  { id: 'branch-beta', name: 'Beta' },
]
const fixtureRowsByBranch = new Map(
  fixtureBranches.map((fixtureBranch, branchIndex) => [
    fixtureBranch.id,
    Array.from({ length: 15 }, (_, itemIndex) => ({
      catalog_item_id: `${fixtureBranch.id}-item-${itemIndex}`,
      item_name: `ITEM-${String(branchIndex * 15 + itemIndex).padStart(2, '0')}`,
      category_id: itemIndex % 2 === 0 ? 'care' : 'service',
      quantity_on_hand:
        itemIndex === 0 || (branchIndex === 1 && itemIndex === 14)
          ? 0
          : itemIndex === 1
            ? 2
            : 20,
      low_stock_threshold: 2,
    })),
  ])
)

const mergedRows = fixtureBranches.flatMap((fixtureBranch) =>
  normalizeAndFilterInventoryRows(
    fixtureRowsByBranch.get(fixtureBranch.id),
    fixtureBranch,
    { search: '', categoryId: '', stockStatus: '' }
  )
)
sortInventoryRows(mergedRows)

const firstPage = paginate(mergedRows, 1, 25)
const secondPage = paginate(mergedRows, 2, 25)
assert(firstPage.total === 30, 'Total must include rows beyond the first page.')
assert(firstPage.items.length === 25, 'The first page must respect pageSize.')
assert(secondPage.items.length === 5, 'The second page must contain the remainder.')
assert(
  firstPage.lowStockRows.length === 5 &&
    firstPage.items.filter((row) => row.is_low_stock).length === 4,
  'Low-stock rows must include matching rows outside the current page.'
)
assert(
  mergedRows[0].branch_name === 'Alpha' &&
    mergedRows.at(-1).branch_name === 'Beta' &&
    mergedRows.map((row) => `${row.branch_name}:${row.item_name}`).join('|') ===
      [...mergedRows]
        .sort(
          (left, right) =>
            left.branch_name.localeCompare(right.branch_name, 'ar') ||
            left.item_name.localeCompare(right.item_name, 'ar')
        )
        .map((row) => `${row.branch_name}:${row.item_name}`)
        .join('|'),
  'Merged inventory sorting must remain deterministic.'
)

const allFixtureRows = fixtureBranches.flatMap((fixtureBranch) =>
  fixtureRowsByBranch.get(fixtureBranch.id).map((row) => ({
    row,
    branch: fixtureBranch,
  }))
)
function filterFixtureRows(filters) {
  return fixtureBranches.flatMap((fixtureBranch) =>
    normalizeAndFilterInventoryRows(
      fixtureRowsByBranch.get(fixtureBranch.id),
      fixtureBranch,
      filters
    )
  )
}

assert(
  filterFixtureRows({ search: 'ITEM-29', categoryId: '', stockStatus: '' })
    .length === 1,
  'Name search must find the matching item.'
)
assert(
  filterFixtureRows({ search: 'Beta', categoryId: '', stockStatus: '' })
    .length === 15,
  'Search must continue to support branch names.'
)
assert(
  filterFixtureRows({ search: '', categoryId: 'care', stockStatus: '' })
    .length === allFixtureRows.filter(
      ({ row }) => row.category_id === 'care'
    ).length,
  'Category filtering must remain exact.'
)
assert(
  filterFixtureRows({ search: '', categoryId: '', stockStatus: 'available' })
    .length === 25,
  'Available stock filtering must remain correct.'
)
assert(
  filterFixtureRows({ search: '', categoryId: '', stockStatus: 'low' })
    .length === 2,
  'Low stock filtering must remain correct.'
)
assert(
  filterFixtureRows({ search: '', categoryId: '', stockStatus: 'out' })
    .length === 3,
  'Out-of-stock filtering must remain correct.'
)
assert(
  filterFixtureRows({
    search: 'Beta',
    categoryId: 'care',
    stockStatus: 'out',
  }).length === 2,
  'Combined branch, category, and stock-status filtering must remain correct.'
)
assert(
  normalizeAndFilterInventoryRows(
    fixtureRowsByBranch.get('branch-alpha'),
    fixtureBranches[0],
    { search: '', categoryId: '', stockStatus: '' }
  ).length === 15,
  'A selected branch must return only its own inventory rows.'
)
assert(
  filterFixtureRows({
    search: 'NO-MATCH',
    categoryId: '',
    stockStatus: '',
  }).length === 0,
  'Unmatched filters must return an empty result.'
)

const callsByBranch = new Map()
await runWithConcurrency(fixtureBranches, 4, async (fixtureBranch) => {
  callsByBranch.set(
    fixtureBranch.id,
    (callsByBranch.get(fixtureBranch.id) || 0) + 1
  )
})
assert(
  [...callsByBranch.values()].every((branchCalls) => branchCalls === 1),
  'Each selected branch must trigger exactly one RPC task.'
)

assert(
  routeSource.includes('.is(\'deleted_at\', null)'),
  'Inventory must exclude deleted branches before RPC fan-out.'
)
assert(
  routeSource.includes(".eq('tenant_id', tenantId)"),
  'Inventory branch loading must remain tenant scoped.'
)
assert(
  routeSource.includes("requestedBranchId !== auth.profile.branch_id"),
  'Branch-scoped admins must not request another branch.'
)
assert(
  routeSource.includes('requestedBranchId === ADMIN_BRANCH_FILTER_ALL'),
  'Branch-scoped admins must not request all branches.'
)
assert(
  /Math\.min\([\s\S]*?,\s*100\s*\)/.test(routeSource),
  'Inventory pageSize must remain capped at 100.'
)
assert(
  !helperSource.includes('sku') && !helperSource.includes('barcode'),
  'Update this verification if inventory search adds SKU or barcode support.'
)

console.log('Inventory performance and correctness checks passed.')
