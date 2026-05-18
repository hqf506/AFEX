import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  resolveDigitalInvoiceTemplateSettings,
  type SystemSettings,
} from '@/lib/admin/settings'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { applyTenantFilter } from '@/lib/tenant-filter'

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            success: false,
            error: 'Tenant context is required',
          },
          403
        )
      )
    }

    let query = supabaseAdmin
      .from('system_settings')
      .select(
        [
          'store_name',
          'branch_name',
          'whatsapp_phone',
          'digital_invoice_brand_name',
          'digital_invoice_branch_name',
          'digital_invoice_address_line_1',
          'digital_invoice_address_line_2',
          'digital_invoice_whatsapp_number',
          'digital_invoice_whatsapp_enabled',
          'digital_invoice_google_review_link',
          'digital_invoice_google_review_enabled',
          'digital_invoice_map_link',
          'digital_invoice_map_enabled',
          'digital_invoice_instagram_enabled',
          'digital_invoice_instagram_link',
          'digital_invoice_tiktok_enabled',
          'digital_invoice_tiktok_link',
          'digital_invoice_note',
          'digital_invoice_brand_background_color',
          'digital_invoice_brand_text_color',
        ].join(', ')
      )
      .limit(1)

    query = applyTenantFilter(query, tenantId)

    const { data, error } = await query
      .maybeSingle()

    if (error) {
      return withAuthCookies(
        auth.response,
        jsonResponse(
          {
            success: false,
            error: 'فشل تحميل إعدادات الفاتورة الرقمية',
            details: error.message,
          },
          500
        )
      )
    }

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        settings: resolveDigitalInvoiceTemplateSettings(
          (data as Partial<SystemSettings> | null) ?? null
        ),
      })
    )
  } catch (error) {
    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          success: false,
          error: 'حدث خطأ غير متوقع أثناء تحميل إعدادات الفاتورة الرقمية',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}
