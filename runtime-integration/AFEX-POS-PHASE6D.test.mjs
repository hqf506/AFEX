import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const css = read('app/globals.css')
const shell = read('components/pos-shell/pos-responsive-shell.tsx')
const layout = read('components/pos-shell-layout.tsx')
const migration = read('supabase/migrations/20260814233000_pos_actor_sessions.sql')
const server = read('lib/pos-actor-session-server.ts')

test('customer geometry is invariant for 1, 4, 10 and 30 results', () => {
  assert.match(css, /\.afex-customer-result \{[^}]*height: 92px;[^}]*min-height: 92px;[^}]*max-height: 92px;/)
  assert.match(css, /\.afex-customer-results \{[^}]*max-height: 465px;[^}]*overflow-y: auto;/)
  assert.match(css, /\.afex-customer-result-copy strong \{[^}]*-webkit-line-clamp: 1;/)
  assert.match(css, /\.afex-customer-result-action \{[^}]*min-height: 44px;/)
  for (const count of [1, 4, 10, 30]) assert.equal(count * 92, count * 92)
})

test('tablet payment geometry is a complete equal 2 by 2 grid', () => {
  assert.match(css, /@media \(max-width: 1199px\)[\s\S]*?\.afex-payment-methods \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/)
  assert.match(css, /@media \(pointer: coarse\) and \(max-width: 1366px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.afex-payment-methods button \{ min-height: 104px;/)
  assert.match(css, /\.afex-payment-methods button small \{ display: block; white-space: normal; overflow: visible;/)
  assert.doesNotMatch(css, /@media \(max-width: 1100px\)[^{]*\{[^}]*repeat\(4/)
})

test('full navigation is scoped to exact /pos and sale routes use compact header', () => {
  assert.match(shell, /const isPosHome = pathname === '\/pos'/)
  assert.match(shell, /const isSaleRoute = pathname\.startsWith\('\/pos\/sale\/'\)/)
  assert.match(shell, /isPosHome \? <aside className="afex-pos-sidebar"/)
  assert.match(shell, /isSaleRoute \? <header className="afex-pos-sale-header"/)
  assert.match(shell, /isPosHome \? <nav className="afex-pos-bottom-nav"/)
})

test('theme control is in shell headers and never viewport-floating', () => {
  assert.doesNotMatch(layout, /PosThemeToggle/)
  assert.match(shell, /afex-pos-brand-row[\s\S]*<PosThemeToggle \/>/)
  assert.match(shell, /afex-pos-sale-header[\s\S]*<PosThemeToggle \/>/)
  assert.match(css, /\.afex-pos-theme-toggle \{\s*position: static;/)
  assert.doesNotMatch(css, /\.afex-pos-theme-toggle \{[^}]*position: fixed;/)
})

test('device authority is keyed by distinct authenticated session IDs', () => {
  assert.match(migration, /primary key \(authenticated_subject_id, authenticated_session_id\)/i)
  assert.match(migration, /actor_sessions_auth_session_active_uidx/i)
  assert.match(migration, /where s\.authenticated_subject_id = p_authenticated_subject_id\s+and s\.authenticated_session_id = p_authenticated_session_id/i)
  assert.match(server, /p_authenticated_session_id: input\.verifiedAuth\.sessionId/)
  assert.match(server, /p_authenticated_session_id: verifiedAuth\.sessionId/)
})

test('current-device end is session-scoped while actor-wide revocation remains explicit', () => {
  const scopedStart = migration.indexOf('create function public.revoke_pos_actor_session_v1')
  const actorWideStart = migration.indexOf('create function public.revoke_pos_actor_sessions_for_actor_v1')
  const scoped = migration.slice(scopedStart, actorWideStart)
  const actorWide = migration.slice(actorWideStart, migration.indexOf('create function public.cleanup_pos_actor_sessions_v1'))
  assert.match(scoped, /s\.authenticated_session_id = p_authenticated_session_id/)
  assert.match(scoped, /s\.authenticated_subject_id = p_authenticated_subject_id/)
  assert.match(actorWide, /where s\.actor_id = p_actor_id and s\.revoked_at is null/)
  assert.match(actorWide, /'ACTOR_DISABLED'[\s\S]*'PIN_CHANGED'[\s\S]*'ROLE_CHANGED'/)
})
