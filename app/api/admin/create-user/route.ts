import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  normalizeAdminBranchId,
  requiresAssignedBranch,
  resolveManagedUserBranchId,
} from '@/lib/admin/branches'
import {
  hasValidAdminPasswordLength,
  isValidAdminPosPin,
  isValidAdminRole,
  normalizeAdminFullName,
} from '@/lib/admin/users'
import { type AppRole } from '@/lib/app-roles'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername, usernameToInternalEmail } from '@/lib/usernames'

type CreateUserBody = {
  username?: string
  password?: string
  full_name?: string
  contact_email?: string | null
  phone?: string | null
  pos_pin?: string
  role?: AppRole
  branch_id?: string | null
}

function normalizeOptionalText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      const response = jsonResponse(
        { error: 'ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø©' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const body = (await request.json()) as CreateUserBody

    const username = normalizeUsername(body.username || '')
    const password =
      typeof body.password === 'string' ? body.password.trim() : ''
    const fullName = normalizeAdminFullName(body.full_name)
    const contactEmail = normalizeOptionalText(body.contact_email).toLowerCase()
    const phone = normalizeOptionalText(body.phone)
    const posPin = normalizeOptionalText(body.pos_pin)
    const role: AppRole = body.role || 'employee'
    const requestedBranchId = normalizeAdminBranchId(body.branch_id)
    const resolvedBranchId = resolveManagedUserBranchId(
      auth.profile.scope_type,
      auth.profile.branch_id,
      requestedBranchId || null
    )

    if (!username) {
      const response = jsonResponse({ error: 'اسم المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      const response = jsonResponse(
        {
          error: 'اسم المستخدم غير صالح',
          details:
            'استخدم أحرف إنجليزية صغيرة أو أرقام أو . أو _ أو - فقط',
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!hasValidAdminPasswordLength(password)) {
      const response = jsonResponse(
        { error: 'كلمة المرور يجب أن تكون 6 أحرف أو أكثر' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!isValidAdminPosPin(posPin)) {
      const response = jsonResponse(
        { error: 'POS PIN يجب أن يتكون من 4 أرقام' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!isValidAdminRole(role)) {
      const response = jsonResponse({ error: 'الصلاحية غير صالحة' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (requiresAssignedBranch(role) && !resolvedBranchId) {
      const response = jsonResponse(
        { error: 'يجب تعيين فرع للمستخدمين غير الأدمن' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (resolvedBranchId) {
      const { data: existingBranch, error: existingBranchError } =
        await supabaseAdmin
          .from('branches')
          .select('id')
          .eq('id', resolvedBranchId)
          .eq('tenant_id', tenantId)
          .maybeSingle()

      if (existingBranchError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من الفرع',
            details: existingBranchError.message,
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (!existingBranch) {
        const response = jsonResponse(
          { error: 'الفرع المحدد غير موجود' },
          404
        )
        return withAuthCookies(auth.response, response)
      }
    }

    const internalEmail = usernameToInternalEmail(username)

    const { data: existingProfile, error: existingProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, username')
        .eq('username', username)
        .maybeSingle()

    if (existingProfileError) {
      const response = jsonResponse(
        {
          error: 'فشل التحقق من اسم المستخدم في profiles',
          details: existingProfileError.message,
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (existingProfile) {
      const response = jsonResponse(
        {
          error: 'اسم المستخدم مستخدم بالفعل',
          details: `username "${username}" موجود مسبقًا`,
        },
        409
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: usersData, error: listUsersError } =
      await supabaseAdmin.auth.admin.listUsers()

    if (listUsersError) {
      const response = jsonResponse(
        {
          error: 'فشل قراءة مستخدمي auth',
          details: listUsersError.message,
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    const existingAuthUser = usersData.users.find(
      (user) => user.email?.toLowerCase() === internalEmail.toLowerCase()
    )

    if (existingAuthUser) {
      const response = jsonResponse(
        {
          error: 'المستخدم موجود مسبقًا في auth',
          details: `email "${internalEmail}" موجود مسبقًا في auth.users`,
        },
        409
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: createdUser, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          full_name: fullName || username,
          role,
        },
      })

    if (createAuthError || !createdUser.user) {
      const response = jsonResponse(
        {
          error: 'فشل إنشاء المستخدم في auth',
          details: createAuthError?.message || 'Unknown auth error',
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const userId = createdUser.user.id

    const { error: profileInsertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        username,
        full_name: fullName || username,
        role,
        is_active: true,
        branch_id: resolvedBranchId || null,
        tenant_id: tenantId,
      })

    if (profileInsertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)

      const response = jsonResponse(
        {
          error: 'تم إنشاء المستخدم في auth لكن فشل حفظه في profiles',
          details: profileInsertError.message,
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: profileContactUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        contact_email: contactEmail || null,
        phone: phone || null,
        pos_pin_hash: null,
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (profileContactUpdateError) {
      await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', userId)
        .eq('tenant_id', tenantId)
      await supabaseAdmin.auth.admin.deleteUser(userId)

      const response = jsonResponse(
        {
          error: 'تعذر حفظ بيانات التواصل للمستخدم',
          details: profileContactUpdateError.message,
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: setPinError } = await supabaseAdmin.rpc('set_pos_pin', {
      user_id: userId,
      raw_pin: posPin,
    })

    if (setPinError) {
      await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', userId)
        .eq('tenant_id', tenantId)
      await supabaseAdmin.auth.admin.deleteUser(userId)

      const response = jsonResponse(
        {
          error: 'تعذر حفظ POS PIN بشكل آمن',
          details: setPinError.message,
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const response = jsonResponse({
      success: true,
      message: 'تم إنشاء المستخدم بنجاح',
      user: {
        id: userId,
        username,
        full_name: fullName || username,
        contact_email: contactEmail || null,
        phone: phone || null,
        role,
        email: internalEmail,
        branch_id: resolvedBranchId || null,
      },
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
