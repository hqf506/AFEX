import { NextRequest } from 'next/server'
import { after } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import {
  disabledFeatureResponse,
  USERS_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
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
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername, usernameToInternalEmail } from '@/lib/usernames'
import { sendWelcomeEmail } from '@/lib/auth/email'

type CreateUserBody = {
  username?: string
  password?: string
  password_confirmation?: string
  confirm_password?: string
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

function isPosRole(role: AppRole) {
  return role === 'cashier'
}

function isEmailLoginRole(role: AppRole) {
  return role === 'admin' || role === 'manager' || role === 'employee'
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function getAvailableUsernameSuggestions(username: string) {
  const year = new Date().getFullYear()
  const baseCandidates = [`${username}1`, `${username}_${year}`, `${username}_afex`]
  const suggestions: string[] = []
  let attempt = 0

  while (suggestions.length < 3 && attempt < 12) {
    const candidates = baseCandidates
      .map((candidate) => (attempt === 0 ? candidate : `${candidate}${attempt + 1}`))
      .filter((candidate) => !suggestions.includes(candidate))

    for (const candidate of candidates) {
      const { data: existingProfile, error } = await supabaseAdmin
        .from('profiles')
        .select('username')
        .ilike('username', candidate)
        .limit(1)
        .maybeSingle()

      if (error) {
        throw error
      }

      const { data: existingPosProfile, error: existingPosProfileError } =
        await supabaseAdmin
          .from('pos_profiles')
          .select('username')
          .ilike('username', candidate)
          .limit(1)
          .maybeSingle()

      if (existingPosProfileError) {
        throw existingPosProfileError
      }

      if (!existingProfile && !existingPosProfile && suggestions.length < 3) {
        suggestions.push(candidate)
      }
    }

    attempt += 1
  }

  return suggestions
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
        { error: 'تعذر تحديد نطاق المنشأة' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const usersDisabledResponse = await disabledFeatureResponse(
      auth.response,
      tenantId,
      'enable_users',
      USERS_FEATURE_DISABLED_MESSAGE
    )

    if (usersDisabledResponse) {
      return usersDisabledResponse
    }

    const body = (await request.json()) as CreateUserBody

    const username = normalizeUsername(body.username || '')
    const password =
      typeof body.password === 'string' ? body.password.trim() : ''
    const passwordConfirmation =
      typeof body.password_confirmation === 'string'
        ? body.password_confirmation.trim()
        : typeof body.confirm_password === 'string'
          ? body.confirm_password.trim()
          : ''
    const fullName = normalizeAdminFullName(body.full_name)
    const contactEmail = normalizeOptionalText(body.contact_email).toLowerCase()
    const phone = normalizeOptionalText(body.phone)
    const posPin = normalizeOptionalText(body.pos_pin)
    const role = body.role
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

    if (!role) {
      const response = jsonResponse(
        { error: 'يجب اختيار الوظيفة والفرع' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (isEmailLoginRole(role) && !contactEmail) {
      const response = jsonResponse(
        { error: 'البريد الإلكتروني مطلوب لحسابات المدير والإداري' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (isEmailLoginRole(role) && !isValidEmail(contactEmail)) {
      const response = jsonResponse(
        { error: 'صيغة البريد الإلكتروني غير صحيحة' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (isEmailLoginRole(role) && !hasValidAdminPasswordLength(password)) {
      const response = jsonResponse(
        { error: 'كلمة المرور يجب أن تكون 6 أحرف أو أكثر' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (isEmailLoginRole(role) && !passwordConfirmation) {
      const response = jsonResponse(
        { error: 'تأكيد كلمة مرور لوحة التحكم مطلوب' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (isEmailLoginRole(role) && password !== passwordConfirmation) {
      const response = jsonResponse(
        { error: 'تأكيد كلمة مرور لوحة التحكم غير مطابق' },
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
            ...safeErrorDetails(
              existingBranchError,
              'تعذر التحقق من الفرع'
            ),
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

    const loginEmail = isEmailLoginRole(role)
      ? contactEmail
      : usernameToInternalEmail(username)

    if (isEmailLoginRole(role)) {
      const { data: existingEmailProfile, error: existingEmailProfileError } =
        await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('contact_email', contactEmail)
          .limit(1)
          .maybeSingle()

      if (existingEmailProfileError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من البريد الإلكتروني',
            ...safeErrorDetails(
              existingEmailProfileError,
              'تعذر التحقق من البريد الإلكتروني'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (existingEmailProfile) {
        const response = jsonResponse(
          { error: 'البريد الإلكتروني مستخدم بالفعل' },
          409
        )
        return withAuthCookies(auth.response, response)
      }
    }

    const { data: existingProfile, error: existingProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select('id, username')
        .ilike('username', username)
        .limit(1)
        .maybeSingle()

    if (existingProfileError) {
      const response = jsonResponse(
        {
          error: 'فشل التحقق من اسم المستخدم في profiles',
          ...safeErrorDetails(
            existingProfileError,
            'تعذر التحقق من اسم المستخدم'
          ),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (existingProfile) {
      const suggestions = await getAvailableUsernameSuggestions(username)
      const response = jsonResponse(
        {
          error: 'اسم المستخدم مستخدم بالفعل',
          details: 'اسم المستخدم موجود مسبقًا',
          suggestions,
        },
        409
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: existingPosProfile, error: existingPosProfileError } =
      await supabaseAdmin
        .from('pos_profiles')
        .select('id, username')
        .eq('tenant_id', tenantId)
        .ilike('username', username)
        .limit(1)
        .maybeSingle()

    if (existingPosProfileError) {
      const response = jsonResponse(
        {
          error: 'فشل التحقق من اسم المستخدم في pos_profiles',
          ...safeErrorDetails(
            existingPosProfileError,
            'تعذر التحقق من اسم المستخدم'
          ),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (existingPosProfile) {
      const suggestions = await getAvailableUsernameSuggestions(username)
      const response = jsonResponse(
        {
          error: 'اسم المستخدم مستخدم بالفعل',
          details: 'اسم المستخدم موجود مسبقًا',
          suggestions,
        },
        409
      )
      return withAuthCookies(auth.response, response)
    }

    if (isPosRole(role)) {
      const { data: posPinHash, error: hashPinError } = await supabaseAdmin.rpc(
        'hash_pos_pin',
        {
          raw_pin: posPin,
        }
      )

      if (hashPinError || typeof posPinHash !== 'string' || !posPinHash) {
        const response = jsonResponse(
          {
            error: 'تعذر حفظ POS PIN بشكل آمن',
            ...safeErrorDetails(
              hashPinError || 'Unknown POS PIN hash error',
              'تعذر حفظ POS PIN بشكل آمن'
            ),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      const { data: createdPosProfile, error: createPosProfileError } =
        await supabaseAdmin
          .from('pos_profiles')
          .insert({
            username,
            full_name: fullName || username,
            phone: phone || null,
            role,
            is_active: true,
            branch_id: resolvedBranchId,
            tenant_id: tenantId,
            pos_pin_hash: posPinHash,
            created_by: auth.user.id,
          })
          .select('id, username, full_name, phone, role, branch_id')
          .single()

      if (createPosProfileError || !createdPosProfile) {
        const response = jsonResponse(
          {
            error: 'تعذر إنشاء مستخدم POS',
            ...safeErrorDetails(
              createPosProfileError || 'Unknown POS profile error',
              'تعذر إنشاء مستخدم POS'
            ),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      await writeAuditLog({
        auth,
        request,
        action: 'user.created',
        entityType: 'pos_profile',
        entityId: createdPosProfile.id,
        branchId: resolvedBranchId || null,
        metadata: {
          role,
          branch_id: resolvedBranchId || null,
          username,
          has_pos_pin: Boolean(posPin),
        },
      })

      const response = jsonResponse({
        success: true,
        message: 'تم إنشاء المستخدم بنجاح',
        user: {
          id: createdPosProfile.id,
          username,
          full_name: fullName || username,
          contact_email: null,
          phone: phone || null,
          role,
          email: null,
          branch_id: resolvedBranchId || null,
        },
      })

      return withAuthCookies(auth.response, response)
    }

    const { data: usersData, error: listUsersError } =
      await supabaseAdmin.auth.admin.listUsers()

    if (listUsersError) {
      const response = jsonResponse(
        {
          error: 'فشل قراءة مستخدمي auth',
          ...safeErrorDetails(listUsersError, 'تعذر قراءة مستخدمي auth'),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    const existingAuthUser = usersData.users.find(
      (user) => user.email?.toLowerCase() === loginEmail.toLowerCase()
    )

    if (existingAuthUser) {
      const response = jsonResponse(
        {
          error: 'المستخدم موجود مسبقًا في auth',
          details: 'المستخدم موجود مسبقًا في auth',
        },
        409
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: createdUser, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email: loginEmail,
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
          ...safeErrorDetails(
            createAuthError?.message || 'Unknown auth error',
            'تعذر إنشاء المستخدم في auth'
          ),
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
        contact_email: contactEmail,
        phone: phone || null,
      })

    if (profileInsertError) {
      await supabaseAdmin.auth.admin.deleteUser(userId)

      if (
        profileInsertError.code === '23505' ||
        profileInsertError.message.toLowerCase().includes('username')
      ) {
        const suggestions = await getAvailableUsernameSuggestions(username)
        const response = jsonResponse(
          {
            error: 'اسم المستخدم مستخدم بالفعل',
            ...safeErrorDetails(
              profileInsertError,
              'اسم المستخدم مستخدم بالفعل'
            ),
            suggestions,
          },
          409
        )
        return withAuthCookies(auth.response, response)
      }

      const response = jsonResponse(
        {
          error: 'تم إنشاء المستخدم في auth لكن فشل حفظه في profiles',
          ...safeErrorDetails(
            profileInsertError,
            'تعذر حفظ ملف المستخدم'
          ),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { error: profileContactUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        contact_email: contactEmail,
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
          ...safeErrorDetails(
            profileContactUpdateError,
            'تعذر حفظ بيانات التواصل'
          ),
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
          ...safeErrorDetails(setPinError, 'تعذر حفظ POS PIN بشكل آمن'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (resolvedBranchId) {
      const { data: posPinHash, error: hashPinError } = await supabaseAdmin.rpc(
        'hash_pos_pin',
        {
          raw_pin: posPin,
        }
      )

      if (hashPinError || typeof posPinHash !== 'string' || !posPinHash) {
        await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', userId)
          .eq('tenant_id', tenantId)
        await supabaseAdmin.auth.admin.deleteUser(userId)

        const response = jsonResponse(
          {
            error: 'تعذر حفظ POS PIN بشكل آمن',
            ...safeErrorDetails(
              hashPinError || 'Unknown POS PIN hash error',
              'تعذر حفظ POS PIN بشكل آمن'
            ),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      const { error: upsertPosProfileError } = await supabaseAdmin
        .from('pos_profiles')
        .upsert(
          {
            id: userId,
            username,
            full_name: fullName || username,
            phone: phone || null,
            role,
            is_active: true,
            branch_id: resolvedBranchId,
            tenant_id: tenantId,
            pos_pin_hash: posPinHash,
            created_by: auth.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )

      if (upsertPosProfileError) {
        await supabaseAdmin
          .from('profiles')
          .delete()
          .eq('id', userId)
          .eq('tenant_id', tenantId)
        await supabaseAdmin.auth.admin.deleteUser(userId)

        const response = jsonResponse(
          {
            error: 'تعذر حفظ ملف POS للمستخدم',
            ...safeErrorDetails(
              upsertPosProfileError,
              'تعذر حفظ ملف POS للمستخدم'
            ),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }
    }

    await writeAuditLog({
      auth,
      request,
      action: 'user.created',
      entityType: 'profile',
      entityId: userId,
      branchId: resolvedBranchId || null,
      metadata: {
        role,
        branch_id: resolvedBranchId || null,
        username,
        has_pos_pin: Boolean(posPin),
      },
    })

    if (isEmailLoginRole(role)) {
      after(async () => {
        await sendWelcomeEmail({
          accountId: userId,
          recipient: loginEmail,
          displayName: fullName || username,
          role,
        })
      })
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
        email: loginEmail,
        branch_id: resolvedBranchId || null,
      },
    })

    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر إنشاء المستخدم'),
      },
      500
    )

    return withAuthCookies(auth.response, response)
  }
}

