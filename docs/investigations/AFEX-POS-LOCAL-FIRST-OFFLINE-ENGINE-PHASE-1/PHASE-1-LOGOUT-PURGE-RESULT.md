# Logout Retain/Purge Result

The shared dialog is integrated into current POS logout and employee-switch entry points, with two distinct authoritative lifecycles.

- Checkbox is remounted unchecked on every open.
- Exact text: `حذف البيانات المحفوظة من هذا الجهاز`.
- Both actions lock plaintext immediately and clear employee presentation plus invoice/catalog/resource caches.
- Employee switch revokes only the POS actor, retains Primary Auth and the same durable verified namespace, then routes to `/pos/employee-pin`.
- Full logout revokes the POS actor, performs Supabase local Primary sign-out, and routes to `/pos/login`.
- Unchecked logout retains exact scoped encrypted evidence.
- Checked logout captures an immutable purge authorization derived from a fresh server-verified account/tenant/branch context and the stable device cache identifier.
- Immediately before action, the descriptor is reauthorized and reassessed. Purge begins only after the correct authoritative action succeeds.
- Assessment reports encrypted drafts, encrypted quarantine, active legacy sale presence, legacy offline-queue records and ambiguous legacy records separately.
- Any unresolved or legacy-sensitive record triggers a second confirmation.
- Ambiguous legacy data blocks a scoped zero-residue claim. A separate explicit confirmation may delete only the four allowlisted AFEX legacy keys, followed by absence verification.
- `localStorage.clear()` is never used; theme and unrelated keys remain untouched.
- No records are uploaded, cancelled, replayed, or described as server deletion.
- Purge removes only the authorized exact namespace, validates zero residue, preserves unrelated namespace fingerprints, and uses a descriptor-bound tombstone for restart recovery.
- Cold unauthenticated startup discovers pending tombstones but never resumes them and never caches an authority denial.
- Restart recovery is re-attempted only after successful POS actor/PIN issuance and before employee/plaintext presentation or navigation.
- Recovery selects only the freshly authorized exact namespace; a different account or branch remains locked and cannot mutate another scope's tombstone.
- The exact-namespace lease and post-lease tombstone check make concurrent two-tab recovery idempotent and prevent duplicate destructive passes.
- Purge failure remains locked as `OFFLINE_PURGE_FAILED_LOCKED` with safe retry.
- A retry after Primary logout uses the already-authorized immutable capability, not newly inferred user scope.

Browser IndexedDB tests covered retain, checked purge, stale account/branch rejection, active-descriptor clearing, unrelated namespace and localStorage byte identity, cold unauthenticated restart, Primary-only denial, account-B deferral, account-A authorized recovery, binding mismatch preservation, repeat idempotency, retryable failure, two-tab atomic recovery, and gate ordering before online POS presentation. Authenticated deployed runtime and real-device behavior remain UNPROVEN because no authenticated non-Production session was used.
