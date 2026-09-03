import 'server-only'

import { inspect } from 'node:util'
import type { EffectivePosActor } from '@/lib/pos-actor-session-server'
import type { VerifiedAuthContext } from '@/lib/verified-auth-context'

const trustedSyncUploaderContextBrand: unique symbol = Symbol(
  'TrustedSyncUploaderContext'
)

export const OFFLINE_TRUSTED_PROVENANCE_ACTIVATION = false as const
export const OFFLINE_TRUSTED_PROVENANCE_CLASSIFICATION =
  'SHADOW_PROVENANCE_NOT_ACTIVE' as const

export type TrustedSyncUploaderContext = Readonly<{
  contextVersion: 'afex-sync-uploader-context.v1'
  classification: typeof OFFLINE_TRUSTED_PROVENANCE_CLASSIFICATION
  activeForAuthorization: false
  authenticatedSubjectId: string
  authenticatedSessionId: string
  posActorSessionId: string
  actualPosEmployeeId: string
  tenantId: string
  branchId: string
  [trustedSyncUploaderContextBrand]: true
  toJSON: () => never
}>

function fail(field: string): never {
  throw new Error(`TRUSTED_SYNC_UPLOADER_CONTEXT_INVALID:${field}`)
}

export function createShadowTrustedSyncUploaderContext(input: Readonly<{
  verifiedAuth: VerifiedAuthContext
  effectivePosActor: EffectivePosActor
}>): TrustedSyncUploaderContext {
  const { verifiedAuth, effectivePosActor } = input
  if (verifiedAuth.subjectId !== verifiedAuth.user.id) fail('subject')
  if (effectivePosActor.authenticatedSubjectId !== verifiedAuth.subjectId) {
    fail('actor-subject')
  }
  if (effectivePosActor.authenticatedSessionId !== verifiedAuth.sessionId) {
    fail('actor-session')
  }

  const context = {
    contextVersion: 'afex-sync-uploader-context.v1' as const,
    classification: OFFLINE_TRUSTED_PROVENANCE_CLASSIFICATION,
    activeForAuthorization: OFFLINE_TRUSTED_PROVENANCE_ACTIVATION,
    authenticatedSubjectId: verifiedAuth.subjectId,
    authenticatedSessionId: verifiedAuth.sessionId,
    posActorSessionId: effectivePosActor.sessionId,
    actualPosEmployeeId: effectivePosActor.actorId,
    tenantId: effectivePosActor.tenantId,
    branchId: effectivePosActor.branchId,
    [trustedSyncUploaderContextBrand]: true as const,
    toJSON(): never {
      throw new Error('TRUSTED_SYNC_UPLOADER_CONTEXT_SERIALIZATION_FORBIDDEN')
    },
    [inspect.custom](): string {
      return '[TrustedSyncUploaderContext REDACTED]'
    },
  }

  return Object.freeze(context)
}
