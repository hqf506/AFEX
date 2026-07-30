# P2D.21Q Authorization Column ACL Diagnostic

## Purpose

This package diagnoses the committed Production authorization-evidence
column ACL state after P2D.20 attestation passed and P2D.21D final
verification rejected a direct ACL whose grantee was not
`afex_function_owner`.

It is read-only. It performs no repair and must not be used to rerun P2D.19
or P2D.20.

## Static contract discrepancy

P2D.20 migration and attestation compare the exact eleven non-grantable
`SELECT` column ACLs granted to `afex_function_owner`. Their inventory queries
filter out every other grantee.

P2D.21D separately rejects every direct column ACL on `profiles`, `tenants`,
or `branches` whose grantee is not `afex_function_owner`.

The diagnostic therefore reports both the exact expected inventory and all
direct ACL rows ignored by the earlier migration and attestation checks.

## Prerequisites

- P2D.19 is installed and attested.
- P2D.20 is installed and attested.
- Do not rerun either migration.
- PostgreSQL server is exactly 17.6 with UTF8 encoding.
- PostgreSQL 18.4 `psql` exists at the runner's reviewed path.
- `SUPABASE_DB_URL` is present only in the operator process environment.
- The connected database and installer user are both `postgres`.

## Artifacts

| Artifact | Classification |
|---|---|
| `P2D.21Q-AUTHORIZATION-COLUMN-ACL-DIAGNOSTIC.sql` | Read-only diagnostic |
| `P2D.21Q-RUN-AUTHORIZATION-COLUMN-ACL-DIAGNOSTIC.ps1` | Credential-safe runner |

## Operator command

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.21Q-RUN-AUTHORIZATION-COLUMN-ACL-DIAGNOSTIC.ps1"
```

## Expected marker

`P2D21Q_900_AUTHORIZATION_COLUMN_ACL_DIAGNOSTIC_COMPLETE`

## Evidence

The runner creates a timestamped `P2D.21Q-*` directory under `evidence` with:

- `P2D.21Q.stdout.txt`
- `P2D.21Q.stderr.txt`
- `P2D.21Q-summary.txt`

NOTICE and WARNING output is retained in stderr. A non-zero native exit code
or missing marker stops fail-closed.

## STOP conditions

Stop without corrective action if:

- the read-only transaction cannot be established;
- Production identity, PostgreSQL version, or UTF8 checks fail;
- any required role or relation is absent;
- an ACL array is malformed;
- `psql` returns non-zero;
- the completion marker is absent;
- evidence reveals a direct privilege not covered by the frozen contract.

Any correction requires a separate externally reviewed phase.
