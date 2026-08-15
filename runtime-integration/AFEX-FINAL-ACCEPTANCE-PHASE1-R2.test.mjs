import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const auth = read('lib/authorization-context.ts')
const apiAuth = read('lib/api-auth.ts')
const session = read('lib/pos-actor-session-server.ts')
const pin = read('app/api/pos/identify-employee-by-pin/route.ts')
const adminLayout = read('app/admin/layout.tsx')
const endSession = read('app/api/pos/end-actor-session/route.ts')
const verifiedAuth = read('lib/verified-auth-context.ts')
const migration = read('supabase/migrations/20260814233000_pos_actor_sessions.sql')

test('opaque cookie is HttpOnly, strict, secure in production and bounded', () => {
  assert.match(session, /httpOnly: true/)
  assert.match(session, /sameSite: 'strict'/)
  assert.match(session, /secure: process\.env\.NODE_ENV === 'production'/)
  assert.match(session, /POS_ACTOR_MAX_AGE_SECONDS = 8 \* 60 \* 60/)
})

test('server verifies one access token with claims and current user before binding RPC authority', () => {
  assert.match(verifiedAuth, /getSession\(\)/)
  assert.match(verifiedAuth, /getClaims\(accessToken\)/)
  assert.match(verifiedAuth, /getUser\(accessToken\)/)
  assert.match(verifiedAuth, /user\.id !== subjectId/)
  assert.match(verifiedAuth, /import 'server-only'/)
  assert.match(session, /p_authenticated_session_id/)
  assert.doesNotMatch(migration, /auth\.(users|sessions)/i)
  assert.doesNotMatch(migration, /schema public, auth/i)
})

test('server uses narrow RPCs and never performs authority-table CRUD', () => {
  for (const rpc of ['issue_pos_actor_session_v1','validate_pos_actor_session_v1','pos_actor_session_state_v1','revoke_pos_actor_session_v1']) {
    assert.match(session, new RegExp(rpc))
  }
  assert.doesNotMatch(session, /\.from\(['"]pos_actor_sessions['"]\)/)
})

test('missing or invalid actor cookie fails closed without Owner fallback', () => {
  assert.match(auth, /isPosActorRestrictionRequired/)
  assert.match(auth, /missingCookieRestriction/)
  assert.match(auth, /suppliedPosToken && !effectivePosActor/)
  assert.match(auth, /status: 401/)
})

test('effective POS actor replaces underlying profile role and branch', () => {
  assert.match(auth, /role: effectivePosActor\.role/)
  assert.match(auth, /branch_id: effectivePosActor\.branchId/)
  assert.match(auth, /posEmployee: effectivePosActor/)
})

test('Cashier and Employee effective actors cannot call Admin APIs', () => {
  assert.match(apiAuth, /startsWith\('\/api\/admin\/'\)/)
  assert.match(apiAuth, /!isFullAdmin\(result\.context\.role\)/)
  assert.match(apiAuth, /status: 403/)
})

test('support and developer APIs cannot bypass the effective POS actor', () => {
  const support = read('lib/support/server.ts')
  const developer = read('lib/developer/server.ts')
  assert.match(support, /requireAuthorizationContext/)
  assert.match(support, /context\.posEmployee/)
  assert.doesNotMatch(support, /auth\.getUser\(\)/)
  assert.match(developer, /requireVerifiedAuthContext/)
  assert.match(developer, /isPosActorRestrictionRequired/)
  assert.match(developer, /resolvePosActorSession/)
  assert.doesNotMatch(developer, /auth\.getUser\(\)/)
})

test('Admin layout enforces missing-cookie and effective-actor state', () => {
  assert.match(adminLayout, /requireVerifiedAuthContext/)
  assert.match(adminLayout, /isPosActorRestrictionRequired/)
  assert.match(adminLayout, /missingCookieRestriction/)
})

test('PIN success issues through database authority and sets only opaque cookie', () => {
  assert.match(pin, /issuePosActorSession/)
  assert.match(pin, /verifiedAuth: auth\.context\.verifiedAuth/)
  assert.match(pin, /rawPin: pin/)
  assert.match(pin, /response\.cookies\.set/)
})

test('order employee identity remains pinned to effective actor', () => {
  const orders = read('app/api/orders/route.ts')
  assert.match(orders, /auth\.context\.posEmployee\?\.id/)
  assert.match(orders, /POS actor mismatch/)
})

test('ending POS mode performs trusted ADMIN_REAUTH revocation and Auth logout', () => {
  const client = read('lib/pos-employee-session.ts')
  assert.match(endSession, /requireVerifiedAuthContext/)
  assert.match(endSession, /'ADMIN_REAUTH'/)
  assert.match(client, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/)
})

test('private authority ACL, forced RLS, maintenance separation and retention are closed', () => {
  assert.match(migration, /create schema afex_pos_authority/i)
  assert.match(migration, /force row level security/i)
  assert.match(migration, /to afex_pos_session_maintenance/i)
  assert.match(migration, /POS_SESSION_CREATOR_MEMBERSHIP_CONTRACT_INVALID/)
  assert.match(migration, /admin true, inherit false, set false/i)
  assert.match(migration, /dangerous|set_option|inherit_option/i)
  assert.doesNotMatch(migration, /POS_SESSION_TEMPORARY_MEMBERSHIP_REMAINS/)
  assert.doesNotMatch(migration, /cleanup_pos_actor_sessions_v1\(integer\)[\s\S]{0,80}to service_role/i)
  assert.match(migration, /interval '90 days'/)
})

test('activation is serialized by collision-free authority row and source reads use shared locks', () => {
  assert.match(migration, /auth_session_locks/)
  assert.match(migration, /primary key \(authenticated_subject_id, authenticated_session_id\)/i)
  assert.match(migration, /on conflict \(authenticated_subject_id, authenticated_session_id\)[\s\S]*do update set created_at = l\.created_at/i)
  assert.match(migration, /for share of p/i)
  assert.match(migration, /for share;/i)
})

test('database authority stores only verified identifiers and has no Auth schema privilege', () => {
  assert.match(migration, /authenticated_subject_id uuid not null/i)
  assert.match(migration, /authenticated_session_id uuid not null/i)
  assert.doesNotMatch(migration, /grant[^;]+auth\./i)
  assert.doesNotMatch(migration, /references auth\./i)
  assert.doesNotMatch(migration, /auth\.(users|sessions)/i)
  assert.doesNotMatch(migration, /jwt|access_token|refresh_token/i)
})

test('permanent issuance tombstone remains restrictive for the same verified Auth session', () => {
  assert.match(migration, /authority_issued_at timestamptz/)
  assert.match(migration, /set authority_issued_at = coalesce\([\s\S]*greatest\(l\.created_at, v_now\)/)
  assert.match(migration, /restriction_required := v_restriction_tombstone/)
  assert.match(migration, /when v_revoked > 0 then 'REVOKED'/)
  assert.match(migration, /when v_restriction_tombstone then 'REVOKED'/)
})

test('validation locks and verifies the live organization profile', () => {
  const validate = migration.slice(
    migration.indexOf('create function public.validate_pos_actor_session_v1'),
    migration.indexOf('create function public.pos_actor_session_state_v1')
  )
  assert.match(validate, /from public\.profiles p[\s\S]*for share of p/)
  for (const reason of ['SUBJECT_DELETED', 'SUBJECT_DISABLED', 'SUBJECT_TENANT_CHANGED', 'SUBJECT_ROLE_CHANGED']) {
    assert.match(validate, new RegExp(reason))
  }
})

test('issuance re-verifies the PIN after actor and branch locks are held', () => {
  assert.match(migration, /for share of pp, b;[\s\S]*v_reverified_actor_ids/)
  assert.match(migration, /v_reverified_actor_ids\[1\] is distinct from v_actor\.id/)
})

test('revoke validates a closed token hash before mutation', () => {
  const revoke = migration.slice(
    migration.indexOf('create function public.revoke_pos_actor_session_v1'),
    migration.indexOf('create function public.revoke_pos_actor_sessions_for_actor_v1')
  )
  assert.match(revoke, /p_token_hash is null or p_token_hash !~ '\^\[0-9a-f\]\{64\}\$'/)
})

test('maintenance cleanup retains evidence and removes only bounded old orphan locks', () => {
  assert.match(migration, /l\.created_at < clock_timestamp\(\) - interval '90 days'/)
  assert.match(migration, /l\.authority_issued_at is null/)
  assert.match(migration, /not exists \([\s\S]*from afex_pos_authority\.actor_sessions/)
  assert.match(migration, /for update of l skip locked/)
  assert.doesNotMatch(migration, /grant execute on function public\.cleanup_pos_actor_sessions_v1\(integer\) to service_role/)
})
