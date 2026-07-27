import type { NextResponse } from 'next/server'
import { withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

export const ORDERS_FEATURE_DISABLED_MESSAGE =
  'ميزة الطلبات غير مفعلة من إعدادات النظام.'
export const INVOICES_FEATURE_DISABLED_MESSAGE =
  'ميزة الفواتير غير مفعلة من إعدادات النظام.'
export const USERS_FEATURE_DISABLED_MESSAGE =
  'ميزة إدارة المستخدمين غير مفعلة من إعدادات النظام.'

export const POS_FEATURE_DISABLED_MESSAGE =
  'نقطة البيع غير مفعلة لهذه المؤسسة. تواصل مع مدير النظام.'

export type FeatureToggleKey =
  | 'enable_orders'
  | 'enable_invoices'
  | 'enable_users'
  | 'enable_pos'

export async function getFeatureStates<
  const Keys extends readonly FeatureToggleKey[],
>(tenantId: string, keys: Keys) {
  let query = supabaseAdmin
    .from('system_settings')
    .select(keys.join(','))
    .limit(1)

  query = applyTenantFilter(query, tenantId)

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  const row = data as Partial<Record<FeatureToggleKey, boolean | null>> | null

  return Object.fromEntries(
    keys.map((key) => [key, row?.[key] !== false])
  ) as Record<Keys[number], boolean>
}

export async function isFeatureEnabled(
  tenantId: string,
  key: FeatureToggleKey
) {
  const states = await getFeatureStates(tenantId, [key] as const)
  return states[key]
}

export async function disabledFeatureResponse(
  authResponse: NextResponse,
  tenantId: string,
  key: FeatureToggleKey,
  message: string
) {
  if (await isFeatureEnabled(tenantId, key)) {
    return null
  }

  return withAuthCookies(
    authResponse,
    jsonResponse(
      {
        success: false,
        error: message,
        message,
      },
      403
    )
  )
}
