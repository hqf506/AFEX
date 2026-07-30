# P2D.21T — PUBLIC Pseudo-Role Repair Report

## Scope

This repair is limited to the P2D.21S read-only authorization privilege
provenance diagnostic, its PowerShell runner, and its runbook. It does not
change P2D.19, P2D.20, Production privileges, application behavior, or data.

## Root cause

The diagnostic modeled `PUBLIC` as the text name of a PostgreSQL role and
passed it to role-aware privilege inspection. PostgreSQL does not store
`PUBLIC` in `pg_roles`; it is the ACL pseudo-role represented by grantee OID
`0`. Role-aware calls therefore failed with `role "PUBLIC" does not exist`.

The previous credential cleanup also began before explicitly disposing the
native `psql` process object and did not apply the complete operator-proven
Windows attribute and ACL normalization sequence before deletion.

## SQL repair

- `PUBLIC` is modeled as `(role_name = 'PUBLIC', role_oid = 0)`.
- Direct `PUBLIC` grants are read from ACL entries whose grantee is OID `0`.
- `PUBLIC` effective table, column, and schema facts are derived only from
  those direct ACL entries.
- Membership recursion excludes OID `0`.
- `PUBLIC` is never passed to `pg_has_role`, `has_table_privilege`,
  `has_column_privilege`, `has_any_column_privilege`, or
  `has_schema_privilege`.
- Every named role retains fail-closed `pg_roles` existence validation and
  ordinary membership/effective-privilege inspection.

## Affected SQL locations

Line references are to the repaired P2D.21S diagnostic:

- Lines 127–147: explicit target identity inventory; `PUBLIC` is OID `0` and
  marked as a pseudo-role, while real identities are resolved from
  `pg_roles`.
- Lines 149–200: membership recursion excludes OID `0`; membership,
  inheritance, and `SET ROLE` inspection applies only to real roles.
- Lines 252–283: table privilege provenance derives `PUBLIC` facts from
  grantee OID `0` ACL rows and calls role-aware inspection only in the
  real-role branch.
- Lines 364–414: column privilege provenance uses the same OID-zero split,
  including table-level fallback for column privileges.
- Lines 472–515: aggregate identity-table classification derives `PUBLIC`
  effective access from table and column ACL provenance without role lookup.
- Lines 577–605: schema privilege provenance derives `PUBLIC` access from
  schema ACL OID `0` and reserves `has_schema_privilege` for real roles.
- Lines 620–640: policy-role output continues to label policy role OID `0` as
  `PUBLIC` without resolving it through `pg_roles`.

## Before and after handling model

Before repair, the text label `PUBLIC` entered role-aware privilege
inspection, so PostgreSQL attempted to resolve a nonexistent role. After
repair, the label is presentation-only: OID `0` drives direct ACL provenance,
while nonzero OIDs alone enter role membership and effective-privilege
functions.

## Real-role fail-closed behavior

The preflight still requires exactly the eight named real target roles:
`anon`, `authenticated`, `service_role`, `postgres`,
`afex_function_owner`, `afex_context_issuer`, `afex_core_runtime`, and
`afex_outbox_worker`. Only OID `0` is exempt from real-role existence and
membership checks.

## Credential cleanup repair

- The runner waits for, closes, disposes, and clears the native process object.
- The prior `PGPASSFILE` value is restored before cleanup.
- Pending finalizers are collected before bounded cleanup begins.
- Each retry clears read-only, system, and hidden attributes.
- Each retry resets the ACL and grants the current Windows identity Full
  Control.
- Deletion and its verification use the exact literal temporary path.
- Cleanup failure exits `4` and reports the exact remaining path and safe
  literal-path removal command.
- Native SQL failure, missing-marker failure, and runner failure remain
  distinct in the evidence summary.

## Exit-code behavior

- Success with the required marker and successful cleanup: exit `0`.
- Native SQL/psql failure with successful cleanup: exit `3`.
- Missing required marker with successful cleanup: exit `5`.
- Runner/process failure with successful cleanup: exit `6`.
- Any surviving credential file: exit `4`, taking precedence without erasing
  the recorded native exit code or failure kind from the summary.

## Security and behavior preservation

The SQL remains a read-only diagnostic ending in `ROLLBACK`. No privilege,
membership, ownership, RLS, policy, schema, function, or application state is
changed. The credential remains outside process arguments, stdout, stderr, and
evidence content.

## Files modified

- `P2D.21S-AUTHORIZATION-PRIVILEGE-PROVENANCE-DIAGNOSTIC.sql`
- `P2D.21S-RUN-AUTHORIZATION-PRIVILEGE-PROVENANCE-DIAGNOSTIC.ps1`
- `P2D.21S-AUTHORIZATION-PRIVILEGE-PROVENANCE-RUNBOOK.md`

## File created

- `P2D.21T-PUBLIC-PSEUDO-ROLE-REPAIR-REPORT.md`

## Static validation

The repaired transaction package passes PostgreSQL grammar parsing, the
PowerShell runner parses with zero errors, and `git diff --check` passes.
Static scans confirm one read-only transaction, one final rollback, one
diagnostic marker, zero mutating statements, zero application-row reads, and
no literal `PUBLIC` or role-name expression passed to a real-role privilege
function.

## Execution safety

No SQL was executed, no database was contacted, and no `psql` or Supabase CLI
process was invoked during this repair.

## Operator rerun command

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.21S-RUN-AUTHORIZATION-PRIVILEGE-PROVENANCE-DIAGNOSTIC.ps1"`

## Completion marker

`P2D21T_900_PUBLIC_PSEUDO_ROLE_REPAIR_COMPLETE`
