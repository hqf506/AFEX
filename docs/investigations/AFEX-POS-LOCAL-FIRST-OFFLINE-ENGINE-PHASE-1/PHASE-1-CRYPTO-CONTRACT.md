# Phase 1 Crypto Contract

- Algorithm: AES-GCM with one random 256-bit DEK per namespace.
- Nonce: 96 random bits generated for every encrypted record; reuse is not intentional or deterministic.
- AAD binds `namespaceId`, store, record key, schema version, and envelope version.
- Envelope records algorithm, key/envelope/schema versions, nonce, ciphertext, and AAD digest.
- Decryption validates all bindings before decrypting. Wrong namespace, store, key, record key, version, AAD, or ciphertext fails closed and locks the runtime.
- Runtime keys must be secret, non-extractable AES-GCM keys with encrypt/decrypt usage.
- Raw keys are never serialized. PIN, Supabase tokens, service-role secrets, and provider secrets are never key material.
- `OfflineKeyManager` is a narrow custody interface so a future Mode B authority can replace Mode A without changing repository consumers.

Synthetic tests create a temporary AES-KW wrapping key and unwrap to a non-extractable AES-GCM key. This path is rejected in Production.

## Known authority boundary

There is no reviewed persistent server/device unwrap authority in the repository. `persistentUnwrapAuthority` is therefore false, persistent PII ingestion remains disabled, and retained ciphertext is not claimed to be unlockable after restart. No fake unlock endpoint was added. Lock drops the application reference to the key; deterministic memory zeroization is not claimed.
