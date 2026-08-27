# SQL Review Baseline

## Authority and execution boundary

This package is a standalone Offline review artifact for Prompt 8 of 10. It is not a migration, is not in an active migration directory, and authorizes no SQL, database, network, Supabase, Docker, Production, deployment, Git-write, Prompt 9, or Phase 5 action.

The selected policy remains:

- `MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE`
- `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY`
- `OPPORTUNISTIC_NOT_MANDATORY`
- `ON_TRUSTED_RECONNECT_OR_AUTHORIZED_LOCAL_LOCK`
- residual Mode A risk human-approved

## Repository gate

| Check | Result |
| --- | --- |
| Repository root | `C:/Users/NSC-LUA/Desktop/leather-fix-erp-pos-responsive` |
| Branch | `codex/pos-responsive-redesign` |
| HEAD | `37331390ec00bee507f88701365bfebb944db675` |
| Upstream | `origin/codex/pos-responsive-redesign` |
| Ahead / behind | `0 / 0` |
| Staged paths | `0` |
| Pre-existing status entries | `50` |
| Pre-existing tracked modified/deleted paths | `12` |
| R8N status entries | `29`, names summarized from `git status` only; no R8N file opened |
| Tracked application binary-diff Git object identity | `f2cc98137dc505b495da608ec5ba38d3c0293670` |
| Gate result | `PASS` |

The twelve pre-existing tracked paths are unchanged by this package: `app/pos/employee-pin/page.tsx`, `app/pos/offline-drafts/page.tsx`, `app/pos/page.tsx`, `app/pos/settings/page.tsx`, `components/auth-state-provider.tsx`, `components/dev-cache-reset.tsx`, `components/pos-shell-layout.tsx`, deletion of `components/pos-shell/pos-confirmation-dialog.tsx`, `components/pos-shell/pos-responsive-shell.tsx`, `lib/pos-employee-session.ts`, `lib/pos-offline-draft.ts`, and `public/sw.js`.

## Approved manifest identities

All entries inside every listed manifest were recomputed and matched before package creation.

| Evidence | Manifest SHA-256 | Entries |
| --- | --- | ---: |
| Original investigation | `c0bde8133a1b7e849c92e80061d03c2adab709000da6d6d334e80d13d9cdbde1` | 16/16 |
| Phase 0 | `85e498f3ee3da9e8772113a474b8aa14d684009002326ac48607dead1377f9d5` | 14/14 |
| Phase 1 | `34599e8acc1c1776ddd662af24594e26b98d6cef35c17aee56b16c26c81cea4a` | 13/13 |
| Phase 2 | `39fe697cfbc0b8aedf480d2c195426e29786c9f0724520aeeaee58eac2e80c52` | 14/14 |
| Phase 3 | `a44d30d44315b89a12743e5a7a21075431829255a5da4270b1a65ee12ccba6cf` | 16/16 |
| Phase 4 | `1b4f9c0cfd7a3d734dda1b776800073eac3e0630416c0a8e2f381fdb8f475f6b` | 23/23 |
| Production read-only attestation | `156c5039982267874011aa13df7a403f867eaacfd9b93637541842ab134a14a6` | 16/16 |
| Security authority investigation | `4c9cd44115bbff46adaeae1dc2914021fbf37c705e9f1d214db4c7e171b419f1` | 18/18 |
| Authority correction design | `535152c74f9a06f2e536de80e8872c48a6e95c02c0bf782ed205f0c165f4d7b1` | 22/22 |

## Approved Phase source identities

The following 18 current files matched their approved SHA-256 values:

| Path | SHA-256 |
| --- | --- |
| `lib/pos-employee-session.ts` | `812df45dd14f66c21717b5a943552437a415eab3f5fc46196f732716497c620b` |
| `components/auth-state-provider.tsx` | `7e3b72757bfd8a62f4145d57ad76a01b144f9ad5bbb4c112ddce55e3e6010e34` |
| `components/pos-shell/pos-responsive-shell.tsx` | `9fecfb5f5510d1618d019e9cbdf5ad8c19b255e533914d1812e38db13dbc95d8` |
| `app/pos/settings/page.tsx` | `72be80eae69ecafe85dad2a8feecbd97cd384567664974830dfca6920c43eb92` |
| `app/pos/page.tsx` | `4ea33df684ed50ddc665b9388edfabb74f827dfb9d10734712379389217d336e` |
| `app/pos/employee-pin/page.tsx` | `355b758f853a2528c1dc2a67d663ea7c4eef4d324974d0c3885fbb40779b9633` |
| `public/sw.js` | `eebdfef33c18547052c2ca623c4e9927356b588b574fbb11abaf825d30a17151` |
| `components/dev-cache-reset.tsx` | `896801152d821cebe76ed3b8d003d451e9b98f49f2eea76495af18c5e1cbae6d` |
| `components/pos-offline-shell-registration.tsx` | `2064bc8d8b2e5d5c2f8005c8fbaa557847c45adc2090dc5a09465badc5c03a18` |
| `public/pos/offline-shell.html` | `cbbac7e4abb0c645945ee035c0549c1991de4b71431b10c5c0db6ec46f0252b8` |
| `components/pos-shell-layout.tsx` | `0d4307976ebea340535a643c3a4776f5536aaafdda64524f48124e477e39b392` |
| `tests/pos-offline-phase1.test.mjs` | `6a6be7f0be53cf62ba14fb2cdae8a605267cb154447ac622ac54b2fa9d34a46f` |
| `lib/offline/phase1.ts` | `f9198bd7029a51c517ea37eb44f3c079a3269a199e7f606e248daa95476eccfd` |
| `lib/offline/phase2.ts` | `c376ee4a5000f5e2b8e24b1ced0758019fbf22352a469f778f9e30320084298b` |
| `lib/offline/phase3.ts` | `68f3a8035c95061ec95eab883be403328f6bcaeb54419a15308e9a338cd23cb0` |
| `components/pos-logout-retention-dialog.tsx` | `42d6f6ce3e3032f07cf0f961818903b76c590384f048e8662a2ecd2500473bd0` |
| `tests/pos-offline-phase2.test.mjs` | `5645f1740cedf9b9719ae8157ddf10bf43e3bc155b7dbb2885e349153d28f7cb` |
| `tests/pos-offline-phase3.test.mjs` | `d0ce8f05acecfcd13161457b6f8d7f3bf4e4f9f066330155b090c10dbd76e665` |

## Source-of-truth boundary

Repository SQL was used only to corroborate frozen object shapes. Approved Production read-only evidence remains authoritative for current identity. No historical migration was treated as proof of current Production state. Unsupported identities are recorded as `BLOCKED_INSUFFICIENT_EVIDENCE`, and their files contain no unsafe executable statement.

No SQL, database, Supabase, Docker, network, Production, business action, package installation, Git stage, commit, push, merge, deployment, Prompt 9, or Phase 5 operation occurred.
