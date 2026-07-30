# P2D.21B — PostgreSQL 17.6 Isolated Compatibility Test Runbook

Status: **DRAFT — TEST ONLY — DO NOT USE WITH PRODUCTION**

## Purpose

This package establishes whether the frozen P2D.19 and P2D.20 behavior is
compatible with PostgreSQL 17.6. It does not authorize a Production version
gate change.

## Isolation gates

- Use a disposable PostgreSQL **17.6** database.
- `AFEX_PG17_TEST_URL` is the only permitted connection variable.
- The URL host must be exactly `localhost` or `127.0.0.1`.
- Unset `SUPABASE_DB_URL`.
- Never use Production credentials, hostnames, database names, or data.
- Destroy the database after exporting and hashing evidence.

## Frozen hash manifest

The operator must externally review and freeze this table before execution.

| Artifact | SHA-256 |
|---|---|
| P2D.21B-POSTGRESQL-17.6-CLONE-SETUP.sql | `f0baef735ba9e8ad7f169f8a100b9de3964e3cbbd2476ed9696bc3768ef32654` |
| P2D.21B-CANONICALIZATION-TEST-VECTORS.sql | `698cbcbfd4f9a92b9e22b393d64b07830debbf101654b75903f1793cd130f836` |
| P2D.21B-SECURITY-CONCURRENCY-TESTS.sql | `c8682fec3de82a33ed1c0b828fcf64d08cccf602673868b2cdff4681eba8f515` |
| P2D.21B-RUN-ISOLATED-17.6-TESTS.ps1 | `2aca7b1ecc46e6f9fe10db783217e078c7895518af9cce880dc53f904de8f91f` |
| P2D.21B-ISOLATED-TEST-RUNBOOK.md | `RECORDED_AT_RUNTIME_TO_AVOID_SELF_REFERENCE` |
| P2D.15-FRESH.sql | `6c23f9d576989a8a5667626b545ac3d6f29181b839bda7fd319531b94f16267e` |
| P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql | `5d5f6cc0555f43a7f54fcf6fc2ef085250599b8a72ce78e9f0d2b4a922511805` |
| P2D.19-POST-INSTALL-ATTESTATION.sql | `08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273` |
| P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql | `d9b4f1a9caffe5644de721e6622be545056873ba5c1bfedd83f481b6bcee0192` |
| P2D.20-POST-INSTALL-ATTESTATION.sql | `fbfa71081487f55f09e73292d9ed9e7f4a743ca7383fe50940eca031f09a33a7` |

## Prerequisites

1. PostgreSQL 17.6 local server and PostgreSQL 17 or 18 `psql`.
2. A new empty disposable database.
3. An installer capable of creating the five synthetic NOLOGIN roles and
   transferring ownership.
4. `pgcrypto` available.
5. External approval of all hashes.
6. An approved frozen-valid P2D.18A payload fixture containing synthetic data.
7. Two independent operator terminals for the concurrency barrier.

## Execution order

1. Verify local connection identity without displaying the URL.
2. Install synthetic Supabase boundary roles, `profiles`, `tenants`, and `branches`.
3. Install the frozen P2D.15 foundation.
4. Install the test-only P2D.19 compatibility copy.
5. Run the P2D.19 attestation compatibility copy.
6. Install the test-only P2D.20 compatibility copy.
7. Run the P2D.20 attestation compatibility copy.
8. Run canonicalization vectors.
9. Run security and catalog capture.
10. Run the approved concurrent acquisition matrix.
11. Save `concurrency-results.csv`.
12. Run final ledger-integrity checks.
13. Verify every marker and hash the evidence directory.
14. Destroy the disposable database.

## Canonicalization matrix

Evidence must cover ASCII, Arabic, NFC composed/decomposed input,
supplementary-plane Unicode, control escaping, key order, whitespace,
alternate escaping, duplicate keys, canonical UUIDs and timestamps, money,
quantities, negative zero, item/modifier ordering, excluded metadata,
fingerprint projection, 262143-byte acceptance, 262144-byte rejection, and
every forbidden sensitive-key category.

Each row records vector ID, expected acceptance, actual acceptance, canonical
UTF8 bytes in hex, and SHA-256. Rejected rows must not expose input secrets.

## Concurrency matrix

Use one approved synthetic payload and two independent runtime LOGIN roles,
each with exactly one `afex_core_runtime` membership using:
`ADMIN FALSE, INHERIT FALSE, SET TRUE`.

Record:

- same key plus same fingerprint: exactly one `created`;
- concurrent peer: `in_progress` or contract-valid `replay`;
- same key plus different fingerprint: `fingerprint_conflict`;
- payload failure transaction: no context, command, or payload remains;
- ledger counts remain one-to-one;
- advisory-lock waiting is visible in elapsed-time evidence.

The reviewed CSV must contain these literal approval markers:

```text
created
in_progress_or_replay
fingerprint_conflict
rollback_no_orphans
```

## STOP conditions

Stop immediately for a non-local URL, wrong server version, non-UTF8 server,
non-empty foundation, hash mismatch, unexpected privilege, missing PASS
marker, canonical-vector difference, orphan row, inconsistent disposition,
credential disclosure, or any attempt to use Production evidence.

## Operator command

```powershell
$env:SUPABASE_DB_URL = $null
$env:AFEX_PG17_TEST_URL = '<local runtime-generated URL>'
& '.\database-reconciliation\core-v2\P2D\P2D.21B-RUN-ISOLATED-17.6-TESTS.ps1'
```

The connection value is runtime-generated and must never be copied into
evidence.

## Acceptance

Compatibility is established only when every evidence artifact is retained,
the disposable database is destroyed, external review approves the evidence,
and the final marker is:

`P2D21B_900_POSTGRESQL_17_6_COMPATIBILITY_OK`
