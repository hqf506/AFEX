# AFEX Core V2 — Package 4T Controlled Production Run Card

Status: external review required  
Execution authority: manual operator only  
Core V2 state: disabled  
Runtime tests: not executed

## Frozen executable

| Artifact | Lines | Bytes | SHA-256 |
|---|---:|---:|---|
| `database-reconciliation/core-v2/i5.9/04-atomic-core.sql` | 3248 | 121830 | `40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7` |

This run card does not authorize execution. Package 4 may be run only after
external review, successful isolated validation, and named operator approval.

## Scope

Package 4T creates or replaces the service-only atomic-order functions, closes
their default execution privileges, removes the obsolete
`enqueue_atomic_outbox_v1` overload, and leaves Core V2 disabled.

Installing functions does not invoke the atomic entry point and does not create
orders, invoices, customers, movements, audit records, or outbox events.

## A. Preconditions

- [ ] Package 2R, 2B, 2B-S, and 3R completion is proven by their separately
      approved post-run evidence; the Package 4 pre-run verifies only the
      relations, columns, customer/inventory data gates, and canonical customer
      index explicitly listed in its result.
- [ ] Package 5R-B and Package 6B completion is proven by their separately
      approved post-run evidence; the Package 4 pre-run additionally verifies
      the four dependency signatures, authorization/quote relations, and
      Package 6B quote-context constraint/index needed by the executable.
- [ ] Package 4T SQL hash matches the frozen hash above.
- [ ] `04-pre-run-verification.sql` returned PASS for every check.
- [ ] The SQL and all operational artifacts have external approval.
- [ ] Database activation state is disabled as proven by the three
      `activation_state` rows from `04-pre-run-verification.sql`.
- [ ] Deployment environment variables
      `AFEX_CORE_V2_ATOMIC_ORDER_ENABLED`,
      `AFEX_CORE_V2_FINANCIAL_QUOTES`, and
      `AFEX_CORE_V2_FINANCIAL_SHADOW` are absent or not `true`, proven by a
      separately retained deployment-configuration review that exposes no
      secret values.
- [ ] No browser or runtime role has atomic entry-point execution.
- [ ] No Production execution occurs before successful isolated validation.
- [ ] Package 7 runtime tests remain NOT EXECUTED in Production.
- [ ] Backup, restoration authority, maintenance window, and STOP authority are
      confirmed.

STOP if any precondition is false, unavailable, or ambiguous.

## B. Local hash verification

Run locally without opening a database connection:

```powershell
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/04-atomic-core.sql
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/04-pre-run-verification.sql
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/04-post-run-verification.sql
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/04-rollback.sql
```

Record the externally approved hashes. STOP on any mismatch.

## C. Backup and recovery verification

Do not record credentials, tokens, URLs, or secrets.

- [ ] Production project identifier: `________________`
- [ ] Independent project confirmation: `________________`
- [ ] Latest successful backup time in UTC: `________________`
- [ ] Backup reference: `________________`
- [ ] Restoration method: `________________`
- [ ] Restoration operator: `________________`
- [ ] Latest restoration-test evidence: `________________`
- [ ] Forward-fix authority: `________________`
- [ ] Full-restoration authority: `________________`

Package 4 rollback is intentionally fail-closed. STOP if recovery ownership or
backup availability is uncertain.

## D. Environment identity

- [ ] SQL editor visibly identifies the intended environment.
- [ ] A second operator confirms organization and project identity.
- [ ] Isolated validation evidence belongs to the same reviewed package hashes.
- [ ] PostgreSQL is compatible with the reviewed PostgreSQL 17 contract.
- [ ] `pgcrypto` exists in schema `extensions`.
- [ ] No secret is copied into retained evidence.

## E. Maintenance window

- [ ] Change ticket: `________________`
- [ ] Approved start: `________________`
- [ ] Approved end: `________________`
- [ ] Primary operator: `________________`
- [ ] Independent observer: `________________`
- [ ] Monitoring owner: `________________`
- [ ] STOP authority: `________________`
- [ ] Forward-fix/restoration authority: `________________`

Package installation takes catalog locks for function replacement. Runtime
functions must remain unreachable throughout this package.

## F. Pre-run verification

Execute `04-pre-run-verification.sql` as a separate read-only operation.

- [ ] Retain the complete result.
- [ ] Confirm every row reports `PASS`.
- [ ] Confirm every `required_relation`, `required_column`, `data_gate`, and
      canonical-index row reports PASS.
- [ ] Confirm each of the four `required_dependency_function` rows reports
      PASS; Package 5R-B/6B completion remains mapped to their named separate
      post-run evidence.
- [ ] Confirm `global_core_v2_flags_disabled`,
      `tenant_core_v2_flags_disabled`, and
      `branch_core_v2_flags_disabled` report PASS.
- [ ] Confirm the separate deployment-configuration review proves all three
      application environment flags remain absent or not `true`.
- [ ] Confirm the atomic entry point is absent or not executable by runtime and
      browser roles.
- [ ] Confirm no blocker or unexpected overload is reported.

STOP on any non-PASS result. Do not repair or improvise during this run.

## G. Manual execution

The approved operator may execute only:

```text
database-reconciliation/core-v2/i5.9/04-atomic-core.sql
```

Rules:

1. Open the exact hash-approved artifact.
2. Execute it once as a complete script.
3. Do not edit statements in the SQL editor.
4. Do not grant execution.
5. Do not activate Core V2.
6. Do not invoke `create_order_atomic_v2`.
7. Record start time, completion time, notices, errors, and transaction result.
8. STOP immediately on any exception or connection interruption.

## H. Immediate success criteria

- [ ] The explicit transaction committed normally.
- [ ] No statement was skipped or manually retried.
- [ ] No runtime function was invoked.
- [ ] No runtime grant was added.
- [ ] Core V2 remained disabled.
- [ ] `04-post-run-verification.sql` reports PASS for every check.
- [ ] All expected function signatures exist exactly once.
- [ ] Every expected function has the reviewed security mode and safe
      `search_path`.
- [ ] Every expected function reports owner `afex_core_owner`.
- [ ] Every Package 4T function/role ACL row reports PASS for `PUBLIC`, `anon`,
      `authenticated`, `service_role`, `afex_core_runtime`,
      `afex_context_issuer`, `afex_outbox_worker`, and
      `afex_core_activation_operator`.
- [ ] Required 4T static ordering and snapshot-parity checks pass.

## I. Failure handling

On any failure:

1. STOP.
2. Preserve the exact database error and statement position.
3. Do not rerun individual statements.
4. Do not grant permissions or activate Core V2.
5. Run only approved read-only evidence queries.
6. Do not use `04-rollback.sql` as an automatic reversal; it fails closed.
7. Escalate for an externally reviewed forward fix or restoration decision.

## J. Evidence collection

Retain:

- Package hash and all operational-artifact hashes.
- Named operator, observer, ticket, environment, and UTC timestamps.
- Complete pre-run verification output.
- Exact execution output.
- Complete post-run verification output.
- Function signature, owner, security, `search_path`, and ACL evidence.
- Proof that Core V2 remained disabled.
- Proof that runtime tests remain NOT EXECUTED.
- Proof that no order, invoice, inventory, audit, or outbox test mutation was
  performed during installation.

Do not retain secrets or customer data.

## K. STOP conditions

STOP if:

- any hash differs;
- any prerequisite is missing or drifted;
- any pre-run or post-run check fails;
- Core V2 is enabled;
- a runtime/browser EXECUTE privilege exists;
- an unexpected overload exists;
- Package 2/3 data gates are not satisfied;
- the environment cannot be independently confirmed;
- backup or restoration authority is unavailable;
- the transaction reports an error or ambiguous completion;
- an operator proposes an unreviewed edit, grant, activation, or runtime test.

## L. Completion decision

Package installation is complete only when external reviewers accept all
evidence. Installation does not authorize Package 6 activation, Package 7
runtime tests, canary use, or Production traffic.
