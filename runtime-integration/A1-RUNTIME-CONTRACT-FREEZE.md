# AFEX ERP / POS — A1 Runtime Contract Freeze

Status: A1.4 correction complete; pending independent rereview; no Runtime activation

Completion marker: `A1_900_RUNTIME_CONTRACT_FREEZE_COMPLETE`

## Executive summary

A1 establishes a server-only, contract-and-validation surface for Core V2. It
contains no database client, Supabase client, environment read, network call,
Authorization Context issuer, acquisition adapter, executor, replay executor,
worker, route integration, feature flag, or legacy-path modification.

The installed P2D.20 function remains the sole future acquisition authority.
TypeScript may validate transport inputs and map canonical bytes, but it may not
derive role, capability, employee identity, context identity, command identity,
database timestamps, hashes, or acquisition disposition.

## A1.2 correction record

The independent A1 source review returned `A1_CORRECTION_REQUIRED`. A1.2
preserves that review trail and corrects its blocker, high, and related
trust-boundary findings without starting A2:

- database authority now requires module-private `unique symbol` typing plus
  runtime provenance held in a private `WeakSet`; A1 intentionally exports no
  sealer, constructor, or brand token;
- the P2D.20 result is split into a raw adapter row and a strict
  disposition-discriminated Runtime union;
- normalized PostgreSQL `bytea` fingerprint data is opaque and adapter-owned;
- safe external errors accept only standard plain objects made entirely of
  bounded own data properties;
- canonical payload and fingerprint-projection text have non-empty,
  string-only UTF-8 byte boundaries without normalization;
- outbox safe payloads are recursively validated and bounded;
- root and contract barrels exclude internal diagnostics, credential topology,
  and provenance machinery;
- the boundary scanner uses the installed TypeScript compiler API to build a
  transitive module graph;
- adversarial contract and scanner fixtures cover the corrected claims;
- `SHADOW_VERIFY` and `ROLLBACK_TO_LEGACY` semantics are now explicit.

These changes do not approve A1 for commit. Independent A1.2 review remains
required.

## A1.4 correction record

A1.3 independently returned `A1_ADDITIONAL_CORRECTION_REQUIRED`. A1.4
preserves that review history and applies the remaining corrections without
starting A2:

- the installed command state is `processing`; the invented `executing` state
  is rejected and no longer appears in a valid contract;
- successful replay snapshots must be standard plain JSON objects and are
  descriptor-validated, recursively normalized, and deeply frozen;
- command-envelope traversal validates prototypes and descriptors before
  reading values, rejects accessors/symbols/inheritance/cycles, and has
  deterministic depth and node limits;
- outbox validation returns an opaque provenance-bearing wrapper, so arbitrary
  JSON, spread copies, and JSON round-trips cannot claim validation;
- `__proto__`, `prototype`, and `constructor` are rejected exactly, while
  sensitive/internal keys are rejected case-insensitively;
- negative zero is rejected because JSON serialization changes it to zero;
- canonical and safe-payload strings reject unpaired UTF-16 surrogates before
  UTF-8 byte counting;
- browser reachability propagates sensitive and unresolved computed
  environment reads through imports, re-exports, hooks, dynamic imports,
  CommonJS wrappers, and cycles;
- declarative scanner rule IDs match emitted diagnostics;
- corrected BLOCKER/HIGH tests assert exact codes, fields, rule IDs, source
  paths, root paths, and fixture exit status.

A1.4 completion is not approval to commit. A separate independent rereview is
required.

## A1.6 focused correction record

A1.5 independently returned `A1_ADDITIONAL_CORRECTION_REQUIRED`. A1.6 fixes
only its two remaining data-policy findings and two review-coverage findings:

- outbox safe-payload keys use a case-insensitive normalized exact-key policy
  that removes `_` and `-` before comparing provider-routing and
  internal-diagnostic categories;
- reserved keys include provider identity/reference/status/response/payload,
  delivery/channel/recipient provider routing, diagnostics/debug/trace,
  failure detail/stage, retry/attempt/worker metadata, and internal metadata;
- exact normalized matching preserves unrelated business keys such as
  `providerPreference`, `diagnosticCategoryLabel`, `customerReference`, and
  `deliveryWindow`;
- safe external Arabic messages reject normalized English, header, separator,
  mixed-language, and Arabic idempotency/deduplication terminology using the
  exact `SAFE_ERROR_IDEMPOTENCY_LEAK` validation code without echoing the
  rejected message;
- A1 retains bounded free text rather than freezing application-specific
  messages. A2 must map internal error codes to an approved static Arabic
  message catalog; A1 does not claim reliable detection of arbitrary
  high-entropy key material when no forbidden terminology accompanies it;
- isolated scanner fixtures now exercise all 13 stable rule IDs. The runner
  reports fixture-covered, live-scan-only, intentionally non-isolatable, and
  uncovered IDs explicitly; all latter three groups are currently empty.

A1.6 completion is not approval to commit. A1.7 must perform the narrow final
independent approval review.

## Scope

Implemented:

- branded identity contracts;
- exact P2D.20 acquisition input and result contracts;
- database-authoritative Authorization Context shape;
- command envelope, result, executor-response, and audit types;
- command and migration dispositions;
- idempotency and request-fingerprint contracts;
- replay and outbox envelopes;
- Runtime state declarations;
- safe external/internal diagnostic error separation;
- declarative credential boundaries;
- pure fail-closed validators;
- deterministic forbidden-boundary repository scanner;
- repository-native contract and checker tests.

Explicitly excluded:

- clients and credentials;
- database/RPC access;
- P2D.20 execution;
- command claim/execution;
- replay execution;
- outbox persistence or delivery;
- route/component/hook/Server Action integration;
- Production state selection or activation.

## Authoritative inputs

1. Installed P2D.15 Foundation contract.
2. P2D.17 durable immutable command-envelope design.
3. P2D.18 durable command contract freeze.
4. P2D.18A clarification amendment.
5. Installed and attested P2D.19 payload storage.
6. Installed and attested P2D.20 trusted acquisition function.
7. R1.1 inventory and R1.2 architecture, disposition, plan, decisions, and
   checklist.
8. BASELINE.5 scaffold disposition.

Deleted prototype contracts were not used as authority.

## Exact contract inventory

| Area | Module | Frozen surface |
|---|---|---|
| Identities | `contracts/identities.ts` | Tenant, branch, actor, command, ledger, correlation, replay request, outbox event, and authorization-context IDs |
| Authorization | `contracts/authorization.ts` | Untrusted acquisition input, opaque database-authoritative context, Runtime diagnostics, raw P2D.20 row, discriminated result |
| Commands | `contracts/commands.ts` | Command type, execution state, identity, payload, envelope, result, executor response, audit metadata |
| Dispositions | `contracts/dispositions.ts` | Four acquisition outcomes and eight migration classifications |
| Idempotency | `contracts/idempotency.ts` | Key, scoped identity, canonical bytes, request fingerprint, lifecycle rules |
| Replay | `contracts/replay.ts` | Request, fresh authorization, stored result, failure, audit metadata |
| Outbox | `contracts/outbox.ts` | Event type/envelope, safe JSON value, delivery state, attempt metadata |
| Errors | `contracts/errors.ts` | Safe external and internal diagnostic error types |
| Runtime state | `contracts/runtime-state.ts` | Six declared states and transition intentions |
| Credentials | `boundaries/credentials.ts` | Five declarative credential/client boundaries |
| Import rules | `boundaries/import-rules.ts` | Static forbidden-boundary rule inventory |
| Validation | `validation/**` | Pure strict validators and safe error builder |

The package root exports public server contracts and declarations only.
Validation is available from `lib/core-v2/validation`; internal diagnostics,
credential topology, and provenance implementation are absent from the root
barrel.

## P2D.20 mapping matrix

Installed signature:

`public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)`

| P2D.20 input | A1 field | Authority |
|---|---|---|
| `p_authenticated_actor_id` | `authenticatedActorId: ActorId` | Verified session identity supplied by future trusted adapter; revalidated by database |
| `p_tenant_id` | `tenantId: TenantId` | Trusted request scope; database revalidates profile/tenant |
| `p_branch_id` | `branchId: BranchId` | Trusted request scope; database revalidates branch access/state |
| `p_idempotency_key` | `idempotencyKey: IdempotencyKey` | Caller-owned logical request key after deterministic Runtime validation |
| `p_correlation_reference` | `correlationReference: CorrelationId` | Request-local diagnostic correlation |
| `p_canonical_payload` | `canonicalPayload: CanonicalJsonBytes` | Future Runtime canonicalizer; database independently validates bytes |
| `p_fingerprint_projection` | `fingerprintProjection: CanonicalJsonBytes` | Future Runtime projection; database independently derives and compares |
| `p_retain_until` | `retainUntil: string` | Future reviewed retention policy; database validates boundary |

| P2D.20 result | A1 field |
|---|---|
| `acquisition_result` | `disposition` |
| `authorization_context_id` | `authorizationContextId` |
| `atomic_command_id` | `atomicCommandId` |
| `correlation_reference` | `correlationReference` |
| `command_status` | `commandStatus` |
| `response_version` | `responseVersion` |
| `response_snapshot` | `responseSnapshot` |
| `completed_at` | `completedAt` |
| `error_code` | `errorCode` |
| `error_detail` | `errorDetail` |
| `last_failure_stage` | `lastFailureStage` |
| `stored_request_fingerprint` | raw adapter `unknown`; normalized value is opaque `NormalizedDatabaseFingerprint` |

P2D.20 maps Production profile role `owner` to stored authorization role
`admin`. A1 models the stored role values only; it makes no local role decision.

## Runtime-only versus database-authoritative fields

| Runtime may supply/hold | Database authority only |
|---|---|
| Verified session actor ID candidate | Active actor/profile evidence |
| Tenant and branch scope candidates | Tenant existence and branch access/state |
| Raw validated idempotency key | Idempotency-key hash and scoped classification |
| Correlation reference | Context and command UUIDs |
| Canonical payload/projection candidates | Canonical equality, authoritative projection and SHA-256 |
| Retention candidate | Accepted retention boundary |
| Transport/source/request reference diagnostics | Role snapshot and capability version |
| Safe response mapping | Employee evidence |
| — | Issued/expiry timestamps and reference hash |
| — | Atomic context/command/payload insert |
| — | Created/replay/in-progress/conflict disposition |

The database stores full Authorization Context evidence but P2D.20 returns only
its identifier. A1 models the stored authoritative record separately. How a
future executor retrieves or consumes those facts requires a separately
reviewed database contract and is unresolved here.

## Command dispositions

The four P2D.20 acquisition dispositions are:

| Disposition | Meaning | Retry/replay | Ledger effect |
|---|---|---|---|
| `created` | New context, command, and payload created atomically | Execute once; retry with same key | Three new records |
| `replay` | Matching existing command is terminal | Return stored result; never execute again | No new record |
| `in_progress` | Matching existing command is nonterminal | Poll/retry same key; no new command | No new record |
| `fingerprint_conflict` | Same scoped key has different fingerprint | Reject; new logical intent requires new key | No new record |

Exact installed disposition/status matrix:

| Disposition | Allowed installed status |
|---|---|
| `created` | `reserved` |
| `in_progress` | `reserved`, `processing`, `failed_retryable` |
| `replay` | `succeeded`, `failed_final` |
| `fingerprint_conflict` | `reserved`, `processing`, `succeeded`, `failed_retryable`, or `failed_final`; returned authorization context is null |

Successful replay requires a plain JSON object snapshot. Failed-final replay
requires null response version, snapshot, and completion fields plus the
installed failure code/stage fields.

R1.2 leaves the exact external HTTP status for `in_progress` as a future stable
choice between 202 and 409. A1 does not invent that decision.

## Legacy-path migration dispositions

These architecture classifications are separate from acquisition outcomes:

- `RETAIN_AS_IS`
- `WRAP_TEMPORARILY`
- `REPLACE_WITH_CORE_V2`
- `MOVE_SERVER_SIDE`
- `MOVE_BEHIND_RPC`
- `REMOVE_AS_DEAD_CODE`
- `DEFER_WITH_EXPLICIT_BLOCKER`
- `REQUIRES_ADDITIONAL_EVIDENCE`

## Idempotency contract

- Type: branded `IdempotencyKey`.
- Length: 1–512 characters.
- Runtime-safe character set: ASCII letters, digits, `.`, `_`, `:`, and `-`.
- Normalization: identity; no trimming and no case folding.
- Leading/trailing whitespace and all other characters are rejected.
- Ownership: caller owns one stable key per logical request; trusted Runtime
  validates and propagates it.
- No key is generated, substituted, randomized, or timestamp-derived after
  request acceptance.
- Same key and canonical payload may classify as created, in progress, or
  replay.
- Same key and conflicting canonical payload classifies as
  `fingerprint_conflict`.
- Missing or malformed keys fail closed before database access.
- Raw keys must never be logged or stored in the payload.
- A1 performs no ledger lookup and no cryptographic persistence.

This Runtime character set is intentionally stricter than P2D.20’s text input.
Every accepted A1 key remains valid under P2D.20’s `btrim`/length checks without
changing bytes.

## Replay contract

- Replay is server-only and cannot be client-initiated directly.
- It references an immutable existing `CommandId`.
- It requires fresh actor/tenant/branch authorization.
- It returns the stored terminal result.
- It cannot mutate or rebuild payload/business data.
- A1 defines no replay query or execution implementation.

## Outbox contract

The envelope separates transactional event identity, tenant/command linkage,
aggregate linkage, correlation, safe payload, recipient/provider references,
and creation time. Delivery attempts and internal diagnostics are separate.
A1 creates no outbox write, worker, provider call, notification, or retry loop.

Safe payload policy permits JSON-compatible values only, with maximum depth 8,
256 total object keys, 256 array entries, 16,384 serialized UTF-8 bytes, and
safe keys of at most 64 characters. Recipient/provider data and internal
delivery diagnostics remain separate.

`OutboxEventEnvelope.safePayload` requires opaque
`ValidatedOutboxPayload` provenance returned by the validator. Raw event input
uses `UntrustedOutboxEventInput`; structural JSON alone cannot claim it passed
safety validation. Normalized objects, arrays, and the provenance wrapper are
deeply frozen.

Dangerous JavaScript keys `__proto__`, `prototype`, and `constructor` are
rejected as exact spellings. Internal and sensitive key categories are rejected
case-insensitively. Negative zero, NaN, and positive/negative infinity are
rejected.

Provider-routing and internal-diagnostic categories use normalized exact-key
matching: comparisons are case-insensitive and ignore `_` and `-`, but do not
reject longer harmless keys merely because they contain `provider` or
`diagnostic` as a substring.

## Runtime state

Declared states:

- `LEGACY_ONLY`
- `SHADOW_VERIFY`
- `CORE_V2_CANARY`
- `CORE_V2_ACTIVE`
- `CORE_V2_PAUSED`
- `ROLLBACK_TO_LEGACY`

Transition intentions are declarations only. A1 does not read environment or
database state, does not activate a state, and introduces no Production default.

`SHADOW_VERIFY` cannot acquire a second durable command, dual-write, or mutate
ledger, order, inventory, payment, or outbox state. It may compare read-only
normalized projections only after later reviewed implementation.

`ROLLBACK_TO_LEGACY` changes routing only for eligible future requests. It does
not roll back committed commands, delete ledger history, reverse durable side
effects, or automatically resolve acquired/in-progress commands.

## Error boundary

Safe external errors allow exactly:

- stable uppercase machine code;
- safe Arabic user message;
- retryable boolean;
- correlation ID;
- HTTP status from 400 through 599.

Runtime policy limits are 64 characters for the machine code, 512 characters
for the Arabic message, and 128 characters for the correlation ID.

Strict validation rejects unknown fields, including stack, cause, database
message, SQL state, constraint, function, table, role, and service credential
details. The Arabic message must contain Arabic characters and is rejected when
it contains common internal-diagnostic terms.

Safe messages also reject normalized idempotency-header, request-key,
deduplication-key, duplicate-command-key, command-key, and frozen Arabic
idempotency terminology. The thrown validation error never includes the
rejected message. A1 retains bounded free text because an application-specific
message catalog belongs to A2; A2 must map internal codes to approved static
Arabic messages and must not rely on A1 to identify arbitrary raw
high-entropy values without accompanying terminology.

Internal diagnostics are a separate server-only type and may contain original
cause, classification, command/ledger/correlation IDs, retry assessment, stack,
and database diagnostic fields. They must never be returned externally.

## Credential matrix

| Boundary | Browser | Credential intent | Direct writes | P2D.20 | Execute | Replay |
|---|---:|---|---:|---:|---:|---:|
| Browser Supabase | Yes | anon/authenticated | No | No | No | No |
| User-scoped server | No | verified authenticated session | No | No | No | No |
| Trusted service role | No | exceptional legacy/admin/provider secret | No Core V2 | No | No | No |
| Core V2 executor | No | dedicated managed LOGIN with explicit SET ROLE | No | Yes | Future reviewed RPC | Future reviewed contract |
| Worker | No | dedicated worker LOGIN with explicit SET ROLE | No | No | No | No |

These are declarations. No client factory or environment read exists in A1.

## Forbidden-boundary rules

`scripts/check-core-v2-boundaries.mjs` uses the repository-installed TypeScript
compiler API and scans implementation source under
`app`, `components`, `lib`, `hooks`, and `scripts`, excluding documentation,
ignored evidence, `.git`, and `node_modules`.

It reports exact file/rule/description and exits nonzero for:

1. Client Component import of Core V2.
2. Browser import/reference of service-role modules or environment names.
3. UI imports of Runtime/acquisition/executor/replay.
4. API route imports of browser Supabase clients.
5. Contract/validation imports of UI, React, Next, Supabase, network, database,
   or environment code.
6. Environment/network/Supabase/database calls in contract/validation modules.
7. Direct application writes to Core V2 ledgers/outbox.
8. Current route import of Core V2.
9. A route mixing Core V2 and legacy-write fallback.

The module graph resolves relative and `@/` paths, imports, multiline imports,
export-from declarations, side-effect imports, literal CommonJS `require`,
literal dynamic imports, static template imports, barrels, and transitive
re-export chains across supported TypeScript and JavaScript files.

Directive detection handles BOM, leading comments, whitespace, and directive
prologues without treating comments or arbitrary strings as `'use client'`.
Environment detection covers dot/bracket access, destructuring, and direct
aliases for known service/database names. Sensitive reads are propagated to
browser roots through statically resolved wrappers and re-export chains.
Computed `process.env[key]` access reachable from a browser fails closed as
`browser_unresolved_environment_access`. Non-literal module names remain
outside static proof and require review.

Exact implemented scanner rule IDs:

- `client_to_core_v2`
- `browser_to_service_role`
- `ui_to_trusted_runtime`
- `client_to_core_v2_internal`
- `api_to_browser_supabase_client`
- `core_v2_legacy_fallback`
- `browser_sensitive_environment_reachability`
- `browser_unresolved_environment_access`
- `core_v2_environment_access`
- `application_core_v2_ledger_access`
- `route_core_v2_activation`
- `contract_forbidden_import`
- `contract_forbidden_runtime_access`

Current A1 internal-path enforcement protects browser/client reachability.
Because A1 contains no sealer, generic server imports cannot manufacture
authority today. A2 must define one narrowly allowlisted adapter location and
make any other server import of provenance-sealing functions a scanner
violation.

## Validation inventory

Pure validators cover:

- lowercase canonical UUID identities;
- correlation IDs;
- idempotency keys;
- recognized command type;
- Runtime state;
- migration disposition;
- command disposition;
- strict command-envelope keys and nested minimum contract;
- rejection of structurally forged and caller-controlled authority;
- disposition-specific raw P2D.20 invariants;
- strict safe external error own-property shape and Runtime bounds;
- canonical text boundaries;
- recursively bounded, descriptor-safe outbox JSON.

Canonical strings must contain valid Unicode scalar values. Lone high/low
surrogates are rejected; valid pairs, BMP text, Arabic, and astral characters
are preserved without normalization before UTF-8 byte counting.

They perform no I/O and use no environment, database, network, React, or
Supabase dependency.

## Test inventory

`scripts/check-core-v2-contracts.mjs` uses the repository’s existing
TypeScript-transpile check pattern and covers:

- valid and malformed identities, including uppercase UUID rejection;
- valid, missing, invalid-character, and oversized idempotency keys;
- valid and unknown Runtime states;
- all valid and an unknown migration disposition;
- all four valid and an unknown command disposition;
- forged envelope authority and caller-controlled authority rejection;
- all valid and conflicting acquisition disposition shapes;
- normalized fingerprint and provenance opacity;
- plain-object safe errors with prototype/accessor/symbol/boundary attacks;
- canonical text and safe outbox payload boundaries;
- relative, dynamic, template, require, alias, multiline, barrel, re-export,
  directive, environment, and safe-server scanner fixtures;
- current repository boundary scan;
- static absence of environment/network/Supabase/database access.

The current runner executes 162 contract checks and 32 scanner fixtures. Every
one of the 13 stable scanner rule IDs has an isolated violating fixture.
Live-scan-only, intentionally non-isolatable, and uncovered rule-ID sets are
reported explicitly and are all empty.

No package dependency or lockfile change is required.

## Deferred items and unresolved mappings

1. Trusted server client construction, credential retrieval, the sole
   immutable authority-provenance sealer, and its narrowly allowlisted import
   boundary: A2.
2. Exact database driver representation and validated conversion for
   PostgreSQL `bytea`: A2 contract adapter review.
3. Retrieval/consumption of the full stored Authorization Context: requires a
   reviewed database/executor contract.
4. Canonical payload construction, hashing, and P2D.18A full order validator:
   A2 must map
   the frozen payload without calling P2D.20 during tests.
5. Exact `in_progress` HTTP status: unresolved R1.2 transport decision.
6. Executor claim/execute/result contracts and SQL: Batch B.
7. Replay database access: later reviewed Runtime/executor phase.
8. Outbox persistence/delivery: Batch I.
9. Runtime state source and activation: later controlled rollout work.

## No-activation proof

- No route imports `lib/core-v2`.
- No component or hook imports `lib/core-v2`.
- No Server Action imports `lib/core-v2`.
- No P2D.20 function name or RPC call exists in new TypeScript modules.
- No database/Supabase client is created.
- No environment variable is read.
- No network call exists.
- No runtime-state reader/default/activation exists.
- No POS, Admin, order, legacy RPC, or application route file changed.
- No SQL or migration was created or executed.

## Next-phase recommendation

Proceed only to **A1.7 — Narrow Independent Approval Review**. If A1.7 approves
the frozen A1 package for commit, the later implementation phase is **Batch A
Phase A2 — Trusted server adapter design and canonical request mapping**,
remaining unwired. A2 must resolve credential acquisition, exact driver
mappings, full P2D.18A canonical payload validation, and the P2D.20 call
boundary without route activation.

`A1_900_RUNTIME_CONTRACT_FREEZE_COMPLETE`

`A12_900_RUNTIME_CONTRACT_AND_BOUNDARY_CORRECTION_COMPLETE`

`A13_900_INDEPENDENT_REREVIEW_COMPLETE`

`A14_900_FINAL_CONTRACT_AND_SCANNER_CORRECTION_COMPLETE`

`A15_900_FINAL_INDEPENDENT_APPROVAL_REVIEW_COMPLETE`

`A16_900_FOCUSED_DATA_POLICY_AND_COVERAGE_CORRECTION_COMPLETE`
