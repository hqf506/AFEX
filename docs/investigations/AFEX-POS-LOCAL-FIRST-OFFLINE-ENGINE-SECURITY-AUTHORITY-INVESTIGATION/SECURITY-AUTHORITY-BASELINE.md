# AFEX POS Local-First Offline Engine — Security Authority Baseline

## Scope

This package is an independent Offline investigation of PostgreSQL/Supabase role topology, schema and object ACLs, RLS composition, `SECURITY DEFINER` reachability, view exposure, application-to-database authority flows, tenant/branch isolation, and the prerequisites for any future Offline acceptance path. It creates evidence only. It does not contain corrective SQL, a migration, executable database work, Phase 5 implementation, or an approval to pilot Offline writes.

## Repository gate

| Check | Observed |
| --- | --- |
| Repository root | `C:/Users/NSC-LUA/Desktop/leather-fix-erp-pos-responsive` |
| Branch | `codex/pos-responsive-redesign` |
| HEAD | `37331390ec00bee507f88701365bfebb944db675` |
| Upstream ahead/behind | `0/0` |
| Staged paths | `0` |
| Investigation directory before work | absent |
| Phase 5 | not started |

The inherited application worktree contained 11 modified tracked files and one deleted tracked file from the approved Phase 1–3 work. They were not edited. Untracked R8N material was summarized only from `git status`: 1,062 status entries across 29 top-level R8N groups. No R8N file was opened, hashed, archived, included, or modified.

## Evidence identity gate

All historical manifests were revalidated against their directories before analysis:

| Evidence set | Manifest SHA-256 | Covered files | Result |
| --- | --- | ---: | --- |
| Original Offline investigation | `c0bde8133a1b7e849c92e80061d03c2adab709000da6d6d334e80d13d9cdbde1` | 16/16 | PASS |
| Phase 0 | `85e498f3ee3da9e8772113a474b8aa14d684009002326ac48607dead1377f9d5` | 14/14 | PASS |
| Phase 1 | `34599e8acc1c1776ddd662af24594e26b98d6cef35c17aee56b16c26c81cea4a` | 13/13 | PASS |
| Phase 2 | `39fe697cfbc0b8aedf480d2c195426e29786c9f0724520aeeaee58eac2e80c52` | 14/14 | PASS |
| Phase 3 | `a44d30d44315b89a12743e5a7a21075431829255a5da4270b1a65ee12ccba6cf` | 16/16 | PASS |
| Phase 4, after approved message correction | `1b4f9c0cfd7a3d734dda1b776800073eac3e0630416c0a8e2f381fdb8f475f6b` | 23/23 | PASS |
| Production read-only attestation | `156c5039982267874011aa13df7a403f867eaacfd9b93637541842ab134a14a6` | 16/16 | PASS |

The Phase 2/3 source identities recorded in their file inventories matched the current worktree for 12/12 hashed source/test/static files. Phase 1 items without recorded file hashes matched the declared present/deleted path state. No discrepancy blocks this investigation.

The earlier Production attestation baseline recorded a pre-correction Phase 4 manifest identity. The later human-approved Phase 4 inventory-message correction rebuilt that manifest; the current `1b4f9...` identity is the controlling evidence. This is chronological evidence evolution, not application or database drift.

## Authoritative sources and precedence

1. Approved Production read-only attestation dated 2026-08-25: current object/role summaries, targeted function hashes, bounded counts, advisor findings, and repository/Production drift classifications.
2. Frozen Production schema/catalog evidence under `database-reconciliation/evidence/` and `database-reconciliation/baseline/`: exact legacy policy expressions, grants, owners, function signatures, and view definition. This evidence is older than the final Core/POS migrations and is used only where corroborated by the later attestation.
3. Migration sources whose Production migration identity is attested as matched: Core V2 system-scope authorization, POS actor sessions, and POS actor source RLS.
4. Active application routes and server libraries at the gated worktree identity.
5. Phase 0–4 design evidence and approved product decisions.

When sources differ, current Production attestation wins. Repository-only facts are marked `SOURCE_ONLY`; inferred composition is marked `INFERRED`; missing current catalog detail is `UNKNOWN`. No expected value is promoted to Production fact without an approved capture.

## Locked product decisions

- `MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE`
- `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY`
- `OPPORTUNISTIC_NOT_MANDATORY`
- `ON_TRUSTED_RECONNECT_OR_AUTHORIZED_LOCAL_LOCK`
- `HUMAN_APPROVED`

These decisions do not authorize persistent unwrap, durable commands, dispatch, replay, SQL, a database change, pilot, or Phase 5.

## Safety accounting

Production/database/network connections: 0. SQL executions: 0. SQL or migration drafts: 0. Application/Core/package/config/test changes: 0. Historical evidence changes: 0. R8N files inspected or changed: 0. Git writes: 0. Deployments: 0. Business effects: 0. Phase 5 work: 0.
