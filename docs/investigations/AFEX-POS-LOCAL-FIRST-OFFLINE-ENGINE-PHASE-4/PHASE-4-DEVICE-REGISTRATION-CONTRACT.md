# Phase 4 Managed Device Registration Contract

## Authority

Registration is a trusted Online provisioning action after the establishment account has authenticated through the existing verified Auth path. It binds the primary account, tenant, allowed branch, device identity, mode, proof/wrap public keys, and generations. It never accepts tenant/branch authority from an untrusted browser claim.

The inactive SQL candidate enforces one active Offline device per tenant branch and provides versioned private register, activate, replace, revoke/lost/local-lock, and current-authority functions. The functions are owned by the private authority owner and executable only by a separate NOLOGIN provisioning role whose future trusted-server activation mechanism is intentionally not granted here.

## Stored metadata

Allowed server metadata: device ID, tenant/branch/account binding, mode, status, proof and wrap public JWKs, their SHA-256 identities, algorithms, device/key/revocation/local-lock generations, activation/revocation/replacement timestamps, and non-sensitive audit hashes.

Forbidden: private device key, plaintext DEK, plaintext/reversible PIN, PIN-derived DEK, PIN-derived wrap key, Supabase service credential, Auth cookie, provider token, CVV, or card PIN.

`ECDSA-P256-SHA256`, `RSA-OAEP-3072-SHA256`, and `AES-256-GCM` are metadata classifications. The exact client key/ciphertext representation remains a later disabled client-runtime contract.

## Employee roster

- Employee PIN selects a pre-enrolled employee only; it does not establish device authority.
- Enrollment is Online provisioning under an active account bootstrap.
- Maximum active roster: 25 employees per managed branch device.
- Every selector verifier uses PBKDF2-HMAC-SHA256, 600000 iterations, unique 32-byte salt, and 32-byte verifier.
- The initial command allowlist is exactly `order.create`.
- PIN rotation replaces the selector verifier and generations but never rewraps a DEK.

## Restart and logout

Restart without explicit account logout retains the account-bound device authority but starts with no selected employee; PIN re-entry is required and Internet is not. Explicit establishment logout disables Offline PIN entry, employee switching, reads, and order creation. It retains pending/syncing commands encrypted and inaccessible, and requires same-account Online authentication for recovery. PIN alone cannot reactivate a logged-out namespace.

## Lifecycle and stop conditions

Registration/activation/replacement take deterministic locks and use idempotent operation identities. Scope, account, key schema, generation, active-device uniqueness, or replay-hash mismatch fails closed. Learned device loss/revocation prevents future Offline authority. No age or last-sync threshold revokes authority by itself.

Emergency disablement revokes the exact provisioning function EXECUTE grants without deleting audit or pending command evidence. No browser, `PUBLIC`, `anon`, `authenticated`, `service_role`, or acquisition role obtains direct relation privileges.

## Status

Review-only SQL exists; no device was registered, no role activated, and no database or Production operation occurred.
