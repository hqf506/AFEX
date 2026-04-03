export const APP_ROLES = ['admin', 'employee', 'cashier'] as const

export type AppRole = (typeof APP_ROLES)[number]

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'أدمن',
  employee: 'موظف',
  cashier: 'كاشير',
}

export function getRoleLabel(role: AppRole | null | undefined) {
  if (!role) return ''
  return ROLE_LABELS[role]
}
