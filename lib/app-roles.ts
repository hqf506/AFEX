export const APP_ROLES = ['admin', 'manager', 'employee', 'cashier'] as const

export type AppRole = (typeof APP_ROLES)[number]

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'مدير النظام',
  manager: 'مدير',
  employee: 'موظف',
  cashier: 'أمين الصندوق',
}

export function getRoleLabel(role: AppRole | null | undefined) {
  if (!role) return ''
  return ROLE_LABELS[role]
}
