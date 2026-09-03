# Core V2 Integration Assessment

## Finding

AFEX Core V2 Atomic Order Engine is the correct server foundation for offline `order.create`, but it is not yet a general POS offline command engine. The local-first project should extend and consume Core V2, not implement an independent browser-to-business-table replay path.

## Existing useful contracts

The inspected Core V2 code/migration provides:

- typed `order.create` canonicalization and fingerprinting;
- stable acquisition by idempotency key;
- claim token and bounded lease;
- execution states including success, in-progress, retryable failure, reconciliation and manual hold;
- canonical response snapshots;
- order/invoice/line business links;
- command audit and diagnostic facts;
- replay and reconciliation functions;
- database-side official order/invoice creation and numbering.

These are materially stronger than the current `localStorage` draft loop.

## Integration blockers

### Effective POS actor authority

`app/api/orders/route.ts` validates the effective POS employee and passes employee attribution into legacy creation/patch paths. The Core V2 acquisition call, however, uses `auth.user.id` as `actorId`. The command authority must preserve two identities distinctly:

1. authenticated organization subject/session;
2. effective POS employee actor/session or signed offline lease.

The database function already validates command authority against trusted profiles/context. Extending it must remain fail-closed and must not trust a browser `employee_id`.

### Offline authorization lease

Core V2 accepts a currently authenticated server call. It does not currently attest a device-bound offline actor lease carrying command capabilities, expiry, tenant/branch and revocation epoch. Without this contract a command created offline cannot prove that the employee was authorized at creation time.

### Command coverage

Application/Core coverage identified:

| Command | Core V2 support | Offline decision |
|---|---|---|
| `order.create` | present, feature-flagged application path | pilot after actor/outbox/device gates |
| `order.status.transition` | separate compare-and-set API | blocked until typed ledger/receipt contract |
| `customer.create` | identity RPC, including use inside order flow | blocked as standalone command until ledger contract |
| `customer.update` | no attested versioned command | blocked |
| payment adjustment/refund | no attested command | blocked |
| settings/admin writes | outside POS offline scope | blocked |

### External effects

Inventory is part of authoritative order execution, but cost snapshots, audit in some paths and WhatsApp/PDF delivery are not uniformly represented as durable idempotent Core-linked outbox events. A device must never directly replay these effects.

## Required Core/server changes before offline order pilot

1. Define a versioned POS offline command envelope and canonical fingerprint projection.
2. Extend trusted authorization context to record primary subject, effective POS actor, actor source/session/lease, tenant, branch and device.
3. Add a server endpoint for batch acquire/replay receipts; do not expose service-role keys or raw RPC authority to the browser.
4. Validate signed offline lease expiry/capabilities and server revocation epoch.
5. Return structured price/tax/discount/inventory/customer conflicts, not a generic failure.
6. Persist official business links and terminal response before returning success.
7. Emit cost snapshot/audit/notification events into a durable server outbox keyed to command/business event.
8. Provide command receipt lookup after unknown HTTP result.
9. Define retention beyond the current 24-hour acquisition window so an offline device delayed longer cannot lose replay protection. Retention must cover maximum supported offline duration plus support/reconciliation margin.
10. Add operational observability for pending claims, expired leases, fingerprint conflicts, retries, reconciliation, manual holds and effect delivery.

## Database/authority work requiring a separate approved phase

Likely migration/authority work (not created in this study):

- actor/device/offline-lease authority records or signed-token revocation epoch;
- Core command context columns/relations for effective POS actor and device;
- command types/contracts for status and optionally customer creation;
- durable external-effect outbox and unique effect identity;
- receipt/batch sync/cursor functions or API-supporting indexes;
- retention policy changes and cleanup jobs;
- least-privilege grants/RLS/function ownership for new server-only paths;
- conflict and reconciliation evidence fields where current snapshots are insufficient.

Every migration must follow least privilege, preserve RLS and keep queue claims in short transactions. External provider calls must run after database claim/commit, never while holding business-row locks.

## Work possible without database changes

- IndexedDB schema, encryption envelope, namespace lock and local migrations;
- migrate existing sale/customer/cart drafts from plaintext to encrypted drafts;
- read-only catalog/settings/customer/order/invoice caches using existing APIs;
- static shell/media service-worker strategy;
- connectivity/sync status UI and disabled command classifications;
- local command model, simulator and contract tests without dispatch;
- logout retain/purge workflow at local scope;
- synthetic offline/upgrade/quota/security test harness.

This work must not enable official offline completion before server gates pass.

## Core pilot acceptance gates

- same command/same payload replay creates exactly one order/invoice/inventory effect;
- same command/different payload is a fingerprint conflict;
- effective employee attribution is identical across command, order, inventory, audit and response;
- branch/tenant/device/lease mismatch fails before business writes;
- unknown network result is recovered by receipt lookup;
- official numbers originate only from database sequence logic;
- insufficient stock/changed price/tax/customer conflicts are deterministic;
- cost snapshot/audit/WhatsApp effect IDs do not duplicate under replay;
- claim expiry enters reconciliation/manual hold safely;
- delayed offline commands remain protected for the approved retention window.

## Core decision

Build the local data foundation independently, but gate `order.create` dispatch on Core V2 authority completion. Do not create a second legacy offline execution engine. Status/customer commands should join a common typed command ledger only after their own product conflict policies are approved.

