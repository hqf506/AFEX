import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const migration = await readFile(new URL('supabase/migrations/20260814170000_core_v2_acquisition_observability.sql', root), 'utf8')
const adapter = await readFile(new URL('lib/server/core-v2/atomic-order.ts', root), 'utf8')
const route = await readFile(new URL('app/api/orders/route.ts', root), 'utf8')

const phases = [
  'FACADE_VALIDATION', 'INTERNAL_ACQUISITION', 'AUTHORIZATION_CONTEXT_INSERT',
  'COMMAND_INSERT', 'PAYLOAD_INSERT', 'AUDIT_INSERT', 'RESULT_CONSTRUCTION',
  'UNKNOWN_INTERNAL',
]

assert.match(migration, /^BEGIN;/)
assert.match(migration, /COMMIT;\s*$/)
assert(migration.includes('GET STACKED DIAGNOSTICS v_safe_sqlstate = RETURNED_SQLSTATE;'))
assert(migration.includes('WHEN query_canceled THEN'))
assert(migration.includes("'safeSqlState', v_safe_sqlstate"))
assert(migration.includes("v_failure_phase := 'INTERNAL_ACQUISITION'"))
assert(migration.includes("v_failure_phase := 'RESULT_CONSTRUCTION'"))
for (const phase of phases) assert(migration.includes(`'${phase}'`), `missing phase ${phase}`)
for (const forbidden of ['MESSAGE_TEXT', 'PG_EXCEPTION_DETAIL', 'PG_EXCEPTION_HINT', 'PG_EXCEPTION_CONTEXT']) {
  assert(!migration.includes(forbidden), `forbidden diagnostic ${forbidden}`)
}
assert(migration.includes('SECURITY DEFINER'))
assert(migration.includes('SET search_path = pg_catalog'))
assert(migration.includes('TO service_role'))
assert(migration.includes('FROM PUBLIC, anon, authenticated'))
assert(migration.includes('REVOKE afex_function_owner FROM postgres GRANTED BY postgres;'))
assert(migration.includes("grantor_role.rolname = 'postgres'"))
assert(migration.includes('membership.set_option'))
assert(adapter.includes('safeSqlState: safeSqlState(acquired.safeSqlState)'))
assert(adapter.includes('failurePhase: acquisitionFailurePhase(acquired.failurePhase)'))
assert(route.includes('safeSqlState: coreResult.safeSqlState'))
assert(route.includes('failurePhase: coreResult.failurePhase'))
assert(!/errorCode: coreResult\.errorCode,[\s\S]{0,120}safeSqlState/.test(route), 'safe diagnostics must not enter the response')

console.log('Core V2 acquisition observability checks passed.')
