import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const packageRoot = path.resolve(
  'docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-SQL-AUTHORITY-FINAL-CANDIDATE'
)

async function sql(name) {
  return readFile(path.join(packageRoot, name), 'utf8')
}

test('PostgreSQL identity syntax and installer identity are consistent', async () => {
  const files = (await readdir(packageRoot)).filter((name) => name.endsWith('.sql'))
  const contents = await Promise.all(files.map(sql))
  assert.equal(contents.some((source) => /pg_catalog\.current_user/iu.test(source)), false)
  for (const name of [
    '01A-PRIVATE-ROLES-AND-SCHEMA-FOUNDATION.sql',
    '01B-PUBLIC-COMPOSITE-SCOPE-CONSTRAINTS.sql',
    '01C-CORE-COMPOSITE-SCOPE-CONSTRAINTS.sql',
    '04A-TRUSTED-AUTH-SESSION-BRIDGE.sql',
    '04B-POS-ACTOR-AUTHORITY-POLICY-BRIDGE.sql',
    '04C-POSTGRES-OWNED-SUPPORT-POLICIES.sql',
    '05-OFFLINE-DEVICE-AUTHORITY.sql',
    '06-OFFLINE-EMPLOYEE-ENROLLMENT-AUTHORITY.sql',
    '07-PERSISTENT-UNWRAP-METADATA.sql',
    '09-INVENTORY-SNAPSHOT-AND-FRONTIER-AUTHORITY.sql',
    '13-INDEXES-CONSTRAINTS-AND-INVARIANTS.sql',
    '08A-OFFLINE-COMMAND-BINDING-RELATION.sql',
    '08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql',
    '08C-TOTAL-RESOLVER-AND-INVENTORY-READER.sql',
    '08D-ATOMIC-ORDER-CREATE-ACQUISITION.sql',
    '11-IDEMPOTENCY-RECEIPT-AND-EFFECT-LEDGERS.sql',
    '15-SAFE-DISABLEMENT-AND-ROLLBACK.sql',
  ]) {
    assert.match(
      await sql(name),
      /CURRENT_USER\s*<>\s*'postgres'\s+OR\s+SESSION_USER\s*<>\s*'postgres'/u,
      name
    )
  }
})

test('each executable wave is a complete independently named transaction', async () => {
  const waves = [
    ['01A-PRIVATE-ROLES-AND-SCHEMA-FOUNDATION.sql', 'Wave 1A'],
    ['01B-PUBLIC-COMPOSITE-SCOPE-CONSTRAINTS.sql', 'Wave 1B'],
    ['01C-CORE-COMPOSITE-SCOPE-CONSTRAINTS.sql', 'Wave 1C'],
    ['04A-TRUSTED-AUTH-SESSION-BRIDGE.sql', 'Wave 1D'],
    ['04B-POS-ACTOR-AUTHORITY-POLICY-BRIDGE.sql', 'Wave 1E'],
    ['04C-POSTGRES-OWNED-SUPPORT-POLICIES.sql', 'Wave 1F'],
    ['05-OFFLINE-DEVICE-AUTHORITY.sql', 'Wave 2A'],
    ['05A-TRUSTED-DEVICE-LIFECYCLE-WRITERS.sql', 'Wave 2A.1'],
    ['06-OFFLINE-EMPLOYEE-ENROLLMENT-AUTHORITY.sql', 'Wave 2B'],
    ['06A-TRUSTED-EMPLOYEE-PIN-SELECTION-WRITERS.sql', 'Wave 2B.1'],
    ['07-PERSISTENT-UNWRAP-METADATA.sql', 'Wave 2C'],
    ['09-INVENTORY-SNAPSHOT-AND-FRONTIER-AUTHORITY.sql', 'Wave 2D'],
    ['09A-TRUSTED-INVENTORY-SNAPSHOT-PUBLISHER.sql', 'Wave 2D.1'],
    ['13-INDEXES-CONSTRAINTS-AND-INVARIANTS.sql', 'Wave 2E'],
    ['08A-OFFLINE-COMMAND-BINDING-RELATION.sql', 'Wave 3A'],
    ['08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql', 'Wave 3B'],
    ['10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql', 'Wave 3C'],
    ['08C-TOTAL-RESOLVER-AND-INVENTORY-READER.sql', 'Wave 4A'],
    ['08D-ATOMIC-ORDER-CREATE-ACQUISITION.sql', 'Wave 4B'],
    ['11-IDEMPOTENCY-RECEIPT-AND-EFFECT-LEDGERS.sql', 'Wave 4C'],
  ]
  for (const [name, wave] of waves) {
    const source = await sql(name)
    assert.match(source, new RegExp(wave.replace(' ', '\\s+'), 'u'), name)
    assert.equal((source.match(/^BEGIN;$/gmu) ?? []).length, 1, name)
    assert.equal((source.match(/^COMMIT;$/gmu) ?? []).length, 1, name)
    assert.match(source, /(?:POST_ATTESTATION_FAILED|POSTGRES_CONTEXT_PRESERVED)/u, name)
    assert.doesNotMatch(source, /CREATE\s+INDEX\s+CONCURRENTLY/iu, name)
  }
  assert.doesNotMatch(
    await sql('08-CORE-V2-OFFLINE-ACTOR-DEVICE-BRIDGE.sql'),
    /^(?:CREATE|ALTER|DROP|GRANT|REVOKE|BEGIN|COMMIT)\b/imu
  )
})

test('total resolver is bounded positional and exception-isolated', async () => {
  const source = await sql('08C-TOTAL-RESOLVER-AND-INVENTORY-READER.sql')
  assert.match(source, /claim_count\s*<\s*1\s+OR\s+claim_count\s*>\s*1000/u)
  assert.match(source, /WITH ORDINALITY/u)
  assert.match(source, /\(raw_claim\.ordinality-1\)::integer/u)
  assert.match(source, /CLAIM_POSITION_DUPLICATE/u)
  assert.match(source, /EXCEPTION WHEN OTHERS THEN/u)
  assert.match(source, /jsonb_array_length\(result_value\)\s*<>\s*claim_count/u)
  assert.doesNotMatch(source, /RETURN\s+'\[\]'::jsonb/iu)
  assert.match(source, /UPLOADER_AUTH_SESSION_INVALID/u)
})

test('inventory authority enforces exact unique ordered item sets and commitments', async () => {
  const source = await sql('08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql')
  assert.match(source, /count\(DISTINCT item->>'catalogItemReference'\)/u)
  assert.match(source, /count\(DISTINCT item->>'catalogItemId'\)/u)
  assert.match(source, /requested_quantity > 0/u)
  assert.match(source, /pending_quantity >= 0 AND v\.syncing_quantity >= 0/u)
  assert.match(source, /GREATEST\(0::numeric,/u)
  assert.match(source, /confirmed_stock-v\.pending_quantity-v\.syncing_quantity/u)
  assert.match(source, /catalogItemReference' <=/u)
  assert.match(source, /catalogItemId' <=/u)
  assert.match(source, /frontier_version = p_frontier->>'frontierVersion'/u)
})

test('payment validator is exact and keeps all eight methods distinct', async () => {
  const source = await sql('08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql')
  for (const method of [
    'mada', 'cash', 'visa', 'cod', 'card', 'bank_transfer', 'transfer', 'on_delivery',
  ]) assert.match(source, new RegExp(`'${method}'`, 'u'))
  assert.match(source, /jsonb_has_exact_keys_v1\(p_payment/u)
  assert.match(source, /p_payment->>'amount' = p_order_total/u)
  assert.match(source, /p_payment->>'currency' = 'SAR'/u)
  assert.match(source, /p_payment->>'providerStatus' = 'unverified'/u)
  assert.match(source, /p_payment->'paymentProviderActionRequested' = 'false'::jsonb/u)
  assert.match(source, /orderCreateIdempotencyKeyHash/u)
  assert.match(source, /orderCreateLocalCommandId/u)
  assert.doesNotMatch(source, /(?:cardNumber|PAN|CVV|cardPin|providerToken)/u)
})

test('offline to Core mapper binds the full canonical payload and line economics', async () => {
  const source = await sql('08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql')
  assert.match(source, /coreOrderCanonicalPayload' IS DISTINCT FROM p_core_payload/u)
  assert.match(source, /coreFingerprintProjection' IS DISTINCT FROM p_core_projection/u)
  for (const token of [
    'catalog_item_id', 'quantity', 'unit_price', 'gross_amount',
    'discount_allocation', 'taxable_amount', 'vat_amount', 'lineTotal',
    'customerReference', 'paymentMethod', 'subtotalAmount', 'discountAmount',
    'taxAmount', 'totalAmount', 'inventorySnapshotId', 'inventoryFrontierVersion',
    'idempotencyKey', 'authenticated_actor_id',
  ]) assert.match(source, new RegExp(token, 'u'), token)
  assert.match(source, /customer'->'normalized_phone' <> 'null'::jsonb/u)
  assert.match(source, /jsonb_has_exact_keys_v1\(p_core_payload/u)
})

test('composite scope integrity separates the employee verifier from device encryption', async () => {
  const joined = await Promise.all([
    '01A-PRIVATE-ROLES-AND-SCHEMA-FOUNDATION.sql',
    '01B-PUBLIC-COMPOSITE-SCOPE-CONSTRAINTS.sql',
    '01C-CORE-COMPOSITE-SCOPE-CONSTRAINTS.sql',
    '05-OFFLINE-DEVICE-AUTHORITY.sql',
    '06-OFFLINE-EMPLOYEE-ENROLLMENT-AUTHORITY.sql',
    '07-PERSISTENT-UNWRAP-METADATA.sql',
    '08A-OFFLINE-COMMAND-BINDING-RELATION.sql',
    '09-INVENTORY-SNAPSHOT-AND-FRONTIER-AUTHORITY.sql',
    '10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql',
  ].map(sql)).then((parts) => parts.join('\n'))
  for (const constraint of [
    'afex_branches_id_tenant_scope_uk',
    'offline_employee_authorities_device_scope_fk',
    'offline_employee_authorities_device_envelope_scope_fk',
    'offline_bootstrap_envelope_scope_fk',
    'offline_bootstrap_snapshot_scope_fk',
    'offline_command_bindings_origin_device_fk',
    'offline_command_bindings_origin_bootstrap_fk',
    'offline_command_bindings_origin_enrollment_fk',
    'offline_command_bindings_origin_key_fk',
    'offline_command_bindings_snapshot_scope_fk',
    'offline_command_bindings_context_scope_fk',
  ]) assert.match(joined, new RegExp(constraint, 'u'), constraint)
  assert.match(joined, /device_id, tenant_id, branch_id, device_generation/u)
  const keyEnvelope = await sql('07-PERSISTENT-UNWRAP-METADATA.sql')
  assert.doesNotMatch(keyEnvelope, /pin_verifier|credential_verifier|actual_pos_employee_id/iu)
})

test('receipt lookup performs fresh authority before any binding or receipt read', async () => {
  const source = await sql('11-IDEMPOTENCY-RECEIPT-AND-EFFECT-LEDGERS.sql')
  const authority = source.indexOf('authority_results :=')
  const bindingRead = source.indexOf('SELECT * INTO binding_row')
  const commandRead = source.indexOf('SELECT * INTO command_row')
  assert.ok(authority > 0 && bindingRead > authority && commandRead > bindingRead)
  for (const token of [
    'origin_primary_authenticated_subject_id', 'origin_tenant_id',
    'origin_branch_id', 'origin_device_id', 'origin_device_generation',
    'origin_actual_pos_employee_id', 'origin_employee_enrollment_generation',
    'origin_command_generation', 'origin_key_envelope_id',
    'origin_key_envelope_version', 'payload_canonical_hash',
    'authority_binding_canonical_hash',
  ]) assert.match(source, new RegExp(token, 'u'), token)
})

test('direct acquisition execution excludes browser and service roles', async () => {
  const joined = await Promise.all([
    '08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql',
    '08C-TOTAL-RESOLVER-AND-INVENTORY-READER.sql',
    '08D-ATOMIC-ORDER-CREATE-ACQUISITION.sql',
    '11-IDEMPOTENCY-RECEIPT-AND-EFFECT-LEDGERS.sql',
  ].map(sql)).then((parts) => parts.join('\n'))
  assert.match(joined, /FROM PUBLIC, anon, authenticated, service_role/u)
  assert.doesNotMatch(joined, /TO\s+(?:PUBLIC|anon|authenticated|service_role)\s*;/iu)
  assert.match(joined, /TO afex_offline_acquisition_runtime/u)
})

test('disablement is authority-safe and evidence retention is honest', async () => {
  const source = await sql('15-SAFE-DISABLEMENT-AND-ROLLBACK.sql')
  const cleanup = await sql('15A-EMPTY-OBJECT-OWNER-AWARE-CLEANUP.sql')
  assert.match(source, /REVOKE EXECUTE ON FUNCTION[\s\S]*acquire_offline_order_create_v2/u)
  assert.match(source, /AFEX_DISABLEMENT_COMPLETE_EVIDENCE_RETAINED/u)
  assert.equal((cleanup.match(/SELECT pg_catalog\.count\(\*\) FROM afex_offline_authority\./gu) ?? []).length, 11)
  assert.match(cleanup, /AFEX_EMPTY_CLEANUP_REFUSED_NONZERO_EVIDENCE/u)
  assert.match(cleanup, /DROP TABLE afex_offline_authority\.offline_command_bindings RESTRICT/u)
  assert.doesNotMatch(source + cleanup, /^\s*(?:DROP|ALTER|CREATE).*CASCADE\b/gimu)
})

test('database-free validation states the genuine parser limitation', async () => {
  const matrix = JSON.parse(await readFile(
    path.join(packageRoot, 'SQL-AUTHORITY-TEST-MATRIX.json'),
    'utf8'
  ))
  assert.equal(matrix.postgresqlCompatibleParser.available, false)
  assert.equal(
    matrix.postgresqlCompatibleParser.status,
    'POSTGRESQL_COMPATIBLE_PARSER_UNAVAILABLE'
  )
  assert.equal(matrix.postgresqlCompatibleParser.postgresqlParseClaimed, false)
})

test('dependency graph binds every executable wave to an existing whole file without cycles', async () => {
  const graph = JSON.parse(await readFile(
    path.join(packageRoot, 'SQL-AUTHORITY-DEPENDENCY-GRAPH.json'),
    'utf8'
  ))
  const ids = new Set(graph.nodes.map((node) => node.id))
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from), edge.from)
    assert.ok(ids.has(edge.to), edge.to)
  }
  for (const node of graph.nodes.filter((entry) => entry.file)) {
    await readFile(path.join(packageRoot, node.file))
  }
  const incoming = new Map([...ids].map((id) => [id, 0]))
  const outgoing = new Map([...ids].map((id) => [id, []]))
  for (const edge of graph.edges) {
    incoming.set(edge.to, incoming.get(edge.to) + 1)
    outgoing.get(edge.from).push(edge.to)
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id)
  let visited = 0
  while (queue.length) {
    const id = queue.shift()
    visited += 1
    for (const next of outgoing.get(id)) {
      incoming.set(next, incoming.get(next) - 1)
      if (incoming.get(next) === 0) queue.push(next)
    }
  }
  assert.equal(visited, ids.size)
  assert.equal(graph.subsetExecutionForbidden, true)
})

test('public contract create grant revoke and disablement identities stay exact', async () => {
  const matrix = JSON.parse(await readFile(
    path.join(packageRoot, 'SQL-AUTHORITY-FUNCTION-MATRIX.json'),
    'utf8'
  ))
  const normalizeSignatures = (value) => value
    .replace(/\s+/gu, ' ')
    .replace(/\s*,\s*/gu, ',')
    .replace(/\s+\(/gu, '(')
    .replace(/\(\s*/gu, '(')
    .replace(/\s*\)/gu, ')')
  const active = normalizeSignatures(await Promise.all([
    '08C-TOTAL-RESOLVER-AND-INVENTORY-READER.sql',
    '08D-ATOMIC-ORDER-CREATE-ACQUISITION.sql',
    '11-IDEMPOTENCY-RECEIPT-AND-EFFECT-LEDGERS.sql',
  ].map(sql)).then((parts) => parts.join('\n')))
  const disablement = normalizeSignatures((await Promise.all([
    '15-SAFE-DISABLEMENT-AND-ROLLBACK.sql',
    '15A-EMPTY-OBJECT-OWNER-AWARE-CLEANUP.sql',
  ].map(sql))).join('\n'))
  for (const contract of matrix.publicRuntimeContracts) {
    const name = contract.signature.slice(0, contract.signature.indexOf('('))
    assert.match(active, new RegExp(`CREATE FUNCTION ${name.replaceAll('.', '\\.')}`, 'u'))
    assert.ok(active.includes(contract.signature), `${contract.id} active signature`)
    assert.ok(disablement.includes(contract.signature), `${contract.id} disablement signature`)
  }
  assert.equal(matrix.publicRuntimeContracts.length, 4)
  const allSql = await Promise.all(
    (await readdir(packageRoot)).filter((name) => name.endsWith('.sql')).map(sql)
  ).then((parts) => parts.join('\n'))
  assert.doesNotMatch(allSql, /->>\s*'[^']+'\s*::\s*(?:uuid|bigint|integer|numeric)/iu)
})

test('every forward statement identifier has one honest disposition', async () => {
  const sqlFiles = (await readdir(packageRoot)).filter((name) => name.endsWith('.sql'))
  const forwardIds = []
  for (const name of sqlFiles) {
    const source = await sql(name)
    forwardIds.push(...[...source.matchAll(/\bFWD-[0-9A-Z]+-[0-9]{3}\b/gu)].map((m) => m[0]))
  }
  const mapping = JSON.parse(await readFile(
    path.join(packageRoot, 'SQL-AUTHORITY-FORWARD-DISABLEMENT-MATRIX.json'),
    'utf8'
  ))
  const mapped = mapping.groups.flatMap((group) => {
    const firstMatch = /^(FWD-[0-9A-Z]+-)([0-9]{3})$/u.exec(group.first)
    const lastMatch = /^(FWD-[0-9A-Z]+-)([0-9]{3})$/u.exec(group.last)
    assert.ok(firstMatch && lastMatch && firstMatch[1] === lastMatch[1])
    return Array.from(
      { length: Number(lastMatch[2]) - Number(firstMatch[2]) + 1 },
      (_, index) => `${firstMatch[1]}${String(Number(firstMatch[2]) + index).padStart(3, '0')}`
    )
  })
  assert.equal(new Set(forwardIds).size, forwardIds.length)
  assert.deepEqual([...new Set(mapped)].sort(), [...new Set(forwardIds)].sort())
  assert.equal(mapped.length, new Set(mapped).size)
})
