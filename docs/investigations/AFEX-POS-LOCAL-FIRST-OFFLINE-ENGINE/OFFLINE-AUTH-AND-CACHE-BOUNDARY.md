# Offline Auth and Cache Boundary

## Required invariant

Primary organization authentication may authorize dataset refresh, but it must not by itself authorize plaintext POS data access. Local operational data becomes usable only after a valid POS actor session/PIN unlock for the same account, tenant, branch and device namespace.

Namespace identity:

```text
cacheNamespace = version / primarySubjectId / tenantId / branchId / deviceCacheId
actorUnlock    = primarySessionId + posActorId + tenantId + branchId + expiry
commandActor   = primarySubjectId + effectivePosActorId + actorSessionReference
```

No namespace component may be accepted from an untrusted browser payload without server verification.

## Current boundary

- Server APIs already resolve primary subject, tenant and branch from verified auth context.
- Server APIs validate the HttpOnly POS actor cookie for effective employee authority.
- Client `sessionStorage` employee state is presentation state only.
- Current `localStorage` sale and offline-draft records have no tenant/branch namespace, encryption, actor lock, schema version, integrity tag or expiry.
- Clearing an in-memory fetch cache is not equivalent to deleting persisted sensitive data.

## Proposed lock states

| State | Primary auth | POS actor | Local ciphertext | Plaintext access | Network refresh | Command creation |
|---|---:|---:|---:|---:|---:|---:|
| signed_out | no | no | may be retained | denied | denied | denied |
| primary_only | yes | no | may be refreshed only through sealed ingestion | denied | limited bootstrap | denied |
| actor_unlocked | yes | yes | present | allowed for exact namespace | allowed | allowed per command policy |
| actor_expired | yes | expired/revoked | present | immediately locked | auth refresh only | denied |
| offline_actor_lease | cached verified lease | valid local lease | present | allowed until strict expiry | unavailable | only explicitly enabled commands |
| purge_pending | any | any | present | denied | logout/revoke completion | denied |
| purged | any | any | absent | denied | normal login bootstrap | denied |

## Cryptographic feasibility

### Pure web/PWA limit

A non-extractable WebCrypto key prevents raw key export, but same-origin JavaScript that can obtain the key handle can still request decryption. Therefore a compromised browser profile, hostile extension, XSS, or device owner with runtime control defeats strong separation. Encryption at rest protects lost-disk/backup exposure better than a fully compromised active device.

The requested rule “primary auth alone cannot read cache” can be enforced at application level in a PWA by keeping the data-encryption key wrapped and releasing/unwrapping it only after POS actor validation. Strong persistence across browser restarts needs one of:

1. a server-issued actor-bound wrapping secret plus a registered device public key;
2. WebAuthn/secure hardware mediation;
3. Capacitor native Keychain/Keystore support with a native unlock gate.

The current actor-session endpoint issues only an HttpOnly cookie and no offline unlock artifact. A new bounded server contract is therefore required for strong offline restart support.

### Recommended key hierarchy

- Random per-namespace Data Encryption Key (DEK), AES-GCM 256.
- Random device key pair or native secure-store Key Encryption Key (KEK).
- DEK stored only wrapped; never in localStorage, logs, URLs, analytics or service-worker messages.
- Actor-unlock envelope contains tenant, branch, primary subject, POS actor, device ID, issued/expiry times and key version; server signature verified before use.
- In-memory unwrapped DEK is zero-reference/worker-terminated on lock, actor expiry, branch change, logout start or integrity failure.
- Every record uses authenticated additional data containing namespace, store, primary key and schema version.

## Sealed ingestion before PIN

The safest pre-PIN refresh is server-sealed content:

1. primary auth requests a branch dataset manifest for its trusted tenant/branch;
2. server confirms access and encrypts/wraps the dataset key for the registered device namespace;
3. client stores ciphertext and a signed manifest without exposing plaintext to the primary-only UI;
4. POS actor unlock validates tenant/branch/device and releases the ability to unwrap;
5. any mismatch locks the namespace and requires online reauthorization.

If server-sealed ingestion is not implemented, pre-PIN refresh can only claim application-level access control, not cryptographic separation.

## Offline actor lease

An offline lease must be short-lived, signed, device-bound and command-scoped. It must include:

- primary subject and session lineage;
- effective POS actor ID/source/role;
- tenant and branch;
- device cache ID and key version;
- permitted offline command types;
- issuance, not-before and absolute expiry;
- revocation epoch last observed online.

The device cannot know about a revocation that occurred after disconnection. Product policy must cap offline lease duration and financial exposure. Expired leases allow read-only locked-history policy only if explicitly approved; they never allow new financial commands.

## RLS and service-role boundary

- RLS remains the database backstop for exposed clients.
- Server service-role access must retain explicit tenant/branch filters and never be copied to the client.
- Offline storage does not reproduce RLS. Its equivalent is namespace encryption plus signed dataset scope, record integrity checks and POS unlock.
- Client-supplied employee, tenant, branch, price, VAT, discount, inventory and sequence values remain assertions to validate, never authority.

## Logout contract

The UI must show an unchecked checkbox with exact text:

`حذف البيانات المحفوظة من هذا الجهاز`

The sequence is:

1. lock plaintext immediately;
2. request authoritative actor revocation and primary logout;
3. after successful logout, if unchecked, retain scoped ciphertext and wrapped keys only;
4. if checked, atomically tombstone and purge only the exact primary/tenant/branch/device namespace;
5. verify namespace record count, media references, outbox records and wrapped key count are zero;
6. never purge a different account/tenant/branch namespace;
7. if online logout fails, remain locked and show retry; do not claim successful purge/logout.

## Acceptance gates

- primary-only UI cannot enumerate or decrypt cached records;
- invalid/revoked/expired actor state locks the namespace;
- tenant/branch switch cannot reuse the previous DEK;
- no service-role/provider secret is stored;
- logout unchecked retains ciphertext but exposes zero plaintext;
- logout checked purges only after successful logout and proves scoped zero residue;
- cross-tab workers receive lock events and stop transactions;
- XSS/device-compromise limitation is documented, not hidden.

