# P2D.21O P2D.20-Only Production Resume Runbook

## Scope

This runbook applies only after P2D.19 has committed and its read-only
attestation has passed, while P2D.20 is absent. It never authorizes or invokes
P2D.19 again.

## Preconditions

- Production PostgreSQL is exactly 17.6 with UTF8 encoding.
- P2D.19 is installed and matches its frozen attestation.
- P2D.20 has rolled back completely and no partial artifact exists.
- The `postgres` installer and Supabase bootstrap memberships match the
  reviewed contract.
- `SUPABASE_DB_URL`, `AFEX_EXPECTED_PRODUCTION_DATABASE`, and
  `AFEX_EXPECTED_PRODUCTION_USER` are supplied through approved channels.
- The P2D.20-only runner and every controlled artifact match the reviewed
  hashes.

## Frozen artifact hashes

| Artifact | SHA-256 |
|---|---|
| `P2D.21O-P2D20-RESUME-PREFLIGHT.sql` | `23fb25db84bc5db0135750bb1bb3a297d185e6cbb79a5a6f13f75d4c40edf473` |
| `P2D.21O-RUN-P2D20-RESUME-PREFLIGHT.ps1` | `8ee651d8f60d98e944569f62576c17a204bd6411bfd7fbe72d7270a2a034b503` |
| `P2D.21O-RUN-P2D20-ONLY-PRODUCTION.ps1` | `e8f8dace14c5c5de09af90549e4f3b01106b21ca9873da317beac03533e6b74a` |
| `P2D.19-POST-INSTALL-ATTESTATION.sql` | `08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273` |
| `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql` | `d9b4f1a9caffe5644de721e6622be545056873ba5c1bfedd83f481b6bcee0192` |
| `P2D.20-POST-INSTALL-ATTESTATION.sql` | `fbfa71081487f55f09e73292d9ed9e7f4a743ca7383fe50940eca031f09a33a7` |
| `P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql` | `6f92d01e098dee2ff46048fac9eb56e327dc4f23bbbce56b9c20087088cac640` |

## Read-only resume preflight

Run from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.21O-RUN-P2D20-RESUME-PREFLIGHT.ps1"
```

Continue only when the exact marker is present:

`P2D21O_900_P2D20_RESUME_PREFLIGHT_OK`

## P2D.20-only installation

After independent evidence review, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.21O-RUN-P2D20-ONLY-PRODUCTION.ps1"
```

The required typed confirmation is:

`INSTALL-P2D20-ONLY-ON-PRODUCTION`

The runner executes only:

1. P2D.20 resume preflight.
2. P2D.20 migration.
3. P2D.20 post-install attestation.
4. P2D.21D final read-only verification.

Expected final marker:

`P2D21O_950_P2D20_RESUME_COMPLETE`

## STOP conditions

- Any hash mismatch.
- Any nonzero `psql` exit code.
- Any missing PASS marker.
- Any partial P2D.20 object, policy, grant, or constraint.
- Any temporary membership or schema privilege residue.
- Any nonempty command or payload ledger.
- Any P2D.19 attestation failure.
- Any credential-file cleanup failure.

Never run the original full installer after P2D.19 has committed.
