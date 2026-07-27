# AFEX Core V2 — Package 5R-B Controlled Production Run Card

Status: external review required  
Execution authority: manual operator only  
Core V2 state: disabled  
Runtime tests: NOT EXECUTED

## Frozen executable

| Artifact | Lines | Bytes | SHA-256 |
|---|---:|---:|---|
| `05-security.sql` | 1242 | 48352 | `df141eb3ad7c1ff9b9a2ca700a06b4493c524d671b384cf2c4d6a61b0fb569a3` |
| Required Package 4T | 3248 | 121830 | `40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7` |
| Required Package 2B-S | — | — | `009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d` |
| Required Package 6B | — | — | `46c0db2c04a2f48dd1519f72a8f627ca2ceae3ad0ad6af21a7897bc2bc3914ff` |

This card does not authorize execution.

## A. Preconditions and evidence mapping

- [ ] `05-security.sql` hash matches the table above. Evidence:
      local `Get-FileHash` output.
- [ ] Package 4T hash matches the table above. Evidence:
      local `Get-FileHash` output and the
      `documented_hash` row whose check name is `04-atomic-core.sql` from
      `05-pre-run-verification.sql`.
- [ ] Package 2B-S and 6B hashes match. Evidence: local hash output and their
      externally approved package records.
- [ ] Every mandatory contract row reports `PASS`.
- [ ] Every `documented_hash` row reports `EXTERNAL_EVIDENCE_REQUIRED` and has
      matching, separately retained local `Get-FileHash` evidence.
- [ ] Every `pre_owner_state` and `pre_acl_state` row is retained and has a
      named external reviewer acceptance decision.
- [ ] `CREATE_REQUIRED` appears only for `afex_core_owner`,
      `afex_context_issuer`, or `afex_outbox_worker`, and only when that role is
      absent. Package 5R-B is explicitly designed to create those three roles.
- [ ] No other category reports `EXTERNAL_EVIDENCE_REQUIRED`,
      `REVIEW_REQUIRED`, or `CREATE_REQUIRED`.
- [ ] No row reports `FAIL`.
- [ ] Package 4 signatures and overload checks pass. Evidence:
      `package4_signature` and `package4_overload` rows.
- [ ] Required tables, columns, indexes, constraints, functions, extensions,
      and roles pass. Evidence: corresponding pre-run categories.
- [ ] Stale functions are absent. Evidence: `stale_function` rows.
- [ ] Current owner and ACL captures are approved. Evidence:
      `pre_owner_state` and `pre_acl_state` export plus reviewer signature.
- [ ] Core V2 is disabled. Evidence: three `activation_state` rows and a
      separate deployment review proving all AFEX Core V2 environment flags
      are absent or not `true`.
- [ ] `create_order_atomic_v2` is closed to every reviewed browser/runtime
      role. Evidence: `atomic_entry_acl` rows.
- [ ] Backup and restoration authority are confirmed. Evidence:
      change-ticket backup record.
- [ ] Isolated Clone/Staging validation has passed. Evidence:
      approved Package 5 runtime, concurrency, authorization replay, role/ACL,
      and outbox-worker race reports.

STOP if any evidence is missing, failed, ambiguous, or has a hash mismatch.

## B. Backup and environment identity

- [ ] Production project identifier: `________________`
- [ ] Independent identity confirmation: `________________`
- [ ] Backup reference and UTC timestamp: `________________`
- [ ] Restoration method/operator: `________________`
- [ ] Latest restoration test: `________________`
- [ ] Change ticket: `________________`
- [ ] Maintenance window: `________________`
- [ ] Primary operator: `________________`
- [ ] Independent observer: `________________`
- [ ] STOP authority: `________________`
- [ ] Forward-fix/restoration authority: `________________`

No credential, URL, token, PIN, customer data, or secret may be retained.

## C. Pre-run procedure

1. Verify local hashes without a database connection.
2. Execute `05-pre-run-verification.sql` read-only.
3. Export every result row.
4. Apply these exact acceptance rules:
   - mandatory contract categories must report `PASS`;
   - `documented_hash` must report `EXTERNAL_EVIDENCE_REQUIRED` and be matched
     to separately retained local hash evidence;
   - `pre_owner_state` must report `PASS`, and both `pre_owner_state` and
     `pre_acl_state` require named external reviewer acceptance;
   - `CREATE_REQUIRED` is allowed only for the three dedicated roles and only
     when their observed value is `MISSING`;
   - every membership summary must report `PASS`, and no
     `role_membership_detail` row may exist;
   - any `FAIL`, unexpected review category, or missing row is a STOP.
5. Confirm activation and environment flags are disabled.
6. STOP on any failed, missing, or unreviewed dependency.

## D. Manual execution

The approved operator may execute only:

```text
database-reconciliation/core-v2/i5.9/05-security.sql
```

Rules:

- Execute the exact approved file as one script.
- Do not edit or retry individual statements.
- Do not invoke any newly defined runtime function.
- Do not grant `create_order_atomic_v2`.
- Do not activate Core V2.
- Record UTC start/end, transaction result, notices, and exact errors.

## E. Post-run verification

Execute `05-post-run-verification.sql` read-only and retain all rows.

- [ ] Three dedicated roles have exact safe attributes.
- [ ] Unsafe memberships are absent.
- [ ] All 24 Package 4T/5R-B signatures exist exactly once.
- [ ] All 24 owners are exact.
- [ ] Every `SECURITY DEFINER` function has `search_path=pg_catalog`.
- [ ] Function ACL matrix has no missing or unexpected EXECUTE.
- [ ] Atomic entry remains ungranted.
- [ ] Worker can execute only the three approved worker functions.
- [ ] Issuer can execute only its three owned context functions among Package
      4T/5R-B functions.
- [ ] Browser/service roles cannot access internal tables or runtime helpers.
- [ ] Four internal tables have RLS enabled.
- [ ] Seven exact policies pass command, role, USING, and CHECK verification.
- [ ] Schema, table, function, and default privileges pass.
- [ ] No unexpected overload, owner, role, membership, policy, or table
      privilege exists.
- [ ] Core V2 remains disabled.

STOP on any failure.

## F. Failure handling

1. STOP and preserve exact evidence.
2. Do not rerun partial statements.
3. Do not broaden privileges or disable RLS.
4. Do not use `05-rollback.sql` as an automatic reversal; it fails closed.
5. Request an externally reviewed forward fix or approved restoration.
6. If `05-rollback.sql` is inspected or intentionally invoked and the SQL
   client stops on its deliberate exception before reaching the textual
   `ROLLBACK`, explicitly issue `ROLLBACK` or close the failed transaction
   session before any later operation.

## G. Completion criteria

Package 5R-B installation is complete only after external acceptance of:

- all hashes;
- pre-run output;
- transaction output;
- post-run output;
- disabled-state evidence;
- isolated runtime/security test reports.

Completion does not authorize Package 6 activation, canary traffic, runtime
grants, or Production tests.
