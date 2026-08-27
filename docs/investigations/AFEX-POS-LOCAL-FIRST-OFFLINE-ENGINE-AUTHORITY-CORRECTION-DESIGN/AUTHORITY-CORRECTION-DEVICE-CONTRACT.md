# Authority Correction Device Contract

## Identity and ownership

Exactly one active Offline-authorized device may exist for each `(tenant, branch)`. `deviceId` is an opaque server identity and never a browser UUID, cookie, platform fingerprint or POS actor session. The dedicated `afex_offline_authority_owner` owns the registry and lifecycle; only the trusted enrollment runtime can mutate it.

Minimum immutable or versioned fields are tenant, branch, device ID, mode, signing and wrapping public-key algorithms/thumbprints, device authority generation, key-envelope generation, revocation generation, package frontier, status and audit causation. Status is one of pending, active, revoked, replaced, lost or purged. Display/build/platform metadata is diagnostic and never authority.

The server stores no private key, PIN, PIN-derived key, namespace DEK, reusable verifier, service-role credential or provider secret.

## Activation and proof

Enrollment requires valid Primary Auth as audit subject, a verified current POS employee with device-management permission, server-derived tenant/branch, fresh challenge, proof from both device public keys, and a canonical requested capability profile. The challenge binds action, tenant, branch, candidate device, requested generation, nonce identity and approved application policy. Challenge consumption is single-use and bounded.

Mode A uses separate non-extractable browser keys: ECDSA P-256 for proof/signature and RSA-OAEP-3072/SHA-256 for package unwrap. Public keys and thumbprints are registered. This proves possession inside the supported origin; it does not claim hardware attestation or protection from compromised same-origin code.

Activation serializes on the branch authority row and enforces a database uniqueness invariant for one active device. Application-only checks are insufficient. A repeated identical activation returns its prior result; a different key/candidate under the same action identity is a conflict.

## Replacement, loss and revocation

Replacement is one atomic authority action: lock the branch device slot, validate the authorized operator and reason, mark the prior device replaced, increment device/key/revocation generations, activate the new proof, append immutable lifecycle evidence and invalidate old package acquisition. Old private keys are never copied.

Lost/stolen classification immediately blocks server acquisition and effect eligibility for the old device. A disconnected device cannot learn the remote event until reconnect; continued local use is the approved Mode A residual risk. Trusted reconnect performs challenge proof and full generation/status validation before any synchronization, package retrieval or acquisition.

Local administrative lock may stop use earlier when governed authority is physically present. Exact-scope purge deletes only the local account/tenant/branch/device namespace and does not pretend to be server revocation when Offline.

## Failure and recovery

Missing, corrupt, rolled-back or duplicated device state fails closed. Clearing browser storage loses key handles and requires Online replacement/reactivation; it never resets into authority. Initial policy has no private-key escrow. Unsynced ciphertext can therefore be irrecoverable after key loss, while server receipts remain authoritative.

Any failure after branch serialization must leave either the previous active device unchanged or a complete new activation with an immutable event; no intermediate dual-active state is valid.

## Performance and proof

Hot validation is one indexed lookup by device ID plus equality checks for tenant, branch, status and generations. Activation/replacement is rare and may take a branch-scoped lock. Required proof includes two concurrent activations, replacement races, reused challenge, wrong key, wrong tenant/branch, revoked/lost device, generation rollback, storage loss, exact purge, and catalog evidence of the one-active uniqueness invariant.

No time, last-seen age or synchronization age terminates an otherwise valid locally known device authority.
