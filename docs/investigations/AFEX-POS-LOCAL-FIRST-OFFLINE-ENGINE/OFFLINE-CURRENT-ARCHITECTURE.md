# AFEX POS Local-First — Current Architecture

## Attested input

- Repository: `C:\Users\NSC-LUA\Desktop\leather-fix-erp-pos-responsive`
- Branch: `codex/pos-responsive-redesign`
- HEAD: `37331390ec00bee507f88701365bfebb944db675`
- Upstream ahead/behind at study start: `0/0`
- Study mode: local repository inspection only
- Runtime, database, SQL, Production, network, business writes: `0`

## Executive finding

The application is an online POS with three limited client-persistence mechanisms, not a local-first system:

1. sale/customer/checkout drafts in plaintext `localStorage`;
2. a plaintext invoice-draft retry queue in `localStorage`;
3. short-lived in-memory fetch caches and `sessionStorage` UI/session snapshots.

There is no IndexedDB/OPFS operational store, durable multi-tab sync lease, cache schema migration system, cryptographic namespace lock, production caching service worker, or complete server command ledger for every requested offline mutation. The present `public/sw.js` deletes caches and intentionally performs no fetch caching. Capacitor loads the remotely hosted application and does not supply a local database or secure offline transaction plugin.

## Authority lifecycle

### Primary authentication

- `components/auth-state-provider.tsx` resolves the browser Supabase session and caches only a reduced auth profile in `sessionStorage`.
- `lib/verified-auth-context.ts` treats `getSession()` as transport only and verifies the exact token through both `getClaims(accessToken)` and `getUser(accessToken)`.
- `lib/authorization-context.ts` derives tenant, branch, role and capabilities server-side. Browser-provided tenant or branch identifiers are not an authority source.

### POS actor authentication

- `/api/pos/identify-employee-by-pin` validates the organization session, branch, PIN shape/rate limit, and employee scope before issuing a POS actor session.
- `lib/pos-actor-session-server.ts` stores a random-token digest server-side and sends only a Secure, HttpOnly, SameSite=Strict cookie (`afex_pos_actor`).
- `lib/authorization-context.ts` fails closed when a supplied POS actor token is invalid or revoked; it does not silently fall back to the more privileged organization actor.
- `lib/pos-employee-session.ts` keeps a UI copy of the selected employee in `sessionStorage`. This copy is not sufficient API authority; server routes use the validated actor cookie.

### Logout

- `app/pos/settings/page.tsx` and `components/pos-shell/pos-responsive-shell.tsx` use confirmation flows that revoke the POS actor session and locally sign out Supabase.
- The current flow has no cache-retention checkbox.
- It intentionally leaves an incomplete sale draft in `localStorage`, clears in-memory catalog cache, and removes only selected session snapshots.
- There is no account/tenant/branch scoped cryptographic purge contract.

## Route data flows

| Route | Current reads | Current writes/persistence | Current offline posture |
|---|---|---|---|
| `/pos` | categories and `/api/orders` recent 48-hour summary | in-memory resource cache | shell may render, authoritative data requires network |
| `/pos/sale/customer` | `/api/customers`, customer profile/activity, categories | selected customer in plaintext `localStorage`; customer POST online | draft selection survives reload; search/create are online |
| `/pos/sale/items` | `/api/invoice/catalog`, categories/settings | cart in plaintext `localStorage`; in-memory catalog cache | cart survives reload; catalog is not durable |
| `/pos/sale/checkout` | `/api/pos/runtime` for branch discounts/VAT | checkout draft in plaintext `localStorage`; order POST; offline invoice draft fallback | totals can render from draft; official completion is online |
| `/pos/sale/success` | success snapshot, thermal settings, PDF/WhatsApp routes | snapshot in `sessionStorage`; print/WhatsApp external effects | only a previously confirmed result can be displayed |
| `/pos/order-status` | `/api/orders?mode=full/details` | PATCH status; audit and WhatsApp follow-up | online-only mutation and refresh |
| `/pos/order-history` | `/api/orders`, details/status history | none | online read-only |
| `/pos/invoices` | `/api/orders`, details/payment snapshot | none | online read-only |
| `/pos/settings` | active employee UI snapshot | theme; logout/revocation | logout itself requires online revocation for authoritative completion |
| `/pos/offline-drafts` | plaintext local draft queue | retry/delete; `/api/orders`; cost-snapshot POST | limited queue exists but does not meet durable engine contract |

## Server read authority

- Catalog route scopes categories/items by trusted tenant and branch overrides/inventory by trusted branch, then sends `Cache-Control: no-store`.
- Customer search is tenant-wide by the current explicit product contract; branch is recorded for creation but is not a browser-selectable search bypass.
- Orders are filtered by trusted tenant and, when required, trusted branch. The 48-hour window is computed on the server and uses a strict `created_at > cutoff` boundary.
- Service-role clients are server-only. No service-role credential may enter an offline client store.

## Current checkout and replay path

1. `hooks/use-invoice-checkout.ts` creates a stable request identity in `sessionStorage` using `lib/pos-checkout-identity.ts`.
2. If `navigator.onLine === false`, it serializes customer PII, items, payment snapshot, note and employee into `localStorage` through `lib/pos-offline-draft.ts`.
3. `components/pos-shell-layout.tsx` retries drafts at startup and on `online`.
4. The retry loop is serial in one tab, but its lock is a module boolean only. Multiple tabs/processes can race.
5. A successful `/api/orders` response deletes the draft; a second non-atomic cost-snapshot request may run after order creation.
6. The queue has only attempt count and timestamp. It has no durable state machine, claim lease, conflict record, response receipt, tombstone, schema version, checksum, encryption, or cross-context arbitration.

## Server atomicity and numbering

- Legacy order creation calls `create_invoice_with_items_safe` and has a unique `orders.client_idempotency_key` path.
- Core V2, when enabled, acquires/claims/executes `order.create`, persists fingerprints, claims, response snapshots, business links, audit and reconciliation states.
- Official order numbers are allocated by the database's branch/month sequence. Invoice numbers are derived from the authoritative order number.
- Inventory effects and official financial snapshots are server-authoritative.
- Therefore an offline device may issue only a temporary local reference. It must never manufacture an official order/invoice number or claim authoritative inventory success.

## Actor-attribution gap

The API validates the effective POS employee and records `created_by_employee_id`, but the Core V2 command acquisition currently receives `auth.user.id` as `actorId`. This is the primary organization subject, not necessarily the effective employee. A durable offline command must carry a signed/validated POS actor lease and the server command ledger must preserve both organization subject and effective employee. Client-supplied employee IDs are evidence only and must never become authority.

## Status, audit and external-effect gaps

- Status transitions are a compare-and-set chain (`in_progress -> ready -> closed`) and return stale/conflict on mismatched state.
- Repeating an already-applied transition is idempotent at the transition function, but notification delivery is not backed by a durable external-effect outbox.
- WhatsApp is attempted only after a persisted transition; creation PDFs/WhatsApp and cost snapshots are post-commit tasks. A crash can leave ambiguous delivery or missing follow-up evidence.
- `writeAuditLog` is best-effort and does not form an atomic transaction with every business write.
- The POS operations timeline is currently projected primarily from orders/invoices, not a complete append-only employee activity ledger.

## PWA and native shells

- `app/manifest.ts` declares a standalone POS manifest.
- `public/sw.js` calls `skipWaiting`, deletes all caches on activation, and intentionally has no fetch handler.
- No tracked production service-worker registration or Workbox/Dexie/idb library exists.
- `capacitor.config.ts` points native shells to a remote URL. iOS/Android wrappers therefore inherit web connectivity and storage behavior; they are not packaged with an offline operational dataset.

## Current architecture conclusion

Read caching and encrypted draft storage can be introduced incrementally without business-table changes, but safe offline command replay cannot be generalized from the existing draft queue. Official checkout, status transitions, customer writes and external effects require explicit server idempotency/authority contracts. The recommended design is phased, with Core V2 extended rather than bypassed.

