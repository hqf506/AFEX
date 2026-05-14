import { APP_ROLES, type AppRole } from '@/lib/app-roles'

export const ADMIN_PRIMARY_USERNAME = 'admin'
export const ADMIN_PASSWORD_MIN_LENGTH = 6

export type AdminUserCreatePayload = {
  username: string
  fullName: string
  contactEmail: string
  phone: string
  posPin: string
  password: string
  confirmPassword: string
  role: AppRole
  branchId: string
}

export function createEmptyAdminUserPayload(): AdminUserCreatePayload {
  return {
    username: '',
    fullName: '',
    contactEmail: '',
    phone: '',
    posPin: '',
    password: '',
    confirmPassword: '',
    role: 'employee',
    branchId: '',
  }
}

export const ADMIN_ROLE_OPTIONS: ReadonlyArray<{
  value: AppRole
  label: AppRole
}> = APP_ROLES.map((role) => ({
  value: role,
  label: role,
}))

export function normalizeAdminUserId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeAdminPassword(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeAdminFullName(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function hasValidAdminPasswordLength(password: string) {
  return password.length >= ADMIN_PASSWORD_MIN_LENGTH
}

export function isValidAdminPosPin(value: string) {
  return /^[0-9]{4}$/.test(value.trim())
}

export function isValidAdminRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLES.includes(value as AppRole)
}

export function isPrimaryAdminUsername(username: string | null | undefined) {
  return username === ADMIN_PRIMARY_USERNAME
}

export function canSubmitAdminUserCreatePayload(
  form: Pick<
    AdminUserCreatePayload,
    'username' | 'password' | 'confirmPassword' | 'posPin'
  >
) {
  return (
    form.username.trim().length > 0 &&
    isValidAdminPosPin(form.posPin) &&
    hasValidAdminPasswordLength(form.password.trim()) &&
    hasValidAdminPasswordLength(form.confirmPassword.trim()) &&
    form.password === form.confirmPassword
  )
}
