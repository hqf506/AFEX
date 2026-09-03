# Phase 1 Test Evidence

## Automated PASS

| Gate | Result |
| --- | --- |
| Phase 1 Node + Chromium IndexedDB/WebCrypto | 10/10 PASS |
| Final restart-recovery required scenarios | 12/12 PASS |
| Auth gates (welcome, forgot, reset, sync, recovery prefetch, signup OTP) | 6/6 PASS |
| POS UX contract | PASS |
| Customer selection binding | 26/26 PASS |
| Responsive UX | 151 assertions PASS |
| TypeScript `tsc --noEmit` | PASS |
| ESLint changed/new application and test files | PASS |
| `git diff --check` | PASS |

Phase 1 browser coverage includes database create/open, missing-store corruption, deterministic namespaces, five-input isolation, account-A to account-B and branch-A to branch-B stale-scope denial, AES-GCM round trip, unique nonces, AAD/ciphertext tamper, Primary-only denial, separate switch/logout lifecycles, employee lock, quota thresholds, exact media policy, verified legacy import, ambiguous quarantine, complete unresolved assessment, allowlisted explicit legacy cleanup, scoped purge, unrelated namespace/localStorage byte identity, descriptor-bound tombstone recovery, retryable purge failure, completed-purge/full-logout descriptor clearing and BroadcastChannel tab lock.

The final restart-recovery regression exercises real Chromium IndexedDB across all 12 required behaviors: cold signed-out discovery; no tombstone consumption/misclassification; later authorized resume; account-B isolation with account-A evidence byte-identical; account-B online usability; account-A recovery; binding mismatch lock; repeat idempotency; concurrent two-tab exclusion; completion before the presentation/plaintext hook; Primary-only denial; and zero business dispatch. Static integration assertions additionally prove the employee PIN handler awaits the gate before writing employee presentation state or navigating.

## Broader regression observation

A selected existing suite produced 105/106 PASS. The single failure is the historical `operations history keeps controls fixed...` static CSS assertion in `tests/pos-eight-mobile-defects.test.mjs`; Phase 1 did not modify its page, CSS module, or test. It is recorded without an out-of-scope UI change.

An additional repository-wide Node test sweep produced 299/301 PASS. Its two failures are static CSS expectations in `tests/pos-customer-full-height-layout.test.mjs` (`mobile remains one column...`) and the same historical order-history assertion. Phase 1 did not modify either test or the UI/CSS sources asserted by them. Both are recorded, not corrected, because they are outside this focused security/lifecycle continuation.

## Build

`next build` compiled successfully and its TypeScript phase passed. Static prerender then stopped because `NEXT_PUBLIC_SUPABASE_URL` is absent (reported on `/_not-found`, `/invoice` and `/admin/settings/invoices/digital`). No `.env` file or substitute credential was created. This is an external required-environment blocker, not a Phase 1 compiler failure.

## Unexecuted categories

- Authenticated Runtime: UNPROVEN.
- Real-device: UNPROVEN.
- Production: NOT EXECUTED.
- SQL/DB/network/business writes: 0.
