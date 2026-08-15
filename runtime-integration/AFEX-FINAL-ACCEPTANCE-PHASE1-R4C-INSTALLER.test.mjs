import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20260814233000_pos_actor_sessions.sql', 'utf8')
const sha256 = createHash('sha256').update(Buffer.from(migration, 'utf8')).digest('hex')

test('rejected and superseded identities are not the R4D migration', () => {
  assert.notEqual(sha256, '9207966b13e0775ebe9122308b1af87d259e675407f553c4e341effc05949b74')
  assert.notEqual(sha256, '52ff1e1f55fc35e596712bc0c8003cb682e52cb725b2a894e722e597b267e2ac')
})

test('temporary login preflight accepts only direct or official runner entry', () => {
  const pre = migration.slice(0, migration.indexOf('do $installer_and_creator_topology_preflight$'))
  assert.match(pre, /rolcanlogin/)
  assert.match(pre, /not rolsuper/)
  assert.match(pre, /not rolcreaterole/)
  assert.match(pre, /pg_catalog\.pg_has_role\(session_user, 'postgres', 'SET'\)/)
  assert.match(pre, /current_user <> session_user and current_user <> 'postgres'/)
  assert.match(pre, /POS_SESSION_RUNNER_EFFECTIVE_ROLE_INVALID/)
  assert.match(pre, /POS_SESSION_TEMPORARY_LOGIN_AFEX_AUTHORITY_UNEXPECTED/)
  assert.match(pre, /POS_SESSION_AUTHORITY_ALREADY_PRESENT/)
})

test('role activation is conditional and runner preset mode is not transitioned again', () => {
  assert.match(migration, /when current_user = session_user then pg_catalog\.set_config\('role', 'postgres', true\)/)
  assert.match(migration, /else pg_catalog\.current_setting\('role', true\)/)
  assert.match(migration, /current_user <> 'postgres'/)
  assert.match(migration, /current_user = session_user/)
  assert.match(migration, /current_setting\('role', true\) <> 'postgres'/)
  assert.match(migration, /v_installer oid := \(select oid from pg_catalog\.pg_roles where rolname = current_user\)/)
})

test('post-activation membership lifecycle binds only the effective installer', () => {
  const post = migration.slice(migration.indexOf('do $installer_and_creator_topology_preflight$'))
  assert.doesNotMatch(post, /member_role\.rolname=session_user/)
  assert.doesNotMatch(post, /v_role, session_user, session_user/)
  assert.match(post, /member_role\.rolname=current_user/)
  assert.match(post, /v_role, current_user, current_user/)
})

test('cleanup returns to postgres and removes only its temporary edge', () => {
  const cleanup = migration.slice(migration.indexOf('do $remove_temporary_owner_edges$'))
  assert.match(migration, /set local role postgres;\s*\n\s*revoke create on schema public/)
  assert.match(cleanup, /revoke %I from %I granted by %I/)
  assert.match(cleanup, /v_role, current_user, current_user/)
  assert.match(cleanup, /not m\.set_option/)
})

test('temporary owner-edge lifecycle is closed before object creation', () => {
  assert.match(migration, /POS_SESSION_TEMPORARY_OWNER_EDGE_LIFECYCLE_INVALID/)
  assert.match(migration, /m\.grantor<>v_installer[\s\S]*m\.admin_option[\s\S]*not m\.set_option/)
  assert.match(migration, /m\.grantor=v_installer[\s\S]*not m\.admin_option[\s\S]*m\.set_option/)
})

test('forbidden authority mechanisms remain absent', () => {
  assert.doesNotMatch(migration, /set session authorization/i)
  assert.doesNotMatch(migration, /alter role[^;]+createrole/i)
  assert.doesNotMatch(migration, /update\s+pg_catalog\./i)
  assert.doesNotMatch(migration, /insert\s+into\s+pg_catalog\./i)
  assert.doesNotMatch(migration, /delete\s+from\s+pg_catalog\./i)
})
