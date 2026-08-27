# Phase 4 Offline Employee PIN Selection Authority

## Human-approved model

`MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE`, `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY`, and `OPPORTUNISTIC_NOT_MANDATORY` remain approved. Offline continuity can exist only after a verified Online establishment-account login and trusted bootstrap. A logged-out state can never bootstrap or resume Offline use.

The employee PIN is a local selector for one pre-enrolled POS employee. It is not account authentication, Supabase login, tenant/branch/device authority, persistent unwrap, provider authentication, or synchronization authority. Successful selection changes only employee attribution, permission selection, local lock/switch state, and employee-specific command generation. It cannot change `primaryAuthenticatedUserId`, tenant, branch, device, bootstrap, or namespace.

## Exact verifier contract

| Field | Frozen value |
| --- | --- |
| Algorithm | `PBKDF2-HMAC-SHA256` |
| Iterations | `600000` |
| Salt | unique random 32 bytes per enrollment |
| Derived verifier | 32 bytes |
| Memory | `NOT_APPLICABLE_TO_PBKDF2` |
| Parallelism | `NOT_APPLICABLE_TO_PBKDF2` |
| Verifier version | `1` |

The verifier is bound to account, tenant, branch, device, employee, enrollment generation, credential generation, and namespace generation. Plaintext PIN, reversible PIN, unsalted SHA-256, server credential reuse, and any DEK derivation/unwrap are rejected.

## Bootstrap and roster

- Initial account/tenant/branch bootstrap is Online only and uses the verified Auth session and active POS actor session.
- Employee enrollment and PIN replacement are trusted Online provisioning actions.
- A managed branch device may have at most 25 active enrolled employees.
- The initial Pilot allowlist is exactly `ARRAY['order.create']::text[]`; all seven deferred command types are rejected.
- The roster contains selector-verifier metadata and generation bindings, never a PIN or key material.
- PIN selection cannot add an employee, expand permissions, or change generations.

## Offline continuity

After bootstrap, Internet loss does not log the establishment account out and no age threshold disables valid local operation. Restart/reboot without explicit logout requires employee PIN re-entry but not Internet. Pending commands and inventory commitments reconstruct deterministically from encrypted durable state before a new quantity change is allowed.

Five failed attempts lock that employee selector. Retry delays, aggregate device lock, integrity chaining, and restart recovery are bounded client-runtime responsibilities. Missing, corrupt, or rolled-back protected attempt state fails closed. These controls do not make a four-digit PIN a data-encryption boundary.

## Explicit establishment logout

Explicit logout immediately disables Offline PIN entry, employee switching, reads, and order creation, and clears usable account/session authority. Pending/syncing commands remain encrypted and inaccessible; they are not deleted, cancelled, or reassigned. Only successful Online authentication by the same establishment account may reactivate the stable account/device namespace. Cross-account, cross-tenant, and cross-branch recovery fail closed.

## Synchronization

Synchronization requires refreshed Online Auth and fresh server/database validation. The uploader and original employee remain separate, immutable identities. A newly learned device/employee/permission/bootstrap revocation blocks future Offline authority. PIN is never transmitted to a payment/provider path and cannot authorize effects.

## Inventory and payment invariants

`localAvailable=max(0,lastConfirmedBranchStock-pendingAndSyncingLocalCommitments)`. Zero availability and positive-but-insufficient availability retain their two approved distinct Arabic messages. All eight payment representations remain distinct; none obtains provider-confirmed status from local employee selection.

## Implementation state

All transactional/sensitive flags and all business callers remain disabled. The SQL files are inactive review candidates only. No SQL, database, Production, business, provider, dispatch, replay, or role activation occurred.
