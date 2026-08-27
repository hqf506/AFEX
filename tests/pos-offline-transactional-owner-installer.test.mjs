import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')
const packageRoot = path.join(
  root,
  'docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-SQL-AUTHORITY-FINAL-CANDIDATE'
)
const sql = (name) => readFile(path.join(packageRoot, name), 'utf8')

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(full) : [full]
  }))
  return nested.flat()
}

test('human-attested Production installer evidence is frozen exactly', async () => {
  const evidence = JSON.parse(await readFile(
    path.join(packageRoot, 'SQL-AUTHORITY-PRODUCTION-INSTALLER-EVIDENCE.json'),
    'utf8'
  ))
  assert.deepEqual(evidence.session, {
    currentUser: 'postgres', sessionUser: 'postgres', database: 'postgres',
    serverVersionNum: '170006',
  })
  assert.deepEqual(evidence.database, {
    owner: 'postgres', postgresCreate: true, postgresConnect: true,
  })
  assert.deepEqual(
    {
      name: evidence.installerRole.name,
      superuser: evidence.installerRole.superuser,
      createRole: evidence.installerRole.createRole,
      evidenceSha256: evidence.installerRole.evidenceSha256,
    },
    {
      name: 'postgres',
      superuser: false,
      createRole: true,
      evidenceSha256: '86d5f58824490f39f3aabb08be6778065a8a63ffaa8b4a749cd46afbffe6c775',
    }
  )
  assert.equal(evidence.schemas.find((item) => item.name === 'auth').owner, 'supabase_admin')
  assert.equal(evidence.schemas.find((item) => item.name === 'auth').postgresCreate, false)
  assert.deepEqual(
    evidence.postgresMemberships.map(({ admin, inherit, set }) => ({ admin, inherit, set })),
    Array.from({ length: 4 }, () => ({ admin: true, inherit: false, set: false }))
  )
})

test('preflight proves postgres database authority and preserves auth boundary', async () => {
  const source = await sql('00-READ-ONLY-PREFLIGHT.sql')
  for (const token of [
    "CURRENT_USER = 'postgres'", "SESSION_USER = 'postgres'",
    "current_database() = 'postgres'", "server_version_num') = '170006'",
    "has_database_privilege('postgres',d.datname,'CREATE')",
    "has_database_privilege('postgres',d.datname,'CONNECT')",
    'expected_bounded_role_installer',
    "postgres_auth_create_remains_absent", "postgres_can_read_auth_sessions",
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), token)
  assert.match(source, /n\.nspname IN \('public','auth'/u)
  assert.match(source, /branches_missing_tenant/u)
  assert.match(source, /catalog_items_missing_tenant/u)
  assert.match(source, /authorization_context_scope_drift/u)
  assert.match(source, /command_context_scope_drift/u)
})

test('Wave 01 is split by owner and never transfers existing Core ownership', async () => {
  const [a, b, c] = await Promise.all([
    sql('01A-PRIVATE-ROLES-AND-SCHEMA-FOUNDATION.sql'),
    sql('01B-PUBLIC-COMPOSITE-SCOPE-CONSTRAINTS.sql'),
    sql('01C-CORE-COMPOSITE-SCOPE-CONSTRAINTS.sql'),
  ])
  assert.match(a, /CREATE SCHEMA IF NOT EXISTS afex_offline_authority/u)
  assert.doesNotMatch(a, /atomic_authorization_contexts|actor_sessions/u)
  assert.match(b, /ALTER TABLE public\.branches/u)
  assert.match(b, /ALTER TABLE public\.catalog_items/u)
  assert.doesNotMatch(b, /atomic_authorization_contexts|actor_sessions/u)
  assert.match(c, /SET LOCAL ROLE afex_core_owner/u)
  assert.match(c, /ALTER TABLE public\.atomic_authorization_contexts/u)
  assert.match(c, /ALTER TABLE public\.atomic_order_commands/u)
  assert.doesNotMatch(a + b + c, /ALTER\s+(?:TABLE|FUNCTION)\s+[^;]*\bOWNER\s+TO\b/iu)
})

test('every owner-aware foundation wave bounds SET authority inside one transaction', async () => {
  const waves = [
    ['01A-PRIVATE-ROLES-AND-SCHEMA-FOUNDATION.sql', 'afex_offline_authority_owner'],
    ['01C-CORE-COMPOSITE-SCOPE-CONSTRAINTS.sql', 'afex_core_owner'],
    ['04A-TRUSTED-AUTH-SESSION-BRIDGE.sql', 'afex_offline_authority_owner'],
    ['04B-POS-ACTOR-AUTHORITY-POLICY-BRIDGE.sql', 'afex_pos_session_owner'],
    ['05-OFFLINE-DEVICE-AUTHORITY.sql', 'afex_offline_authority_owner'],
    ['05A-TRUSTED-DEVICE-LIFECYCLE-WRITERS.sql', 'afex_offline_authority_owner'],
    ['06-OFFLINE-EMPLOYEE-ENROLLMENT-AUTHORITY.sql', 'afex_offline_authority_owner'],
    ['06A-TRUSTED-EMPLOYEE-PIN-SELECTION-WRITERS.sql', 'afex_offline_authority_owner'],
    ['07-PERSISTENT-UNWRAP-METADATA.sql', 'afex_offline_authority_owner'],
    ['08A-OFFLINE-COMMAND-BINDING-RELATION.sql', 'afex_offline_authority_owner'],
    ['08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql', 'afex_function_owner'],
    ['08C-TOTAL-RESOLVER-AND-INVENTORY-READER.sql', 'afex_function_owner'],
    ['08D-ATOMIC-ORDER-CREATE-ACQUISITION.sql', 'afex_function_owner'],
    ['09-INVENTORY-SNAPSHOT-AND-FRONTIER-AUTHORITY.sql', 'afex_offline_authority_owner'],
    ['09A-TRUSTED-INVENTORY-SNAPSHOT-PUBLISHER.sql', 'afex_offline_authority_owner'],
    ['10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql', 'afex_offline_authority_owner'],
    ['11-IDEMPOTENCY-RECEIPT-AND-EFFECT-LEDGERS.sql', 'afex_function_owner'],
    ['13-INDEXES-CONSTRAINTS-AND-INVARIANTS.sql', 'afex_offline_authority_owner'],
  ]
  for (const [name, role] of waves) {
    const source = await sql(name)
    assert.equal((source.match(/^BEGIN;$/gmu) ?? []).length, 1, name)
    assert.equal((source.match(/^COMMIT;$/gmu) ?? []).length, 1, name)
    assert.match(source, /CURRENT_USER\s*<>\s*'postgres'[\s\S]*SESSION_USER\s*<>\s*'postgres'/u, name)
    const enable = source.indexOf(`GRANT ${role} TO postgres`)
    const switchRole = source.indexOf(`SET LOCAL ROLE ${role}`, enable)
    const reset = source.lastIndexOf('RESET ROLE;')
    const revoke = source.lastIndexOf(
      `REVOKE ${role} FROM postgres GRANTED BY CURRENT_USER;`
    )
    const commit = source.lastIndexOf('COMMIT;')
    assert.ok(enable >= 0 && switchRole > enable, `${name}: SET enable before role switch`)
    assert.match(
      source.slice(enable, switchRole),
      /WITH ADMIN FALSE, INHERIT FALSE, SET TRUE\s+GRANTED BY CURRENT_USER;/u,
      name
    )
    assert.ok(reset > switchRole && revoke > reset && commit > revoke, `${name}: reset/revoke/commit order`)
    assert.doesNotMatch(source, /GRANT[^;]*SET FALSE/iu, name)
    assert.match(source, /m\.admin_option/u, name)
    assert.match(source, /NOT m\.inherit_option/u, name)
    assert.match(source, /NOT m\.set_option/u, name)
    assert.doesNotMatch(source, /INHERIT TRUE/u, name)
  }
})

test('Auth helper is private, exact, and the auth schema is never mutated', async () => {
  const files = (await readdir(packageRoot)).filter((name) => name.endsWith('.sql'))
  const all = (await Promise.all(files.map(sql))).join('\n')
  const helper = await sql('04A-TRUSTED-AUTH-SESSION-BRIDGE.sql')
  assert.doesNotMatch(all, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+auth\./iu)
  assert.doesNotMatch(all, /GRANT\s+CREATE\s+ON\s+SCHEMA\s+auth/iu)
  assert.doesNotMatch(all, /ALTER\s+SCHEMA\s+auth/iu)
  assert.doesNotMatch(all, /(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?auth\.sessions/iu)
  assert.match(helper, /SECURITY DEFINER/u)
  assert.match(helper, /STABLE/u)
  assert.match(helper, /STRICT/u)
  assert.match(helper, /SET search_path=pg_catalog/u)
  assert.match(helper, /FROM auth\.sessions AS s/u)
  assert.match(helper, /cc67bd0f9c1828a833b868c48f1f65fb/u)
  assert.match(
    helper,
    /octet_length\(\s*pg_catalog\.replace\(helper_source,E'\\r\\n',E'\\n'\)\s*\) <> 153/u
  )
  assert.doesNotMatch(helper, /EXECUTE\s+pg_catalog\.format/iu)
})

test('existing Core and POS ownership stays unchanged and new owners are direct', async () => {
  const files = (await readdir(packageRoot)).filter((name) => name.endsWith('.sql'))
  const foundation = (await Promise.all(files.filter((name) => !name.startsWith('15')).map(sql))).join('\n')
  assert.doesNotMatch(foundation, /ALTER TABLE\s+(?:public\.atomic_|afex_pos_authority\.actor_sessions)[^;]*\bOWNER TO\b/iu)
  assert.doesNotMatch(foundation, /ALTER FUNCTION\s+[^;]*\bOWNER TO afex_(?:function|offline_authority)_owner\b/iu)
  const owners = JSON.parse(await readFile(path.join(packageRoot, 'SQL-AUTHORITY-OWNER-WAVE-MATRIX.json'), 'utf8'))
  assert.equal(owners.existingOwnershipTransfers, 0)
  assert.equal(owners.authSchemaMutations, 0)
})

test('00Z is exact transaction-bounded membership cleanup only', async () => {
  const source = await sql('00Z-RESTORE-INSTALLER-MEMBERSHIP-OPTIONS.sql')
  for (const role of [
    'afex_context_issuer','afex_core_owner','afex_function_owner',
    'afex_pos_session_owner','afex_offline_authority_owner',
  ]) assert.match(source, new RegExp(`REVOKE ${role} FROM postgres GRANTED BY CURRENT_USER;`, 'u'))
  assert.equal((source.match(/^REVOKE afex_/gmu) ?? []).length, 5)
  assert.doesNotMatch(source, /^(?:CREATE|ALTER|DROP|GRANT|INSERT|UPDATE|DELETE|TRUNCATE)\b/gimu)
  assert.doesNotMatch(source, /SET FALSE/u)
})

test('final Pilot activation is bounded, exact, and excluded from Foundation', async () => {
  const graph = JSON.parse(await readFile(path.join(packageRoot, 'SQL-AUTHORITY-DEPENDENCY-GRAPH.json'), 'utf8'))
  const activation = graph.nodes.find((node) => node.id === 'ACT')
  assert.equal(activation.foundation, false)
  assert.equal(graph.edges.some((edge) => edge.from === 'ACT' || edge.to === 'ACT'), false)
  assert.equal(graph.activationExcludedFromFoundation, true)
  const source = await sql('90-FINAL-MANUAL-PILOT-ACTIVATION.sql')
  assert.match(source, /NOT_EXECUTED_REQUIRES_FINAL_HUMAN_APPROVAL/u)
  assert.equal((source.match(/^CREATE FUNCTION public\.afex_offline_server_/gmu) ?? []).length, 13)
  assert.match(source, /TO service_role;/u)
  assert.doesNotMatch(source, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*TO service_role/iu)
  assert.match(source, /FROM PUBLIC,anon,authenticated,service_role;/u)
  assert.match(source, /afex_current_auth_session_matches_v1/u)
  assert.match(source, /afex_pos_authority\.actor_sessions/u)
  assert.match(source, /REVOKE CREATE ON SCHEMA public FROM afex_function_owner/u)
  const revoke = await sql('90Z-FINAL-EMERGENCY-PILOT-DEACTIVATION.sql')
  assert.match(revoke, /FROM service_role/u)
  const functionMatrix = JSON.parse(await readFile(
    path.join(packageRoot, 'SQL-AUTHORITY-FUNCTION-MATRIX.json'),
    'utf8'
  ))
  assert.equal(functionMatrix.finalManualActivation.serviceRoleFacades.length, 12)
  assert.equal(functionMatrix.finalManualActivation.ownedRoutineCount, 13)
  const normalizeSignature = (value) => value
    .replace(/\s+/gu, '')
    .replaceAll('timestampwithtimezone', 'timestamptz')
  const normalizedActivation = normalizeSignature(source)
  const normalizedRevoke = normalizeSignature(revoke)
  for (const signature of functionMatrix.finalManualActivation.serviceRoleFacades) {
    const normalized = normalizeSignature(signature)
    assert.ok(normalizedActivation.includes(normalized), signature)
    assert.ok(normalizedRevoke.includes(normalized), signature)
  }
  assert.ok(normalizedActivation.includes(
    normalizeSignature(functionMatrix.finalManualActivation.privateContextHelper)
  ))
})

test('DAG is complete acyclic and activation-free', async () => {
  const graph = JSON.parse(await readFile(path.join(packageRoot, 'SQL-AUTHORITY-DEPENDENCY-GRAPH.json'), 'utf8'))
  const foundation = graph.nodes.filter((node) => Number.isInteger(node.order))
  assert.equal(foundation.length, 22)
  assert.deepEqual(foundation.map((node) => node.order), Array.from({ length: 22 }, (_, index) => index))
  for (const node of graph.nodes) if (node.file) await readFile(path.join(packageRoot, node.file))
  const ids = new Set(graph.nodes.map((node) => node.id))
  const incoming = new Map([...ids].map((id) => [id, 0]))
  const outgoing = new Map([...ids].map((id) => [id, []]))
  for (const { from, to } of graph.edges) {
    assert.ok(ids.has(from) && ids.has(to))
    incoming.set(to, incoming.get(to) + 1)
    outgoing.get(from).push(to)
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id)
  let visited = 0
  while (queue.length) {
    const current = queue.shift(); visited += 1
    for (const next of outgoing.get(current)) {
      incoming.set(next, incoming.get(next) - 1)
      if (incoming.get(next) === 0) queue.push(next)
    }
  }
  assert.equal(visited, ids.size)
})

test('all sensitive flags stay false and bridge import is server-only and bounded', async () => {
  const bridgePath = path.join(root, 'lib/offline/core-v2-offline-authority-bridge.ts')
  const bridge = await readFile(bridgePath, 'utf8')
  const match = bridge.match(/CORE_V2_OFFLINE_BRIDGE_FLAGS = Object\.freeze\(\{([\s\S]*?)\}\s+as const\)/u)
  assert.ok(match)
  assert.equal((match[1].match(/:\s*false\b/gu) ?? []).length, 12)
  assert.equal((match[1].match(/:\s*true\b/gu) ?? []).length, 0)
  const candidates = (await Promise.all(['app','components','lib'].map((dir) => filesBelow(path.join(root, dir))))).flat()
    .filter((file) => /\.(?:ts|tsx|js|jsx|mjs)$/u.test(file) && file !== bridgePath)
  const importers = []
  for (const file of candidates) {
    const source = await readFile(file, 'utf8')
    if (/from\s+['"][^'"]*core-v2-offline-authority-bridge['"]/u.test(source)) importers.push(file)
  }
  assert.deepEqual(
    importers.map((file) => path.relative(root, file).replaceAll('\\', '/')),
    ['lib/server/offline/order-create-pilot-transport.ts']
  )
})
