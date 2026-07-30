# AFEX ERP / POS — BASELINE.3 P2D Placeholder Resolution

Status: obsolete placeholder cleanup complete; no Git writes performed

## Executive verdict

All five zero-byte SQL placeholders were obsolete executable-looking artifacts
from the original P2D working structure. Repository evidence now provides a
non-ambiguous disposition for each:

- the unselected forward-foundation alternative is historical only;
- authorization-context issuance and canonical helpers were absorbed by the
  installed P2D.20 acquisition package;
- executor and activation responsibilities were explicitly moved by the frozen
  P2D.18 contract to later separately approved phases and are now governed by
  R1.2.

The files were untracked, empty, absent from Git history, unused by runners,
SQL, manifests, and current operator commands, and were never executed. Their
only non-baseline reference was the stale P2D README. The README was reconciled
before deletion. No approved SQL or Production state changed.

The placeholder blocker is resolved. The three baseline commits are ready for
operator review and later explicit Git authorization.

## Five-file decision matrix

| Placeholder | Final mapping | Zero bytes | Untracked | Git history | Runner/manifest/SQL use | Current runbook requirement | Decision |
|---|---|---|---|---|---|---|---|
| `P2D.15-FORWARD.sql` | `HISTORICAL_PHASE_ONLY` | Yes | Yes | None | None | No; `NOT_INSTALLED` selected `P2D.15-FRESH.sql` | Delete |
| `P2D.16-issue-authorization-context.sql` | `ABSORBED_BY_P2D20` | Yes | Yes | None | None | No; P2D.20 creates the trusted context atomically | Delete |
| `P2D.17-internal-helpers.sql` | `ABSORBED_BY_P2D20` | Yes | Yes | None | None | No; P2D.20 contains reviewed canonicalization/acquisition helpers | Delete |
| `P2D.18-execute-atomic-order.sql` | `SUPERSEDED_BY_LATER_PACKAGE` | Yes | Yes | None | None | No; P2D.18 froze Executor as later separately approved work | Delete |
| `P2D.19-api-cutover.sql` | `SUPERSEDED_BY_LATER_PACKAGE` | Yes | Yes | None | None | No; authoritative P2D.19 is payload storage and cutover remains future | Delete |

Deletion of the final two files does not claim that an Executor or Runtime
cutover is installed. It removes retired filenames after the approved P2D.18
and R1.2 documents reassigned those future responsibilities.

## Complete reference graph

Before reconciliation, every placeholder had exactly these reference classes:

1. `database-reconciliation/core-v2/P2D/README.md`
   - original file inventory at lines 11–15;
   - original planned execution order at lines 27–31;
   - classified each as a future planned file/operator step.
2. `runtime-integration/BASELINE.1-CORE-V2-ARTIFACT-REVIEW.md`
   - lines 106–110 classified the files as temporary/should not commit;
   - lines 509–513 listed them in the historical exclusion decision.
3. `runtime-integration/BASELINE.2-SAFE-CLEANUP-AND-COMMIT-PLAN.md`
   - lines 60–64 recorded the fail-closed `REQUIRES_REVIEW` decision.

No PowerShell runner, package manifest, hash manifest, SQL artifact, current
P2D.19/P2D.20 runbook, or Git commit referenced an empty placeholder.

After reconciliation:

- README lines 24–28 preserve historical names solely to state that no
  standalone executable exists and identify the authoritative destination.
- BASELINE.1 remains an immutable historical review.
- BASELINE.2 retains its historical finding and adds the final BASELINE.3
  resolution addendum at lines 414 onward.
- This report is the authoritative final disposition.

### Per-file evidence

#### `P2D.15-FORWARD.sql`

- Original reference type: planned alternative reconciliation package and
  obsolete checklist branch.
- P2D.14B supported a FRESH/FORWARD classification decision.
- Confirmed Production classification was `NOT_INSTALLED`.
- Actual path: `P2D.15-FRESH.sql`, followed by
  `P2D.16-POST-INSTALL-ATTESTATION.sql`.
- The unselected forward branch was never required or generated.

#### `P2D.16-issue-authorization-context.sql`

- Original reference type: planned authorization-context issuer.
- P2D.18 freeze lines 651–662 assign trusted authorization derivation and
  atomic context/command/payload creation to P2D.20.
- `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql` defines
  `acquire_atomic_order_command_v1` and inserts
  `atomic_authorization_contexts` in the atomic acquisition transaction.
- Actual path: `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql`.

#### `P2D.17-internal-helpers.sql`

- Original reference type: planned internal helper package.
- P2D.17 became the normative durable-envelope design document.
- P2D.20 creates `canonicalize_atomic_order_json_v1` and contains the reviewed
  structural, canonical, fingerprint, and acquisition validation logic.
- Actual path: normative P2D.17/P2D.18/P2D.18A documents plus the installed
  P2D.20 helper/acquisition implementation.

#### `P2D.18-execute-atomic-order.sql`

- Original reference type: planned atomic executor.
- Frozen P2D.18 lines 676–696 explicitly separate future Executor design from
  future Executor implementation and state that implementation requires
  separate approval.
- P2D.20 explicitly performs no Executor work.
- Current destination: R1.2 Batch B, then dependent atomic-order batches.
- No standalone executor SQL exists or is authorized; the historical empty
  filename is not a dependency.

#### `P2D.19-api-cutover.sql`

- Original reference type: planned API cutover/activation package.
- Frozen P2D.18 lines 638–662 reassign P2D.19 to immutable payload storage and
  P2D.20 to acquisition.
- Frozen P2D.18 lines 710 onward defer controlled activation to a later phase.
- Current destination: R1.2 Batch G POS cutover and Batch N Production rollout.
- No standalone cutover SQL exists or is authorized.

## Authoritative replacement mapping

| Historical responsibility | Authoritative artifact/state |
|---|---|
| Forward reconciliation for an already-installed foundation | Historical unselected branch; Production used `P2D.15-FRESH.sql` |
| Trusted authorization-context issuance | `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql` |
| Canonical/acquisition helpers | P2D.17/P2D.18/P2D.18A contracts plus P2D.20 implementation |
| Executor design and implementation | Frozen as future work; current authority is R1.2 Batch B, with no executable SQL yet |
| Runtime/API cutover and activation | Frozen as future work; current authority is R1.2 Batches G and N |

## P2D.19 naming-ambiguity resolution

The authoritative installed P2D.19 package is:

- `P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql`
- SHA-256:
  `5d5f6cc0555f43a7f54fcf6fc2ef085250599b8a72ce78e9f0d2b4a922511805`

Its authoritative attestation is:

- `P2D.19-POST-INSTALL-ATTESTATION.sql`
- SHA-256:
  `08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273`

The empty `P2D.19-api-cutover.sql` was not authoritative because it:

- contained zero bytes;
- was never tracked or executed;
- was absent from manifests and runners;
- conflicted with the frozen P2D.18 definition of P2D.19 as immutable payload
  storage.

The installed P2D.19 state is proven by the successful P2D.19 migration step,
`P2D19A_900_POST_INSTALL_ATTESTATION_OK`, and the later
`P2D21D_900_POST_INSTALL_VERIFICATION_OK` final verification. The P2D.22
contract and authorization attestation also completed successfully.

Future operators must identify P2D.19 by its full authoritative filename and
frozen hash, never by phase number alone.

## Documentation changes

### P2D README

Minimum necessary reconciliation:

- replaced the stale placeholder inventory with current authoritative artifacts;
- added a historical-placeholder disposition section;
- mapped each old phase name to its final package or future reviewed batch;
- explicitly stated where no standalone executable SQL exists;
- replaced the obsolete execution order with the completed P2D sequence;
- stated that the sequence does not install an Executor or activate traffic.

### BASELINE.2

Added a labeled BASELINE.3 resolution addendum. Historical BASELINE.2 text was
not silently rewritten. The addendum:

- records final dispositions and deletions;
- removes the placeholder blocker;
- confirms the existing exact Commit 1 list remains correct;
- adds this BASELINE.3 report to Commit 3.

## Files deleted

- `database-reconciliation/core-v2/P2D/P2D.15-FORWARD.sql`
- `database-reconciliation/core-v2/P2D/P2D.16-issue-authorization-context.sql`
- `database-reconciliation/core-v2/P2D/P2D.17-internal-helpers.sql`
- `database-reconciliation/core-v2/P2D/P2D.18-execute-atomic-order.sql`
- `database-reconciliation/core-v2/P2D/P2D.19-api-cutover.sql`

All were untracked and zero-byte, so their deletion creates no tracked Git
deletion and changes no SQL.

## Files modified

- `.gitignore` remains modified by BASELINE.2 only.
- `database-reconciliation/core-v2/P2D/README.md`
- `runtime-integration/BASELINE.2-SAFE-CLEANUP-AND-COMMIT-PLAN.md`

## File created

- `runtime-integration/BASELINE.3-P2D-PLACEHOLDER-RESOLUTION.md`

## Approved files proven unchanged

| Artifact | SHA-256 |
|---|---|
| P2D.19 migration | `5d5f6cc0555f43a7f54fcf6fc2ef085250599b8a72ce78e9f0d2b4a922511805` |
| P2D.19 attestation | `08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273` |
| P2D.20 migration | `d9b4f1a9caffe5644de721e6622be545056873ba5c1bfedd83f481b6bcee0192` |
| P2D.20 attestation | `fbfa71081487f55f09e73292d9ed9e7f4a743ca7383fe50940eca031f09a33a7` |
| P2D.22 ACL contract | `b8d62d01adca7caef6ef62e416f2101df810742760303613bb746be3f366da69` |
| P2D.22 final-verification contract | `844d95b47a0a5bd0099281084184137add7152888e2b34a77814c34604994bdf` |
| P2D.22 authorization attestation | `86fdf68da96a4083efa6c911496fc038481b23f59602bfcae7205c44b5d3c5f6` |
| Corrected P2D.21D final verifier | `cec223f287c7677d23a7e144a5e6fe99893feb3927e897c93c5ddda696db136e` |

The six `lib/core-v2` hashes remain those recorded by BASELINE.2. Application
code, API routes, tests, historical migrations, evidence, approved SQL,
attestations, verifiers, and runners are unchanged.

## Updated working-tree counts

| Category | Count |
|---|---:|
| Modified tracked files | 1 (`.gitignore`) |
| P2D baseline artifacts | 46 |
| Empty P2D placeholders | 0 |
| R1/baseline reports after this report | 9 |
| Deferred `lib/core-v2` files | 6 |
| Ignored evidence files preserved locally | 105 |
| Unrelated files | 0 |
| Staged files | 0 |

## Updated three-commit structure

1. **Document Core V2 database foundation and verification controls**
   - `.gitignore`
   - exact 46 P2D artifacts, including reconciled README
2. **Add Core V2 runtime inventory**
   - R1.1 only
3. **Add Core V2 runtime architecture and migration plan**
   - five R1.2 artifacts
   - BASELINE.1, BASELINE.2, and BASELINE.3 reports

Evidence and `lib/core-v2` are excluded. No empty placeholder exists.

## Exact path-specific Git commands

These commands are documentation only. They were not executed.

### Preflight

```powershell
git status --short
git diff --check
git diff --cached --name-only
```

### Commit 1 — P2D Database Foundation and Verification Controls

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
git diff --cached --name-status
git status --short
git commit -m "Document Core V2 database foundation and verification controls"
git status --short
```

### Commit 2 — R1.1 Runtime Inventory

```powershell
git add -- runtime-integration/R1.1-RUNTIME-INVENTORY.md
git diff --cached --check
git diff --cached --name-status
git status --short
git commit -m "Add Core V2 runtime inventory"
git status --short
```

### Commit 3 — R1.2 Runtime Architecture and Baseline Reports

```powershell
git add -- `
  runtime-integration/R1.2-TARGET-RUNTIME-ARCHITECTURE.md `
  runtime-integration/R1.2-MIGRATION-BATCH-PLAN.md `
  runtime-integration/R1.2-LEGACY-PATH-DISPOSITION.md `
  runtime-integration/R1.2-CRITICAL-PATH-AND-DECISIONS.md `
  runtime-integration/R1.2-MASTER-EXECUTION-CHECKLIST.md `
  runtime-integration/BASELINE.1-CORE-V2-ARTIFACT-REVIEW.md `
  runtime-integration/BASELINE.2-SAFE-CLEANUP-AND-COMMIT-PLAN.md `
  runtime-integration/BASELINE.3-P2D-PLACEHOLDER-RESOLUTION.md
git diff --cached --check
git diff --cached --name-status
git status --short
git commit -m "Add Core V2 runtime architecture and migration plan"
git status --short
```

### Optional later push

```powershell
git push origin master
```

Push requires separate explicit operator authorization.

## A1 status

A1 remains unstarted. No A1 implementation file, test, boundary script,
Runtime activation, route import, POS/Admin behavior, database connection, SQL
execution, migration execution, staging, commit, or push occurred.

## Readiness decision

**PLACEHOLDER BLOCKER RESOLVED — THREE BASELINE COMMITS READY FOR OPERATOR
REVIEW AND EXPLICIT AUTHORIZATION.**

`BASELINE3_900_P2D_PLACEHOLDER_RESOLUTION_COMPLETE`
