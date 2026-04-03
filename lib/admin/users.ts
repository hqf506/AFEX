import { APP_ROLES, type AppRole } from '@/lib/app-roles'

export const ADMIN_PRIMARY_USERNAME = 'admin'
export const ADMIN_PASSWORD_MIN_LENGTH = 6

export type AdminUserCreateForm = {
  username: string
  fullName: string
  password: string
  confirmPassword: string
  role: AppRole
}

export function createEmptyAdminUserForm(): AdminUserCreateForm {
  return {
    username: '',
    fullName: '',
    password: '',
    confirmPassword: '',
    role: 'employee',
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

export function isValidAdminRole(value: unknown): value is AppRole {
  return typeof value === 'string' && APP_ROLES.includes(value as AppRole)
}

export function isPrimaryAdminUsername(username: string | null | undefined) {
  return username === ADMIN_PRIMARY_USERNAME
}

export function canSubmitAdminUserForm(
  form: Pick<AdminUserCreateForm, 'username' | 'password' | 'confirmPassword'>
) {
  return (
    form.username.trim().length > 0 &&
    hasValidAdminPasswordLength(form.password.trim()) &&
    hasValidAdminPasswordLength(form.confirmPassword.trim()) &&
    form.password === form.confirmPassword
  )
}
