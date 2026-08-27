# Phase 2 Authority Gate

Date: 2026-08-25
Classification: **B — PERSISTENT_UNWRAP_AUTHORITY_REQUIRED**

## Determination

The existing trusted server boundary can verify Primary Auth, tenant, branch and the current POS actor. It cannot issue or re-issue a non-extractable, device-bound persistent unwrap authority for retained ciphertext without a new reviewed server/device authority.

The existing read-only `GET /api/pos/offline-context` derives account, tenant and branch server-side and reports whether an active POS actor exists. The endpoint deliberately returns no key, wrapping secret, device credential or durable unwrap lease. Phase 1 also keeps `persistentUnwrapAuthority=false`; its test-only synthetic key material is rejected in production.

An active POS actor cookie is an application authorization signal, not a cryptographic device authority. Treating it as a browser boolean, storing a DEK in browser storage, deriving a key from the PIN, or staging plaintext before PIN would violate the approved boundary.

## Enforced consequence

- Persistent catalog/customer/order/invoice/event/settings/media ingestion: **disabled**.
- Pre-PIN network bootstrap: **0 requests**.
- Pre-PIN plaintext storage: **0 records**.
- Encrypted dataset reads in production: **locked**.
- Route adapters and authenticated API extensions: **not added**.
- Business mutation dispatch: **false**.
- SQL, migration, device registry and permanent privilege changes: **not created**.

## Safe subset authorized in this phase

The phase implements only the versioned IndexedDB schema extension, encrypted atomic repository contract qualified with synthetic non-production authority, fail-safe feature flags, exact retention constants, writer leases, freshness/window helpers, exact-scope purge extension, and a static lock-only application shell. The shell contains no PII or financial data and caches no authenticated JSON.

## Authority required for future enablement

A later human-reviewed design must provide a server/device-bound, revocable, namespace-specific unwrap envelope whose issuance requires verified Primary Auth and valid POS actor authority, whose retained browser representation does not reveal the DEK, and whose loss/revocation fails closed. That design may require server/device registry or database authority and is outside Phase 2. No implementation is proposed here as approved SQL or deployment work.
