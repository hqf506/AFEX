# AFEX Core V2 Package 7 — Disposable Clone Security Review

Status: source review only. Runtime tests are **NOT EXECUTED**. Core V2 remains
disabled. Package 7 is restricted to a fresh, dedicated, single-use disposable
Clone. Production and shared Staging are prohibited.

Package 6 remains frozen. Package 7 creates no financial-quote deletion path,
does not alter `reject_financial_quote_mutation_v1()` and never bypasses
`trg_financial_quotes_immutable_v1`.

`07-verification.sql` and `07-final-verification.sql` are superseded and must
never execute.

## Clone-only execution identity

All executable Package 7 SQL runs directly as the externally provisioned
`afex_package7_test_executor` LOGIN on one approved disposable Clone. The role
is LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION and
NOBYPASSRLS, has no memberships, and receives only reviewed direct test ACLs
and Clone-only RLS policies. Package 7 does not create or grant it. It is never
installed in Production or shared Staging and is destroyed with the Clone.
Existing Package 6 roles, ownership, ACLs and runtime closure remain unchanged.

The execution contract permits `EXECUTE` only on the 16 entry points enumerated
by `package7_executor_functions` in `07-pre-run-verification.sql`. Direct table
access is limited to `SELECT` needed by assertions, `INSERT` for deterministic
fixture rows, and `UPDATE` only for rollback-scoped authorization/activation
and immutable-quote rejection tests. `DELETE`, ownership, role membership,
trigger bypass and provider access are forbidden. Clone-only RLS policies may
authorize only this executor and disappear with Clone destruction.

## Threat model

| Threat | Required control | Residual risk |
|---|---|---|
| Production targeting | externally approved project/reference, host and non-Production attestation | operator connects to wrong target |
| Shared Staging use | dedicated Clone with no unrelated users/workloads | undisclosed external connection |
| Baseline poisoning | approved snapshot identifier and schema/package hashes | compromised source snapshot |
| Stale Clone reuse | unique Clone/run identifiers and prior-evidence review | incomplete external inventory |
| Provider delivery | providers and workers disabled externally plus undelivered outbox checks | provider state lies outside PostgreSQL |
| Evidence tampering | external SHA-256 manifest, separate observer and durable repository | compromised export host |
| Disposal failure | pre-approved method/owner and post-disposal attestation | control-plane failure |
| Fixture collision | deterministic approved UUID manifest and fail-closed checks | incorrect approval manifest |
| Unrelated mutation | before-images, exact runtime ownership and descendant completeness | untracked external writer |
| Lost temporary state | one control session through evidence export | connection loss |
| Role escalation | reviewed NOLOGIN owners and explicit managed `SET ROLE` | external role drift |
| Secret exposure | bounded sanitized output; no tokens or credentials retained | operator capture error |
| Quote mutation | frozen unconditional immutable trigger | superuser/operator abuse outside artifacts |
| Cross-tenant access | exact tenant/branch/RLS assertions | unreviewed external workload |
| Unknown commit | fail closed and quarantine/dispose Clone | ambiguous client failure |

## Trust boundary

PostgreSQL cannot prove:

- disposable Clone identity;
- project/reference and host identity;
- baseline provenance;
- absence of unrelated workloads;
- external provider disablement;
- evidence export durability;
- successful destruction/reset.

These are blocking external attestations. Database PASS never substitutes for
them.

## Runtime and evidence model

Package 7 uses committed quote, order, idempotency, inventory, audit and outbox
state so replay and multi-session concurrency retain production fidelity.
Every owned runtime UUID is captured in
`pg_temp.package7_runtime_ownership`.

The pre-disposal gate proves ownership, relationships, lack of unexpected
descendants, safe disabled activation state and zero delivered owned outbox
events. Individual suite evidence is recorded before disposal and exported.

The final aggregate result is not stored solely inside the disposable Clone.
After evidence export, reviewer authorization and external destruction/reset
attestation, the aggregate result is retained in a separately approved durable
evidence repository.

## Explicit STOP conditions

- Target, baseline, provider, operator or observer attestation missing.
- Clone/run reuse or unrelated workload.
- Any hash mismatch or stale artifact inclusion.
- Core V2 enabled, kill switch disabled or canary non-zero.
- Missing runtime-ownership row, unexpected descendant or unrelated mutation.
- Provider attempt or delivered owned outbox event.
- FAIL, REVIEW_REQUIRED, NOT_RUN, timeout or unknown commit.
- Evidence export missing or manifest hash unapproved.
- Disposal authorization or final destruction/reset attestation missing.

No unexecuted test is represented as PASS.
