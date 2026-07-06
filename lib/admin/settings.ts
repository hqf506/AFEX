import { DEFAULT_DIGITAL_INVOICE_SETTINGS } from '@/lib/invoices/receipt-template'
import { DEFAULT_THERMAL_INVOICE_SETTINGS } from '@/lib/invoices/thermal-template'

export type SystemSettings = {
  id: string
  store_name: string
  branch_name: string
  logo_url: string | null
  digital_invoice_brand_name: string | null
  digital_invoice_branch_name: string | null
  digital_invoice_address_line_1: string | null
  digital_invoice_address_line_2: string | null
  digital_invoice_whatsapp_number: string | null
  digital_invoice_whatsapp_enabled: boolean | null
  digital_invoice_google_review_link: string | null
  digital_invoice_google_review_enabled: boolean | null
  digital_invoice_map_link: string | null
  digital_invoice_map_enabled: boolean | null
  digital_invoice_note: string | null
  digital_invoice_brand_background_color: string | null
  digital_invoice_brand_text_color: string | null
  digital_invoice_instagram_enabled: boolean | null
  digital_invoice_instagram_link: string | null
  digital_invoice_tiktok_enabled: boolean | null
  digital_invoice_tiktok_link: string | null
  thermal_invoice_brand_name: string | null
  thermal_invoice_branch_name: string | null
  thermal_invoice_paper_width: string | null
  thermal_invoice_show_customer_phone: boolean | null
  thermal_invoice_show_payment_method: boolean | null
  thermal_invoice_show_note: boolean | null
  thermal_invoice_note: string | null
  thermal_invoice_footer_message: string | null
  thermal_invoice_show_whatsapp: boolean | null
  thermal_invoice_show_instagram: boolean | null
  thermal_invoice_show_tiktok: boolean | null
  thermal_invoice_show_google_review: boolean | null
  thermal_invoice_show_map: boolean | null
  whatsapp_provider: string
  whatsapp_phone: string | null
  ultramsg_instance_id: string | null
  ultramsg_token: string | null
  ultramsg_api_url: string | null
  whatsapp_order_ready_message_template: string | null
  whatsapp_order_delivered_message_template: string | null
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
  digital_invoice_brand_name: string
  digital_invoice_branch_name: string
  digital_invoice_address_line_1: string
  digital_invoice_address_line_2: string
  digital_invoice_whatsapp_number: string
  digital_invoice_whatsapp_enabled: boolean
  digital_invoice_google_review_link: string
  digital_invoice_google_review_enabled: boolean
  digital_invoice_map_link: string
  digital_invoice_map_enabled: boolean
  digital_invoice_note: string
  digital_invoice_brand_background_color: string
  digital_invoice_brand_text_color: string
  digital_invoice_instagram_enabled: boolean
  digital_invoice_instagram_link: string
  digital_invoice_tiktok_enabled: boolean
  digital_invoice_tiktok_link: string
  thermal_invoice_brand_name: string
  thermal_invoice_branch_name: string
  thermal_invoice_paper_width: string
  thermal_invoice_show_customer_phone: boolean
  thermal_invoice_show_payment_method: boolean
  thermal_invoice_show_note: boolean
  thermal_invoice_note: string
  thermal_invoice_footer_message: string
  thermal_invoice_show_whatsapp: boolean
  thermal_invoice_show_instagram: boolean
  thermal_invoice_show_tiktok: boolean
  thermal_invoice_show_google_review: boolean
  thermal_invoice_show_map: boolean
  whatsapp_provider: string
  whatsapp_phone: string
  ultramsg_instance_id: string
  ultramsg_token: string
  ultramsg_api_url: string
  whatsapp_order_ready_message_template: string
  whatsapp_order_delivered_message_template: string
  enable_whatsapp: boolean
  enable_printing: boolean
  enable_pos: boolean
  enable_invoices: boolean
  enable_orders: boolean
  enable_reports: boolean
  enable_users: boolean
}

export type SystemSettingsUpdatePayload = {
  logo_url?: string | null
  digital_invoice_brand_name?: string | null
  digital_invoice_branch_name?: string | null
  digital_invoice_address_line_1?: string | null
  digital_invoice_address_line_2?: string | null
  digital_invoice_whatsapp_number?: string | null
  digital_invoice_whatsapp_enabled?: boolean | null
  digital_invoice_google_review_link?: string | null
  digital_invoice_google_review_enabled?: boolean | null
  digital_invoice_map_link?: string | null
  digital_invoice_map_enabled?: boolean | null
  digital_invoice_note?: string | null
  digital_invoice_brand_background_color?: string | null
  digital_invoice_brand_text_color?: string | null
  digital_invoice_instagram_enabled?: boolean | null
  digital_invoice_instagram_link?: string | null
  digital_invoice_tiktok_enabled?: boolean | null
  digital_invoice_tiktok_link?: string | null
  thermal_invoice_brand_name?: string | null
  thermal_invoice_branch_name?: string | null
  thermal_invoice_paper_width?: string | null
  thermal_invoice_show_customer_phone?: boolean | null
  thermal_invoice_show_payment_method?: boolean | null
  thermal_invoice_show_note?: boolean | null
  thermal_invoice_note?: string | null
  thermal_invoice_footer_message?: string | null
  thermal_invoice_show_whatsapp?: boolean | null
  thermal_invoice_show_instagram?: boolean | null
  thermal_invoice_show_tiktok?: boolean | null
  thermal_invoice_show_google_review?: boolean | null
  thermal_invoice_show_map?: boolean | null
  whatsapp_provider?: string
  whatsapp_phone?: string | null
  ultramsg_instance_id?: string | null
  ultramsg_token?: string | null
  ultramsg_api_url?: string | null
  whatsapp_order_ready_message_template?: string | null
  whatsapp_order_delivered_message_template?: string | null
  enable_whatsapp?: boolean
  enable_printing?: boolean
  enable_pos?: boolean
  enable_invoices?: boolean
  enable_orders?: boolean
  enable_reports?: boolean
  enable_users?: boolean
}

export type DigitalInvoiceSettingsPayload = {
  digital_invoice_brand_name: string
  digital_invoice_branch_name: string
  digital_invoice_address_line_1: string
  digital_invoice_address_line_2: string
  digital_invoice_whatsapp_number: string
  digital_invoice_whatsapp_enabled: boolean
  digital_invoice_google_review_link: string
  digital_invoice_google_review_enabled: boolean
  digital_invoice_map_link: string
  digital_invoice_map_enabled: boolean
  digital_invoice_note: string
  digital_invoice_brand_background_color: string
  digital_invoice_brand_text_color: string
  digital_invoice_instagram_enabled: boolean
  digital_invoice_instagram_link: string
  digital_invoice_tiktok_enabled: boolean
  digital_invoice_tiktok_link: string
}

export type ThermalInvoiceSettingsPayload = {
  logo_url: string
  thermal_invoice_brand_name: string
  thermal_invoice_branch_name: string
  thermal_invoice_paper_width: string
  thermal_invoice_show_customer_phone: boolean
  thermal_invoice_show_payment_method: boolean
  thermal_invoice_show_note: boolean
  thermal_invoice_note: string
  thermal_invoice_footer_message: string
  thermal_invoice_show_whatsapp: boolean
  thermal_invoice_show_instagram: boolean
  thermal_invoice_show_tiktok: boolean
  thermal_invoice_show_google_review: boolean
  thermal_invoice_show_map: boolean
}

export type DigitalInvoiceTemplateSettings = {
  brandName: string
  brandBackgroundColor: string
  brandTextColor: string
  branchName: string
  addressLine1: string
  addressLine2: string
  whatsappNumber: string
  whatsappEnabled: boolean
  googleReviewLink: string
  googleReviewEnabled: boolean
  mapLink: string
  mapEnabled: boolean
  instagramEnabled: boolean
  instagramLink: string
  tiktokEnabled: boolean
  tiktokLink: string
  note: string
}

export type ThermalInvoiceTemplateSettings = {
  logoUrl: string
  brandName: string
  branchName: string
  paperWidth: string
  showCustomerPhone: boolean
  showPaymentMethod: boolean
  showNote: boolean
  note: string
  footerMessage: string
  showWhatsapp: boolean
  showInstagram: boolean
  showTiktok: boolean
  showGoogleReview: boolean
  showMap: boolean
  whatsappNumber: string
  instagramLink: string
  tiktokLink: string
  googleReviewLink: string
  mapLink: string
}

export const SYSTEM_SETTINGS_DEFAULT_VALUES = {
  store_name: 'AFEX',
  branch_name: 'الفرع الرئيسي',
  digital_invoice_brand_name: DEFAULT_DIGITAL_INVOICE_SETTINGS.brandName,
  digital_invoice_branch_name: DEFAULT_DIGITAL_INVOICE_SETTINGS.branchName,
  digital_invoice_address_line_1: DEFAULT_DIGITAL_INVOICE_SETTINGS.addressLine1,
  digital_invoice_address_line_2: DEFAULT_DIGITAL_INVOICE_SETTINGS.addressLine2,
  digital_invoice_whatsapp_number: DEFAULT_DIGITAL_INVOICE_SETTINGS.whatsappNumber,
  digital_invoice_whatsapp_enabled:
    DEFAULT_DIGITAL_INVOICE_SETTINGS.whatsappEnabled,
  digital_invoice_google_review_link:
    DEFAULT_DIGITAL_INVOICE_SETTINGS.googleReviewLink,
  digital_invoice_google_review_enabled:
    DEFAULT_DIGITAL_INVOICE_SETTINGS.googleReviewEnabled,
  digital_invoice_map_link: DEFAULT_DIGITAL_INVOICE_SETTINGS.mapLink,
  digital_invoice_map_enabled: DEFAULT_DIGITAL_INVOICE_SETTINGS.mapEnabled,
  digital_invoice_note: DEFAULT_DIGITAL_INVOICE_SETTINGS.note,
  digital_invoice_brand_background_color:
    DEFAULT_DIGITAL_INVOICE_SETTINGS.brandBackgroundColor,
  digital_invoice_brand_text_color:
    DEFAULT_DIGITAL_INVOICE_SETTINGS.brandTextColor,
  digital_invoice_instagram_enabled:
    DEFAULT_DIGITAL_INVOICE_SETTINGS.instagramEnabled,
  digital_invoice_instagram_link: DEFAULT_DIGITAL_INVOICE_SETTINGS.instagramLink,
  digital_invoice_tiktok_enabled:
    DEFAULT_DIGITAL_INVOICE_SETTINGS.tiktokEnabled,
  digital_invoice_tiktok_link: DEFAULT_DIGITAL_INVOICE_SETTINGS.tiktokLink,
  thermal_invoice_brand_name: DEFAULT_THERMAL_INVOICE_SETTINGS.brandName,
  thermal_invoice_branch_name: DEFAULT_THERMAL_INVOICE_SETTINGS.branchName,
  thermal_invoice_paper_width: DEFAULT_THERMAL_INVOICE_SETTINGS.paperWidth,
  thermal_invoice_show_customer_phone:
    DEFAULT_THERMAL_INVOICE_SETTINGS.showCustomerPhone,
  thermal_invoice_show_payment_method:
    DEFAULT_THERMAL_INVOICE_SETTINGS.showPaymentMethod,
  thermal_invoice_show_note: DEFAULT_THERMAL_INVOICE_SETTINGS.showNote,
  thermal_invoice_note: DEFAULT_THERMAL_INVOICE_SETTINGS.note,
  thermal_invoice_footer_message:
    DEFAULT_THERMAL_INVOICE_SETTINGS.footerMessage,
  thermal_invoice_show_whatsapp:
    DEFAULT_THERMAL_INVOICE_SETTINGS.showWhatsapp,
  thermal_invoice_show_instagram:
    DEFAULT_THERMAL_INVOICE_SETTINGS.showInstagram,
  thermal_invoice_show_tiktok: DEFAULT_THERMAL_INVOICE_SETTINGS.showTiktok,
  thermal_invoice_show_google_review:
    DEFAULT_THERMAL_INVOICE_SETTINGS.showGoogleReview,
  thermal_invoice_show_map: DEFAULT_THERMAL_INVOICE_SETTINGS.showMap,
  whatsapp_provider: 'ultramsg',
  whatsapp_order_ready_message_template: '',
  whatsapp_order_delivered_message_template: '',
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
    digital_invoice_brand_name: '',
    digital_invoice_branch_name: '',
    digital_invoice_address_line_1: '',
    digital_invoice_address_line_2: '',
    digital_invoice_whatsapp_number: '',
    digital_invoice_whatsapp_enabled:
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_whatsapp_enabled,
    digital_invoice_google_review_link: '',
    digital_invoice_google_review_enabled:
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_google_review_enabled,
    digital_invoice_map_link: '',
    digital_invoice_map_enabled:
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_map_enabled,
    digital_invoice_note: '',
    digital_invoice_brand_background_color: '',
    digital_invoice_brand_text_color: '',
    digital_invoice_instagram_enabled:
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_instagram_enabled,
    digital_invoice_instagram_link: '',
    digital_invoice_tiktok_enabled:
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_tiktok_enabled,
    digital_invoice_tiktok_link: '',
    thermal_invoice_brand_name: '',
    thermal_invoice_branch_name: '',
    thermal_invoice_paper_width:
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_paper_width,
    thermal_invoice_show_customer_phone:
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_customer_phone,
    thermal_invoice_show_payment_method:
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_payment_method,
    thermal_invoice_show_note:
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_note,
    thermal_invoice_note: '',
    thermal_invoice_footer_message: '',
    thermal_invoice_show_whatsapp:
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_whatsapp,
    thermal_invoice_show_instagram:
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_instagram,
    thermal_invoice_show_tiktok:
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_tiktok,
    thermal_invoice_show_google_review:
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_google_review,
    thermal_invoice_show_map:
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_map,
    whatsapp_provider: SYSTEM_SETTINGS_DEFAULT_VALUES.whatsapp_provider,
    whatsapp_phone: '',
    ultramsg_instance_id: '',
    ultramsg_token: '',
    ultramsg_api_url: '',
    whatsapp_order_ready_message_template:
      SYSTEM_SETTINGS_DEFAULT_VALUES.whatsapp_order_ready_message_template,
    whatsapp_order_delivered_message_template:
      SYSTEM_SETTINGS_DEFAULT_VALUES.whatsapp_order_delivered_message_template,
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
    digital_invoice_brand_name: settings.digital_invoice_brand_name || '',
    digital_invoice_branch_name: settings.digital_invoice_branch_name || '',
    digital_invoice_address_line_1: settings.digital_invoice_address_line_1 || '',
    digital_invoice_address_line_2: settings.digital_invoice_address_line_2 || '',
    digital_invoice_whatsapp_number: settings.digital_invoice_whatsapp_number || '',
    digital_invoice_whatsapp_enabled:
      settings.digital_invoice_whatsapp_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_whatsapp_enabled,
    digital_invoice_google_review_link:
      settings.digital_invoice_google_review_link || '',
    digital_invoice_google_review_enabled:
      settings.digital_invoice_google_review_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_google_review_enabled,
    digital_invoice_map_link: settings.digital_invoice_map_link || '',
    digital_invoice_map_enabled:
      settings.digital_invoice_map_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_map_enabled,
    digital_invoice_note: settings.digital_invoice_note || '',
    digital_invoice_brand_background_color:
      settings.digital_invoice_brand_background_color || '',
    digital_invoice_brand_text_color:
      settings.digital_invoice_brand_text_color || '',
    digital_invoice_instagram_enabled:
      settings.digital_invoice_instagram_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_instagram_enabled,
    digital_invoice_instagram_link:
      settings.digital_invoice_instagram_link || '',
    digital_invoice_tiktok_enabled:
      settings.digital_invoice_tiktok_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_tiktok_enabled,
    digital_invoice_tiktok_link: settings.digital_invoice_tiktok_link || '',
    thermal_invoice_brand_name: settings.thermal_invoice_brand_name || '',
    thermal_invoice_branch_name: settings.thermal_invoice_branch_name || '',
    thermal_invoice_paper_width:
      settings.thermal_invoice_paper_width ||
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_paper_width,
    thermal_invoice_show_customer_phone:
      settings.thermal_invoice_show_customer_phone ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_customer_phone,
    thermal_invoice_show_payment_method:
      settings.thermal_invoice_show_payment_method ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_payment_method,
    thermal_invoice_show_note:
      settings.thermal_invoice_show_note ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_note,
    thermal_invoice_note: settings.thermal_invoice_note || '',
    thermal_invoice_footer_message:
      settings.thermal_invoice_footer_message || '',
    thermal_invoice_show_whatsapp:
      settings.thermal_invoice_show_whatsapp ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_whatsapp,
    thermal_invoice_show_instagram:
      settings.thermal_invoice_show_instagram ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_instagram,
    thermal_invoice_show_tiktok:
      settings.thermal_invoice_show_tiktok ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_tiktok,
    thermal_invoice_show_google_review:
      settings.thermal_invoice_show_google_review ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_google_review,
    thermal_invoice_show_map:
      settings.thermal_invoice_show_map ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_map,
    whatsapp_provider:
      settings.whatsapp_provider ||
      SYSTEM_SETTINGS_DEFAULT_VALUES.whatsapp_provider,
    whatsapp_phone: settings.whatsapp_phone || '',
    ultramsg_instance_id: settings.ultramsg_instance_id || '',
    ultramsg_token: settings.ultramsg_token || '',
    ultramsg_api_url: settings.ultramsg_api_url || '',
    whatsapp_order_ready_message_template:
      settings.whatsapp_order_ready_message_template || '',
    whatsapp_order_delivered_message_template:
      settings.whatsapp_order_delivered_message_template || '',
    enable_whatsapp: settings.enable_whatsapp,
    enable_printing: settings.enable_printing,
    enable_pos: settings.enable_pos,
    enable_invoices: settings.enable_invoices,
    enable_orders: settings.enable_orders,
    enable_reports: settings.enable_reports,
    enable_users: settings.enable_users,
  }
}

export function createDigitalInvoiceSettingsPayload(
  settings: SystemSettings | null | undefined
): DigitalInvoiceSettingsPayload {
  return {
    digital_invoice_brand_name:
      settings?.digital_invoice_brand_name ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.brandName,
    digital_invoice_branch_name:
      settings?.digital_invoice_branch_name ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.branchName,
    digital_invoice_address_line_1:
      settings?.digital_invoice_address_line_1 ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.addressLine1,
    digital_invoice_address_line_2:
      settings?.digital_invoice_address_line_2 ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.addressLine2,
    digital_invoice_whatsapp_number:
      settings?.digital_invoice_whatsapp_number ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.whatsappNumber,
    digital_invoice_whatsapp_enabled:
      settings?.digital_invoice_whatsapp_enabled ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.whatsappEnabled,
    digital_invoice_google_review_link:
      settings?.digital_invoice_google_review_link ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.googleReviewLink,
    digital_invoice_google_review_enabled:
      settings?.digital_invoice_google_review_enabled ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.googleReviewEnabled,
    digital_invoice_map_link:
      settings?.digital_invoice_map_link ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.mapLink,
    digital_invoice_map_enabled:
      settings?.digital_invoice_map_enabled ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.mapEnabled,
    digital_invoice_note:
      settings?.digital_invoice_note ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.note,
    digital_invoice_brand_background_color:
      settings?.digital_invoice_brand_background_color ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.brandBackgroundColor,
    digital_invoice_brand_text_color:
      settings?.digital_invoice_brand_text_color ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.brandTextColor,
    digital_invoice_instagram_enabled:
      settings?.digital_invoice_instagram_enabled ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.instagramEnabled,
    digital_invoice_instagram_link:
      settings?.digital_invoice_instagram_link ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.instagramLink,
    digital_invoice_tiktok_enabled:
      settings?.digital_invoice_tiktok_enabled ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.tiktokEnabled,
    digital_invoice_tiktok_link:
      settings?.digital_invoice_tiktok_link ??
      DEFAULT_DIGITAL_INVOICE_SETTINGS.tiktokLink,
  }
}

export function createThermalInvoiceSettingsPayload(
  settings: SystemSettings | null | undefined
): ThermalInvoiceSettingsPayload {
  return {
    logo_url: settings?.logo_url ?? '',
    thermal_invoice_brand_name:
      settings?.thermal_invoice_brand_name ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.brandName,
    thermal_invoice_branch_name:
      settings?.thermal_invoice_branch_name ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.branchName,
    thermal_invoice_paper_width:
      settings?.thermal_invoice_paper_width ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.paperWidth,
    thermal_invoice_show_customer_phone:
      settings?.thermal_invoice_show_customer_phone ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.showCustomerPhone,
    thermal_invoice_show_payment_method:
      settings?.thermal_invoice_show_payment_method ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.showPaymentMethod,
    thermal_invoice_show_note:
      settings?.thermal_invoice_show_note ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.showNote,
    thermal_invoice_note:
      settings?.thermal_invoice_note ?? DEFAULT_THERMAL_INVOICE_SETTINGS.note,
    thermal_invoice_footer_message:
      settings?.thermal_invoice_footer_message ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.footerMessage,
    thermal_invoice_show_whatsapp:
      settings?.thermal_invoice_show_whatsapp ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.showWhatsapp,
    thermal_invoice_show_instagram:
      settings?.thermal_invoice_show_instagram ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.showInstagram,
    thermal_invoice_show_tiktok:
      settings?.thermal_invoice_show_tiktok ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.showTiktok,
    thermal_invoice_show_google_review:
      settings?.thermal_invoice_show_google_review ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.showGoogleReview,
    thermal_invoice_show_map:
      settings?.thermal_invoice_show_map ??
      DEFAULT_THERMAL_INVOICE_SETTINGS.showMap,
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

export function createSystemSettingsSavePayload(form: SystemSettingsPayload) {
  const systemSettingsPayload = Object.fromEntries(
    Object.entries(form).filter(
      ([key]) => key !== 'store_name' && key !== 'branch_name'
    )
  ) as SystemSettingsUpdatePayload

  return systemSettingsPayload
}

export function createDigitalInvoiceSettingsSavePayload(
  form: DigitalInvoiceSettingsPayload
) {
  return {
    digital_invoice_brand_name: normalizeEditableText(
      form.digital_invoice_brand_name
    ),
    digital_invoice_branch_name: normalizeEditableText(
      form.digital_invoice_branch_name
    ),
    digital_invoice_address_line_1: normalizeEditableText(
      form.digital_invoice_address_line_1
    ),
    digital_invoice_address_line_2: normalizeEditableText(
      form.digital_invoice_address_line_2
    ),
    digital_invoice_whatsapp_number: normalizeEditableText(
      form.digital_invoice_whatsapp_number
    ),
    digital_invoice_whatsapp_enabled: form.digital_invoice_whatsapp_enabled,
    digital_invoice_google_review_link: normalizeEditableText(
      form.digital_invoice_google_review_link
    ),
    digital_invoice_google_review_enabled:
      form.digital_invoice_google_review_enabled,
    digital_invoice_map_link: normalizeEditableText(form.digital_invoice_map_link),
    digital_invoice_map_enabled: form.digital_invoice_map_enabled,
    digital_invoice_note: normalizeEditableText(form.digital_invoice_note),
    digital_invoice_brand_background_color: normalizeEditableText(
      form.digital_invoice_brand_background_color
    ),
    digital_invoice_brand_text_color: normalizeEditableText(
      form.digital_invoice_brand_text_color
    ),
    digital_invoice_instagram_enabled: form.digital_invoice_instagram_enabled,
    digital_invoice_instagram_link: normalizeEditableText(
      form.digital_invoice_instagram_link
    ),
    digital_invoice_tiktok_enabled: form.digital_invoice_tiktok_enabled,
    digital_invoice_tiktok_link: normalizeEditableText(
      form.digital_invoice_tiktok_link
    ),
  } satisfies SystemSettingsUpdatePayload
}

export function createThermalInvoiceSettingsSavePayload(
  form: ThermalInvoiceSettingsPayload
) {
  return {
    logo_url: normalizeNullableText(form.logo_url),
    thermal_invoice_brand_name: normalizeEditableText(
      form.thermal_invoice_brand_name
    ),
    thermal_invoice_branch_name: normalizeEditableText(
      form.thermal_invoice_branch_name
    ),
    thermal_invoice_paper_width:
      form.thermal_invoice_paper_width === '58mm' ? '58mm' : '80mm',
    thermal_invoice_show_customer_phone:
      form.thermal_invoice_show_customer_phone,
    thermal_invoice_show_payment_method:
      form.thermal_invoice_show_payment_method,
    thermal_invoice_show_note: form.thermal_invoice_show_note,
    thermal_invoice_note: normalizeEditableText(form.thermal_invoice_note),
    thermal_invoice_footer_message: normalizeEditableText(
      form.thermal_invoice_footer_message
    ),
    thermal_invoice_show_whatsapp: form.thermal_invoice_show_whatsapp,
    thermal_invoice_show_instagram: form.thermal_invoice_show_instagram,
    thermal_invoice_show_tiktok: form.thermal_invoice_show_tiktok,
    thermal_invoice_show_google_review: form.thermal_invoice_show_google_review,
    thermal_invoice_show_map: form.thermal_invoice_show_map,
  } satisfies SystemSettingsUpdatePayload
}

export function resolveDigitalInvoiceTemplateSettings(
  settings: Partial<SystemSettings> | null | undefined
): DigitalInvoiceTemplateSettings {
  return {
    brandName:
      settings?.digital_invoice_brand_name ??
      settings?.store_name ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_name,
    brandBackgroundColor:
      settings?.digital_invoice_brand_background_color ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_background_color,
    brandTextColor:
      settings?.digital_invoice_brand_text_color ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_text_color,
    branchName:
      settings?.digital_invoice_branch_name ??
      settings?.branch_name ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_branch_name,
    addressLine1:
      settings?.digital_invoice_address_line_1 ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_address_line_1,
    addressLine2:
      settings?.digital_invoice_address_line_2 ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_address_line_2,
    whatsappNumber:
      settings?.digital_invoice_whatsapp_number ??
      settings?.whatsapp_phone ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_whatsapp_number,
    whatsappEnabled:
      settings?.digital_invoice_whatsapp_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_whatsapp_enabled,
    googleReviewLink:
      settings?.digital_invoice_google_review_link ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_google_review_link,
    googleReviewEnabled:
      settings?.digital_invoice_google_review_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_google_review_enabled,
    mapLink:
      settings?.digital_invoice_map_link ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_map_link,
    mapEnabled:
      settings?.digital_invoice_map_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_map_enabled,
    instagramEnabled:
      settings?.digital_invoice_instagram_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_instagram_enabled,
    instagramLink:
      settings?.digital_invoice_instagram_link ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_instagram_link,
    tiktokEnabled:
      settings?.digital_invoice_tiktok_enabled ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_tiktok_enabled,
    tiktokLink:
      settings?.digital_invoice_tiktok_link ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_tiktok_link,
    note:
      settings?.digital_invoice_note ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_note,
  }
}

export function resolveThermalInvoiceTemplateSettings(
  settings: Partial<SystemSettings> | null | undefined
): ThermalInvoiceTemplateSettings {
  return {
    logoUrl: settings?.logo_url ?? '',
    brandName:
      settings?.thermal_invoice_brand_name ??
      settings?.store_name ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_brand_name,
    branchName:
      settings?.thermal_invoice_branch_name ??
      settings?.branch_name ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_branch_name,
    paperWidth:
      settings?.thermal_invoice_paper_width === '58mm' ? '58mm' : '80mm',
    showCustomerPhone:
      settings?.thermal_invoice_show_customer_phone ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_customer_phone,
    showPaymentMethod:
      settings?.thermal_invoice_show_payment_method ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_payment_method,
    showNote:
      settings?.thermal_invoice_show_note ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_note,
    note:
      settings?.thermal_invoice_note ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_note,
    footerMessage:
      settings?.thermal_invoice_footer_message ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_footer_message,
    showWhatsapp:
      settings?.thermal_invoice_show_whatsapp ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_whatsapp,
    showInstagram:
      settings?.thermal_invoice_show_instagram ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_instagram,
    showTiktok:
      settings?.thermal_invoice_show_tiktok ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_tiktok,
    showGoogleReview:
      settings?.thermal_invoice_show_google_review ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_google_review,
    showMap:
      settings?.thermal_invoice_show_map ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_map,
    whatsappNumber:
      settings?.digital_invoice_whatsapp_number ??
      settings?.whatsapp_phone ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_whatsapp_number,
    instagramLink:
      settings?.digital_invoice_instagram_link ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_instagram_link,
    tiktokLink:
      settings?.digital_invoice_tiktok_link ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_tiktok_link,
    googleReviewLink:
      settings?.digital_invoice_google_review_link ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_google_review_link,
    mapLink:
      settings?.digital_invoice_map_link ??
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_map_link,
  }
}

export function normalizeEditableText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
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

export function normalizeEditableTextWithFallback(
  value: unknown,
  fallback: string
) {
  if (typeof value !== 'string') return fallback
  return value.trim()
}

export function normalizeSystemSettingsUpdatePayload(
  body: SystemSettingsUpdatePayload
) {
  return {
    logo_url: normalizeNullableText(body.logo_url),
    digital_invoice_brand_name: normalizeEditableTextWithFallback(
      body.digital_invoice_brand_name,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_name
    ),
    digital_invoice_branch_name: normalizeEditableTextWithFallback(
      body.digital_invoice_branch_name,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_branch_name
    ),
    digital_invoice_address_line_1: normalizeEditableTextWithFallback(
      body.digital_invoice_address_line_1,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_address_line_1
    ),
    digital_invoice_address_line_2: normalizeEditableTextWithFallback(
      body.digital_invoice_address_line_2,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_address_line_2
    ),
    digital_invoice_whatsapp_number: normalizeEditableTextWithFallback(
      body.digital_invoice_whatsapp_number,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_whatsapp_number
    ),
    digital_invoice_whatsapp_enabled:
      typeof body.digital_invoice_whatsapp_enabled === 'boolean'
        ? body.digital_invoice_whatsapp_enabled
        : SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_whatsapp_enabled,
    digital_invoice_google_review_link: normalizeEditableTextWithFallback(
      body.digital_invoice_google_review_link,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_google_review_link
    ),
    digital_invoice_google_review_enabled:
      typeof body.digital_invoice_google_review_enabled === 'boolean'
        ? body.digital_invoice_google_review_enabled
        : SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_google_review_enabled,
    digital_invoice_map_link: normalizeEditableTextWithFallback(
      body.digital_invoice_map_link,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_map_link
    ),
    digital_invoice_map_enabled:
      typeof body.digital_invoice_map_enabled === 'boolean'
        ? body.digital_invoice_map_enabled
        : SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_map_enabled,
    digital_invoice_note: normalizeEditableTextWithFallback(
      body.digital_invoice_note,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_note
    ),
    digital_invoice_brand_background_color: normalizeEditableTextWithFallback(
      body.digital_invoice_brand_background_color,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_background_color
    ),
    digital_invoice_brand_text_color: normalizeEditableTextWithFallback(
      body.digital_invoice_brand_text_color,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_brand_text_color
    ),
    digital_invoice_instagram_enabled:
      typeof body.digital_invoice_instagram_enabled === 'boolean'
        ? body.digital_invoice_instagram_enabled
        : SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_instagram_enabled,
    digital_invoice_instagram_link: normalizeEditableTextWithFallback(
      body.digital_invoice_instagram_link,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_instagram_link
    ),
    digital_invoice_tiktok_enabled:
      typeof body.digital_invoice_tiktok_enabled === 'boolean'
        ? body.digital_invoice_tiktok_enabled
        : SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_tiktok_enabled,
    digital_invoice_tiktok_link: normalizeEditableTextWithFallback(
      body.digital_invoice_tiktok_link,
      SYSTEM_SETTINGS_DEFAULT_VALUES.digital_invoice_tiktok_link
    ),
    thermal_invoice_brand_name: normalizeEditableTextWithFallback(
      body.thermal_invoice_brand_name,
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_brand_name
    ),
    thermal_invoice_branch_name: normalizeEditableTextWithFallback(
      body.thermal_invoice_branch_name,
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_branch_name
    ),
    thermal_invoice_paper_width:
      body.thermal_invoice_paper_width === '58mm' ? '58mm' : '80mm',
    thermal_invoice_show_customer_phone:
      typeof body.thermal_invoice_show_customer_phone === 'boolean'
        ? body.thermal_invoice_show_customer_phone
        : SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_customer_phone,
    thermal_invoice_show_payment_method:
      typeof body.thermal_invoice_show_payment_method === 'boolean'
        ? body.thermal_invoice_show_payment_method
        : SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_payment_method,
    thermal_invoice_show_note:
      typeof body.thermal_invoice_show_note === 'boolean'
        ? body.thermal_invoice_show_note
        : SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_note,
    thermal_invoice_note: normalizeEditableTextWithFallback(
      body.thermal_invoice_note,
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_note
    ),
    thermal_invoice_footer_message: normalizeEditableTextWithFallback(
      body.thermal_invoice_footer_message,
      SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_footer_message
    ),
    thermal_invoice_show_whatsapp:
      typeof body.thermal_invoice_show_whatsapp === 'boolean'
        ? body.thermal_invoice_show_whatsapp
        : SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_whatsapp,
    thermal_invoice_show_instagram:
      typeof body.thermal_invoice_show_instagram === 'boolean'
        ? body.thermal_invoice_show_instagram
        : SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_instagram,
    thermal_invoice_show_tiktok:
      typeof body.thermal_invoice_show_tiktok === 'boolean'
        ? body.thermal_invoice_show_tiktok
        : SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_tiktok,
    thermal_invoice_show_google_review:
      typeof body.thermal_invoice_show_google_review === 'boolean'
        ? body.thermal_invoice_show_google_review
        : SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_google_review,
    thermal_invoice_show_map:
      typeof body.thermal_invoice_show_map === 'boolean'
        ? body.thermal_invoice_show_map
        : SYSTEM_SETTINGS_DEFAULT_VALUES.thermal_invoice_show_map,
    whatsapp_provider: normalizeRequiredText(
      body.whatsapp_provider,
      SYSTEM_SETTINGS_DEFAULT_VALUES.whatsapp_provider
    ),
    whatsapp_phone: normalizeNullableText(body.whatsapp_phone),
    ultramsg_instance_id: normalizeNullableText(body.ultramsg_instance_id),
    ultramsg_token: normalizeNullableText(body.ultramsg_token),
    ultramsg_api_url: normalizeNullableText(body.ultramsg_api_url),
    whatsapp_order_ready_message_template: normalizeNullableText(
      body.whatsapp_order_ready_message_template
    ),
    whatsapp_order_delivered_message_template: normalizeNullableText(
      body.whatsapp_order_delivered_message_template
    ),
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
