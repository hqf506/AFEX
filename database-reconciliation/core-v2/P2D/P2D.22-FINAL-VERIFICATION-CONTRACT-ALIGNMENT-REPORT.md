# P2D.22 Final Verification Authorization Contract Alignment Report

## Executive verdict

The final-verification defect is corrected through a forward-only,
verification-only contract. No Production mutation or historical migration
change is required.

## Root cause

P2D.20 migration verification and attestation compared only the eleven
`afex_function_owner` column ACL rows. P2D.21D then rejected every
authorization column ACL belonging to another grantee. That blanket predicate
incorrectly rejected fourteen reviewed `authenticated` application ACL rows.
The packages did not consume one complete authorization contract.

## Evidence reviewed

- Successful P2D.21S evidence:
  `evidence/P2D.21S-20260730T211237722Z`
- P2D.21Q diagnostic and P2D.21R contract-resolution artifacts.
- `database-reconciliation/baseline/production-baseline.sql`, including the
  target-table grants and PostgreSQL/Supabase default privileges.
- `database-reconciliation/evidence/R6/production-public-schema-raw.sql`.
- `supabase/migrations/20260713090000_secure_pos_pin_credentials.sql`.
- P2D.20 migration and post-install attestation.
- P2D.21D final verification.

## Canonical contract design

The machine-readable reference contains four deterministic sections:

1. exact direct column ACL tuples;
2. exact direct table ACL tuples;
3. exact RLS/FORCE RLS states;
4. exact policy identities, commands, permissiveness, single role, USING
   expression, and WITH CHECK expression.

Every ACL tuple includes schema, table, nullable column, grantor, grantee,
privilege, grantability, classification, and management boundary.

## Exact 25 direct column ACL rows

### Core V2 — afex_function_owner — SELECT — non-grantable

- `profiles.id`
- `profiles.tenant_id`
- `profiles.branch_id`
- `profiles.role`
- `profiles.is_active`
- `profiles.updated_at`
- `tenants.id`
- `branches.id`
- `branches.tenant_id`
- `branches.is_active`
- `branches.deleted_at`

### Application — authenticated — non-grantable

- `profiles.branch_id` SELECT
- `profiles.contact_email` SELECT
- `profiles.contact_email` UPDATE
- `profiles.full_name` SELECT
- `profiles.full_name` UPDATE
- `profiles.id` SELECT
- `profiles.is_active` SELECT
- `profiles.phone` SELECT
- `profiles.phone` UPDATE
- `profiles.role` SELECT
- `profiles.tenant_id` SELECT
- `profiles.tenant_name` SELECT
- `profiles.updated_at` UPDATE
- `profiles.username` SELECT

All 25 rows freeze grantor `postgres`.

## Table-level ACL management decision

Decision A: include the exact direct table ACL inventory.

Repository baseline, raw Production schema evidence, default privileges, and
the completed P2D.21S diagnostic agree. Each target table has the eight
PostgreSQL 17 privileges `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`,
`REFERENCES`, `TRIGGER`, and `MAINTAIN`, granted non-grantably by `postgres`
to `postgres`, `anon`, `authenticated`, and `service_role`.

These 96 rows are classified `SUPABASE_BASELINE_EXACT` with management
boundary `SUPABASE_MANAGED_BASELINE`. They are verified separately from
column ACLs and from effective privileges.

## RLS and policy contract

`profiles`, `tenants`, and `branches` must have RLS enabled and FORCE RLS
disabled. Twelve required policies are compared as an exact set:

- three authenticated branch policies;
- six authenticated profile policies;
- one Core V2 policy on each target table.

Policy command, permissiveness, sole role, USING expression, and WITH CHECK
expression are all compared.

## Before and after verifier behavior

Before: P2D.21D rejected every non-`afex_function_owner` column ACL.

After: P2D.21D includes the P2D.22 verifier, which performs bidirectional
`EXCEPT` comparisons. Missing or extra rows, wrong grantor, grantee,
privilege, grantability, RLS state, FORCE RLS state, policy identity, policy
role, command, or expression fail closed.

## Why no Production mutation is required

The successful P2D.21S evidence matches the reviewed combined contract. The
defect was in repository verification logic, not the committed Production
ACL state. P2D.20 remains immutable; P2D.22 supplies a superseding read-only
attestation.

## Security impact

The repair does not ignore unknown ACLs. It replaces a blanket rejection with
exact expected-versus-actual set comparisons, preserves malformed-array
guards, preserves PUBLIC as ACL grantee OID `0`, and keeps direct ACL,
effective privilege, ownership, membership, and RLS concepts separate.

## Compatibility impact

No application, Runtime, API, POS, Admin, Executor, legacy order, database
schema, or privilege behavior changes. Existing authenticated application
flows and Core V2 authorization reads remain unchanged.

## Files created

- `P2D.22-AUTHORIZATION-ACL-CANONICAL-CONTRACT.sql`
- `P2D.22-FINAL-VERIFICATION-AUTHORIZATION-CONTRACT.sql`
- `P2D.22-POST-INSTALL-AUTHORIZATION-ATTESTATION.sql`
- `P2D.22-RUN-FINAL-VERIFICATION.ps1`
- `P2D.22-FINAL-VERIFICATION-RUNBOOK.md`
- `P2D.22-FINAL-VERIFICATION-CONTRACT-ALIGNMENT-REPORT.md`

## Files modified

- P2D.21D authorization verification portion only.
- P2D.21S runner lifecycle/result bookkeeping only.

P2D.20 migration and attestation remain unchanged.

## Static validation

The canonical contract, standalone verifier, expanded superseding
attestation, and expanded P2D.21D verifier passed PostgreSQL static parsing.
Both PowerShell runners parsed with zero errors. Static contract inspection
confirmed 25 column ACL rows (11 Core V2 and 14 authenticated), zero duplicate
column tuples, 96 exact table ACL rows, three RLS rows, and twelve policy rows.
Prohibited mutating SQL and application-table row reads are zero. PUBLIC
remains OID-zero safe. Bidirectional missing/extra comparisons, RLS checks,
policy checks, and required markers are present. `git diff --check` passes.

## Next operator command

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.22-RUN-FINAL-VERIFICATION.ps1"`

## Rollback

These are verification-only repository changes. They perform no database
mutation and require no database rollback.

## Package marker

`P2D22_900_FINAL_VERIFICATION_CONTRACT_ALIGNMENT_PACKAGE_READY`
