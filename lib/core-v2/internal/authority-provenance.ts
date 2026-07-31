import 'server-only'

import type { DatabaseAuthoritativeAuthorizationContext } from '../contracts/authorization'

const authoritativeContexts = new WeakSet<object>()

// A1 intentionally exposes no registration or construction capability.
// A2 must add an internal adapter-owned sealer after validating P2D.20 output.
export function hasDatabaseAuthorityProvenance(
  value: unknown
): value is DatabaseAuthoritativeAuthorizationContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    authoritativeContexts.has(value)
  )
}
