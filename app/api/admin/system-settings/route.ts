import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

type SystemSettingsUpdateBody = {
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

function normalizeNullableText(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizeRequiredText(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed === '' ? fallback : trimmed
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('*')
      .limit(1)
      .maybeSingle()

    if (error) {
      const response = NextResponse.json(
        {
          error: 'فشل تحميل إعدادات النظام',
          details: error.message,
        },
        { status: 500 }
      )

      return withAuthCookies(auth.response, response)
    }

    const response = NextResponse.json({
      success: true,
      settings: data || null,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = NextResponse.json(
      {
        error: 'حدث خطأ غير متوقع أثناء تحميل الإعدادات',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )

    return withAuthCookies(auth.response, response)
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = (await request.json()) as SystemSettingsUpdateBody

    const { data: existingSettings, error: existingError } = await supabaseAdmin
      .from('system_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (existingError) {
      const response = NextResponse.json(
        {
          error: 'فشل التحقق من سجل الإعدادات الحالي',
          details: existingError.message,
        },
        { status: 500 }
      )

      return withAuthCookies(auth.response, response)
    }

    if (!existingSettings?.id) {
      const response = NextResponse.json(
        {
          error: 'لم يتم العثور على سجل إعدادات النظام',
        },
        { status: 404 }
      )

      return withAuthCookies(auth.response, response)
    }

    const updatePayload = {
      store_name: normalizeRequiredText(body.store_name, 'Leather Fix'),
      branch_name: normalizeRequiredText(body.branch_name, 'الفرع الرئيسي'),
      logo_url: normalizeNullableText(body.logo_url),
      whatsapp_provider: normalizeRequiredText(
        body.whatsapp_provider,
        'ultramsg'
      ),
      whatsapp_phone: normalizeNullableText(body.whatsapp_phone),
      ultramsg_instance_id: normalizeNullableText(body.ultramsg_instance_id),
      ultramsg_token: normalizeNullableText(body.ultramsg_token),
      ultramsg_api_url: normalizeNullableText(body.ultramsg_api_url),
      enable_whatsapp:
        typeof body.enable_whatsapp === 'boolean' ? body.enable_whatsapp : true,
      enable_printing:
        typeof body.enable_printing === 'boolean' ? body.enable_printing : true,
      enable_pos: typeof body.enable_pos === 'boolean' ? body.enable_pos : true,
      enable_invoices:
        typeof body.enable_invoices === 'boolean' ? body.enable_invoices : true,
      enable_orders:
        typeof body.enable_orders === 'boolean' ? body.enable_orders : true,
      enable_reports:
        typeof body.enable_reports === 'boolean' ? body.enable_reports : true,
      enable_users:
        typeof body.enable_users === 'boolean' ? body.enable_users : true,
    }

    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .update(updatePayload)
      .eq('id', existingSettings.id)
      .select('*')
      .single()

    if (error) {
      const response = NextResponse.json(
        {
          error: 'فشل حفظ إعدادات النظام',
          details: error.message,
        },
        { status: 400 }
      )

      return withAuthCookies(auth.response, response)
    }

    const response = NextResponse.json({
      success: true,
      message: 'تم حفظ إعدادات النظام بنجاح',
      settings: data,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = NextResponse.json(
      {
        error: 'حدث خطأ غير متوقع أثناء حفظ الإعدادات',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )

    return withAuthCookies(auth.response, response)
  }
}