import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')
const read = (relative) => readFile(path.join(root, relative), 'utf8')
const sqlRoot =
  'docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-SQL-AUTHORITY-FINAL-CANDIDATE'

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name)
      return entry.isDirectory() ? filesBelow(full) : [full]
    })
  )
  return nested.flat()
}

test('Pilot transport is server-only, default-off, and never public-configured', async () => {
  const source = await read('lib/server/offline/order-create-pilot-transport.ts')
  const route = await read('app/api/pos/offline-pilot/route.ts')
  assert.match(source, /^import 'server-only'/u)
  assert.match(source, /process\.env\.AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED === 'true'/u)
  assert.doesNotMatch(source + route, /NEXT_PUBLIC_/u)
  assert.match(source, /providerActions: false/u)
  assert.match(source, /externalEffects: false/u)
  assert.match(source, /OFFLINE_PILOT_DISABLED/u)
  assert.match(route, /handleOfflineOrderCreatePilotRequest\(request\)/u)
})

test('Pilot activation has one server-only global kill switch and no static UUID allowlist', async () => {
  const source = await read('lib/server/offline/order-create-pilot-transport.ts')
  const removedScopeVariables = [
    'AFEX_OFFLINE_ORDER_CREATE_PILOT_ACCOUNT_ID',
    'AFEX_OFFLINE_ORDER_CREATE_PILOT_TENANT_ID',
    'AFEX_OFFLINE_ORDER_CREATE_PILOT_BRANCH_ID',
    'AFEX_OFFLINE_ORDER_CREATE_PILOT_DEVICE_ID',
    'AFEX_OFFLINE_ORDER_CREATE_PILOT_EMPLOYEE_ID',
  ]
  for (const name of removedScopeVariables) assert.doesNotMatch(source, new RegExp(name, 'u'))
  assert.doesNotMatch(source, /PilotScope|readPilotScopeFromEnvironment|options\.scope/u)
  assert.match(source, /AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED === 'true'/u)
  assert.match(source, /OFFLINE_PILOT_DISABLED/u)
  assert.match(source, /OFFLINE_PILOT_MIXED_DEVICE_BATCH_REJECTED/u)
  assert.doesNotMatch(source, /NEXT_PUBLIC_AFEX_OFFLINE_ORDER_CREATE_PILOT/u)
})

test('two establishments resolve independent trusted authority without configured identities', async () => {
  const source = await read('lib/server/offline/order-create-pilot-transport.ts')
  for (const binding of [
    'authenticatedSubjectId: context.verifiedAuth.subjectId',
    'authenticatedSessionId: context.verifiedAuth.sessionId',
    'posActorSessionId: actor.sessionId',
    'actualPosEmployeeId: employee.id',
    'tenantId: context.tenantId',
    'branchId: context.activeBranchId',
  ]) assert.ok(source.includes(binding), binding)
  assert.match(source, /const trusted = assertTrustedContext\(authorization\.context\)/u)
  assert.doesNotMatch(source, /(?:account|tenant|branch|device|employee)Id:\s*process\.env/u)
})

test('trusted context is resolved server-side and hostile authority substitution fails closed', async () => {
  const source = await read('lib/server/offline/order-create-pilot-transport.ts')
  for (const token of [
    'requireAuthorizationContext',
    'context.verifiedAuth.subjectId',
    'context.verifiedAuth.sessionId',
    'context.posActorSession',
    'context.posEmployee',
    'context.tenantId',
    'context.activeBranchId',
    'OFFLINE_PILOT_TRUSTED_CONTEXT_MISMATCH',
    'OFFLINE_PILOT_ENVELOPE_AUTHORITY_SUBSTITUTION_REJECTED',
    'OFFLINE_PILOT_CLAIM_AUTHORITY_SUBSTITUTION_REJECTED',
    'assertDynamicRequestAuthority',
    'requestDeviceId',
  ]) assert.ok(source.includes(token), token)
  const authorization = await read('lib/authorization-context.ts')
  assert.match(authorization, /requireVerifiedAuthContext\(supabase\)/u)
  assert.match(authorization, /supplied-but-invalid POS token is an ambiguous\/revoked authority state/u)
  assert.match(authorization, /POS actor session is invalid or revoked/u)
})

test('dynamic claims bind tenant branch employee device generations before fresh resolver or receipt authority', async () => {
  const source = await read('lib/server/offline/order-create-pilot-transport.ts')
  for (const binding of [
    'value.primaryAuthenticatedUserId !== trusted.authenticatedSubjectId',
    'value.actualPosEmployeeId !== trusted.actualPosEmployeeId',
    'value.tenantId !== trusted.tenantId',
    'value.branchId !== trusted.branchId',
    'value.deviceGeneration',
    'value.employeeEnrollmentGeneration',
    'value.commandGeneration',
  ]) assert.ok(source.includes(binding), binding)
  assert.match(source, /case 'receipt\.lookup'[\s\S]*afex_offline_server_lookup_receipts_v1/u)
  assert.match(source, /assertDynamicRequestAuthority\(body\.operation, body\.payload, trusted\)[\s\S]*executeOperation/u)
})

test('transport accepts an exact operation schema and only the bounded Pilot operations', async () => {
  const source = await read('lib/server/offline/order-create-pilot-transport.ts')
  const operationBlock = source.match(
    /OFFLINE_ORDER_CREATE_PILOT_OPERATIONS = Object\.freeze\(\[([\s\S]*?)\]\s+as const\)/u
  )
  assert.ok(operationBlock)
  const operations = [...operationBlock[1].matchAll(/'([^']+)'/gu)].map((match) => match[1])
  assert.deepEqual(operations, [
    'online.bootstrap',
    'device.register',
    'device.activate',
    'employee.enroll',
    'employee.replace_pin',
    'inventory.publish',
    'inventory.read',
    'order.create.resolve_and_acquire',
    'receipt.lookup',
    'account.logout',
    'account.recovery',
  ])
  assert.match(source, /exactRecord\(\s*value,\s*\['operation', 'payload'\]/u)
  assert.match(source, /OFFLINE_PILOT_OPERATION_NOT_ALLOWED/u)
  assert.match(source, /OFFLINE_PILOT_PAYLOAD_SCHEMA_INVALID/u)
})

test('order.create resolver is bounded, positional, validated, and stops before acquisition on rejection', async () => {
  const source = await read('lib/server/offline/order-create-pilot-transport.ts')
  assert.match(source, /Math\.min\(\s*1_000,\s*CORE_V2_OFFLINE_LIMITS\.maximumBatchSize/u)
  assert.match(source, /parseCoreV2OfflineCommandEnvelope/u)
  assert.match(source, /qualifyCoreV2OfflineReplayBatch\(inputs, resolver\)/u)
  assert.match(source, /new Array\(qualifications\.length\)\.fill\(null\)/u)
  assert.match(source, /if \(qualification\.outcome !== 'qualified'\) \{\s*continue/u)
  assert.match(source, /OFFLINE_PILOT_RESOLVER_OUTPUT_MALFORMED/u)
  assert.match(source, /afex_offline_server_resolve_order_create_batch_v1/u)
  assert.match(source, /afex_offline_server_acquire_order_create_v1/u)
})

test('pilot integration remains immutable-false and is not called by checkout before W2', async () => {
  const integration = await read('lib/offline/order-create-pilot-pos-integration.ts')
  const checkout = await read('hooks/use-invoice-checkout.ts')
  assert.doesNotMatch(checkout, /resolveOfflineOrderCreatePilotCheckout/u)
  assert.match(checkout, /إتمام البيع والدفع غير متاح/u)
  assert.match(integration, /APP_COMPAT_SAFETY_FLAGS\.offlineOrderCreate/u)
  assert.match(integration, /maximumPinFailures: 5/u)
  assert.match(integration, /preservePendingCommandsOnExplicitLogout: true/u)
  assert.match(integration, /requireSameAccountOnlineRecovery: true/u)
  assert.match(integration, /adminDashboardOfflineBehavior: false/u)
  assert.match(integration, /providerActions: false/u)
  assert.match(integration, /externalEffects: false/u)
})

test('all eight payment methods remain distinct and provider state is never asserted', async () => {
  const integration = await read('lib/offline/order-create-pilot-pos-integration.ts')
  const methods = integration.match(
    /OFFLINE_ORDER_CREATE_PILOT_PAYMENT_METHODS = Object\.freeze\(\[([\s\S]*?)\]\s+as const\)/u
  )
  assert.ok(methods)
  const values = [...methods[1].matchAll(/'([^']+)'/gu)].map((match) => match[1])
  assert.deepEqual(values, [
    'mada','cash','visa','cod','card','bank_transfer','transfer','on_delivery',
  ])
  assert.equal(new Set(values).size, 8)
  assert.doesNotMatch(integration, /provider(?:Status|Confirmed):\s*(?:true|'verified')/u)
})

test('managed device and employee capacity invariants remain database-enforced', async () => {
  const roleAuthority = await read(`${sqlRoot}/05A-TRUSTED-DEVICE-LIFECYCLE-WRITERS.sql`)
  const employeeAuthority = await read(`${sqlRoot}/06A-TRUSTED-EMPLOYEE-PIN-SELECTION-WRITERS.sql`)
  const invariantAuthority = await read(`${sqlRoot}/13-INDEXES-CONSTRAINTS-AND-INVARIANTS.sql`)
  const combined = `${roleAuthority}\n${employeeAuthority}\n${invariantAuthority}`
  assert.match(combined, /25/u)
  assert.match(combined, /offline_devices_one_active_branch_uidx/iu)
  assert.match(combined, /device_generation/iu)
  assert.match(combined, /enrollment_generation/iu)
})

test('logout locks authority while restart recovery remains same-account and PIN-selection bounded', async () => {
  const integration = await read('lib/offline/order-create-pilot-pos-integration.ts')
  const phase1 = await read('lib/offline/phase1.ts')
  const transport = await read('lib/server/offline/order-create-pilot-transport.ts')
  assert.match(integration, /preservePendingCommandsOnExplicitLogout: true/u)
  assert.match(integration, /requireSameAccountOnlineRecovery: true/u)
  assert.match(integration, /maximumPinFailures: 5/u)
  assert.match(phase1, /finalizeOfflineSessionIntent\(intent: 'logout' \| 'switch'\)/u)
  assert.match(phase1, /if \(intent === 'logout'\) clearActiveOfflineNamespace\(\)/u)
  assert.match(transport, /afex_offline_server_logout_v1/u)
  assert.match(transport, /afex_offline_server_recovery_state_v1/u)
})

test('all twelve bridge flags remain false and only approved client runtime flags are enabled', async () => {
  const bridge = await read('lib/offline/core-v2-offline-authority-bridge.ts')
  const bridgeFlags = bridge.match(
    /CORE_V2_OFFLINE_BRIDGE_FLAGS = Object\.freeze\(\{([\s\S]*?)\}\s+as const\)/u
  )
  assert.ok(bridgeFlags)
  assert.equal((bridgeFlags[1].match(/:\s*false\b/gu) ?? []).length, 12)
  assert.equal((bridgeFlags[1].match(/:\s*true\b/gu) ?? []).length, 0)
  const compat = await read('lib/offline/application-compatibility.ts')
  const compatFlags = compat.match(
    /APP_COMPAT_SAFETY_FLAGS = Object\.freeze\(\{([\s\S]*?)\}\)/u
  )
  assert.ok(compatFlags)
  assert.equal((compatFlags[1].match(/:\s*false\b/gu) ?? []).length, 4)
  assert.equal((compatFlags[1].match(/:\s*true\b/gu) ?? []).length, 6)
  assert.match(compatFlags[1], /paymentProviderAction:\s*false/u)
  assert.match(compatFlags[1], /externalEffects:\s*false/u)
})

test('Admin and Dashboard remain outside shell, outbox, transport, and replay integration', async () => {
  const sw = await read('public/sw.js')
  assert.match(sw, /url\.pathname === '\/pos' \|\| url\.pathname\.startsWith\('\/pos\/'\)/u)
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/u)
  assert.doesNotMatch(sw, /startsWith\('\/admin/u)
  const adminFiles = (await filesBelow(path.join(root, 'app/admin')))
    .filter((file) => /\.(?:ts|tsx|js|jsx|mjs)$/u.test(file))
  const imports = []
  for (const file of adminFiles) {
    const source = await readFile(file, 'utf8')
    if (/from\s+['"][^'"]*(?:lib\/offline|offline-pilot|phase3)['"]/u.test(source)) {
      imports.push(path.relative(root, file))
    }
  }
  assert.deepEqual(imports, [])
})

test('Foundation SQL retains only the successful PostgreSQL 17 owner transition', async () => {
  const names = (await readdir(path.join(root, sqlRoot))).filter((name) => name.endsWith('.sql'))
  const all = (await Promise.all(names.map((name) => read(`${sqlRoot}/${name}`)))).join('\n')
  assert.doesNotMatch(all, /GRANT[^;]*SET FALSE/iu)
  assert.doesNotMatch(
    all,
    /has_(?:schema|table|column|function)_privilege\s*\(\s*'PUBLIC'/iu
  )
  assert.match(all, /WITH ADMIN FALSE, INHERIT FALSE, SET TRUE\s+GRANTED BY CURRENT_USER;/u)
  assert.match(all, /REVOKE afex_[a-z_]+ FROM postgres GRANTED BY CURRENT_USER;/u)
  assert.match(all, /acl\.grantee=0/u)
})

test('read-only support relations are not row-locked by bounded readers', async () => {
  const files = [
    '05A-TRUSTED-DEVICE-LIFECYCLE-WRITERS.sql',
    '08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql',
    '08C-TOTAL-RESOLVER-AND-INVENTORY-READER.sql',
    '08D-ATOMIC-ORDER-CREATE-ACQUISITION.sql',
    '09A-TRUSTED-INVENTORY-SNAPSHOT-PUBLISHER.sql',
    '10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql',
    '11-IDEMPOTENCY-RECEIPT-AND-EFFECT-LEDGERS.sql',
  ]
  const all = (await Promise.all(files.map((name) => read(`${sqlRoot}/${name}`)))).join('\n')
  for (const relation of [
    'public.branches',
    'public.profiles',
    'public.pos_profiles',
    'public.inventory_stock',
    'afex_pos_authority.actor_sessions',
    'public.atomic_authorization_contexts',
    'public.atomic_order_commands',
  ]) {
    const escaped = relation.replace('.', '\\.')
    assert.doesNotMatch(
      all,
      new RegExp(`FROM\\s+${escaped}[^;]*FOR\\s+(?:UPDATE|KEY SHARE)`, 'iu'),
      relation
    )
  }
})

test('function-body identity canonicalizes CRLF to LF before MD5 and octet checks', async () => {
  const helper = await read(`${sqlRoot}/04A-TRUSTED-AUTH-SESSION-BRIDGE.sql`)
  const attestation = await read(`${sqlRoot}/14-POST-CHANGE-READ-ONLY-ATTESTATION.sql`)
  for (const source of [helper, attestation]) {
    assert.match(
      source,
      /replace\((?:helper_source|p\.prosrc),E'\\r\\n',E'\\n'\)/u
    )
  }
})

test('final Activation and deactivation map exactly and execution remains human-attested', async () => {
  const activation = await read(`${sqlRoot}/90-FINAL-MANUAL-PILOT-ACTIVATION.sql`)
  const deactivation = await read(`${sqlRoot}/90Z-FINAL-EMERGENCY-PILOT-DEACTIVATION.sql`)
  assert.match(activation, /NOT_EXECUTED_REQUIRES_FINAL_HUMAN_APPROVAL/u)
  assert.equal((activation.match(/^CREATE FUNCTION public\.afex_offline_server_/gmu) ?? []).length, 13)
  assert.equal((activation.match(/public\.afex_offline_server_[a-z_]+_v1\(/gu) ?? []).length > 25, true)
  assert.match(activation, /FROM PUBLIC,anon,authenticated,service_role;/u)
  assert.doesNotMatch(activation, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+(?:TABLE|ALL TABLES)/iu)
  assert.match(deactivation, /FROM service_role/u)
  const matrix = JSON.parse(await read(`${sqlRoot}/SQL-AUTHORITY-FUNCTION-MATRIX.json`))
  const normalize = (value) => value.replace(/\s+/gu, '').replaceAll('timestampwithtimezone', 'timestamptz')
  const active = normalize(activation)
  const inactive = normalize(deactivation)
  for (const signature of matrix.finalManualActivation.serviceRoleFacades) {
    assert.ok(active.includes(normalize(signature)), signature)
    assert.ok(inactive.includes(normalize(signature)), signature)
  }
})

test('human Foundation attestation and separate Activation status are frozen', async () => {
  const evidence = JSON.parse(
    await read(`${sqlRoot}/SQL-AUTHORITY-PRODUCTION-INSTALLER-EVIDENCE.json`)
  )
  assert.equal(evidence.foundationExecution.status, 'FOUNDATION_EXECUTED_AND_ATTESTED_BY_HUMAN')
  assert.equal(evidence.foundationExecution.wavesComplete, 22)
  assert.equal(evidence.foundationExecution.wavesExpected, 22)
  assert.equal(evidence.foundationExecution.privateRelationCount, 11)
  assert.equal(evidence.foundationExecution.invalidOwnerMembershipCount, 0)
  assert.equal(evidence.foundationExecution.browserPrivateTableAccessCount, 0)
  assert.equal(evidence.activation.status, 'ACTIVATION_EXECUTED_AND_ATTESTED_BY_HUMAN_FLAGS_FALSE')
  assert.equal(evidence.activation.authorized, true)
  assert.equal(evidence.activation.facadeCount, 13)
  assert.equal(evidence.activation.serviceRoleFacadeExecuteCount, 12)
  assert.equal(evidence.activation.activationFlagsChanged, false)
  assert.equal(evidence.activation.serviceRolePrivateTableAccessCount, 0)
  assert.equal(evidence.productionQueriesExecutedByConstruction, 0)
})
