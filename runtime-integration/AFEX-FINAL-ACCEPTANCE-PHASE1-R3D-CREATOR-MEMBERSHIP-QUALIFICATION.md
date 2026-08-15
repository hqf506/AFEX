# AFEX Final Acceptance Phase 1-R3D — Creator Membership Qualification

## Scope and boundaries

- Worktree: `C:\Users\NSC-LUA\Desktop\leather-fix-erp-final-acceptance-phase1-r1`
- Branch: `codex/final-acceptance-phase1-r1`
- HEAD: `b3e8b2870a504927d020d20e6488ef81943cc35f`
- Preview/Production connections: 0.
- Git writes and PR #18 updates: 0.
- Runtime/browser qualification: not started in R3D.
- P2D.15/P2D.19/P2D.20 and the R3C adapter were not modified.

## Discovered roles and topology

R2 creates exactly two roles after a preflight that rejects any prior R2 authority object:

| Created role | Member | Grantor | ADMIN | INHERIT | SET | Creator | Lifecycle |
|---|---|---|---:|---:|---:|---|---|
| `afex_pos_session_owner` | `postgres` | topology-derived `supabase_admin` | true | false | false | authenticated installer `postgres` | retained creator-administration evidence |
| `afex_pos_session_maintenance` | `postgres` | topology-derived `supabase_admin` | true | false | false | authenticated installer `postgres` | retained creator-administration evidence |

The migration does not hard-code either identity as runtime authority. It proves `current_user=session_user`, LOGIN=true, SUPERUSER=false, CREATEROLE=true, and derives the one accepted creator grantor from the five existing Core creator edges. It fails unless all five Core edges and both new R2 edges have the exact closed options and common grantor.

## Exact membership lifecycle

The lifecycle probe produced the same matrix on Vanilla PostgreSQL 17.6 and Supabase Local PostgreSQL 17.6:

| Stage | Total edges | Creator-admin edges | SET-capable edges | Dangerous edges |
|---|---:|---:|---:|---:|
| Before R2 role creation | 0 | 0 | 0 | 0 |
| After role creation | 2 | 2 | 0 | 0 |
| During owner-sensitive DDL | 4 | 2 | 2 | 2 temporary, grantor-scoped |
| After SET removal / committed state | 2 | 2 | 0 | 0 |
| After injected transaction rollback | 0 probe roles | 0 probe edges | 0 | 0 |

The temporary edges are granted by the verified installer with ADMIN=false, INHERIT=false, SET=true. They are revoked by that exact grantor. The automatic creator edges are never revoked or rewritten.

## Dual-environment qualification

| Gate | Vanilla PostgreSQL 17.6 | Supabase Local PostgreSQL 17.6 |
|---|---|---|
| Installer identity | PASS | PASS |
| Core P2D.15 → P2D.19 → P2D.20 | PASS, original | PASS, R3C adapter only for P2D.15 |
| R2 clean parser/install | PASS | PASS |
| Expected creator-administration edges | 2 | 2 |
| Dangerous runtime memberships | 0 | 0 |
| SET-capable memberships after install | 0 | 0 |
| Inherited memberships after install | 0 | 0 |
| Unexpected memberships | 0 | 0 |
| Runtime-role memberships | 0 | 0 |
| Owner role property violations | 0 | 0 |
| RLS/FORCE RLS violations | 0 | 0 |
| Function owner/SECURITY DEFINER/search_path violations | 0/7 | 0/7 |
| Reinstallation | rejected before mutation | rejected before mutation |

The normalized Core catalog remained identical across environments. Both snapshots have SHA-256 `bb811ccf6196bd384f91596ca1d4620110baf82975fabdb24a02f0c923bb4628`; semantic delta is zero.

The seven R2 function-definition MD5 values matched exactly between environments:

- `afex_pos_authority.enforce_actor_session_transition()` — `73c1e7a6fc6e4cc24d67571940abc9ad`
- `cleanup_pos_actor_sessions_v1(integer)` — `1c43cdd1549feba02ef6129d95a3333e`
- `issue_pos_actor_session_v1(text,uuid,uuid,text,uuid)` — `c3f65dbebc9eb8a05df5a8ac22507ffb`
- `pos_actor_session_state_v1(uuid,uuid)` — `bd569974dc0009b5d9b5cf5a4d84fca6`
- `revoke_pos_actor_sessions_for_actor_v1(uuid,uuid,uuid,text)` — `8ef3adc05317ca39d8b4865187763afd`
- `revoke_pos_actor_session_v1(text,uuid,uuid,text)` — `d8fb60d090c3ccefc1ef015ea5613baa`
- `validate_pos_actor_session_v1(text,uuid,uuid)` — `7e826a160bb581f03d7f802cf5063cbe`

## Negative membership matrix

Nine cases passed in both environments, with every injected mutation rolled back:

1. `service_role` member — rejected.
2. `authenticated` member — rejected.
3. SET=true edge — rejected.
4. INHERIT=true edge — rejected.
5. Wrong member (`anon`) — rejected.
6. Wrong grantor / installer-granted permanent edge — rejected.
7. Owner-role name outside the closed allowlist — rejected.
8. Parallel edge — rejected.
9. Missing expected creator edge — rejected by synthetic omission from the evaluated catalog set; the real automatic edge was not deleted.

## Rollback and concurrency boundary

Six transaction boundaries were reached and rolled back in both environments: after role creation, temporary SET grant, schema creation, table creation, function creation, and runtime grant. Each left zero probe roles, schemas, tables, functions, policies, and membership edges. Failure after SET left no SET-capable edge. Reinstallation returned `POS_SESSION_AUTHORITY_ALREADY_PRESENT` before mutation and preserved 2 roles, 2 safe creator edges, 0 dangerous edges, and 2 private relations.

## Static/application checks

- R2 focused security tests: 12/12 PASS.
- `git diff --check`: PASS; only existing line-ending notices were emitted.
- Original R2 function bodies: unchanged by R3D.
- Owners, ACL, RLS, policies, constraints, indexes, triggers, SECURITY DEFINER and fixed `search_path=pg_catalog`: unchanged semantically and equal across environments.

## Safety accounting

- Preview connections/actions: 0/0.
- Production connections/actions: 0/0.
- Runtime/browser invocations: 0.
- Business checkouts/replays: 0/0.
- SQL execution environments: isolated Vanilla and Supabase Local clones only.
- Direct system-catalog writes: 0; normal transactional role DDL was used only on disposable clones.
- Superuser execution of R2: 0.
- Automatic creator-edge forced deletions: 0.
- Git add/commit/push: 0/0/0.
- PR #18 updates: 0.

## Verdict

AFEX POS ACTOR SESSION R2 CREATOR-MEMBERSHIP CONTRACT CORRECTED AND DUAL-ENVIRONMENT CLONE-QUALIFIED — READY TO RESUME RUNTIME QUALIFICATION
