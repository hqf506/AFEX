# Phase 0 Encryption and Key Decision

## Initial mode decision

**PROPOSED initial mode: Mode A — PWA application-layer encrypted cache using WebCrypto.**

Mode A matches the current web/PWA footprint and allows Phase 1/2 architecture work. It requires explicit human acceptance that WebCrypto does not provide hardware-backed isolation from XSS, a malicious extension, a compromised browser runtime or a device administrator while data is unlocked.

**Conditional Mode B — Capacitor Keychain/Keystore protection** is the safer persistent-device option and is recommended when security owners require device-bound hardware/OS key assurance. Mode B adds approximately 2–3 engineer-weeks plus native release qualification. Mode A must never be described as equivalent to Mode B.

## Key hierarchy

- Generate a random AES-GCM 256 Data Encryption Key (DEK) per account/tenant/branch/device namespace.
- Store only a wrapped DEK at rest.
- Bind every encrypted record with AAD containing namespace ID, store name, record key and local schema version.
- Use unique nonces according to the reviewed WebCrypto record format; nonce reuse is a fatal integrity condition.
- Version key envelopes and ciphertext formats independently.
- Never store a raw DEK, PIN, PIN verifier, Supabase refresh-token copy, service-role key, provider credential or private signing key in `localStorage`, IndexedDB logs, URLs, analytics or error evidence.

## Lock and memory behavior

- The unwrapped DEK exists only in the smallest practical worker/runtime scope after POS actor unlock.
- Logout start, read-lease expiry, actor/session invalidation, tenant/branch switch, device revocation, schema/integrity failure or application lock terminates the worker and releases all key references.
- Plaintext query results are not persisted in UI caches, error reports, service-worker Cache Storage or diagnostics.
- Browser garbage collection cannot be claimed as deterministic memory zeroization; the design minimizes lifetime and terminates owning contexts.

## Retained data across logout

Unchecked logout retains ciphertext, signed manifests and the wrapped DEK. It removes in-memory key material and all decrypted view state. The retained namespace cannot be listed as PII and cannot be decrypted by Primary Auth alone.

Later unlock requires:

1. the same authorized primary subject/tenant/branch/device scope;
2. valid POS actor/PIN authority;
3. a future reviewed server/device authority capable of authorizing DEK unwrap for the correct key version.

This package does not invent the key-delivery API. Phase 1 may build the key-manager abstraction and local tests, but persistent pre-PIN sealed ingestion/unlock cannot be enabled until that separate API/device contract passes security review.

## Rotation

- Rotate on namespace authority change, security incident, device re-registration, algorithm/format change or explicit administrative policy.
- New records use the newest key version.
- Re-encryption is checkpointed and restartable; old wrapped keys remain only until every referenced record is migrated and verified.
- Pending commands/receipts may not be deleted because rotation failed.
- Key-version mismatch locks records and routes them to safe recovery, never plaintext fallback.

## Lost device registration/key material

- If wrapped-key authority or native key material is lost, encrypted cache is unrecoverable unless an explicitly reviewed server recovery envelope exists.
- The application purges/rebuilds read cache only after confirming there are no unresolved drafts/commands/receipts.
- If unresolved evidence exists, it remains quarantined and requires the approved support/recovery path. The product must not promise recovery that the key architecture cannot deliver.

## Mode A limitations

- XSS or a hostile extension in an unlocked origin can request decryption.
- A compromised device/runtime can inspect plaintext as the employee uses it.
- Non-extractable WebCrypto keys prevent raw export but do not prevent authorized-origin operations using a key handle.
- Browser/OS site-data eviction can delete ciphertext.

Controls include CSP/Trusted Types review, dependency pinning, short leases, minimal decrypted state, encrypted IndexedDB, service-worker scope discipline, secret/PII logging bans and real-device tests. They reduce risk; they do not create hardware isolation.

## Mode B decision trigger

Require Mode B before rollout if any owner rejects Mode A residual risk, if customer/financial retention exceeds the approved window, if managed-device policy demands hardware-backed keys, or if reliable recovery/background durability cannot be achieved in the target iOS/Android browsers.

## Acceptance gates

- namespace/AAD swap and ciphertext tamper fail closed;
- key/nonce/version rotation and interrupted re-encryption;
- lock destroys usable runtime references and cross-tab access;
- retained ciphertext survives logout but Primary Auth cannot decrypt;
- exact authorized scope can unlock only through reviewed authority;
- secret/PII scans and Cache Storage inspection;
- device/site-data loss behavior and support quarantine;
- explicit human risk acceptance recorded in `PHASE-0-RISK-ACCEPTANCE.md`.

