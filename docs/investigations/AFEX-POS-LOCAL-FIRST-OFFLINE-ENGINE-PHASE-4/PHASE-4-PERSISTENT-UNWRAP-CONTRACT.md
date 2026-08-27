# Phase 4 Device-Bound Persistent Storage Contract

## Supersession

The former employee-PIN-to-DEK interpretation is superseded and is not active authority. An employee PIN never derives, wraps, unwraps, decrypts, or authorizes a business-data key. Persistent client execution remains disabled; the exact client ciphertext representation remains a later client-runtime contract.

## Approved authority separation

1. A successful Online establishment-account login through the existing verified Auth path establishes `primaryAuthenticatedUserId`, tenant, and allowed branch.
2. A trusted Online bootstrap binds that account and scope to one managed device and authority generations.
3. Device-bound encryption independently protects local Offline data.
4. A structured employee PIN verifier selects one pre-enrolled employee under the retained account authority.
5. Every local command immutably binds both the primary account and the selected `actualPosEmployeeId`.
6. Synchronization requires a fresh Online session plus database revalidation of account, POS actor, device, employee, bootstrap, inventory, and command authority.

PIN selection cannot establish or change the account, tenant, branch, device, namespace, encryption key, Auth session, or provider authority.

## Device-bound encryption classification

The server may retain only public device proof/wrap keys, algorithm identifiers, hashes, status, and generations. The local runtime may later retain non-extractable device key handles and encrypted storage-envelope metadata. It must never retain or return plaintext DEK, plaintext/reversible PIN, PIN-derived DEK, provider token, CVV, card PIN, Supabase service credential, or Auth cookie copy.

Approved metadata algorithms are `ECDSA-P256-SHA256`, `RSA-OAEP-3072-SHA256`, and `AES-256-GCM`. Their precise browser representation, key creation ceremony, ciphertext framing, recovery, and re-encryption sequence are explicitly deferred to the disabled client-runtime implementation contract; this deferral does not block the private device, employee, inventory, or bootstrap database writers.

## Employee PIN verifier

The selector verifier is bound to primary account, tenant, branch, device, employee, enrollment generation, credential generation, and namespace generation:

- algorithm: `PBKDF2-HMAC-SHA256`;
- iterations: `600000`;
- unique random salt: 32 bytes per enrollment;
- derived verifier: 32 bytes;
- memory: `NOT_APPLICABLE_TO_PBKDF2`;
- parallelism: `NOT_APPLICABLE_TO_PBKDF2`.

Plaintext PIN, unsalted SHA-256, reversible storage, reuse as a server Auth credential, and any use in the DEK hierarchy are forbidden. Five failures lock the employee selector; bounded retry delay and device-level aggregation are later client-runtime controls. A four-digit PIN is low entropy and does not independently protect encrypted business data.

## Restart, logout, and recovery

- Internet loss does not terminate a valid bootstrapped account authority by age.
- Restart without explicit account logout reopens locked. The retained account-bound device package may be used Offline, but the employee must enter PIN again to select identity.
- Explicit establishment logout immediately disables Offline PIN entry, employee switching, reads, and order creation. PIN alone cannot restore access.
- Pending/syncing commands remain encrypted, inaccessible, and bound to the original account/tenant/branch/employee. They are neither deleted nor reassigned.
- Recovery requires the same establishment account to authenticate Online. A different account, tenant, or branch is rejected.
- The logout UI must warn before logout that pending Offline work will be inaccessible until same-account Online reauthentication.

## Time and revocation

`NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY` and `OPPORTUNISTIC_NOT_MANDATORY` remain frozen. Last-sync age is visibility and risk evidence only. Known device, employee, permission, branch, bootstrap, namespace, integrity, or revocation-generation mismatches stop future Offline authority. Remote revocation applies when learned during fresh Online validation before synchronization.

## Status

The database review candidate now contains separate NOLOGIN provisioning and acquisition roles plus whole-file device, employee-selector, inventory-snapshot, and Online-bootstrap waves. No execution, role activation, application integration, dispatch, replay, provider effect, or Production change is authorized.
