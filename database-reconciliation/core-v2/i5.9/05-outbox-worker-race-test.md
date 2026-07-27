# AFEX Core V2 — Package 5R-B Outbox Worker Race Test

Status: NOT EXECUTED  
Environment: isolated Clone/Staging only  
Production: prohibited

## Fixture

Use sanitized pending outbox events across two isolated tenants/branches and
two distinct worker lease-owner strings. No provider delivery is allowed.

## Required cases

1. Deterministic bounded claiming.
2. Two workers compete for the same ready events.
3. Active lease prevents a second claim.
4. Expired lease permits approved reclaim.
5. Correct owner completes success.
6. Retryable failure schedules retry and releases ownership as designed.
7. Terminal failure reaches terminal state without another claim.
8. Repeated completion/failure does not duplicate transitions.
9. Wrong worker cannot complete or fail another worker's lease.
10. Claims preserve tenant and branch evidence.
11. Worker cannot execute `create_order_atomic_v2`.
12. Worker has no direct internal-table privilege.

## Assertions

- Each event has at most one active owner.
- Claim order is deterministic under the reviewed query.
- Attempt/retry counts and lease timestamps are consistent.
- Delivered and terminal events are not reclaimed.
- No event or payload crosses tenant/branch scope.
- No duplicate provider action is initiated.
- Atomic-order execution remains unavailable.

Retain sanitized event/correlation IDs, worker aliases, timestamps, state
transitions, counts, and structured errors. STOP on duplicate claim, wrong-owner
success, isolation failure, privilege bypass, deadlock, or Production access.

