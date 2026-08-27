# SQL Authority Baseline

## Repository gate

- Repository: `C:\Users\NSC-LUA\Desktop\leather-fix-erp-pos-responsive`
- Branch: `codex/pos-responsive-redesign`
- HEAD and baseline: `37331390ec00bee507f88701365bfebb944db675`
- Upstream ahead/behind: `0/0`
- Staged paths: `0`
- Inherited tracked content changes: `16`, matching the approved Phase 1–3/Application Compatibility state.
- `git status --short` reports `17` inherited tracked paths because
  `app/api/admin/inventory-movements/route.ts` is a pre-existing worktree
  metadata/line-ending status entry whose worktree blob
  (`e27dd89a2572f2bbf0c8d6e6f137932c4f6ec1d8`) is byte-identical to its
  HEAD/index blob. It contributes no content diff.
- `runtime-integration/R8N-*` was not opened or modified.

## Approved input identity gate

All thirteen historical Local-First manifests were parsed and every referenced file hash verified:

| Package | Manifest SHA-256 | Coverage |
|---|---|---:|
| Original investigation | `c0bde8133a1b7e849c92e80061d03c2adab709000da6d6d334e80d13d9cdbde1` | 16/16 |
| Phase 0 | `85e498f3ee3da9e8772113a474b8aa14d684009002326ac48607dead1377f9d5` | 14/14 |
| Phase 1 | `34599e8acc1c1776ddd662af24594e26b98d6cef35c17aee56b16c26c81cea4a` | 13/13 |
| Phase 2 | `39fe697cfbc0b8aedf480d2c195426e29786c9f0724520aeeaee58eac2e80c52` | 14/14 |
| Phase 3 | `a44d30d44315b89a12743e5a7a21075431829255a5da4270b1a65ee12ccba6cf` | 16/16 |
| Phase 4 | `1b4f9c0cfd7a3d734dda1b776800073eac3e0630416c0a8e2f381fdb8f475f6b` | 23/23 |
| Security authority investigation | `4c9cd44115bbff46adaeae1dc2914021fbf37c705e9f1d214db4c7e171b419f1` | 18/18 |
| Authority correction design | `535152c74f9a06f2e536de80e8872c48a6e95c02c0bf782ed205f0c165f4d7b1` | 22/22 |
| Corrected Prompt 8 SQL review | `ea950deece0dfc98632a34113e6b2b4915eb5065bbf1920b8a3f8fa9bdc70724` | 25/25 |
| Prompt 9 caller compatibility | `2a3a6517581c6ce0c1c735f2ecc9ca7789aaf5d5e195fc3a6d5d072c332b62e6` | 17/17 |
| Corrected Prompt 10 attestation | `101d1e6fc4d6ce8293971100330efe16023e8fcbc1858bd7b73aa7d070cb99bc` | 22/22 |
| Corrected Application Compatibility | `cb68473b6879c661b4a611f87322a1e383a7c6da4466e54a986ede6f74490084` | 13/13 |
| Corrected Core bridge | `74d5ea23460fc968f4b99adaf7b3163cdf3a1d5ac0f8ae41aca49fd1f528d50c` | 17/17 |

Corrected bridge source and tests also match `8f38382eee6320602c7ef9fcd2db825296b4c0bc74e2f8c3678d3ab879b05202` and `ef15b893dffcfba93ba0e0c3257c9d3f8a8fbd42e69ff22a89da7a6e7b93bbb7`.

## Reconciliation boundary

Prompt 10 remains the read-only Production baseline for 31 curated relation/view identities, 14 roles, 11 memberships, 99 policies, 36 relevant functions, 206 constraints, and 113 indexes. Nothing in this review-only candidate is claimed to exist in Production.

The inactive candidate now defines 11 private relations, 34 versioned/support routines, four acquisition contracts, 15 trusted provisioning contracts, and separate NOLOGIN provisioning/acquisition roles. The initial database Pilot allowlist is exactly `ARRAY['order.create']::text[]`; the seven other command types remain rejected. The corrected Core bridge remains disabled and has zero business callers.

No SQL or database connection was executed while creating this package.

## Account bootstrap and employee-selection correction

The candidate adds managed-device authority, a structured employee-selector verifier, PIN-independent device encryption metadata, immutable inventory snapshots, verified Online account bootstrap, explicit logout/revocation/same-account recovery, an immutable Core authorization companion, private validators, and the four `order.create` Pilot functions. Historical Core tables and routine identities remain authoritative and are not rewritten.

The employee PIN is never account authentication, tenant/branch/device authority, a Supabase credential, or a DEK derivation/wrap/unwrap factor. It selects one pre-enrolled employee only after a verified Online establishment login has established account, tenant, branch, POS actor, and device authority. Restart without explicit logout requires the PIN again but not Internet; explicit logout requires same-account Online reauthentication and retains pending commands encrypted and inaccessible.

This supersedes the earlier PIN-derived persistent-unwrap interpretation and the earlier `BLOCKED_WITH_EXACT_FINITE_LIST` decision for the finite inactive review surface only. Seven non-pilot command writers, provider reconciliation, client ciphertext implementation, runtime activation, and legacy closure remain outside this Pilot. Database execution, PostgreSQL parsing, catalog attestation, concurrency, RLS hostility, and rollback qualification remain `DESIGNED_NOT_EXECUTED`.

This correction authorizes neither SQL execution nor Pilot activation.
