export type AppRole = 'admin' | 'employee' | 'cashier'

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'أدمن',
  employee: 'موظف',
  cashier: 'كاشير',
}

export function getRoleLabel(role: AppRole | null | undefined) {
  if (!role) return ''
  return ROLE_LABELS[role]
}
