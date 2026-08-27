# Prompt 10 final implementation sequence

## A. Application-only compatibility closure

| Item | Prerequisite | Effort | Risk | Acceptance gate | Rollback | SQL | Core | Production |
|---|---|---:|---|---|---|---|---|---|
| Exact seven-field trusted profile route | approved response contract | 3–5 days | medium | hostile auth + caller tests | keep old route behind disabled flag | No | No | Preview only |
| Migrate profile callers | trusted route ready | 2–4 days | medium | direct browser profile calls = 0 | flag rollback without broad ACL | No | No | Preview only |
| Inventory-history contract completion | existing trusted route | 4–6 days | medium | 30/366 UTC window, stable id tie-break cursor, response snapshots | route version rollback | No | No | Preview only |
| Connection/synchronization UI | Phase 1–3 state contracts | 3–5 days | low | Online/Offline/Syncing/Attention and counts | hide behind disabled flag | No | No | No |
| Local inventory projection/messages | approved Phase 4 contract | 4–6 days | medium | restart reconstruction and both exact Arabic outcomes | disable projection | No | No | No |

All sensitive acquisition, unwrap, persistence, dispatch, replay and interception flags remain disabled.

## B. Core V2 authority work

| Item | Prerequisite | Effort | Risk | Acceptance gate | Rollback | SQL | Core | Production |
|---|---|---:|---|---|---|---|---|---|
| Actual employee/device/generation binding | CA-002 approved design | 2–3 weeks | high | atomic request+receipt identity and hostile replay tests | versioned old receipt retained | Later | Yes | isolated then Preview |
| Stable Offline command acquisition/replay | prior binding | 1–2 weeks | high | idempotency/concurrency/restart matrix | disable Offline acquisition | Later | Yes | isolated then Preview |
| Payment attestation + eight methods | versioned Core request | 1–2 weeks | high | employee/provider writer separation | reject new version | Yes | Yes | isolated then Preview |
| Inventory frontier/cancel/refund authority | snapshot contract | 2 weeks | high | forward/cancel lock parity | disable new command version | Yes | Yes | isolated then Preview |
| Atomic effect intent/receipt conflicts | CA-007 design | 2 weeks | high | semantic idempotency/ambiguity matrix | suppress worker, retain intent | Yes | Yes | isolated then Preview |

## C. Independent SQL/migration work

Roles/private schemas; ACL/RLS closure; device/employee authority; persistent unwrap metadata; Core bridge; review/payment/inventory/effect authority; constraints/indexes; rollback/disablement; post-change attestation. Prerequisite: finalized A/B contracts and exact regenerated SQL. Effort: 3–5 senior engineer-weeks plus independent review. Risk: critical. Acceptance: parser/static review, disposable database, hostile ACL/RLS tests, lock plan, rollback drill, fresh read-only Production attestation. Rollback must preserve evidence and disable writers, never restore broad privileges. SQL/Production required: yes, but not authorized here.

## D. Runtime qualification

Authenticated runtime, hostile authorization, concurrency, replay/idempotency, browser/device restart, multi-tab, quota, migration recovery, real device, Preview, limited pilot and rollback drill. Effort: 2–3 weeks after implementation. Risk: high. Production access: only a separately approved read-only attestation followed by independently approved rollout; no Production approval exists now.

## Duration and next phase

Remaining work is realistically **14–20 senior-engineer weeks**, or roughly **10–14 elapsed weeks** with two senior engineers plus independent SQL/security review and pilot scheduling.

Next single safe phase: `APPLICATION_COMPATIBILITY_CLOSURE_BEHIND_DISABLED_FLAGS` — implement and qualify the trusted seven-field profile route/caller migration plus inventory-history contract, without enabling Offline authority, without SQL, and without Core changes.

