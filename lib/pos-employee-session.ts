import type { AppRole } from '@/lib/app-roles'

export const POS_EMPLOYEE_SESSION_KEY = 'leather_fix_pos_employee'
const POS_LOGGED_OUT_SESSION_KEY = 'leather_fix_pos_logged_out'

export type ActivePosEmployee = {
  id: string
  username: string | null
  full_name: string | null
  role: AppRole
  branch_id: string | null
}

function isActivePosEmployee(value: unknown): value is ActivePosEmployee {
  if (!value || typeof value !== 'object') {
    return false
  }

  const employee = value as Partial<ActivePosEmployee>

  return (
    typeof employee.id === 'string' &&
    (typeof employee.username === 'string' || employee.username === null) &&
    (typeof employee.full_name === 'string' || employee.full_name === null) &&
    typeof employee.role === 'string' &&
    (typeof employee.branch_id === 'string' || employee.branch_id === null)
  )
}

export function readActivePosEmployee() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(POS_EMPLOYEE_SESSION_KEY)

    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue)

    if (!isActivePosEmployee(parsedValue)) {
      window.sessionStorage.removeItem(POS_EMPLOYEE_SESSION_KEY)
      return null
    }

    return parsedValue
  } catch {
    window.sessionStorage.removeItem(POS_EMPLOYEE_SESSION_KEY)
    return null
  }
}

export function writeActivePosEmployee(employee: ActivePosEmployee) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(
    POS_EMPLOYEE_SESSION_KEY,
    JSON.stringify(employee)
  )
}

export function clearActivePosEmployee() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(POS_EMPLOYEE_SESSION_KEY)
}

export function markPosLoggedOut() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(POS_LOGGED_OUT_SESSION_KEY, '1')
}

export function clearPosLoggedOut() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(POS_LOGGED_OUT_SESSION_KEY)
}

export function hasPosLoggedOut() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.sessionStorage.getItem(POS_LOGGED_OUT_SESSION_KEY) === '1'
}
