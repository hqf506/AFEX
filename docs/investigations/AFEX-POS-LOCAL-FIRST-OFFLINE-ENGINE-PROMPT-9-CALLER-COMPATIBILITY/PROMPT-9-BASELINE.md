# Prompt 9 baseline

## Repository gate

- Repository root: `C:/Users/NSC-LUA/Desktop/leather-fix-erp-pos-responsive`
- Required branch: `codex/pos-responsive-redesign`
- Observed branch: `codex/pos-responsive-redesign`
- Required HEAD: `37331390ec00bee507f88701365bfebb944db675`
- Observed HEAD: `37331390ec00bee507f88701365bfebb944db675`
- Upstream ahead/behind: `0/0`
- Staged paths before investigation: `0`
- Tracked changed paths before investigation: `12`
- Total `git status --short` entries before investigation: `50`
- R8N status entries counted without opening them: `29`
- Prompt 9 target directory existed before investigation: `NO`
- Inherited tracked application diff Git-object identity: `f2cc98137dc505b495da608ec5ba38d3c0293670` — `MATCH`
- Gate result: `PASS`

The twelve inherited tracked paths were recorded read-only. They remain user-owned Phase 1–4 work; Prompt 9 does not reinterpret or modify them.

## Historical evidence identities

| Package manifest | SHA-256 | Result |
| --- | --- | --- |
| Original investigation | `c0bde8133a1b7e849c92e80061d03c2adab709000da6d6d334e80d13d9cdbde1` | MATCH |
| Phase 0 | `85e498f3ee3da9e8772113a474b8aa14d684009002326ac48607dead1377f9d5` | MATCH |
| Phase 1 | `34599e8acc1c1776ddd662af24594e26b98d6cef35c17aee56b16c26c81cea4a` | MATCH |
| Phase 2 | `39fe697cfbc0b8aedf480d2c195426e29786c9f0724520aeeaee58eac2e80c52` | MATCH |
| Phase 3 | `a44d30d44315b89a12743e5a7a21075431829255a5da4270b1a65ee12ccba6cf` | MATCH |
| Phase 4 | `1b4f9c0cfd7a3d734dda1b776800073eac3e0630416c0a8e2f381fdb8f475f6b` | MATCH |
| Production read-only attestation | `156c5039982267874011aa13df7a403f867eaacfd9b93637541842ab134a14a6` | MATCH |
| Security/authority investigation | `4c9cd44115bbff46adaeae1dc2914021fbf37c705e9f1d214db4c7e171b419f1` | MATCH |
| Authority correction design | `535152c74f9a06f2e536de80e8872c48a6e95c02c0bf782ed205f0c165f4d7b1` | MATCH |
| Prompt 8 SQL review | `ea950deece0dfc98632a34113e6b2b4915eb5065bbf1920b8a3f8fa9bdc70724` | MATCH |

## Investigation boundary

This package is an Offline, repository-only compatibility map. It did not execute or generate SQL; contact Supabase, PostgreSQL, Docker, Vercel, an application endpoint, or Production; or perform a business write. Static source can prove construction and data flow, but cannot prove current Production grants, policies, object identities, external platform callers, latency, or runtime lock behavior.

## Preserved inherited decisions

`MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE`, `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY`, `OPPORTUNISTIC_NOT_MANDATORY`, informational-only synchronization age, one managed device per branch initially, up to 25 pre-enrolled Offline employees, eight distinct payment methods, employee-attestation-only Offline payment authority, and Core V2 as the only future official order/invoice engine remain unchanged.

## Tracked paths observed at the gate

- `app/pos/employee-pin/page.tsx`
- `app/pos/offline-drafts/page.tsx`
- `app/pos/page.tsx`
- `app/pos/settings/page.tsx`
- `components/auth-state-provider.tsx`
- `components/dev-cache-reset.tsx`
- `components/pos-shell-layout.tsx`
- `components/pos-shell/pos-confirmation-dialog.tsx (deleted in inherited worktree)`
- `components/pos-shell/pos-responsive-shell.tsx`
- `lib/pos-employee-session.ts`
- `lib/pos-offline-draft.ts`
- `public/sw.js`

## Evidence status vocabulary

- `STATIC_SOURCE_PROOF`: exact repository code or migration text was observed.
- `HISTORICAL_PRODUCTION_EVIDENCE`: inherited approved read-only evidence; not refreshed by Prompt 9.
- `STATIC_INFERENCE`: reasoned consequence explicitly not promoted to runtime proof.
- `UNPROVEN`: repository evidence cannot establish the required identity or behavior.



