# AFEX Enterprise Platform Core V2 — Package 12

## Master Execution Controller

**AUTHORITATIVE CONTROL DOCUMENT — CORE V2 DISABLED**

**RUNTIME TESTS: NOT EXECUTED**

This is the single authoritative execution controller for the Core V2 rollout.
It consolidates the approved package set and defines the only permitted
execution flow. It does not itself authorize execution.

No package may execute without external review and explicit manual operator
approval. No Production execution is permitted before successful isolated
validation, evidence acceptance, rollback rehearsal, and separate Production
approval.

This document does not execute SQL, create an environment, create fixtures,
grant privileges, activate features, or certify readiness.

---

## 1. Package inventory and authority

### 1.1 Authoritative clean-install execution artifacts

| Order | Package | File | Classification | Authority |
|---:|---|---|---|---|
| 1 | 1R | `01-read-only-preflight.sql` | Read-only executable | Mandatory baseline evidence |
| 2 | 2R | `02-schema-foundation.sql` | DDL executable | Mandatory schema foundation |
| 3 | 2B | `02b-existing-table-indexes.sql` | Concurrent DDL executable | Mandatory 14-index foundation |
| 4 | 2B-S | `02c-security-foundation.sql` | Security DDL executable | Mandatory security foundation |
| 5 | 3R | `03-backfill.sql` | Gated DML/DDL executable | Mandatory bounded backfill |
| 6 | 10 | `10-clean-install-runtime.sql` | Runtime composition executable | Mandatory clean-install runtime |
| 7 | 7-Sync | `07-final-verification.sql` | Runtime test harness | Mandatory 130-test verification |

### 1.2 Authoritative control and review documents

| Package | File | Purpose |
|---|---|---|
| 8 | `08-execution-readiness.md` | Execution readiness and run-card controls |
| 9 | `09-execution-dependency-reconciliation.md` | Dependency reconciliation evidence |
| 10-A | `10a-deep-static-audit.md` | Deep static audit evidence |
| 11 | `11-isolated-execution-preflight.md` | Isolated environment operator runbook |
| 12 | `12-master-execution-controller.md` | Master execution authority and sequencing |

### 1.3 Immutable Package 10 source attestations

These SQL files are approved provenance inputs embodied by Package 10. They are
not additional clean-install execution steps after Package 10:

| Source package | File | Role |
|---|---|---|
| 4T | `04-atomic-core.sql` | Atomic runtime source |
| 5R-B | `05-security.sql` | Security runtime source |
| 6-Sync | `06-activation.sql` | Activation-readiness source |
| 6A-B | `06a-activation-foundation.sql` | Activation foundation source |
| 6B | `06b-authoritative-quote.sql` | Quote runtime source |

`07-verification.sql` is not the final synchronized verification harness. It
must not replace `07-final-verification.sql`.

---

## 2. Approved SHA-256 inventory

Every hash must be recomputed from exact local bytes immediately before use.
Line-ending normalization, rewriting, or accepting an approximate match is
prohibited. Any mismatch means STOP.

| Artifact | SHA-256 | Lines | Execution status |
|---|---|---:|---|
| Package 1R | `8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a` | 1277 | NOT EXECUTED |
| Package 2R | `92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92` | 1063 | NOT EXECUTED |
| Package 2B | `7b712bd7cb61603ef0afd5c96e4dcf533debb57adbaab577650f297a486b588b` | 418 | NOT EXECUTED |
| Package 2B-S | `009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d` | 636 | NOT EXECUTED |
| Package 3R | `58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208` | 1010 | NOT EXECUTED |
| Package 4T source | `40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7` | 3248 | PROVENANCE ONLY |
| Package 5R-B source | `eb5ad92396a57022f35cd7a58f6c6f85e7ea735c3306f40040c084e82ecb13b7` | 1246 | PROVENANCE ONLY |
| Package 6-Sync source | `06b7c27a249b07d0fc58c8e22dd046376a85fb7e507a050a9d33f10e1c8205e3` | 853 | PROVENANCE ONLY |
| Package 6A-B source | `30875dfdff59eda1aec4254d6ce1e610e09bfdf857506f682f9e8c8bae3f3a08` | 2447 | PROVENANCE ONLY |
| Package 6B source | `46c0db2c04a2f48dd1519f72a8f627ca2ceae3ad0ad6af21a7897bc2bc3914ff` | 1419 | PROVENANCE ONLY |
| Package 10 | `07ea287c303452a94f7075b57ef254552f1247efebbfa13502cc681d8674e647` | 7527 | NOT EXECUTED |
| Package 7-Sync | `deb28b9d635edb215bf223f057276d38d3fcbaf0390b7098d81b133bff01c6f8` | 1014 | NOT EXECUTED |
| Execution Readiness | `7a0f83464fa512e5863d97b1cacbd85654dfc1869c78b2e1a0265aebd753788c` | 313 | DOCUMENTATION |
| Dependency Reconciliation | `fd0b52409d3ed7846f4f03f6818669754969600061dfe8ae49cdf019fdd1e952` | 769 | DOCUMENTATION |
| Package 10-A | `e836650fd6cb299047175bf4288f4c24cfa8c8a3e61b7b67d86b9fe1c3c75984` | 506 | DOCUMENTATION |
| Package 11 | `4f9fce9e43fd4d8d6c6b66d9068fb207326bd23be4aece6bf7a068b45b87f43b` | 602 | DOCUMENTATION |
| Package 12 | Recompute and externally attest exact final file | Final | DOCUMENTATION |

---

## 3. Package dependency graph

```text
Package 8 / 9 / 10-A / 11 / 12 control documents
                         │
                         ▼
                 Isolated environment gate
                         │
                         ▼
                  Package 1R (read-only)
                         │
                  external review gate
                         ▼
                    Package 2R
                         │
                 postcheck/review gate
                         ▼
             Package 2B (14 manual indexes)
                         │
          per-index + final external review gate
                         ▼
                   Package 2B-S
                         │
                 security review gate
                         ▼
                    Package 3R
                         │
          per-batch + final external review gate
                         ▼
                     Package 10
        ┌────────────────┼────────────────┐
        │                │                │
  4T/5R-B/6*       87-object postflight  disabled-state proof
  provenance             │                │
        └────────────────┴────────────────┘
                         │
                  external review gate
                         ▼
              Package 7 fixture preparation
                         │
              separate written approval gate
                         ▼
             Package 7 runtime (130 tests)
                         │
                  evidence review gate
                         ▼
             isolated-validation decision
                         │
       separate canary and Production approvals
```

No arrow is automatic. Every transition requires a human STOP, evidence review,
and explicit continuation approval.

---

## 4. Clean-install path

The only clean-install package sequence is:

```text
1R → review → 2R → review → 2B × 14 → review → 2B-S → review
→ 3R → review → 10 → review → Package 7 preparation
→ separate approval → Package 7 runtime
```

Rules:

1. Package 10 is mandatory.
2. Package 4T, 5R-B, 6-Sync, 6A-B, and 6B are not separately executed after
   Package 10.
3. Package 7-Sync is the only final verification harness.
4. Runtime testing does not activate Core V2.
5. Successful isolated validation does not authorize Production execution.

---

## 5. Upgrade path

Package 10 is collision fail-closed and designed for deterministic clean
installation. It must not be blindly executed against an existing partial or
complete Core V2 runtime.

The permitted upgrade-control flow is:

1. Run Package 1R read-only in the approved isolated clone of the upgrade
   target.
2. Capture exact object definitions, owners, ACLs, roles, indexes, constraints,
   triggers, functions, RLS, policies, and activation state.
3. Compare installed state with Package 10 and its immutable source hashes.
4. Classify every delta.
5. Produce a separately reviewed, additive, target-specific forward-fix package.
6. Rehearse the forward-fix and restoration in isolation.
7. Establish semantic parity with Package 10.
8. Run Package 7 only after parity and fixture gates are externally accepted.

Package 12 does not provide upgrade SQL. Unknown partial state, destructive
repair, broad privilege changes, or unreviewed object replacement means STOP.

---

## 6. Package execution gates

| Package | Entry gate | Mandatory execution controls | Exit evidence | Continuation authority |
|---|---|---|---|---|
| 1R | Environment and restore accepted; hash matched | Read-only session; approved timeouts | Complete raw metadata output | External SQL reviewer |
| 2R | Package 1R approved | One reviewed transaction | Before/after schema and postcheck | External SQL reviewer |
| 2B | Package 2R approved | 14 individual concurrent builds; no automatic retry | Per-index validity/readiness and final postcheck | External SQL reviewer per index |
| 2B-S | Package 2B approved | Exact security sections; no operational grants | Roles, owners, ACL, RLS, policy inventory | Security + SQL reviewers |
| 3R | Package 2B-S approved | Bounded null-only batches; actual counts; manual STOP | Candidate/affected/remaining counts and constraint/index checks | SQL + data reviewers |
| 10 | Package 3R approved; clean target; hashes matched | Phase A, four transactions, Phase M; STOP after each | 87-object manifest, parity, ACL, disabled state | SQL + security reviewers |
| 7 preparation | Package 10 postflight approved | Reviewed synthetic fixtures only | Fixture and cleanup manifests | Runtime coordinator + reviewers |
| 7 runtime | Separate written approval | 130-test manifest; provider delivery disabled | Complete immutable test evidence | External runtime review board |

---

## 7. Review checkpoints

At every checkpoint:

- The operator stops before the next package or section.
- Raw output is saved without normalization.
- Errors and warnings are retained.
- Before/after inventories are compared.
- The reviewer records `APPROVED — CONTINUE` or
  `BLOCKED — REMEDIATION REQUIRED`.
- Silence, an empty output, or a successful client exit code alone is not
  approval.
- The operator cannot self-approve an unexpected or failed result.

Mandatory checkpoints:

1. Environment and restoration.
2. Artifact hashes.
3. Package 1R complete output.
4. Package 2R COMMIT and postcheck.
5. Each of fourteen Package 2B indexes.
6. Package 2B final postcheck.
7. Package 2B-S security postcheck.
8. Every Package 3R logical batch/section.
9. Package 3R final postcheck.
10. Package 10 Phase A.
11. Each of four Package 10 transaction groups.
12. Package 10 Phase M.
13. Package 7 fixture manifest.
14. Package 7 runtime start.
15. Package 7 final evidence.
16. Canary preparation.
17. Production preparation.
18. Production activation.

---

## 8. Evidence required after every package

Store evidence under:

```text
database-reconciliation/core-v2/i5.9/runtime-evidence/<run-id>/
```

Every package directory must contain, where applicable:

- Environment/target identifier without credentials.
- Exact artifact hash.
- UTC start and end times.
- Human operator role and reviewer role.
- SQL client and PostgreSQL versions.
- Raw stdout/stderr.
- Exit code.
- Before/after object inventory.
- Lock and timeout observations.
- Errors and warnings.
- Partial-failure state.
- Cleanup result.
- Reviewer decision.

Never store passwords, tokens, JWTs, PINs, credential-bearing URLs, connection
strings, provider secrets, or customer PII.

---

## 9. Universal STOP conditions

STOP immediately when any of these occurs:

- Target may be Production before isolated validation is complete.
- Artifact hash mismatch.
- Missing or untested restoration evidence.
- Unknown schema, role, privilege, trigger, function, policy, or index drift.
- Unknown or partial Core V2 object.
- Package/client output is truncated.
- Unexpected mutation or affected-row count.
- Timeout, deadlock, cancellation, connection loss, or uncertain COMMIT result.
- Invalid/not-ready or equivalent-name index conflict.
- Tenant or branch isolation discrepancy.
- Operational runtime grant appears.
- Provider or worker delivery is enabled.
- Any activation flag differs from the required disabled state.
- Package 7 fixture is not synthetic, isolated, reviewed, and reversible.
- A blocking Package 7 test fails, is skipped, blocked, or inconclusive.
- Evidence cannot bind the exact artifact, target, actor, and time.

After STOP, do not retry, drop, rename, repair, restore privileges, continue, or
activate automatically.

---

## 10. Rollback and forward-fix authority

| Decision | Required authority |
|---|---|
| Stop execution | Any operator, reviewer, environment owner, or security owner |
| Roll back active transaction | Human SQL operator under the approved run card |
| Restore isolated environment | Backup/restore owner plus environment owner |
| Approve destructive restoration | Final rollback authority plus external SQL reviewer |
| Approve forward-fix design | External SQL reviewer and relevant domain reviewer |
| Approve security correction | Security reviewer plus external SQL reviewer |
| Resume after partial failure | External SQL reviewer and environment owner |
| Start Package 7 preparation | Runtime coordinator, SQL reviewer, security reviewer |
| Start Package 7 runtime | Separate final runtime-test approval |
| Prepare canary | Application owner, security owner, runtime owner |
| Activate Production | Final activation authority after all prior gates |

No broad destructive rollback, migration-history repair, blind rerun, automatic
index drop, global privilege restoration, or schema reset is authorized.

---

## 11. Package 7 preparation

Preparation remains blocked until:

- Package 10 postflight is externally approved.
- The exact Package 7 hash is reverified.
- All Core V2 activation flags remain disabled.
- `kill_switch=true`.
- No operational execute grant exists.
- Providers and workers remain disabled.
- Managed test identities are approved.
- A second isolated tenant is available.
- Multi-session operators are assigned.
- Synthetic fixture definitions are reviewed.
- Exact cleanup identifiers and rollback procedure are approved.

Preparation does not mean tests have run.

**RUNTIME TESTS: NOT EXECUTED**

---

## 12. Runtime execution gates

Package 7 runtime may start only after separate written approval that records:

1. Exact environment and run ID.
2. Package 7 hash.
3. Package 10 postflight approval.
4. Fixture manifest and cleanup plan.
5. Provider/worker disabled evidence.
6. Test identities and tenant boundaries.
7. Multi-session operator assignments.
8. Timeouts and stop authority.
9. Evidence destination.

All 130 tests remain subject to their manifest rules. A blocking test counts as
PASS only when its expected result is proven. No skipped, blocked, failed, or
inconclusive blocking test may be converted to PASS.

Package 7 success still leaves Core V2 disabled.

---

## 13. Canary gates

Canary preparation is a future, separately approved phase. It is prohibited
until isolated Package 7 evidence is accepted.

Required canary gates:

- Isolated validation decision is PASS.
- All 130 test evidence is complete.
- Application compatibility and legacy fallback are reviewed.
- Managed service identities and least-privilege grants are separately approved.
- Observability, alerting, rollback, and kill-switch ownership are assigned.
- Provider side effects have a controlled test plan.
- Canary tenant/branch scope is explicit.
- Financial, inventory, idempotency, authorization, audit, and outbox
  invariants have live monitoring.
- Failure thresholds and automatic/manual disable criteria are approved.
- Restoration and forward-fix procedures are rehearsed.

Package 12 does not change `deterministic_canary_percentage` or any flag.

---

## 14. Production activation gates

Production execution is prohibited until all are true:

1. Isolated clean-install or target-specific upgrade rehearsal succeeded.
2. Package 7 runtime evidence was externally accepted.
3. Canary was separately approved and completed under its acceptance criteria.
4. Production backup and restoration rehearsal is current.
5. Exact Production drift preflight is reviewed.
6. Deployment/cutover plan and application compatibility are approved.
7. Security grants, roles, provider delivery, worker operation, and secret
   custody are approved.
8. Change window, operator, reviewers, rollback owner, and activation authority
   are named by role.
9. Customer, financial, inventory, numbering, audit, idempotency, and outbox
   reconciliation checks are ready.
10. Final activation authority provides explicit written approval.

Production activation must occur in a separate controlled phase. Nothing in
Package 12 authorizes it.

---

## 15. Core V2 disable-state verification

Before and after every future package, the operator must prove:

```text
global_enabled=false
kill_switch=true
deterministic_canary_percentage=0
pos_enabled=false
admin_orders_enabled=false
quote_issuer_enabled=false
outbox_worker_enabled=false
```

Additionally:

- Tenant and branch activation rows must not enable or qualify a canary.
- No runtime, quote issuer, outbox worker, or activation operator grant may be
  introduced without its separate approval phase.
- Provider delivery and scheduled workers remain disabled during validation.

Any mismatch means STOP.

---

## 16. Approval matrix

| Gate | SQL operator | External SQL reviewer | Security reviewer | Environment/restore owner | Runtime coordinator | Application owner | Final activation authority |
|---|---|---|---|---|---|---|---|
| Environment acceptance | Observe | Review | Review | Approve | — | — | — |
| Package 1R | Execute read-only | Approve output | Review security drift | Confirm target | — | — | — |
| Package 2R | Execute | Approve | Consult | Confirm recovery | — | — | — |
| Package 2B | Execute per index | Approve each | — | Monitor | — | — | — |
| Package 2B-S | Execute | Joint approve | Joint approve | Confirm recovery | — | — | — |
| Package 3R | Execute batches | Approve each | Review isolation | Confirm recovery | — | Consult | — |
| Package 10 | Execute phases | Joint approve | Joint approve | Confirm partial-state plan | — | Review compatibility | — |
| Package 7 fixtures | No ad-hoc SQL | Review | Review isolation | Approve cleanup | Coordinate | Review | — |
| Package 7 runtime | Execute approved harness | Review evidence | Review security tests | Monitor | Coordinate | Review | — |
| Canary | Separate phase | Review | Approve security | Approve recovery | Monitor | Approve application | Authorize preparation |
| Production activation | Separate phase | Review | Approve security | Approve recovery | Monitor | Approve application | Final approve |

No person or role may execute and self-approve a failed or unexpected result.

---

## 17. Final operator sign-off checklist

### Artifact and environment

- [ ] Correct non-Production isolated environment selected.
- [ ] Production baseline source and PostgreSQL version recorded.
- [ ] Backup restoration tested and externally accepted.
- [ ] Every artifact hash matches the approved table.
- [ ] Package 12 final hash is externally attested.
- [ ] Providers and workers are disabled.

### Package control

- [ ] Package 1R output reviewed before Package 2R.
- [ ] Package 2R reviewed before Package 2B.
- [ ] All fourteen Package 2B indexes individually approved.
- [ ] Package 2B-S security state externally approved.
- [ ] Every Package 3R batch/section externally approved.
- [ ] Every Package 10 transaction stopped and was reviewed.
- [ ] Package 10 87-object postflight externally approved.
- [ ] No obsolete source package was substituted into the clean-install chain.

### Runtime and activation

- [ ] Package 7 fixtures are not created without separate approval.
- [ ] Package 7 runtime remains NOT EXECUTED unless separately approved.
- [ ] No operational grants exist.
- [ ] All disable-state values match the required contract.
- [ ] Core V2 remains disabled.
- [ ] No Production execution occurred.
- [ ] Canary and Production activation remain separate future approvals.

### Evidence and authority

- [ ] Every STOP/CONTINUE decision is recorded.
- [ ] Partial failures have exact state inventories.
- [ ] No secrets or customer PII appear in evidence.
- [ ] Execution and review duties are separated.
- [ ] Rollback and restoration authorities are assigned by role.

---

## 18. Current master decision

The package inventory, hashes, dependency graph, clean-install path, upgrade
control, execution gates, evidence requirements, STOP conditions, rollback
authority, Package 7 preparation, runtime gates, canary gates, Production gates,
disable-state proof, and operator sign-off are defined.

Current truth:

- SQL executed: **NO**
- Database connected: **NO**
- Runtime tests: **NOT EXECUTED**
- Core V2: **DISABLED**
- Isolated execution: **NOT STARTED**
- Canary: **NOT AUTHORIZED**
- Production execution: **PROHIBITED**
- Production activation: **NOT AUTHORIZED**

**PACKAGE 12 MASTER EXECUTION CONTROLLER APPROVED**
