# AFEX Enterprise Platform Core V2 — Package 11

## Isolated Execution Preflight and Operator Runbook

**DOCUMENTATION ONLY — RUNTIME TESTS NOT EXECUTED — CORE V2 DISABLED**

This runbook defines the gates required before the first isolated Core V2
execution. It does not authorize Production mutation, create an environment,
confirm a backup, execute SQL, create fixtures, grant privileges, or activate
Core V2.

---

## 1. Environment selection

### Priority order

1. **A — Preferred:** isolated clone of the Production schema with sanitized,
   representative data.
2. **B — Acceptable:** dedicated staging database matching the Production
   PostgreSQL version, extensions, roles, schemas, and baseline objects.
3. **C — Conditional:** isolated temporary validation database restored from an
   approved backup.

### Rejected environments

- Direct first execution in Production.
- Empty generic PostgreSQL without the Production baseline schema.
- Any environment containing unknown or partially installed Core V2 objects.
- Any environment without a tested restoration procedure and evidence.
- Any environment where WhatsApp, email, SMS, outbox delivery, scheduled
  workers, or other provider side effects remain enabled.

### Environment record

Complete this record without credentials, tokens, database URLs, or connection
strings:

| Field | Operator entry |
|---|---|
| Environment name | PENDING |
| Environment class (A/B/C) | PENDING |
| Supabase project reference or internal identifier | PENDING |
| Database name | PENDING |
| Region | PENDING |
| PostgreSQL version | PENDING |
| Restoration source timestamp | PENDING |
| Data sanitization status | PENDING |
| Environment owner/operator role | PENDING |
| Purpose | First isolated Core V2 validation |
| Expiration/cleanup date | PENDING |

**Environment-selection result: PENDING. No environment is claimed to exist.**

---

## 2. Mandatory environment-attestation checklist

Every item is blocking. An unchecked item means immediate STOP.

- [ ] The environment is not Production.
- [ ] Its A/B/C classification is approved.
- [ ] Production baseline schema version and source timestamp are identified.
- [ ] PostgreSQL server version is recorded and compatible.
- [ ] Required extensions, versions, and schemas are recorded.
- [ ] Complete schema inventory is recorded.
- [ ] Complete role and role-attribute inventory is recorded.
- [ ] Current SQL user identity and effective memberships are recorded.
- [ ] Database and session read-only states are recorded.
- [ ] No unknown or partial Core V2 object exists.
- [ ] Provider notifications are disabled.
- [ ] WhatsApp, email, and SMS side effects are disabled.
- [ ] Scheduled workers and delivery workers are disabled.
- [ ] Backup source and immutable identifier are recorded.
- [ ] Restoration procedure has been tested successfully.
- [ ] Restoration duration and evidence are recorded.
- [ ] Cleanup owner and expiration date are assigned.
- [ ] No credential or customer PII appears in the evidence location.

---

## 3. Backup and restoration gate

No package, including Package 1R, may run until all evidence below is accepted:

- [ ] Fresh source backup identifier and source timestamp.
- [ ] Schema-only dump hash and storage location.
- [ ] Role membership and ACL inventory.
- [ ] Function, trigger, and policy inventory.
- [ ] Extension inventory.
- [ ] Storage bucket/configuration snapshot where relevant, without object data
      or secrets.
- [ ] Written restoration procedure.
- [ ] Successful isolated restoration transcript.
- [ ] Restored-object comparison result.
- [ ] Restore duration.
- [ ] Named restore-owner role.
- [ ] Named rollback-decision-authority role.

The evidence must prove restoration, not merely state that a backup exists.
Commands containing passwords, tokens, credential-bearing URLs, or connection
strings are prohibited from this runbook and from captured evidence.

**Backup/restore gate: BLOCKED pending external evidence.**

---

## 4. Artifact hash attestation

The operator must recompute each SHA-256 from the exact local bytes immediately
before use. A mismatch means immediate STOP; no normalization or line-ending
rewrite is permitted.

| Package | Filename | SHA-256 | Lines | Type | Purpose | Reviewer | Operator verification |
|---|---|---|---:|---|---|---|---|
| 1R | `01-read-only-preflight.sql` | `8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a` | 1277 | Read-only executable | Baseline evidence | PENDING | PENDING |
| 2R | `02-schema-foundation.sql` | `92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92` | 1063 | DDL executable | Schema foundation | PENDING | PENDING |
| 2B | `02b-existing-table-indexes.sql` | `7b712bd7cb61603ef0afd5c96e4dcf533debb57adbaab577650f297a486b588b` | 418 | DDL executable | 14 concurrent indexes | PENDING | PENDING |
| 2B-S | `02c-security-foundation.sql` | `009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d` | 636 | DDL executable | Security foundation | PENDING | PENDING |
| 3R | `03-backfill.sql` | `58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208` | 1010 | Gated DML/DDL executable | Backfill/readiness | PENDING | PENDING |
| 10 | `10-clean-install-runtime.sql` | `07ea287c303452a94f7075b57ef254552f1247efebbfa13502cc681d8674e647` | 7527 | DDL/DML executable | Clean-install runtime | PENDING | PENDING |
| 7 | `07-final-verification.sql` | `deb28b9d635edb215bf223f057276d38d3fcbaf0390b7098d81b133bff01c6f8` | 1014 | Test executable | 130-test harness | PENDING | PENDING |
| Readiness | `08-execution-readiness.md` | `7a0f83464fa512e5863d97b1cacbd85654dfc1869c78b2e1a0265aebd753788c` | 313 | Documentation | Execution control | PENDING | PENDING |

Evidence file: `01-hashes/hash-attestation.txt`.

---

## 5. Package 1R run card

### Objective

Capture the exact isolated baseline through read-only metadata queries. Package
1R must not mutate data, schema, privileges, configuration, or runtime state.

### Preconditions

- Expected hash:
  `8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a`.
- Environment and backup gates are approved.
- Required session role is an externally approved metadata-review role with
  only the visibility needed for complete catalog evidence.
- The operator records `current_user`, `session_user`, database, server version,
  and target identifier before starting.
- The session and transaction are explicitly read-only.
- Approved statement and lock timeouts are recorded before execution.

### Required outputs

Capture all output without omission:

1. Server, database, and session identity.
2. PostgreSQL version and database read-only state.
3. Extensions and extension schemas.
4. Schemas.
5. Roles, memberships, and attributes.
6. Tables and columns.
7. Constraints.
8. Index definitions, validity, and readiness.
9. Functions, overloads, owners, security mode, and search path.
10. ACLs and default privileges.
11. RLS state and policies.
12. Triggers.
13. Legacy mutation paths.
14. Existing Core V2 collisions.
15. Feature and activation state.
16. Storage objects/configuration where relevant.

### Evidence and errors

- Raw output: `03-package-1r/raw-output.txt`.
- Errors: `03-package-1r/errors.txt`.
- Operator notes: `03-package-1r/operator-notes.md`.
- Any mutation indication, permission gap, timeout, cancellation, truncated
  output, or client error is a STOP.
- A timeout does not authorize a rerun with broader privileges or no timeout.
  Record the exact failed section and submit it for review.

### Mandatory stop

After the last statement, STOP. Do not run Package 2R.

**Package 1R runtime state: NOT EXECUTED.**

---

## 6. Package 1R external review gate

The complete output is saved and reviewed before any later package:

- [ ] All Production-baseline assumptions are confirmed.
- [ ] Schema drift is classified.
- [ ] Missing objects are investigated.
- [ ] Unexpected objects are resolved or block execution.
- [ ] Unsafe role attributes are resolved or block execution.
- [ ] Invalid or not-ready indexes block execution.
- [ ] Unknown triggers, policies, functions, or mutation paths block execution.
- [ ] Core V2 collisions are absent.
- [ ] The external reviewer signs `03-package-1r/reviewer-decision.md`.

Only these decisions are valid:

- `PACKAGE 1R OUTPUT APPROVED — CONTINUE`
- `PACKAGE 1R OUTPUT BLOCKED — REMEDIATION REQUIRED`

There is no automatic continuation.

---

## 7. Final clean-install execution sequence

1. Package 1R read-only preflight.
2. Manual STOP and external review of Package 1R results.
3. Package 2R schema foundation.
4. Manual STOP, Package 2R postcheck, and external review.
5. Package 2B: fourteen individually controlled concurrent-index sections.
6. Manual STOP and review after every concurrent index.
7. Package 2B complete postcheck and external review.
8. Package 2B-S security foundation.
9. Manual STOP, Package 2B-S postcheck, and external review.
10. Package 3R gated backfill, one logical section/batch at a time.
11. Manual STOP, Package 3R postcheck, and external review.
12. Package 10 clean-install runtime, one manual phase/transaction at a time.
13. Manual STOP, Package 10 postflight, and external review.
14. Package 7 fixture preparation.
15. Package 7 runtime execution only after separate written approval.

**Package 7: NOT EXECUTED.**

---

## 8. Package 2R run card

### Contract

- Hash:
  `92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92`.
- One explicit transaction.
- Creates three empty tables: `financial_quotes`,
  `idempotency_commands`, and `atomic_outbox`.
- Adds nullable foundation columns to `customers`, `orders`, `invoices`,
  `invoice_items`, `inventory_stock`, `inventory_movements`, and `audit_logs`.
- Adds reviewed CHECK and FK constraints, using `NOT VALID` where documented.
- Adds indexes on the three new tables.
- Does not backfill, create functions/triggers, configure RLS, grant runtime
  privileges, activate Core V2, or build Package 2B indexes.

### Risk and postchecks

- Nullable column additions and `NOT VALID` constraints require brief
  `ACCESS EXCLUSIVE` locks but should not rewrite legacy rows.
- New-table index creation is transactional.
- Exact postchecks must confirm tables, columns, defaults, nullability,
  constraints, indexes, and zero unexpected legacy-row mutations.
- An invalid/not-ready or conflicting index is a STOP.
- Failure before COMMIT rolls back the transaction.
- A post-COMMIT failure leaves Package 2R objects installed; do not rerun,
  drop, or repair automatically. Capture inventory and request a reviewed
  forward-fix or rollback.

Evidence: `04-package-2r/`.
Manual approval is required before Package 2B.

---

## 9. Package 2B — fourteen index run cards

Global contract:

- Hash:
  `7b712bd7cb61603ef0afd5c96e4dcf533debb57adbaab577650f297a486b588b`.
- No explicit transaction.
- No `IF NOT EXISTS`.
- No automatic drop, rename, retry, or repair.
- Section A precheck must emit `PRECHECK_CREATE_REQUIRED`.
- Each index requires an individual STOP and approval.
- Section C must emit `POSTCHECK_PASS`.
- Canonical-name conflict, equivalent-index conflict, invalid index, or
  not-ready index blocks continuation.

For every card: precheck canonical name, table/columns, predicate, equivalent
definitions, validity, and readiness; run only its reviewed concurrent build;
then verify exact definition, `indisvalid=true`, and `indisready=true`.

| Card | Canonical index | Purpose | Predicate | Evidence |
|---:|---|---|---|---|
| B1 | `idx_customers_tenant_phone_normalized` | Tenant phone lookup | `phone_normalized IS NOT NULL` | `05-package-2b/B01-customers-phone.txt` |
| B2 | `idx_orders_idempotency_command` | Order/idempotency linkage | `idempotency_command_id IS NOT NULL` | `05-package-2b/B02-orders-idempotency.txt` |
| B3 | `idx_orders_correlation` | Order correlation lookup | `correlation_id IS NOT NULL` | `05-package-2b/B03-orders-correlation.txt` |
| B4 | `idx_invoices_financial_quote` | Invoice/quote linkage | `financial_quote_id IS NOT NULL` | `05-package-2b/B04-invoices-quote.txt` |
| B5 | `idx_invoices_request_fingerprint` | Tenant request fingerprint | `request_fingerprint IS NOT NULL` | `05-package-2b/B05-invoices-request.txt` |
| B6 | `idx_invoices_quote_fingerprint` | Tenant quote fingerprint | `quote_fingerprint IS NOT NULL` | `05-package-2b/B06-invoices-quote-fingerprint.txt` |
| B7 | `idx_inventory_movements_order` | Movement/order linkage | `order_id IS NOT NULL` | `05-package-2b/B07-movements-order.txt` |
| B8 | `idx_inventory_movements_invoice` | Movement/invoice linkage | `invoice_id IS NOT NULL` | `05-package-2b/B08-movements-invoice.txt` |
| B9 | `idx_inventory_movements_invoice_item` | Movement/invoice-item linkage | `invoice_item_id IS NOT NULL` | `05-package-2b/B09-movements-item.txt` |
| B10 | `idx_inventory_movements_correlation` | Tenant correlation timeline | `correlation_id IS NOT NULL` | `05-package-2b/B10-movements-correlation.txt` |
| B11 | `idx_audit_logs_order` | Audit/order linkage | `order_id IS NOT NULL` | `05-package-2b/B11-audit-order.txt` |
| B12 | `idx_audit_logs_invoice` | Audit/invoice linkage | `invoice_id IS NOT NULL` | `05-package-2b/B12-audit-invoice.txt` |
| B13 | `idx_audit_logs_customer` | Audit/customer linkage | `customer_id IS NOT NULL` | `05-package-2b/B13-audit-customer.txt` |
| B14 | `idx_audit_logs_correlation` | Tenant audit correlation timeline | `correlation_id IS NOT NULL` | `05-package-2b/B14-audit-correlation.txt` |

After each build:

1. STOP.
2. Save raw output and catalog postcheck.
3. External reviewer records approval.
4. Continue only to the next numbered card.

If a build fails, a partial invalid index may remain. Record its exact catalog
state. The cleanup/forward-fix decision owner is the external SQL reviewer with
the environment owner; no automatic retry or drop is allowed.

---

## 10. Package 2B-S run card

- Hash:
  `009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d`.
- Purpose: trusted authorization-context foundation and quote linkage.
- Verify baseline scope keys first.
- Build and verify the reviewed composite tenant/branch/profile support
  indexes under the package's own section boundaries.
- Add `atomic_authorization_contexts` and the quote-context linkage foundation.
- Verify exact constraints, RLS state, policies, owners, and privilege closure.
- Expected: fail-closed objects, no issuer/consumer business logic, no worker
  delivery, no feature activation, and no operational execute grants.
- Stop on missing scope objects, unsafe role attributes, conflicting index or
  object definitions, permissive browser access, unexpected owner, policy drift,
  or any runtime grant.
- Capture before/after role, owner, ACL, RLS, policy, table, constraint, and
  index inventories in `06-package-2b-s/`.
- Rollback/forward-fix ownership: security reviewer plus external SQL reviewer.
  No broad privilege restoration is allowed.

Manual STOP and external approval are required before Package 3R.

---

## 11. Package 3R run card

- Hash:
  `58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208`.
- Actual mutating sections:
  - Section B: one bounded batch setting missing
    `customers.phone_normalized` from the canonical derived value.
  - Section C: one bounded batch setting missing customer
    `record_version` to `1`.
  - Section D: one bounded batch setting missing inventory-stock
    `record_version` to `1`.
  - Section G: standalone concurrent unique index
    `uq_customers_tenant_phone_normalized`.
  - Section I: separately gated validation of
    `ck_customers_phone_normalized`, `ck_customers_record_version`, and
    `ck_inventory_stock_record_version`.
- All candidate counts must come from the actual approved Package 1R/Package 3R
  evidence. This runbook provides no estimated row count.
- Updates are null-only/missing-only and must retain tenant boundaries.
- Duplicate normalized identities, missing tenants, invalid phones, conflicting
  populated values, or invalid versions block mutation.
- Record selected candidate count, affected row count, remaining count, batch
  duration, and lock observations for each batch.
- STOP after every logical batch and every validation subsection.
- The unique index runs outside a transaction; an invalid artifact may remain
  after failure and must not be dropped automatically.
- Rerun only when the package's own readiness output says the exact section is
  required and external review approves it.
- Committed batches are not assumed transactionally reversible. Preserve them
  and obtain a reviewed forward-fix; never auto-merge/delete customers.

Evidence: `07-package-3r/`.

---

## 12. Package 10 run card

### Contract

- Hash:
  `07ea287c303452a94f7075b57ef254552f1247efebbfa13502cc681d8674e647`.
- Mandatory clean-install composition after Packages 1R, 2R, 2B, 2B-S, and 3R.
- Exact 87-object manifest:
  - 6 NOLOGIN roles.
  - 7 tables.
  - 5 indexes.
  - 39 functions.
  - 7 triggers.
  - 23 policies.
- No operational execute grants, credentials, fixtures, provider delivery, or
  cutover.

### Manual phases and four transaction groups

1. **Phase A — read-only foundation/collision preflight.**
   Verify pgcrypto functions, baseline relations, Package 3R readiness,
   foundation contracts, absence of all six role collisions, and absence of
   unknown Core V2 runtime objects. STOP and review.
2. **Transaction A / Phase B — six NOLOGIN roles.**
   COMMIT, capture roles/attributes, then STOP.
3. **Transaction B / Phase C — fail-closed metadata.**
   Create seven tables, five indexes, initial disabled control rows, immutable
   evidence metadata, managed-identity metadata, and rate-limit metadata.
   COMMIT, capture inventory/state, then STOP.
4. **Transaction C / Phases D–I — final function and trigger bodies.**
   Install the reviewed atomic, authorization, outbox, canary, rate-limit,
   quote-validation, operator, readiness, normalization, quote, and immutable
   trigger contracts. Do not invoke operational paths. COMMIT, capture exact
   signatures/body hashes/dependencies, then STOP.
5. **Transaction D / Phases J–K — ownership, ACL, RLS, and policies.**
   Apply internal ownership and fail-closed access. Operational grants remain
   deferred. COMMIT, capture owners/ACL/RLS/policies, then STOP.
6. **Phase M — read-only postflight.**
   Verify the complete 87-object manifest, exact signature/body/dependency
   parity, ownership, privilege closure, policy/trigger inventory, and disabled
   activation state. STOP for external review.

### Required disabled state

Package 10 must leave exactly:

```text
global_enabled=false
kill_switch=true
deterministic_canary_percentage=0
pos_enabled=false
admin_orders_enabled=false
quote_issuer_enabled=false
outbox_worker_enabled=false
```

### Failure handling

- Collision rejection is fail-closed.
- STOP after every manual phase and COMMIT.
- Never blind-rerun Package 10.
- Never automatically repair, drop, rename, grant, or activate.
- Record the last successful transaction and exact partial inventory.
- Use only a separately reviewed conservative rollback or forward-fix.

Evidence: `08-package-10/`.

---

## 13. Partial-failure matrix

| Failure point | Expected state | Rolled back? | Partial objects possible? | Allowed next action | Prohibited action | Required evidence/review |
|---|---|---:|---:|---|---|---|
| Package 2R before COMMIT | Pre-2R state | Yes | No committed 2R objects | Capture error; external review | Continue to 2B | Transcript, error, rollback proof |
| Package 2R after COMMIT/postcheck | 2R committed, readiness unknown | No | Yes | Freeze; inventory; reviewed forward-fix/rollback | Blind rerun/drop | Before/after inventory and reviewer decision |
| Package 2B precheck | No new current index | N/A | Earlier approved indexes may exist | Resolve conflict externally | Run current/next index | Precheck output and catalog definitions |
| Concurrent index build | Build may fail independently | No transaction rollback | Invalid/not-ready index may remain | Freeze; inspect; reviewed cleanup | Automatic drop/retry | Client error, `pg_index` state, lock evidence |
| Package 2B postcheck | Fourteen builds attempted | No | Wrong/duplicate/invalid artifact possible | Freeze and review exact delta | Continue to 2B-S | Full index definitions/validity/readiness |
| Package 2B-S transaction | Last committed section only | Current transaction only | Prior concurrent support indexes may remain | Inventory and reviewed recovery | Broad privilege changes | Roles/ACL/RLS/policy/index evidence |
| Package 3R backfill | Prior batches may be committed | Current batch only | Yes, expected bounded progress | Record cursor/count; reviewed resume/forward-fix | Unbounded rerun/reverse update | Candidate/affected/remaining counts |
| Package 10 Transaction A | Phase B roles attempted | Current transaction | Prior preflight only | Fix cause externally | Continue to B/C | Role inventory and transaction outcome |
| Package 10 Transaction B | Metadata attempted | Current transaction | Roles from A remain | Freeze after rollback; review | Continue to C | Table/index/control-state inventory |
| Package 10 Transaction C | Functions/triggers attempted | Current transaction | A+B remain | Freeze; exact dependency review | Continue to D | Signature/body/dependency inventory |
| Package 10 Transaction D | Ownership/security attempted | Current transaction | A+B+C remain | Freeze; ACL/RLS diff review | Grant/activate/rerun | Owners, ACLs, policies, memberships |
| Package 10 postflight | All four groups committed | No | Complete but uncertified install | Keep disabled; external remediation plan | Package 7 fixtures/activation | Full 87-object postflight and flags |
| Package 7 fixture preparation | Runtime still untested | Depends on fixture operation | Exact fixtures may remain | Cleanup by approved exact IDs; review | Run tests with unapproved fixtures | Fixture manifest and cleanup proof |
| Package 7 runtime test | Test-specific state | Test dependent | Approved fixtures/evidence may remain | Stop suite; preserve evidence; approved cleanup | Mark PASS/continue automatically | Both-session transcripts, result, cleanup |

Every failure requires external review before continuation.

---

## 14. Runtime evidence directory

Use:

```text
database-reconciliation/core-v2/i5.9/runtime-evidence/<run-id>/
├── 00-environment/
├── 01-hashes/
├── 02-backup-restore/
├── 03-package-1r/
├── 04-package-2r/
├── 05-package-2b/
├── 06-package-2b-s/
├── 07-package-3r/
├── 08-package-10/
├── 09-package-7-fixtures/
├── 10-package-7-runtime/
├── 11-readiness/
└── 12-final-review/
```

Each applicable directory contains:

- `environment-attestation.md`
- `hash-attestation.txt`
- `backup-restore-attestation.md`
- `raw-output.txt`
- `operator-notes.md`
- `reviewer-decision.md`
- `before-after-inventory.txt`
- `errors.txt`
- `partial-failure-state.md`

Do not store passwords, tokens, JWTs, PINs, credential-bearing URLs, connection
strings, secrets, or customer PII.

---

## 15. Package 7 preparation gate

Preparation begins only when all are approved:

- [ ] Package 10 postflight passed external review.
- [ ] All seven global activation values retain the required disabled state.
- [ ] Kill switch remains true.
- [ ] No operational grants exist.
- [ ] Provider delivery and scheduled workers remain disabled.
- [ ] Managed test identities are approved.
- [ ] Fixture manifest is externally reviewed.
- [ ] A second isolated tenant is available.
- [ ] Multi-session operators are assigned.
- [ ] Exact rollback/cleanup plan is approved.
- [ ] Package 7 hash is recomputed and matches.

**RUNTIME TESTS: NOT EXECUTED**

---

## 16. Execution-authority matrix

No role may execute and self-approve a failed or unexpected result.

| Role | Execute | Approve continuation | Stop | Restore | Forward-fix | Package 7 start | Canary preparation |
|---|---|---|---|---|---|---|---|
| Human SQL operator | Approved package sections | No self-approval | Yes | No | No | No | No |
| External SQL reviewer | No | SQL/package gates | Yes | Recommend | Review | Joint approval | No |
| Environment owner | Environment controls | Environment gates | Yes | Joint | Review environment impact | Joint | No |
| Backup/restore owner | Restore procedure | Restore evidence | Yes | Yes, when authorized | No | No | No |
| Security reviewer | Security evidence only | Security/ACL gates | Yes | No | Security approval | Joint | Security gate |
| Runtime-test coordinator | Approved Package 7 run | Test sequencing only | Yes | No | No | Coordinate after approval | No |
| Application owner | No SQL execution | Compatibility/cutover gate | Yes | No | Application review | Joint | Application gate |
| Final activation approver | No routine execution | Final activation only | Yes | Authorize with owners | Authorize reviewed plan | Final prerequisite | Final authority |

Any operator, reviewer, environment owner, security reviewer, or activation
approver may issue STOP. Restoration and forward-fix require their designated
authorities and external review.

---

## 17. Final operator checklist

- [ ] Correct isolated non-Production environment selected.
- [ ] All hashes recomputed and matched.
- [ ] Backup restoration tested and approved.
- [ ] Providers and workers disabled.
- [ ] Package 1R output externally reviewed.
- [ ] Every package reviewed before the next package.
- [ ] All 14 concurrent indexes individually approved.
- [ ] No unexpected schema, role, trigger, policy, or privilege drift.
- [ ] No operational grants.
- [ ] All activation flags disabled and kill switch true.
- [ ] Complete evidence stored without secrets or PII.
- [ ] Package 7 remains NOT EXECUTED unless separately approved.
- [ ] Production mutation remains prohibited.

**CORE V2 REMAINS DISABLED**

---

## 18. Current static status and blockers

Static document checks can confirm only the artifact contents and repository
scope. They cannot confirm an environment, backup, restore, SQL parse,
execution, installed object, runtime test, or Production readiness.

Remaining blockers:

1. Environment selection and attestation.
2. Backup/restore evidence.
3. External hash attestation for this Package 11 document.
4. Package 1R execution and external review.
5. Package-by-package execution approvals.
6. Package 10 postflight approval.
7. Package 7 fixtures and separate runtime approval.
8. Any future cutover, canary, or activation authorization.

Required next action: external review of this runbook, followed only by
environment and backup/restore evidence preparation. No SQL execution is
authorized by Package 11.

---

## 19. Final state

- SQL executed: **NO**
- Database connected: **NO**
- Production mutated: **NO**
- Migration applied: **NO**
- Core V2 activated: **NO**
- Grants created: **NO**
- Fixtures created: **NO**
- Runtime evidence inserted: **NO**
- Package 1R executed: **NO**
- Package 7 executed: **NO**
- Application changed: **NO**

**PACKAGE 11 ISOLATED EXECUTION PREFLIGHT APPROVED FOR EXTERNAL REVIEW**
