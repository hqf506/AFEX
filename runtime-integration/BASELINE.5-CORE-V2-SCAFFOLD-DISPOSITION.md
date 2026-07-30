# AFEX ERP / POS — BASELINE.5 Core V2 Scaffold Disposition

Status: repository-only review; no implementation

Completion marker: `BASELINE5_900_CORE_V2_SCAFFOLD_DISPOSITION_COMPLETE`

## Executive verdict

The six untracked `lib/core-v2` files are an unwired, server-only prototype.
They have no application call sites and currently change no POS, Admin, API,
component, hook, or Server Action behavior. They also do not read environment
variables, construct Supabase clients, call RPCs, access tables, or perform
network I/O.

They are not an authoritative A1 baseline. The executable prototype derives
authorization from a caller-supplied principal, constructs authorization and
command rows in TypeScript, and delegates to an abstract persistence writer.
That model conflicts with the installed P2D.20 database-authoritative
acquisition boundary. The type and validation files are incomplete relative to
P2D.18A and the A1 contract inventory.

Selected disposition: **STRATEGY 3 — Mixed disposition**. Delete the current
six untracked files before A1. During A1, deliberately recreate only the
contract, pure-validation, safe-error, credential-boundary, and forbidden-import
surfaces. Acquisition belongs to a later reviewed Runtime adapter phase and
execution belongs to Batch B.

## Review basis

The following authoritative files were read completely:

- `runtime-integration/R1.1-RUNTIME-INVENTORY.md`
- `runtime-integration/R1.2-TARGET-RUNTIME-ARCHITECTURE.md`
- `runtime-integration/R1.2-MIGRATION-BATCH-PLAN.md`
- `runtime-integration/R1.2-LEGACY-PATH-DISPOSITION.md`
- `runtime-integration/R1.2-CRITICAL-PATH-AND-DECISIONS.md`
- `runtime-integration/R1.2-MASTER-EXECUTION-CHECKLIST.md`
- `runtime-integration/BASELINE.1-CORE-V2-ARTIFACT-REVIEW.md`
- `runtime-integration/BASELINE.2-SAFE-CLEANUP-AND-COMMIT-PLAN.md`
- `runtime-integration/BASELINE.3-P2D-PLACEHOLDER-RESOLUTION.md`
- P2D.17, P2D.18, P2D.18A, P2D.19 migration/attestation, and P2D.20
  migration/attestation.

## Complete six-file inventory

| Path | Lines | Purpose | State | Disposition |
|---|---:|---|---|---|
| `lib/core-v2/authorization/issue-context.ts` | 132 | Caller-principal authorization and local context construction | Unwired, non-authoritative, unsafe basis | `DELETE_BEFORE_A1` |
| `lib/core-v2/commands/issue-command.ts` | 52 | Local construction of a reserved command row | Unwired, superseded by P2D.20 | `DELETE_BEFORE_A1` |
| `lib/core-v2/index.ts` | 16 | Barrel exporting executable issuance and selected types | Unwired, creates future broad-exposure risk | `SPLIT_AND_REWRITE_DURING_A1` |
| `lib/core-v2/runtime/issue-atomic.ts` | 125 | In-process validation, authorization, command creation, and abstract persistence | Unwired, conflicts with trusted acquisition | `DELETE_BEFORE_A1` |
| `lib/core-v2/types/contracts.ts` | 194 | Prototype issuance, record, dependency, trace, and error types | Partial and contract-incomplete | `REWRITE_DURING_A1` |
| `lib/core-v2/validation/order-request.ts` | 111 | Pure request-scope and limited item validation | Deterministic but materially incomplete | `REWRITE_DURING_A1` |

All six files begin with an exact `import 'server-only'`.

## Export and import matrix

| File | Exports | Imports |
|---|---|---|
| `authorization/issue-context.ts` | `authorizeAtomicIssuance`, `buildAuthorizationContext` | `server-only`; `canonicalJson`, `hashIdempotencyKey`, `sha256Hex`; prototype contracts |
| `commands/issue-command.ts` | `buildReservedAtomicCommand` | `server-only`; prototype constants and record types |
| `index.ts` | `issue_atomic`; selected error, request, response, record, dependency, write, and trace types | `server-only`; runtime implementation and prototype contracts |
| `runtime/issue-atomic.ts` | `issue_atomic` | local authorization builder, command builder, validator, and prototype contracts |
| `types/contracts.ts` | six constants; role/status/hash types; request, payload, context, command, persistence, response, trace, error, and dependency contracts; `IssueAtomicError` | `server-only`; legacy `AtomicOrderIntent`; `AuthorizationCapability` |
| `validation/order-request.ts` | `validateIssueAtomicRequest` | `server-only`; legacy `canonicalJson`; prototype contracts |

No file imports React, a browser API, Supabase, an environment accessor, an API
route, or a database adapter.

## Call-site and reachability analysis

Repository-wide searches found:

- no import of these files outside `lib/core-v2`;
- no application import of the `lib/core-v2/index.ts` barrel;
- no route, component, hook, API handler, or Server Action call site;
- no client-bundle reachability;
- no call to `acquire_atomic_order_command_v1`;
- no direct Core V2 table write;
- no Supabase `.rpc()` or `.from()` call;
- no service-role credential read;
- no live feature selector pointing to this scaffold.

The only internal executable chain is:

`index.ts` → `runtime/issue-atomic.ts` → validator + caller-principal
authorization builder + local command builder → injected persistence interface.

`index.ts` is currently harmless because it has no consumers and is protected by
`server-only`. It is nevertheless an unsafe future barrel: importing it would
make the obsolete executable `issue_atomic` appear to be the supported Core V2
entrypoint. A1 must not retain that export.

## Per-file technical review

### `authorization/issue-context.ts`

- Identity, tenant, branch, role, capabilities, employee mapping, and
  `createdByIdentity` all originate in `IssueAtomicRequest.principal`.
- It checks authentication, `orders:write`, branch membership, capability
  version, and employee-source consistency.
- It computes idempotency and request hashes locally, invents a reference-hash
  projection, and creates a 120-second context record.
- It performs no database verification and cannot prove actor activity,
  authoritative tenant membership, branch state, role mapping, Runtime LOGIN
  identity, or dedicated-role membership.
- It exposes internal English error text through `IssueAtomicError`.
- It is fail-closed within its caller-controlled model, but the model itself is
  the wrong trust boundary.

### `commands/issue-command.ts`

- It constructs a P2D.15-shaped `reserved` command record locally.
- It assumes command/context UUIDs and timestamps supplied by the caller path.
- It omits durable payload creation and P2D.20 acquisition classification.
- It has no side effect by itself, but its result is intended for persistence.
- Database-owned defaults, hashing, locking, and atomic three-record creation
  cannot be reproduced authoritatively here.

### `index.ts`

- It re-exports the obsolete executable `issue_atomic` beside types.
- It does not use `export type` consistently for a contract-only boundary.
- No repository consumer currently imports the barrel.
- If adopted later, it could expose a misleading acquisition authority across
  server modules. It cannot reach a client bundle today because of
  `server-only`.

### `runtime/issue-atomic.ts`

- It implements feature gating, validation, caller-principal authorization,
  local identifier creation, local context/command construction, abstract
  persistence, tracing, and response mapping.
- The only asynchronous side effect is
  `dependencies.persistence.issue(...)`; the repository provides no
  implementation or call site.
- It does not call P2D.20, does not support the four acquisition dispositions,
  does not persist the immutable payload contract, and trusts injected IDs,
  clock, feature gate, and persistence.
- It treats exactly one command write as success but cannot prove database
  atomicity or absence of orphan payload/context records.
- It catches unknown failures and retains the cause server-side, but the public
  `Error.message` boundary is not separated from internal diagnostics.

### `types/contracts.ts`

- It mixes transport request, caller principal, database row shapes, persistence
  dependencies, tracing, errors, and executable Runtime concerns.
- It models only `reserved`, not the frozen command runtime state enum.
- It has no acquisition disposition union (`created`, `replay`,
  `in_progress`, `fingerprint_conflict`).
- It has no exact P2D.20 input/output tuple, canonical-byte types, payload
  version strings, retained payload record, replay result, executor response,
  outbox envelope, safe external error contract, or separate internal
  diagnostic contract.
- It expresses P2D numeric versions as TypeScript numbers but does not separate
  database numeric versions from canonical payload version strings.
- `CoreV2Role` omits Production `owner`; P2D.20 explicitly maps `owner` to the
  stored `admin` role snapshot.
- `Sha256Hex` is only a brand assertion with no runtime validation.
- It is not suitable as authoritative without replacement.

### `validation/order-request.ts`

- It is deterministic and synchronous.
- It has no environment, network, database, React, or Supabase dependency.
- It checks three UUIDs, correlation format, tenant/branch scope, idempotency
  length, nonempty items, contiguous lines, catalog UUIDs, and positive safe
  integer quantities.
- Its UUID regex is case-insensitive, while P2D.18A requires lowercase canonical
  UUID text.
- It validates a legacy `AtomicOrderIntent`, not the exact P2D.18A payload.
- It does not enforce exact nested allowlists, required/null/omitted matrices,
  sensitive keys, canonical decimal strings, timestamp bytes, NFC, 1–100 item
  bounds, flat modifier structure/order, pricing/VAT/discount/payment/customer/
  fulfillment matrices, metadata exclusions, canonical byte size, or projection
  derivation.
- Calling the legacy `canonicalJson` does not establish parity with P2D.20’s
  frozen serializer.
- It is fail-closed for checks it performs, but incomplete validation would be
  fail-open relative to the frozen contract.

## P2D.20 mapping review

The installed trusted function is exactly:

`public.acquire_atomic_order_command_v1(uuid, uuid, uuid, text, text, text, text, timestamp with time zone)`

Its exact inputs are:

1. `p_authenticated_actor_id uuid`
2. `p_tenant_id uuid`
3. `p_branch_id uuid`
4. `p_idempotency_key text`
5. `p_correlation_reference text`
6. `p_canonical_payload text`
7. `p_fingerprint_projection text`
8. `p_retain_until timestamptz`

Its exact return fields are:

`acquisition_result`, `authorization_context_id`, `atomic_command_id`,
`correlation_reference`, `command_status`, `response_version`,
`response_snapshot`, `completed_at`, `error_code`, `error_detail`,
`last_failure_stage`, and `stored_request_fingerprint`.

The scaffold invokes none of this contract.

### Missing or incorrect mappings

| Scaffold assumption | P2D.20 contract result |
|---|---|
| Caller supplies role, capabilities, branch set, capability version, employee identity, and created-by identity | Invented trusted inputs. P2D.20 derives authorization evidence from the database and Runtime identity. |
| Caller creates authorization-context UUID and command UUID | Incorrect. P2D.20 generates both UUIDs. |
| Caller creates context timestamps and hashes | Incorrect authority. P2D.20 derives timestamps, idempotency hash, projection hash, and reference hash. |
| Payload contains `commandType`, scope fields, legacy `order`, and `requestMetadata` | Wrong shape and names. P2D.18A requires the exact snake_case canonical payload envelope and nested matrices. |
| Persistence input contains only context and command | Missing immutable payload and atomic three-record acquisition. |
| Response is IDs, correlation ID, and `reserved` status | Missing all four dispositions and replay/error/result fields. |
| Fingerprint uses `canonicalJson(payload)` | Not proven equal to P2D.20’s database-derived projection and canonical serializer. |
| Idempotency key is read from `order.clientIdempotencyKey` | Adapter must map it explicitly to `p_idempotency_key`; current code never calls the function. |
| Retention is absent from request/dependency contract | Missing required `p_retain_until`. |
| Correlation ID is accepted as request metadata and context input | Must map exactly to `p_correlation_reference` and canonical metadata correlation ID. |

No unsafe default can be accepted from these prototypes. In particular,
generated IDs, clocks, caller role/capabilities, and abstract persistence are
not substitutes for the P2D.20 contract.

## A1 alignment matrix

| A1 responsibility | Current coverage | Classification |
|---|---|---|
| Canonical TypeScript contracts | Partial mixed prototype | `PARTIALLY_ALIGNED` |
| Exact P2D.20 field mapping | Absent | `MISSING_REQUIRED_CONTRACT` |
| Authorization Context types | Database-row approximation with caller authority | `CONFLICTS_WITH_A1` |
| Durable command envelope | Partial command row only | `MISSING_REQUIRED_CONTRACT` |
| Actor/tenant/branch identities | Present but caller-controlled | `CONFLICTS_WITH_A1` |
| Idempotency-key rules | Trim/hash helper only | `PARTIALLY_ALIGNED` |
| Four acquisition dispositions | Absent | `MISSING_REQUIRED_CONTRACT` |
| Replay contract | Absent | `MISSING_REQUIRED_CONTRACT` |
| Executor response | Absent | `MISSING_REQUIRED_CONTRACT` |
| Safe external errors | Absent | `MISSING_REQUIRED_CONTRACT` |
| Internal diagnostic errors | Mixed into one error class | `PARTIALLY_ALIGNED` |
| Outbox event envelope | Absent | `MISSING_REQUIRED_CONTRACT` |
| Runtime state enum | Only `reserved` | `MISSING_REQUIRED_CONTRACT` |
| Pure deterministic validators | One incomplete pure validator | `PARTIALLY_ALIGNED` |
| Credential-boundary declarations | Absent | `MISSING_REQUIRED_CONTRACT` |
| Forbidden-import enforcement | Absent | `MISSING_REQUIRED_CONTRACT` |
| No route activation | Satisfied | `ALIGNED` |
| No database calls in A1 | Satisfied today | `ALIGNED` |
| Local acquisition/orchestration | Present | `PREMATURE_IMPLEMENTATION` |

## Security findings

### Critical

1. `authorization/issue-context.ts` treats caller-supplied role, capabilities,
   tenant, branch access, employee identity, and capability version as
   authorization evidence. It must never become Production authority.

### High

1. `runtime/issue-atomic.ts` models an acquisition path outside P2D.20 and could
   enable a second write boundary if wired.
2. `index.ts` presents that obsolete executable as the package’s primary export.
3. The validator does not enforce the frozen payload and sensitive-field
   contract.
4. The error type does not separate safe external errors from internal
   diagnostic details and function/database error mapping.

### Medium

1. Local hash/canonicalization parity with P2D.20 is unproven.
2. Local command/context types can drift from installed database columns.
3. The case-insensitive UUID validator accepts noncanonical UUID text.

### Positive controls

- all files are `server-only`;
- there are no environment or credential reads;
- there is no service-role or Supabase use;
- there are no direct table or RPC calls;
- there are no live call sites;
- current application behavior is unchanged.

## File-by-file dispositions

| Exact path | Disposition | Reason |
|---|---|---|
| `lib/core-v2/authorization/issue-context.ts` | `DELETE_BEFORE_A1` | Obsolete caller-authority model; P2D.20 owns authorization derivation and context creation. |
| `lib/core-v2/commands/issue-command.ts` | `DELETE_BEFORE_A1` | Obsolete local command-row builder; P2D.20 creates the command atomically. |
| `lib/core-v2/index.ts` | `SPLIT_AND_REWRITE_DURING_A1` | Must become a contract-safe, type-oriented boundary and must not export acquisition/execution prematurely. |
| `lib/core-v2/runtime/issue-atomic.ts` | `DELETE_BEFORE_A1` | Premature and incompatible acquisition orchestration. The future adapter must call P2D.20 exactly. |
| `lib/core-v2/types/contracts.ts` | `REWRITE_DURING_A1` | Correct location, but the contract must be replaced with the complete frozen A1/P2D.20 model. |
| `lib/core-v2/validation/order-request.ts` | `REWRITE_DURING_A1` | Correct pure-validation area, but the implementation must validate the exact frozen canonical contract. |

No file qualifies as `RETAIN_FOR_A1`. No intent remains unresolved, so
`REQUIRES_USER_DECISION` is unnecessary.

## Batch ownership

- P2D.20 acquisition adapter: Batch A after A1 contract freeze, without route
  activation.
- Authorization/context creation: database P2D.20 only; the TypeScript adapter
  maps trusted session identity and canonical bytes, not authorization claims.
- Command execution, claim, terminal state, replay persistence, and atomic
  business work: Batch B.
- Route/POS activation: later cutover batches, never A1.
- Outbox execution: Batch I; A1 defines only the envelope contract.

## Selected clean-tree strategy

**STRATEGY 3 — Mixed disposition**

1. Remove all six current untracked prototypes before A1. They contain no
   authoritative code that should be committed.
2. Begin A1 from the clean committed baseline.
3. Recreate `types/contracts.ts`, `validation/order-request.ts`, and a safe
   package export surface as reviewed A1 work.
4. Do not recreate authorization acquisition, command persistence, or
   `issue_atomic` orchestration during A1.
5. Implement the exact P2D.20 server adapter only in the next approved Batch A
   implementation phase, still unwired.
6. Implement executor behavior only in Batch B.

### Exact files recommended for retention

None of the current six files.

### Exact files recommended for rewrite during A1

- `lib/core-v2/types/contracts.ts`
- `lib/core-v2/validation/order-request.ts`
- `lib/core-v2/index.ts` as a split, contract-safe export surface

### Exact files recommended for deferral

No current file is safe to retain as deferred implementation. The
responsibilities represented by acquisition and execution are deferred, but
their current implementations should be removed.

### Exact files recommended for deletion before A1

- `lib/core-v2/authorization/issue-context.ts`
- `lib/core-v2/commands/issue-command.ts`
- `lib/core-v2/index.ts`
- `lib/core-v2/runtime/issue-atomic.ts`
- `lib/core-v2/types/contracts.ts`
- `lib/core-v2/validation/order-request.ts`

Deleting the rewrite-target files means discarding these untracked drafts, not
discarding an approved contract. A1 will recreate those paths from the frozen
specification.

## Exact next Git operation

These commands are proposed only. They were not executed.

```powershell
git branch --show-current
git log -3 --oneline
git status --short
git diff --cached --name-only
git diff --check

Remove-Item -LiteralPath 'lib/core-v2/authorization/issue-context.ts'
Remove-Item -LiteralPath 'lib/core-v2/commands/issue-command.ts'
Remove-Item -LiteralPath 'lib/core-v2/index.ts'
Remove-Item -LiteralPath 'lib/core-v2/runtime/issue-atomic.ts'
Remove-Item -LiteralPath 'lib/core-v2/types/contracts.ts'
Remove-Item -LiteralPath 'lib/core-v2/validation/order-request.ts'

git status --short
git diff --cached --name-only
git diff --check
```

Expected status immediately after the separately authorized resolution:

```text
```

The tree should be clean because all six files are currently untracked. Do not
use `git add .`, `git add -A`, `git clean`, broad wildcards, reset, checkout, or
restore. No commit is needed for deleting untracked drafts.

## Exact recommended A1 starting state

- Branch `master`.
- HEAD remains `3e167c5dfaf5039ff110c56a76b7727b84b9c038`.
- Clean working tree and zero staged files.
- Installed P2D.19/P2D.20 contracts remain unchanged.
- Evidence remains local and ignored.
- No `lib/core-v2` implementation exists until A1 creates reviewed
  contract-only files.
- A1 creates canonical types, exact P2D.20 mapping types, disposition/runtime
  state/replay/executor/outbox envelopes, safe/internal error separation, pure
  validators, credential-boundary declarations, and forbidden-import tests.
- A1 creates no Supabase client, performs no database/RPC call, and activates no
  route.

## Validation

- Branch: `master`.
- Baseline HEAD commits unchanged at review start.
- Six files read completely.
- Imports and exports enumerated.
- Repository-wide call sites searched.
- Route/component/hook/API/Server Action activation: none.
- Environment, Supabase, RPC, table-write, and network scan: none.
- Application files modified: none.
- Existing Core V2 scaffold files modified: none.
- Files deleted: none.
- SQL executed: none.
- Database connection: none.
- Migration created or run: none.
- Staging/commit/push: none.
- A1 implementation: not started.

## Readiness decision

Ready for a separately authorized, exact-path removal of the six untracked
prototype files, followed by A1 Runtime Contract Freeze and Forbidden-Boundary
Tests from a clean tree.

`BASELINE5_900_CORE_V2_SCAFFOLD_DISPOSITION_COMPLETE`
