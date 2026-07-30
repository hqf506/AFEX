# P2D.22 Final Verification Runbook

## Preconditions

- P2D.19 and P2D.20 are already committed and attested in Production.
- Do not rerun P2D.19 or P2D.20.
- P2D.21S completed with marker
  `P2D21S_900_AUTHORIZATION_PRIVILEGE_PROVENANCE_DIAGNOSTIC_COMPLETE`.
- Production is PostgreSQL 17.6 with UTF8 encoding.
- PostgreSQL 18.4 `psql` exists at the reviewed runner path.
- `SUPABASE_DB_URL` is present only in the operator process environment.
- The approved database and database user are both `postgres`.

## Exact command

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\database-reconciliation\core-v2\P2D\P2D.22-RUN-FINAL-VERIFICATION.ps1"
```

## Scripts executed

The runner executes only these read-only artifacts, in order:

1. `P2D.22-FINAL-VERIFICATION-AUTHORIZATION-CONTRACT.sql`
2. `P2D.22-POST-INSTALL-AUTHORIZATION-ATTESTATION.sql`
3. `P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql`

The attestation and P2D.21D reuse the P2D.22 exact-set verifier through a
relative psql include. No migration executes. P2D.19 and P2D.20 migration
files are not present in the runner inventory.

Before execution, the runner also hash-verifies the canonical contract
reference and all three executable verification artifacts. The canonical
contract reference itself is not sent to `psql`.

## Expected markers

- `P2D22_900_AUTHORIZATION_CONTRACT_VERIFICATION_OK`
- `P2D22A_900_AUTHORIZATION_ATTESTATION_OK`
- `P2D21D_900_POST_INSTALL_VERIFICATION_OK`
- Runner completion:
  `P2D22_900_FINAL_VERIFICATION_CONTRACT_ALIGNMENT_PACKAGE_READY`

## Evidence

A timestamped `evidence/P2D.22-*` directory contains separate stdout and
stderr files for each step plus `step-results.txt`. The summary records every
native exit code, marker result, overall runner exit code, and credential
cleanup result.

## Credential handling

The connection URL is parsed in the parent PowerShell process. Only host,
port, database, and user are passed to `psql`; the password is written to a
uniquely named restricted temporary pgpass file. The prior `PGPASSFILE` value
is restored before bounded attribute/ACL normalization and literal-path
deletion. A surviving credential file is security exit `4`.

## Failure handling

- Native SQL failure: exit `3`.
- Required marker missing: exit `5`.
- Runner/process failure: exit `6`.
- Credential cleanup failure: exit `4`, while prior step results remain in
  the summary.

Stop on any failure. Do not alter ACLs from this verification package. Do not
rerun P2D.19 or P2D.20.

## Return for review

Return the complete timestamped evidence directory:

- every `*.stdout.txt`;
- every `*.stderr.txt`;
- `step-results.txt`.
