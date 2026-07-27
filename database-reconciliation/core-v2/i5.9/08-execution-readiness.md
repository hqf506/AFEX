# AFEX Enterprise Platform Core V2 — Execution Readiness

## Package 10-B synchronization state

**STATIC SYNCHRONIZATION ONLY — RUNTIME TESTS NOT EXECUTED — CORE V2 DISABLED**

This document synchronizes the execution-readiness contract with the finalized
clean-install runtime in Package 10. It does not authorize execution, activate
Core V2, certify Production, or record any runtime test as passed.

No SQL was executed while preparing this document. No Supabase or Production
connection was made.

---

## 1. Immutable artifact inventory

The operator must calculate each SHA-256 from the exact local bytes immediately
before execution and compare it with this inventory. PostgreSQL cannot attest
repository hashes.

| Step | Artifact | Approved SHA-256 | Purpose | Runtime state |
|---:|---|---|---|---|
| 1 | `01-read-only-preflight.sql` (Package 1R) | `8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a` | Read-only evidence and blockers | NOT EXECUTED |
| 2 | `02-schema-foundation.sql` (Package 2R) | `92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92` | Additive schema foundation | NOT EXECUTED |
| 3 | `02b-existing-table-indexes.sql` (Package 2B) | `7b712bd7cb61603ef0afd5c96e4dcf533debb57adbaab577650f297a486b588b` | Existing-table indexes | NOT EXECUTED |
| 4 | `02c-security-foundation.sql` (Package 2B-S) | `009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d` | Security roles and foundation | NOT EXECUTED |
| 5 | `03-backfill.sql` (Package 3R) | `58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208` | Evidence-gated backfill | NOT EXECUTED |
| 6 | `10-clean-install-runtime.sql` (Package 10) | `07ea287c303452a94f7075b57ef254552f1247efebbfa13502cc681d8674e647` | Deterministic clean-install runtime | NOT EXECUTED |
| 7 | `07-final-verification.sql` (Package 7-Sync) | Externally attest the exact final file | 130-test verification harness | NOT EXECUTED |
| — | `08-execution-readiness.md` (this file) | Externally attest the exact final file | Operator control document | NOT EXECUTED |

Package 10 is **mandatory for every clean install**. The former source-package
chain is not an additional execution chain. Package 10 already embodies the
approved runtime definitions whose provenance hashes are:

| Source attestation | Approved SHA-256 |
|---|---|
| Package 4T | `40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7` |
| Package 5R-B | `eb5ad92396a57022f35cd7a58f6c6f85e7ea735c3306f40040c084e82ecb13b7` |
| Package 6-Sync | `06b7c27a249b07d0fc58c8e22dd046376a85fb7e507a050a9d33f10e1c8205e3` |
| Package 6A-B | `30875dfdff59eda1aec4254d6ce1e610e09bfdf857506f682f9e8c8bae3f3a08` |
| Package 6B | `46c0db2c04a2f48dd1519f72a8f627ca2ceae3ad0ad6af21a7897bc2bc3914ff` |

These five artifacts remain immutable review evidence. They are not separately
executed after Package 10 on the clean-install path.

Reference-only reconciliation artifacts:

- `09-execution-dependency-reconciliation.md`
- `10a-deep-static-audit.md`

Neither reference document is executable.

---

## 2. Canonical execution paths

### 2.1 Clean-install path

The only approved clean-install sequence is:

```text
Package 1R
  → Package 2R
  → Package 2B
  → Package 2B-S
  → Package 3R
  → Package 10
  → Package 7-Sync
```

Rules:

1. Stop after any failed hash, precondition, SQL section, or evidence gate.
2. Package 10 must not be skipped, decomposed into older runtime packages, or
   followed by the obsolete Package 4/5/6 execution chain.
3. Package 7 runs only after Package 10 completes and the final installed-object
   inventory is captured.
4. All 130 Package 7 tests remain blocking unless the manifest explicitly marks
   their evidence class otherwise. No skipped, blocked, or inconclusive blocking
   test may be converted to PASS.
5. Completion of Package 7 does not activate Core V2. Activation requires a
   separate approved change window and explicit operator decision.

### 2.2 Upgrade path

Package 10 is a deterministic **clean-install** runtime and is collision
fail-closed. It must not be blindly executed against an existing Core V2
runtime.

For an upgrade:

1. Run Package 1R as read-only evidence.
2. Capture current object definitions, owners, ACLs, constraints, indexes,
   triggers, policies, and runtime state.
3. Compare the installed state with Package 10 and its immutable source
   attestations.
4. Prepare a separately reviewed additive or forward-fix upgrade package for
   the exact delta. This document does not provide or authorize that SQL.
5. Apply only approved foundation/backfill steps whose preflights prove they are
   valid for the target.
6. Run Package 7 only after external evidence proves semantic parity with the
   finalized Package 10 state.

The clean-install chain must not be misrepresented as an in-place upgrade plan.

---

## 3. Operator run cards

Every card requires: operator name, UTC start/end, target identifier, command
transcript, SQL client version, exit code, stdout/stderr capture, artifact hash,
and evidence location. Never place passwords, connection strings, tokens, raw
customer data, or provider secrets in the evidence bundle.

### RC-01 — Package 1R read-only preflight

- Verify the Package 1R hash.
- Use a read-only session and an approved timeout budget.
- Capture every result set without normalization.
- Stop on missing tenant data, identity duplicates, numbering conflicts,
  inventory inconsistencies, or orphan/snapshot blockers.
- Writes, locks for update, fixtures, and activation are prohibited.
- Rollback: none; Package 1R is read-only.

### RC-02 — Package 2R schema foundation

- Verify the Package 2R hash and Package 1R evidence acceptance.
- Confirm the target is the approved clean-install environment.
- Execute section boundaries exactly as documented by the package.
- Capture created objects and constraint validation state.
- Stop on any pre-existing object with a conflicting definition.
- Rollback: transaction rollback before commit; after commit use only a
  separately reviewed forward-fix or explicit object-by-object rollback.

### RC-03 — Package 2B existing-table indexes

- Verify the Package 2B hash.
- Recheck index names and definitions before each operation.
- Respect `CREATE INDEX CONCURRENTLY` transaction restrictions.
- Record invalid-index cleanup decisions explicitly.
- Stop if an existing index has the expected name but a different definition.
- Rollback: do not drop automatically; use a separately reviewed
  `DROP INDEX CONCURRENTLY` plan only when dependency evidence permits.

### RC-04 — Package 2B-S security foundation

- Verify the Package 2B-S hash.
- Confirm required managed roles exist and owner changes are supported.
- Capture owners, memberships, ACLs, RLS state, policies, and function execute
  privileges before and after each approved section.
- Prove no browser runtime execute grant was introduced.
- Rollback: follow the package section boundaries; never broadly restore
  `PUBLIC`, `anon`, or `authenticated` privileges.

### RC-05 — Package 3R backfill

- Verify the Package 3R hash.
- Confirm all Package 3 preflight result sets are accepted.
- Use the documented bounded batching and resume markers.
- Re-run duplicate, invalid-value, tenant, and version checks after every batch.
- Do not auto-merge or delete customer, order, invoice, or inventory history.
- Rollback: stop the next batch; preserve evidence; use an approved forward-fix
  for committed batches rather than an unbounded reverse update.

### RC-06 — Package 10 deterministic clean-install runtime

- Verify the Package 10 hash and all five immutable source attestations.
- Confirm the target has no conflicting Core V2 runtime object.
- Confirm Packages 2R, 2B, 2B-S, and 3R completed with accepted evidence.
- Execute Package 10 in its documented transaction/section order only.
- Capture object definitions, owners, ACLs, RLS, policies, triggers, and grants.
- Confirm Core V2 remains disabled and no runtime browser grant exists.
- Stop after any failed section; do not continue and do not substitute an older
  Package 4/5/6 artifact.
- Rollback: Package 10 is not treated as one giant reversible transaction.
  Record the last committed boundary and use its documented conservative
  rollback or a separately reviewed forward-fix. Never blind-rerun after a
  partial state.

### RC-07 — Package 7-Sync verification

- Calculate and externally attest the final Package 7 hash.
- Verify the exact chain:
  `1R → 2R → 2B → 2B-S → 3R → 10 → 7`.
- Confirm provider delivery is disabled and all fixtures are isolated.
- Execute the 130-test manifest in the approved scope.
- Preserve raw result rows and evidence references.
- A blocking test is PASS only when its expected result is proven.
- Any skipped, blocked, failed, or inconclusive blocking test stops readiness.
- Runtime state remains NOT EXECUTED until this card is actually performed.
- Rollback/cleanup: restore session-local settings, remove only exact approved
  fixtures, and preserve immutable evidence. Do not mutate business data.

---

## 4. Evidence and certification rules

1. Static review is not runtime execution.
2. A successful SQL client exit code is not proof that every test passed.
3. Evidence must bind the artifact hash, target, actor, timestamp, test ID, input
   scope, expected result, actual result, and cleanup result.
4. The Package 7 manifest remains exactly 130 tests.
5. No test result may be inferred from a previous environment or a previous
   artifact hash.
6. Secrets and sensitive PII must be redacted; tenant-isolation evidence must
   use approved synthetic or masked fixtures.
7. Multi-session concurrency evidence must preserve both session transcripts.
8. Runtime state may change from `NOT EXECUTED` only through an externally
   witnessed Package 7 run with complete evidence.
9. Core V2 remains disabled even after successful verification until a separate
   activation approval is issued.

---

## 5. Rollback and forward-fix references

| Artifact | Failure before commit | Failure after commit |
|---|---|---|
| Package 1R | Not applicable; read-only | Not applicable |
| Package 2R | Roll back active transaction | Reviewed forward-fix or explicit object rollback |
| Package 2B | Stop current concurrent operation | Inspect validity/dependencies; reviewed concurrent drop/rebuild |
| Package 2B-S | Roll back current transactional section | Restore only from captured ACL/owner evidence with reviewed SQL |
| Package 3R | Stop before next batch | Preserve completed batches; reviewed forward-fix |
| Package 10 | Roll back current documented boundary | Record partial boundary; conservative rollback/forward-fix only |
| Package 7 | Roll back test transaction/session state | Exact fixture cleanup; preserve evidence |

Never use broad destructive rollback, migration-history repair, schema reset, or
blind package replay. Never restore global customer-phone uniqueness or broaden
runtime privileges as a rollback shortcut.

---

## 6. Operator checklist

### Before the window

- [ ] Target is explicitly classified as clean install or upgrade.
- [ ] A clean install uses Package 10; no obsolete runtime chain is scheduled.
- [ ] An upgrade has a separately approved delta and does not blindly run
      Package 10.
- [ ] All artifact SHA-256 values match the immutable inventory.
- [ ] Final hashes for Package 7 and this readiness document are externally
      recorded.
- [ ] Backup, restore rehearsal, recovery owner, and stop authority are approved.
- [ ] PostgreSQL/client versions and required extensions are verified.
- [ ] Managed roles, owners, and privilege boundaries are verified.
- [ ] Lock, statement, and idle transaction timeouts are approved.
- [ ] Provider delivery is disabled for verification.
- [ ] Test tenants, branches, products, customers, employees, orders, payments,
      and cleanup IDs are isolated and recorded.
- [ ] No secrets or Production PII will enter evidence logs.

### During execution

- [ ] Execute run cards in canonical order without substitution.
- [ ] Record timestamps, exit codes, row counts, notices, and errors.
- [ ] Stop immediately on hash mismatch, preflight blocker, object collision,
      invalid index, privilege drift, or unexpected target state.
- [ ] Do not continue after a failed committed boundary.
- [ ] Do not create ad-hoc fixtures or grants.
- [ ] Confirm Core V2 remains disabled after every package.

### Package 7 gate

- [ ] Exact final Package 7 hash is attested.
- [ ] All 130 manifest tests were attempted in the approved scope.
- [ ] Every blocking test is PASS with attached evidence.
- [ ] No blocking test is skipped, blocked, failed, or inconclusive.
- [ ] Concurrency, replay, financial, inventory, numbering, authorization,
      tenant, branch, audit, outbox, privilege, and cleanup evidence is complete.

### After the window

- [ ] Installed object inventory and privilege snapshots are captured.
- [ ] Fixture cleanup is verified by exact identifiers.
- [ ] Provider delivery remains disabled unless separately approved.
- [ ] Runtime state and Core V2 feature state are recorded truthfully.
- [ ] Activation is not performed under this readiness pack.

---

## 7. Remaining blockers

The following remain unresolved until external execution governance completes:

1. External attestation of the final Package 7 and Package 10-B document hashes.
2. Approved isolated target and explicit clean-install/upgrade classification.
3. Accepted Package 1R evidence with no blocking data conditions.
4. Backup, restore, timeout, locking, and partial-failure rehearsal.
5. Managed role and ownership compatibility in the target environment.
6. Approved synthetic fixtures and provider-delivery isolation.
7. Actual execution of Packages 2R, 2B, 2B-S, 3R, and Package 10.
8. Actual execution and evidence capture for all 130 Package 7 tests.
9. Separate application cutover and Core V2 activation approval.
10. A separately reviewed upgrade delta for any non-clean target.

---

## 8. Final synchronized decision

The documentation and Package 7 prerequisite contract are synchronized with
Package 10. Package 10 is mandatory for clean install, obsolete execution-order
assumptions are removed, and the upgrade path is explicitly separated.

**RUNTIME TESTS: NOT EXECUTED**

**CORE V2: DISABLED**

**EXECUTION AUTHORIZATION: NOT GRANTED**

This static synchronization is ready for external Package 10-B review only.
