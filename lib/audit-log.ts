import type { NextRequest } from 'next/server'
import type { ApiAuthResult } from '@/lib/api-auth'
import { redactSensitive } from '@/lib/security/redaction'
import { supabaseAdmin } from '@/lib/supabase/admin'

type AuditAuth = Extract<ApiAuthResult, { ok: true }>

type WriteAuditLogInput = {
  auth: AuditAuth
  request: NextRequest
  action: string
  entityType: string
  entityId?: string | null
  branchId?: string | null
  actorUserId?: string | null
  metadata?: unknown
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const forwardedIp = forwardedFor?.split(',')[0]?.trim()

  return (
    forwardedIp ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null
  )
}

function normalizeMetadata(metadata: unknown) {
  const redacted = redactSensitive(metadata ?? {})

  if (!redacted || typeof redacted !== 'object') {
    return {}
  }

  return redacted
}

export async function writeAuditLog({
  auth,
  request,
  action,
  entityType,
  entityId = null,
  branchId = null,
  actorUserId = null,
  metadata = {},
}: WriteAuditLogInput) {
  const effectiveActorUserId = actorUserId || auth.user.id
  try {
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        tenant_id: auth.profile.tenant_id,
        actor_user_id: effectiveActorUserId,
        branch_id: branchId || null,
        action,
        entity_type: entityType,
        entity_id: entityId || null,
        metadata: normalizeMetadata(metadata),
        ip_address: getClientIp(request),
        user_agent: request.headers.get('user-agent'),
      })

    if (error) {
      console.warn(
        '[audit-log] write failed',
        redactSensitive({
          action,
          entityType,
          entityId,
          branchId,
          tenantId: auth.profile.tenant_id,
          actorUserId: effectiveActorUserId,
          message: error.message,
          code: error.code,
        })
      )
    }
  } catch (error) {
    console.warn(
      '[audit-log] unexpected failure',
      redactSensitive({
        action,
        entityType,
        entityId,
        branchId,
        tenantId: auth.profile.tenant_id,
        actorUserId: effectiveActorUserId,
        error,
      })
    )
  }
}
