# Phase 1 Human Review Correction

Decision: `AFEX_POS_LOCAL_FIRST_OFFLINE_ENGINE_PHASE_1_FINAL_CORRECTION_COMPLETE_READY_FOR_HUMAN_REVIEW`

## Corrected defects

1. **Stale active namespace:** purge now requires a fresh server-verified context and internally issued immutable capability. Account/tenant/branch/generation mismatch locks, clears the active descriptor and aborts before deletion. Completed purge, full logout, auth loss and authority/integrity mismatch clear the descriptor. Tombstone resume requires identical descriptor binding plus active POS actor authority.
2. **Employee switch lifecycle:** switch and full logout are separate functions. Switch revokes only the actor, clears employee/plaintext/cache state, retains Primary Auth and routes to `/pos/employee-pin`. Full logout additionally signs out Primary Auth and routes to `/pos/login`.
3. **Legacy data coverage:** all four allowlisted legacy-sensitive keys are assessed by count and byte size without logging values. Absent repository binding evidence means populated entries are ambiguous/unscoped. Scoped purge cannot claim their removal; a separate exact confirmation is required for allowlisted device-wide AFEX legacy cleanup.
4. **Complete unresolved warning:** UI reports encrypted drafts, quarantine, active legacy sale, offline queue count and ambiguous legacy count separately. Confirmed server data is explicitly excluded from local deletion.

## Final restart-recovery correction

The remaining defect was a lifecycle coupling bug: cold unauthenticated startup attempted global tombstone recovery inside the cached initialization promise. A resolved unauthenticated attempt could never be retried after PIN authorization, and a tombstone from account A could affect account B startup.

The final correction separates the contracts:

- `initializeOfflinePhase1Runtime()` is authority-free, initializes/validates storage, discovers only safe aggregate counts, and stays locked.
- `resumeAuthorizedPurgesForCurrentScope()` is explicitly re-runnable, requires a freshly verified active POS actor, selects only the exact derived namespace, verifies the descriptor binding, and returns safe classifications without identifiers or PII.
- `completePosPinOfflineRecoveryGate()` runs immediately after the PIN endpoint has issued the actor session and before active employee state or route presentation is enabled.
- The exact-namespace coordination lease is acquired before tombstone recheck, so concurrent tabs are idempotent and cannot duplicate destructive work.
- A different account/branch, unavailable authority, binding mismatch, purge failure, or unavailable offline store stays fail-closed. Online POS remains usable when only the offline store is unavailable.

### Final correction SHA-256

| Application file | Before final correction | After final correction |
| --- | --- | --- |
| `lib/offline/phase1.ts` | `24dfef693b98d1d4e4188aa488d6c8b63ed0fa31e7bab593a92dfc9329293d94` | `55867e81c718176b017ef78ddcb1f6eeb18fc16467161f5b0a708a6d4599e8f5` |
| `app/pos/employee-pin/page.tsx` | `cc1dd080946fd25baedf9a88f3ec1dced76cfe9b7de12bcdd4c01243c3223058` | `355b758f853a2528c1dc2a67d663ea7c4eef4d324974d0c3885fbb40779b9633` |
| `tests/pos-offline-phase1.test.mjs` | `b4550c9a0827f850c9cd361d2fc42c62f59017cb21770c0c545cb7dafe97f9d3` | `69df779c21bc798709c8f988cecf744cd1b39003b051a9d1dbcbc643d9cb5a83` |

## Before/after SHA-256

| Application file | Before | After |
| --- | --- | --- |
| `lib/offline/phase1.ts` | `f5fb72314264cb2672503f19cb47c0ba0327ec4ee97e7c003d9054d3857bd3d0` | `24dfef693b98d1d4e4188aa488d6c8b63ed0fa31e7bab593a92dfc9329293d94` |
| `lib/pos-employee-session.ts` | `ee777f9f50bd7650eb8afa26188ae66ce5f6ae28abbfcde4e4e8375b9fce0211` | `812df45dd14f66c21717b5a943552437a415eab3f5fc46196f732716497c620b` |
| `components/pos-logout-retention-dialog.tsx` | `7e0257454742ce3f0924004164cede6a3c489e5f62df8a34c34b6706c2cf791d` | `288de660deede3b816c78c81146b8ab06314459ff94a8b0eacd1e01e55e800ae` |
| `components/auth-state-provider.tsx` | `75dba8aac3b34e0018dfa59814e167b86e8d5ccf6a19dd1b8ad3eeeee33a1888` | `7e3b72757bfd8a62f4145d57ad76a01b144f9ad5bbb4c112ddce55e3e6010e34` |
| `components/pos-shell/pos-responsive-shell.tsx` | `02d5eb2bb4947b1eda3e7a5d1fcf02e247f15c7d9b1c43ac0cdbc0fd61557cc9` | `9fecfb5f5510d1618d019e9cbdf5ad8c19b255e533914d1812e38db13dbc95d8` |
| `app/pos/settings/page.tsx` | `5a316e83b413dd53658a15c1de556dd11e6029f4946f2722107dfe023d4b7e25` | `72be80eae69ecafe85dad2a8feecbd97cd384567664974830dfca6920c43eb92` |
| `app/pos/page.tsx` | `9cb1c8bbd236829bc6fdaf853834c4270300fed782519a24fdfd714edd0ece02` | `4ea33df684ed50ddc665b9388edfabb74f827dfb9d10734712379389217d336e` |
| `app/pos/employee-pin/page.tsx` | `6590d7c2a8d4683d4c246bb07e3156df798eff1ff36d2d81054d35dcc21e1571` | `cc1dd080946fd25baedf9a88f3ec1dced76cfe9b7de12bcdd4c01243c3223058` |
| `tests/pos-offline-phase1.test.mjs` | `0bec340dc59638c3c7d9783ddd6f5e45311e703ddd12306a202a11b1af7a39dd` | `b4550c9a0827f850c9cd361d2fc42c62f59017cb21770c0c545cb7dafe97f9d3` |

## Functional evidence

- Phase 1 functional/browser tests: 10/10 PASS; final restart-recovery behavior matrix: 12/12 PASS.
- Auth gates: 6/6 PASS.
- POS UX: PASS; Customer binding: 26/26 PASS; Responsive: 151 assertions PASS.
- TypeScript, targeted ESLint and `git diff --check`: PASS.
- Repository-wide Node sweep: 299/301 PASS; two pre-existing out-of-scope CSS source assertions failed and their files remain untouched.
- Build compilation and TypeScript: PASS; prerender blocked only by absent external `NEXT_PUBLIC_SUPABASE_URL`.
- SQL/DB/Production/business dispatch/Git writes: 0.

## Boundaries

No Phase 2 work started. No package, SQL, migration, RPC, RLS, Core V2, R8N or historical Phase 0/investigation artifact was modified. The stale order-history CSS assertion remains untouched as directed.
