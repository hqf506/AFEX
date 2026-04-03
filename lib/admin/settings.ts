export type SystemSettings = {
  id: string
  store_name: string
  branch_name: string
  logo_url: string | null
  whatsapp_provider: string
  whatsapp_phone: string | null
  ultramsg_instance_id: string | null
  ultramsg_token: string | null
  ultramsg_api_url: string | null
  enable_whatsapp: boolean
  enable_printing: boolean
  enable_pos: boolean
  enable_invoices: boolean
  enable_orders: boolean
  enable_reports: boolean
  enable_users: boolean
  created_at: string
  updated_at: string
}

export type SystemSettingsPayload = {
  store_name: string
  branch_name: string
  logo_url: string
  whatsapp_provider: string
  whatsapp_phone: string
  ultramsg_instance_id: string
  ultramsg_token: string
  ultramsg_api_url: string
  enable_whatsapp: boolean
  enable_printing: boolean
  enable_pos: boolean
  enable_invoices: boolean
  enable_orders: boolean
  enable_reports: boolean
  enable_users: boolean
}

export type SystemSettingsUpdatePayload = {
  store_name?: string
  branch_name?: string
  logo_url?: string | null
  whatsapp_provider?: string
  whatsapp_phone?: string | null
  ultramsg_instance_id?: string | null
  ultramsg_token?: string | null
  ultramsg_api_url?: string | null
  enable_whatsapp?: boolean
  enable_printing?: boolean
  enable_pos?: boolean
  enable_invoices?: boolean
  enable_orders?: boolean
  enable_reports?: boolean
  enable_users?: boolean
}

export const SYSTEM_SETTINGS_DEFAULT_VALUES = {
  store_name: 'Leather Fix',
  branch_name: 'الفرع الرئيسي',
  whatsapp_provider: 'ultramsg',
  enable_whatsapp: true,
  enable_printing: true,
  enable_pos: true,
  enable_invoices: true,
  enable_orders: true,
  enable_reports: true,
  enable_users: true,
} as const

export function createDefaultSystemSettingsPayload(): SystemSettingsPayload {
  return {
    store_name: '',
    branch_name: '',
    logo_url: '',
    whatsapp_provider: SYSTEM_SETTINGS_DEFAULT_VALUES.whatsapp_provider,
    whatsapp_phone: '',
    ultramsg_instance_id: '',
    ultramsg_token: '',
    ultramsg_api_url: '',
    enable_whatsapp: SYSTEM_SETTINGS_DEFAULT_VALUES.enable_whatsapp,
    enable_printing: SYSTEM_SETTINGS_DEFAULT_VALUES.enable_printing,
    enable_pos: SYSTEM_SETTINGS_DEFAULT_VALUES.enable_pos,
    enable_invoices: SYSTEM_SETTINGS_DEFAULT_VALUES.enable_invoices,
    enable_orders: SYSTEM_SETTINGS_DEFAULT_VALUES.enable_orders,
    enable_reports: SYSTEM_SETTINGS_DEFAULT_VALUES.enable_reports,
    enable_users: SYSTEM_SETTINGS_DEFAULT_VALUES.enable_users,
  }
}

export function createSystemSettingsPayload(
  settings: SystemSettings | null | undefined
): SystemSettingsPayload {
  if (!settings) {
    return createDefaultSystemSettingsPayload()
  }

  return {
    store_name: '',
    branch_name: '',
    logo_url: settings.logo_url || '',
    whatsapp_provider:
      settings.whatsapp_provider ||
      SYSTEM_SETTINGS_DEFAULT_VALUES.whatsapp_provider,
    whatsapp_phone: settings.whatsapp_phone || '',
    ultramsg_instance_id: settings.ultramsg_instance_id || '',
    ultramsg_token: settings.ultramsg_token || '',
    ultramsg_api_url: settings.ultramsg_api_url || '',
    enable_whatsapp: settings.enable_whatsapp,
    enable_printing: settings.enable_printing,
    enable_pos: settings.enable_pos,
    enable_invoices: settings.enable_invoices,
    enable_orders: settings.enable_orders,
    enable_reports: settings.enable_reports,
    enable_users: settings.enable_users,
  }
}

export function resolveSystemSettingsSaveNames(
  form: SystemSettingsPayload,
  settings: SystemSettings
) {
  return {
    storeName: form.store_name.trim() || settings.store_name || '',
    branchName: form.branch_name.trim() || settings.branch_name || '',
  }
}

export function createSystemSettingsSavePayload(
  form: SystemSettingsPayload,
  settings: SystemSettings
) {
  const { storeName, branchName } = resolveSystemSettingsSaveNames(form, settings)

  return {
    ...form,
    store_name: storeName,
    branch_name: branchName,
  }
}

export function normalizeNullableText(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

export function normalizeRequiredText(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed === '' ? fallback : trimmed
}

export function normalizeSystemSettingsUpdatePayload(
  body: SystemSettingsUpdatePayload
) {
  return {
    store_name: normalizeRequiredText(
      body.store_name,
      SYSTEM_SETTINGS_DEFAULT_VALUES.store_name
    ),
    branch_name: normalizeRequiredText(
      body.branch_name,
      SYSTEM_SETTINGS_DEFAULT_VALUES.branch_name
    ),
    logo_url: normalizeNullableText(body.logo_url),
    whatsapp_provider: normalizeRequiredText(
      body.whatsapp_provider,
      SYSTEM_SETTINGS_DEFAULT_VALUES.whatsapp_provider
    ),
    whatsapp_phone: normalizeNullableText(body.whatsapp_phone),
    ultramsg_instance_id: normalizeNullableText(body.ultramsg_instance_id),
    ultramsg_token: normalizeNullableText(body.ultramsg_token),
    ultramsg_api_url: normalizeNullableText(body.ultramsg_api_url),
    enable_whatsapp:
      typeof body.enable_whatsapp === 'boolean'
        ? body.enable_whatsapp
        : SYSTEM_SETTINGS_DEFAULT_VALUES.enable_whatsapp,
    enable_printing:
      typeof body.enable_printing === 'boolean'
        ? body.enable_printing
        : SYSTEM_SETTINGS_DEFAULT_VALUES.enable_printing,
    enable_pos:
      typeof body.enable_pos === 'boolean'
        ? body.enable_pos
        : SYSTEM_SETTINGS_DEFAULT_VALUES.enable_pos,
    enable_invoices:
      typeof body.enable_invoices === 'boolean'
        ? body.enable_invoices
        : SYSTEM_SETTINGS_DEFAULT_VALUES.enable_invoices,
    enable_orders:
      typeof body.enable_orders === 'boolean'
        ? body.enable_orders
        : SYSTEM_SETTINGS_DEFAULT_VALUES.enable_orders,
    enable_reports:
      typeof body.enable_reports === 'boolean'
        ? body.enable_reports
        : SYSTEM_SETTINGS_DEFAULT_VALUES.enable_reports,
    enable_users:
      typeof body.enable_users === 'boolean'
        ? body.enable_users
        : SYSTEM_SETTINGS_DEFAULT_VALUES.enable_users,
  }
}
