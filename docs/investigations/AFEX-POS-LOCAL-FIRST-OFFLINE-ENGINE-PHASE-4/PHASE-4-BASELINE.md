# AFEX POS Local-First Offline Engine — Phase 4 Baseline

## Scope and safety

Phase 4 is an offline design, reconciliation, and SQL-review packaging gate. It does not implement application/runtime behavior, enable persistent unwrap, persist commands, dispatch/replay commands, execute SQL, connect to a database, or contact Production.

## Repository gate

| Check | Observed |
| --- | --- |
| Repository root | `C:/Users/NSC-LUA/Desktop/leather-fix-erp-pos-responsive` |
| Branch | `codex/pos-responsive-redesign` |
| HEAD | `37331390ec00bee507f88701365bfebb944db675` |
| Upstream delta | `0/0` at gate time |
| Staged paths | `0` |
| Package/lock changes | `0` |
| Live migration changes | `0` |
| Core V2 tracked changes | `0` |
| R8N tracked changes | `0` (untracked R8N directories remained excluded and unopened) |
| Phase 4 application changes | `0` |

The intentionally uncommitted approved Phase 1–3 application state comprised 12 tracked paths: eleven modified paths and one deleted presentation component. Approved untracked Phase 1–3 scope was limited to `app/api/pos/offline-context/`, `components/pos-logout-retention-dialog.tsx`, `components/pos-offline-shell-registration.tsx`, `lib/offline/`, `public/pos/`, the Phase 1–3 test files, and the approved investigation directories. Unrelated `runtime-integration/R8N-*` paths were summarized from `git status` only and were not opened, hashed, modified, archived, or reconciled.

## Approved Phase identities

| Artifact | SHA-256 | Bytes |
| --- | --- | ---: |
| `lib/offline/phase1.ts` | `f9198bd7029a51c517ea37eb44f3c079a3269a199e7f606e248daa95476eccfd` | 72890 |
| `lib/offline/phase2.ts` | `c376ee4a5000f5e2b8e24b1ced0758019fbf22352a469f778f9e30320084298b` | 36123 |
| `lib/offline/phase3.ts` | `68f3a8035c95061ec95eab883be403328f6bcaeb54419a15308e9a338cd23cb0` | 60646 |
| `tests/pos-offline-phase1.test.mjs` | `6a6be7f0be53cf62ba14fb2cdae8a605267cb154447ac622ac54b2fa9d34a46f` | 42969 |
| `tests/pos-offline-phase2.test.mjs` | `5645f1740cedf9b9719ae8157ddf10bf43e3bc155b7dbb2885e349153d28f7cb` | 37605 |
| `tests/pos-offline-phase3.test.mjs` | `d0ce8f05acecfcd13161457b6f8d7f3bf4e4f9f066330155b090c10dbd76e665` | 51814 |

Manifest verification passed `13/13`, `14/14`, and `16/16` for Phases 1, 2, and 3. Phase 3 flags remained disabled: `durableCommandOutbox`, `productionSensitiveCommandPersistence`, `commandDispatch`, `commandReplay`, `currentWritePathInterception`, and `serviceWorkerDispatch`. Phase 1/2 persistent unwrap authority remained disabled.

## Evidence confidence vocabulary

- **Designed only**: contract or investigation text exists.
- **Source artifact exists**: repository code exists but does not prove deployed database state.
- **SQL artifact exists**: SQL exists outside this package; application status is unknown unless separately attested.
- **Production presence unverified**: no Production connection was made in Phase 4.
- **Runtime integrated**: an application path invokes the authority.
- **Tested**: repository tests assert the behavior; this is not Production proof.
- **Human approved**: explicitly approved by the phase history.

## Non-negotiable inherited boundaries

Primary authentication is mandatory for the initial trusted Online account/tenant/branch bootstrap but never supplies the acting employee. Device-bound encryption protects sensitive cached POS data independently of employee PIN. After bootstrap, PIN selects one pre-enrolled employee; explicit account logout disables that selector until same-account Online authentication. Durable local commands, dispatch, replay, official numbering, provider payment confirmation, and authoritative stock mutation remain disabled.
