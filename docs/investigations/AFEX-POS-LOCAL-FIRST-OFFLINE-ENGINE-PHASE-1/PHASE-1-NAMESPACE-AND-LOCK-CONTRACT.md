# Namespace and Lock Contract

## Namespace

The durable opaque namespace contains all five verified inputs: primary subject, tenant, branch, device cache ID, and schema generation. It excludes Primary Session ID and employee actor ID. The employee actor is an authorization overlay.

The server route derives account/tenant/branch from `requireAuthorizationContext`; the browser cannot select authority by supplying cached identifiers.

`activeNamespace` is an optimization only, never purge authority. Before every purge, the implementation obtains a fresh server-verified context, reuses only the stable device cache identifier, derives the expected descriptor, and compares every descriptor field with the active candidate. Any account/tenant/branch/generation mismatch clears the active descriptor, locks key/plaintext state and aborts with `OFFLINE_CROSS_SCOPE_DENIED` without deletion.

The active descriptor is cleared on Primary Auth loss, account/tenant/branch change, full logout completion, completed purge, integrity mismatch and failed authority comparison. Employee switching inside the same verified durable scope may retain the descriptor, but always clears unlocked key/plaintext state.

## Lock transitions

| Event | Required state |
| --- | --- |
| Initial load | LOCKED |
| Primary Auth only | LOCKED |
| POS actor/PIN without reviewed unwrap authority | LOCKED |
| Employee switch | immediate LOCKED; base branch namespace retained |
| Account/tenant/branch change | previous namespace LOCKED before render |
| Full logout completion | active descriptor CLEARED |
| Completed purge | active descriptor CLEARED |
| Actor clear/expiry/revocation | immediate LOCKED |
| Logout start | immediate LOCKED |
| Integrity/schema error | LOCKED |
| Purge pending/failure | LOCKED |

BroadcastChannel propagates opaque lock/purge events across tabs. Where unavailable, an ephemeral localStorage event contains only protocol version, random event ID, action, opaque namespace ID, and safe reason; it is removed immediately and contains no PII, key, token, or payload.

Exact-namespace purge accepts an internally issued immutable authorization capability, not a mutable namespace string. The tombstone stores a digest binding the full verified descriptor and is resumed only when a fresh authenticated active-POS-actor context derives the identical descriptor. A forged, old-generation or cross-scope tombstone cannot authorize deletion.

Cold initialization is deliberately authority-free: it validates the store, starts tab coordination, counts pending tombstones without exposing their identities, and remains locked. It cannot consume or cache an unauthenticated resume decision. Authorized restart recovery is a separate re-runnable action invoked only after the server has issued a valid POS actor session.

Restart recovery uses the exact derived namespace index, never global tombstone iteration. Account B cannot resume, rewrite, or poison account A's tombstone. A binding digest mismatch remains intact for a correctly authorized future scope and returns `binding_mismatch_locked`; it is not rewritten under the current context. Safe outcomes expose only status and counts: `nothing_pending`, `resumed_current_scope`, `authorization_required_locked`, `deferred_for_matching_scope`, `binding_mismatch_locked`, `purge_failed_locked`, or `offline_store_unavailable_locked`.

The binding is fail-closed against stale/forged application metadata. It does not claim protection against a fully compromised same-origin runtime that can execute arbitrary code while a legitimate capability is live; this is the documented local-compromise boundary. Exact purge also uses an IndexedDB coordination lease with bounded expiry and checks tombstone existence/binding only after the lease is acquired. No generic database/origin clear API is exposed to UI.
