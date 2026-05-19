export const ADMIN_FULL_ACCESS_ROLES = ['admin', 'manager', 'owner'] as const
export const POS_ACCESS_ROLES = ['admin', 'manager', 'employee', 'cashier'] as const
export const LIMITED_ADMIN_ROLES = ['employee'] as const
export const REPORT_MAX_RANGE_DAYS_FOR_EMPLOYEE = 31

type RoleLike = string | null | undefined

function normalizeRole(role: RoleLike) {
  return typeof role === 'string' ? role.trim() : ''
}

export function isFullAdmin(role: RoleLike) {
  const normalizedRole = normalizeRole(role)
  return ADMIN_FULL_ACCESS_ROLES.some((allowedRole) => allowedRole === normalizedRole)
}

export function canAccessPos(role: RoleLike) {
  const normalizedRole = normalizeRole(role)
  return POS_ACCESS_ROLES.some((allowedRole) => allowedRole === normalizedRole)
}

export function canAccessAdminPath(role: RoleLike, pathname: string | null | undefined) {
  const normalizedRole = normalizeRole(role)
  const normalizedPathname =
    typeof pathname === 'string' && pathname.trim() ? pathname.trim() : '/admin'

  if (isFullAdmin(normalizedRole)) {
    return true
  }

  if (!LIMITED_ADMIN_ROLES.some((allowedRole) => allowedRole === normalizedRole)) {
    return false
  }

  return (
    normalizedPathname === '/admin/orders' ||
    normalizedPathname === '/admin/reports' ||
    normalizedPathname.startsWith('/admin/reports/')
  )
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null

  const datePart = value.slice(0, 10)
  const timestamp = Date.parse(`${datePart}T00:00:00.000Z`)

  return Number.isFinite(timestamp) ? timestamp : null
}

export function canViewReportRange(
  role: RoleLike,
  fromDate: string | null | undefined,
  toDate: string | null | undefined
) {
  if (isFullAdmin(role)) {
    return true
  }

  if (normalizeRole(role) !== 'employee') {
    return true
  }

  const fromTimestamp = parseDateOnly(fromDate)
  const toTimestamp = parseDateOnly(toDate || fromDate)

  if (fromTimestamp === null || toTimestamp === null) {
    return true
  }

  const rangeDays =
    Math.floor(Math.abs(toTimestamp - fromTimestamp) / 86_400_000) + 1

  return rangeDays <= REPORT_MAX_RANGE_DAYS_FOR_EMPLOYEE
}
