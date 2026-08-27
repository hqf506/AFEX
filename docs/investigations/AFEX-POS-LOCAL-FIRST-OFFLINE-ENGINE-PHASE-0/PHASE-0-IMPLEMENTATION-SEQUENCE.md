# Phase 0 Implementation Sequence

## Corrected sequence and arithmetic

| Phase | Scope | Engineer-weeks |
|---|---|---:|
| 0 | product/security/authority/policy freeze | 0.5–1.0 |
| 1 | encrypted storage, namespace, schema/integrity, logout retain/purge | 1.5–2.5 |
| 2 | read datasets, media and application shell | 1.5–2.5 |
| 3 | durable command outbox shadow, zero dispatch | 1.0–2.0 |
| 4 | Core V2 effective actor authority and limited order pilot | 2.0–4.0 |
| 5 | device/support controls and observability | 1.0–2.0 |
| 6 | one additional command type at a time | 3.5–5.0 |
| **Phases 0–6 total** |  | **11–19** |
| conditional native hardening | Capacitor Keychain/Keystore/device qualification | +2–3 |
| **Total with native hardening** |  | **13–22** |

Small-team calendar expectation: approximately **3–6 months**, depending on Core/DB reviews, security decisions and device qualification.

## Phase dependencies and gates

### Phase 0

Output: this decision package. Gate: required human decisions/risks signed. No implementation.

### Phase 1

Depends on Phase 0 security/retention/logout approvals. Delivers encrypted IndexedDB, namespace isolation, key abstraction, schema/integrity/quota, plaintext importer/quarantine and complete lock/retain/purge.

Gate before any persistent PII:

- Primary Auth alone cannot decrypt;
- exact namespace isolation and AAD tamper tests;
- checked/unchecked/crash-safe purge;
- unrelated namespaces byte-identical;
- no new plaintext sensitive writes;
- rollback reads/quarantines the new schema.

### Phase 2

Depends on Phase 1. Delivers approved bounded read snapshots, stale/as-of UI, shell and media cache. Complete snapshots only until deterministic delta authority exists.

Gate:

- interrupted refresh preserves last complete version;
- retention/quota/midnight/device matrix;
- no authenticated JSON in generic Cache Storage;
- no PII before POS unlock.

### Phase 3

Depends on Phase 1 and command schema approval. Delivers immutable outbox/events/receipts/conflicts, dependency graph, local leases, backoff/status UI and simulation.

Gate: dispatch count exactly zero; multi-tab/crash/upgrade/quota tests; stable fingerprint and evidence.

### Phase 4

Depends on all Core prerequisite rows closed and human financial limits approved. Delivers effective actor/device lease authority, receipt API, retention, structured conflicts and server effect outbox, then a cash-only `order.create` cohort.

Gate:

- one command -> one order/invoice/inventory/effect identity;
- unknown-result replay and reconciliation;
- correct employee attribution;
- official DB numbering;
- no provider/card assumption;
- kill-switch/runbook/monitoring ready.

### Phase 5

Depends on Phase 4 operational evidence. Delivers device inventory/revocation, support-safe diagnostics, command/conflict operations, cleanup and rollout observability. The logout purge itself is already complete in Phase 1.

### Phase 6

Adds one reviewed command type at a time. Proposed priority: status transition, then customer create only if still needed. Customer update/payment/refund require their own conflict/finance contracts. Direct inventory/provider replay remains prohibited.

### Conditional native hardening

Begins only after Mode B trigger/approval. It does not alter server idempotency requirements.

## Future application files likely affected

No files are modified in Phase 0. Future scope remains the approved investigation inventory, including auth/POS shell, employee session, current local draft/cache modules, customer/items/checkout routes, settings/logout, service worker/manifest and Core/API authorization paths.

Proposed new module families remain:

```text
lib/offline/{schema,db,namespace,key-manager,integrity,quota,drafts,commands,leases,sync-engine,conflicts,purge,diagnostics}
components/{pos-offline-status,pos-sync-center,pos-logout-retention-dialog}
app/api/pos/offline/{bootstrap,lease}
app/api/pos/sync/{commands,receipts}
```

These names are planning references, not implementation authorization.

## Stop conditions

- unresolved required human decision;
- any cross-scope or plaintext leak;
- inability to preserve encrypted evidence across rollback;
- Core effective actor/receipt/effect-outbox gate incomplete;
- runtime performance/compatibility gate fails;
- change would require an unapproved SQL/authority expansion.

