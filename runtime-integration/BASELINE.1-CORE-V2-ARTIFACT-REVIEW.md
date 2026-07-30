# AFEX ERP / POS — BASELINE.1 Core V2 Artifact Review

Status: repository review and Git preparation only

## Executive verdict

**C. BLOCKED — CLEANUP REQUIRED FIRST.**

The pre-review working tree contained 167 untracked files, zero tracked
modifications, zero deletions, and zero staged files. The content separates
cleanly into P2D source/operational artifacts, six prior-phase TypeScript
scaffolds, six R1 planning artifacts, and 104 generated evidence files.

A baseline commit should not include:

- the 104 raw/generated evidence files;
- five zero-byte SQL placeholders;
- the six `lib/core-v2` scaffolds until the user explicitly accepts their
  non-authoritative, incomplete status or defers them.

No credential value, credentialed PostgreSQL URI, JWT, private key, Supabase
service-role key, or API key was detected by the static scan. Two run metadata
files contain a `connection_value` field whose stored value is eight characters
and was not emitted during this review; URI/JWT/private-key patterns did not
match. Raw Production evidence still exposes operational database/catalog
details and should remain local.

## Working-tree summary

| State before this report | Count |
|---|---:|
| Tracked modified | 0 |
| Tracked added/staged | 0 |
| Tracked deleted | 0 |
| Untracked | 167 |
| Staged | 0 |

After this review, the only new file is this report.

## Complete changed-file inventory and classification

All pre-existing changes are untracked (`??`). No modified or deleted tracked
file exists.

### P2D DATABASE FOUNDATION

The following substantive repository artifacts are classified
`P2D DATABASE FOUNDATION`:

- `database-reconciliation/core-v2/P2D/README.md`
- `database-reconciliation/core-v2/P2D/P2D.14B-read-only-production-preflight.sql`
- `database-reconciliation/core-v2/P2D/P2D.15-FRESH.sql`
- `database-reconciliation/core-v2/P2D/P2D.16-POST-INSTALL-ATTESTATION.sql`
- `database-reconciliation/core-v2/P2D/P2D.17-DURABLE-IMMUTABLE-COMMAND-ENVELOPE-DESIGN.md`
- `database-reconciliation/core-v2/P2D/P2D.18-DURABLE-COMMAND-CONTRACT-FREEZE.md`
- `database-reconciliation/core-v2/P2D/P2D.18A-DURABLE-COMMAND-CONTRACT-CLARIFICATION-AMENDMENT.md`
- `database-reconciliation/core-v2/P2D/P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql`
- `database-reconciliation/core-v2/P2D/P2D.19-POST-INSTALL-ATTESTATION.sql`
- `database-reconciliation/core-v2/P2D/P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql`
- `database-reconciliation/core-v2/P2D/P2D.20-POST-INSTALL-ATTESTATION.sql`
- `database-reconciliation/core-v2/P2D/P2D.21-MANUAL-PRODUCTION-PREFLIGHT.sql`
- `database-reconciliation/core-v2/P2D/P2D.21-MANUAL-PRODUCTION-PREFLIGHT-RUNBOOK.md`
- `database-reconciliation/core-v2/P2D/P2D.21-RUN-MANUAL-PREFLIGHT.ps1`
- `database-reconciliation/core-v2/P2D/P2D.21B-CANONICALIZATION-TEST-VECTORS.sql`
- `database-reconciliation/core-v2/P2D/P2D.21B-ISOLATED-TEST-RUNBOOK.md`
- `database-reconciliation/core-v2/P2D/P2D.21B-POSTGRESQL-17.6-CLONE-SETUP.sql`
- `database-reconciliation/core-v2/P2D/P2D.21B-RUN-ISOLATED-17.6-TESTS.ps1`
- `database-reconciliation/core-v2/P2D/P2D.21B-SECURITY-CONCURRENCY-TESTS.sql`
- `database-reconciliation/core-v2/P2D/P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql`
- `database-reconciliation/core-v2/P2D/P2D.21D-PRODUCTION-INSTALL-RUNBOOK.md`
- `database-reconciliation/core-v2/P2D/P2D.21D-RUN-PRODUCTION-INSTALL.ps1`
- `database-reconciliation/core-v2/P2D/P2D.21K-INSTALLER-AUTHORITY-DIAGNOSTIC.sql`
- `database-reconciliation/core-v2/P2D/P2D.21K-INSTALLER-AUTHORITY-RUNBOOK.md`
- `database-reconciliation/core-v2/P2D/P2D.21K-RUN-INSTALLER-AUTHORITY-DIAGNOSTIC.ps1`
- `database-reconciliation/core-v2/P2D/P2D.21O-P2D20-RESUME-PREFLIGHT.sql`
- `database-reconciliation/core-v2/P2D/P2D.21O-P2D20-RESUME-RUNBOOK.md`
- `database-reconciliation/core-v2/P2D/P2D.21O-RUN-P2D20-ONLY-PRODUCTION.ps1`
- `database-reconciliation/core-v2/P2D/P2D.21O-RUN-P2D20-RESUME-PREFLIGHT.ps1`
- `database-reconciliation/core-v2/P2D/P2D.21Q-AUTHORIZATION-COLUMN-ACL-DIAGNOSTIC.sql`
- `database-reconciliation/core-v2/P2D/P2D.21Q-AUTHORIZATION-COLUMN-ACL-RUNBOOK.md`
- `database-reconciliation/core-v2/P2D/P2D.21Q-RUN-AUTHORIZATION-COLUMN-ACL-DIAGNOSTIC.ps1`
- `database-reconciliation/core-v2/P2D/P2D.21R-AUTHORIZATION-ACL-CANONICAL-CONTRACT.sql`
- `database-reconciliation/core-v2/P2D/P2D.21R-AUTHORIZATION-ACL-CONTRACT-RESOLUTION.md`
- `database-reconciliation/core-v2/P2D/P2D.21R-FORWARD-DECISION.md`
- `database-reconciliation/core-v2/P2D/P2D.21S-AUTHORIZATION-PRIVILEGE-PROVENANCE-DIAGNOSTIC.sql`
- `database-reconciliation/core-v2/P2D/P2D.21S-AUTHORIZATION-PRIVILEGE-PROVENANCE-EXPECTED-DECISION.md`
- `database-reconciliation/core-v2/P2D/P2D.21S-AUTHORIZATION-PRIVILEGE-PROVENANCE-RUNBOOK.md`
- `database-reconciliation/core-v2/P2D/P2D.21S-RUN-AUTHORIZATION-PRIVILEGE-PROVENANCE-DIAGNOSTIC.ps1`
- `database-reconciliation/core-v2/P2D/P2D.21T-PUBLIC-PSEUDO-ROLE-REPAIR-REPORT.md`
- `database-reconciliation/core-v2/P2D/P2D.22-AUTHORIZATION-ACL-CANONICAL-CONTRACT.sql`
- `database-reconciliation/core-v2/P2D/P2D.22-FINAL-VERIFICATION-AUTHORIZATION-CONTRACT.sql`
- `database-reconciliation/core-v2/P2D/P2D.22-FINAL-VERIFICATION-CONTRACT-ALIGNMENT-REPORT.md`
- `database-reconciliation/core-v2/P2D/P2D.22-FINAL-VERIFICATION-RUNBOOK.md`
- `database-reconciliation/core-v2/P2D/P2D.22-POST-INSTALL-AUTHORIZATION-ATTESTATION.sql`
- `database-reconciliation/core-v2/P2D/P2D.22-RUN-FINAL-VERIFICATION.ps1`

These are source, reviewed diagnostics, runners, runbooks, or contract reports.
The runners contain deliberate references to environment-variable names and
temporary `PGPASSFILE` handling, not embedded credentials.

### TEMPORARY / SHOULD NOT COMMIT

These five files are empty placeholders (zero bytes) and should be excluded
from the baseline unless the user explicitly requires placeholder retention:

- `database-reconciliation/core-v2/P2D/P2D.15-FORWARD.sql`
- `database-reconciliation/core-v2/P2D/P2D.16-issue-authorization-context.sql`
- `database-reconciliation/core-v2/P2D/P2D.17-internal-helpers.sql`
- `database-reconciliation/core-v2/P2D/P2D.18-execute-atomic-order.sql`
- `database-reconciliation/core-v2/P2D/P2D.19-api-cutover.sql`

They contain no SQL, but their names imply executable artifacts and could
mislead an operator.

### CORE V2 RUNTIME FOUNDATION / REQUIRES REVIEW

Each of these is a deliberate prior-phase Runtime scaffold, but the set is
incomplete and not safe to describe as the installed Runtime authority:

- `lib/core-v2/authorization/issue-context.ts`
- `lib/core-v2/commands/issue-command.ts`
- `lib/core-v2/index.ts`
- `lib/core-v2/runtime/issue-atomic.ts`
- `lib/core-v2/types/contracts.ts`
- `lib/core-v2/validation/order-request.ts`

Classification: `CORE V2 RUNTIME FOUNDATION` and `REQUIRES REVIEW`.

They are not accidental A1 files: their names and content predate the A1
recommended structure, use `server-only`, and form a coherent in-process
issuance scaffold. They are nevertheless non-authoritative because they:

- construct authorization context and command records in TypeScript;
- depend on a caller-supplied principal and abstract persistence;
- do not call the installed P2D.20 trusted acquisition function;
- expose only a `reserved` result, not P2D.20's four acquisition dispositions;
- use local canonicalization and a 512-character idempotency limit that have
  not been reconciled here with the installed contract;
- contain no A1 forbidden-boundary test package.

Recommendation: defer these six from the first database/documentation baseline
unless the user explicitly wants a separate historical-scaffold commit.

### R1.1 RUNTIME INVENTORY

- `runtime-integration/R1.1-RUNTIME-INVENTORY.md`

Classification: `R1.1 RUNTIME INVENTORY`.

The completion marker `R1_100_RUNTIME_INVENTORY_COMPLETE` is present exactly
once.

### R1.2 RUNTIME ARCHITECTURE

- `runtime-integration/R1.2-TARGET-RUNTIME-ARCHITECTURE.md`
- `runtime-integration/R1.2-MIGRATION-BATCH-PLAN.md`
- `runtime-integration/R1.2-LEGACY-PATH-DISPOSITION.md`
- `runtime-integration/R1.2-CRITICAL-PATH-AND-DECISIONS.md`
- `runtime-integration/R1.2-MASTER-EXECUTION-CHECKLIST.md`

Classification: `R1.2 RUNTIME ARCHITECTURE`.

The overall marker
`R1_200_RUNTIME_ARCHITECTURE_AND_MIGRATION_PLAN_COMPLETE` is present exactly
once.

### EVIDENCE / GENERATED OUTPUT

All 104 files below are classified `EVIDENCE / GENERATED OUTPUT`.

#### P2D.14B placeholders

- `database-reconciliation/core-v2/P2D/evidence/P2D.14B-production-output.csv`
- `database-reconciliation/core-v2/P2D/evidence/P2D.14B-production-output.md`
- `database-reconciliation/core-v2/P2D/evidence/P2D.14B-review.md`

All three are zero-byte placeholders.

#### Standalone P2D.21 preflight captures

For each timestamp below, the exact files shown are present:

- `20260730-170256-131`: `.stderr.txt`, `.stdout.txt`
- `20260730-170459-909`: `.stderr.txt`, `.stdout.txt`
- `20260730-171306-185`: `.stderr.txt`, `.stdout.txt`
- `20260730-213223-711`: `.stderr.txt`, `.stdout.txt`
- `20260730-213613-705`: `.stderr.txt`, `.stdout.txt`
- `20260730-214136-125`: `.stderr.txt`, `.stdout.txt`, `.summary.txt`
- `20260730-220033-328`: `.stderr.txt`, `.stdout.txt`, `.summary.txt`
- `20260730-220911-855`: `.stderr.txt`, `.stdout.txt`, `.summary.txt`
- `20260730-224536-518`: `.stderr.txt`, `.stdout.txt`, `.summary.txt`
- `20260730-225558-707`: `.stderr.txt`, `.stdout.txt`, `.summary.txt`

Every file uses the full prefix:
`database-reconciliation/core-v2/P2D/evidence/P2D.21-production-preflight-`.

#### P2D.21D installation capture `P2D.21D-20260730-224741-568`

- `010-preflight.stderr.txt`
- `010-preflight.stdout.txt`
- `020-p2d19.stderr.txt`
- `020-p2d19.stdout.txt`
- `run-metadata.txt`
- `step-results.txt`
- `verified-hashes.txt`

#### P2D.21D installation capture `P2D.21D-20260730-225714-645`

- `010-preflight.stderr.txt`
- `010-preflight.stdout.txt`
- `020-p2d19.stderr.txt`
- `020-p2d19.stdout.txt`
- `030-p2d19-attestation.stderr.txt`
- `030-p2d19-attestation.stdout.txt`
- `040-p2d20.stderr.txt`
- `040-p2d20.stdout.txt`
- `run-metadata.txt`
- `step-results.txt`
- `verified-hashes.txt`

#### P2D.21K standalone capture

Prefix:
`database-reconciliation/core-v2/P2D/evidence/P2D.21K-installer-authority-20260730-221801-019`

- `.stderr.txt`
- `.stdout.txt`
- `.summary.txt`

#### P2D.21O installation capture `P2D.21O-20260730-231603-256`

- `010-resume-preflight.stderr.txt`
- `010-resume-preflight.stdout.txt`
- `020-p2d20.stderr.txt`
- `020-p2d20.stdout.txt`
- `step-results.txt`
- `verified-hashes.txt`

#### P2D.21O installation capture `P2D.21O-20260730-232902-023`

- `010-resume-preflight.stderr.txt`
- `010-resume-preflight.stdout.txt`
- `020-p2d20.stderr.txt`
- `020-p2d20.stdout.txt`
- `030-p2d20-attestation.stderr.txt`
- `030-p2d20-attestation.stdout.txt`
- `040-final-verification.stderr.txt`
- `040-final-verification.stdout.txt`
- `step-results.txt`
- `verified-hashes.txt`

#### P2D.21O standalone resume-preflight captures

For both `20260730-231450-910` and `20260730-232817-686`:

- `.stderr.txt`
- `.stdout.txt`
- `.summary.txt`

The full prefix is:
`database-reconciliation/core-v2/P2D/evidence/P2D.21O-resume-preflight-`.

#### P2D.21Q capture `P2D.21Q-20260730T203634885Z`

- `P2D.21Q-summary.txt`
- `P2D.21Q.stderr.txt`
- `P2D.21Q.stdout.txt`

#### P2D.21S captures

For each directory `P2D.21S-20260730T210002611Z`,
`P2D.21S-20260730T211219125Z`, and
`P2D.21S-20260730T211237722Z`:

- `P2D.21S-summary.txt`
- `P2D.21S.stderr.txt`
- `P2D.21S.stdout.txt`

#### P2D.22 final verification capture `P2D.22-20260730T212754364Z`

- `010-contract-verification.stderr.txt`
- `010-contract-verification.stdout.txt`
- `020-authorization-attestation.stderr.txt`
- `020-authorization-attestation.stdout.txt`
- `030-final-verification.stderr.txt`
- `030-final-verification.stdout.txt`
- `step-results.txt`

#### P2D21B isolated test captures

For both directories `P2D21B-20260730T144152Z` and
`P2D21B-20260730T144237Z`:

- `010-clone-setup.stderr.txt`
- `010-clone-setup.stdout.txt`
- `TEST-ONLY-P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql`
- `TEST-ONLY-P2D.19-POST-INSTALL-ATTESTATION.sql`
- `TEST-ONLY-P2D.20-POST-INSTALL-ATTESTATION.sql`
- `TEST-ONLY-P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql`
- `runbook-sha256.txt`

### UNRELATED CHANGE

None detected.

### REQUIRES REVIEW

- all six `lib/core-v2` files, for the reasons above;
- all five zero-byte SQL placeholders, for removal/exclusion decision;
- all 104 evidence files, for retention and external archival policy;
- `credential_cleanup_succeeded=False` in the successful P2D.22
  `step-results.txt`, even though all three steps and markers passed and
  `run_failure` is blank. This requires operator interpretation before any
  evidence is treated as a canonical proof package.

## File classification matrix

| Category | Count | Commit recommendation |
|---|---:|---|
| P2D DATABASE FOUNDATION | 46 | Commit as one reviewed P2D source/operations unit |
| CORE V2 RUNTIME FOUNDATION | 6 | Separate commit only after explicit user acceptance |
| R1.1 RUNTIME INVENTORY | 1 | Commit after P2D baseline |
| R1.2 RUNTIME ARCHITECTURE | 5 | Commit with R1.1 or as its own planning commit |
| EVIDENCE / GENERATED OUTPUT | 104 | Local/external archive; do not baseline raw files |
| TEMPORARY / SHOULD NOT COMMIT | 5 | Exclude/remove after user approval |
| UNRELATED CHANGE | 0 | None |
| REQUIRES REVIEW | 115 overlapping files | Resolve before baseline |

The overlapping review count comprises evidence, placeholders, and Runtime
scaffolds; it is not an additional working-tree count.

## Sensitive-content review

### Scan result

- Credentialed PostgreSQL URI: not detected.
- Any literal PostgreSQL URI: not detected.
- JWT/access token value: not detected.
- Supabase service-role JWT/value: not detected.
- AWS-style access key: not detected.
- Private key block: not detected.
- Literal pgpass filename: not present as an untracked artifact.
- Raw database dump/backup filename: not detected.
- API key/service-role/database variable names: present in runbooks/runners as
  expected contract references, not embedded values.

The broad keyword scan produced references in 21 files, primarily runners and
runbooks describing `SUPABASE_DB_URL`, `PGPASSFILE`, or password parsing. One
P2D.17 occurrence is a normative prohibition/example of authentication
material, not a detected token value.

### Run metadata

Two `run-metadata.txt` files contain keys:

- `run_timestamp`
- `psql_version`
- `connection_variable`
- `connection_value`

The `connection_value` has an eight-character stored value and no connection
URI pattern was detected. The value was intentionally not printed in this
review. These files remain operational evidence and should not be committed.

### Risk conclusion

No confirmed credential-bearing file was found. Raw stdout/stderr, catalog
inventories, role names, database identity, filesystem paths, and failure
details are still operationally sensitive. Absence of a secret regex match is
not authorization to publish them.

## Evidence-directory decision

| Evidence class | Decision |
|---|---|
| Raw `.stdout.txt` / `.stderr.txt` | Remain local or move to approved restricted external evidence storage |
| `run-metadata.txt` | Remain local; never publish connection material |
| `step-results.txt`, `.summary.txt`, `verified-hashes.txt` | May be retained externally; commit only a separately reviewed sanitized proof if policy requires |
| `TEST-ONLY-*.sql` generated copies | Remove/exclude; source SQL already exists |
| Empty P2D.14B evidence placeholders | Remove/exclude |
| P2D.22 success outputs | Preserve in restricted evidence storage; do not commit raw |

Recommended future `.gitignore` rule, not applied in this phase:

```text
database-reconciliation/core-v2/P2D/evidence/**
```

If repository policy later requires a sanitized proof, add a narrow explicit
exception for a reviewed manifest rather than committing the whole directory.

## `lib/core-v2` decision

The six files are deliberate prior-phase scaffolding, not accidental A1 work.
They are server-only and no route, component, or hook imports them. No
application caller of `issue_atomic` or `acquire_atomic_order_command_v1` was
found.

They are not safe to baseline as the authoritative Runtime:

- they model authorization/issuance differently from installed P2D.20;
- they are incomplete relative to A1;
- they lack forbidden-boundary tests;
- committing them with P2D could imply approval that R1.1/R1.2 expressly withhold.

Recommended treatment: defer them from the first baseline commit. If historical
preservation is desired, commit them separately with a message that explicitly
labels them non-authoritative and unwired. A1 should then replace or supersede
them in a reviewable subsequent commit.

## Consistency review

### P2D.19/P2D.20

Current source hashes:

| Artifact | SHA-256 | Synchronization evidence |
|---|---|---|
| P2D.19 migration | `5d5f6cc0555f43a7f54fcf6fc2ef085250599b8a72ce78e9f0d2b4a922511805` | Referenced by six repository artifacts |
| P2D.19 attestation | `08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273` | Matches successful resume evidence and repository references |
| P2D.20 migration | `d9b4f1a9caffe5644de721e6622be545056873ba5c1bfedd83f481b6bcee0192` | Matches successful resume evidence and repository references |
| P2D.20 attestation | `fbfa71081487f55f09e73292d9ed9e7f4a743ca7383fe50940eca031f09a33a7` | Matches successful resume evidence and repository references |

No tracked baseline exists for a Git diff comparison because the entire P2D
tree is untracked. Within available repository evidence, the four hashes are
synchronized with their runbooks/manifests; no mismatch was found.

### P2D.22

The correction package is present:

- canonical ACL contract;
- final-verification authorization contract;
- alignment report;
- runbook;
- post-install authorization attestation;
- runner.

Runner hashes match the current P2D.22 artifacts and current corrected
P2D.21D final verifier. The latest evidence reports:

- contract verification exit `0`, marker found;
- authorization attestation exit `0`, marker found;
- final verification exit `0`, marker found;
- `P2D22_900_AUTHORIZATION_CONTRACT_VERIFICATION_OK`;
- `P2D22A_900_AUTHORIZATION_ATTESTATION_OK`;
- `P2D21D_900_POST_INSTALL_VERIFICATION_OK`.

### R1 and A1

- R1.1 exists and has its unique completion marker.
- All five R1.2 artifacts exist and have the overall unique completion marker.
- No suggested A1 implementation file exists:
  `lib/core-v2/contracts.ts`, `validators.ts`, `errors.ts`,
  `runtime-state.ts`, `credential-boundaries.ts`,
  `scripts/check-core-v2-boundaries.mjs`, or
  `runtime-integration/A1-RUNTIME-CONTRACT-FREEZE.md`.
- No route, component, or hook imports `lib/core-v2`, `issue_atomic`, or
  `acquire_atomic_order_command_v1`.
- Therefore A1 remains unstarted and Core V2 is not activated.

Repository files include PowerShell runners capable of invoking `psql`, but
their presence is operational tooling, not evidence of execution during this
review. No runner, SQL, application, migration, Supabase CLI, or database
command was executed in BASELINE.1.

## Commit-boundary recommendation

**C. BLOCKED — CLEANUP REQUIRED FIRST**, followed by
**B. MULTIPLE LOGICAL COMMITS**.

Required decisions before Git writes:

1. approve ignoring/removing the raw `evidence/` tree from the repository
   baseline while retaining it externally;
2. approve exclusion/removal of the five empty SQL placeholders;
3. choose whether the six `lib/core-v2` scaffolds are deferred or committed as
   a separately labeled historical foundation.

After those decisions, recommended order:

1. **P2D database foundation and operational controls**
2. **R1.1 runtime inventory**
3. **R1.2 runtime architecture and baseline review**
4. **Optional: non-authoritative Core V2 Runtime scaffold**, only if explicitly approved

This separates already-installed database artifacts from planning documents
and prevents the scaffold from being mistaken for the approved Runtime.

## Exact proposed Git commands

These commands are proposals only. None were executed.

### Preflight

```powershell
git status --short
git diff --check
git diff --cached --name-only
```

### Operator cleanup/exclusion decision

Do not run until the user explicitly authorizes cleanup. The eventual approved
action should exclude:

```text
database-reconciliation/core-v2/P2D/evidence/
database-reconciliation/core-v2/P2D/P2D.15-FORWARD.sql
database-reconciliation/core-v2/P2D/P2D.16-issue-authorization-context.sql
database-reconciliation/core-v2/P2D/P2D.17-internal-helpers.sql
database-reconciliation/core-v2/P2D/P2D.18-execute-atomic-order.sql
database-reconciliation/core-v2/P2D/P2D.19-api-cutover.sql
```

### Proposed commit 1 — P2D database foundation

```powershell
git add -- `
  database-reconciliation/core-v2/P2D/README.md `
  database-reconciliation/core-v2/P2D/P2D.14B-read-only-production-preflight.sql `
  database-reconciliation/core-v2/P2D/P2D.15-FRESH.sql `
  database-reconciliation/core-v2/P2D/P2D.16-POST-INSTALL-ATTESTATION.sql `
  database-reconciliation/core-v2/P2D/P2D.17-DURABLE-IMMUTABLE-COMMAND-ENVELOPE-DESIGN.md `
  database-reconciliation/core-v2/P2D/P2D.18-DURABLE-COMMAND-CONTRACT-FREEZE.md `
  database-reconciliation/core-v2/P2D/P2D.18A-DURABLE-COMMAND-CONTRACT-CLARIFICATION-AMENDMENT.md `
  database-reconciliation/core-v2/P2D/P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql `
  database-reconciliation/core-v2/P2D/P2D.19-POST-INSTALL-ATTESTATION.sql `
  database-reconciliation/core-v2/P2D/P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql `
  database-reconciliation/core-v2/P2D/P2D.20-POST-INSTALL-ATTESTATION.sql `
  database-reconciliation/core-v2/P2D/P2D.21-MANUAL-PRODUCTION-PREFLIGHT.sql `
  database-reconciliation/core-v2/P2D/P2D.21-MANUAL-PRODUCTION-PREFLIGHT-RUNBOOK.md `
  database-reconciliation/core-v2/P2D/P2D.21-RUN-MANUAL-PREFLIGHT.ps1 `
  database-reconciliation/core-v2/P2D/P2D.21B-CANONICALIZATION-TEST-VECTORS.sql `
  database-reconciliation/core-v2/P2D/P2D.21B-ISOLATED-TEST-RUNBOOK.md `
  database-reconciliation/core-v2/P2D/P2D.21B-POSTGRESQL-17.6-CLONE-SETUP.sql `
  database-reconciliation/core-v2/P2D/P2D.21B-RUN-ISOLATED-17.6-TESTS.ps1 `
  database-reconciliation/core-v2/P2D/P2D.21B-SECURITY-CONCURRENCY-TESTS.sql `
  database-reconciliation/core-v2/P2D/P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql `
  database-reconciliation/core-v2/P2D/P2D.21D-PRODUCTION-INSTALL-RUNBOOK.md `
  database-reconciliation/core-v2/P2D/P2D.21D-RUN-PRODUCTION-INSTALL.ps1 `
  database-reconciliation/core-v2/P2D/P2D.21K-INSTALLER-AUTHORITY-DIAGNOSTIC.sql `
  database-reconciliation/core-v2/P2D/P2D.21K-INSTALLER-AUTHORITY-RUNBOOK.md `
  database-reconciliation/core-v2/P2D/P2D.21K-RUN-INSTALLER-AUTHORITY-DIAGNOSTIC.ps1 `
  database-reconciliation/core-v2/P2D/P2D.21O-P2D20-RESUME-PREFLIGHT.sql `
  database-reconciliation/core-v2/P2D/P2D.21O-P2D20-RESUME-RUNBOOK.md `
  database-reconciliation/core-v2/P2D/P2D.21O-RUN-P2D20-ONLY-PRODUCTION.ps1 `
  database-reconciliation/core-v2/P2D/P2D.21O-RUN-P2D20-RESUME-PREFLIGHT.ps1 `
  database-reconciliation/core-v2/P2D/P2D.21Q-AUTHORIZATION-COLUMN-ACL-DIAGNOSTIC.sql `
  database-reconciliation/core-v2/P2D/P2D.21Q-AUTHORIZATION-COLUMN-ACL-RUNBOOK.md `
  database-reconciliation/core-v2/P2D/P2D.21Q-RUN-AUTHORIZATION-COLUMN-ACL-DIAGNOSTIC.ps1 `
  database-reconciliation/core-v2/P2D/P2D.21R-AUTHORIZATION-ACL-CANONICAL-CONTRACT.sql `
  database-reconciliation/core-v2/P2D/P2D.21R-AUTHORIZATION-ACL-CONTRACT-RESOLUTION.md `
  database-reconciliation/core-v2/P2D/P2D.21R-FORWARD-DECISION.md `
  database-reconciliation/core-v2/P2D/P2D.21S-AUTHORIZATION-PRIVILEGE-PROVENANCE-DIAGNOSTIC.sql `
  database-reconciliation/core-v2/P2D/P2D.21S-AUTHORIZATION-PRIVILEGE-PROVENANCE-EXPECTED-DECISION.md `
  database-reconciliation/core-v2/P2D/P2D.21S-AUTHORIZATION-PRIVILEGE-PROVENANCE-RUNBOOK.md `
  database-reconciliation/core-v2/P2D/P2D.21S-RUN-AUTHORIZATION-PRIVILEGE-PROVENANCE-DIAGNOSTIC.ps1 `
  database-reconciliation/core-v2/P2D/P2D.21T-PUBLIC-PSEUDO-ROLE-REPAIR-REPORT.md `
  database-reconciliation/core-v2/P2D/P2D.22-AUTHORIZATION-ACL-CANONICAL-CONTRACT.sql `
  database-reconciliation/core-v2/P2D/P2D.22-FINAL-VERIFICATION-AUTHORIZATION-CONTRACT.sql `
  database-reconciliation/core-v2/P2D/P2D.22-FINAL-VERIFICATION-CONTRACT-ALIGNMENT-REPORT.md `
  database-reconciliation/core-v2/P2D/P2D.22-FINAL-VERIFICATION-RUNBOOK.md `
  database-reconciliation/core-v2/P2D/P2D.22-POST-INSTALL-AUTHORIZATION-ATTESTATION.sql `
  database-reconciliation/core-v2/P2D/P2D.22-RUN-FINAL-VERIFICATION.ps1
git diff --cached --check
git status --short
git commit -m "Baseline Core V2 database foundation and verification"
git status --short
```

### Proposed commit 2 — R1.1 inventory

```powershell
git add -- runtime-integration/R1.1-RUNTIME-INVENTORY.md
git diff --cached --check
git status --short
git commit -m "Document Core V2 runtime inventory"
git status --short
```

### Proposed commit 3 — R1.2 architecture and this review

```powershell
git add -- `
  runtime-integration/R1.2-TARGET-RUNTIME-ARCHITECTURE.md `
  runtime-integration/R1.2-MIGRATION-BATCH-PLAN.md `
  runtime-integration/R1.2-LEGACY-PATH-DISPOSITION.md `
  runtime-integration/R1.2-CRITICAL-PATH-AND-DECISIONS.md `
  runtime-integration/R1.2-MASTER-EXECUTION-CHECKLIST.md `
  runtime-integration/BASELINE.1-CORE-V2-ARTIFACT-REVIEW.md
git diff --cached --check
git status --short
git commit -m "Document Core V2 runtime migration architecture"
git status --short
```

### Optional commit 4 — historical Runtime scaffold

Only if the user explicitly accepts the six files as non-authoritative:

```powershell
git add -- `
  lib/core-v2/authorization/issue-context.ts `
  lib/core-v2/commands/issue-command.ts `
  lib/core-v2/index.ts `
  lib/core-v2/runtime/issue-atomic.ts `
  lib/core-v2/types/contracts.ts `
  lib/core-v2/validation/order-request.ts
git diff --cached --check
git status --short
git commit -m "Baseline unwired Core V2 runtime scaffold"
git status --short
```

### Later optional operator push

```powershell
git push origin master
```

The push is not recommended until all commits are reviewed and the user
explicitly authorizes it.

## Files to exclude

- Entire `database-reconciliation/core-v2/P2D/evidence/` tree.
- Five zero-byte SQL placeholders.
- Any temporary pgpass file if one is created later.
- Raw stdout/stderr, database dumps, backups, credential logs, and locally
  materialized test-only SQL copies.
- Six `lib/core-v2` files until the user resolves the scaffold decision.

## Files requiring user review

1. The six `lib/core-v2` scaffolds: defer or historical baseline commit.
2. Five empty SQL placeholders: remove or intentionally retain.
3. Evidence retention: restricted external archive versus sanitized manifest.
4. P2D.22 `credential_cleanup_succeeded=False`: determine whether this reflects
   an actual cleanup failure or runner reporting defect.
5. P2D operational runners: approve committing Production-oriented tooling to
   this repository despite its safe variable-only credential contract.

## Validation

- Full working tree reviewed: PASS, 167 pre-existing untracked files.
- Classification coverage: PASS, every file accounted for by exact path or
  exact evidence directory/prefix plus complete member list.
- Sensitive static scan: PASS with no confirmed secret value; operational
  evidence remains restricted.
- R1.1 and all five R1.2 files present: PASS.
- P2D.19/P2D.20 hash synchronization: PASS against available repository evidence.
- P2D.22 correction and success evidence: PRESENT/PASS, with the cleanup flag
  noted for review.
- A1 files absent and no route activation: PASS.
- Git write operations: none.
- Database connection: none.
- SQL execution: none.
- Migration execution/creation: none.
- Commit/push: none.

## Readiness decision

**BASELINE COMMIT BLOCKED UNTIL THE EVIDENCE, EMPTY-PLACEHOLDER, AND
`lib/core-v2` DECISIONS ARE APPROVED.**

After those decisions, the proposed multiple-commit sequence is ready for
operator execution.

`BASELINE1_900_CORE_V2_ARTIFACT_REVIEW_COMPLETE`
