import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import { writeAuditLog } from '@/lib/audit-log'
import {
  disabledFeatureResponse,
  USERS_FEATURE_DISABLED_MESSAGE,
} from '@/lib/feature-guards'
import {
  canManageBranchScopedTarget,
  requiresAssignedBranch,
} from '@/lib/admin/branches'
import {
  hasValidAdminPasswordLength,
  isValidAdminRole,
  normalizeAdminFullName,
  normalizeAdminUserId,
} from '@/lib/admin/users'
import { type AppRole } from '@/lib/app-roles'
import { type AuthScopeType } from '@/lib/auth-profile'
import { safeErrorDetails } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type UpdatePosUserBody = {
  userId?: string
  full_name?: string | null
  username?: string | null
  contact_email?: string | null
  admin_password?: string | null
  admin_password_confirmation?: string | null
  password?: string | null
  password_confirmation?: string | null
  confirm_password?: string | null
  pos_pin?: string | null
  role?: AppRole
  branch_id?: string | null
}

type ExistingProfile = {
  id: string
  username: string | null
  full_name: string | null
  phone: string | null
  role: AppRole
  is_active: boolean | null
  branch_id: string | null
  contact_email: string | null
  pos_pin_hash: string | null
}

type ExistingPosProfile = {
  id: string
  username: string | null
  full_name: string | null
  phone: string | null
  role: AppRole
  is_active: boolean | null
  branch_id: string | null
  pos_pin_hash: string | null
  pos_pin_plain: string | null
}

function normalizeUsername(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBranchId(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeOptionalPassword(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalPosPin(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isEmailLoginRole(role: AppRole) {
  return role === 'admin' || role === 'manager' || role === 'employee'
}

function isFullAdminRole(role: AppRole) {
  return role === 'admin' || role === 'manager'
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidPosPin(value: string) {
  return /^[0-9]{4}$/.test(value)
}

function generateInternalPosUsername() {
  const randomPart = Math.random().toString(36).slice(2, 8)
  return `pos_${Date.now().toString(36)}_${randomPart}`
}

async function hashPosPin(rawPin: string) {
  const { data: pinHash, error: pinHashError } = await supabaseAdmin.rpc(
    'hash_pos_pin',
    { raw_pin: rawPin }
  )

  if (pinHashError || typeof pinHash !== 'string') {
    throw pinHashError || new Error('Failed to hash POS PIN')
  }

  return pinHash
}

async function assertBranchAccess({
  authBranchId,
  authScopeType,
  branchId,
  tenantId,
}: {
  authBranchId: string | null
  authScopeType: AuthScopeType
  branchId: string | null
  tenantId: string
}) {
  if (!branchId) return null

  const { data: branch, error: branchError } = await supabaseAdmin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (branchError) {
    return jsonResponse(
      {
        error: 'تعذر التحقق من الفرع',
        ...safeErrorDetails(branchError, 'تعذر التحقق من الفرع'),
      },
      500
    )
  }

  if (!branch) {
    return jsonResponse({ error: 'الفرع المحدد غير موجود' }, 404)
  }

  if (!canManageBranchScopedTarget(authScopeType, authBranchId, branchId)) {
    return jsonResponse(
      { error: 'لا تملك صلاحية نقل المستخدم إلى هذا الفرع' },
      403
    )
  }

  return null
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

    const body = (await request.json()) as UpdatePosUserBody
    const userId = normalizeAdminUserId(body.userId)
    const fullName = normalizeAdminFullName(body.full_name)
    const requestedUsername = normalizeUsername(body.username)
    const role = body.role
    const branchId = normalizeBranchId(body.branch_id) || null
    const contactEmail = normalizeOptionalEmail(body.contact_email)
    const adminPassword = normalizeOptionalPassword(
      body.admin_password ?? body.password
    )
    const adminPasswordConfirmation = normalizeOptionalPassword(
      body.admin_password_confirmation ??
        body.password_confirmation ??
        body.confirm_password
    )
    const posPin = normalizeOptionalPosPin(body.pos_pin)

    if (!userId) {
      const response = jsonResponse({ error: 'معرف المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!fullName) {
      const response = jsonResponse({ error: 'الاسم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (!role || !isValidAdminRole(role)) {
      const response = jsonResponse({ error: 'الوظيفة غير صالحة' }, 400)
      return withAuthCookies(auth.response, response)
    }

    if (posPin && !isValidPosPin(posPin)) {
      const response = jsonResponse(
        { error: 'POS PIN يجب أن يتكون من 4 أرقام' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    const { data: existingProfile, error: existingProfileError } =
      await supabaseAdmin
        .from('profiles')
        .select(
          'id, username, full_name, phone, role, is_active, branch_id, contact_email, pos_pin_hash'
        )
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle<ExistingProfile>()

    if (existingProfileError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من مستخدم لوحة التحكم',
          ...safeErrorDetails(
            existingProfileError,
            'تعذر التحقق من مستخدم لوحة التحكم'
          ),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (existingProfile) {
      const { data: linkedPosProfile, error: linkedPosProfileError } =
        await supabaseAdmin
          .from('pos_profiles')
          .select('id, username, full_name, phone, role, is_active, branch_id, pos_pin_hash, pos_pin_plain')
          .eq('id', userId)
          .eq('tenant_id', tenantId)
          .maybeSingle<ExistingPosProfile>()

      if (linkedPosProfileError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من POS PIN للمستخدم',
            ...safeErrorDetails(
              linkedPosProfileError,
              'تعذر التحقق من POS PIN للمستخدم'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      const hasExistingPosPin = Boolean(
        existingProfile.pos_pin_hash || linkedPosProfile?.pos_pin_hash
      )

      if (!hasExistingPosPin && !posPin) {
        const response = jsonResponse(
          { error: 'POS PIN مطلوب لهذا المستخدم' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (role === 'cashier') {
        const currentBranchId =
          typeof existingProfile.branch_id === 'string'
            ? existingProfile.branch_id
            : null

        if (
          !canManageBranchScopedTarget(
            auth.profile.scope_type,
            auth.profile.branch_id,
            currentBranchId
          )
        ) {
          const response = jsonResponse(
            { error: 'لا تملك صلاحية تعديل هذا المستخدم' },
            403
          )
          return withAuthCookies(auth.response, response)
        }

        if (!branchId) {
          const response = jsonResponse({ error: 'يجب اختيار الفرع' }, 400)
          return withAuthCookies(auth.response, response)
        }

        const branchAccessResponse = await assertBranchAccess({
          authBranchId: auth.profile.branch_id,
          authScopeType: auth.profile.scope_type,
          branchId,
          tenantId,
        })

        if (branchAccessResponse) {
          return withAuthCookies(auth.response, branchAccessResponse)
        }

        const username =
          requestedUsername || existingProfile.username || generateInternalPosUsername()

        if (!username) {
          const response = jsonResponse(
            { error: 'اسم المستخدم مطلوب لمستخدم POS' },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        const { data: profileUsernameConflict, error: profileUsernameError } =
          await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('tenant_id', tenantId)
            .ilike('username', username)
            .neq('id', userId)
            .limit(1)
            .maybeSingle()

        if (profileUsernameError) {
          const response = jsonResponse(
            {
              error: 'تعذر التحقق من اسم المستخدم',
              ...safeErrorDetails(
                profileUsernameError,
                'تعذر التحقق من اسم المستخدم'
              ),
            },
            500
          )
          return withAuthCookies(auth.response, response)
        }

        const { data: posUsernameConflict, error: posUsernameError } =
          await supabaseAdmin
            .from('pos_profiles')
            .select('id')
            .eq('tenant_id', tenantId)
            .ilike('username', username)
            .neq('id', userId)
            .limit(1)
            .maybeSingle()

        if (posUsernameError) {
          const response = jsonResponse(
            {
              error: 'تعذر التحقق من اسم المستخدم',
              ...safeErrorDetails(
                posUsernameError,
                'تعذر التحقق من اسم المستخدم'
              ),
            },
            500
          )
          return withAuthCookies(auth.response, response)
        }

        if (profileUsernameConflict || posUsernameConflict) {
          const response = jsonResponse(
            { error: 'اسم المستخدم مستخدم بالفعل داخل نفس المنشأة' },
            409
          )
          return withAuthCookies(auth.response, response)
        }

        const nextPosPinHash = posPin
          ? await hashPosPin(posPin)
          : existingProfile.pos_pin_hash || linkedPosProfile?.pos_pin_hash || null
        const nowIso = new Date().toISOString()

        const { error: upsertPosProfileError } = await supabaseAdmin
          .from('pos_profiles')
          .upsert(
            {
              id: userId,
              tenant_id: tenantId,
              branch_id: branchId,
              username,
              full_name: fullName,
              phone: existingProfile.phone || null,
              pos_pin_hash: nextPosPinHash,
              pos_pin_plain: posPin || linkedPosProfile?.pos_pin_plain || null,
              role: 'cashier',
              is_active: existingProfile.is_active ?? true,
              created_by: auth.user.id,
              updated_at: nowIso,
            },
            { onConflict: 'id' }
          )

        if (upsertPosProfileError) {
          const response = jsonResponse(
            {
              error: 'تعذر تحويل المستخدم إلى أمين صندوق POS',
              ...safeErrorDetails(
                upsertPosProfileError,
                'تعذر تحويل المستخدم إلى أمين صندوق POS'
              ),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        const { error: updateProfileError } = await supabaseAdmin
          .from('profiles')
          .update({
            full_name: fullName,
            username,
            contact_email: null,
            role: 'cashier',
            branch_id: branchId,
            updated_at: nowIso,
          })
          .eq('id', userId)
          .eq('tenant_id', tenantId)

        if (updateProfileError) {
          const response = jsonResponse(
            {
              error: 'تعذر تحديث حساب المستخدم بعد التحويل إلى cashier',
              ...safeErrorDetails(
                updateProfileError,
                'تعذر تحديث حساب المستخدم بعد التحويل إلى cashier'
              ),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        const { error: authUpdateError } =
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
              username,
              full_name: fullName,
              role: 'cashier',
            },
          })

        if (authUpdateError) {
          const response = jsonResponse(
            {
              error: 'تم التحويل إلى cashier لكن تعذر تحديث بيانات auth',
              ...safeErrorDetails(
                authUpdateError,
                'تعذر تحديث بيانات auth'
              ),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        await writeAuditLog({
          auth,
          request,
          action: 'user.profile_converted_to_pos_cashier',
          entityType: 'pos_profile',
          entityId: userId,
          branchId,
          metadata: {
            old_username: existingProfile.username,
            new_username: username,
            old_full_name: existingProfile.full_name,
            new_full_name: fullName,
            old_role: existingProfile.role,
            new_role: 'cashier',
            old_branch_id: currentBranchId,
            new_branch_id: branchId,
          },
        })

        const response = jsonResponse({ success: true })
        return withAuthCookies(auth.response, response)
      }

      if (!isEmailLoginRole(role)) {
        const response = jsonResponse(
          { error: 'حسابات لوحة التحكم يجب أن تكون مدير أو إداري' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (!contactEmail) {
        const response = jsonResponse(
          { error: 'البريد الإلكتروني مطلوب لحسابات المدير والإداري' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (!isValidEmail(contactEmail)) {
        const response = jsonResponse(
          { error: 'صيغة البريد الإلكتروني غير صحيحة' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (adminPassword && !hasValidAdminPasswordLength(adminPassword)) {
        const response = jsonResponse(
          { error: 'كلمة مرور لوحة التحكم يجب أن تكون 6 أحرف أو أكثر' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (adminPassword && !adminPasswordConfirmation) {
        const response = jsonResponse(
          { error: 'تأكيد كلمة مرور لوحة التحكم مطلوب' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (adminPassword && adminPassword !== adminPasswordConfirmation) {
        const response = jsonResponse(
          { error: 'تأكيد كلمة مرور لوحة التحكم غير مطابق' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (requiresAssignedBranch(role) && !branchId) {
        const response = jsonResponse(
          { error: 'يجب اختيار فرع لهذا المستخدم' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      const currentBranchId =
        typeof existingProfile.branch_id === 'string'
          ? existingProfile.branch_id
          : null

      if (
        !canManageBranchScopedTarget(
          auth.profile.scope_type,
          auth.profile.branch_id,
          currentBranchId
        )
      ) {
        const response = jsonResponse(
          { error: 'لا تملك صلاحية تعديل هذا المستخدم' },
          403
        )
        return withAuthCookies(auth.response, response)
      }

      const branchAccessResponse = await assertBranchAccess({
        authBranchId: auth.profile.branch_id,
        authScopeType: auth.profile.scope_type,
        branchId,
        tenantId,
      })

      if (branchAccessResponse) {
        return withAuthCookies(auth.response, branchAccessResponse)
      }

      const username = requestedUsername || existingProfile.username || ''

      if (!username) {
        const response = jsonResponse({ error: 'اسم المستخدم مطلوب' }, 400)
        return withAuthCookies(auth.response, response)
      }

      const { data: profileUsernameConflict, error: profileUsernameError } =
        await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('username', username)
          .neq('id', userId)
          .limit(1)
          .maybeSingle()

      if (profileUsernameError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من اسم المستخدم',
            ...safeErrorDetails(
              profileUsernameError,
              'تعذر التحقق من اسم المستخدم'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      const { data: posUsernameConflict, error: posUsernameError } =
        await supabaseAdmin
          .from('pos_profiles')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('username', username)
          .neq('id', userId)
          .limit(1)
          .maybeSingle()

      if (posUsernameError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من اسم المستخدم',
            ...safeErrorDetails(
              posUsernameError,
              'تعذر التحقق من اسم المستخدم'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (profileUsernameConflict || posUsernameConflict) {
        const response = jsonResponse(
          { error: 'اسم المستخدم مستخدم بالفعل داخل نفس المنشأة' },
          409
        )
        return withAuthCookies(auth.response, response)
      }

      const { data: emailProfileConflict, error: emailProfileConflictError } =
        await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('contact_email', contactEmail)
          .neq('id', userId)
          .limit(1)
          .maybeSingle()

      if (emailProfileConflictError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من البريد الإلكتروني',
            ...safeErrorDetails(
              emailProfileConflictError,
              'تعذر التحقق من البريد الإلكتروني'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (emailProfileConflict) {
        const response = jsonResponse(
          { error: 'البريد الإلكتروني مستخدم بالفعل' },
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
            ...safeErrorDetails(
              listUsersError,
              'تعذر قراءة مستخدمي auth'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      const existingAuthUser = usersData.users.find(
        (user) =>
          user.id !== userId &&
          user.email?.toLowerCase() === contactEmail.toLowerCase()
      )

      if (existingAuthUser) {
        const response = jsonResponse(
          { error: 'البريد الإلكتروني مستخدم بالفعل في auth' },
          409
        )
        return withAuthCookies(auth.response, response)
      }

      const { error: authUpdateError } =
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          email: contactEmail,
          email_confirm: true,
          ...(adminPassword ? { password: adminPassword } : {}),
          user_metadata: {
            username,
            full_name: fullName,
            role,
          },
        })

      if (authUpdateError) {
        const response = jsonResponse(
          {
            error: 'تعذر تحديث بريد مستخدم auth',
            ...safeErrorDetails(
              authUpdateError,
              'تعذر تحديث بريد مستخدم auth'
            ),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      const { error: updateProfileError } = await supabaseAdmin
        .from('profiles')
        .update({
          full_name: fullName,
          username,
          contact_email: contactEmail,
          role,
          branch_id: branchId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .eq('tenant_id', tenantId)

      if (updateProfileError) {
        const response = jsonResponse(
          {
            error: 'فشل تحديث مستخدم لوحة التحكم',
            ...safeErrorDetails(
              updateProfileError,
              'تعذر تحديث مستخدم لوحة التحكم'
            ),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (posPin) {
        const posBranchId =
          branchId || linkedPosProfile?.branch_id || currentBranchId || null

        if (!posBranchId && isFullAdminRole(role)) {
          const response = jsonResponse(
            { error: 'اختر فرعًا لاستخدام POS لهذا المدير' },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        if (!posBranchId) {
          const response = jsonResponse(
            { error: 'اختر فرعًا للمستخدم قبل حفظ POS PIN' },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        const posBranchAccessResponse = await assertBranchAccess({
          authBranchId: auth.profile.branch_id,
          authScopeType: auth.profile.scope_type,
          branchId: posBranchId,
          tenantId,
        })

        if (posBranchAccessResponse) {
          return withAuthCookies(auth.response, posBranchAccessResponse)
        }

        const posPinHash = await hashPosPin(posPin)

        const { error: upsertLinkedPosProfileError } = await supabaseAdmin
          .from('pos_profiles')
          .upsert(
            {
              id: userId,
              tenant_id: tenantId,
              branch_id: posBranchId,
              username,
              full_name: fullName,
              phone: existingProfile.phone || linkedPosProfile?.phone || null,
              role,
              is_active:
                linkedPosProfile?.is_active ?? existingProfile.is_active ?? true,
              pos_pin_hash: posPinHash,
              pos_pin_plain: posPin,
              created_by: auth.user.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          )

        if (upsertLinkedPosProfileError) {
          const response = jsonResponse(
            {
              error: 'تعذر حفظ POS PIN للمستخدم',
              ...safeErrorDetails(
                upsertLinkedPosProfileError,
                'تعذر حفظ POS PIN للمستخدم'
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
        action: 'user.profile_updated',
        entityType: 'profile',
        entityId: userId,
        branchId: branchId || null,
        metadata: {
          old_username: existingProfile.username,
          new_username: username,
          old_full_name: existingProfile.full_name,
          new_full_name: fullName,
          old_role: existingProfile.role,
          new_role: role,
          old_branch_id: currentBranchId,
          new_branch_id: branchId,
          old_contact_email: existingProfile.contact_email,
          new_contact_email: contactEmail,
        },
      })

      const response = jsonResponse({ success: true })
      return withAuthCookies(auth.response, response)
    }

    const { data: existingPosProfile, error: existingPosProfileError } =
      await supabaseAdmin
        .from('pos_profiles')
        .select('id, username, full_name, phone, role, is_active, branch_id, pos_pin_hash, pos_pin_plain')
        .eq('id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle<ExistingPosProfile>()

    if (existingPosProfileError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من مستخدم POS',
          ...safeErrorDetails(
            existingPosProfileError,
            'تعذر التحقق من مستخدم POS'
          ),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (!existingPosProfile) {
      const response = jsonResponse({ error: 'المستخدم غير موجود' }, 404)
      return withAuthCookies(auth.response, response)
    }

    if (!existingPosProfile.pos_pin_hash && !posPin) {
      const response = jsonResponse(
        { error: 'POS PIN مطلوب لهذا المستخدم' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (isEmailLoginRole(role)) {
      if (!contactEmail) {
        const response = jsonResponse(
          { error: 'البريد الإلكتروني مطلوب لحسابات المدير والإداري' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (!isValidEmail(contactEmail)) {
        const response = jsonResponse(
          { error: 'صيغة البريد الإلكتروني غير صحيحة' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (adminPassword && !hasValidAdminPasswordLength(adminPassword)) {
        const response = jsonResponse(
          { error: 'كلمة مرور لوحة التحكم يجب أن تكون 6 أحرف أو أكثر' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (adminPassword && !adminPasswordConfirmation) {
        const response = jsonResponse(
          { error: 'تأكيد كلمة مرور لوحة التحكم مطلوب' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (adminPassword && adminPassword !== adminPasswordConfirmation) {
        const response = jsonResponse(
          { error: 'تأكيد كلمة مرور لوحة التحكم غير مطابق' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (requiresAssignedBranch(role) && !branchId) {
        const response = jsonResponse(
          { error: 'يجب اختيار فرع لهذا المستخدم' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      const currentBranchId =
        typeof existingPosProfile.branch_id === 'string'
          ? existingPosProfile.branch_id
          : null

      if (
        !canManageBranchScopedTarget(
          auth.profile.scope_type,
          auth.profile.branch_id,
          currentBranchId
        )
      ) {
        const response = jsonResponse(
          { error: 'لا تملك صلاحية تعديل هذا المستخدم' },
          403
        )
        return withAuthCookies(auth.response, response)
      }

      const branchAccessResponse = await assertBranchAccess({
        authBranchId: auth.profile.branch_id,
        authScopeType: auth.profile.scope_type,
        branchId,
        tenantId,
      })

      if (branchAccessResponse) {
        return withAuthCookies(auth.response, branchAccessResponse)
      }

      const username =
        requestedUsername || existingPosProfile.username || generateInternalPosUsername()

      const { data: profileUsernameConflict, error: profileUsernameError } =
        await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('username', username)
          .limit(1)
          .maybeSingle()

      if (profileUsernameError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من اسم المستخدم',
            ...safeErrorDetails(
              profileUsernameError,
              'تعذر التحقق من اسم المستخدم'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      const { data: posUsernameConflict, error: posUsernameError } =
        await supabaseAdmin
          .from('pos_profiles')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('username', username)
          .neq('id', userId)
          .limit(1)
          .maybeSingle()

      if (posUsernameError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من اسم المستخدم',
            ...safeErrorDetails(
              posUsernameError,
              'تعذر التحقق من اسم المستخدم'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (profileUsernameConflict || posUsernameConflict) {
        const response = jsonResponse(
          { error: 'اسم المستخدم مستخدم بالفعل داخل نفس المنشأة' },
          409
        )
        return withAuthCookies(auth.response, response)
      }

      const { data: emailProfileConflict, error: emailProfileConflictError } =
        await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('tenant_id', tenantId)
          .ilike('contact_email', contactEmail)
          .limit(1)
          .maybeSingle()

      if (emailProfileConflictError) {
        const response = jsonResponse(
          {
            error: 'تعذر التحقق من البريد الإلكتروني',
            ...safeErrorDetails(
              emailProfileConflictError,
              'تعذر التحقق من البريد الإلكتروني'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      if (emailProfileConflict) {
        const response = jsonResponse(
          { error: 'البريد الإلكتروني مستخدم بالفعل' },
          409
        )
        return withAuthCookies(auth.response, response)
      }

      const { data: authUserResult } =
        await supabaseAdmin.auth.admin.getUserById(userId)
      const existingSameIdAuthUser = authUserResult?.user || null

      if (!existingSameIdAuthUser && !adminPassword) {
        const response = jsonResponse(
          {
            error:
              'كلمة مرور لوحة التحكم مطلوبة عند تحويل أمين الصندوق إلى حساب إداري',
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      const { data: usersData, error: listUsersError } =
        await supabaseAdmin.auth.admin.listUsers()

      if (listUsersError) {
        const response = jsonResponse(
          {
            error: 'فشل قراءة مستخدمي auth',
            ...safeErrorDetails(
              listUsersError,
              'تعذر قراءة مستخدمي auth'
            ),
          },
          500
        )
        return withAuthCookies(auth.response, response)
      }

      const existingAuthUser = usersData.users.find(
        (user) =>
          user.id !== existingSameIdAuthUser?.id &&
          user.email?.toLowerCase() === contactEmail.toLowerCase()
      )

      if (existingAuthUser) {
        const response = jsonResponse(
          { error: 'البريد الإلكتروني مستخدم بالفعل في auth' },
          409
        )
        return withAuthCookies(auth.response, response)
      }

      const profileId = existingSameIdAuthUser?.id || null
      let nextProfileId = profileId

      if (existingSameIdAuthUser) {
        const { error: authUpdateError } =
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            email: contactEmail,
            email_confirm: true,
            ...(adminPassword ? { password: adminPassword } : {}),
            user_metadata: {
              username,
              full_name: fullName,
              role,
            },
          })

        if (authUpdateError) {
          const response = jsonResponse(
            {
              error: 'تعذر تحديث حساب auth',
              ...safeErrorDetails(authUpdateError, 'تعذر تحديث حساب auth'),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }
      } else {
        const { data: createdUser, error: createAuthError } =
          await supabaseAdmin.auth.admin.createUser({
            email: contactEmail,
            password: adminPassword,
            email_confirm: true,
            user_metadata: {
              username,
              full_name: fullName,
              role,
            },
          })

        if (createAuthError || !createdUser.user) {
          const response = jsonResponse(
            {
              error: 'تعذر إنشاء حساب auth للمستخدم',
              ...safeErrorDetails(
                createAuthError || 'Unknown auth create error',
                'تعذر إنشاء حساب auth للمستخدم'
              ),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }

        nextProfileId = createdUser.user.id
      }

      if (!nextProfileId) {
        const response = jsonResponse(
          { error: 'تعذر تحديد معرف حساب لوحة التحكم' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      const { error: upsertProfileError } = await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            id: nextProfileId,
            username,
            full_name: fullName,
            contact_email: contactEmail,
            phone: existingPosProfile.phone || null,
            role,
            is_active: existingPosProfile.is_active ?? true,
            branch_id: branchId,
            tenant_id: tenantId,
            pos_pin_hash: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )

      if (upsertProfileError) {
        if (!existingSameIdAuthUser) {
          await supabaseAdmin.auth.admin.deleteUser(nextProfileId)
        }

        const response = jsonResponse(
          {
            error: 'تعذر حفظ حساب لوحة التحكم بعد التحويل',
            ...safeErrorDetails(
              upsertProfileError,
              'تعذر حفظ حساب لوحة التحكم بعد التحويل'
            ),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      const nextPosPinHash = posPin
        ? await hashPosPin(posPin)
        : existingPosProfile.pos_pin_hash

      if (!nextPosPinHash) {
        const response = jsonResponse(
          { error: 'POS PIN مطلوب لهذا المستخدم' },
          400
        )
        return withAuthCookies(auth.response, response)
      }

      if (nextProfileId !== userId) {
        const { error: deleteOldPosProfileError } = await supabaseAdmin
          .from('pos_profiles')
          .delete()
          .eq('id', userId)
          .eq('tenant_id', tenantId)

        if (deleteOldPosProfileError) {
          const response = jsonResponse(
            {
              error: 'تعذر تحديث حساب POS القديم بعد التحويل',
              ...safeErrorDetails(
                deleteOldPosProfileError,
                'تعذر تحديث حساب POS القديم بعد التحويل'
              ),
            },
            400
          )
          return withAuthCookies(auth.response, response)
        }
      }

      const { error: upsertConvertedPosProfileError } = await supabaseAdmin
        .from('pos_profiles')
        .upsert(
          {
            id: nextProfileId,
            username,
            full_name: fullName,
            phone: existingPosProfile.phone || null,
            role,
            is_active: existingPosProfile.is_active ?? true,
            branch_id: branchId,
            tenant_id: tenantId,
            pos_pin_hash: nextPosPinHash,
            pos_pin_plain: posPin || existingPosProfile.pos_pin_plain || null,
            created_by: auth.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )

      if (upsertConvertedPosProfileError) {
        const response = jsonResponse(
          {
            error: 'تعذر حفظ POS PIN بعد التحويل',
            ...safeErrorDetails(
              upsertConvertedPosProfileError,
              'تعذر حفظ POS PIN بعد التحويل'
            ),
          },
          400
        )
        return withAuthCookies(auth.response, response)
      }


      await writeAuditLog({
        auth,
        request,
        action: 'user.pos_cashier_converted_to_profile',
        entityType: 'profile',
        entityId: nextProfileId,
        branchId,
        metadata: {
          old_pos_profile_id: userId,
          old_username: existingPosProfile.username,
          new_username: username,
          old_role: existingPosProfile.role,
          new_role: role,
          old_branch_id: currentBranchId,
          new_branch_id: branchId,
        },
      })

      const response = jsonResponse({ success: true })
      return withAuthCookies(auth.response, response)
    }

    if (role !== 'cashier') {
      const response = jsonResponse(
        { error: 'لا يمكن تحديث مستخدم POS بهذا الدور' },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    if (!branchId) {
      const response = jsonResponse({ error: 'يجب اختيار الفرع' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const currentBranchId =
      typeof existingPosProfile.branch_id === 'string'
        ? existingPosProfile.branch_id
        : null

    if (
      !canManageBranchScopedTarget(
        auth.profile.scope_type,
        auth.profile.branch_id,
        currentBranchId
      )
    ) {
      const response = jsonResponse(
        { error: 'لا تملك صلاحية تعديل هذا المستخدم' },
        403
      )
      return withAuthCookies(auth.response, response)
    }

    const branchAccessResponse = await assertBranchAccess({
      authBranchId: auth.profile.branch_id,
      authScopeType: auth.profile.scope_type,
      branchId,
      tenantId,
    })

    if (branchAccessResponse) {
      return withAuthCookies(auth.response, branchAccessResponse)
    }

    const username = requestedUsername || existingPosProfile.username || ''

    if (!username) {
      const response = jsonResponse({ error: 'اسم المستخدم مطلوب' }, 400)
      return withAuthCookies(auth.response, response)
    }

    const { data: usernameConflict, error: usernameConflictError } =
      await supabaseAdmin
        .from('pos_profiles')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('username', username)
        .neq('id', userId)
        .limit(1)
        .maybeSingle()

    if (usernameConflictError) {
      const response = jsonResponse(
        {
          error: 'تعذر التحقق من اسم المستخدم',
          ...safeErrorDetails(
            usernameConflictError,
            'تعذر التحقق من اسم المستخدم'
          ),
        },
        500
      )
      return withAuthCookies(auth.response, response)
    }

    if (usernameConflict) {
      const response = jsonResponse(
        { error: 'اسم المستخدم مستخدم بالفعل داخل نفس المنشأة' },
        409
      )
      return withAuthCookies(auth.response, response)
    }

    const nextPosPinHash = posPin
      ? await hashPosPin(posPin)
      : existingPosProfile.pos_pin_hash

    const { error: updateError } = await supabaseAdmin
      .from('pos_profiles')
      .update({
        full_name: fullName,
        username,
        role,
        branch_id: branchId,
        pos_pin_hash: nextPosPinHash,
        pos_pin_plain: posPin || existingPosProfile.pos_pin_plain || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId)

    if (updateError) {
      const response = jsonResponse(
        {
          error: 'فشل تحديث مستخدم POS',
          ...safeErrorDetails(updateError, 'تعذر تحديث مستخدم POS'),
        },
        400
      )
      return withAuthCookies(auth.response, response)
    }

    await writeAuditLog({
      auth,
      request,
      action: 'user.pos_profile_updated',
      entityType: 'pos_profile',
      entityId: userId,
      branchId,
      metadata: {
        old_username: existingPosProfile.username,
        new_username: username,
        old_full_name: existingPosProfile.full_name,
        new_full_name: fullName,
        old_role: existingPosProfile.role,
        new_role: role,
        old_branch_id: currentBranchId,
        new_branch_id: branchId,
      },
    })

    const response = jsonResponse({ success: true })
    return withAuthCookies(auth.response, response)
  } catch (error) {
    const response = jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        ...safeErrorDetails(error, 'تعذر تحديث المستخدم'),
      },
      500
    )
    return withAuthCookies(auth.response, response)
  }
}
