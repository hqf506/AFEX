import assert from 'node:assert/strict'
import { inspect } from 'node:util'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const sourcePath = new URL(
  '../lib/server/offline/trusted-actor-provenance.ts',
  import.meta.url
)
const authorizationContextPath = new URL(
  '../lib/authorization-context.ts',
  import.meta.url
)
const orderRoutePath = new URL('../app/api/orders/route.ts', import.meta.url)
const closureDirectory = new URL(
  '../docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-TRUSTED-ACTOR-PROVENANCE-CLOSURE/',
  import.meta.url
)
const sqlDirectory = new URL(
  '../docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-SQL-AUTHORITY-FINAL-CANDIDATE/',
  import.meta.url
)

async function importContract() {
  const source = await readFile(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText.replace(/import ['"]server-only['"];?/u, '')
  return import(
    `data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled)}#${Date.now()}-${Math.random()}`
  )
}

const ids = {
  subject: '00000000-0000-4000-8000-000000000001',
  authSession: '00000000-0000-4000-8000-000000000002',
  actorSession: '00000000-0000-4000-8000-000000000003',
  employee: '00000000-0000-4000-8000-000000000004',
  tenant: '00000000-0000-4000-8000-000000000005',
  branch: '00000000-0000-4000-8000-000000000006',
}

function verifiedAuth(overrides = {}) {
  return {
    subjectId: ids.subject,
    sessionId: ids.authSession,
    user: { id: ids.subject },
    ...overrides,
  }
}

function effectivePosActor(overrides = {}) {
  return {
    sessionId: ids.actorSession,
    actorId: ids.employee,
    authenticatedSubjectId: ids.subject,
    authenticatedSessionId: ids.authSession,
    tenantId: ids.tenant,
    branchId: ids.branch,
    role: 'cashier',
    ...overrides,
  }
}

test('trusted uploader context preserves exact server actor-session provenance', async () => {
  const contract = await importContract()
  const context = contract.createShadowTrustedSyncUploaderContext({
    verifiedAuth: verifiedAuth(),
    effectivePosActor: effectivePosActor(),
  })
  assert.equal(context.authenticatedSubjectId, ids.subject)
  assert.equal(context.authenticatedSessionId, ids.authSession)
  assert.equal(context.posActorSessionId, ids.actorSession)
  assert.equal(context.actualPosEmployeeId, ids.employee)
  assert.equal(context.classification, 'SHADOW_PROVENANCE_NOT_ACTIVE')
  assert.equal(context.activeForAuthorization, false)
  assert.equal(Object.isFrozen(context), true)
})

test('trusted uploader context rejects session and subject substitution', async () => {
  const contract = await importContract()
  assert.throws(
    () => contract.createShadowTrustedSyncUploaderContext({
      verifiedAuth: verifiedAuth(),
      effectivePosActor: effectivePosActor({
        authenticatedSessionId: ids.actorSession,
      }),
    }),
    /TRUSTED_SYNC_UPLOADER_CONTEXT_INVALID:actor-session/u
  )
  assert.throws(
    () => contract.createShadowTrustedSyncUploaderContext({
      verifiedAuth: verifiedAuth({ user: { id: ids.employee } }),
      effectivePosActor: effectivePosActor(),
    }),
    /TRUSTED_SYNC_UPLOADER_CONTEXT_INVALID:subject/u
  )
})

test('trusted uploader context cannot serialize or leak through inspection', async () => {
  const contract = await importContract()
  const context = contract.createShadowTrustedSyncUploaderContext({
    verifiedAuth: verifiedAuth(),
    effectivePosActor: effectivePosActor(),
  })
  assert.throws(
    () => JSON.stringify(context),
    /TRUSTED_SYNC_UPLOADER_CONTEXT_SERIALIZATION_FORBIDDEN/u
  )
  assert.equal(inspect(context), '[TrustedSyncUploaderContext REDACTED]')
})

test('server-only propagation is shadow-only and current Core boundary is unchanged', async () => {
  const [contractSource, authorizationSource, orderRouteSource] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile(authorizationContextPath, 'utf8'),
    readFile(orderRoutePath, 'utf8'),
  ])
  assert.match(contractSource, /^import 'server-only'/u)
  assert.match(authorizationSource, /posActorSession: effectivePosActor/u)
  assert.match(authorizationSource, /trustedOfflineSyncContext: effectivePosActor/u)
  assert.match(orderRouteSource, /actorId: auth\.user\.id/u)
  assert.doesNotMatch(orderRouteSource, /trustedOfflineSyncContext|posActorSessionId/u)
})

test('frozen session policy distinguishes durable origin from the current uploader', async () => {
  const [policy, uploader] = await Promise.all([
    readFile(new URL('PROVENANCE-CLOSURE-SESSION-EXPIRY-AND-REVOCATION.md', closureDirectory), 'utf8'),
    readFile(new URL('PROVENANCE-CLOSURE-SYNC-UPLOADER-AUTHORITY.json', closureDirectory), 'utf8').then(JSON.parse),
  ])
  assert.match(
    policy,
    /Original Online Auth session expires during outage without explicit logout.*Retained Offline bootstrap remains locally eligible/iu
  )
  assert.match(policy, /Current uploader has no valid verified Auth session.*Reject/iu)
  assert.match(policy, /Current uploader session changes.*Allow only after fresh verification/iu)
  assert.match(policy, /Stable receipt after origin revocation.*Do not return receipt/iu)
  assert.equal(uploader.browserJsonConstructible, false)
  assert.equal(uploader.twoMatchingCallerUuidsAreAuthority, false)
  assert.equal(uploader.serviceRoleEqualityIsAuthentication, false)
})

test('inactive SQL shares fresh uploader and immutable-origin validation across all four contracts', async () => {
  const [validatorSql, resolverSql, acquisitionSql, receiptSql, matrix] = await Promise.all([
    readFile(new URL('08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql', sqlDirectory), 'utf8'),
    readFile(new URL('08C-TOTAL-RESOLVER-AND-INVENTORY-READER.sql', sqlDirectory), 'utf8'),
    readFile(new URL('08D-ATOMIC-ORDER-CREATE-ACQUISITION.sql', sqlDirectory), 'utf8'),
    readFile(new URL('11-IDEMPOTENCY-RECEIPT-AND-EFFECT-LEDGERS.sql', sqlDirectory), 'utf8'),
    readFile(new URL('PROVENANCE-CLOSURE-DATABASE-SIGNATURES.json', closureDirectory), 'utf8').then(JSON.parse),
  ])
  assert.equal(matrix.contracts.length, 4)
  assert.match(validatorSql, /validate_offline_provenance_v2/u)
  assert.match(validatorSql, /p\.is_active = true/u)
  assert.match(validatorSql, /actor_row\.actor_id <> origin_employee/u)
  assert.match(validatorSql, /employee_row\.primary_authenticated_subject_id <> p_sync_authenticated_subject_id/u)
  assert.match(resolverSql, /resolve_offline_order_create_authority_batch_v2/u)
  assert.match(resolverSql, /WITH ORDINALITY/u)
  assert.match(resolverSql, /jsonb_array_length\(result_value\) <> claim_count/u)
  assert.match(acquisitionSql, /validate_payment_attestation_v2/u)
  assert.match(acquisitionSql, /validate_inventory_frontier_v2/u)
  assert.match(acquisitionSql, /assert_offline_core_order_mapping_v2/u)
  assert.match(receiptSql, /resolve_offline_order_create_authority_batch_v2/u)
  const contractSql = `${resolverSql}\n${acquisitionSql}\n${receiptSql}`
  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    assert.match(contractSql, new RegExp(`FROM PUBLIC, anon, authenticated, service_role`, 'u'), role)
  }
  assert.doesNotMatch(contractSql, /GRANT EXECUTE[\s\S]{0,180}TO (?:PUBLIC|anon|authenticated|service_role)/u)
})
