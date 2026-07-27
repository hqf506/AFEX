# AFEX Core V2 — Package 5R-B Concurrency Test Plan

Status: NOT EXECUTED  
Environment: isolated Clone/Staging only  
Production: prohibited

## Concurrent scenarios

1. Two issuers request contexts for the same user/key.
2. Two consumers attempt one token simultaneously.
3. Revocation races consumption.
4. Expiry occurs while consumption waits.
5. Transaction rollback follows successful in-transaction consumption.
6. Two workers claim the same pending batch.
7. Lease expiry races completion.
8. Retryable and terminal failures race another claim.

## Assertions

- Tokens remain unique and opaque.
- Exactly one simultaneous consumption commits.
- Revoked/expired context cannot commit consumption.
- Rolled-back consumption restores the issued state transactionally.
- One event has at most one active lease owner.
- Wrong owner cannot complete or fail an event.
- No duplicate delivery transition occurs.
- No cross-tenant/branch leakage or deadlock occurs.

Record waits, SQLSTATE/error category, state transitions, correlation IDs, and
sanitized fixture IDs. STOP on deadlock, partial commit, duplicate claim,
privilege bypass, or Production connectivity.

