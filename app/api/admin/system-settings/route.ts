import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import {
  normalizeSystemSettingsUpdatePayload,
  type SystemSettingsUpdateBody,
} from '@/lib/admin/settings'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

    const updatePayload = normalizeSystemSettingsUpdatePayload(body)

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

