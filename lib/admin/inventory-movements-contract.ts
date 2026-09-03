export const INVENTORY_MOVEMENTS_DEFAULT_PAGE_SIZE = 10
export const INVENTORY_MOVEMENTS_MAX_PAGE_SIZE = 50
export const INVENTORY_MOVEMENTS_DEFAULT_WINDOW_DAYS = 30
export const INVENTORY_MOVEMENTS_MAX_WINDOW_DAYS = 366
export const INVENTORY_MOVEMENTS_MAX_SEARCH_LENGTH = 120
export const INVENTORY_MOVEMENTS_MAX_MOVEMENT_TYPE_LENGTH = 64
export const INVENTORY_MOVEMENTS_MAX_BRANCH_ID_LENGTH = 128

export type InventoryMovementCursor = Readonly<{
  created_at: string
  id: string
  scope: string
}>

export type InventoryMovementWindow = Readonly<{
  from: string
  to: string
  days: number
}>

export type InventoryMovementsContractInput = Readonly<{
  pageSize: number
  cursor: InventoryMovementCursor | null
  window: InventoryMovementWindow
  movementType: string
  search: string
  requestedBranchId: string
  scopeWindow: Readonly<{
    fromDate: string
    toDate: string
    upperBoundMode: 'current-time' | 'end-of-day'
  }>
}>

export type InventoryMovementResponseRow = Readonly<{
  id: string
  branch_id: string
  catalog_item_id: string
  movement_type: string
  quantity_delta: number
  source_type: string | null
  notes: string | null
  created_at: string
  item_name: string
  branch_name: string
  resolved_employee_name: string
  created_by_name: string
  actor_name: string
  actor_type: string
}>

export type InventoryMovementsV2Response = Readonly<{
  success: true
  rows: readonly InventoryMovementResponseRow[]
  pageSize: number
  nextCursor: string | null
  window: InventoryMovementWindow
}>

export class InventoryMovementsBranchDeniedError extends Error {
  constructor() {
    super('INVENTORY_MOVEMENTS_BRANCH_DENIED')
    this.name = 'InventoryMovementsBranchDeniedError'
  }
}

export class InventoryMovementsContractError extends Error {
  readonly code:
    | 'INVALID_PAGE_SIZE'
    | 'INVALID_CURSOR'
    | 'INVALID_DATE'
    | 'INVALID_WINDOW'
    | 'INVALID_CURSOR_SCOPE'
    | 'INVALID_PARAMETER'

  constructor(code: InventoryMovementsContractError['code']) {
    super(code)
    this.name = 'InventoryMovementsContractError'
    this.code = code
  }
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u
const SAFE_CURSOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u
const SAFE_CURSOR_SCOPE_PATTERN = /^[a-f0-9]{64}$/u
const ALLOWED_PARAMETERS = new Set([
  'pageSize',
  'cursor',
  'dateFrom',
  'dateTo',
  'movementType',
  'search',
  'branchId',
])

function parseDateOnly(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new InventoryMovementsContractError('INVALID_DATE')
  }

  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp)) {
    throw new InventoryMovementsContractError('INVALID_DATE')
  }

  const canonical = new Date(timestamp).toISOString().slice(0, 10)
  if (canonical !== value) {
    throw new InventoryMovementsContractError('INVALID_DATE')
  }

  return timestamp
}

function startOfUtcDate(timestamp: number) {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function encodeInventoryMovementCursor(cursor: InventoryMovementCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function decodeInventoryMovementCursor(value: string) {
  try {
    if (value.length > 1024) throw new Error('invalid')
    const decoded = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8')
    ) as Record<string, unknown>
    if (
      Object.keys(decoded).sort().join('|') !== 'created_at|id|scope' ||
      typeof decoded.created_at !== 'string' ||
      !Number.isFinite(Date.parse(decoded.created_at)) ||
      typeof decoded.id !== 'string' ||
      !SAFE_CURSOR_ID_PATTERN.test(decoded.id) ||
      typeof decoded.scope !== 'string' ||
      !SAFE_CURSOR_SCOPE_PATTERN.test(decoded.scope)
    ) {
      throw new Error('invalid')
    }

    return Object.freeze({
      created_at: new Date(decoded.created_at).toISOString(),
      id: decoded.id,
      scope: decoded.scope,
    }) satisfies InventoryMovementCursor
  } catch {
    throw new InventoryMovementsContractError('INVALID_CURSOR')
  }
}

function boundedParameter(
  value: string | null,
  maximumLength: number
) {
  const normalized = value?.trim() || ''
  if (normalized.length > maximumLength) {
    throw new InventoryMovementsContractError('INVALID_PARAMETER')
  }
  return normalized
}

export function parseInventoryMovementsContract(
  params: URLSearchParams,
  now = new Date()
): InventoryMovementsContractInput {
  const seen = new Set<string>()
  for (const key of params.keys()) {
    if (!ALLOWED_PARAMETERS.has(key) || seen.has(key)) {
      throw new InventoryMovementsContractError('INVALID_PARAMETER')
    }
    seen.add(key)
  }

  const rawPageSize = params.get('pageSize')
  const pageSize = rawPageSize === null
    ? INVENTORY_MOVEMENTS_DEFAULT_PAGE_SIZE
    : Number(rawPageSize)
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new InventoryMovementsContractError('INVALID_PAGE_SIZE')
  }

  const normalizedPageSize = Math.min(pageSize, INVENTORY_MOVEMENTS_MAX_PAGE_SIZE)
  const dateFrom = params.get('dateFrom')?.trim() || ''
  const dateTo = params.get('dateTo')?.trim() || ''
  const nowTimestamp = now.getTime()
  if (!Number.isFinite(nowTimestamp)) {
    throw new InventoryMovementsContractError('INVALID_DATE')
  }

  const todayStart = startOfUtcDate(nowTimestamp)
  const toStart = dateTo ? parseDateOnly(dateTo) : todayStart
  const fromStart = dateFrom
    ? parseDateOnly(dateFrom)
    : toStart - (INVENTORY_MOVEMENTS_DEFAULT_WINDOW_DAYS - 1) * 86_400_000
  if (fromStart > toStart) {
    throw new InventoryMovementsContractError('INVALID_WINDOW')
  }

  const days = Math.floor((toStart - fromStart) / 86_400_000) + 1
  if (days > INVENTORY_MOVEMENTS_MAX_WINDOW_DAYS) {
    throw new InventoryMovementsContractError('INVALID_WINDOW')
  }

  const toTimestamp = dateTo
    ? toStart + 86_400_000 - 1
    : nowTimestamp

  const cursorValue = params.get('cursor')?.trim() || ''
  return Object.freeze({
    pageSize: normalizedPageSize,
    cursor: cursorValue ? decodeInventoryMovementCursor(cursorValue) : null,
    window: Object.freeze({
      from: new Date(fromStart).toISOString(),
      to: new Date(toTimestamp).toISOString(),
      days,
    }),
    movementType: boundedParameter(
      params.get('movementType'),
      INVENTORY_MOVEMENTS_MAX_MOVEMENT_TYPE_LENGTH
    ),
    search: boundedParameter(
      params.get('search'),
      INVENTORY_MOVEMENTS_MAX_SEARCH_LENGTH
    ),
    requestedBranchId: boundedParameter(
      params.get('branchId'),
      INVENTORY_MOVEMENTS_MAX_BRANCH_ID_LENGTH
    ),
    scopeWindow: Object.freeze({
      fromDate: new Date(fromStart).toISOString().slice(0, 10),
      toDate: new Date(toStart).toISOString().slice(0, 10),
      upperBoundMode: dateTo ? 'end-of-day' : 'current-time',
    }),
  })
}

export function createInventoryMovementScopeCanonical(input: Readonly<{
  tenantId: string
  branchId: string
  fromDate: string
  toDate: string
  upperBoundMode: 'current-time' | 'end-of-day'
  movementType: string
  search: string
}>) {
  return JSON.stringify([
    input.tenantId,
    input.branchId,
    input.fromDate,
    input.toDate,
    input.upperBoundMode,
    input.movementType,
    input.search,
  ])
}

export function assertInventoryMovementCursorScope(
  cursor: InventoryMovementCursor | null,
  expectedScope: string
) {
  if (!SAFE_CURSOR_SCOPE_PATTERN.test(expectedScope)) {
    throw new InventoryMovementsContractError('INVALID_CURSOR_SCOPE')
  }
  if (cursor && cursor.scope !== expectedScope) {
    throw new InventoryMovementsContractError('INVALID_CURSOR_SCOPE')
  }
}

export function createInventoryCursorBoundaryFilter(
  cursor: InventoryMovementCursor
) {
  return `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
}

export function resolveInventoryMovementBranchScope(input: Readonly<{
  branchAccessMode: 'tenant' | 'assigned'
  activeBranchId: string | null
  requestedBranchId: string
}>) {
  if (input.branchAccessMode === 'tenant') {
    return input.requestedBranchId
  }

  const activeBranchId = input.activeBranchId || ''
  if (
    input.requestedBranchId &&
    input.requestedBranchId !== activeBranchId
  ) {
    throw new InventoryMovementsBranchDeniedError()
  }
  return activeBranchId
}
