# AFEX Final Acceptance Phase 1-R4D — SQL and Security Review

## Boundary

The corrected migration was qualified on disposable Vanilla PostgreSQL 17.6 and Supabase Local PostgreSQL 17.6 clones, then installed exactly once on Production through the official Supabase runner. Preview runtime was not started before the Production catalog assertions passed.

R4D SHA-256 is `a20cb4fbcf64c6b4c1c05285e49eb473e52192db2040e8ee78ce5feffcf4a521` (43,644 bytes; 1,048 LF-only lines). The complete reviewed object/function payload remains byte-identical to R4C: SHA-256 `090f4af4b917a92b12f7452005f910770c24059186b6bc153352f6e94f52a664`, 23,389 bytes.

## R4D installer adaptation

1. The migration accepts only direct temporary-login entry or the official Supabase runner's pre-set `postgres` entry. Both prove a non-superuser LOGIN session without CREATEROLE and with lawful SET authority to `postgres`.
2. Direct entry activates `postgres` transaction-locally; runner-pre-set entry performs no redundant transition. A third effective role, superuser, missing SET, or attribute/topology drift fails before mutation.
3. All creator/member/grantee lifecycle references after activation use the effective `current_user`. Temporary owner SET edges belong only to `postgres`, are removed by `postgres`, and the provider-granted creator-administration edges remain unchanged.
4. Commit restores the temporary login automatically. No SET SESSION AUTHORIZATION, direct `supabase_admin` execution, catalog write, permanent wrapper membership, or Supabase-object ownership change exists.

## Preserved R4B corrections

1. `validate_pos_actor_session_v1` locks `public.profiles` for the server-verified subject on every identified-session validation. Missing, disabled, tenant-changed, or role-invalid profiles revoke/fail closed before effective context is returned.
2. `auth_session_locks.authority_issued_at` is the permanent restriction tombstone keyed by authenticated subject and Auth session ID. Successful issuance sets it transactionally; elapsed-time cleanup never removes it.
3. Issuance uses one conflict-updating UPSERT to serialize with cleanup. Cleanup may delete only old pre-issuance orphan rows whose tombstone is null. Detailed evidence is independently eligible after 90 days.
4. A same-session state with only a tombstone returns `REVOKED` and `restriction_required=true`; only a new verified Auth session ID with no tombstone returns `NO_RESTRICTION`.

## Preserved authority

- No Auth-schema/table reads, FKs, grants, preflights, or assertions.
- `VerifiedAuthContext` remains server-only and derives subject/session only from verified claims and current user.
- All authority functions remain SECURITY DEFINER with `search_path=pg_catalog`.
- Private relations retain forced RLS and owner-only CRUD.
- `service_role` receives approved function EXECUTE only and cannot execute cleanup.
- Owner and maintenance roles remain NOLOGIN/NOINHERIT; dangerous, SET-capable, and unexpected runtime memberships remain zero.

## Evidence

Vanilla and Supabase Local passed both entry modes, clean install, catalog/ACL/RLS/owner/search-path checks, and exact membership accounting. The 17-case negative/failure matrix passed. Production installation through `supabase db push` committed once; post-install verification found one migration record, two forced-RLS relations, seven fixed-search-path SECURITY DEFINER functions, five service runtime grants, no cleanup grant, and zero unexpected membership edges.

The bounded local application runtime proved official local organization authentication, invalid PIN denial, valid PIN issuance, and Admin-page containment. It did not install or emulate Core business persistence and does not claim checkout/replay qualification.
