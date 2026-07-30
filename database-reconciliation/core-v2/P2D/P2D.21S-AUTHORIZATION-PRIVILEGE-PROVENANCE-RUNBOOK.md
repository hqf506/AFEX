# P2D.21S Authorization Privilege Provenance Runbook

## Purpose

Determine the catalog provenance of table, column, schema, membership,
default-privilege, and RLS access affecting `public.profiles`,
`public.tenants`, and `public.branches`.

## Preconditions

- P2D.19 and P2D.20 are committed and attested.
- Do not rerun P2D.19 or P2D.20.
- PostgreSQL server is exactly 17.6 with UTF8 encoding.
- PostgreSQL 18.4 `psql` is installed at the reviewed runner path.
- `SUPABASE_DB_URL` exists only in the operator process environment.
- The approved connection identity and database are both `postgres`.

## Operator command

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.21S-RUN-AUTHORIZATION-PRIVILEGE-PROVENANCE-DIAGNOSTIC.ps1"
```

## Read-only proof

The SQL has one `BEGIN TRANSACTION READ ONLY` and one final `ROLLBACK`.
It reads PostgreSQL catalogs and invokes built-in privilege-inspection
functions only. It never selects application rows and performs no mutation.

## Expected output

Ordered sections report:

1. the explicit target identity inventory, followed by real-role memberships
   and transitive paths;
2. direct table ACLs;
3. table effective privilege provenance and classification;
4. direct column ACLs;
5. column effective privilege provenance and classification;
6. applicable default privileges;
7. `public` schema privilege provenance;
8. RLS/FORCE RLS flags and complete policy metadata.

Expected marker:

`P2D21S_900_AUTHORIZATION_PRIVILEGE_PROVENANCE_DIAGNOSTIC_COMPLETE`

`PUBLIC` is represented only as the PostgreSQL ACL pseudo-role with grantee
OID `0`. It is labeled `PUBLIC` in output, but is never passed to role,
membership, ownership, superuser, `SET ROLE`, or effective-privilege
inspection functions that require a real `pg_roles` identity. Its effective
privilege facts are derived directly from matching ACL entries with grantee
OID `0`. All named roles remain fail-closed catalog identities.

## Evidence files

A timestamped `evidence/P2D.21S-*` directory contains:

- `P2D.21S.stdout.txt`
- `P2D.21S.stderr.txt`
- `P2D.21S-summary.txt`

Return all three files for external review.

## Credential cleanup

The runner uses a uniquely named temporary pgpass file with a restricted ACL.
It explicitly waits for, closes, and disposes the native `psql` process before
credential cleanup. It restores the previous `PGPASSFILE` environment value
before collecting pending finalizers and beginning bounded deletion retries.
Each of five retries clears read-only/system/hidden attributes, resets the ACL,
grants the current Windows identity Full Control, and deletes and verifies the
exact literal path. If deletion still fails, the runner exits with code `4`,
prints the exact temporary path and a literal-path removal command, and
preserves the diagnostic result and native `psql` exit code in the summary.

## Failure handling

Stop if identity, platform, role, table, ACL shape, native exit code, marker,
or credential cleanup fails. Native SQL failure exits `3`, missing marker
exits `5`, runner failure exits `6`, and credential cleanup failure takes
precedence with exit `4`. Retain stdout, stderr, and summary evidence.
Do not make a corrective privilege change from diagnostic output alone.

Do not rerun P2D.19 or P2D.20.
