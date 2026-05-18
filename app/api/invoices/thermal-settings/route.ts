import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  resolveThermalInvoiceTemplateSettings,
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
          'digital_invoice_whatsapp_number',
          'digital_invoice_google_review_link',
          'digital_invoice_map_link',
          'digital_invoice_instagram_link',
          'digital_invoice_tiktok_link',
          'thermal_invoice_brand_name',
          'thermal_invoice_branch_name',
          'thermal_invoice_paper_width',
          'thermal_invoice_show_customer_phone',
          'thermal_invoice_show_payment_method',
          'thermal_invoice_show_note',
          'thermal_invoice_note',
          'thermal_invoice_footer_message',
          'thermal_invoice_show_whatsapp',
          'thermal_invoice_show_instagram',
          'thermal_invoice_show_tiktok',
          'thermal_invoice_show_google_review',
          'thermal_invoice_show_map',
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
            error: 'فشل تحميل إعدادات الفاتورة الحرارية',
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
        settings: resolveThermalInvoiceTemplateSettings(
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
          error: 'حدث خطأ غير متوقع أثناء تحميل إعدادات الفاتورة الحرارية',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      )
    )
  }
}
