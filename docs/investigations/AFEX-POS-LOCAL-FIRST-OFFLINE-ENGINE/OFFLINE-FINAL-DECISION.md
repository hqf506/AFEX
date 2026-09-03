# Offline Final Decision

## Decision token

`AFEX_POS_LOCAL_FIRST_OFFLINE_ENGINE_INVESTIGATION_COMPLETE_READY_FOR_HUMAN_REVIEW`

## Why this is not a full implementation approval

The current repository supports a safe phased plan, but it does not support unrestricted offline business replay today. The present plaintext local draft queue is not an acceptable long-term transaction engine. This decision approves human review of the architecture study only. It authorizes no code, SQL, migration, deployment, Production access or business write.

## Capability decision

### Can become offline without database changes

- versioned encrypted sale/customer/cart/checkout drafts;
- local application shell and approved static assets;
- tenant/branch scoped catalog, category, price and settings snapshots;
- bounded customer search/profile cache after POS unlock;
- bounded recent order/invoice/status-history read cache with explicit `as of` timestamp;
- media cache with quota/LRU controls;
- local command data model, shadow capture, connectivity/status UI and diagnostics;
- exact logout retain/purge UI and local namespace deletion;
- confirmed receipt display and explicit local print from a previously confirmed snapshot.

These capabilities still require security/product approval for encryption strength, retention and pre-PIN sealed ingestion.

### Must remain online now

- official order/invoice creation and official numbering;
- authoritative inventory validation/movement;
- standalone customer creation/update;
- order status transitions;
- financial/provider operations;
- WhatsApp and other external delivery;
- authoritative audit completion, reconciliation and manual-hold resolution;
- fresh history/search beyond the last confirmed cache.

### Must be blocked offline

- any command without a typed server idempotency/replay contract;
- any command after actor lease expiry, clock uncertainty, namespace mismatch, schema/integrity failure or quota hard stop;
- direct inventory, cost-snapshot, audit, provider or service-role operations;
- creation of official order/invoice numbers on device;
- automatic acceptance of changed price, tax, discount, inventory or customer identity;
- local PIN verifier storage or PIN-derived encryption;
- browser-supplied tenant/branch/employee authority;
- automatic provider/WhatsApp replay.

## Architectural prerequisites for offline order creation

1. Core V2 enabled and extended for a versioned POS offline command envelope.
2. Trusted effective POS actor plus primary subject/device/offline-lease provenance in command authority.
3. Durable receipt lookup and retention covering approved maximum offline duration.
4. Structured conflict results for price, VAT, discount, inventory and customer identity.
5. Server-owned idempotent external-effect outbox for cost/audit/notification follow-ups.
6. Durable IndexedDB outbox with immutable payload, local leases, dependencies and terminal receipts.
7. Human-approved financial/payment/value/time limits and reconciliation runbook.

## Recommended implementation form

Proceed incrementally, not as a broad rewrite:

1. local storage/security foundation;
2. read-only datasets and shell;
3. outbox shadow mode;
4. Core V2 `order.create` pilot;
5. logout/device operations;
6. one additional command type at a time;
7. native secure-store hardening only if required by risk acceptance.

Do not build a second legacy offline order engine beside Core V2.

## Human decisions required before Phase 1

- PWA app-layer encryption versus native hardware-backed key protection;
- customer/invoice retention and image quota budgets;
- exact pre-PIN sealed-ingestion approach;
- offline actor lease duration and revocation exposure;
- offline payment methods/value/count limits;
- purge behavior with unresolved commands;
- stale-price/inventory conflict customer promise;
- maximum delayed sync and Core retention.

## Safety accounting

- Application files modified: `0`
- Historical `runtime-integration/R8N-*` files modified: `0`
- SQL/migrations created or executed: `0`
- Database/Production/network/business writes: `0`
- Service worker/runtime software implemented: `0`
- Packages installed: `0`
- Git stage/commit/push/merge/deployment: `0`
- New content: this independent documentation study package only

## Final conclusion

AFEX can safely become local-first in stages. Read caching and encrypted drafts are immediately architecturally feasible. Offline financial replay is feasible only after explicit Core V2/authority/outbox prerequisites. Until those gates pass, the application must remain honest: offline work is a local pending command, not a completed server order or invoice.

