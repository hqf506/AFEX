# AFEX POS Local-First Offline Engine — Phase 0 Executive Decision

## Phase status

`PHASE_0_CONTRACT_FREEZE_PROPOSED_FOR_HUMAN_APPROVAL`

This package freezes proposed product, security, authority, retention, conflict, performance, rollout and rollback contracts. It is documentation only. It authorizes no implementation, SQL, migration, database contact, business action, Git write or deployment.

## Repository attestation

- Worktree: `C:\Users\NSC-LUA\Desktop\leather-fix-erp-pos-responsive`
- Branch: `codex/pos-responsive-redesign`
- HEAD: `37331390ec00bee507f88701365bfebb944db675`
- Upstream ahead/behind at Phase 0 gate: `0/0`
- Tracked modifications at gate: `0`
- Staged modifications at gate: `0`
- Approved investigation package: present as 17 expected untracked documentation files
- Historical `runtime-integration/R8N-*`: untouched

## Frozen proposed architecture

1. **Initial storage/security mode:** Mode A, a PWA application-layer encrypted cache using WebCrypto, with explicit XSS/extension/compromised-device limitations. It is not equivalent to hardware-backed protection.
2. **Conditional hardening:** Mode B, Capacitor Keychain/Keystore device-bound key protection, proceeds only if security/risk owners require stronger assurance.
3. **Operational store:** versioned IndexedDB for encrypted records, drafts, commands, receipts and conflicts. Cache Storage is limited to the application shell and approved media. Sensitive operational data and outbox records never use `localStorage`.
4. **Namespace:** primary subject + tenant + branch + device cache ID. Primary Auth alone may not decrypt POS data.
5. **Unlock:** renewed authorized Primary Auth plus a valid POS actor/PIN authority for the same namespace. PIN is never retained or used as a key.
6. **Logout:** lock immediately; retain encrypted data by default; exact scoped purge only after successful authoritative logout and explicit unchecked-by-default user choice.
7. **First business pilot:** `order.create` only, after Core V2 prerequisites. Proposed pilot allows cash only, maximum SAR 500 per order, SAR 2,000 total unsynced value, 10 pending orders and two hours disconnected.
8. **Official authority:** database owns official numbering, price/VAT/discount/inventory validation and terminal business result. The device shows a local reference until sync.
9. **External effects:** WhatsApp, provider calls, cost/audit follow-ups and other external effects are server-owned and idempotent; the device never replays them directly.

All numerical values and Mode A risk acceptance remain `PROPOSED` until a human reviewer explicitly approves or changes them.

## Corrected implementation order

1. Phase 0 — product/security/authority contract freeze.
2. Phase 1 — encrypted local storage, namespace isolation, schema/integrity, and complete logout retain/purge.
3. Phase 2 — offline read datasets and application shell.
4. Phase 3 — durable command outbox in shadow mode with zero business dispatch.
5. Phase 4 — Core V2 effective actor authority and limited `order.create` pilot.
6. Phase 5 — device management, support controls and operational observability.
7. Phase 6 — one additional command type at a time.
8. Conditional native hardening only after security/risk approval.

No persistent PII cache may be enabled before Phase 1 lock, retain and scoped-purge gates pass.

## Corrected schedule

- Phases 0–6: approximately **11–19 engineer-weeks**.
- Conditional native hardening: approximately **2–3 additional engineer-weeks**.
- Total with native hardening: approximately **13–22 engineer-weeks**.
- Small-team calendar expectation: approximately **3–6 months**, depending on Core/DB authority review and real-device qualification.

## Human approvals still required

- Mode A risk acceptance versus requiring Mode B before PII caching.
- Offline actor lease durations and offline financial exposure.
- Cash-only first pilot and all value/count/time limits.
- Dataset retention limits and privacy policy.
- Purge behavior when unresolved commands exist.
- Stale-price/inventory conflict promise to employees/customers.
- Core V2/API/DB prerequisite scope and command retention.
- Rollout cohort, monitoring thresholds and kill-switch owners.

## Implementation prohibition

Phase 1 must not begin until the human decision document is completed and the required owners explicitly approve the Phase 0 contracts. Approval of this document is not approval of Production deployment.

