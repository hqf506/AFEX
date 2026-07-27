# AFEX Core V2 — Package 4T Idempotency Replay Test

Status: NOT EXECUTED  
Environment: isolated Clone/Staging only  
Production execution: prohibited

## Objective

Prove one scoped command identity produces one immutable committed result while
safe retries replay that result and conflicts fail.

## Preconditions

- Approved isolated environment and fixture tenant/branch.
- Core V2 packages installed and verified.
- Runtime access available only through the approved server path.
- Fresh authorization context and authoritative quote for each non-replay
  attempt.
- Before-state counts retained.

## Cases

### A. Initial commit

Submit one valid command with key K and fingerprint F.

Expected:

- one idempotency row reaches `committed`;
- one order and one invoice are linked;
- response version and hash are populated;
- one immutable response is returned.

### B. Same key and same fingerprint

Obtain the required fresh context and retry K/F.

Expected:

- committed replay returns the same order and invoice;
- no quote recalculation is required after replay detection;
- no new customer, number, order, invoice, item, movement, audit, or outbox row;
- persisted response hash remains unchanged.

### C. Same key and different fingerprint

Retry K with F2.

Expected:

- `IDEMPOTENCY_FINGERPRINT_CONFLICT`;
- no mutation.

### D. Same key with actor, engine, tenant, or branch conflict

Expected:

- corresponding actor, engine, or scope conflict;
- no cross-scope replay;
- no mutation.

### E. In-progress and recovery

Exercise an approved isolated started/lease fixture.

Expected:

- active lease returns in-progress/conflict;
- unauthorized recovery fails;
- approved recovery follows the frozen transition rules;
- no duplicate committed result.

### F. Timeout-after-commit

Allow commit to complete, suppress the client response, then retry.

Expected:

- retry returns the committed immutable result;
- no duplicate business or evidence rows.

## Evidence

- Key hash only; never retain the raw key.
- Fingerprint and response hashes.
- State-transition timestamps and retry count.
- Linked order and invoice IDs.
- Before/after counts for all mutated tables.
- Structured error codes for rejected cases.

## Pass criteria

Every accepted replay is identical, every conflict is rejected, and no retry
duplicates any business or evidence row.

