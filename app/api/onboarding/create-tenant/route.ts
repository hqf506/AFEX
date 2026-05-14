import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername } from '@/lib/usernames'

type CreateTenantBody = {
  tenantName?: string
  username?: string
  password?: string
  fullName?: string
  phone?: string
  email?: string
  branchName?: string
}

type CreateTenantRpcResult = {
  tenantId?: string | null
  tenant_id?: string | null
  userId?: string | null
  ownerId?: string | null
  owner_id?: string | null
}

function normalizeRequiredText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalText(value: unknown) {
  const normalizedValue = normalizeRequiredText(value)
  return normalizedValue || null
}

function normalizeRpcResult(value: unknown): CreateTenantRpcResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as CreateTenantRpcResult
}

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null

  try {
    const body = (await request.json()) as CreateTenantBody
    const tenantName = normalizeRequiredText(body.tenantName)
    const username = normalizeUsername(body.username || '')
    const password = normalizeRequiredText(body.password)
    const fullName = normalizeOptionalText(body.fullName) || username
    const phone = normalizeOptionalText(body.phone)
    const email = normalizeRequiredText(body.email).toLowerCase()
    const branchName = normalizeOptionalText(body.branchName)

    if (!tenantName) {
      return jsonResponse({ error: 'tenantName is required' }, 400)
    }

    if (!username) {
      return jsonResponse({ error: 'username is required' }, 400)
    }

    if (!/^[a-z0-9._-]+$/.test(username)) {
      return jsonResponse({ error: 'username is invalid' }, 400)
    }

    if (!password) {
      return jsonResponse({ error: 'password is required' }, 400)
    }

    if (!email) {
      return jsonResponse({ error: 'email is required' }, 400)
    }

    console.log('creating user with email:', email)
    const { data: createdUser, error: createUserError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          full_name: fullName,
          contact_email: email,
          phone,
          role: 'admin',
        },
      })

    if (createUserError || !createdUser.user) {
      console.error('[onboarding] create auth user failed', {
        username,
        message: createUserError?.message || 'No user returned',
      })

      return jsonResponse(
        {
          error: 'Failed to create owner auth user',
          details: createUserError?.message || 'No user returned',
        },
        400
      )
    }

    createdUserId = createdUser.user.id
    console.info('[onboarding] create auth user succeeded', {
      userId: createdUserId,
      username,
    })

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
      'create_tenant_with_owner',
      {
        p_tenant_name: tenantName,
        p_owner_user_id: createdUserId,
        p_owner_username: username,
        p_owner_full_name: fullName,
        p_owner_contact_email: email,
        p_owner_phone: phone,
        p_default_branch_name: branchName || 'Main Branch',
      }
    )

    if (rpcError) {
      console.error('[onboarding] create_tenant_with_owner RPC failed', {
        userId: createdUserId,
        username,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
        code: rpcError.code,
      })

      const { error: rollbackError } =
        await supabaseAdmin.auth.admin.deleteUser(createdUserId)

      if (rollbackError) {
        console.error('[onboarding] rollback auth user delete failed', {
          userId: createdUserId,
          message: rollbackError.message,
        })
      }

      return jsonResponse(
        {
          error: 'Failed to create tenant',
          details: rpcError.message,
          rollback: rollbackError ? 'failed' : 'completed',
        },
        500
      )
    }

    const result = normalizeRpcResult(rpcData)
    const tenantId = result.tenantId || result.tenant_id || null
    const userId = result.userId || result.ownerId || result.owner_id || createdUserId

    console.info('[onboarding] create_tenant_with_owner RPC succeeded', {
      tenantId,
      userId,
    })

    return jsonResponse({
      success: true,
      tenantId,
      userId,
    })
  } catch (error) {
    if (createdUserId) {
      const { error: rollbackError } =
        await supabaseAdmin.auth.admin.deleteUser(createdUserId)

      if (rollbackError) {
        console.error('[onboarding] rollback after unexpected error failed', {
          userId: createdUserId,
          message: rollbackError.message,
        })
      }
    }

    return jsonResponse(
      {
        error: 'Unexpected onboarding error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}
