import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
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
      const response = jsonResponse(
        {
          error: 'فشل تحميل إعدادات النظام',
          details: error.message,
        }, 500)

      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      settings: data || null,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع أثناء تحميل الإعدادات',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, 500)

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
      const response = jsonResponse(
        {
          error: 'فشل التحقق من سجل الإعدادات الحالي',
          details: existingError.message,
        }, 500)

      return withAuthCookies(auth.response, response)
    }

    if (!existingSettings?.id) {
      const response = jsonResponse(
        {
          error: 'لم يتم العثور على سجل إعدادات النظام',
        }, 404)

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
      const response = jsonResponse(
        {
          error: 'فشل حفظ إعدادات النظام',
          details: error.message,
        }, 400)

      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      message: 'تم حفظ إعدادات النظام بنجاح',
      settings: data,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع أثناء حفظ الإعدادات',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, 500)

    return withAuthCookies(auth.response, response)
  }
}

