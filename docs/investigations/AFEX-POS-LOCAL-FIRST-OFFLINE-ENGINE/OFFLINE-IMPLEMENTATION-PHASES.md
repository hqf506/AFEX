# Offline Implementation Phases

## Planning assumptions

- Estimates are engineering ranges, not delivery commitments.
- Small team assumption: one senior frontend/PWA engineer, one backend/PostgreSQL engineer when server work begins, shared QA/security review.
- Total expected effort: 10–16 engineer-weeks; approximately 3–5 calendar months with reviews and device qualification.
- Every phase is independently gated. A failed gate prevents enabling the next business capability.

## Phase 0 — product and authority decisions

**Effort:** 3–5 days. **Complexity:** high decision density.

Decide:

- approved offline commands/payment methods/value/count limits;
- actor lease duration and device-loss policy;
- customer/invoice retention and pre-PIN sealing strength;
- PWA application-layer versus native hardware-backed key protection;
- stale price/tax/inventory conflict UX;
- delayed command/idempotency retention period;
- unsynced-command behavior during checked logout purge.

Gate: signed product/security/finance authority matrix with no ambiguous command.

Rollback: documentation-only; no runtime change.

## Phase 1 — local storage and security foundation

**Effort:** 1.5–2.5 weeks. **Database changes:** no. **User capability:** encrypted drafts only.

Implement versioned IndexedDB, namespaces, AES-GCM envelope, wrapped key abstraction, lock/unlock state, integrity validation, quota guard, local migrations and multi-tab coordination. Migrate existing customer/cart/checkout draft persistence away from `localStorage` with a one-time fail-safe importer that never imports an ambiguous namespace.

Gate:

- tenant/branch/account isolation and cryptographic tamper tests;
- browser crash/local migration/rollback tests;
- no plaintext PII/outbox in web storage/logs;
- mobile/tablet/desktop and iOS/Android WebView persistence matrix;
- logout locks data even before Phase 5 purge UI.

Rollback: feature flag reads old drafts only if they contain no new-schema command; retain/quarantine new encrypted DB for forward recovery.

## Phase 2 — read-only datasets and application shell

**Effort:** 1.5–2.5 weeks. **Database changes:** preferably no; delta/version APIs may improve scope. **User capability:** offline catalog/customer/recent read views after unlock.

Build dataset manifests, catalog/settings/customer/recent order/invoice caches, media LRU, shell precache/offline fallback and `as of` freshness UX. Do not generic-cache authenticated API responses in Cache Storage.

Gate:

- cold/offline route matrix after valid unlock;
- primary-only cache denial;
- full refresh interruption leaves previous complete version usable;
- 10k-record synthetic search/performance budget;
- quota/media eviction preserves operational stores;
- server 48-hour cutoff semantics retained.

Rollback: disable durable read cache and use online APIs; preserve encrypted drafts.

## Phase 3 — durable command outbox in shadow mode

**Effort:** 1–2 weeks. **Database changes:** no for local shadow. **User capability:** none enabled beyond current online behavior.

Create immutable command/event/receipt/conflict stores, secure IDs, dependency graph, local leases, retry classifier, status UI and a simulator. Mirror eligible online `order.create` envelopes into shadow records without dispatching them.

Gate:

- crash/multi-tab/service-worker lease tests;
- immutable fingerprint and dependency tests;
- zero dispatch in shadow mode;
- complete state UI and support-safe diagnostics;
- application rollback preserves/quarantines shadow records.

Rollback: disable shadow capture; delete only acknowledged shadow records after review.

## Phase 4 — Core V2 offline order pilot

**Effort:** 2–4 weeks. **Database/Core changes:** yes. **User capability:** limited offline `order.create` under approved policy.

Extend Core authority for effective employee/device/offline lease, durable receipt lookup, retention, conflict classifications and external-effect outbox. Enable for one tenant/branch/device cohort and approved payment methods only.

Gate:

- full idempotency/unknown-result/reconciliation suite;
- official DB numbering and inventory atomicity;
- employee attribution across command/order/inventory/audit;
- no duplicate order/invoice/cost/WhatsApp effect;
- offline lease/value/time limits;
- 30-minute and extended soak with kill/reconnect scenarios;
- manual reconciliation runbook.

Rollback: server feature flag stops new offline enqueue/dispatch while continuing receipt/reconciliation for already accepted commands; never delete pending device evidence or roll back forward migrations automatically.

## Phase 5 — logout retention, device management and operational controls

**Effort:** 1–2 weeks. **Database changes:** device/revocation registry likely required for strong mode.

Add exact checkbox contract, scoped purge/tombstone/resume, device cache inventory/revocation, support-safe diagnostics, connectivity/queue badges and administrative visibility without PII leakage.

Gate:

- checked/unchecked/crash/two-tab/logout-failure matrix;
- exact namespace zero-residue proof;
- remote device revocation observed at next connection;
- locked retained cache reveals no PII.

Rollback: hide purge/device UI only if existing locked namespaces remain recoverable; never weaken lock state.

## Phase 6 — additional command types

**Effort:** 3–5 weeks depending on scope. **Database/Core changes:** yes.

Add one command type at a time:

1. `order.status.transition` with expected-version CAS and server notification outbox;
2. customer creation only if independent offline creation is still needed;
3. customer update only after field/version conflict UX;
4. financial/provider commands only under a separate finance/security design.

Gate per type: stable command schema, actor authority, idempotent server result, conflict matrix, external-effect safety, rollback/reconciliation and device qualification.

## Phase 7 — native hardening (conditional)

**Effort:** 2–3 weeks plus store release QA. **Database changes:** device registration/revocation likely.

If risk acceptance requires stronger protection, add Capacitor Keychain/Keystore, optional SQLite/OPFS bridge, OS network/background task integration and managed-device identity. Keep the same server command contracts.

## Existing files likely to change later

Frontend/session/storage:

- `components/auth-state-provider.tsx`
- `components/pos-shell-layout.tsx`
- `components/pos-shell/pos-responsive-shell.tsx`
- `lib/pos-employee-session.ts`
- `lib/pos-offline-draft.ts` (replace/deprecate)
- `lib/pos-checkout-identity.ts`
- `lib/client-resource-cache.ts`
- `lib/invoices/customer.ts`
- `lib/invoices/sale-draft.ts`
- `lib/invoices/sale-navigation.ts`
- `lib/invoices/sale-reset.ts`
- `lib/invoices/catalog.ts`
- `hooks/use-invoice-checkout.ts`
- `components/invoice-customer-step.tsx`
- `components/invoice-items-step.tsx`
- POS route pages listed in the study scope
- `app/pos/settings/page.tsx`
- `public/sw.js`
- `app/manifest.ts`
- `capacitor.config.ts` only if native hardening is approved

Server/Core:

- `app/api/orders/route.ts`
- `app/api/customers/route.ts`
- `app/api/pos/orders/[id]/status/route.ts`
- `app/api/pos/identify-employee-by-pin/route.ts`
- `lib/authorization-context.ts`
- `lib/pos-actor-session-server.ts`
- `lib/server/core-v2/atomic-order.ts`
- `lib/server/core-v2/contracts.ts`
- `lib/server/orders/order-status-transition.ts`
- `lib/server/orders/order-status-whatsapp.ts`
- `lib/audit-log.ts`

## Proposed new files/modules

```text
lib/offline/schema.ts
lib/offline/db.ts
lib/offline/namespace.ts
lib/offline/key-manager.ts
lib/offline/crypto-worker.ts
lib/offline/integrity.ts
lib/offline/migrations/*
lib/offline/datasets.ts
lib/offline/media-cache.ts
lib/offline/quota.ts
lib/offline/drafts.ts
lib/offline/commands.ts
lib/offline/dependency-graph.ts
lib/offline/leases.ts
lib/offline/sync-engine.ts
lib/offline/conflicts.ts
lib/offline/purge.ts
lib/offline/diagnostics.ts
components/pos-offline-status.tsx
components/pos-sync-center.tsx
components/pos-logout-retention-dialog.tsx
app/api/pos/offline/bootstrap/route.ts
app/api/pos/offline/lease/route.ts
app/api/pos/sync/commands/route.ts
app/api/pos/sync/receipts/route.ts
```

Names are proposals, not implementation commitments.

## Release/rollback rules common to all phases

- Feature flags by capability, tenant, branch and device cohort.
- Read cache, draft store and each command type have separate kill switches.
- Turning off dispatch never discards pending commands; receipt lookup remains available.
- Application rollback compatibility is tested against the newest local schema.
- Forward database migrations are not automatically rolled back.
- A release cannot advance if it creates data the prior supported client would silently delete.
- Production enablement requires human approval after Preview/device/runtime qualification.

