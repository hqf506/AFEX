# AFEX Core V2 — Package 5R-B Authorization Replay Test

Status: NOT EXECUTED  
Environment: isolated Clone/Staging only  
Production: prohibited

## Required cases

1. Single-use context: first committed consumption succeeds; second fails.
2. Expiry: expired context fails without mutation.
3. Revocation: revoked context fails.
4. Wrong actor: current profile differs from stored actor.
5. Wrong tenant: requested/stored tenant mismatch.
6. Wrong branch: requested/stored branch or POS branch mismatch.
7. Wrong idempotency-key binding: expected hash differs.
8. Simultaneous consumption: only one transaction commits.
9. Rollback after consumption: context consumption rolls back with caller.
10. Committed order replay: requires a fresh context bound to the same key hash
    and returns the immutable committed result without duplicate writes.

## Evidence controls

- Never retain raw context tokens.
- Never retain raw idempotency keys, PINs, credentials, or authorization
  headers.
- Store only approved hashes, sanitized IDs, correlation IDs, timestamps,
  structured outcomes, and before/after state classifications.

## Pass criteria

Every conflict fails closed, no context crosses actor/tenant/branch scope, one
simultaneous consumer wins, rollback restores transactional state, and
committed replay requires fresh authorization without duplicate persistence.

