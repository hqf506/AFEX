# AFEX Core V2 — Package 2R Controlled Production Run Card

Status: external pre-execution review  
Execution authority: manual operator only  
Core V2 state: disabled  
Runtime tests: not executed

## Frozen artifacts

| Artifact | SHA-256 |
|---|---|
| `database-reconciliation/evidence/01r-s1-production-output.csv` | `0a68aea6a1209229be83f237fd944c3b3a0265a4539b333726f5458475e0c9be` |
| `database-reconciliation/evidence/01r-s1-reviewer-decision.md` | `2786bbfd31e033c259cee069337d4363fbeecff3f978f6fc9559aedf0b7d551a` |
| `database-reconciliation/core-v2/i5.9/01s-supabase-production-report.sql` | `f71a463ea96ec7dd26563ecc7c4a32cc325bd53ddc5414fadcafdcbf0a56f029` |
| `database-reconciliation/core-v2/i5.9/02-schema-foundation.sql` | `92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92` |

Package 1R decision:

> PACKAGE 1R OUTPUT APPROVED — CONTINUE TO CONTROLLED PACKAGE 2R REVIEW

This run card does not itself authorize execution. Every checkbox requires a named human operator and retained evidence.

## Reviewed Package 2R scope

Package 2R executes in one explicit `BEGIN`/`COMMIT` transaction. It:

- creates empty `public.financial_quotes`, `public.idempotency_commands`, and `public.atomic_outbox`;
- adds 84 nullable, no-default columns to seven existing tables;
- adds 36 immediately validated checks to the three new empty tables;
- adds 38 `NOT VALID` checks to existing tables;
- adds nine immediate foreign keys on new empty tables;
- adds eight `NOT VALID` foreign keys on existing tables;
- adds one unique constraint and thirteen indexes on new empty tables.

It does not backfill, activate Core V2, create functions/RPCs/triggers/policies, grant privileges, change RLS, write application rows, change numbering, or alter application behavior.

## A. Preconditions

- [ ] External reviewer approved this exact run card.
- [ ] Package 1R evidence and reviewer decision remain unchanged.
- [ ] Package 2R SQL hash remains exactly `92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92`.
- [ ] No newer Production schema change has occurred since the Package 1R capture.
- [ ] A fresh read-only drift check confirms no Package 2R target object appeared.
- [ ] Core V2 is disabled and no Package 3, 4, 5, 6, or activation artifact has run.
- [ ] The operator understands that `ALTER TABLE` takes `ACCESS EXCLUSIVE` locks.
- [ ] The operator has authority to stop rather than improvise.

STOP if any checkbox is false or cannot be proven.

## B. Local hash verification

Run locally, without opening a database connection:

```powershell
Get-FileHash -Algorithm SHA256 database-reconciliation/evidence/01r-s1-production-output.csv
Get-FileHash -Algorithm SHA256 database-reconciliation/evidence/01r-s1-reviewer-decision.md
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/01s-supabase-production-report.sql
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/02-schema-foundation.sql
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/02r-post-run-verification.sql
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/02r-rollback.sql
```

Record all six outputs in the execution evidence. STOP on any mismatch with the externally approved values.

## C. Backup and restore confirmation

Do not record credentials, access tokens, database URLs, or secrets.

- [ ] Production project identifier confirmed manually: `________________`
- [ ] Correct organization/project confirmed independently by a second person: `________________`
- [ ] Current Supabase backup status: `________________`
- [ ] Latest successful backup timestamp (UTC): `________________`
- [ ] Backup identifier/reference: `________________`
- [ ] Restoration method and responsible operator: `________________`
- [ ] Last restoration-test evidence: `________________`
- [ ] If no recent restoration test exists, limitation and explicit risk acceptance: `________________`
- [ ] Rollback operator: `________________`
- [ ] Rollback decision authority: `________________`

STOP if backup availability, restore ownership, or project identity is uncertain.

## D. Production identity confirmation

- [ ] SQL Editor header visibly identifies the intended Production project.
- [ ] Operator cross-checks the manually recorded project identifier.
- [ ] Operator confirms the environment is not Clone/Staging/Preview.
- [ ] No connection string or secret is copied into this run card.
- [ ] Current database version remains compatible with PostgreSQL 17.

## E. Maintenance-window start

- [ ] Approved start time: `________________`
- [ ] Approved end time: `________________`
- [ ] Change ticket: `________________`
- [ ] Primary operator: `________________`
- [ ] Independent observer: `________________`
- [ ] Application traffic plan (pause/drain/accepted live risk): `________________`
- [ ] Monitoring owner: `________________`
- [ ] Stakeholders notified: `________________`

Package 2R does not rewrite rows, but repeated `ALTER TABLE` operations require brief `ACCESS EXCLUSIVE` locks. Duration is expected to be short; this is an estimate, never a guarantee.

## F. Exact SQL file

Open only:

`database-reconciliation/core-v2/i5.9/02-schema-foundation.sql`

Confirm:

- line count: `1063`;
- byte count: `51294`;
- SHA-256: `92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92`;
- first executable statement: `begin;`;
- final executable statement: `commit;`.

Do not copy fragments into separate editor tabs. Do not append another package.

## G. SQL Editor instructions

1. Open a new Supabase SQL Editor tab in the confirmed Production project.
2. Paste the complete, hash-verified Package 2R SQL exactly once.
3. Do not select a subsection; execute the complete script as one unit.
4. Do not modify `BEGIN`, `COMMIT`, constraints, or drift guards.
5. Do not retry after an error until the transaction state and error text have been externally reviewed.
6. Do not execute Package 3, Package 5, activation, rollback, or verification in the same editor run.

## H. One-time manual execution

- [ ] Operator reconfirms all STOP conditions are clear.
- [ ] Operator records execution start timestamp.
- [ ] Operator executes the complete Package 2R script once.
- [ ] Operator records editor result and completion timestamp.
- [ ] Operator exports/saves the full result or error without secrets.

Codex must not perform this step.

## I. Expected success result

- The editor reports successful completion and `COMMIT`.
- The three new tables exist and contain zero rows.
- The 84 existing-table columns exist, remain nullable, and have no defaults.
- New-table constraints are validated.
- Existing-table checks and foreign keys are present as `NOT VALID`.
- Thirteen new-table indexes are valid and ready.
- No function, trigger, policy, runtime grant, activation row, or application row is created.

Any schema-drift exception, timeout, cancellation, lock timeout, permission error, or unexpected result is a failure.

## J. Immediate post-run verification

1. Open a separate SQL Editor tab.
2. Open only `database-reconciliation/core-v2/i5.9/02r-post-run-verification.sql`.
3. Verify its externally approved hash.
4. Execute it once as a read-only query.
5. Export its single result set unchanged.
6. Require every structural row to report `PASS`.
7. Compare the seven legacy-table row counts with the counts recorded immediately before execution.
8. Confirm all three Core V2 tables report zero rows.
9. Confirm the activation-control tables remain absent.

Do not continue to another package if any row is not `PASS`, or if a legacy count differs.

## K. Failure handling

If Package 2R errors before `COMMIT`:

1. Stop.
2. Do not edit or rerun the SQL.
3. Capture the complete error, SQL Editor transaction result, timestamp, and operator identity.
4. Confirm whether PostgreSQL rolled back the transaction.
5. Run the read-only post-run verification only after external authorization.
6. Escalate for static review.

Never use migration repair, `db push`, ad-hoc `DROP`, or manual partial completion.

## L. Transaction rollback behavior

All Package 2R DDL is inside one explicit transaction. A statement error aborts the transaction, and the final `COMMIT` cannot partially preserve successful earlier statements. An operator cancellation or connection loss still requires evidence that the server rolled back.

Do not assume rollback solely from a client message; verify read-only metadata afterward.

## M. Manual rollback after a successful commit

Rollback is exceptional and requires separate approval.

Use only:

`database-reconciliation/core-v2/i5.9/02r-rollback.sql`

The rollback script:

- runs in one transaction;
- fails if any new table contains rows;
- fails if any Package 2R column on legacy tables is non-null;
- fails if unexpected foreign-key, trigger, policy, or view dependencies exist;
- removes only named Package 2R indexes, constraints, columns, and tables;
- does not touch legacy rows, migration history, grants, RLS, or numbering.

Do not run rollback after Package 3/backfill or any Core V2 writer has been enabled.

## N. Evidence capture

Retain:

- all pre-run hashes;
- Package 1R decision;
- project identifier confirmation;
- backup timestamp and restore evidence/accepted limitation;
- change ticket and operator approvals;
- maintenance timestamps;
- complete SQL Editor success/error output;
- post-run verification export;
- before/after legacy row counts;
- screenshots showing Core V2 disabled;
- smoke-check results;
- rollback decision, if any.

Never retain credentials or connection strings in evidence.

## O. Application smoke checks

After structural verification passes:

- [ ] Existing Admin authentication works.
- [ ] Existing POS employee/PIN entry works.
- [ ] Existing customer search is unchanged.
- [ ] Existing catalog browsing is unchanged.
- [ ] Existing legacy sale path can be observed without enabling Core V2.
- [ ] Existing orders/invoices remain readable.
- [ ] Existing inventory views remain readable.
- [ ] No new runtime request targets a Core V2 table/function.

Do not create a test sale unless separately authorized by the Production test-data policy.

## P. Core V2-disabled confirmation

The verification must show:

- `public.core_v2_activation_control` absent;
- `public.core_v2_tenant_activation` absent;
- `public.core_v2_branch_activation` absent;
- no Package 2R-created runtime functions;
- no `PUBLIC`, `anon`, `authenticated`, or `service_role` grants on the three new tables.

Package 2R foundation presence is not activation.

## Q. Package 3 remains blocked

Do not run Package 3. Backfill remains blocked pending:

- manual resolution of two same-tenant normalized customer duplicate groups;
- approved treatment of five missing/invalid branch prefixes;
- approved legacy snapshot policy;
- approved handling of 148 invoice/order number mismatches;
- a separate reviewed run card and explicit operator approval.

## R. Package 5 remains mandatory

Package 5 security remediation remains mandatory before activation, including:

- public/anonymous execution exposure on privileged AFEX functions;
- unsafe default search paths on SECURITY DEFINER functions;
- exact table grants and RLS policy verification;
- legacy mutation-path caller restrictions;
- service-role least-privilege review.

Package 2R does not remediate or waive these findings.

## S. STOP conditions

STOP immediately if:

- any hash differs;
- evidence or decision is missing;
- the Production project identity is uncertain;
- backup/restore evidence is unavailable or unaccepted;
- the maintenance window is not approved;
- a Package 2R target object now exists unexpectedly;
- schema drift is detected;
- the SQL was edited or partially selected;
- a lock, timeout, permission, or SQL error occurs;
- transaction outcome is uncertain;
- any Core V2 table receives data;
- any legacy row count changes;
- any runtime function, trigger, policy, grant, or activation object appears;
- Core V2 is enabled;
- verification does not return all required PASS results;
- an operator is asked to improvise a fix.

Final run-card state: **PREPARED FOR EXTERNAL REVIEW; NOT EXECUTED**.
