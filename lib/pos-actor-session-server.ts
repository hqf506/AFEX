import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import type { AppRole } from '@/lib/app-roles'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { VerifiedAuthContext } from '@/lib/verified-auth-context'

export const POS_ACTOR_COOKIE = 'afex_pos_actor'
export const POS_REAUTH_COOKIE = 'afex_pos_reauth_required'
export const POS_ACTOR_MAX_AGE_SECONDS = 8 * 60 * 60

export type EffectivePosActor = {
  sessionId: string
  actorId: string
  authenticatedSubjectId: string
  authenticatedSessionId: string
  tenantId: string
  branchId: string
  role: AppRole
}

type ActorSessionRow = {
  session_id?: string
  actor_id?: string
  tenant_id?: string
  branch_id?: string
  actor_role?: AppRole
  expires_at?: string
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function singleRow(data: unknown): ActorSessionRow | null {
  const row = Array.isArray(data) ? data[0] : data
  return row && typeof row === 'object' ? (row as ActorSessionRow) : null
}

export function posActorCookieOptions(maxAge = POS_ACTOR_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
    priority: 'high' as const,
  }
}

export async function issuePosActorSession(input: {
  verifiedAuth: VerifiedAuthContext
  rawPin: string
  requestedBranchId: string | null
}) {
  const token = randomBytes(32).toString('base64url')
  const { data, error } = await supabaseAdmin.rpc('issue_pos_actor_session_v1', {
    p_token_hash: sha256(token),
    p_authenticated_session_id: input.verifiedAuth.sessionId,
    p_authenticated_subject_id: input.verifiedAuth.subjectId,
    p_raw_pin: input.rawPin,
    p_requested_branch_id: input.requestedBranchId,
  })
  const row = singleRow(data)
  if (error || !row?.session_id || !row.expires_at || !row.actor_id ||
      !row.tenant_id || !row.branch_id || !row.actor_role) {
    throw new Error('POS_ACTOR_SESSION_ISSUE_FAILED')
  }
  return { token, expiresAt: new Date(row.expires_at), actor: row }
}

export async function resolvePosActorSession(
  token: string | null | undefined,
  verifiedAuth: VerifiedAuthContext
): Promise<EffectivePosActor | null> {
  if (!token || token.length < 32) return null
  const { data, error } = await supabaseAdmin.rpc('validate_pos_actor_session_v1', {
    p_token_hash: sha256(token),
    p_authenticated_session_id: verifiedAuth.sessionId,
    p_authenticated_subject_id: verifiedAuth.subjectId,
  })
  const row = singleRow(data)
  if (error || !row?.session_id || !row.actor_id || !row.tenant_id ||
      !row.branch_id || !row.actor_role) return null
  return {
    sessionId: row.session_id,
    actorId: row.actor_id,
    authenticatedSubjectId: verifiedAuth.subjectId,
    authenticatedSessionId: verifiedAuth.sessionId,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    role: row.actor_role,
  }
}

export async function isPosActorRestrictionRequired(
  verifiedAuth: VerifiedAuthContext
) {
  const { data, error } = await supabaseAdmin.rpc('pos_actor_session_state_v1', {
    p_authenticated_session_id: verifiedAuth.sessionId,
    p_authenticated_subject_id: verifiedAuth.subjectId,
  })
  if (error) throw new Error('POS_ACTOR_SESSION_STATE_FAILED')
  const row = Array.isArray(data) ? data[0] : data
  return Boolean(row?.restriction_required)
}

export async function revokePosActorSession(
  token: string | null | undefined,
  verifiedAuth: VerifiedAuthContext,
  reason: 'LOGOUT' | 'LOCKED' | 'AUTH_LOGOUT' | 'ADMIN_REAUTH' | 'SECURITY_RESET'
) {
  if (!token) return false
  const { data, error } = await supabaseAdmin.rpc('revoke_pos_actor_session_v1', {
    p_token_hash: sha256(token),
    p_authenticated_session_id: verifiedAuth.sessionId,
    p_authenticated_subject_id: verifiedAuth.subjectId,
    p_reason: reason,
  })
  if (error) throw new Error('POS_ACTOR_SESSION_REVOKE_FAILED')
  return data === true
}
