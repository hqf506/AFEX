# Authority Correction Persistent Unwrap Contract

## Key hierarchy

The selected Mode A hierarchy is:

1. Browser-generated non-extractable ECDSA P-256 device proof key.
2. Separate browser-generated non-extractable RSA-OAEP-3072/SHA-256 device unwrap key.
3. Random AES-256-GCM namespace DEK for exact `(account, tenant, branch, device, namespace, generation)`.
4. Employee PIN-derived wrapping key, unique salt and versioned KDF parameters wrapping the namespace DEK with complete employee/device/generation AAD.
5. Random outer package key encrypting the employee package, itself wrapped to the registered device public key.
6. Trusted issuer signature over canonical claims and exact package hash after Online verification.

Four-digit PIN derivation supplies friction, not high entropy. The device private key and exact package binding are mandatory co-factors. `extractable=false` prevents export, not same-origin invocation.

## Canonical package and AAD

Canonical claims use a versioned deterministic encoding and bind issuer, algorithms, account audit subject, POS employee, tenant, branch, device, namespace, key/package/envelope/schema generations, credential/PIN/permission/revocation/device generations, dataset and command allowlists, ciphertext hashes and package hash.

Every record and command separately binds record type, local ID, local sequence, dependencies, causation, command type, semantic payload hash and authority projection hash. Encryption randomness does not change semantic identity. Unknown fields, duplicate keys, unsupported versions, binding mismatch, signature failure or GCM failure lock before plaintext release.

## Persisted material

The browser may persist non-extractable key handles, public/signed claims, salts/KDF parameters, ciphertext packages/records/commands, authenticated attempt/lock state, encrypted audit and server receipts. Server metadata may persist device public keys, thumbprints, generations, package hashes, revocation state, issuer/audit data and wrapped package metadata.

Neither side stores a browser private key export, plaintext/reversible PIN, PIN-derived key, raw namespace DEK, reusable server verifier, POS actor cookie copy, service-role credential, provider credential, payment secret or unencrypted business dataset.

## Lifecycle

Application restart/reboot, inactivity/background lock, employee switch and logout-retain destroy in-memory plaintext and authority handles but preserve valid encrypted packages. A pre-enrolled employee may PIN-unlock Offline regardless of elapsed time or last-sync age. Primary Auth alone never unlocks.

PIN rotation increments credential/PIN generations and rewraps Online. Permission/branch/employee changes rotate or revoke only the affected package. Device replacement creates new keys and generations. Namespace rotation writes a new authenticated generation and cannot discard the old descriptor until every record is verified; interrupted rotation resumes or locks without mixed plaintext.

Explicit purge removes only the authorized namespace, package, ciphertext, counters, local audit and associated key handles, then verifies residue. It never reassigns commands or claims remote revocation. No recovery escrow is selected; key loss can lose unsynced work.

## Rollback and compromise boundaries

Package/record/counter rollback or duplicated sequence locks and preserves redacted evidence. A copied ciphertext database alone is insufficient without a usable device key; a copied browser profile or compromised origin may retain usable key handles. Mode A therefore relies on managed-device controls and does not claim protection from a privileged or unlocked-device attacker.

Persistent unwrap remains blocked until device and employee authority, canonicalization, key persistence, exact purge, rotation/recovery behavior and hostile same-origin threat tests are independently approved.
