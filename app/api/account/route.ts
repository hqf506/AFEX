import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'

type AccountPatchBody = {
  full_name?: unknown
  phone?: unknown
  contact_email?: unknown
}

function normalizeOptionalText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalizedValue = normalizeOptionalText(value)
  return normalizedValue || null
}

function normalizeNullableEmail(value: unknown) {
  const normalizedValue = normalizeOptionalText(value).toLowerCase()
  return normalizedValue || null
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  try {
    const { data: profile, error } = await auth.supabase
      .from('profiles')
      .select('id, username, full_name, phone, contact_email, role, is_active')
      .eq('id', auth.user.id)
      .single()

    if (error || !profile) {
      const response = jsonResponse(
        {
          error: 'تعذر تحميل بيانات الحساب',
          details: error?.message || 'لم يتم العثور على ملف المستخدم',
        },
        404
      )

      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      account: profile,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  try {
    const body = (await request.json()) as AccountPatchBody
    const fullName = normalizeOptionalText(body.full_name)
    const phone = normalizeNullableText(body.phone)
    const contactEmail = normalizeNullableEmail(body.contact_email)
    const updateData: {
      full_name?: string
      phone: string | null
      contact_email: string | null
      updated_at: string
    } = {
      phone,
      contact_email: contactEmail,
      updated_at: new Date().toISOString(),
    }

    if (fullName) {
      updateData.full_name = fullName
    }

    if (contactEmail) {
      let duplicateEmailQuery = auth.supabase
        .from('profiles')
        .select('id')
        .eq('contact_email', contactEmail)
        .neq('id', auth.user.id)
        .limit(1)

      if (auth.profile.tenant_id) {
        duplicateEmailQuery = duplicateEmailQuery.eq(
          'tenant_id',
          auth.profile.tenant_id
        )
      }

      const { data: duplicateProfile, error: duplicateEmailError } =
        await duplicateEmailQuery.maybeSingle()

      if (duplicateEmailError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من بريد التواصل',
            details: duplicateEmailError.message,
          },
          500
        )

        return withAuthCookies(auth.response, response)
      }

      if (duplicateProfile) {
        const response = jsonResponse(
          { error: 'البريد الإلكتروني مسجل بالفعل' },
          409
        )

        return withAuthCookies(auth.response, response)
      }
    }

    const { data: profile, error } = await auth.supabase
      .from('profiles')
      .update(updateData)
      .eq('id', auth.user.id)
      .select('id, username, full_name, phone, contact_email, role, is_active')
      .single()

    if (error || !profile) {
      const response = jsonResponse(
        {
          error: 'تعذر تحديث بيانات الحساب',
          details: error?.message || 'لم يتم العثور على ملف المستخدم',
        },
        400
      )

      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      account: profile,
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}
