export type InventoryBranch = {
  id: string
  name: string
}

export type InventoryRpcRow = {
  catalog_item_id?: string | null
  item_name?: string | null
  item_type?: 'product' | 'service' | string | null
  category_id?: string | null
  quantity_on_hand?: number | string | null
  low_stock_threshold?: number | string | null
  is_low_stock?: boolean | null
}

export type InventoryDataRow = {
  branch_id: string
  branch_name: string
  catalog_item_id: string
  item_name: string
  item_type: 'product' | 'service' | string
  category_id: string | null
  quantity_on_hand: number
  low_stock_threshold: number
  is_low_stock: boolean
}

export type InventoryFilters = {
  search: string
  categoryId: string
  stockStatus: string
}

function normalizeNumber(value: unknown) {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function normalizeInventoryRow(
  row: InventoryRpcRow,
  branch: InventoryBranch
): InventoryDataRow {
  const quantityOnHand = normalizeNumber(row.quantity_on_hand)
  const lowStockThreshold = normalizeNumber(row.low_stock_threshold)

  return {
    branch_id: branch.id,
    branch_name: branch.name,
    catalog_item_id: String(row.catalog_item_id || ''),
    item_name: String(row.item_name || ''),
    item_type: row.item_type || 'product',
    category_id: row.category_id || null,
    quantity_on_hand: quantityOnHand,
    low_stock_threshold: lowStockThreshold,
    is_low_stock:
      quantityOnHand <= 0 ||
      (lowStockThreshold > 0 && quantityOnHand <= lowStockThreshold),
  }
}

function getStockStatus(row: InventoryDataRow) {
  if (row.quantity_on_hand <= 0) return 'out'
  if (
    row.low_stock_threshold > 0 &&
    row.quantity_on_hand <= row.low_stock_threshold
  ) {
    return 'low'
  }

  return 'available'
}

export function normalizeAndFilterInventoryRows(
  rows: InventoryRpcRow[],
  branch: InventoryBranch,
  filters: InventoryFilters
) {
  const filteredRows: InventoryDataRow[] = []

  for (const sourceRow of rows) {
    const row = normalizeInventoryRow(sourceRow, branch)
    const matchesSearch =
      !filters.search ||
      row.item_name.includes(filters.search) ||
      row.branch_name.includes(filters.search)
    const matchesCategory =
      !filters.categoryId || row.category_id === filters.categoryId
    const matchesStockStatus =
      !filters.stockStatus || getStockStatus(row) === filters.stockStatus

    if (matchesSearch && matchesCategory && matchesStockStatus) {
      filteredRows.push(row)
    }
  }

  return filteredRows
}

export function sortInventoryRows(rows: InventoryDataRow[]) {
  rows.sort((left, right) => {
    const branchComparison = left.branch_name.localeCompare(
      right.branch_name,
      'ar'
    )

    if (branchComparison !== 0) return branchComparison
    return left.item_name.localeCompare(right.item_name, 'ar')
  })

  return rows
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>
) {
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  async function worker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      await task(item)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
}
