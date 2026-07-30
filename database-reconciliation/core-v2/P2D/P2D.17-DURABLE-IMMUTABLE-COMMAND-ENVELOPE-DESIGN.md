# P2D.17 — Durable Immutable Command Envelope Design

## 1. Executive Summary

The installed Foundation is structurally sound for authorization contexts, command identity, state transitions, idempotency scope, and response replay. It is not sufficient for execution because it stores only `request_fingerprint`, not the request that produced that fingerprint.

The recommended correction is:

**Option B — a separate, one-to-one immutable command-payload table.**

The payload record should:

- Be created in the same transaction as its authorization context and command.
- Be permanently bound to exactly one `atomic_order_commands.id`.
- Store a versioned canonical JSONB order envelope.
- Store the independently computed SHA-256 fingerprint.
- Be immutable after insertion.
- Remain separate from frequently updated command execution state.
- Be readable only through reviewed `SECURITY DEFINER` functions.
- Never contain credentials, tokens, PINs, card secrets or provider secrets.

A single trusted database entrypoint must derive authorization evidence, classify idempotency, insert the context, command and payload atomically, and return a typed acquisition result.

R1.2 Executor remains blocked until that forward database contract is reviewed and installed.

---

## 2. Recommended Architecture

### 2.1 Storage model

Add a separate internal relation conceptually named:

`atomic_order_command_payloads`

One payload belongs to exactly one command.

Recommended logical fields:

| Field | Purpose |
|---|---|
| `command_id` | Primary key and one-to-one command binding |
| `payload_version` | Immutable payload schema version |
| `fingerprint_version` | Canonicalization/fingerprint algorithm version |
| `canonical_payload` | Complete normalized immutable JSONB envelope |
| `request_fingerprint` | SHA-256 of the canonical payload |
| `canonical_size_bytes` | Size of the canonical UTF-8 representation |
| `created_at` | Transaction timestamp |
| `created_by_identity` | Trusted issuing identity |
| `retain_until` | Earliest permitted archival/deletion date |
| `archived_at` | Optional archive lifecycle evidence |
| `archive_reference` | Optional immutable archive reference after archival |
| `archive_hash` | Hash proving archived content equality |

The installed `atomic_order_commands.request_fingerprint` remains the acquisition/indexing fingerprint. It must equal the payload record’s fingerprint.

The installed `response_snapshot` remains the immutable committed response. It must not store request payloads.

### 2.2 Relationship model

- One command has exactly one payload.
- One payload belongs to exactly one command.
- Payload rows cannot be reassigned.
- Payload insertion occurs only during command creation.
- Existing commands created before payload support require explicit classification; they must not be silently treated as executable.
- Command deletion must not cascade casually into payload deletion.
- Payload deletion must be prohibited while the command remains replayable, auditable, disputed, retained or legally held.

### 2.3 Why separate storage is preferred

Command rows are operationally hot:

- leases change;
- attempt counts change;
- state changes;
- errors change;
- result fields change;
- retention timestamps change.

Payload rows are immutable and potentially TOASTed. Separating them avoids repeatedly carrying a large payload through command-row updates and isolates retention, archival and access policies.

---

## 3. Tradeoff Analysis

### Option A — JSONB inside `atomic_order_commands`

Advantages:

- Simplest relationship.
- One inserted row contains command identity and intent.
- No join during execution.
- Straightforward transaction semantics.
- No risk of an orphan payload row.

Disadvantages:

- Makes the operational command row wide.
- Mixes immutable request data with mutable execution state.
- Increases heap and vacuum pressure on the command ledger.
- Large values are likely TOASTed.
- Command-state updates create additional tuple versions.
- Payload retention cannot evolve independently.
- Archival or PII handling becomes coupled to command-state retention.
- Future payload access control is harder to isolate.
- Index-only operational scans become less attractive.
- Schema evolution affects the central command table.

Verdict: viable for small systems, but not preferred for a permanent financial/order engine.

### Option B — separate immutable payload table

Advantages:

- Separates immutable evidence from mutable execution state.
- Keeps command acquisition and recovery indexes narrow.
- Reduces command-ledger vacuum and cache pressure.
- Allows payload-specific RLS, retention and archival.
- Allows payload storage to evolve without restructuring command state.
- Clear one-to-one audit relationship.
- Executor loads the payload only when necessary.
- Payload access can be denied to workers that need only command state.
- Better long-term maintenance and privacy controls.

Disadvantages:

- One additional insert.
- One additional relation and FK.
- Executor requires a join or second internal lookup.
- Atomic entrypoint must ensure no orphan context, command or payload.
- Cross-table fingerprint equality must be enforced by the trusted entrypoint or an approved database invariant.
- Operational verification becomes more extensive.

Verdict: **recommended**.

### Option C — immutable payload reference model

Examples include object storage, content-addressed blobs or an external immutable evidence service.

Advantages:

- Keeps PostgreSQL storage small.
- Suitable for very large envelopes.
- Independent archival and tiering.
- Content-addressed storage can support deduplication.
- Reduced long-term database TOAST footprint.

Disadvantages:

- Cannot naturally participate in the same PostgreSQL transaction.
- Creates a payload-availability dependency during execution and replay.
- Requires independent encryption, ACL, lifecycle and integrity controls.
- Risks dangling references and orphan blobs.
- Object-store write visibility may be eventually consistent.
- Recovery requires both database and external storage.
- Audit export becomes more complex.
- Deletion and legal-hold coordination become distributed.
- Higher operational and security complexity.
- Inappropriate for ordinary order payload sizes.

Verdict: not recommended as the primary live payload store. It is suitable only as a later cold-archive destination.

### Comparison

| Criterion | A: command JSONB | B: separate table | C: reference |
|---|---:|---:|---:|
| Atomicity | Excellent | Excellent with one entrypoint | Weak without distributed coordination |
| Security isolation | Moderate | Excellent | Complex |
| Replay availability | Excellent | Excellent | External dependency |
| WAL/heap isolation | Weak | Good | Excellent locally |
| TOAST isolation | Weak | Excellent | External |
| Operational indexing | Moderate | Excellent | Excellent locally |
| Retention flexibility | Weak | Excellent | Excellent but distributed |
| Maintenance | Simple initially | Moderate | High |
| Future evolution | Moderate | Excellent | High complexity |
| Recommended | No | **Yes** | Archive only |

---

## 4. Security Review

### 4.1 Sensitive-data classification

#### Allowed

- Customer ID.
- Customer display-name snapshot where required.
- Normalized and display phone snapshots where operationally required.
- Email snapshot where required for delivery.
- Non-secret delivery address or fulfillment instructions.
- Catalog item IDs.
- Item descriptions and SKU snapshots.
- Quantities.
- Pricing, VAT and discount evidence.
- Payment method classification.
- Non-sensitive payment intent.
- Request source and approved reference.
- Engine and rule versions.
- Correlation reference.
- Authorization-context reference.

#### Forbidden

- Passwords.
- POS PINs.
- Password hashes.
- Bearer tokens.
- Refresh tokens.
- Session cookies.
- Authorization headers.
- Authorization-context bearer secrets.
- Provider API keys.
- Webhook signing secrets.
- Database credentials.
- Raw logging payloads.
- Internal error stacks.

#### Never store

- Full payment-card numbers.
- CVV/CVC.
- Track data.
- PIN blocks.
- Magnetic-stripe data.
- Authentication values from card providers.
- Any PCI-sensitive secret.
- Unredacted payment-provider request or response objects.

Permitted payment evidence is limited to:

- payment-method class;
- tendered amount;
- expected payment status;
- approved non-sensitive provider reference after payment;
- masked display information only where independently approved.

### 4.2 Customer PII

Customer PII must be:

- limited to what execution and evidence require;
- encrypted by the platform’s database/storage controls;
- excluded from logs, traces and error messages;
- accessible only through trusted functions;
- subject to approved retention and legal-hold rules;
- excluded from operational indexes except where strictly necessary;
- redacted from routine support and performance evidence.

The payload must not become a general customer-history store.

### 4.3 Database security model

The future trusted entrypoint should be:

- `SECURITY DEFINER`;
- owned by `afex_function_owner`;
- configured with exact `search_path=pg_catalog`;
- fully schema-qualified for application relations;
- unavailable to `PUBLIC`, `anon`, `authenticated` and `service_role`;
- unavailable through direct table grants;
- executable only by the approved server runtime execution identity after activation;
- fail-closed when actor, tenant, branch, capability or managed identity evidence is invalid.

The payload table should:

- be owned by `afex_core_owner`;
- have RLS enabled and forced;
- expose its production policy only to `afex_function_owner`;
- grant no direct table access to browser, service, issuer, worker or runtime roles;
- permit no ordinary UPDATE or DELETE path;
- use an independently reviewed archival path when required.

Forced RLS remains compatible because the function owner is the reviewed policy role.

### 4.4 Trusted authorization derivation

The entrypoint must not accept these as authoritative request fields:

- tenant;
- branch entitlement;
- actor role;
- capabilities;
- employee association;
- issuer identity.

It must derive and revalidate them from trusted database/session evidence inside the same transaction.

The request may nominate a branch, but the entrypoint must prove access to it.

---

## 5. Payload and Fingerprint Contract

### 5.1 Payload versioning

`payload_version` identifies the immutable envelope schema.

Recommended initial value:

`order-command-payload-v1`

Rules:

- A stored payload version never changes.
- Executors explicitly declare supported versions.
- Adding optional fields with frozen defaults may remain compatible only when the version contract explicitly permits it.
- Changing meaning, required fields, normalization or financial semantics requires a new version.
- Historical payloads are never rewritten into a newer version.
- Upgrade logic belongs in version-specific readers, not data mutation.
- Unsupported versions fail deterministically before any business mutation.
- Replay uses the original version and original committed response.

### 5.2 Fingerprint versioning

`fingerprint_version` identifies the canonicalization and included-field contract.

Recommended initial value:

`order-request-fingerprint-v1`

A fingerprint is:

`SHA-256(canonical UTF-8 serialization of the immutable fingerprint projection)`

The payload may contain non-identity evidence. The fingerprint must be computed from an explicitly defined projection, not blindly from every storage field.

### 5.3 Canonical serialization

Rules:

- UTF-8 encoding only.
- Object keys sorted by Unicode code-point/code-unit contract, not locale collation.
- No `localeCompare`.
- Strings normalized to Unicode NFC.
- UUIDs lowercase in canonical hyphenated form.
- Decimals represented as canonical strings, never binary floating point.
- Money uses the frozen currency scale, normally two fractional digits.
- Quantities use their approved fixed scale.
- Leading plus signs are removed.
- Leading integer zeroes are removed except the single zero.
- Negative zero canonicalizes to zero.
- Scientific notation is forbidden.
- `NaN`, infinity and non-finite values are forbidden.
- `undefined` is forbidden before canonicalization.
- Omitted and null are distinct.
- Optional fields have one frozen representation: either required explicit null or required omission.
- Arrays preserve order only where order has business meaning.
- Semantically unordered collections must be sorted by a specified stable identity.
- Duplicate JSON keys are forbidden.
- Duplicate item identities require an explicit policy.
- Runtime timestamps do not participate unless the timestamp itself is part of customer intent.
- Database issuance timestamps never participate.
- No locale-dependent parsing or formatting is permitted.

### 5.4 Item ordering and duplicates

Recommended rule:

- Each line receives a stable canonical `line_id`.
- Display order is stored separately.
- Fingerprint item order follows canonical line order.
- Identical catalog items may appear more than once only when distinct modifiers, price treatment or fulfillment intent makes them distinct.
- Otherwise duplicates must be consolidated before issuance.
- Duplicate line IDs are forbidden.
- Modifiers and options form part of line identity and fingerprinting.

### 5.5 Fields included in the fingerprint

Include:

- payload version;
- command type;
- tenant ID;
- branch ID;
- authenticated actor binding where actor-specific execution matters;
- customer resolution/create intent;
- customer expected record version;
- canonical item lines;
- catalog item IDs;
- quantities;
- modifiers/options;
- quote reference and immutable financial evidence;
- discount selection;
- VAT treatment;
- payment intent;
- fulfillment intent;
- order note where it changes the resulting order;
- source channel when behavior depends on it;
- rule and engine versions required to interpret the request.

Exclude:

- command ID;
- authorization-context ID;
- correlation ID;
- idempotency key;
- request ID;
- HTTP metadata;
- tracing metadata;
- issuance timestamp;
- expiry timestamp;
- database identity;
- logger metadata;
- archive metadata;
- retention timestamps;
- observer/operator evidence;
- non-behavioral request reference.

An excluded request reference may still be stored for audit, but it must not alter idempotency classification.

### 5.6 Immutable business snapshot

#### Customer

- Resolution mode: existing/create/none.
- Existing customer ID where applicable.
- Expected customer record version.
- Canonical normalized phone.
- Display phone where required.
- Name, email, address and notes intended for the transaction.
- Explicit permitted-update intent.
- No silent merge semantics.

#### Items

- Stable line ID and display sequence.
- Catalog item ID.
- Name/SKU/category/type snapshots.
- Quantity and unit.
- Modifier/option intent.
- Inventory-tracking classification.
- Requested fulfillment classification.

#### Pricing

- Authoritative quote reference.
- Unit price.
- Price source.
- Catalog/branch source identifiers.
- Source versions.
- Gross line amount.
- Currency.

#### VAT

- VAT rule ID.
- Rate.
- taxable amount.
- VAT amount.
- effective-rule version.

#### Discounts

- Discount ID.
- name/type/value snapshots;
- eligibility version;
- allocated line discount;
- total discount.

#### Payment intent

- Payment-method class.
- Tendered amount.
- expected payment-state intent.
- cash-received/change/remaining rules where applicable.
- No card secrets.

#### Fulfillment intent

- fulfillment method;
- branch fulfillment scope;
- delivery/pickup classification;
- approved non-secret delivery instructions;
- requested scheduling evidence where supported.

#### Financial intent

- subtotal;
- discount;
- taxable subtotal;
- VAT;
- total;
- rounding version;
- financial-engine version;
- quote version;
- quote fingerprint;
- rule versions.

The invoice and invoice items remain the authoritative committed financial truth. The command payload records the immutable execution input and quote evidence, not the final legal posting.

#### Order metadata

- customer note where operationally required;
- source channel;
- approved business reference;
- offline-draft reference where applicable;
- version metadata.

---

## 6. Replay Review

### 6.1 Acquisition result union

The trusted entrypoint should return exactly one typed disposition.

#### Created

```text
kind: created
authorization_context_id
atomic_command_id
correlation_id
command_status: reserved
payload_version
fingerprint_version
request_fingerprint
```

Meaning: context, command and payload were created atomically.

#### Replay

```text
kind: replay
atomic_command_id
correlation_id
command_status
response_version
response_snapshot
completed_at
```

Meaning: the same scoped key and same fingerprint already reached a replayable terminal state.

A newly supplied authorization context must not be retained merely to replay an existing command.

#### In progress

```text
kind: in_progress
atomic_command_id
correlation_id
command_status
retry_after_hint
```

Meaning: the same scoped key and fingerprint identify a reserved, processing or recoverable command.

No second command or payload is created.

#### Fingerprint conflict

```text
kind: fingerprint_conflict
atomic_command_id
correlation_id
command_status
stored_fingerprint_version
stored_request_fingerprint
```

Meaning: the scoped key exists but its fingerprint differs.

The response must not expose the stored payload.

### 6.2 Replay guarantees

Replay must:

- compare the stored fingerprint before returning an existing result;
- use the committed `response_snapshot`;
- never recalculate historical results from current catalog/VAT/discount data;
- never reconstruct the request from mutable business tables;
- preserve the original response version;
- distinguish terminal failure from successful replay;
- respect response-retention and archive state.

### 6.3 Deterministic recovery

A recovery worker must be able to obtain:

- command state;
- immutable payload;
- authorization evidence;
- engine versions;
- attempt history;
- lease state;
- prior failure evidence.

No mutable browser or POS state may be needed.

---

## 7. Atomic Entrypoint and Error Contract

### 7.1 Single trusted entrypoint

One trusted database entrypoint should perform:

1. Validate calling runtime identity.
2. Resolve authenticated actor from trusted session evidence.
3. Resolve tenant.
4. Validate requested branch access.
5. Revalidate active profile and role.
6. Derive capability version and employee evidence.
7. Validate payload version.
8. Validate size.
9. Canonicalize the fingerprint projection.
10. Compute or independently verify the request fingerprint.
11. Hash the normalized idempotency key.
12. Acquire the scoped idempotency identity.
13. Lock or atomically classify an existing command.
14. If existing:
   - compare fingerprints;
   - return replay, in-progress or conflict;
   - create no context or payload.
15. If new:
   - create authorization context;
   - create reserved command;
   - create immutable payload;
   - verify all cross-bindings.
16. Return `created`.
17. Commit once.

Any failure rolls back all newly created objects.

### 7.2 Concurrency model

The database must arbitrate the scoped unique identity. Application-side read-then-insert is insufficient.

The entrypoint must use an acquisition strategy that:

- remains safe for simultaneous first inserts;
- treats the existing unique constraint as authoritative;
- locks the winning command before classification;
- avoids retaining a losing authorization context;
- performs fingerprint comparison after conflict resolution;
- never exposes an uncommitted command;
- has no separate client-side check/insert gap.

### 7.3 Deterministic errors

Recommended categories:

- `RUNTIME_IDENTITY_INVALID`
- `AUTHENTICATION_REQUIRED`
- `ACTOR_INACTIVE`
- `ACTOR_TENANT_MISMATCH`
- `ROLE_CHANGED`
- `CAPABILITY_CHANGED`
- `BRANCH_FORBIDDEN`
- `EMPLOYEE_IDENTITY_INVALID`
- `COMMAND_TYPE_UNSUPPORTED`
- `PAYLOAD_VERSION_UNSUPPORTED`
- `FINGERPRINT_VERSION_UNSUPPORTED`
- `PAYLOAD_INVALID`
- `PAYLOAD_TOO_LARGE`
- `PAYLOAD_FINGERPRINT_MISMATCH`
- `IDEMPOTENCY_KEY_INVALID`
- `IDEMPOTENCY_FINGERPRINT_CONFLICT`
- `COMMAND_IN_PROGRESS`
- `COMMAND_TERMINAL_FAILURE`
- `COMMAND_PAYLOAD_MISSING`
- `COMMAND_PAYLOAD_CORRUPT`
- `COMMAND_STATE_INVALID`
- `PERSISTENCE_CONTRACT_VIOLATION`
- `UNEXPECTED_DATABASE_FAILURE`

Database details, table names, SQLSTATE internals, payloads and PII must not be exposed to clients.

### 7.4 Runtime response

The Runtime should translate the database result without returning business data during issuance:

```text
created:
  authorizationContextId
  atomicCommandId
  correlationId
  status

replay:
  atomicCommandId
  correlationId
  status
  versioned committed response

in_progress:
  atomicCommandId
  correlationId
  status
  retry hint

fingerprint_conflict:
  atomicCommandId
  correlationId
  stable conflict code
```

Authorization-context IDs need not be returned for existing-command dispositions.

---

## 8. Performance Review

### 8.1 Write cost

New issuance adds:

- one payload-table insert;
- one payload PK/FK index entry;
- any minimal retention index entry.

Total new-command transaction:

1. Authorization context insert.
2. Command insert.
3. Payload insert.

Existing-key acquisition creates no new payload.

### 8.2 Payload size contract

Recommended limits:

- Expected payload: 4–32 KiB canonical UTF-8.
- Normal upper operating target: below 64 KiB.
- Hard maximum: 256 KiB.
- Cart-line limit remains independently enforced.
- Payloads above the hard limit fail before insertion.

The hard limit must apply to canonical UTF-8 bytes, not JavaScript character count.

### 8.3 TOAST

JSONB payloads above PostgreSQL’s inline threshold will generally use TOAST storage.

With a separate table:

- command-state rows remain narrow;
- recovery indexes remain efficient;
- command updates do not logically modify payload data;
- payload pages are read only when execution/replay needs them;
- TOAST access cost is isolated.

### 8.4 WAL

Each newly created command writes the payload once to heap/TOAST and WAL. This is unavoidable for durable execution evidence.

Expected impact is acceptable at normal order sizes. Risks arise from:

- oversized notes or metadata;
- duplicated catalog descriptions;
- unbounded modifiers;
- embedded binary/base64 content;
- repeated provider payloads.

Those must be prohibited or bounded.

### 8.5 Compression

Use PostgreSQL’s reviewed standard TOAST compression behavior. Do not introduce application compression initially because it:

- prevents native JSON inspection;
- complicates validation;
- increases corruption and compatibility risk;
- can reduce operational visibility.

External compression is appropriate only during archival.

### 8.6 Latency

Expected incremental issuance cost:

- one additional local database insert;
- JSON validation/canonicalization;
- SHA-256 over normally tens of KiB.

Expected warm-path impact should ordinarily be low single-digit to low tens of milliseconds when performed inside the same database call. It must not add another application-to-database network round trip.

### 8.7 Scalability

At 16 KiB average payload size:

- 100,000 orders: approximately 1.6 GB raw payload before database overhead/compression.
- 1,000,000 orders: approximately 16 GB raw payload before overhead/compression.

Actual storage depends heavily on descriptions, metadata, JSONB representation, compression, indexes and retention.

Capacity planning must include:

- primary storage;
- WAL;
- replicas;
- backups;
- archive export;
- vacuum metadata;
- encryption and legal retention.

---

## 9. Forward Migration Strategy

### Phase 1 — additive storage foundation

Design and externally review:

- immutable payload table;
- one-to-one command relationship;
- payload/fingerprint/size/version constraints;
- forced RLS;
- ownership and privilege closure;
- read-only verification;
- forward-fix and conservative rollback policy.

Core V2 remains disabled.

### Phase 2 — trusted acquisition entrypoint

Design and review one database entrypoint for:

- trusted authorization derivation;
- canonical payload validation;
- idempotency acquisition;
- context, command and payload creation;
- typed acquisition results;
- exact privilege closure.

No Executor activation.

### Phase 3 — Runtime contract correction

After database approval:

- replace caller-trusted principal construction with trusted server evidence;
- define a versioned canonical payload builder;
- correct key and decimal normalization;
- update the persistence result union;
- add the full R1.1 test matrix;
- add a concrete server-only adapter for the trusted entrypoint.

Existing Production flow remains unchanged.

### Phase 4 — compatibility and evidence

- Classify any pre-envelope command rows.
- Mark payload-less rows non-executable.
- Do not synthesize historical payloads from mutable tables.
- Verify no orphan context, command or payload.
- Verify fingerprint equality.
- Verify browser/runtime privilege closure.
- Run concurrency and replay tests only in an isolated environment.

### Phase 5 — Executor prerequisite gate

R1.2 may begin only after:

- migration installed;
- acquisition entrypoint installed;
- payload contract attested;
- Runtime adapter reviewed;
- canonicalization tests pass;
- concurrency tests pass;
- replay evidence passes;
- feature remains disabled until separate activation approval.

### Dependency order

```text
Installed P2D.15 Foundation
→ immutable payload storage
→ security closure
→ trusted acquisition entrypoint
→ read-only attestation
→ Runtime contract correction
→ isolated acquisition tests
→ R1.2 Executor design
```

### Rollback philosophy

This should be forward-only once commands with payloads exist.

Before Runtime activation:

- functions/grants may be withdrawn;
- feature gates remain disabled;
- additive tables may be retained safely.

After payload-bearing commands exist:

- do not drop payload storage;
- do not remove fingerprint evidence;
- do not revert to payload-less issuance;
- disable acquisition and apply a reviewed forward fix;
- preserve all issued command evidence.

---

## 10. Risks, Open Questions and Readiness

### Risks

- Divergence between TypeScript and database canonicalization.
- Accidentally hashing non-behavioral metadata.
- Missing behavior-affecting fields from the fingerprint.
- Excessive PII retention.
- Payload growth from unbounded metadata.
- Cross-table fingerprint mismatch.
- Existing-command collision creating an orphan context.
- Granting direct table access to runtime roles.
- Mutable update/delete paths violating immutability.
- Executor supporting a payload version incorrectly.
- Archived payload becoming unavailable during replay.
- Legal retention and privacy deletion requirements conflicting.

### Open questions requiring approval

1. Final hard maximum: proposed 256 KiB.
2. Whether 64 KiB should trigger operational warning evidence.
3. Exact customer PII fields required for execution.
4. Whether delivery address belongs in the payload or a separately protected snapshot.
5. Canonical treatment of duplicate catalog items.
6. Whether item display order affects business semantics.
7. Exact quantity scale for non-integer products.
8. Exact money/currency scale policy.
9. Whether source channel affects command identity.
10. Which external business reference is behavioral versus audit-only.
11. Legal/audit retention period by jurisdiction.
12. Archive platform and legal-hold authority.
13. Treatment of payload-less commands if any are ever issued before activation.
14. Whether fingerprint verification is performed solely in the database or independently in both Runtime and database.

These questions must be frozen before SQL generation but do not require redesigning the installed P2D.15 Foundation.

### Readiness Decision

The architecture decision is complete:

- separate immutable payload storage;
- versioned canonical JSONB envelope;
- SHA-256 fingerprint projection;
- one atomic trusted acquisition entrypoint;
- typed idempotency dispositions;
- forced-RLS-compatible least privilege;
- no Executor work until installation and attestation.

No SQL, migration, Runtime implementation, persistence implementation, API change, POS change, Admin change or database connection was performed.

**READY FOR P2D.18**