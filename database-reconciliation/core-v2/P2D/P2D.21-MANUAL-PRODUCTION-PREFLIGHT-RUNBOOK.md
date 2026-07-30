# P2D.21 Manual Production Preflight Runbook

## Purpose

This runbook controls the first read-only Production preflight for the frozen
P2D.19 and P2D.20 package. A successful result authorizes external review
only. It does not authorize either migration or either post-install
attestation to be executed.

## Prerequisites

- P2D.15 Foundation is installed on the intended Production database.
- The operator has independent approval to perform this read-only preflight.
- The operator has positively verified the Production project and database.
- `SUPABASE_DB_URL` is present in the operator process environment.
- `AFEX_EXPECTED_PRODUCTION_DATABASE` and
  `AFEX_EXPECTED_PRODUCTION_USER` contain separately approved identities.
- The connection value must never be printed or copied into evidence. The
  runner parses it in-process, passes only non-secret connection arguments,
  and supplies the password through an access-restricted temporary
  `PGPASSFILE`.
- PostgreSQL 18.4 `psql.exe` exists at:
  `C:\Program Files\PostgreSQL\18\bin\psql.exe`
- The repository working copy contains the exact frozen artifacts below.
- No P2D.19 or P2D.20 artifact has previously been partially installed.
- The `postgres` installer retains the exact `supabase_admin`-granted
  `ADMIN=true, INHERIT=false, SET=false` baseline memberships for
  `afex_core_owner` and `afex_function_owner`.
- No `postgres`-grantor temporary owner membership or temporary owner
  `CREATE` privilege on `public` is present.
- The output directory
  `database-reconciliation/core-v2/P2D/evidence/` is writable.

## Controlled files and expected hashes

| File | SHA-256 |
|---|---|
| `database-reconciliation/core-v2/P2D/P2D.21-MANUAL-PRODUCTION-PREFLIGHT.sql` | `9a548f6759b82eb20852c031f355617e48a05f569d97467be0b3566c095a8589` |
| `database-reconciliation/core-v2/P2D/P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql` | `5d5f6cc0555f43a7f54fcf6fc2ef085250599b8a72ce78e9f0d2b4a922511805` |
| `database-reconciliation/core-v2/P2D/P2D.19-POST-INSTALL-ATTESTATION.sql` | `08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273` |
| `database-reconciliation/core-v2/P2D/P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql` | `d9b4f1a9caffe5644de721e6622be545056873ba5c1bfedd83f481b6bcee0192` |
| `database-reconciliation/core-v2/P2D/P2D.20-POST-INSTALL-ATTESTATION.sql` | `fbfa71081487f55f09e73292d9ed9e7f4a743ca7383fe50940eca031f09a33a7` |
| `database-reconciliation/core-v2/P2D/P2D.21-RUN-MANUAL-PREFLIGHT.ps1` | `726e17299009448ece44247fee1b8752490857204259efbe98100aa2baf4144f` |

The PowerShell runner verifies every SQL hash before it permits `psql` to
connect. Its own hash is verified externally to avoid self-reference. It
executes only the P2D.21 read-only preflight file.

## Operator procedure

The read-only preflight verifies authority to create transaction-local,
grantor-scoped `SET=true` memberships and temporary schema `CREATE` grants.
It does not create either form of temporary authority.

1. Open a new trusted PowerShell session.
2. Set `SUPABASE_DB_URL` through the approved secret-delivery process.
3. Do not echo or inspect the environment value.
4. Change directory to the repository root:
   `C:\Users\NSC-LUA\Desktop\leather-fix-erp-clean`
5. Confirm the maintenance/change ticket permits a read-only preflight.
6. Run exactly:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.21-RUN-MANUAL-PREFLIGHT.ps1"
```

7. Record the reported `psql` exit code.
8. Confirm the runner reports all five `HASH PASS` results.
9. Confirm the captured output contains:
   `P2D21_900_MANUAL_PRODUCTION_PREFLIGHT_OK`
10. Do not run any other P2D SQL file.

## Evidence produced

The runner writes three timestamped files under
`database-reconciliation/core-v2/P2D/evidence/`:

- `P2D.21-production-preflight-<timestamp>.stdout.txt`
- `P2D.21-production-preflight-<timestamp>.stderr.txt`
- `P2D.21-production-preflight-<timestamp>.summary.txt`

The summary records the timestamp, `psql` exit code, marker result, and evidence
filenames. It does not record the connection string.

PostgreSQL `NOTICE` and `WARNING` messages remain in the stderr evidence.
Their presence alone is not failure. The runner stops only for a nonzero
`psql` exit code or a missing required PASS marker.

## Expected successful result

- `psql` exit code is `0`.
- Every local hash reports `HASH PASS`.
- The final marker is present:
  `P2D21_900_MANUAL_PRODUCTION_PREFLIGHT_OK`
- The SQL transaction reports read-only operation and terminates with
  `ROLLBACK`.

## Stop conditions

Stop immediately and do not execute any migration when:

- `SUPABASE_DB_URL` is absent.
- Production identity has not been independently verified.
- Any local artifact is missing or its SHA-256 differs.
- PostgreSQL 18.4 `psql.exe` is absent or reports another version.
- `psql` returns a nonzero exit code.
- The final PASS marker is absent.
- PostgreSQL is not exactly version 17.6 (`170006`) or is not using UTF8.
- The session transaction is not read only.
- A P2D.15 role, membership, table, owner, RLS, policy, or ACL differs.
- The atomic command ledger is not empty.
- Bootstrap policy residue exists.
- Any P2D.19 or P2D.20 object or partial-install residue already exists.
- An authorization-evidence policy or ACL conflicts with P2D.20.
- The installer lacks schema, ownership-transfer, relation-owner, policy, or
  grant authority required by the frozen migrations.
- A required PostgreSQL feature is absent.
- Evidence output contains a secret or cannot be retained safely.

## Authorization boundary

Passing P2D.21 authorizes review of the captured preflight evidence only. It
does not authorize execution of:

- `P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql`
- `P2D.19-POST-INSTALL-ATTESTATION.sql`
- `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql`
- `P2D.20-POST-INSTALL-ATTESTATION.sql`

## Next step after PASS

Send the complete stdout, stderr, and summary evidence to ChatGPT for external
review. Wait for an explicit reviewed decision before requesting any migration
execution authority.
