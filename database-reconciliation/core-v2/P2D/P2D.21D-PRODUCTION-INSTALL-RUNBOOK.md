# P2D.21D — PostgreSQL 17.6 Production Installation Runbook

Status: **DRAFT — EXTERNAL REVIEW REQUIRED — NOT EXECUTED**

## Scope

This runbook controls the manual Production installation of P2D.19 and
P2D.20 on the approved PostgreSQL 17.6 server. It does not activate Core V2,
execute Runtime integration, invoke acquisition, create an order, or alter
the legacy order path.

## Frozen Production identity

- `server_version`: `17.6`
- `server_version_num`: `170006`
- `server_encoding`: `UTF8`
- Database and installer identity must match separately approved operator
  evidence from P2D.21.

Any mismatch is a STOP condition.

## Artifact manifest

| Artifact | SHA-256 |
|---|---|
| `P2D.21-MANUAL-PRODUCTION-PREFLIGHT.sql` | `9a548f6759b82eb20852c031f355617e48a05f569d97467be0b3566c095a8589` |
| `P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql` | `5d5f6cc0555f43a7f54fcf6fc2ef085250599b8a72ce78e9f0d2b4a922511805` |
| `P2D.19-POST-INSTALL-ATTESTATION.sql` | `08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273` |
| `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql` | `d9b4f1a9caffe5644de721e6622be545056873ba5c1bfedd83f481b6bcee0192` |
| `P2D.20-POST-INSTALL-ATTESTATION.sql` | `fbfa71081487f55f09e73292d9ed9e7f4a743ca7383fe50940eca031f09a33a7` |
| `P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql` | `6f92d01e098dee2ff46048fac9eb56e327dc4f23bbbce56b9c20087088cac640` |
| `P2D.21D-RUN-PRODUCTION-INSTALL.ps1` | `a26a4eff1ddbd35dc55026f276f3ce65ec0c545c9fd6bfcaff16506648cf8970` |

The runbook hash is externally recorded after document freeze to avoid a
self-referential manifest.

## Required approvals and prerequisites

Before starting:

1. External SQL review approves all manifest hashes.
2. The change ticket authorizes both P2D.19 and P2D.20.
3. A rollback/forward-fix decision authority is present.
4. The operator has verified the intended Production project, database, and
   installer identity without exposing credentials.
5. P2D.15 is installed and its command ledger is empty.
6. No P2D.19 or P2D.20 object has been partially installed.
7. The installer has the transactional membership, schema CREATE,
   relation-owner, policy, and column-GRANT authority checked by P2D.21.
8. The exact `supabase_admin`-grantor owner memberships are present and no
   `postgres`-grantor temporary owner membership or temporary owner schema
   `CREATE` privilege exists.
9. PostgreSQL 18.4 `psql.exe` is installed at the reviewed path. The server
   remains PostgreSQL 17.6.
10. `SUPABASE_DB_URL` is supplied through the approved secret mechanism.
11. `AFEX_EXPECTED_PRODUCTION_DATABASE` and
    `AFEX_EXPECTED_PRODUCTION_USER` contain approved identity values.
12. `AFEX_PG17_TEST_URL` is unset.
13. The evidence directory is writable.
14. No other P2D.21D runner is active and no stale lock exists.

## Exact execution sequence

The runner performs:

1. Local artifact SHA-256 verification.
2. PostgreSQL client verification.
3. P2D.21 read-only preflight.
4. Verification of `P2D21_900_MANUAL_PRODUCTION_PREFLIGHT_OK`.
5. Typed confirmation `INSTALL-P2D19-ON-PRODUCTION`.
6. P2D.19 migration.
7. P2D.19 read-only attestation.
8. Verification of `P2D19A_900_POST_INSTALL_ATTESTATION_OK`.
9. Typed confirmation `INSTALL-P2D20-ON-PRODUCTION`.
10. P2D.20 migration.
11. P2D.20 read-only attestation.
12. Verification of `P2D20A_900_POST_INSTALL_ATTESTATION_OK`.
13. P2D.21D final read-only verification.
14. Verification of `P2D21D_900_POST_INSTALL_VERIFICATION_OK`.
15. Evidence summary generation.

The runner stops after any nonzero exit code or missing marker. It never
continues automatically after a failed attestation.

PostgreSQL `NOTICE` and `WARNING` output is retained in each step's stderr
evidence and does not itself stop execution. Native-process success is decided
from the exact `psql` exit code and, where defined, the required PASS marker.

## Operator command

From the repository root:

```powershell
$env:AFEX_PG17_TEST_URL = $null
```

Set `SUPABASE_DB_URL` using the approved secret-delivery process without
printing it, then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.21D-RUN-PRODUCTION-INSTALL.ps1"
```

## Locking and availability

P2D.19 creates one table, constraints, two indexes, one policy, and ACLs.
Its dependency preflight requires an empty atomic command ledger. DDL takes
catalog and relation locks. The foreign key to `atomic_order_commands` can
briefly lock that empty Core V2 ledger but does not reference legacy order or
invoice tables.
Its transaction creates a separate `postgres`-grantor `SET=true` membership
and temporary schema `CREATE` for `afex_core_owner`, then removes and verifies
both before commit.
The payload relation, its foreign key to `atomic_order_commands`, indexes,
RLS state, policy, ACL closure, and final ownership are established while
`SET LOCAL ROLE afex_core_owner` is active. Catalog verification resumes only
after `RESET ROLE`.

P2D.20 grants selected authorization columns, adds three SELECT policies,
creates two functions, adds the canonical-size constraint, and updates Core
V2 policy/ACL metadata. Adding and validating the constraint scans the empty
payload table. It does not lock or modify legacy order, invoice, inventory,
customer, numbering, payment, or outbox data.
Its transaction creates separate `postgres`-grantor `SET=true` memberships
for `afex_core_owner` and `afex_function_owner`, grants temporary schema
`CREATE` only to `afex_function_owner`, and verifies full restoration before
commit.

Run in an approved low-traffic change window. Unexpected lock waiting,
statement timeout, or legacy traffic impact is a STOP condition.

## Transaction and recovery model

- Each migration has one explicit transaction and commits only after its
  internal verification passes.
- Any migration error rolls back that migration completely.
- Attestations and final verification are read-only transactions ending in
  `ROLLBACK`.
- P2D.19 is intentionally one-time and fails if its relation already exists.
- P2D.20 is intentionally one-time and fails if its functions, policies, or
  grants already exist.
- The runner never performs automatic rollback, DROP, REVOKE, or repair.

### Committed partial-state STOP procedures

The procedures below apply after a migration has committed. They are not
rollback authorization.

#### State R — P2D.19 attested; P2D.20 transaction rolled back

1. Never rerun P2D.19 or this full installer.
2. Preserve the failed P2D.20 evidence.
3. Run only the P2D.21O read-only resume preflight.
4. Continue only through the separately reviewed P2D.20-only runner.

#### State A — P2D.19 committed; P2D.19 attestation failed

1. Stop immediately. Do not execute P2D.20.
2. Do not rerun P2D.19 and do not run DROP, rollback, repair, or reversal SQL.
3. Preserve all stdout, stderr, exit codes, timestamps, verified hashes, and
   PASS-marker results from the failed run.
4. Keep Runtime Integration and Executor execution blocked.
5. Obtain a separately approved read-only state capture of the installed
   P2D.19 objects and their catalog contracts.
6. Prepare an externally reviewed forward-fix package from the captured state.
7. Require a new explicit operator approval before any corrective write.

#### State B — P2D.20 committed; P2D.20 attestation failed

1. Stop immediately. Do not run final verification as installation approval.
2. Do not rerun either migration and do not run DROP, rollback, repair, or
   reversal SQL.
3. Preserve all stdout, stderr, exit codes, timestamps, verified hashes, and
   PASS-marker results from the failed run.
4. Keep Runtime Integration and Executor execution blocked.
5. Obtain a separately approved read-only state capture of P2D.19 and P2D.20,
   including functions, owners, ACLs, policies, constraints, and source hashes.
6. Prepare an externally reviewed forward-fix package from the captured state.
7. Require a new explicit operator approval before any corrective write.

#### State C — both migrations committed; final verification failed

1. Stop immediately. Do not declare the package complete.
2. Do not rerun either migration and do not run DROP, rollback, repair, or
   reversal SQL.
3. Preserve all stdout, stderr, exit codes, timestamps, verified hashes, and
   PASS-marker results, including both attestation markers.
4. Keep Runtime Integration and Executor execution blocked.
5. Obtain a separately approved read-only state capture focused on the failed
   final-verification contract.
6. Prepare an externally reviewed forward-fix package from the captured state.
7. Require a new explicit operator approval before any corrective write.

## Evidence

A timestamped evidence directory contains:

- verified hash inventory;
- redacted run metadata;
- stdout and stderr for every SQL step;
- exit codes and marker results;
- final summary.

The connection URL and credentials must never appear in evidence. If secret
material appears, stop distribution, revoke affected credentials, and follow
the incident procedure.

## STOP conditions

Stop for:

- any hash mismatch;
- wrong client or server version;
- non-UTF8 server;
- incorrect Production identity;
- missing approval;
- failed read-only preflight;
- failed or missing attestation marker;
- partial-install residue;
- unexpected object, policy, ACL, owner, membership, or dependency;
- unavailable installer authority;
- non-empty Core V2 command ledger;
- lock timeout or unexpected legacy traffic impact;
- unexpected direct runtime, browser, service, issuer, or worker privilege;
- evidence or credential-integrity failure;
- stale execution lock.

## Successful completion

Success requires all zero exit codes and these markers:

- `P2D21_900_MANUAL_PRODUCTION_PREFLIGHT_OK`
- `P2D19A_900_POST_INSTALL_ATTESTATION_OK`
- `P2D20A_900_POST_INSTALL_ATTESTATION_OK`
- `P2D21D_900_POST_INSTALL_VERIFICATION_OK`
- `P2D21D_950_PRODUCTION_PACKAGE_COMPLETE`

Completion installs storage and acquisition foundations only. Core V2 remains
unactivated and the legacy order path remains authoritative.
