# AFEX Production Read-Only Attestation — Baseline

## Repository gate

- Repository root: `C:\\Users\\NSC-LUA\\Desktop\\leather-fix-erp-pos-responsive`
- Branch: `codex/pos-responsive-redesign`
- HEAD: `37331390ec00bee507f88701365bfebb944db675`
- Upstream ahead/behind: `0/0`
- Staged paths: `0`
- Phase 5: not started
- This directory is the only repository content created by this attestation.

The inherited dirty working tree was accepted as prior Phase 1–3 implementation and Phase 0–4 evidence. It was not cleaned, reset, staged, or rewritten. The tracked application diff identity before this phase was `f2cc98137dc505b495da608ec5ba38d3c0293670` using Git's binary-diff object hash. The known untracked implementation identities remained:

| Path | SHA-256 |
| --- | --- |
| `lib/offline/phase1.ts` | `f9198bd7029a51c517ea37eb44f3c079a3269a199e7f606e248daa95476eccfd` |
| `lib/offline/phase2.ts` | `c376ee4a5000f5e2b8e24b1ced0758019fbf22352a469f778f9e30320084298b` |
| `lib/offline/phase3.ts` | `68f3a8035c95061ec95eab883be403328f6bcaeb54419a15308e9a338cd23cb0` |
| `tests/pos-offline-phase1.test.mjs` | `6a6be7f0be53cf62ba14fb2cdae8a605267cb154447ac622ac54b2fa9d34a46f` |
| `tests/pos-offline-phase2.test.mjs` | `5645f1740cedf9b9719ae8157ddf10bf43e3bc155b7dbb2885e349153d28f7cb` |
| `tests/pos-offline-phase3.test.mjs` | `d0ce8f05acecfcd13161457b6f8d7f3bf4e4f9f066330155b090c10dbd76e665` |

The Phase 4 manifest remained present with SHA-256 `a509f7d93218dcd98a0ab73fe962320babd44d8289330850f5e8dcd289dfb960`.

## Production scope

The AFEX Supabase project was identified by the safe project reference `fsxmnwucgotwhtlxuknt`, project name `AFEX`, and region `ap-south-1`. The project was `ACTIVE_HEALTHY`. The repository's Vercel project metadata names the application `afex`; no credential or project URL was recorded.

Every database inspection was wrapped in an explicit read-only transaction and ended with rollback. No row contents, customer identifiers, employee identifiers, PIN material, payment details, or provider data were retained. Only catalog metadata, bounded counts, hashes, and aggregate statistics were captured.

## Safety accounting

Production connections: read-only only. Production writes: 0. Business writes: 0. External effects: 0. SQL/migration drafts: 0. Application changes: 0. Core V2 changes: 0. Service Worker changes: 0. Phase 5 work: 0. Git writes: 0. Deployments: 0. R8N paths touched: 0.
