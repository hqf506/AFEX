# AFEX ERP / POS — BASELINE.2 Safe Cleanup and Commit Plan

Status: approved cleanup applied; Git writes not performed

## Executive verdict

Evidence exclusion is complete and local evidence is preserved. The five empty
SQL files were not deleted because the P2D README explicitly identifies them
as intentional future placeholders and execution-order entries. That reference
makes deletion ambiguous under the fail-closed rule.

The repository is ready for the proposed three-commit structure only after the
user decides whether those five stale/intentional placeholders should be
retained, superseded, or deleted. The six `lib/core-v2` files remain deferred
and unchanged.

## Exact `.gitignore` change

Only `.gitignore` was modified outside this report. The following narrow rule
was appended:

```gitignore
# Local Core V2 Production evidence
/database-reconciliation/core-v2/P2D/evidence/
```

The rule:

- ignores only the P2D evidence directory;
- does not ignore the P2D package directory;
- does not ignore SQL, PowerShell, runbooks, reports, or contracts outside
  `evidence/`;
- does not ignore `lib/core-v2`;
- preserves all evidence files on disk.

## Evidence exclusion proof

| Check | Result |
|---|---|
| Evidence files visible in BASELINE.1 Git status | 104 |
| Evidence files currently on disk | 105 |
| Evidence files now ignored by Git | 105 |
| Evidence files in normal Git status | 0 |
| Evidence files deleted | 0 |
| Nested `.gitkeep` or `.gitignore` | None |

The difference between the original 104 status entries and 105 files on disk
is `P2D.15-FRESH-production-execution.log`, which was already ignored by the
existing global `*.log` rule. The new directory rule now covers it and all
other evidence uniformly.

No evidence placeholder is needed to preserve the directory. Git does not
track empty directories, and evidence is runtime-generated local material.
No empty evidence output is proposed for commit.

## Five-placeholder decision matrix

| File | Bytes | Untracked | Runner refs | Runbook/report refs | SQL refs | Hash-manifest refs | Git history | Decision |
|---|---:|---|---:|---:|---:|---:|---:|---|
| `P2D.15-FORWARD.sql` | 0 | Yes | 0 | 1 | 0 | 0 | 0 | `REQUIRES_REVIEW` |
| `P2D.16-issue-authorization-context.sql` | 0 | Yes | 0 | 1 | 0 | 0 | 0 | `REQUIRES_REVIEW` |
| `P2D.17-internal-helpers.sql` | 0 | Yes | 0 | 1 | 0 | 0 | 0 | `REQUIRES_REVIEW` |
| `P2D.18-execute-atomic-order.sql` | 0 | Yes | 0 | 1 | 0 | 0 | 0 | `REQUIRES_REVIEW` |
| `P2D.19-api-cutover.sql` | 0 | Yes | 0 | 1 | 0 | 0 | 0 | `REQUIRES_REVIEW` |

The one reference for every file is
`database-reconciliation/core-v2/P2D/README.md`. The README says the
placeholder files intentionally remain empty until their named phases are
approved and lists them in a future execution order.

This contradicts the requirement that a deletable file be unused and not
referenced by a runbook/operational document. It also creates a stale-architecture
question because later P2D.19/P2D.20 packages now exist under different names.
No file is an approved executable migration, verifier, attestation, contract,
or diagnostic in its current empty state, but the explicit README intent is
enough to block deletion.

### Files deleted

None. No placeholder met all `SAFE_TO_DELETE_PLACEHOLDER` conditions.

## Deferred `lib/core-v2` inventory

All six files begin with the exact first line `import 'server-only'`. Repository
search found no import from `app/`, `components/`, or `hooks/`, and no live
caller of `issue_atomic` or `acquire_atomic_order_command_v1`.

| Path | Lines | Bytes | SHA-256 | Server-only | Route import | Authoritative status | Future gate |
|---|---:|---:|---|---|---|---|---|
| `lib/core-v2/authorization/issue-context.ts` | 132 | 3,830 | `cc6e46ca601dac801bf1f215e36f8fc32f226c62693e0cadf62a5f7a1461b6cb` | Exact first-line import | None | Non-authoritative caller-principal context builder | A1 P2D.20 mapping and trust-boundary review |
| `lib/core-v2/commands/issue-command.ts` | 52 | 1,538 | `a74af7bc8c785e952caf5a5f00394c3899073d2375ae9d36dccb2208b13d6614` | Exact first-line import | None | Non-authoritative local reserved-command builder | A1/B command contract reconciliation |
| `lib/core-v2/index.ts` | 16 | 462 | `80fd3f15d6b917d89600181346e87b118e706c0d23cf8e27d05c748bcddfc7ff` | Exact first-line import | None | Exports unwired `issue_atomic` | A1 forbidden-import and export decision |
| `lib/core-v2/runtime/issue-atomic.ts` | 125 | 3,397 | `0b3a86a6439f93dff28afd23f1893420be4c8905e743cccd70ee1cc84b88973b` | Exact first-line import | None | Abstract persistence; does not call P2D.20 | A1 replace/supersede decision |
| `lib/core-v2/types/contracts.ts` | 194 | 5,352 | `ca52b9e91ba569c0a25a2c1c214872fff38794f700cf9ca8e42f8c8674e8d9e6` | Exact first-line import | None | Prior contract, not frozen A1/P2D.20 mapping | A1 contract freeze |
| `lib/core-v2/validation/order-request.ts` | 111 | 3,034 | `6a304bb4f1abbe5684720f2149028cb5f9c555e47e8440b54a2260c4653a58ac` | Exact first-line import | None | Prior pure validator; parity not established | A1 P2D.18A validation review |

These files are excluded by exact commit path selection. No `.gitignore` rule
was added for them, and they were not modified or deleted.

## Exact P2D baseline file list

The following 46 P2D artifacts are safe candidates for Commit 1, subject to
final user review:

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

Commit 1 also includes the narrow `.gitignore` evidence rule.

Excluded from Commit 1:

- `database-reconciliation/core-v2/P2D/evidence/`;
- the five unresolved zero-byte placeholders;
- `lib/core-v2`;
- R1 reports.

## Exact R1.1 file list

Commit 2 contains only:

- `runtime-integration/R1.1-RUNTIME-INVENTORY.md`

## Exact R1.2 and baseline-report file list

Commit 3 contains:

- `runtime-integration/R1.2-TARGET-RUNTIME-ARCHITECTURE.md`
- `runtime-integration/R1.2-MIGRATION-BATCH-PLAN.md`
- `runtime-integration/R1.2-LEGACY-PATH-DISPOSITION.md`
- `runtime-integration/R1.2-CRITICAL-PATH-AND-DECISIONS.md`
- `runtime-integration/R1.2-MASTER-EXECUTION-CHECKLIST.md`
- `runtime-integration/BASELINE.1-CORE-V2-ARTIFACT-REVIEW.md`
- `runtime-integration/BASELINE.2-SAFE-CLEANUP-AND-COMMIT-PLAN.md`

## Unrelated or unresolved files

### Unrelated

None detected.

### Unresolved and intentionally unmodified

- five zero-byte SQL placeholders referenced by the P2D README;
- six non-authoritative `lib/core-v2` scaffolds;
- P2D.22 runner cleanup defect, which requires isolated hardening if the runner
  will be reused.

## P2D.19/P2D.20 integrity

No P2D artifact was modified. Current hashes remain:

| Artifact | SHA-256 |
|---|---|
| P2D.19 migration | `5d5f6cc0555f43a7f54fcf6fc2ef085250599b8a72ce78e9f0d2b4a922511805` |
| P2D.19 attestation | `08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273` |
| P2D.20 migration | `d9b4f1a9caffe5644de721e6622be545056873ba5c1bfedd83f481b6bcee0192` |
| P2D.20 attestation | `fbfa71081487f55f09e73292d9ed9e7f4a743ca7383fe50940eca031f09a33a7` |

Historical migrations and application files are unchanged.

## P2D.22 runner-defect status

### Verification result

- Authorization contract verification: PASS, exit `0`, marker found.
- Authorization attestation: PASS, exit `0`, marker found.
- Final read-only verification: PASS, exit `0`, marker found.

### Cleanup result

The evidence records `credential_cleanup_succeeded=False`. The temporary
pgpass file was manually removed by the operator. Evidence is now excluded
from Git.

### Current source logic

`P2D.22-RUN-FINAL-VERIFICATION.ps1` contains the latest attempted cleanup
logic:

- restores or removes inherited `PGPASSFILE`;
- clears database password and parsed URI references;
- forces garbage collection and waits for finalizers;
- attempts cleanup up to five times;
- clears file attributes;
- resets and re-grants the current Windows identity file control;
- calls forced `Remove-Item`;
- verifies file absence;
- records the exact cleanup result;
- exits `4` if the temporary file remains.

The source therefore contains a serious, fail-closed cleanup attempt, but
Production evidence proves that attempt did not succeed in the observed run.
The defect must not be claimed fixed.

### Decision

A later isolated runner-hardening phase is still required before reusing this
runner for credential-bearing execution. The SQL verification result remains
valid; the runner infrastructure defect is separate and was manually remediated.

## Proposed three-commit structure

1. **Document Core V2 database foundation and verification controls**
   - `.gitignore` narrow evidence rule
   - exact 46 P2D baseline artifacts
2. **Add Core V2 runtime inventory**
   - R1.1 only
3. **Add Core V2 runtime architecture and migration plan**
   - five R1.2 documents
   - BASELINE.1 and BASELINE.2 reports

The six `lib/core-v2` files and five unresolved placeholders are excluded by
exact path selection.

## Exact Git commands

These commands are documented only and were not executed.

### Preflight

```powershell
git status --short
git diff --check
git diff --cached --name-only
```

### Commit 1

```powershell
git add -- `
  .gitignore `
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
git diff --cached --name-only
git status --short
git commit -m "Document Core V2 database foundation and verification controls"
git status --short
```

### Commit 2

```powershell
git add -- runtime-integration/R1.1-RUNTIME-INVENTORY.md
git diff --cached --check
git diff --cached --name-only
git status --short
git commit -m "Add Core V2 runtime inventory"
git status --short
```

### Commit 3

```powershell
git add -- `
  runtime-integration/R1.2-TARGET-RUNTIME-ARCHITECTURE.md `
  runtime-integration/R1.2-MIGRATION-BATCH-PLAN.md `
  runtime-integration/R1.2-LEGACY-PATH-DISPOSITION.md `
  runtime-integration/R1.2-CRITICAL-PATH-AND-DECISIONS.md `
  runtime-integration/R1.2-MASTER-EXECUTION-CHECKLIST.md `
  runtime-integration/BASELINE.1-CORE-V2-ARTIFACT-REVIEW.md `
  runtime-integration/BASELINE.2-SAFE-CLEANUP-AND-COMMIT-PLAN.md
git diff --cached --check
git diff --cached --name-only
git status --short
git commit -m "Add Core V2 runtime architecture and migration plan"
git status --short
```

### Later optional push

```powershell
git push origin master
```

The optional push requires separate explicit operator authorization.

## Post-cleanup working-tree status

Expected status after this report:

| Category | Count |
|---|---:|
| Modified tracked files | 1 (`.gitignore`) |
| Untracked P2D artifacts | 51 |
| P2D baseline candidates | 46 |
| Unresolved empty placeholders within P2D | 5 |
| Untracked R1/baseline reports | 8 |
| Deferred `lib/core-v2` files | 6 |
| Ignored evidence files on disk | 105 |
| Unrelated files | 0 |
| Files requiring review | 11 plus runner defect |
| Staged files | 0 |

Normal Git status no longer contains evidence. The five placeholders and six
Runtime scaffolds remain visible by design until their decisions are made.

## A1 status

A1 remains unstarted:

- no A1 contract, validator, error, Runtime-state, credential-boundary, test,
  boundary-check, or A1 report file was created;
- no route imports Core V2;
- no POS/Admin flow changed;
- no feature state was activated;
- no database or SQL operation occurred.

## Readiness decision

**BASELINE CLEANUP PARTIALLY COMPLETE — COMMIT PREPARATION BLOCKED ONLY BY THE
FIVE README-REFERENCED PLACEHOLDER DECISIONS.**

The evidence boundary is clean, the three commit groups are exact, Runtime
scaffolds are safely deferred, and no Git write was performed.

`BASELINE2_900_SAFE_CLEANUP_AND_COMMIT_PLAN_COMPLETE`

## BASELINE.3 resolution addendum

This addendum records the later authoritative resolution without rewriting the
historical BASELINE.2 findings above.

- All five zero-byte placeholders were rechecked against every repository
  reference, operational runner, manifest, SQL artifact, and Git history.
- Their only operational-document reference was the original P2D README.
- The frozen P2D.18 migration breakdown and the final P2D.19/P2D.20 packages
  prove that the original numbering and responsibilities were consolidated or
  moved to separately approved future phases.
- The README was minimally reconciled to preserve the historical sequence,
  identify each authoritative replacement, and prohibit operators from looking
  for or executing the empty filenames.
- The five obsolete, untracked, zero-byte files were deleted.
- No approved SQL, attestation, verifier, runner, evidence, application, or
  `lib/core-v2` file was changed.

Final placeholder dispositions:

| Placeholder | Final disposition |
|---|---|
| `P2D.15-FORWARD.sql` | `HISTORICAL_PHASE_ONLY` |
| `P2D.16-issue-authorization-context.sql` | `ABSORBED_BY_P2D20` |
| `P2D.17-internal-helpers.sql` | `ABSORBED_BY_P2D20` |
| `P2D.18-execute-atomic-order.sql` | `SUPERSEDED_BY_LATER_PACKAGE` |
| `P2D.19-api-cutover.sql` | `SUPERSEDED_BY_LATER_PACKAGE` |

The exact Commit 1 path list above already excludes these placeholders and
remains correct. Commit 1 now contains 46 P2D artifacts plus the narrow
`.gitignore` rule. Commit 2 remains R1.1 only. Commit 3 now also includes
`runtime-integration/BASELINE.3-P2D-PLACEHOLDER-RESOLUTION.md`.

The three baseline commits are ready for operator review and later explicit
Git authorization. No staging, commit, or push occurred during BASELINE.3.

`BASELINE3_ADDENDUM_PLACEHOLDER_BLOCKER_RESOLVED`
