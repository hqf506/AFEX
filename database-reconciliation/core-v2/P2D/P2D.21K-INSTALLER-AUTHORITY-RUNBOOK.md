# P2D.21K — Read-Only Installer Authority Diagnostic Runbook

Status: **DRAFT — READ-ONLY DIAGNOSTIC — EXTERNAL REVIEW REQUIRED**

## Purpose

This package identifies which installer-authority predicate prevents the
PostgreSQL 17.6 Production installation preflight from passing. It does not
authorize or perform installation, repair, role assumption, DDL, or privilege
changes.

## Frozen artifacts

| Artifact | SHA-256 |
|---|---|
| `P2D.21K-INSTALLER-AUTHORITY-DIAGNOSTIC.sql` | `3efdfb6cbfb9e9f0fc9150885fe196f5b842e65f67b6851194b55fb0a2a0f1e9` |
| `P2D.21K-RUN-INSTALLER-AUTHORITY-DIAGNOSTIC.ps1` | `e3475ae3cabc99f16c29b7403397d9a2c3b8e08c6357837c628abdc10f004bca` |
| `P2D.21K-INSTALLER-AUTHORITY-RUNBOOK.md` | `RECORDED_EXTERNALLY_AFTER_FREEZE` |

The runner validates the SQL hash before connecting. Its own hash and this
runbook's hash must be retained externally to avoid self-reference.

## Preconditions

1. Obtain explicit approval for a read-only Production diagnostic.
2. Confirm no P2D.19 or P2D.20 migration will be executed.
3. Use the same approved Production identity that ran P2D.21.
4. Set `SUPABASE_DB_URL` without displaying it.
5. Set `AFEX_EXPECTED_PRODUCTION_DATABASE` to the separately approved database.
6. Set `AFEX_EXPECTED_PRODUCTION_USER` to the separately approved installer
   identity.
7. Ensure `AFEX_PG17_TEST_URL` is unset.
8. Confirm PostgreSQL 18.4 `psql.exe` exists at the runner's frozen path.

## Execution

From the repository root, run exactly:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.21K-RUN-INSTALLER-AUTHORITY-DIAGNOSTIC.ps1"
```

The runner passes only host, port, database, and user as process arguments.
The password is supplied through a temporary access-restricted `PGPASSFILE`.
The complete connection URL and password are removed from the child process
environment and are not written to evidence.

## Required evidence

Retain all three generated files:

- `P2D.21K-installer-authority-<timestamp>.stdout.txt`
- `P2D.21K-installer-authority-<timestamp>.stderr.txt`
- `P2D.21K-installer-authority-<timestamp>.summary.txt`

Hash the evidence externally after execution. Preserve PostgreSQL notices and
warnings from stderr.

## Expected result sections

The diagnostic reports:

1. Current and session identities.
2. Current-role attributes.
3. `public` schema ownership and effective CREATE/USAGE.
4. Owners and owner authority for all required relations.
5. P2D.15 role existence, SET capability, and USAGE capability.
6. Every relevant membership row and membership option.
7. Every individual predicate from the failed P2D.21 gate.
8. Derived authority for ownership transfer, policy creation, column
   grants/revokes, and RLS operations.
9. One final classification.

The required completion marker is:

`P2D21K_900_INSTALLER_AUTHORITY_DIAGNOSTIC_COMPLETE`

## Classification contract

- **A** — The current role satisfies the complete catalog-derived authority
  contract. The P2D.21 predicate requires review.
- **B** — The current role is insufficient, but another existing LOGIN role
  satisfies the complete catalog-derived authority contract.
- **C** — No sufficient existing LOGIN role or catalog-visible administration
  path exists. The ownership-transfer model requires review for managed
  PostgreSQL restrictions.
- **D** — The current role is insufficient but has catalog-visible CREATEROLE
  authority, indicating that a separately reviewed narrowly scoped membership
  or grant may be sufficient.

This classification is diagnostic evidence only. It does not authorize a
role, membership, ownership, schema, or package change.

## STOP conditions

Stop and retain evidence if:

- any artifact hash fails;
- the expected database or user does not match;
- `psql` returns a non-zero exit code;
- the completion marker is absent;
- the output contains an unexpected catalog or privilege error;
- credentials appear in any output;
- any result cannot be assigned exactly one classification.

Do not retry P2D.19 or P2D.20 until the diagnostic is externally reviewed.

## Read-only safety

The SQL begins `BEGIN TRANSACTION READ ONLY`, performs catalog and privilege
inspection only, and ends with `ROLLBACK`. It contains no SET ROLE, DDL, DML,
temporary object, advisory lock, configuration change, or function invocation
that mutates application state.
