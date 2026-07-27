# AFEX Enterprise Platform Core V2 — Package 12-P

## Controlled Production Execution Amendment

**DOCUMENTATION ONLY — PRODUCTION EXECUTION NOT STARTED**

**CORE V2 REMAINS DISABLED**

**RUNTIME TESTS: NOT EXECUTED**

This amendment records the human owner's decision to validate and install Core
V2 directly against AFEX Production. It supersedes only the isolated-environment
requirement in Packages 11 and 12. It does not weaken any artifact hash,
external-review, backup, restoration, maintenance, rollback, security,
runtime-test, evidence, or activation gate.

This amendment does not authorize Package 2R or any mutating package. Package 1R
is the only initially permitted SQL package, and it remains blocked until the
backup and restoration gate below is externally accepted.

---

## 1. Production execution decision record

The following decision was supplied by the human owner:

- Production execution was explicitly selected.
- The system currently has one active human user.
- No local or staging validation environment will be used.
- Accuracy, manual control, and fail-closed behavior are mandatory.
- Core V2 must remain disabled throughout installation and verification.

Risk statement:

- A single active user does not eliminate database, locking, privilege,
  migration, provider, recovery, data-integrity, or availability risk.
- Direct Production execution has a smaller recovery margin than isolated
  rehearsal.
- Production execution is reversible only to the extent proven by backup,
  restoration, transaction, and package-specific recovery evidence.
- No package may run merely because this decision was recorded.
- Every section requires the exact gates and independent approvals below.

Decision owner role: `HUMAN_OWNER — TO BE RECORDED`

Decision timestamp: `PENDING`

Risk acceptance evidence: `PENDING`

---

## 2. Controlling artifact inventory

Every SHA-256 must be recomputed from exact local bytes immediately before use.
A mismatch means immediate STOP. No file may be edited, normalized, regenerated,
or substituted during execution.

| Package | File | Approved SHA-256 | Initial permission |
|---|---|---|---|
| 1R | `01-read-only-preflight.sql` | `8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a` | Read-only, after backup gate |
| 2R | `02-schema-foundation.sql` | `92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92` | BLOCKED |
| 2B | `02b-existing-table-indexes.sql` | `7b712bd7cb61603ef0afd5c96e4dcf533debb57adbaab577650f297a486b588b` | BLOCKED |
| 2B-S | `02c-security-foundation.sql` | `009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d` | BLOCKED |
| 3R | `03-backfill.sql` | `58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208` | BLOCKED |
| 10 | `10-clean-install-runtime.sql` | `07ea287c303452a94f7075b57ef254552f1247efebbfa13502cc681d8674e647` | BLOCKED |
| 7 | `07-final-verification.sql` | `deb28b9d635edb215bf223f057276d38d3fcbaf0390b7098d81b133bff01c6f8` | NOT EXECUTED / BLOCKED |
| Controller | `12-master-execution-controller.md` | `08db92ffdc676e24ac741d8042ba7661d8f52db68e87b129cab427bb96930acf` | Documentation |

---

## 3. Mandatory Production backup and restoration gate

No Package 1R or later package may run until an external reviewer has inspected
and accepted evidence for every item:

- [ ] Current Supabase plan and backup capabilities.
- [ ] Latest physical or logical backup timestamp.
- [ ] Backup completion and health status.
- [ ] PITR availability, status, and retention window where supported.
- [ ] Exact confirmed restore path.
- [ ] Role authorized to request and perform restoration.
- [ ] Expected restore time and acceptable recovery objective.
- [ ] Fresh schema-only dump and SHA-256.
- [ ] Role, membership, ownership, and ACL inventory.
- [ ] Function, trigger, and policy inventory.
- [ ] Extension inventory.
- [ ] Storage bucket and configuration inventory where relevant.
- [ ] Current Git commit identifier.
- [ ] Every controlling package hash.
- [ ] Restoration decision authority available during the full window.
- [ ] Evidence contains no password, database URL, API key, service key, token,
      JWT, PIN, customer PII, or other secret.

Evidence must prove that the backup is restorable. Backup existence alone is
insufficient.

If no restorable backup is available:

**PRODUCTION EXECUTION BLOCKED**

Current backup gate: **BLOCKED — EVIDENCE NOT PROVIDED OR INSPECTED**

---

## 4. Maintenance-mode gate

Package 1R may run before maintenance mode only because it is intended to be
read-only, and only after its static read-only contract and backup gate are
independently accepted.

Before Package 2R or any later mutating section:

- [ ] The human AFEX user is logged out.
- [ ] POS activity is stopped.
- [ ] Admin mutations are stopped.
- [ ] Scheduled jobs are stopped.
- [ ] WhatsApp delivery is stopped.
- [ ] Email and SMS delivery are stopped.
- [ ] Provider delivery is stopped.
- [ ] Outbox and background workers are stopped.
- [ ] External integrations capable of writing are stopped.
- [ ] Application deployment and cutover are frozen.
- [ ] Maintenance start time is recorded in UTC and local time.
- [ ] Maintenance owner and stop authority are present.
- [ ] Database activity is checked for unexpected writers.

Any new writer, provider delivery, worker activity, or user session means STOP.

---

## 5. Package 1R Production gate

Package 1R is the only initially permitted SQL package.

### Entry requirements

- Backup/restoration gate approved.
- Exact hash recomputed and matched:
  `8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a`.
- External static review reconfirms the complete file is read-only.
- Target identity, session identity, PostgreSQL version, and read-only state are
  recorded without credentials.
- Approved statement/lock timeout plan is recorded.
- Complete untruncated output storage is ready.

### Execution contract

- Execute the complete exact file without editing.
- Save all result sets, notices, warnings, errors, client output, timestamps,
  and exit status.
- Do not omit repeated or empty sections.
- Do not broaden privileges to obtain missing metadata.
- Do not continue after timeout, warning, error, connection loss, truncation, or
  unexpected result.
- Package 1R must not modify data, schema, roles, privileges, configuration, or
  runtime state.

### Mandatory stop and review

After Package 1R completes:

1. STOP.
2. Preserve complete raw output.
3. Send it for external review.
4. Do not run Package 2R.

Only these decisions are valid:

- `PACKAGE 1R PRODUCTION OUTPUT APPROVED — CONTINUE`
- `PACKAGE 1R PRODUCTION OUTPUT BLOCKED — REMEDIATION REQUIRED`

This document does not issue the first decision and does not authorize Package
2R.

Current Package 1R state: **NOT EXECUTED**

---

## 6. Production mutation package gates

Packages 2R, 2B, 2B-S, 3R, and 10 each require a new, explicit, written human
approval for that exact artifact and section.

Before every package:

- [ ] Prior package and postcheck externally approved.
- [ ] Exact package hash recomputed.
- [ ] Maintenance mode remains active.
- [ ] Backup/PITR/restore evidence remains current.
- [ ] Restoration authority is available.
- [ ] Complete before-state inventory captured.
- [ ] Package-specific lock and timeout plan approved.
- [ ] Expected objects, statements, and affected-row limits documented.
- [ ] Evidence destination verified.
- [ ] STOP and rollback authority present.

During every package:

- Execute one manual section only.
- Save complete output.
- STOP after the section.
- Capture exact after-state evidence.
- Obtain external review before continuing.

There is no automatic package chain, unattended execution, or implied approval.

### Package 2R gate

- One reviewed transaction only.
- Confirm expected new tables, nullable columns, constraints, and new-table
  indexes.
- Monitor brief `ACCESS EXCLUSIVE` lock acquisition.
- Failure before COMMIT must roll back.
- Uncertain COMMIT or failed postcheck means freeze state and external review.

### Package 2B-S gate

- Verify the trusted authorization-context foundation and scope indexes.
- Capture role, owner, ACL, RLS, policy, constraint, and index state.
- No operational grants.
- Any permissive browser access, unsafe role attribute, or ownership drift means
  STOP.

---

## 7. Package 2B — fourteen Production index gates

Global rules:

- No explicit transaction.
- No `IF NOT EXISTS`.
- No automatic retry.
- No automatic `DROP INDEX`.
- No rename, rebuild, equivalent substitute, or repair without external review.
- Never continue to the next index after unexpected output.

For each canonical index:

1. Run the exact read-only precheck.
2. Confirm canonical name is absent and no equivalent/conflicting definition
   exists.
3. Execute one `CREATE INDEX CONCURRENTLY` only.
4. STOP.
5. Inspect exact definition.
6. Require `indisvalid=true`.
7. Require `indisready=true`.
8. Capture duration, locks, resource observations, warnings, and errors.
9. Obtain external approval before the next index.

| Gate | Canonical index |
|---:|---|
| B1 | `idx_customers_tenant_phone_normalized` |
| B2 | `idx_orders_idempotency_command` |
| B3 | `idx_orders_correlation` |
| B4 | `idx_invoices_financial_quote` |
| B5 | `idx_invoices_request_fingerprint` |
| B6 | `idx_invoices_quote_fingerprint` |
| B7 | `idx_inventory_movements_order` |
| B8 | `idx_inventory_movements_invoice` |
| B9 | `idx_inventory_movements_invoice_item` |
| B10 | `idx_inventory_movements_correlation` |
| B11 | `idx_audit_logs_order` |
| B12 | `idx_audit_logs_invoice` |
| B13 | `idx_audit_logs_customer` |
| B14 | `idx_audit_logs_correlation` |

A failed concurrent build may leave an invalid or not-ready index. Preserve the
exact state and request a reviewed cleanup/forward-fix decision. Do not retry or
drop automatically.

---

## 8. Package 3R Production data-safety gates

Before every mutating section or batch:

- [ ] Count exact candidate rows from Production.
- [ ] Save only non-PII sample identifiers needed for review.
- [ ] Confirm the predicate is null-only or missing-only.
- [ ] Record tenant and branch scope where applicable.
- [ ] Confirm duplicate, missing-tenant, and invalid-value preflights pass.
- [ ] Establish an approved maximum affected-row count.
- [ ] Record batch size and deterministic resume boundary.
- [ ] Approve lock and runtime limits.

Execution:

- Run one bounded batch only.
- Compare selected, affected, and remaining counts.
- Verify no non-candidate row changed.
- STOP for external review.
- Do not automatically loop through remaining batches.

Package 3R mutating sections include:

- Missing `customers.phone_normalized` bounded backfill.
- Missing customer `record_version=1` bounded backfill.
- Missing inventory-stock `record_version=1` bounded backfill.
- Standalone concurrent customer identity unique index.
- Separately gated constraint validation sections.

No unbounded backfill, customer merge, deletion, winner selection, reassignment,
historical snapshot rewrite, or automatic reverse update is authorized.

---

## 9. Package 10 Production safety gates

Package 10 may execute only after Packages 2R, 2B, 2B-S, and 3R plus every
postcheck are externally approved.

Never run the complete 7,527-line file as one unattended operation.

Required sequence:

1. Phase A read-only foundation/collision preflight.
2. STOP and external review.
3. Transaction A.
4. STOP and external review.
5. Transaction B.
6. STOP and external review.
7. Transaction C.
8. STOP and external review.
9. Transaction D.
10. STOP and external review.
11. Complete read-only postflight.
12. STOP and external review.

Required safeguards:

- Reject any role or Core V2 object collision.
- Verify all foundation dependencies.
- Capture exact objects after every COMMIT.
- Verify all six NOLOGIN roles, seven tables, five indexes, 39 functions, seven
  triggers, and 23 policies.
- Verify exact function signatures, normalized body hashes, dependencies,
  owners, ACLs, RLS, policies, and privilege closure.
- Introduce no operational grants.
- Do not invoke operational runtime paths.
- Do not blind-rerun or automatically repair a partial installation.

Final required state:

```text
global_enabled=false
kill_switch=true
deterministic_canary_percentage=0
pos_enabled=false
admin_orders_enabled=false
quote_issuer_enabled=false
outbox_worker_enabled=false
```

Any differing flag or tenant/branch activation state means STOP.

---

## 10. Production Package 7 gate

Package 7 runtime testing in Production is separately gated and is not
authorized by this amendment.

Before Package 7 preparation or runtime:

- [ ] Package 10 postflight externally approved.
- [ ] Backup and restoration gate remains valid.
- [ ] Providers and workers remain disabled.
- [ ] Test identifiers cannot collide with real Production data.
- [ ] Fixtures are explicitly scoped and externally reviewed.
- [ ] Cleanup plan uses exact identifiers.
- [ ] No destructive test is permitted.
- [ ] No real customer notification can occur.
- [ ] A second controlled tenant context is available where required.
- [ ] Multi-session operators and evidence plan are approved.
- [ ] Core V2 remains disabled.
- [ ] Package 7 hash is revalidated.
- [ ] Separate written Package 7 approval exists.

Current state:

**RUNTIME TESTS: NOT EXECUTED**

---

## 11. Abort conditions

Immediately STOP on:

- Hash mismatch.
- Missing or stale backup evidence.
- Uncertain restore path or unavailable restore authority.
- SQL or client error.
- Unexpected notice or warning.
- Timeout, cancellation, deadlock, or connection loss.
- Partial execution or COMMIT uncertainty.
- Invalid/not-ready index.
- Unexpected lock duration or blocked workload.
- Unexpected candidate or affected-row count.
- Role, owner, membership, or ACL drift.
- Trigger, RLS, policy, function, or constraint drift.
- Any activation flag change.
- Provider or worker delivery.
- Unexpected user or integration write.
- Inability to save complete untruncated evidence.
- Evidence containing secrets or customer PII.

After STOP:

1. Do not retry.
2. Do not repair.
3. Do not continue.
4. Do not drop, rename, reset, restore privileges, activate, or improvise.
5. Preserve exact output and observed state.
6. Capture partial-state inventory.
7. Request external review and a separately approved restoration, rollback, or
   forward-fix decision.

---

## 12. Application deployment separation

Database installation and application deployment are separate change phases:

- Core V2 database objects may be installed only in the disabled state.
- The current application continues using the legacy route.
- Application Core V2 routing must not be deployed or enabled during SQL
  installation.
- Git push requires separate later approval.
- Vercel Preview or Production deployment requires separate later approval.
- Runtime grants require separate later review and approval.
- Canary configuration and activation require separate later approval.
- No database installation result automatically authorizes application cutover.

---

## 13. Production evidence record

For every package and section, retain:

- Exact target identifier without credentials.
- Exact artifact SHA-256.
- Git commit.
- UTC and local timestamps.
- Operator role and reviewer role.
- SQL client and PostgreSQL versions.
- Before-state inventory.
- Complete stdout and stderr.
- Notices, warnings, and errors.
- Exit and transaction outcome.
- Lock/runtime observations.
- Selected and affected-row counts where applicable.
- After-state inventory.
- Partial-failure state.
- Reviewer decision.

Never retain passwords, connection strings, credential-bearing URLs, API keys,
service keys, tokens, JWTs, PINs, provider secrets, or customer PII.

---

## 14. Final Production operator checklist

### Decision and recovery

- [ ] Human owner accepted the documented direct-Production risk.
- [ ] Supabase plan and backup capability verified.
- [ ] Restorable backup verified.
- [ ] PITR status and retention recorded.
- [ ] Restore path and authority confirmed.
- [ ] Restore time and recovery objective accepted.
- [ ] Schema, role/ACL, function/trigger/policy, extension, and storage
      inventories captured.

### Execution control

- [ ] All package hashes matched exact local bytes.
- [ ] Package 1R read-only contract independently reviewed.
- [ ] Package 1R complete output externally approved.
- [ ] Maintenance mode active before any DDL/DML.
- [ ] Human user logged out and all application writes stopped.
- [ ] Providers, integrations, scheduled jobs, outbox, and workers disabled.
- [ ] Every package received separate written approval.
- [ ] Every manual section stopped and was externally reviewed.
- [ ] Every Package 2B index was individually approved.
- [ ] Every Package 3R batch used actual counts and an affected-row ceiling.
- [ ] Package 10 was not run unattended.

### Security, runtime, and application

- [ ] No operational grants introduced.
- [ ] All Core V2 flags remain disabled and kill switch remains true.
- [ ] Package 7 remains NOT EXECUTED without separate approval.
- [ ] No real customer notification occurred.
- [ ] Current application remains on the legacy route.
- [ ] No Git push or Vercel deployment occurred.
- [ ] Complete evidence is retained without secrets or PII.

**CORE V2 REMAINS DISABLED**

---

## 15. Current blockers and required next action

Production is not claimed ready. Current blockers:

1. Human-owner risk-acceptance record is not attached.
2. Supabase plan and backup status are not inspected.
3. PITR and retention are not inspected.
4. Restorable backup and restore path are not proven.
5. Restore authority and expected duration are not confirmed.
6. Required pre-execution inventories are not captured.
7. Package 1R has not been executed or externally reviewed.
8. No mutating package has separate approval.
9. Package 7 remains not executed.
10. Core V2 remains disabled.

Required next action:

Provide the non-secret backup, PITR, restoration, and authority evidence for
external review. Do not execute Package 1R until that gate is accepted.

---

## 16. Static amendment state

- SQL executed: **NO**
- Database connected: **NO**
- Backup created: **NO**
- Migration applied: **NO**
- Fixture created: **NO**
- Permission granted: **NO**
- Core V2 activated: **NO**
- Application changed: **NO**
- Package 1R executed: **NO**
- Package 7 executed: **NO**
- Production readiness claimed: **NO**

**PACKAGE 12-P CONTROLLED PRODUCTION PLAN APPROVED FOR EXTERNAL REVIEW**
