# Phase 2 Risk and Rollback

## Primary blocker

`PERSISTENT_UNWRAP_AUTHORITY_REQUIRED`: enabling persistent PII or financial snapshots without a server/device-bound unwrap authority would make Primary Auth or browser state sufficient to decrypt operational data. All sensitive flags therefore remain false.

## Risks and controls

| Risk | Control | Residual status |
| --- | --- | --- |
| Browser runtime compromise in Mode A | No Mode A authority was invented; persistent unwrap remains false. | Future design required. |
| Partial download replaces valid cache | Incomplete manifest is invisible; swap requires exact page/count/hash closure. | Synthetic repository PASS. |
| Cross-namespace data exposure | Exact key authority plus compound namespace indexes and AES-GCM AAD. | Synthetic repository PASS. |
| Duplicate writers | One manifest lease; live conflict denied; stale lease recoverable. | PASS. |
| Logout purge leaves dataset residue | Phase 1 exact-scope transaction now includes every Phase 2 store and manifest. | PASS. |
| Service Worker destroys unrelated caches | Prefix ownership and compatible-cache allowlist. | PASS. |
| Authenticated JSON enters Cache Storage | `/api/` and non-GET bypass; functional cache inspection. | PASS. |
| Worker activates during failed migration | Registration/activation follows successful IndexedDB initialization. | PASS by source and worker tests. |
| Old application opens database v2 | Old v1 opener receives `VersionError` and fails closed without deleting data. | A v2-aware rollback build is required before rollout approval. |
| Static shell mistaken for operational data | Explicit Arabic locked message; no PII, counts, totals or records. | PASS. |
| Capacitor remote WebView cold offline | Not tested. | UNPROVEN; no native claim. |
| Disabled feature accidentally treated as complete | Separate flags default false and tests assert no route integration. | PASS. |

## Rollback procedure before any future rollout

1. Disable every Phase 2 flag; online API behavior remains the only data path.
2. Retain the v2-aware application build so IndexedDB opens safely and locks local visibility.
3. Do not deploy a pre-v2 reader as rollback unless it is first updated to recognize/quarantine database version 2.
4. Keep `afex-pos-shell-v0` through the compatibility window; the worker deletes only explicitly obsolete AFEX caches.
5. Do not delete Phase 1 drafts, quarantine, tombstones or evidence as a rollback side effect.

No rollout or rollback was performed in this phase.
