# AFEX Core V2 Package 7 — Concurrency and Outbox Runbook

Runtime state: **NOT EXECUTED**. Dedicated disposable Clone only. Production
and shared Staging are prohibited. Provider delivery must be disabled
externally. PostgreSQL cannot prove either external fact.

`07-verification.sql` and `07-final-verification.sql` are superseded and must
never execute.

## Sessions

| Session | Purpose | Identity |
|---|---|---|
| P7-CONTROL | owns fixture and runtime-ownership temporary state | approved operator |
| P7-ORDER-A/B | competing atomic calls | managed runtime LOGIN |
| P7-WORKER-A/B | competing claims | managed worker LOGIN |
| P7-OBSERVER | read-only locks, counts and timing | distinct approved observer |

All sessions bind to the approved disposable Clone identifier, baseline
identifier and Package 7 run identifier. Managed LOGINs use explicit
`SET ROLE`. Credentials, tokens and connection strings are never retained.

## Blocking checkpoints

1. Verify P7-CONTROL retains all required `pg_temp.package7_*` tables.
2. Verify the exact Clone and run are single-use.
3. Verify Core V2 remains globally disabled and kill switch enabled.
4. Verify provider delivery remains externally disabled.
5. Verify no unrelated workload is connected or approved.
6. Name a deterministic synchronization checkpoint for every case.
7. Observer captures bounded locks, timing, SQLSTATE and exact owned UUIDs.
8. STOP on unknown commit, timeout, deadlock, cross-tenant visibility,
   provider attempt, lost manifest state or unrelated mutation.

## Required cases

- Same key/same payload: one commit and one immutable replay.
- Same key/different payload: one acquisition and one conflict.
- Number contention: unique consecutive branch/month allocation.
- Inventory contention: deterministic locking and no negative stock.
- Authorization context contention: exactly one successful consumption.
- Quote contention: only behavior supported by the frozen Package 6 contract.
- Rate-limit contention: existing approved Clone configuration only; never
  mutate `core_v2_issuer_rate_limit_config`. Unsuitable configuration yields
  `REVIEW_REQUIRED` or `NOT_RUN`.
- Outbox claim contention: disjoint `SKIP LOCKED` batches.
- Lease completion/retry: exact worker ownership and valid transitions.
- Stale claim recovery: only through reviewed worker functions.
- Duplicate delivery: zero provider calls and no duplicate completion.

## Persistence and disposal

These are real committed tests. Do not convert them to rollback-only tests and
do not delete immutable quotes. Every created row must be represented in
`pg_temp.package7_runtime_ownership` where applicable.

After 07g:

1. Run `07-pre-cleanup-verification.sql` as the pre-disposal database gate.
2. Record individual suite evidence from the retained authoritative outputs.
3. Run the read-only final database gate.
4. Export and hash all evidence externally.
5. Perform the non-mutating disposal handoff.
6. Destroy the disposable Clone externally.
7. Retain the external destruction attestation.
8. Complete aggregate evidence review in the durable external repository.
