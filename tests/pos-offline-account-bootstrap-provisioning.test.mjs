import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')
const phase4 = path.join(
  root,
  'docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-PHASE-4'
)
const sqlRoot = path.join(
  root,
  'docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-SQL-AUTHORITY-FINAL-CANDIDATE'
)
const pilot = path.join(
  root,
  'docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-ORDER-CREATE-PILOT-CONTRACT'
)
const provenance = path.join(
  root,
  'docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-TRUSTED-ACTOR-PROVENANCE-CLOSURE'
)

const read = (file) => readFile(file, 'utf8')
const p4 = (name) => read(path.join(phase4, name))
const sql = (name) => read(path.join(sqlRoot, name))

async function joinedFiles(directory, extension) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(extension))
  return Promise.all(names.map((name) => read(path.join(directory, name))))
    .then((parts) => parts.join('\n'))
}

test('Offline account authority cannot start before verified Online establishment login', async () => {
  const [contract, bootstrap] = await Promise.all([
    p4('PHASE-4-OFFLINE-PIN-AUTHORITY-CONTRACT.md'),
    sql('10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql'),
  ])
  assert.match(contract, /verified Online establishment-account login/iu)
  assert.match(bootstrap, /AFEX_OFFLINE_BOOTSTRAP_ONLINE_AUTH_REQUIRED/u)
  assert.match(bootstrap, /afex_offline_authority\.afex_current_auth_session_matches_v1/u)
})

test('internet loss does not expire retained account-bound Offline authority by age', async () => {
  const [flow, policy] = await Promise.all([
    p4('PHASE-4-OFFLINE-PIN-CREDENTIAL-FLOW.json').then(JSON.parse),
    read(path.join(provenance, 'PROVENANCE-CLOSURE-SESSION-EXPIRY-AND-REVOCATION.md')),
  ])
  assert.equal(flow.timeExpiryPolicy, 'NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY')
  assert.equal(flow.connectivityPolicy, 'OPPORTUNISTIC_NOT_MANDATORY')
  assert.equal(flow.flows.restartWithoutLogout.includes('retain account-bound bootstrap'), true)
  assert.match(policy, /NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY/u)
})

test('restart without logout requires employee PIN but not internet', async () => {
  const flow = await p4('PHASE-4-OFFLINE-PIN-CREDENTIAL-FLOW.json').then(JSON.parse)
  assert.equal(flow.flows.restartWithoutLogout.includes('require employee PIN re-entry'), true)
  assert.equal(
    flow.flows.restartWithoutLogout.includes('do not require Internet merely because of restart'),
    true
  )
  assert.equal(
    flow.flows.restartWithoutLogout.includes(
      'reconstruct encrypted pending commands and inventory commitments'
    ),
    true
  )
})

test('employee PIN is selection only and cannot change account tenant branch or device', async () => {
  const contract = await p4('PHASE-4-OFFLINE-PIN-AUTHORITY-CONTRACT.md')
  assert.match(contract, /local selector for one pre-enrolled POS employee/iu)
  for (const identity of [
    'primaryAuthenticatedUserId', 'tenant', 'branch', 'device',
  ]) assert.match(contract, new RegExp(identity, 'iu'))
  assert.match(contract, /cannot change/iu)
})

test('employee PIN is absent from the device data-encryption key hierarchy', async () => {
  const [contract, envelope] = await Promise.all([
    p4('PHASE-4-PERSISTENT-UNWRAP-CONTRACT.md'),
    sql('07-PERSISTENT-UNWRAP-METADATA.sql'),
  ])
  assert.match(contract, /employee PIN never derives, wraps, unwraps, decrypts/iu)
  assert.doesNotMatch(envelope, /pin_verifier|credential_verifier|actual_pos_employee_id/iu)
  assert.match(envelope, /RSA-OAEP-3072-SHA256/u)
  assert.match(envelope, /AES-256-GCM/u)
})

test('explicit logout disables PIN order creation and employee switching', async () => {
  const bootstrap = await sql('10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql')
  for (const field of [
    "'offlinePinEntryEnabled',false",
    "'offlineOrderCreationEnabled',false",
    "'offlineEmployeeSwitchEnabled',false",
  ]) assert.equal(bootstrap.includes(field), true, field)
})

test('PIN cannot restore a logged-out account and Online login is required', async () => {
  const [flow, bootstrap] = await Promise.all([
    p4('PHASE-4-OFFLINE-PIN-CREDENTIAL-FLOW.json').then(JSON.parse),
    sql('10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql'),
  ])
  assert.equal(
    flow.flows.explicitLogout.includes(
      'require same establishment account to authenticate Online before recovery'
    ),
    true
  )
  assert.match(bootstrap, /same_account_online_recovery/u)
})

test('logout retains pending commands encrypted inaccessible and never reassigns them', async () => {
  const [contract, bootstrap] = await Promise.all([
    p4('PHASE-4-PERSISTENT-UNWRAP-CONTRACT.md'),
    sql('10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql'),
  ])
  assert.match(contract, /remain encrypted, inaccessible/iu)
  assert.match(bootstrap, /RETAIN_ENCRYPTED_INACCESSIBLE_SAME_ACCOUNT_ONLINE_RECOVERY_ONLY/u)
})

test('same-account recovery is allowed and cross-scope recovery remains rejected', async () => {
  const policy = await read(
    path.join(provenance, 'PROVENANCE-CLOSURE-SESSION-EXPIRY-AND-REVOCATION.md')
  )
  assert.match(policy, /Same establishment account authenticates Online after logout.*Allow bounded recovery/iu)
  assert.match(policy, /Different account, tenant or branch requests recovery.*Reject/iu)
})

test('employee verifier parameters and salt uniqueness are exact', async () => {
  const employeeSql = await sql('06-OFFLINE-EMPLOYEE-ENROLLMENT-AUTHORITY.sql')
  assert.match(employeeSql, /PBKDF2-HMAC-SHA256/u)
  assert.match(employeeSql, /pin_verifier_iterations = 600000/u)
  assert.match(employeeSql, /octet_length\(pin_verifier_salt\) = 32/u)
  assert.match(employeeSql, /octet_length\(pin_verifier_bytes\) = 32/u)
  assert.match(employeeSql, /UNIQUE \(pin_verifier_salt\)/u)
  const flow = await p4('PHASE-4-OFFLINE-PIN-CREDENTIAL-FLOW.json').then(JSON.parse)
  assert.equal(flow.pinVerifier.memory, 'NOT_APPLICABLE_TO_PBKDF2')
  assert.equal(flow.pinVerifier.parallelism, 'NOT_APPLICABLE_TO_PBKDF2')
})

test('plaintext reversible and unsalted SHA-256 PIN storage are rejected', async () => {
  const contracts = await joinedFiles(phase4, '.md')
  assert.match(contracts, /unsalted SHA-256/iu)
  assert.match(contracts, /Plaintext PIN/iu)
  assert.match(contracts, /reversible PIN/iu)
  const employeeSql = await sql('06-OFFLINE-EMPLOYEE-ENROLLMENT-AUTHORITY.sql')
  assert.doesNotMatch(employeeSql, /credential_verifier_sha256/iu)
})

test('employee roster is bounded to 25 active employees per branch device', async () => {
  const [writers, capacity] = await Promise.all([
    sql('06A-TRUSTED-EMPLOYEE-PIN-SELECTION-WRITERS.sql'),
    sql('13-INDEXES-CONSTRAINTS-AND-INVARIANTS.sql'),
  ])
  assert.match(writers, />= 25/u)
  assert.match(writers, /AFEX_EMPLOYEE_ACTIVE_ROSTER_LIMIT_25/u)
  assert.match(capacity, /active_count >= 25/u)
})

test('database employee allowlist is exactly order.create and seven deferred commands are rejected', async () => {
  const [employee, writers, deferred] = await Promise.all([
    sql('06-OFFLINE-EMPLOYEE-ENROLLMENT-AUTHORITY.sql'),
    sql('06A-TRUSTED-EMPLOYEE-PIN-SELECTION-WRITERS.sql'),
    read(path.join(pilot, 'PILOT-CONTRACT-DEFERRED-COMMANDS.json')).then(JSON.parse),
  ])
  assert.match(employee, /allowed_command_types = ARRAY\['order\.create'\]::text\[\]/u)
  assert.match(writers, /p_allowed_command_types IS DISTINCT FROM ARRAY\['order\.create'\]::text\[\]/u)
  assert.equal(deferred.commands.length, 7)
  assert.equal(deferred.commands.every((entry) => entry.offlineDispatch === 'FORBIDDEN'), true)
})

test('device provisioning wave contains the complete lifecycle and current read', async () => {
  const source = await sql('05A-TRUSTED-DEVICE-LIFECYCLE-WRITERS.sql')
  for (const name of [
    'register_offline_device_v1', 'activate_offline_device_v1',
    'replace_offline_device_v1', 'transition_offline_device_v1',
    'read_current_offline_device_authority_v1',
  ]) assert.match(source, new RegExp(`CREATE FUNCTION afex_offline_authority\\.${name}`, 'u'))
  for (const state of ['revoked', 'lost', 'local_locked']) {
    assert.match(source, new RegExp(`'${state}'`, 'u'))
  }
})

test('employee provisioning wave contains enrollment verifier permissions transition and current read', async () => {
  const source = await sql('06A-TRUSTED-EMPLOYEE-PIN-SELECTION-WRITERS.sql')
  for (const name of [
    'enroll_offline_employee_v1', 'replace_offline_employee_pin_verifier_v1',
    'replace_offline_employee_permissions_v1', 'transition_offline_employee_v1',
    'read_current_offline_employee_authority_v1',
  ]) assert.match(source, new RegExp(`CREATE FUNCTION afex_offline_authority\\.${name}`, 'u'))
  assert.match(source, /returns a verifier package for local employee selection only/iu)
})

test('inventory provisioning publishes a complete exact set with stable replay and conflict denial', async () => {
  const source = await sql('09A-TRUSTED-INVENTORY-SNAPSHOT-PUBLISHER.sql')
  assert.match(source, /publish_branch_inventory_snapshot_v1/u)
  assert.match(source, /count\(DISTINCT/u)
  assert.match(source, /AFEX_INVENTORY_SNAPSHOT_CONFLICTING_REPLAY/u)
  assert.match(source, /stable_replay/u)
  assert.match(source, /AFEX_INVENTORY_SNAPSHOT_MISSING_EXTRA_OR_CROSS_SCOPE_ITEM/u)
})

test('bootstrap binds verified Auth POS actor device roster snapshot and returns no key material', async () => {
  const source = await sql('10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql')
  for (const token of [
    'authenticated_session_id', 'pos_actor_session_id', 'tenant_id', 'branch_id',
    'device_id', 'offline_bootstrap_employee_roster', 'inventory_snapshot_id',
  ]) assert.match(source, new RegExp(token, 'u'))
  assert.match(source, /'containsSecretKeyMaterial',false/u)
  assert.doesNotMatch(source, /CREATE\s+(?:ORDER|INVOICE)|paymentProviderAction/iu)
})

test('provisioning and acquisition have separate NOLOGIN runtime roles', async () => {
  const [roles, acl] = await Promise.all([
    sql('01A-PRIVATE-ROLES-AND-SCHEMA-FOUNDATION.sql'),
    read(path.join(sqlRoot, 'SQL-AUTHORITY-ROLE-AND-ACL-MATRIX.json')).then(JSON.parse),
  ])
  assert.match(roles, /CREATE ROLE afex_offline_provisioning_runtime NOLOGIN/u)
  assert.match(roles, /CREATE ROLE afex_offline_acquisition_runtime NOLOGIN/u)
  const runtimeRoles = acl.runtimeRoles.map((entry) => entry.role)
  assert.deepEqual(runtimeRoles, [
    'afex_offline_provisioning_runtime',
    'afex_offline_acquisition_runtime',
  ])
})

test('four trusted provisioning waves are whole-file transactions with bounded timeouts and attestations', async () => {
  for (const name of [
    '05A-TRUSTED-DEVICE-LIFECYCLE-WRITERS.sql',
    '06A-TRUSTED-EMPLOYEE-PIN-SELECTION-WRITERS.sql',
    '09A-TRUSTED-INVENTORY-SNAPSHOT-PUBLISHER.sql',
    '10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql',
  ]) {
    const source = await sql(name)
    assert.equal((source.match(/^BEGIN;$/gmu) ?? []).length, 1, name)
    assert.equal((source.match(/^COMMIT;$/gmu) ?? []).length, 1, name)
    assert.match(source, /SET LOCAL lock_timeout/u, name)
    assert.match(source, /SET LOCAL statement_timeout/u, name)
    assert.match(source, /POST_ATTESTATION_FAILED/u, name)
    assert.match(source, /Emergency disablement/iu, name)
    assert.match(source, /CURRENT_USER <> 'postgres'/u, name)
  }
})

test('forward statements and disablement cover all provisioning privileges exactly once', async () => {
  const matrix = await read(
    path.join(sqlRoot, 'SQL-AUTHORITY-FORWARD-DISABLEMENT-MATRIX.json')
  ).then(JSON.parse)
  for (const prefix of ['FWD-05A-', 'FWD-06A-', 'FWD-09A-', 'FWD-10A-']) {
    assert.equal(matrix.groups.some((group) => group.first.startsWith(prefix)), true, prefix)
  }
  const disablement = await sql('15-SAFE-DISABLEMENT-AND-ROLLBACK.sql')
  assert.match(disablement, /FROM afex_offline_provisioning_runtime/u)
  assert.doesNotMatch(disablement, /CASCADE/iu)
})

test('all twelve sensitive bridge flags remain immutable false', async () => {
  const bridge = await read(path.join(root, 'lib/offline/core-v2-offline-authority-bridge.ts'))
  const match = bridge.match(/CORE_V2_OFFLINE_BRIDGE_FLAGS = Object\.freeze\(\{([\s\S]*?)\}\s+as const\)/u)
  assert.ok(match)
  assert.equal((match[1].match(/:\s*false\b/gu) ?? []).length, 12)
  assert.equal((match[1].match(/:\s*true\b/gu) ?? []).length, 0)
})

test('business callers do not import or invoke the inactive bridge', async () => {
  const bridgeName = 'core-v2-offline-authority-bridge'
  const roots = ['app', 'components']
  const hits = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (/\.(?:ts|tsx|js|mjs)$/u.test(entry.name)) {
        if ((await read(full)).includes(bridgeName)) hits.push(path.relative(root, full))
      }
    }
  }
  for (const directory of roots) await walk(path.join(root, directory))
  assert.deepEqual(hits, [])
})

test('read-only attestation and fail-closed disablement retain the review boundary', async () => {
  const [attestation, disablement, cleanup] = await Promise.all([
    sql('14-POST-CHANGE-READ-ONLY-ATTESTATION.sql'),
    sql('15-SAFE-DISABLEMENT-AND-ROLLBACK.sql'),
    sql('15A-EMPTY-OBJECT-OWNER-AWARE-CLEANUP.sql'),
  ])
  assert.match(attestation, /^BEGIN TRANSACTION READ ONLY;$/mu)
  assert.match(attestation, /ROLLBACK;\s*$/u)
  assert.match(disablement, /REVOKE EXECUTE ON FUNCTION/u)
  assert.match(cleanup, /IF evidence_rows<>0 THEN/u)
  assert.doesNotMatch(disablement + cleanup, /^\s*(?:DROP|ALTER|CREATE).*CASCADE\b/gimu)
})

test('all active contracts use origin authority v2 and the exact fifteen-field reference', async () => {
  const [bridge, envelope, origin] = await Promise.all([
    read(path.join(root, 'lib/offline/core-v2-offline-authority-bridge.ts')),
    read(path.join(pilot, 'PILOT-CONTRACT-ORDER-CREATE-ENVELOPE.json')).then(JSON.parse),
    read(path.join(provenance, 'PROVENANCE-CLOSURE-ORIGIN-AUTHORITY.json')).then(JSON.parse),
  ])
  assert.match(bridge, /afex-offline-origin-authority\.v2/u)
  assert.equal(envelope.originAuthorityReference.exactRequiredFields.length, 15)
  assert.equal(origin.exactFieldCount, 15)
})
