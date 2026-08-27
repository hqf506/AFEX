# Phase 4 Account and POS Employee Authority Contract

## Identity separation

The current Online chain remains `verified establishment Auth → trusted tenant/branch → server PIN verification → POS actor session`. The approved Offline chain is:

`verified Online establishment login → account/tenant/branch bootstrap → active managed device → pre-enrolled employee PIN selection → immutable account+employee command binding → fresh Online synchronization validation`.

The primary account and actual POS employee are distinct mandatory identities. PIN selects the employee only. It cannot authenticate the account, create an Auth/POS session, change account/tenant/branch/device, unwrap a DEK, or grant new permissions.

## Bootstrap and issuance

1. Existing verified Auth establishes the primary account.
2. Trusted server authority derives tenant and allowed branch.
3. An active POS actor session proves the Online enrollment ceremony is operated by an authorized employee.
4. The private provisioning wave validates and binds the active managed device, device-bound storage envelope, employee roster (maximum 25), exact Pilot allowlist, and trusted inventory snapshot.
5. The resulting bootstrap has no time expiry merely because Internet is unavailable. It carries account/scope/device/bootstrap/namespace generations and no secret key material.

The Pilot permission is exactly `ARRAY['order.create']::text[]`. The seven deferred commands are database-rejected.

## Employee selection

Every employee selector uses the frozen structured PBKDF2 verifier. Successful local selection activates only the already enrolled employee ID and permissions. It does not issue authority. Switch clears outgoing employee plaintext/presentation/command handles before incoming verification; queued commands remain bound to their original employee.

Restart without explicit logout starts with no selected employee. The retained account-bound authority may reopen Offline, but PIN entry is required again. Missing, corrupt, revoked, scope-mismatched, or locally locked selector state fails closed.

## Explicit logout and recovery

Explicit establishment logout clears usable account and employee authority and disables Offline PIN entry, switching, reads, and order creation. PIN alone can never restore access. Pending/syncing commands remain encrypted, inaccessible, and immutable; they are not silently deleted, cancelled, dispatched, or reassigned. Recovery requires a new Online login by the same primary account with identical tenant/branch/device namespace. Cross-account/tenant/branch recovery is denied.

## Immutable command attribution

Each command binds stable bootstrap ID/generation, primary account, tenant, branch, device/generation, employee enrollment ID/generations, namespace/key envelope, inventory snapshot/frontier, command type, local identity/sequence, hashes, payment method/amount/currency, and dependencies. Acquisition revalidates these values and the fresh uploader Auth/POS actor separately. Replay-time identity never replaces origin identity.

## Enforcement boundary

- Auth establishes account authority Online.
- Device-bound encryption protects Offline business data independently of PIN.
- PIN verifier selects a pre-enrolled employee.
- Database/server authority validates synchronization and Core acquisition.
- Last-sync age is visibility only and never an authority timer.
- Unknown remote revocation may remain unknown during an outage; when learned it blocks future Offline authority before sync.

No browser, `PUBLIC`, `anon`, `authenticated`, or `service_role` gets direct private SQL execution. Provisioning/bootstrap and acquisition/resolver/receipt use separate NOLOGIN roles. Their later trusted-server `SET LOCAL ROLE` or equivalent activation path is not granted or enabled by this package.

## Status

Review-only SQL and contracts are complete for independent review. Business callers, sensitive flags, dispatch, replay, interception, providers, and Production remain unchanged and disabled.
