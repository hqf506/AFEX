import type { AppRole } from '@/lib/app-roles'
import { supabase } from '@/lib/supabase/client'
import {
  executeFullPosLogoutLifecycle,
  executePosEmployeeSwitchLifecycle,
  lockOfflineRuntime,
} from '@/lib/offline/phase1'
import { clearCurrentUserProfileCache } from '@/lib/auth'
import {
  clearProtectedClientResources,
  resetProtectedResourceUnauthorized,
} from '@/lib/client-resource-cache'
import { clearAllInvoiceCatalogCache } from '@/lib/invoices/catalog'
import { INVOICE_SUCCESS_STORAGE_KEY } from '@/lib/invoices/success'

export const POS_EMPLOYEE_SESSION_KEY = 'leather_fix_pos_employee'
export const POS_EMPLOYEE_SESSION_CHANGE_EVENT =
  'afex:pos-employee-session-change'
const POS_LOGGED_OUT_SESSION_KEY = 'leather_fix_pos_logged_out'

let posEmployeeSessionGeneration = 0

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

  lockOfflineRuntime('pos-actor-change')
  window.sessionStorage.setItem(
    POS_EMPLOYEE_SESSION_KEY,
    JSON.stringify(employee)
  )
  resetProtectedResourceUnauthorized()
  emitPosEmployeeSessionChange()
}

export function clearActivePosEmployee() {
  if (typeof window === 'undefined') {
    return
  }

  lockOfflineRuntime('pos-actor-cleared')
  window.sessionStorage.removeItem(POS_EMPLOYEE_SESSION_KEY)
  emitPosEmployeeSessionChange()
}

export function readPosEmployeePresentationScope(): PosEmployeePresentationScope {
  const employee = readActivePosEmployee()
  return Object.freeze({
    employeeId: employee?.id ?? null,
    branchId: employee?.branch_id ?? null,
    generation: posEmployeeSessionGeneration,
  })
}

export function subscribeToPosEmployeeSessionChanges(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener(POS_EMPLOYEE_SESSION_CHANGE_EVENT, listener)
  return () =>
    window.removeEventListener(POS_EMPLOYEE_SESSION_CHANGE_EVENT, listener)
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

async function revokeCurrentPosActorSession() {
  let response: Response
  try {
    response = await fetch('/api/pos/end-actor-session', {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    throw new PosSessionEndError('POS_ACTOR_REVOCATION_UNAVAILABLE')
  }
  if (!response.ok) {
    throw new PosSessionEndError('POS_ACTOR_REVOCATION_REJECTED')
  }
}

export type PosEmployeePresentationScope = Readonly<{
  employeeId: string | null
  branchId: string | null
  generation: number
}>

function emitPosEmployeeSessionChange() {
  posEmployeeSessionGeneration += 1
  window.dispatchEvent(new Event(POS_EMPLOYEE_SESSION_CHANGE_EVENT))
}

function clearPosEmployeePlaintextCaches() {
  clearAllInvoiceCatalogCache()
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(INVOICE_SUCCESS_STORAGE_KEY)
  }
}

function clearFullPosSessionPlaintextCaches() {
  clearPosEmployeePlaintextCaches()
  clearProtectedClientResources()
  clearCurrentUserProfileCache()
}

export async function switchPosEmployeeAndRequirePin() {
  return executePosEmployeeSwitchLifecycle({
    revokePosActor: revokeCurrentPosActorSession,
    clearEmployeePresentation: clearActivePosEmployee,
    clearPlaintextCaches: clearPosEmployeePlaintextCaches,
  })
}

export async function endFullPosSessionAndRequireLogin() {
  return executeFullPosLogoutLifecycle({
    revokePosActor: revokeCurrentPosActorSession,
    signOutPrimary: async () => {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) {
        throw new PosSessionEndError('PRIMARY_LOGOUT_FAILED')
      }
    },
    clearEmployeePresentation: clearActivePosEmployee,
    clearPlaintextCaches: clearFullPosSessionPlaintextCaches,
    markPrimaryLoggedOut: markPosLoggedOut,
  })
}

export class PosSessionEndError extends Error {
  readonly classification:
    | 'POS_ACTOR_REVOCATION_UNAVAILABLE'
    | 'POS_ACTOR_REVOCATION_REJECTED'
    | 'PRIMARY_LOGOUT_FAILED'

  constructor(classification: PosSessionEndError['classification']) {
    super(classification)
    this.name = 'PosSessionEndError'
    this.classification = classification
  }
}
