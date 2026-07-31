import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'
import {
  analyzeVirtualFiles,
  formatViolation,
  scanRepository,
  scannerExitCode,
} from './check-core-v2-boundaries.mjs'

const root = process.cwd()
const require = createRequire(import.meta.url)
const moduleCache = new Map()
let testCount = 0
let scannerFixtureCount = 0
const exercisedScannerRules = new Set()
const pendingChecks = []

function resolveLocal(specifier, parentFile) {
  const base =
    specifier.startsWith('@/')
      ? path.join(root, specifier.slice(2))
      : specifier.startsWith('.')
        ? path.resolve(path.dirname(parentFile), specifier)
        : null
  if (!base) return null
  for (const extension of ['.ts', '.tsx', '.js', '.mjs']) {
    if (fs.existsSync(`${base}${extension}`)) return `${base}${extension}`
  }
  for (const extension of ['.ts', '.tsx', '.js', '.mjs']) {
    const candidate = path.join(base, `index${extension}`)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function loadTypeScriptModule(relativeOrAbsolute) {
  const filename = path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.join(root, relativeOrAbsolute)
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports
  const commonJsModule = { exports: {} }
  moduleCache.set(filename, commonJsModule)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
  const localRequire = (specifier) => {
    if (specifier === 'server-only') return {}
    const local = resolveLocal(specifier, filename)
    return local ? loadTypeScriptModule(local) : require(specifier)
  }
  new Function('require', 'module', 'exports', output)(
    localRequire,
    commonJsModule,
    commonJsModule.exports
  )
  return commonJsModule.exports
}

function check(name, operation) {
  const result = operation()
  if (result && typeof result.then === 'function')
    pendingChecks.push(result.catch((error) => {
      error.message = `${name}: ${error.message}`
      throw error
    }))
  testCount += 1
}

function rejects(name, operation) {
  check(name, () => assert.throws(operation))
}

function rejectsContract(name, operation, code, field) {
  check(name, () =>
    assert.throws(
      operation,
      (error) =>
        error?.code === code &&
        (field === undefined || error?.field === field),
      `${name} must fail with ${code}${field ? ` at ${field}` : ''}`
    )
  )
}

function scannerFixture(
  name,
  files,
  expectedRules,
  expectedText = []
) {
  const findings = analyzeVirtualFiles(files)
  assert.deepEqual(
    [...new Set(findings.map((finding) => finding.rule))].sort(),
    [...expectedRules].sort(),
    name
  )
  assert.equal(
    scannerExitCode(findings),
    expectedRules.length > 0 ? 1 : 0,
    `${name} exit status`
  )
  const output = findings.map(formatViolation).join('\n')
  for (const finding of findings.filter((item) => item.rule.startsWith('adapter_'))) {
    assert.equal(typeof finding.file, 'string', `${name} root path`)
    assert.equal(Number.isInteger(finding.line) && finding.line > 0, true, `${name} line`)
    assert.equal(Number.isInteger(finding.column) && finding.column > 0, true, `${name} column`)
    assert.match(formatViolation(finding), new RegExp(`^${finding.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:${finding.line}:${finding.column}: ${finding.rule}:`))
    if (finding.rule === 'adapter_forbidden_package_import') {
      assert.match(finding.description, /Adapter root .+; import chain .+; forbidden package .+; source .+:\d+:\d+; import kind (?:static|export-from|require|dynamic-literal|static-template)\./)
    }
    if (finding.rule === 'adapter_generic_query_surface') {
      assert.match(finding.description, /forbidden member .+; origin .+:\d+:\d+; provenance .+; exposed\/used at .+:\d+:\d+\./)
    }
  }
  for (const text of expectedText)
    assert.match(output, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  for (const finding of findings) exercisedScannerRules.add(finding.rule)
  scannerFixtureCount += 1
  testCount += 1
}

const validators = loadTypeScriptModule('lib/core-v2/validation/index.ts')
const contracts = loadTypeScriptModule('lib/core-v2/contracts/index.ts')
const rootExports = loadTypeScriptModule('lib/core-v2/index.ts')
const boundaryRules = loadTypeScriptModule(
  'lib/core-v2/boundaries/import-rules.ts'
)
const adapter = loadTypeScriptModule('lib/core-v2/adapter/index.ts')
const lifecycle = loadTypeScriptModule('lib/core-v2/adapter/lifecycle.ts')
const fakeAdapter = loadTypeScriptModule(
  'lib/core-v2/adapter/internal/test-fake-transport.ts'
)
const uuid = '123e4567-e89b-42d3-a456-426614174000'

check('UUID and ID validation', () => {
  assert.equal(validators.asTenantId(uuid), uuid)
  assert.equal(validators.asBranchId(uuid), uuid)
  assert.throws(() => validators.asActorId(''))
  assert.throws(() => validators.asActorId('123E4567-E89B-42D3-A456-426614174000'))
  assert.throws(() => validators.asCommandId('not-a-uuid'))
})

check('idempotency validation', () => {
  assert.equal(validators.validateIdempotencyKey('pos.order:abc-123'), 'pos.order:abc-123')
  assert.throws(() => validators.validateIdempotencyKey(undefined))
  assert.throws(() => validators.validateIdempotencyKey('contains space'))
  assert.throws(() => validators.validateIdempotencyKey('a'.repeat(513)))
})

check('runtime states', () => {
  for (const state of contracts.CORE_V2_RUNTIME_STATES)
    assert.equal(validators.validateRuntimeState(state), state)
  assert.throws(() => validators.validateRuntimeState('ACTIVE'))
})

check('migration and command dispositions', () => {
  for (const value of contracts.LEGACY_PATH_MIGRATION_DISPOSITIONS)
    assert.equal(validators.validateMigrationDisposition(value), value)
  for (const value of contracts.COMMAND_DISPOSITIONS)
    assert.equal(validators.validateCommandDisposition(value), value)
  assert.throws(() => validators.validateMigrationDisposition('DELETE'))
  assert.throws(() => validators.validateCommandDisposition('succeeded'))
})

check('hard-disabled adapter always fails with stable code', async () => {
  const transport = adapter.createHardDisabledTrustedAdapter({ enabled: true })
  await assert.rejects(
    transport.acquire({}),
    (error) => error?.code === 'CORE_V2_ADAPTER_DISABLED'
  )
})

check('adapter lifecycle declaration is complete and inert', () => {
  assert.deepEqual(lifecycle.TRUSTED_ADAPTER_LIFECYCLE_STATES, [
    'disabled',
    'configuration_unavailable',
    'ready_for_transport',
    'acquiring_connection',
    'transaction_started',
    'identity_verified_before_activation',
    'role_activated',
    'identity_verified_after_activation',
    'acquisition_executed',
    'transaction_committed',
    'transaction_rolled_back',
    'cleanup_verified',
    'connection_quarantined',
    'failed_closed',
  ])
})

check('test fake records only safe call metadata', async () => {
  const row = {
    acquisition_result: 'created',
    authorization_context_id: uuid,
    atomic_command_id: uuid,
    correlation_reference: uuid,
    command_status: 'reserved',
    response_version: null,
    response_snapshot: null,
    completed_at: null,
    error_code: null,
    error_detail: null,
    last_failure_stage: null,
    stored_request_fingerprint: new Uint8Array(32),
  }
  const fake = new fakeAdapter.TestFakeTrustedAcquisitionTransport({ results: [row] })
  const returned = await fake.acquire({ secret: 'must-not-be-recorded' })
  assert.notEqual(returned, row)
  assert.equal(returned.acquisition_result, 'created')
  assert.notEqual(returned.stored_request_fingerprint, row.stored_request_fingerprint)
  assert.deepEqual(fake.snapshot(), { callCount: 1, dispositions: ['created'] })
  assert.equal(JSON.stringify(fake.snapshot()).includes('secret'), false)
})

check('test fake snapshots caller-owned rows at construction', async () => {
  const fingerprint = new Uint8Array(32)
  const row = {
    acquisition_result: 'created', authorization_context_id: uuid,
    atomic_command_id: uuid, correlation_reference: uuid,
    command_status: 'reserved', response_version: null,
    response_snapshot: { nested: { stable: true } }, completed_at: null,
    error_code: null, error_detail: null, last_failure_stage: null,
    stored_request_fingerprint: fingerprint,
  }
  const fake = new fakeAdapter.TestFakeTrustedAcquisitionTransport({ results: [row] })
  row.acquisition_result = 'replay'
  row.response_snapshot.nested.stable = false
  fingerprint[0] = 255
  const returned = await fake.acquire({})
  assert.equal(returned.acquisition_result, 'created')
  assert.equal(returned.response_snapshot.nested.stable, true)
  assert.equal(returned.stored_request_fingerprint[0], 0)
  returned.response_snapshot.nested.stable = false
  returned.stored_request_fingerprint[0] = 7
  assert.deepEqual(fake.snapshot(), { callCount: 1, dispositions: ['created'] })
})

check('test fake supports deterministic failure injection', async () => {
  const fake = new fakeAdapter.TestFakeTrustedAcquisitionTransport({
    failure: new Error('injected'),
  })
  await assert.rejects(fake.acquire({}), /injected/)
  assert.deepEqual(fake.snapshot(), { callCount: 1, dispositions: [] })
})

check('production adapter barrel excludes fake and lifecycle internals', () => {
  assert.equal('TestFakeTrustedAcquisitionTransport' in adapter, false)
  assert.equal('TRUSTED_ADAPTER_LIFECYCLE_STATES' in adapter, false)
})

const plainAuthority = {
  contextId: uuid,
  authenticatedActorId: uuid,
  tenantId: uuid,
  branchId: uuid,
  roleSnapshot: 'cashier',
  capabilityVersion: 1n,
  employeeSource: 'profile',
  employeeSourceId: uuid,
  commandType: 'order.create',
  issuedAt: '2026-07-31T10:00:00.000000Z',
  expiresAt: '2026-07-31T10:02:00.000000Z',
}
const plainEnvelope = {
  authorization: plainAuthority,
  identity: { commandId: uuid, ledgerId: uuid },
  idempotency: {
    tenantId: uuid,
    branchId: uuid,
    commandType: 'order.create',
    key: 'pos.order:abc-123',
  },
  correlationId: uuid,
  commandType: 'order.create',
  payload: {
    version: 'order-command-payload-v1',
    canonicalBytes: '{"a":1}',
    fingerprint: {
      version: 'order-request-fingerprint-v1',
      canonicalProjection: '{"a":1}',
      fingerprint: 'not-runtime-validated',
    },
  },
  diagnostics: { requestReference: null, source: 'pos' },
}

rejectsContract(
  'plain authority cannot form an envelope',
  () => validators.validateCommandEnvelope(plainEnvelope),
  'DATABASE_AUTHORITY_PROVENANCE_REQUIRED',
  'authorization'
)
rejectsContract(
  'caller authority cannot be promoted',
  () =>
    validators.validateCommandEnvelope({
      ...plainEnvelope,
      caller: { tenantId: uuid, role: 'admin' },
    }),
  'CALLER_AUTHORITY_FORBIDDEN',
  'envelope.caller.tenantId'
)

check('root export closure', () => {
  for (const key of [
    'InternalDiagnosticError',
    'CORE_V2_DATABASE_CREDENTIAL',
    'databaseAuthorityBrand',
    'normalizedFingerprintBrand',
    'markDatabaseAuthority',
  ])
    assert.equal(Object.hasOwn(rootExports, key), false, key)
  const outboxSource = fs.readFileSync(
    path.join(root, 'lib/core-v2/contracts/outbox.ts'),
    'utf8'
  )
  assert.doesNotMatch(
    outboxSource,
    /export\s+(?:const|function)\s+validatedOutboxPayloadBrand/
  )
})

check('declarative scanner rule IDs are exact', () => {
  assert.deepEqual(boundaryRules.CORE_V2_FORBIDDEN_IMPORT_RULES, [
    'client_to_core_v2',
    'browser_to_service_role',
    'ui_to_trusted_runtime',
    'client_to_core_v2_internal',
    'api_to_browser_supabase_client',
    'core_v2_legacy_fallback',
    'browser_sensitive_environment_reachability',
    'browser_unresolved_environment_access',
    'core_v2_environment_access',
    'application_core_v2_ledger_access',
    'route_core_v2_activation',
    'contract_forbidden_import',
    'contract_forbidden_runtime_access',
    'adapter_forbidden_package_import',
    'adapter_environment_access',
    'adapter_generic_query_surface',
    'adapter_dynamic_surface_construct',
    'adapter_direct_p2d20_call',
    'adapter_caller_role_target',
    'adapter_test_fake_production_export',
  ])
})

check('outbox validated payload is structurally opaque', () => {
  const typeTest = fs.readFileSync(
    path.join(root, 'scripts/core-v2-contract-type-tests.ts'),
    'utf8'
  )
  assert.match(typeTest, /@ts-expect-error plain JSON lacks validated provenance/)
  assert.match(typeTest, /@ts-expect-error event envelope requires validated provenance/)
})

const rawBase = {
  acquisition_result: 'created',
  authorization_context_id: uuid,
  atomic_command_id: uuid,
  correlation_reference: uuid,
  command_status: 'reserved',
  response_version: null,
  response_snapshot: null,
  completed_at: null,
  error_code: null,
  error_detail: null,
  last_failure_stage: null,
  stored_request_fingerprint: new Uint8Array([1, 2, 3]),
}

check('created acquisition result', () =>
  assert.equal(
    validators.validateP2D20RawAcquisitionRow(rawBase).acquisition_result,
    'created'
  )
)
check('in-progress acquisition result', () => {
  const row = { ...rawBase, acquisition_result: 'in_progress', command_status: 'processing' }
  assert.equal(validators.validateP2D20RawAcquisitionRow(row).acquisition_result, 'in_progress')
})
check('successful replay acquisition result', () => {
  const row = {
    ...rawBase,
    acquisition_result: 'replay',
    command_status: 'succeeded',
    response_version: 'v1',
    response_snapshot: { orderId: uuid },
    completed_at: '2026-07-31T10:01:00.000000Z',
  }
  assert.equal(validators.validateP2D20RawAcquisitionRow(row).acquisition_result, 'replay')
  const normalized = validators.validateP2D20RawAcquisitionRow(row)
  assert.notEqual(normalized.response_snapshot, row.response_snapshot)
  assert.equal(Object.isFrozen(normalized.response_snapshot), true)
})
check('failed replay acquisition result', () => {
  const row = {
    ...rawBase,
    acquisition_result: 'replay',
    command_status: 'failed_final',
    error_code: 'ORDER_FAILED',
    error_detail: null,
    last_failure_stage: 'persist',
  }
  assert.equal(validators.validateP2D20RawAcquisitionRow(row).acquisition_result, 'replay')
})
check('fingerprint-conflict acquisition result', () => {
  const row = {
    ...rawBase,
    acquisition_result: 'fingerprint_conflict',
    authorization_context_id: null,
    command_status: 'succeeded',
  }
  assert.equal(
    validators.validateP2D20RawAcquisitionRow(row).acquisition_result,
    'fingerprint_conflict'
  )
  assert.equal(row.authorization_context_id, null)
})

check('installed execution states are exact', () => {
  assert.deepEqual(contracts.COMMAND_EXECUTION_STATES, [
    'reserved',
    'processing',
    'succeeded',
    'failed_retryable',
    'failed_final',
  ])
})

check('all installed in-progress states are accepted', () => {
  for (const commandStatus of ['reserved', 'processing', 'failed_retryable']) {
    const result = validators.validateP2D20RawAcquisitionRow({
      ...rawBase,
      acquisition_result: 'in_progress',
      command_status: commandStatus,
    })
    assert.equal(result.command_status, commandStatus)
  }
})

check('fingerprint conflict never returns executable authority', () => {
  for (const commandStatus of contracts.COMMAND_EXECUTION_STATES) {
    const result = validators.validateP2D20RawAcquisitionRow({
      ...rawBase,
      acquisition_result: 'fingerprint_conflict',
      authorization_context_id: null,
      command_status: commandStatus,
    })
    assert.equal(result.authorization_context_id, null)
    assert.equal(result.command_status, commandStatus)
  }
})

for (const commandStatus of [
  'processing',
  'succeeded',
  'failed_retryable',
  'failed_final',
]) {
  rejectsContract(
    `created rejects ${commandStatus}`,
    () =>
      validators.validateP2D20RawAcquisitionRow({
        ...rawBase,
        command_status: commandStatus,
      }),
    'DISPOSITION_FIELD_CONFLICT',
    'acquisitionResult'
  )
}

rejectsContract(
  'invented executing state is rejected',
  () =>
    validators.validateP2D20RawAcquisitionRow({
      ...rawBase,
      acquisition_result: 'in_progress',
      command_status: 'executing',
    }),
  'INVALID_ACQUISITION_RESULT',
  'acquisitionResult'
)

for (const [name, patch] of [
  ['created without context', { authorization_context_id: null }],
  ['created terminal status', { command_status: 'succeeded' }],
  ['in-progress terminal snapshot', { acquisition_result: 'in_progress', response_snapshot: {} }],
  ['conflict with context', { acquisition_result: 'fingerprint_conflict' }],
  ['successful replay without snapshot', { acquisition_result: 'replay', command_status: 'succeeded' }],
  ['failed replay without error', { acquisition_result: 'replay', command_status: 'failed_final' }],
  ['missing stored fingerprint', { stored_request_fingerprint: null }],
]) {
  rejectsContract(
    name,
    () => validators.validateP2D20RawAcquisitionRow({ ...rawBase, ...patch }),
    patch.stored_request_fingerprint === null
      ? 'INVALID_ACQUISITION_RESULT'
      : 'DISPOSITION_FIELD_CONFLICT',
    'acquisitionResult'
  )
}

const successfulReplayBase = {
  ...rawBase,
  acquisition_result: 'replay',
  command_status: 'succeeded',
  response_version: 'v1',
  response_snapshot: { orderId: uuid, lines: [{ quantity: '1' }] },
  completed_at: '2026-07-31T10:01:00.000000Z',
}
for (const [name, snapshot, code, fieldSuffix = ''] of [
  ['array', [], 'JSON_OBJECT_REQUIRED'],
  ['date', new Date(), 'UNSAFE_OBJECT_PROTOTYPE'],
  ['class instance', new (class Snapshot {})(), 'UNSAFE_OBJECT_PROTOTYPE'],
  ['null prototype', Object.create(null), 'UNSAFE_OBJECT_PROTOTYPE'],
  ['custom prototype', Object.create({ inherited: true }), 'UNSAFE_OBJECT_PROTOTYPE'],
  ['function value', { value: () => undefined }, 'INVALID_JSON_VALUE', '.value'],
  ['bigint value', { value: 1n }, 'INVALID_JSON_VALUE', '.value'],
  ['undefined value', { value: undefined }, 'INVALID_JSON_VALUE', '.value'],
]) {
  rejectsContract(
    `successful replay rejects ${name}`,
    () =>
      validators.validateP2D20RawAcquisitionRow({
        ...successfulReplayBase,
        response_snapshot: snapshot,
    }),
    code,
    `acquisitionResult.response_snapshot${fieldSuffix}`
  )
}

const replayAccessor = {}
Object.defineProperty(replayAccessor, 'orderId', {
  enumerable: true,
  get() {
    throw new Error('must not run')
  },
})
rejectsContract(
  'successful replay rejects accessor',
  () =>
    validators.validateP2D20RawAcquisitionRow({
      ...successfulReplayBase,
      response_snapshot: replayAccessor,
    }),
  'ACCESSOR_PROPERTY_FORBIDDEN',
  'acquisitionResult.response_snapshot.orderId'
)

const replaySymbol = { orderId: uuid, [Symbol('secret')]: true }
rejectsContract(
  'successful replay rejects symbol keys',
  () =>
    validators.validateP2D20RawAcquisitionRow({
      ...successfulReplayBase,
      response_snapshot: replaySymbol,
    }),
  'UNSAFE_OBJECT_PROTOTYPE',
  'acquisitionResult.response_snapshot'
)

rejectsContract(
  'failed-final replay rejects success snapshot',
  () =>
    validators.validateP2D20RawAcquisitionRow({
      ...rawBase,
      acquisition_result: 'replay',
      command_status: 'failed_final',
      response_snapshot: {},
      error_code: 'ORDER_FAILED',
      last_failure_stage: 'persist',
    }),
  'DISPOSITION_FIELD_CONFLICT',
  'acquisitionResult'
)

check('normalized fingerprint is not constructible', () => {
  const publicSource = fs.readFileSync(path.join(root, 'lib/core-v2/contracts/authorization.ts'), 'utf8')
  assert.doesNotMatch(publicSource, /export\s+(?:const|function)\s+.*fingerprint/i)
  assert.equal(Object.hasOwn(validators, 'normalizeDatabaseFingerprint'), false)
})

const safeError = {
  code: 'ORDER_FAILED',
  messageAr: 'تعذر إكمال الطلب',
  retryable: false,
  correlationId: uuid,
  httpStatus: 409,
}
check('valid safe error', () =>
  assert.deepEqual(validators.validateSafeExternalError(safeError), safeError)
)
for (const [name, value] of [
  ['null', null],
  ['array', []],
  ['date', new Date()],
  ['null prototype', Object.assign(Object.create(null), safeError)],
  ['custom prototype', Object.assign(Object.create({ stack: 'hidden' }), safeError)],
  ['unknown nested object', { ...safeError, database: {} }],
  ['oversized Arabic', { ...safeError, messageAr: 'ع'.repeat(513) }],
  ['oversized code', { ...safeError, code: `A${'B'.repeat(64)}` }],
  ['invalid status', { ...safeError, httpStatus: 399 }],
  ['non-integer status', { ...safeError, httpStatus: 409.5 }],
  ['non-Arabic message', { ...safeError, messageAr: 'failed' }],
  ['internal terminology', { ...safeError, messageAr: 'خطأ database' }],
  ['symbol key', Object.assign({ ...safeError }, { [Symbol('stack')]: 'hidden' })],
]) rejects(`safe error ${name}`, () => validators.validateSafeExternalError(value))

for (const inherited of ['stack', 'cause', 'sqlstate', 'database']) {
  const value = Object.assign(Object.create({ [inherited]: 'hidden' }), safeError)
  rejectsContract(
    `safe error inherited ${inherited}`,
    () => validators.validateSafeExternalError(value),
    'UNSAFE_OBJECT_PROTOTYPE',
    'error'
  )
}
for (const getterName of ['stack', 'code']) {
  const value = { ...safeError }
  Object.defineProperty(value, getterName, {
    enumerable: getterName === 'code',
    get() {
      throw new Error('getter invoked')
    },
  })
  rejectsContract(
    `safe error accessor ${getterName}`,
    () => validators.validateSafeExternalError(value),
    'ACCESSOR_PROPERTY_FORBIDDEN',
    `error.${getterName}`
  )
}

check('canonical payload exact text', () => {
  const value = ' { "b": 2, "a": 1 } '
  assert.equal(validators.validateCanonicalPayloadText(value), value)
  assert.equal(validators.validateFingerprintProjectionText(value), value)
  assert.equal(validators.validateRequestFingerprint('ab'.repeat(32)), 'ab'.repeat(32))
})
for (const value of ['', undefined, {}, 'x'.repeat(262145)])
  rejects('canonical text rejects invalid boundary', () =>
    validators.validateCanonicalPayloadText(value)
  )
for (const value of ['AB'.repeat(32), 'ab'.repeat(31), 'zz'.repeat(32), {}, undefined])
  rejects('fingerprint rejects invalid boundary', () =>
    validators.validateRequestFingerprint(value)
  )

for (const [name, value] of [
  ['lone high surrogate', '\ud800'],
  ['lone low surrogate', '\udc00'],
]) {
  rejectsContract(
    name,
    () => validators.validateCanonicalPayloadText(value),
    'INVALID_UNICODE_SCALAR',
    'canonicalPayload'
  )
}
check('valid Unicode scalar sequences', () => {
  for (const value of ['العربية', '😀', 'A😀ع'])
    assert.equal(validators.validateCanonicalPayloadText(value), value)
})
check('canonical UTF-8 maximum boundary', () => {
  const exact = 'ع'.repeat(131_072)
  assert.equal(validators.validateCanonicalPayloadText(exact), exact)
  assert.throws(
    () => validators.validateCanonicalPayloadText(`${exact}ع`),
    (error) =>
      error?.code === 'CANONICAL_TEXT_TOO_LARGE' &&
      error?.field === 'canonicalPayload'
  )
})

check('valid safe outbox payload', () => {
  const value = { event: 'order_ready', retry: false, count: 1, items: [uuid, null] }
  const validated = validators.validateOutboxSafePayload(value)
  assert.deepEqual(validated.value, value)
  assert.equal(
    validators.hasValidatedOutboxPayloadProvenance(validated),
    true
  )
  assert.equal(
    validators.hasValidatedOutboxPayloadProvenance(value),
    false
  )
  assert.equal(
    validators.hasValidatedOutboxPayloadProvenance({ ...validated }),
    false
  )
  assert.equal(
    validators.hasValidatedOutboxPayloadProvenance(
      JSON.parse(JSON.stringify(validated))
    ),
    false
  )
  assert.equal(Object.isFrozen(validated), true)
  assert.equal(Object.isFrozen(validated.value), true)
})
for (const [name, value] of [
  ['function', { value: () => undefined }],
  ['symbol', { value: Symbol('x') }],
  ['bigint', { value: 1n }],
  ['undefined', { value: undefined }],
  ['secret key', { bearerToken: 'secret' }],
  ['raw idempotency key', { idempotency_key: 'raw' }],
  ['SQL diagnostic', { sqlstate: '23505' }],
  ['custom prototype', Object.assign(Object.create({}), { value: 1 })],
  ['oversized array', Array.from({ length: 257 }, () => null)],
  ['oversized string', 'x'.repeat(16385)],
]) rejects(`outbox ${name}`, () => validators.validateOutboxSafePayload(value))

for (const [name, value] of [
  ['negative zero', -0],
  ['NaN', Number.NaN],
  ['positive infinity', Number.POSITIVE_INFINITY],
  ['negative infinity', Number.NEGATIVE_INFINITY],
]) {
  rejectsContract(
    `outbox rejects ${name}`,
    () => validators.validateOutboxSafePayload(value),
    'OUTBOX_NUMBER',
    'safePayload'
  )
}
for (const key of ['__proto__', 'prototype', 'constructor']) {
  const value =
    key === '__proto__'
      ? JSON.parse('{"__proto__":"unsafe"}')
      : { [key]: 'unsafe' }
  rejectsContract(
    `outbox rejects dangerous key ${key}`,
    () => validators.validateOutboxSafePayload(value),
    'OUTBOX_KEY',
    `safePayload.${key}`
  )
  rejectsContract(
    `outbox rejects nested dangerous key ${key}`,
    () => validators.validateOutboxSafePayload({ nested: value }),
    'OUTBOX_KEY',
    `safePayload.nested.${key}`
  )
}
rejectsContract(
  'outbox rejects mixed-case sensitive key',
  () => validators.validateOutboxSafePayload({ BearerToKeN: 'unsafe' }),
  'OUTBOX_KEY',
  'safePayload.BearerToKeN'
)
check('outbox permits harmless similar keys', () => {
  const validated = validators.validateOutboxSafePayload({
    constructorId: 'safe',
    prototypeVersion: 'v1',
    providerPreference: 'manual',
    diagnosticCategoryLabel: 'customer_visible',
    customerReference: 'customer-1',
    deliveryWindow: 'morning',
  })
  assert.deepEqual(validated.value, {
    constructorId: 'safe',
    prototypeVersion: 'v1',
    providerPreference: 'manual',
    diagnosticCategoryLabel: 'customer_visible',
    customerReference: 'customer-1',
    deliveryWindow: 'morning',
  })
})

for (const [name, value, field] of [
  ['top-level provider', { provider: 'unsafe' }, 'safePayload.provider'],
  [
    'nested provider reference',
    { nested: { providerReference: 'unsafe' } },
    'safePayload.nested.providerReference',
  ],
  ['mixed-case provider', { PrOvIdEr: 'unsafe' }, 'safePayload.PrOvIdEr'],
  [
    'provider separator variant',
    { provider_reference: 'unsafe' },
    'safePayload.provider_reference',
  ],
  [
    'top-level internal diagnostic',
    { internalDiagnostic: 'unsafe' },
    'safePayload.internalDiagnostic',
  ],
  [
    'nested diagnostics',
    { nested: { diagnostics: 'unsafe' } },
    'safePayload.nested.diagnostics',
  ],
  [
    'retry metadata',
    { retryMetadata: { attempt: 1 } },
    'safePayload.retryMetadata',
  ],
  [
    'worker separator variant',
    { worker_metadata: 'unsafe' },
    'safePayload.worker_metadata',
  ],
]) {
  rejectsContract(
    `outbox rejects ${name}`,
    () => validators.validateOutboxSafePayload(value),
    'OUTBOX_KEY',
    field
  )
}

for (const [name, messageAr] of [
  ['English idempotency term', 'تعذر الطلب بسبب idempotency value.'],
  ['hyphenated idempotency key', 'تعذر الطلب بسبب idempotency-key.'],
  ['underscored idempotency key', 'تعذر الطلب بسبب idempotency_key.'],
  ['idempotency header', 'تعذر الطلب بسبب X-Idempotency-Key.'],
  ['Arabic idempotency term', 'تعذر الطلب بسبب مفتاح عدم التكرار.'],
  ['mixed Arabic and English', 'تعذر الطلب بسبب command_key داخلي.'],
]) {
  rejectsContract(
    `safe error rejects ${name}`,
    () =>
      validators.validateSafeExternalError({
        ...safeError,
        messageAr,
      }),
    'SAFE_ERROR_IDEMPOTENCY_LEAK',
    'messageAr'
  )
}

check('safe error rejection does not echo idempotency material', () => {
  const rejectedMaterial = 'X-Idempotency-Key raw-key-123'
  assert.throws(
    () =>
      validators.validateSafeExternalError({
        ...safeError,
        messageAr: `تعذر الطلب بسبب ${rejectedMaterial}.`,
      }),
    (error) =>
      error?.code === 'SAFE_ERROR_IDEMPOTENCY_LEAK' &&
      error?.field === 'messageAr' &&
      !String(error?.message).includes(rejectedMaterial) &&
      !String(error?.message).includes('raw-key-123')
  )
})

check('safe error accepts approved generic Arabic messages', () => {
  for (const messageAr of [
    'تعذر إكمال الطلب، حاول مرة أخرى.',
    'الطلب قيد المعالجة.',
    'حدث تعارض في الطلب.',
  ]) {
    assert.equal(
      validators.validateSafeExternalError({
        ...safeError,
        messageAr,
      }).messageAr,
      messageAr
    )
  }
})

const cyclic = {}
cyclic.self = cyclic
rejects('outbox cycle', () => validators.validateOutboxSafePayload(cyclic))
let deep = null
for (let index = 0; index < 10; index += 1) deep = { value: deep }
rejects('outbox depth', () => validators.validateOutboxSafePayload(deep))
const accessorPayload = {}
Object.defineProperty(accessorPayload, 'value', {
  enumerable: true,
  get() {
    throw new Error('getter invoked')
  },
})
rejects('outbox accessor', () => validators.validateOutboxSafePayload(accessorPayload))
const sparse = []
sparse.length = 1
rejects('outbox sparse array', () => validators.validateOutboxSafePayload(sparse))

const throwingEnvelope = {
  ...plainEnvelope,
  diagnostics: {},
}
Object.defineProperty(throwingEnvelope.diagnostics, 'role', {
  enumerable: true,
  get() {
    throw new Error('must not run')
  },
})
rejectsContract(
  'command envelope rejects nested throwing getter',
  () => validators.validateCommandEnvelope(throwingEnvelope),
  'ACCESSOR_PROPERTY_FORBIDDEN',
  'envelope.diagnostics.role'
)

rejectsContract(
  'command envelope rejects inherited authority',
  () =>
    validators.validateCommandEnvelope({
      ...plainEnvelope,
      diagnostics: Object.assign(Object.create({ role: 'admin' }), {
        requestReference: null,
        source: 'pos',
      }),
    }),
  'UNSAFE_OBJECT_PROTOTYPE',
  'envelope.diagnostics'
)

rejectsContract(
  'command envelope rejects symbol authority',
  () =>
    validators.validateCommandEnvelope({
      ...plainEnvelope,
      diagnostics: {
        requestReference: null,
        source: 'pos',
        [Symbol('role')]: 'admin',
      },
    }),
  'UNSAFE_OBJECT_PROTOTYPE',
  'envelope.diagnostics'
)

const cyclicEnvelope = {
  ...plainEnvelope,
  diagnostics: { requestReference: null, source: 'pos' },
}
cyclicEnvelope.diagnostics.self = cyclicEnvelope.diagnostics
rejectsContract(
  'command envelope rejects cycles',
  () => validators.validateCommandEnvelope(cyclicEnvelope),
  'CYCLIC_COMMAND_ENVELOPE',
  'envelope.diagnostics.self'
)

let deeplyNested = { value: 'safe' }
for (let index = 0; index < 18; index += 1)
  deeplyNested = { value: deeplyNested }
rejectsContract(
  'command envelope rejects excessive depth',
  () =>
    validators.validateCommandEnvelope({
      ...plainEnvelope,
      diagnostics: {
        requestReference: null,
        source: 'pos',
        metadata: deeplyNested,
      },
    }),
  'COMMAND_ENVELOPE_TRAVERSAL_LIMIT'
)

for (const key of ['tenantId', 'branch_id', 'RoLe', 'permission', 'scope']) {
  rejectsContract(
    `command envelope rejects nested ${key}`,
    () =>
      validators.validateCommandEnvelope({
        ...plainEnvelope,
        payload: {
          ...plainEnvelope.payload,
          metadata: { [key]: 'caller-controlled' },
        },
      }),
    'CALLER_AUTHORITY_FORBIDDEN',
    `envelope.payload.metadata.${key}`
  )
}

scannerFixture(
  'relative import',
  {
    'app/a/client.tsx': "'use client'\nimport '../../lib/core-v2/contracts'",
    'lib/core-v2/contracts/index.ts': "export const value = 1",
  },
  ['client_to_core_v2']
)
scannerFixture(
  'dynamic string import',
  {
    'app/a/client.tsx': "'use client'\nvoid import('@/lib/core-v2')",
    'lib/core-v2/index.ts': 'export const value = 1',
  },
  ['client_to_core_v2']
)
scannerFixture(
  'static template import',
  {
    'app/a/client.tsx': "'use client'\nvoid import(`@/lib/core-v2`)",
    'lib/core-v2/index.ts': 'export const value = 1',
  },
  ['client_to_core_v2']
)
scannerFixture(
  'transitive barrel',
  {
    'components/client.tsx': "'use client'\nimport './barrel'",
    'components/barrel.ts': "export * from '@/lib/core-v2'",
    'lib/core-v2/index.ts': 'export const value = 1',
  },
  ['client_to_core_v2']
)
scannerFixture(
  're-export chain',
  {
    'hooks/use-x.ts': "export * from '../shared/x'",
    'shared/x.ts': "export * from '@/lib/core-v2'",
    'lib/core-v2/index.ts': 'export const value = 1',
  },
  ['client_to_core_v2']
)
scannerFixture(
  'CommonJS require',
  {
    'components/client.jsx': "'use client'\nrequire('../lib/core-v2')",
    'lib/core-v2/index.ts': 'export const value = 1',
  },
  ['client_to_core_v2']
)
scannerFixture(
  'path alias multiline import',
  {
    'components/client.tsx': "\ufeff/* lead */\n'use client'\nimport {\n x\n} from '@/lib/core-v2'",
    'lib/core-v2/index.ts': 'export const x = 1',
  },
  ['client_to_core_v2']
)
scannerFixture(
  'comment is not directive',
  {
    'components/server.tsx': "// 'use client'\nimport '@/lib/core-v2'",
    'lib/core-v2/index.ts': 'export const value = 1',
  },
  []
)
scannerFixture(
  'ordinary string is not directive',
  {
    'components/server.tsx': "const note = 'use client'\nimport '@/lib/core-v2'",
    'lib/core-v2/index.ts': 'export const value = 1',
  },
  []
)
scannerFixture(
  'bracket environment access',
  { 'components/client.tsx': "'use client'\nvoid process.env['SUPABASE_SERVICE_ROLE_KEY']" },
  ['browser_sensitive_environment_reachability'],
  ['components/client.tsx', 'SUPABASE_SERVICE_ROLE_KEY']
)
scannerFixture(
  'environment destructuring',
  { 'components/client.tsx': "'use client'\nconst { SERVICE_ROLE_KEY } = process.env" },
  ['browser_sensitive_environment_reachability'],
  ['components/client.tsx', 'SERVICE_ROLE_KEY']
)
scannerFixture(
  'environment alias',
  { 'components/client.tsx': "'use client'\nconst env = process.env\nvoid env.DATABASE_URL" },
  ['browser_sensitive_environment_reachability'],
  ['components/client.tsx', 'DATABASE_URL']
)
scannerFixture(
  'direct imported environment wrapper',
  {
    'components/client.tsx': "'use client'\nimport '@/lib/env-wrapper'",
    'lib/env-wrapper.ts': 'export const secret = process.env.SUPABASE_SERVICE_ROLE_KEY',
  },
  ['browser_sensitive_environment_reachability'],
  ['components/client.tsx', 'lib/env-wrapper.ts', 'SUPABASE_SERVICE_ROLE_KEY']
)
scannerFixture(
  're-exported environment wrapper',
  {
    'components/client.tsx': "'use client'\nimport '@/lib/env-barrel'",
    'lib/env-barrel.ts': "export * from './env-wrapper'",
    'lib/env-wrapper.ts': 'export const secret = process.env.SUPABASE_SECRET_KEY',
  },
  ['browser_sensitive_environment_reachability'],
  ['components/client.tsx', 'lib/env-barrel.ts', 'lib/env-wrapper.ts']
)
scannerFixture(
  'multi-hop client hook environment wrapper',
  {
    'components/client.tsx': "'use client'\nimport '@/hooks/use-config'",
    'hooks/use-config.ts': "export * from '@/lib/config'",
    'lib/config.ts': "export * from './env-wrapper'",
    'lib/env-wrapper.ts': 'export const secret = process.env.SERVICE_ROLE_KEY',
  },
  ['browser_sensitive_environment_reachability'],
  ['components/client.tsx', 'hooks/use-config.ts', 'lib/env-wrapper.ts']
)
scannerFixture(
  'CommonJS environment wrapper',
  {
    'components/client.js': "'use client'\nrequire('../lib/env-wrapper.cjs')",
    'lib/env-wrapper.cjs': 'module.exports = process.env.SUPABASE_SERVICE_ROLE_KEY',
  },
  ['browser_sensitive_environment_reachability'],
  ['components/client.js', 'lib/env-wrapper.cjs']
)
scannerFixture(
  'dynamic literal environment wrapper',
  {
    'components/client.tsx': "'use client'\nvoid import('../lib/env-wrapper')",
    'lib/env-wrapper.ts': 'export const secret = process.env.SUPABASE_SECRET_KEY',
  },
  ['browser_sensitive_environment_reachability'],
  ['components/client.tsx', 'lib/env-wrapper.ts']
)
scannerFixture(
  'environment wrapper cycle',
  {
    'components/client.tsx': "'use client'\nimport './a'",
    'components/a.ts': "export * from './b'",
    'components/b.ts': "export * from './a'; export * from '../lib/env-wrapper'",
    'lib/env-wrapper.ts': 'export const secret = process.env.SUPABASE_SERVICE_ROLE_KEY',
  },
  ['browser_sensitive_environment_reachability'],
  ['components/client.tsx', 'lib/env-wrapper.ts']
)
scannerFixture(
  'safe server-only environment wrapper',
  {
    'lib/server.ts': "import './env-wrapper'",
    'lib/env-wrapper.ts': 'export const secret = process.env.SUPABASE_SERVICE_ROLE_KEY',
  },
  []
)
scannerFixture(
  'public anon environment wrapper',
  {
    'components/client.tsx': "'use client'\nimport '../lib/public-env'",
    'lib/public-env.ts': 'export const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY',
  },
  []
)
scannerFixture(
  'computed browser environment key',
  {
    'components/client.tsx': "'use client'\nimport '../lib/env-wrapper'",
    'lib/env-wrapper.ts': 'const key = getKey(); export const value = process.env[key]',
  },
  ['browser_unresolved_environment_access'],
  ['components/client.tsx', 'lib/env-wrapper.ts', 'unresolved computed']
)
scannerFixture(
  'browser service-role reachability',
  {
    'components/client.tsx': "'use client'\nimport '../lib/supabase/admin'",
    'lib/supabase/admin.ts': 'export const admin = true',
  },
  ['browser_to_service_role'],
  ['components/client.tsx']
)
scannerFixture(
  'UI trusted-runtime reachability',
  {
    'components/panel.tsx': "import '../lib/runtime/acquisition'",
    'lib/runtime/acquisition.ts': 'export const acquire = true',
  },
  ['ui_to_trusted_runtime'],
  ['components/panel.tsx']
)
scannerFixture(
  'browser Core V2 internal reachability',
  {
    'components/client.tsx': "'use client'\nimport '../lib/core-v2/internal/sealer'",
    'lib/core-v2/internal/sealer.ts': 'export const seal = true',
  },
  ['client_to_core_v2', 'client_to_core_v2_internal'],
  ['components/client.tsx']
)
scannerFixture(
  'API browser Supabase client misuse',
  {
    'app/api/example/route.ts': "import '../../../lib/supabase/client'",
    'lib/supabase/client.ts': 'export const browserClient = true',
  },
  ['api_to_browser_supabase_client'],
  ['app/api/example/route.ts']
)
scannerFixture(
  'Core V2 legacy fallback route',
  {
    'app/api/orders/route.ts':
      "import '../../../lib/core-v2'\nconst legacyWrite = 'create_invoice_with_items_safe'",
    'lib/core-v2/index.ts': 'export const contract = true',
  },
  ['core_v2_legacy_fallback', 'route_core_v2_activation'],
  ['app/api/orders/route.ts']
)
scannerFixture(
  'Core V2 environment access',
  {
    'lib/core-v2/config.ts':
      'export const secret = process.env.SUPABASE_SERVICE_ROLE_KEY',
  },
  ['core_v2_environment_access'],
  ['lib/core-v2/config.ts', 'SUPABASE_SERVICE_ROLE_KEY']
)
scannerFixture(
  'application Core V2 ledger access',
  {
    'lib/order-writer.ts':
      "export const write = (client) => client.from('atomic_order_commands')",
  },
  ['application_core_v2_ledger_access'],
  ['lib/order-writer.ts', 'atomic_order_commands']
)
scannerFixture(
  'route Core V2 activation',
  {
    'app/api/example/route.ts': "import '../../../lib/core-v2'",
    'lib/core-v2/index.ts': 'export const contract = true',
  },
  ['route_core_v2_activation'],
  ['app/api/example/route.ts']
)
scannerFixture(
  'contract forbidden import',
  {
    'lib/core-v2/contracts/example.ts': "import React from 'react'",
  },
  ['contract_forbidden_import'],
  ['lib/core-v2/contracts/example.ts', 'react']
)
scannerFixture(
  'contract forbidden Runtime access',
  {
    'lib/core-v2/validation/example.ts':
      "export const load = () => fetch('https://invalid.example')",
  },
  ['contract_forbidden_runtime_access'],
  ['lib/core-v2/validation/example.ts']
)
scannerFixture(
  'safe server-only import',
  {
    'lib/server.ts': "import '@/lib/core-v2'",
    'lib/core-v2/index.ts': 'export const value = 1',
  },
  []
)
scannerFixture(
  'adapter forbidden driver import',
  { 'lib/core-v2/adapter/transport.ts': "import { Pool } from 'pg'" },
  ['adapter_forbidden_package_import']
)
scannerFixture(
  'adapter environment access',
  { 'lib/core-v2/adapter/config.ts': 'export const value = process.env.ADAPTER_URL' },
  ['adapter_environment_access']
)
scannerFixture(
  'adapter generic query surface',
  { 'lib/core-v2/adapter/transport.ts': 'export interface Port { query(value: string): unknown }' },
  ['adapter_generic_query_surface']
)
scannerFixture(
  'adapter direct P2D.20 call',
  { 'lib/core-v2/adapter/live.ts': 'acquire_atomic_order_command_v1()' },
  ['adapter_direct_p2d20_call']
)
scannerFixture(
  'adapter caller role target',
  { 'lib/core-v2/adapter/contracts.ts': 'export interface Input { roleTarget: string }' },
  ['adapter_caller_role_target']
)
scannerFixture(
  'adapter fake production export',
  {
    'lib/core-v2/adapter/index.ts': "export * from './internal/test-fake-transport'",
    'lib/core-v2/adapter/internal/test-fake-transport.ts': 'export const fake = true',
  },
  ['adapter_test_fake_production_export']
)
scannerFixture(
  'adapter wrapper reaches pg',
  {
    'lib/core-v2/adapter/transport.ts': "import '../../db-wrapper'",
    'lib/db-wrapper.ts': "import { Pool } from 'pg'",
  },
  ['adapter_forbidden_package_import'],
  ['lib/core-v2/adapter/transport.ts', 'lib/db-wrapper.ts', 'pg']
)
scannerFixture(
  'adapter wrapper reaches Vercel functions',
  {
    'lib/core-v2/adapter/transport.ts': "import '@/lib/platform-wrapper'",
    'lib/platform-wrapper.ts': "export { attachDatabasePool } from '@vercel/functions'",
  },
  ['adapter_forbidden_package_import'],
  ['lib/core-v2/adapter/transport.ts', 'lib/platform-wrapper.ts', '@vercel/functions']
)
scannerFixture(
  'adapter wrapper reaches environment',
  {
    'lib/core-v2/adapter/config.ts': "import '../../env-wrapper'",
    'lib/env-wrapper.ts': 'const env = process.env; export const value = env.ADAPTER_URL',
  },
  ['adapter_environment_access'],
  ['lib/core-v2/adapter/config.ts', 'lib/env-wrapper.ts']
)
scannerFixture(
  'adapter computed query member',
  { 'lib/core-v2/adapter/transport.ts': "export interface Port { ['query'](value: string): unknown }" },
  ['adapter_generic_query_surface']
)
scannerFixture(
  'adapter function-valued query property',
  { 'lib/core-v2/adapter/transport.ts': 'export const query = (value: string) => value' },
  ['adapter_generic_query_surface']
)
scannerFixture(
  'adapter inherited query surface',
  { 'lib/core-v2/adapter/transport.ts': 'interface Generic { query(): void } interface Port extends Generic {}' },
  ['adapter_generic_query_surface']
)
scannerFixture(
  'adapter aliased P2D.20 call',
  { 'lib/core-v2/adapter/live.ts': 'const call = acquire_atomic_order_command_v1; call()' },
  ['adapter_direct_p2d20_call']
)
scannerFixture(
  'adapter imported alias P2D.20 call',
  { 'lib/core-v2/adapter/live.ts': "import { acquire_atomic_order_command_v1 as call } from './wrapper'; call()" },
  ['adapter_direct_p2d20_call']
)
scannerFixture(
  'adapter RPC string P2D.20 call',
  { 'lib/core-v2/adapter/live.ts': "client.rpc('acquire_atomic_order_command_v1', {})" },
  ['adapter_direct_p2d20_call', 'adapter_generic_query_surface']
)
scannerFixture(
  'adapter computed role target',
  { 'lib/core-v2/adapter/contracts.ts': "export interface Input { ['roleTarget']: string }" },
  ['adapter_caller_role_target']
)
scannerFixture(
  'intermediate fake barrel',
  {
    'lib/core-v2/adapter/index.ts': "export * from './fake-barrel'",
    'lib/core-v2/adapter/fake-barrel.ts': "export * from './internal/test-fake-transport'",
    'lib/core-v2/adapter/internal/test-fake-transport.ts': 'export const fake = true',
  },
  ['adapter_test_fake_production_export'],
  ['lib/core-v2/adapter/index.ts', 'fake-barrel', 'test-fake-transport.ts']
)
scannerFixture(
  'direct server fake import',
  {
    'lib/server-job.ts': "import './core-v2/adapter/internal/test-fake-transport'",
    'lib/core-v2/adapter/internal/test-fake-transport.ts': 'export const fake = true',
  },
  ['adapter_test_fake_production_export'],
  ['lib/server-job.ts', 'test-fake-transport.ts']
)
scannerFixture(
  'dynamic literal fake import',
  {
    'lib/server-job.ts': "void import('./core-v2/adapter/internal/test-fake-transport')",
    'lib/core-v2/adapter/internal/test-fake-transport.ts': 'export const fake = true',
  },
  ['adapter_test_fake_production_export']
)
scannerFixture(
  'CommonJS fake import',
  {
    'scripts/not-approved.cjs': "require('../lib/core-v2/adapter/internal/test-fake-transport')",
    'lib/core-v2/adapter/internal/test-fake-transport.ts': 'export const fake = true',
  },
  ['adapter_test_fake_production_export']
)
scannerFixture(
  'approved test fake import',
  {
    'scripts/check-core-v2-contracts.mjs': "import '../lib/core-v2/adapter/internal/test-fake-transport'",
    'lib/core-v2/adapter/internal/test-fake-transport.ts': 'export const fake = true',
  },
  []
)
scannerFixture(
  'safe acquire domain method',
  { 'lib/core-v2/adapter/transport.ts': 'export interface Port { acquire(): Promise<void> }' },
  []
)
scannerFixture(
  'safe similarly named method',
  { 'lib/core-v2/adapter/transport.ts': 'export interface Port { queryStatus(): string }' },
  []
)
scannerFixture(
  'safe lifecycle role state',
  { 'lib/core-v2/adapter/lifecycle.ts': "export const state = 'role_activated'" },
  []
)
scannerFixture(
  'package and P2D.20 documentation strings are inert',
  { 'lib/core-v2/adapter/contracts.ts': "export const note = 'pg acquire_atomic_order_command_v1 query roleTarget'" },
  []
)
scannerFixture(
  'generic direct member alias provenance',
  { 'lib/core-v2/adapter/a.ts': 'const run = client.query; run()' },
  ['adapter_generic_query_surface'],
  ['lib/core-v2/adapter/a.ts', 'member query', 'alias run']
)
scannerFixture(
  'generic exported member alias provenance',
  { 'lib/core-v2/adapter/a.ts': 'const run = client.query; export { run }' },
  ['adapter_generic_query_surface'],
  ['member query', 'alias run', 'export run']
)
scannerFixture(
  'generic multi-hop alias provenance',
  { 'lib/core-v2/adapter/a.ts': 'const first=client.query; const second=first; export default second' },
  ['adapter_generic_query_surface'],
  ['alias first', 'alias second', 'default export']
)
scannerFixture(
  'generic destructured alias provenance',
  { 'lib/core-v2/adapter/a.ts': 'const { query: run } = client; run()' },
  ['adapter_generic_query_surface'],
  ['member query', 'destructure run']
)
scannerFixture(
  'generic function-return alias provenance',
  { 'lib/core-v2/adapter/a.ts': 'function getRunner(){ return client.query }; const run=getRunner()' },
  ['adapter_generic_query_surface'],
  ['member query', 'return getRunner', 'alias run']
)
scannerFixture(
  'generic CommonJS alias export provenance',
  { 'lib/core-v2/adapter/a.ts': 'module.exports = client.query' },
  ['adapter_generic_query_surface'],
  ['member query', 'assign module.exports']
)
scannerFixture(
  'generic const-computed key',
  { 'lib/core-v2/adapter/a.ts': "const key='query'; client[key]()" },
  ['adapter_generic_query_surface'],
  ['forbidden member query']
)
scannerFixture(
  'generic enum-computed key',
  { 'lib/core-v2/adapter/a.ts': "enum Keys { Run='query' }; client[Keys.Run]()" },
  ['adapter_generic_query_surface'],
  ['forbidden member query']
)
scannerFixture(
  'generic literal-concatenated key',
  { 'lib/core-v2/adapter/a.ts': "const prefix='que'; const suffix='ry'; client[prefix + suffix]()" },
  ['adapter_generic_query_surface'],
  ['forbidden member query']
)
scannerFixture(
  'generic readonly object-computed key',
  { 'lib/core-v2/adapter/a.ts': "const keys={run:'query'} as const; client[keys.run]()" },
  ['adapter_generic_query_surface'],
  ['forbidden member query']
)
scannerFixture(
  'generic readonly tuple-computed key',
  { 'lib/core-v2/adapter/a.ts': "const keys=['query'] as const; client[keys[0]]()" },
  ['adapter_generic_query_surface'],
  ['forbidden member query']
)
scannerFixture(
  'all forbidden generic member variants',
  { 'lib/core-v2/adapter/a.ts': 'interface Port { execute():void; sql():void; raw():void; rpc():void; from():void; table():void; schema():void; transaction():void }' },
  ['adapter_generic_query_surface'],
  ['forbidden member execute', 'forbidden member transaction']
)
scannerFixture(
  'generic object spread explicit surface',
  { 'lib/core-v2/adapter/a.ts': 'const first={query(){}}; const second={...first}; export {second}' },
  ['adapter_generic_query_surface'],
  ['member query', 'object first', 'object second']
)
scannerFixture(
  'generic object spread aliased source',
  { 'lib/core-v2/adapter/a.ts': 'const base=client; const adapter={...base}; export {adapter}' },
  ['adapter_generic_query_surface'],
  ['database source client', 'alias base', 'object adapter']
)
scannerFixture(
  'generic mapped type forbidden key',
  { 'lib/core-v2/adapter/a.ts': "type Keys='query'; type Surface={ [K in Keys]:()=>void }" },
  ['adapter_generic_query_surface'],
  ['forbidden member query', 'type Surface']
)
scannerFixture(
  'generic concrete conditional type forbidden key',
  { 'lib/core-v2/adapter/a.ts': 'type Surface<T extends boolean>=T extends true?{query:()=>void}:{acquire:()=>void}; type Exposed=Surface<true>' },
  ['adapter_generic_query_surface'],
  ['forbidden member query', 'type Exposed']
)
scannerFixture(
  'generic function expression return provenance',
  { 'lib/core-v2/adapter/a.ts': 'const getRunner=function(){return client.query}; export const run=getRunner()' },
  ['adapter_generic_query_surface'],
  ['origin lib/core-v2/adapter/a.ts:1:42', 'function getRunner@1:17', 'call getRunner@1:67', 'exposed/used at lib/core-v2/adapter/a.ts:1:63']
)
scannerFixture(
  'generic named function expression return provenance',
  { 'lib/core-v2/adapter/a.ts': 'const getRunner=function namedRunner(){return client.query}; export default getRunner()' },
  ['adapter_generic_query_surface'],
  ['function getRunner@1:26', 'call getRunner@1:77', 'default export@1:62']
)
scannerFixture(
  'generic arrow expression return provenance',
  { 'lib/core-v2/adapter/a.ts': 'const getRunner=()=>client.query; export const run=getRunner()' },
  ['adapter_generic_query_surface'],
  ['function getRunner@1:17', 'call getRunner@1:52', 'alias run@1:48']
)
scannerFixture(
  'generic arrow block return provenance',
  { 'lib/core-v2/adapter/a.ts': 'const getRunner=()=>{return client.query}; export const run=getRunner()' },
  ['adapter_generic_query_surface'],
  ['function getRunner@1:17', 'call getRunner@1:61', 'alias run@1:57']
)
scannerFixture(
  'generic object method return provenance',
  { 'lib/core-v2/adapter/a.ts': 'const wrapper={getRunner(){return client.query}}; export const run=wrapper.getRunner()' },
  ['adapter_generic_query_surface'],
  ['method wrapper.getRunner@1:16', 'call wrapper.getRunner@1:68', 'alias run@1:64']
)
scannerFixture(
  'generic nested object method return provenance',
  { 'lib/core-v2/adapter/a.ts': 'const wrapper={nested:{getRunner(){return client.query}}}; export const run=wrapper.nested.getRunner()' },
  ['adapter_generic_query_surface'],
  ['method wrapper.nested.getRunner@1:24', 'call wrapper.nested.getRunner@1:77', 'alias run@1:73']
)
scannerFixture(
  'generic function-valued object property provenance',
  { 'lib/core-v2/adapter/a.ts': 'const wrapper={getRunner:function(){return client.query}}; export const run=wrapper.getRunner()' },
  ['adapter_generic_query_surface'],
  ['function property wrapper.getRunner@1:26', 'call wrapper.getRunner@1:77']
)
scannerFixture(
  'generic arrow-valued object property provenance',
  { 'lib/core-v2/adapter/a.ts': 'const wrapper={getRunner:()=>client.query}; export const run=wrapper.getRunner()' },
  ['adapter_generic_query_surface'],
  ['function property wrapper.getRunner@1:26', 'call wrapper.getRunner@1:62']
)
scannerFixture(
  'generic destructured object method provenance',
  { 'lib/core-v2/adapter/a.ts': 'const wrapper={getRunner(){return client.query}}; const {getRunner}=wrapper; export const run=getRunner()' },
  ['adapter_generic_query_surface'],
  ['method wrapper.getRunner@1:16', 'destructure method getRunner@1:58', 'call getRunner@1:95']
)
scannerFixture(
  'generic multi-hop method alias provenance',
  { 'lib/core-v2/adapter/a.ts': 'const wrapper={getRunner(){return client.query}}; const first=wrapper.getRunner; const second=first; export default second()' },
  ['adapter_generic_query_surface'],
  ['function alias first@1:57', 'function alias second@1:88', 'call second@1:117']
)
scannerFixture(
  'generic CommonJS method export provenance',
  { 'lib/core-v2/adapter/a.ts': 'const wrapper={getRunner(){return client.query}}; module.exports=wrapper.getRunner' },
  ['adapter_generic_query_surface'],
  ['method wrapper.getRunner@1:16', 'assign callable module.exports@1:51']
)
scannerFixture(
  'generic barrel-propagated function return provenance',
  {
    'lib/core-v2/adapter/index.ts': "export { run } from './wrapper'",
    'lib/core-v2/adapter/wrapper.ts': 'const getRunner=function(){return client.query}; export const run=getRunner()',
  },
  ['adapter_generic_query_surface'],
  ['Adapter import chain lib/core-v2/adapter/index.ts -> lib/core-v2/adapter/wrapper.ts', 'function getRunner@1:17', 'alias run@1:63']
)
scannerFixture(
  'generic literal-dynamic wrapper propagation',
  {
    'lib/core-v2/adapter/index.ts': "void import('./wrapper')",
    'lib/core-v2/adapter/wrapper.ts': 'const wrapper={getRunner(){return client.query}}; export const run=wrapper.getRunner()',
  },
  ['adapter_generic_query_surface'],
  ['Adapter import chain lib/core-v2/adapter/index.ts -> lib/core-v2/adapter/wrapper.ts', 'method wrapper.getRunner@1:16', 'call wrapper.getRunner@1:68']
)
scannerFixture(
  'generic cycle-propagated function return provenance',
  {
    'lib/core-v2/adapter/a.ts': "import './b'; export const safe=true",
    'lib/core-v2/adapter/b.ts': "import './a'; const getRunner=function(){return client.query}; export const run=getRunner()",
  },
  ['adapter_generic_query_surface'],
  ['function getRunner@1:31', 'call getRunner@1:81']
)
scannerFixture(
  'generic class method return provenance',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{getRunner(){return client.query}}; const wrapper=new Wrapper(); export const run=wrapper.getRunner()' },
  ['adapter_generic_query_surface'],
  ['class method Wrapper.getRunner@1:15', 'instance wrapper@1:56', 'call wrapper.getRunner@1:96']
)
scannerFixture(
  'generic namespace-assigned function provenance',
  { 'lib/core-v2/adapter/a.ts': 'const ns={}; ns.getRunner=function(){return client.query}; export const run=ns.getRunner()' },
  ['adapter_generic_query_surface'],
  ['assigned function ns.getRunner@1:27', 'call ns.getRunner@1:77']
)
scannerFixture(
  'generic object getter provenance',
  { 'lib/core-v2/adapter/a.ts': 'const wrapper={get runner(){return client.query}}; export const run=wrapper.runner' },
  ['adapter_generic_query_surface'],
  ['getter wrapper.runner@1:20', 'alias run@1:65']
)
scannerFixture(
  'generic exported getter surface provenance',
  { 'lib/core-v2/adapter/a.ts': 'const wrapper={get runner(){return client.query}}; export {wrapper}' },
  ['adapter_generic_query_surface'],
  ['getter wrapper.runner', 'export surface wrapper carrying wrapper.runner']
)
scannerFixture(
  'generic class instance getter provenance',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{get runner(){return client.query}}; const wrapper=new Wrapper(); export const run=wrapper.runner' },
  ['adapter_generic_query_surface'],
  ['class getter Wrapper.runner@1:19', 'instance getter wrapper@1:57', 'alias run@1:93']
)
scannerFixture(
  'generic class static getter provenance',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{static get runner(){return client.query}}; export const run=Wrapper.runner' },
  ['adapter_generic_query_surface'],
  ['class static getter Wrapper.runner@1:26', 'alias run@1:71']
)
scannerFixture(
  'generic inherited getter provenance',
  { 'lib/core-v2/adapter/a.ts': 'class Base{get runner(){return client.query}}; class Child extends Base{}; const child=new Child(); export const run=child.runner' },
  ['adapter_generic_query_surface'],
  ['inherit getter Base.runner as Child.runner', 'instance getter child', 'alias run']
)
scannerFixture(
  'generic const-computed object method declaration',
  { 'lib/core-v2/adapter/a.ts': "const key='getRunner'; const wrapper={[key](){return client.query}}; export const run=wrapper[key]()" },
  ['adapter_generic_query_surface'],
  ['method wrapper.getRunner', 'call wrapper.getRunner']
)
scannerFixture(
  'generic enum-computed object method declaration',
  { 'lib/core-v2/adapter/a.ts': "enum Keys{Run='getRunner'}; const wrapper={[Keys.Run](){return client.query}}; export const run=wrapper[Keys.Run]()" },
  ['adapter_generic_query_surface'],
  ['method wrapper.getRunner', 'call wrapper.getRunner']
)
scannerFixture(
  'generic computed static method declaration',
  { 'lib/core-v2/adapter/a.ts': "const key='getRunner'; class Wrapper{static [key](){return client.query}}; export const run=Wrapper[key]()" },
  ['adapter_generic_query_surface'],
  ['class static method Wrapper.getRunner', 'call Wrapper.getRunner']
)
scannerFixture(
  'generic const-computed object getter declaration',
  { 'lib/core-v2/adapter/a.ts': "const key='runner'; const wrapper={get [key](){return client.query}}; export const run=wrapper[key]" },
  ['adapter_generic_query_surface'],
  ['getter wrapper.runner', 'alias run']
)
scannerFixture(
  'generic enum-computed static getter declaration',
  { 'lib/core-v2/adapter/a.ts': "enum Keys{Run='runner'}; class Wrapper{static get [Keys.Run](){return client.query}}; export const run=Wrapper[Keys.Run]" },
  ['adapter_generic_query_surface'],
  ['class static getter Wrapper.runner', 'alias run']
)
scannerFixture(
  'generic indexed callable direct literal index',
  { 'lib/core-v2/adapter/a.ts': 'const f=function(){return client.query}; const methods=[f]; export const run=methods[0]()' },
  ['adapter_generic_query_surface'],
  ['indexed alias methods.0', 'call methods.0']
)
scannerFixture(
  'generic indexed callable const index',
  { 'lib/core-v2/adapter/a.ts': 'const f=()=>client.query; const methods=[f]; const index=0; export const run=methods[index]()' },
  ['adapter_generic_query_surface'],
  ['indexed alias methods.0', 'call methods.0']
)
scannerFixture(
  'generic readonly tuple destructured callable',
  { 'lib/core-v2/adapter/a.ts': 'const f=function(){return client.query}; const methods=[f] as const; const [run]=methods; export default run()' },
  ['adapter_generic_query_surface'],
  ['destructure index 0 as run', 'call run', 'default export']
)
scannerFixture(
  'generic callable arrow array element',
  { 'lib/core-v2/adapter/a.ts': 'const methods=[()=>client.query]; export const run=methods[0]()' },
  ['adapter_generic_query_surface'],
  ['indexed function methods.0', 'call methods.0']
)
scannerFixture(
  'generic exported callable tuple surface',
  { 'lib/core-v2/adapter/a.ts': 'const f=function(){return client.query}; const methods=[f] as const; export {methods}' },
  ['adapter_generic_query_surface'],
  ['indexed alias methods.0', 'export surface methods carrying methods.0']
)
scannerFixture(
  'generic nested indexed callable',
  { 'lib/core-v2/adapter/a.ts': 'const f=function(){return client.query}; const nested=[[f]] as const; export const run=nested[0][0]()' },
  ['adapter_generic_query_surface'],
  ['indexed alias nested.0.0', 'call nested.0.0']
)
scannerFixture(
  'generic returned callable array',
  { 'lib/core-v2/adapter/a.ts': 'const f=function(){return client.query}; function getMethods(){return [f] as const}; const methods=getMethods(); export const run=methods[0]()' },
  ['adapter_generic_query_surface'],
  ['indexed alias methods.0', 'call methods.0']
)
scannerFixture(
  'generic detached static class method',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{static getRunner(){return client.query}}; const method=Wrapper.getRunner; export const run=method()' },
  ['adapter_generic_query_surface'],
  ['class static method Wrapper.getRunner', 'function alias method', 'call method']
)
scannerFixture(
  'generic inherited class method',
  { 'lib/core-v2/adapter/a.ts': 'class Base{getRunner(){return client.query}}; class Child extends Base{}; const child=new Child(); export const run=child.getRunner()' },
  ['adapter_generic_query_surface'],
  ['inherit Base.getRunner as Child.getRunner', 'instance child', 'call child.getRunner']
)
scannerFixture(
  'generic multilevel inherited getter',
  { 'lib/core-v2/adapter/a.ts': 'class Base{get runner(){return client.query}}; class Middle extends Base{}; class Child extends Middle{}; const child=new Child(); export const run=child.runner' },
  ['adapter_generic_query_surface'],
  ['inherit getter Base.runner as Middle.runner', 'inherit getter Middle.runner as Child.runner', 'instance getter child']
)
scannerFixture(
  'generic barrel class propagation',
  {
    'lib/core-v2/adapter/index.ts': "export {run} from './wrapper'",
    'lib/core-v2/adapter/wrapper.ts': 'class Wrapper{static getRunner(){return client.query}}; export const run=Wrapper.getRunner()',
  },
  ['adapter_generic_query_surface'],
  ['Adapter import chain lib/core-v2/adapter/index.ts -> lib/core-v2/adapter/wrapper.ts', 'class static method Wrapper.getRunner']
)
scannerFixture(
  'generic CommonJS static class export',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{static getRunner(){return client.query}}; module.exports=Wrapper.getRunner' },
  ['adapter_generic_query_surface'],
  ['class static method Wrapper.getRunner', 'assign callable module.exports']
)
scannerFixture(
  'generic cyclic inherited class propagation',
  {
    'lib/core-v2/adapter/a.ts': "import './b'; export const safe=true",
    'lib/core-v2/adapter/b.ts': "import './a'; class Base{getRunner(){return client.query}}; class Child extends Base{}; const child=new Child(); export const run=child.getRunner()",
  },
  ['adapter_generic_query_surface'],
  ['inherit Base.getRunner as Child.getRunner', 'call child.getRunner']
)
scannerFixture(
  'safe harmless getter',
  { 'lib/core-v2/adapter/a.ts': "const wrapper={get label(){return 'query'}}; export const label=wrapper.label" },
  []
)
scannerFixture(
  'safe acquire-returning class method',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{getAcquire(){return adapter.acquire}}; const wrapper=new Wrapper(); export const acquire=wrapper.getAcquire()' },
  []
)
scannerFixture(
  'safe string array',
  { 'lib/core-v2/adapter/a.ts': "const values=['query']; export const label=values[0]" },
  []
)
scannerFixture(
  'safe acquire tuple',
  { 'lib/core-v2/adapter/a.ts': 'const values=[adapter.acquire] as const; export const acquire=values[0]' },
  []
)
scannerFixture(
  'safe unresolved computed declaration name',
  { 'lib/core-v2/adapter/a.ts': 'const key=getRuntimeKey(); const wrapper={[key](){return adapter.acquire}}; export {wrapper}' },
  []
)
scannerFixture(
  'safe harmless class inheritance',
  { 'lib/core-v2/adapter/a.ts': "class Base{getLabel(){return 'query'}}; class Child extends Base{}; export {Child}" },
  []
)
scannerFixture(
  'generic parenthesized indexed value',
  { 'lib/core-v2/adapter/a.ts': 'const values=[client.query] as const; export const run=((values[0]))' },
  ['adapter_generic_query_surface'],
  ['indexed capability values.0', 'alias run']
)
scannerFixture(
  'generic parenthesized indexed callable invocation',
  { 'lib/core-v2/adapter/a.ts': 'const values=[()=>client.query] as const; export const run=((values[0]))()' },
  ['adapter_generic_query_surface'],
  ['indexed function values.0', 'call values.0']
)
scannerFixture(
  'generic sequence-selected container',
  { 'lib/core-v2/adapter/a.ts': 'const f=function(){return client.query}; const values=[f] as const; export const run=(0,values)[0]()' },
  ['adapter_generic_query_surface'],
  ['indexed alias values.0', 'call values.0']
)
scannerFixture(
  'generic compile-time conditional unsafe branch',
  { 'lib/core-v2/adapter/a.ts': 'const f=()=>client.query; const unsafe=[f] as const; const safe=[adapter.acquire] as const; const useUnsafe=true; export const run=(useUnsafe?unsafe:safe)[0]()' },
  ['adapter_generic_query_surface'],
  ['indexed alias unsafe.0', 'call unsafe.0']
)
scannerFixture(
  'generic unresolved conditional unsafe branch',
  { 'lib/core-v2/adapter/a.ts': 'const f=()=>client.query; const unsafe=[f] as const; const safe=[adapter.acquire] as const; declare const choice:boolean; export const run=(choice?unsafe:safe)[0]()' },
  ['adapter_generic_query_surface'],
  ['indexed alias unsafe.0', 'call unsafe.0']
)
scannerFixture(
  'generic nullish unsafe operand',
  { 'lib/core-v2/adapter/a.ts': 'const f=()=>client.query; const unsafe=[f] as const; const safe=[adapter.acquire] as const; export const run=(unsafe??safe)[0]()' },
  ['adapter_generic_query_surface'],
  ['indexed alias unsafe.0', 'call unsafe.0']
)
scannerFixture(
  'generic array direct spread',
  { 'lib/core-v2/adapter/a.ts': 'const base=[client.query] as const; const values=[...base] as const; export const run=values[0]' },
  ['adapter_generic_query_surface'],
  ['spread base.0 as values.0', 'alias run']
)
scannerFixture(
  'generic nested tuple spread',
  { 'lib/core-v2/adapter/a.ts': 'const f=()=>client.query; const base=[f] as const; const nested=[[...base]] as const; export const run=nested[0][0]()' },
  ['adapter_generic_query_surface'],
  ['spread base.0 as nested.0.0', 'call nested.0.0']
)
scannerFixture(
  'generic destructuring after spread',
  { 'lib/core-v2/adapter/a.ts': 'const base=[client.query] as const; const values=[...base] as const; export const [run]=values' },
  ['adapter_generic_query_surface'],
  ['spread base.0 as values.0', 'destructure index 0 as run']
)
scannerFixture(
  'generic callable element after spread',
  { 'lib/core-v2/adapter/a.ts': 'const base=[()=>client.query] as const; const values=[adapter.acquire,...base] as const; export const run=values[1]()' },
  ['adapter_generic_query_surface'],
  ['spread base.0 as values.1', 'call values.1']
)
scannerFixture(
  'generic anonymous class expression',
  { 'lib/core-v2/adapter/a.ts': 'const Wrapper=class{getRunner(){return client.query}}; export const run=new Wrapper().getRunner()' },
  ['adapter_generic_query_surface'],
  ['class method Wrapper.getRunner', 'call Wrapper.prototype.getRunner']
)
scannerFixture(
  'generic named class expression',
  { 'lib/core-v2/adapter/a.ts': 'const Wrapper=class Named{getRunner(){return client.query}}; export const run=new Wrapper().getRunner()' },
  ['adapter_generic_query_surface'],
  ['class method Wrapper.getRunner', 'call Wrapper.prototype.getRunner']
)
scannerFixture(
  'generic class-expression static method',
  { 'lib/core-v2/adapter/a.ts': 'const Wrapper=class Named{static getRunner(){return client.query}}; export const run=Wrapper.getRunner()' },
  ['adapter_generic_query_surface'],
  ['class static method Wrapper.getRunner', 'call Wrapper.getRunner']
)
scannerFixture(
  'generic multi-hop class alias',
  { 'lib/core-v2/adapter/a.ts': 'class Base{getRunner(){return client.query}}; const Alias=Base; const Second=Alias; export const run=new Second().getRunner()' },
  ['adapter_generic_query_surface'],
  ['surface alias Base as Alias', 'surface alias Alias as Second', 'call Second.prototype.getRunner']
)
scannerFixture(
  'generic namespace class alias',
  { 'lib/core-v2/adapter/a.ts': 'namespace Wrappers{export class Base{static getRunner(){return client.query}}}; const Alias=Wrappers.Base; export const run=Alias.getRunner()' },
  ['adapter_generic_query_surface'],
  ['class static method Wrappers.Base.getRunner', 'surface alias Wrappers.Base as Alias']
)
scannerFixture(
  'generic CommonJS class alias',
  { 'lib/core-v2/adapter/a.ts': 'class Base{static getRunner(){return client.query}}; const Alias=Base; module.exports=Alias' },
  ['adapter_generic_query_surface'],
  ['surface alias Base as Alias', 'assign surface module.exports carrying Alias.getRunner']
)
scannerFixture(
  'generic barrel-propagated class expression',
  {
    'lib/core-v2/adapter/index.ts': "export {run} from './wrapper'",
    'lib/core-v2/adapter/wrapper.ts': 'const Wrapper=class{getRunner(){return client.query}}; export const run=new Wrapper().getRunner()',
  },
  ['adapter_generic_query_surface'],
  ['Adapter import chain lib/core-v2/adapter/index.ts -> lib/core-v2/adapter/wrapper.ts', 'class method Wrapper.getRunner']
)
scannerFixture(
  'generic inherited unsafe method without override effective lookup',
  { 'lib/core-v2/adapter/a.ts': 'class Base{getRunner(){return client.query}}; class Child extends Base{}; export const run=new Child().getRunner()' },
  ['adapter_generic_query_surface'],
  ['inherit Base.getRunner as Child.getRunner', 'call Child.prototype.getRunner']
)
scannerFixture(
  'generic unsafe child override effective lookup',
  { 'lib/core-v2/adapter/a.ts': 'class Base{getRunner(){return adapter.acquire}}; class Child extends Base{getRunner(){return client.query}}; export const run=new Child().getRunner()' },
  ['adapter_generic_query_surface'],
  ['class method Child.getRunner', 'call Child.prototype.getRunner']
)
scannerFixture(
  'generic tuple rest direct',
  { 'lib/core-v2/adapter/a.ts': 'const values=[adapter.acquire,client.query] as const; const [,...rest]=values; export const run=rest[0]' },
  ['adapter_generic_query_surface'],
  ['tuple rest values.1 as rest.0', 'alias run']
)
scannerFixture(
  'generic tuple rest nested',
  { 'lib/core-v2/adapter/a.ts': 'const nested=[[adapter.acquire,client.query] as const] as const; const [[,...rest]]=nested; export const run=rest[0]' },
  ['adapter_generic_query_surface'],
  ['tuple rest nested.0.1 as rest.0', 'alias run']
)
scannerFixture(
  'generic tuple rest callable element',
  { 'lib/core-v2/adapter/a.ts': 'const source=[adapter.acquire,()=>client.query] as const; const [,...rest]=source; export const run=rest[0]()' },
  ['adapter_generic_query_surface'],
  ['tuple rest source.1 as rest.0', 'call rest.0']
)
scannerFixture(
  'generic tuple rest through barrel',
  {
    'lib/core-v2/adapter/index.ts': "export {run} from './tuple'",
    'lib/core-v2/adapter/tuple.ts': 'const source=[adapter.acquire,client.query] as const; const [,...rest]=source; export const run=rest[0]',
  },
  ['adapter_generic_query_surface'],
  ['Adapter import chain lib/core-v2/adapter/index.ts -> lib/core-v2/adapter/tuple.ts', 'tuple rest source.1 as rest.0']
)
scannerFixture(
  'generic conditional spread unsafe first index',
  { 'lib/core-v2/adapter/a.ts': 'const f=function(){return client.query}; const unsafe=[f] as const; const safe=[adapter.acquire] as const; declare const choice:boolean; const values=[...(choice?unsafe:safe)] as const; export const run=values[0]()' },
  ['adapter_generic_query_surface'],
  ['spread unsafe.0 as values.0 alternative unsafe', 'call values.0']
)
scannerFixture(
  'generic conditional spread unsafe shifted index',
  { 'lib/core-v2/adapter/a.ts': 'const f=function(){return client.query}; const left=[adapter.acquire] as const; const unsafe=[f] as const; const safe=[adapter.acquire] as const; declare const choice:boolean; const values=[...left,...(choice?unsafe:safe)] as const; export const run=values[1]()' },
  ['adapter_generic_query_surface'],
  ['spread unsafe.0 as values.1 alternative unsafe', 'call values.1']
)
scannerFixture(
  'generic nullish spread unsafe operand',
  { 'lib/core-v2/adapter/a.ts': 'const f=function(){return client.query}; const unsafe=[f] as const; const safe=[adapter.acquire] as const; const values=[...(unsafe??safe)] as const; export const run=values[0]()' },
  ['adapter_generic_query_surface'],
  ['spread unsafe.0 as values.0 alternative unsafe', 'call values.0']
)
scannerFixture(
  'generic class factory declaration',
  { 'lib/core-v2/adapter/a.ts': 'function createWrapper(){return class{getRunner(){return client.query}}}; const Wrapper=createWrapper(); export const run=new Wrapper().getRunner()' },
  ['adapter_dynamic_surface_construct', 'adapter_generic_query_surface'],
  ['class method createWrapper.$returnedClass.getRunner', 'factory return createWrapper.$returnedClass as Wrapper']
)
scannerFixture(
  'generic class factory arrow',
  { 'lib/core-v2/adapter/a.ts': 'const createWrapper=()=>class Named{static getRunner(){return client.query}}; const Wrapper=createWrapper(); export const run=Wrapper.getRunner()' },
  ['adapter_dynamic_surface_construct', 'adapter_generic_query_surface'],
  ['class static method createWrapper.$returnedClass.getRunner', 'factory return createWrapper.$returnedClass as Wrapper']
)
scannerFixture(
  'generic returned constructor alias',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{getRunner(){return client.query}}; function getConstructor(){return Wrapper}; const Constructor=getConstructor(); export const run=new Constructor().getRunner()' },
  ['adapter_dynamic_surface_construct', 'adapter_generic_query_surface'],
  ['factory return Wrapper as Constructor', 'call Constructor.prototype.getRunner']
)
scannerFixture(
  'generic multi-hop constructor factory',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{static getRunner(){return client.query}}; function first(){return Wrapper}; function second(){return first()}; const Constructor=second(); export const run=Constructor.getRunner()' },
  ['adapter_dynamic_surface_construct', 'adapter_generic_query_surface'],
  ['factory return Wrapper as Constructor', 'call Constructor.getRunner']
)
scannerFixture(
  'generic namespace-bound instance class expression',
  { 'lib/core-v2/adapter/a.ts': 'namespace Wrappers{export const Wrapper=class{getRunner(){return client.query}}}; const Alias=Wrappers.Wrapper; export const run=new Alias().getRunner()' },
  ['adapter_generic_query_surface'],
  ['class method Wrappers.Wrapper.getRunner', 'surface alias Wrappers.Wrapper as Alias']
)
scannerFixture(
  'generic namespace-bound static class expression',
  { 'lib/core-v2/adapter/a.ts': 'namespace Wrappers{export const Wrapper=class{static getRunner(){return client.query}}}; export const run=Wrappers.Wrapper.getRunner()' },
  ['adapter_generic_query_surface'],
  ['class static method Wrappers.Wrapper.getRunner', 'call Wrappers.Wrapper.getRunner']
)
scannerFixture(
  'generic namespace alias of class expression',
  { 'lib/core-v2/adapter/a.ts': 'namespace Outer{export namespace Inner{export const Wrapper=class{getRunner(){return client.query}}}}; const Space=Outer.Inner; const Alias=Space.Wrapper; export const run=new Alias().getRunner()' },
  ['adapter_generic_query_surface'],
  ['class method Outer.Inner.Wrapper.getRunner', 'surface alias Outer.Inner as Space']
)
scannerFixture(
  'generic same-name unsafe inherited static',
  { 'lib/core-v2/adapter/a.ts': 'class Base{static getRunner(){return client.query}}; class Child extends Base{getRunner(){return adapter.acquire}}; export const run=Child.getRunner()' },
  ['adapter_generic_query_surface'],
  ['inherit Base.getRunner as Child.getRunner', 'call Child.getRunner']
)
scannerFixture(
  'generic same-name unsafe inherited instance',
  { 'lib/core-v2/adapter/a.ts': 'class Base{getRunner(){return client.query}}; class Child extends Base{static getRunner(){return adapter.acquire}}; export const run=new Child().getRunner()' },
  ['adapter_generic_query_surface'],
  ['inherit Base.getRunner as Child.getRunner', 'call Child.prototype.getRunner']
)
scannerFixture(
  'generic multilevel static instance separation',
  { 'lib/core-v2/adapter/a.ts': 'class Base{getRunner(){return client.query}}; class Middle extends Base{static getRunner(){return adapter.acquire}}; class Child extends Middle{}; export const run=new Child().getRunner()' },
  ['adapter_generic_query_surface'],
  ['inherit Middle.getRunner as Child.getRunner', 'call Child.prototype.getRunner']
)
scannerFixture(
  'safe tuple rest',
  { 'lib/core-v2/adapter/a.ts': 'const values=[adapter.acquire,adapter.acquire] as const; const [,...rest]=values; export const run=rest[0]' },
  []
)
scannerFixture(
  'safe conditional spread alternatives',
  { 'lib/core-v2/adapter/a.ts': 'const first=[adapter.acquire] as const; const second=[adapter.acquire] as const; declare const choice:boolean; const values=[...(choice?first:second)] as const; export const run=values[0]' },
  []
)
scannerFixture(
  'safe nullish spread alternatives',
  { 'lib/core-v2/adapter/a.ts': 'const first=[adapter.acquire] as const; const second=[adapter.acquire] as const; const values=[...(first??second)] as const; export const run=values[0]' },
  []
)
scannerFixture(
  'policy prohibits harmless class factory',
  { 'lib/core-v2/adapter/a.ts': "function create(){return class{getLabel(){return 'query'}}}; const Wrapper=create(); export const label=new Wrapper().getLabel()" },
  ['adapter_dynamic_surface_construct']
)
scannerFixture(
  'policy prohibits acquire-only class factory',
  { 'lib/core-v2/adapter/a.ts': 'const create=()=>class{getRunner(){return adapter.acquire}}; const Wrapper=create(); export const run=new Wrapper().getRunner()' },
  ['adapter_dynamic_surface_construct']
)
scannerFixture(
  'policy prohibits aliased constructor factory',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{}; const Alias=Wrapper; function create(){return Alias}; export const value=create()' },
  ['adapter_dynamic_surface_construct'],
  ['class or constructor factory']
)
scannerFixture(
  'policy prohibits concrete generic class wrapper',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{}; function identity<T>(value:T){return value}; export const value=identity(Wrapper)' },
  ['adapter_dynamic_surface_construct'],
  ['class constructor passed through generic call surface']
)
scannerFixture(
  'policy prohibits constructor tuple',
  { 'lib/core-v2/adapter/a.ts': 'class Wrapper{}; const constructors=[Wrapper] as const; export const value=constructors[0]' },
  ['adapter_dynamic_surface_construct'],
  ['constructor stored in array or tuple']
)
scannerFixture(
  'policy prohibits object-held class expression',
  { 'lib/core-v2/adapter/a.ts': 'const registry={Wrapper:class{}}; export const value=registry.Wrapper' },
  ['adapter_dynamic_surface_construct'],
  ['class expression or constructor factory stored in object']
)
scannerFixture(
  'policy prohibits object-held constructor factory',
  { 'lib/core-v2/adapter/a.ts': 'const registry={create(){return class{}}}; export const value=registry.create()' },
  ['adapter_dynamic_surface_construct'],
  ['class expression or constructor factory stored in object']
)
scannerFixture(
  'policy prohibits dynamic adapter constructs',
  { 'lib/core-v2/adapter/a.ts': 'declare const key:string; declare const target:object; eval(key); new Function(key); new Proxy(target,{}); Reflect.get(target,key); Object.assign(target,{}); void import(key); const erased=target as unknown' },
  ['adapter_dynamic_surface_construct'],
  ['policy-prohibited eval', 'policy-prohibited nonliteral dynamic import', 'policy-prohibited UnknownKeyword cast']
)
scannerFixture(
  'returned tuple rest retains final provenance',
  { 'lib/core-v2/adapter/a.ts': 'function make(){return [adapter.acquire,()=>client.query] as const}; const values=[...make()] as const; const [,...rest]=values; export const run=rest[0]()' },
  ['adapter_generic_query_surface'],
  ['return container make', 'spread values.$returned.make.1 as values.1', 'tuple rest values.1 as rest.0', 'call rest.0', 'alias run']
)
scannerFixture(
  'safe harmless namespace class expression',
  { 'lib/core-v2/adapter/a.ts': "namespace Wrappers{export const Wrapper=class{getLabel(){return 'query'}}}; export const label=new Wrappers.Wrapper().getLabel()" },
  []
)
scannerFixture(
  'safe static override with safe instance member',
  { 'lib/core-v2/adapter/a.ts': 'class Base{static getRunner(){return client.query} getRunner(){return adapter.acquire}}; class Child extends Base{static getRunner(){return adapter.acquire}}; export const run=new Child().getRunner()' },
  []
)
scannerFixture(
  'safe instance override while unused static is unsafe',
  { 'lib/core-v2/adapter/a.ts': 'class Base{static getRunner(){return client.query} getRunner(){return client.query}}; class Child extends Base{getRunner(){return adapter.acquire}}; export const run=new Child().getRunner()' },
  []
)
scannerFixture(
  'safe parenthesized acquire',
  { 'lib/core-v2/adapter/a.ts': 'const values=[adapter.acquire] as const; export const run=((values[0]))' },
  []
)
scannerFixture(
  'safe sequence-selected container',
  { 'lib/core-v2/adapter/a.ts': 'const values=[adapter.acquire] as const; export const run=(0,values)[0]' },
  []
)
scannerFixture(
  'safe conditional all-safe branches',
  { 'lib/core-v2/adapter/a.ts': 'const first=[adapter.acquire] as const; const second=[adapter.acquire] as const; declare const choice:boolean; export const run=(choice?first:second)[0]' },
  []
)
scannerFixture(
  'safe nullish all-safe operands',
  { 'lib/core-v2/adapter/a.ts': 'const first=[adapter.acquire] as const; const second=[adapter.acquire] as const; export const run=(first??second)[0]' },
  []
)
scannerFixture(
  'safe acquire tuple spread',
  { 'lib/core-v2/adapter/a.ts': 'const base=[adapter.acquire] as const; const values=[...base] as const; export const run=values[0]' },
  []
)
scannerFixture(
  'safe string array spread',
  { 'lib/core-v2/adapter/a.ts': "const labels=['query'] as const; const copied=[...labels] as const; export const label=copied[0]" },
  []
)
scannerFixture(
  'safe child override of unsafe base effective lookup',
  { 'lib/core-v2/adapter/a.ts': 'class Base{getRunner(){return client.query}}; class Child extends Base{getRunner(){return adapter.acquire}}; export const run=new Child().getRunner()' },
  []
)
scannerFixture(
  'safe harmless class expression',
  { 'lib/core-v2/adapter/a.ts': "const Wrapper=class{getLabel(){return 'query'}}; export const run=new Wrapper().getLabel()" },
  []
)
scannerFixture(
  'safe harmless class alias',
  { 'lib/core-v2/adapter/a.ts': "class Base{getLabel(){return 'query'}}; const Alias=Base; export const run=new Alias().getLabel()" },
  []
)
scannerFixture(
  'safe string-returning function expression',
  { 'lib/core-v2/adapter/a.ts': "const getLabel=function(){return 'query'}; export {getLabel}" },
  []
)
scannerFixture(
  'safe harmless object method',
  { 'lib/core-v2/adapter/a.ts': "const wrapper={getLabel(){return 'query'}}; export {wrapper}" },
  []
)
scannerFixture(
  'safe acquire-returning function',
  { 'lib/core-v2/adapter/a.ts': 'const getAcquire=()=>adapter.acquire; export const acquire=getAcquire()' },
  []
)
scannerFixture(
  'safe query metadata function',
  { 'lib/core-v2/adapter/a.ts': "const queryMetadata=()=>({label:'query'}); export {queryMetadata}" },
  []
)
scannerFixture(
  'safe function provenance documentation string',
  { 'lib/core-v2/adapter/a.ts': "export const note='function returns client.query'" },
  []
)
scannerFixture(
  'safe function provenance comment',
  { 'lib/core-v2/adapter/a.ts': '// function getRunner(){ return client.query }' },
  []
)
scannerFixture(
  'safe generic labels and metadata',
  { 'lib/core-v2/adapter/a.ts': 'const queryLabel="safe"; const queryMetadata={safe:true}; const transactionState="disabled"' },
  []
)
scannerFixture(
  'safe unresolved dynamic key limitation',
  { 'lib/core-v2/adapter/a.ts': 'const key=getRuntimeKey(); client[key]()' },
  []
)
scannerFixture(
  'safe object spread without capability',
  { 'lib/core-v2/adapter/a.ts': 'const first={acquire(){}}; const second={...first}' },
  []
)
scannerFixture(
  'safe mapped acquire type',
  { 'lib/core-v2/adapter/a.ts': "type Keys='acquire'; type Surface={ [K in Keys]:()=>void }" },
  []
)
scannerFixture(
  'safe uninstantiated generic conditional type',
  { 'lib/core-v2/adapter/a.ts': 'type Surface<T extends boolean>=T extends true?{query:()=>void}:{acquire:()=>void}' },
  []
)
scannerFixture(
  'safe generic capability comment',
  { 'lib/core-v2/adapter/a.ts': '// client.query and const run = client.query' },
  []
)

check('cyclic generic provenance emits one deduplicated finding', () => {
  const findings = analyzeVirtualFiles({
    'lib/core-v2/adapter/a.ts': "import './b'",
    'lib/core-v2/adapter/b.ts': "import './a'; const run=client.query",
  }).filter((finding) => finding.rule === 'adapter_generic_query_surface')
  assert.equal(findings.length, 1)
  assert.equal(new Set(findings.map((finding) => formatViolation(finding))).size, 1)
  assert.equal(new Set(findings.map((finding) => finding.file)).size, 1)
})

check('live repository boundary scan', () => assert.deepEqual(scanRepository(), []))

const stableScannerRules = [
  ...boundaryRules.CORE_V2_FORBIDDEN_IMPORT_RULES,
].sort()
const fixtureCoveredScannerRules = [...exercisedScannerRules].sort()
const liveScanOnlyScannerRules = stableScannerRules.filter(
  (rule) => !exercisedScannerRules.has(rule)
)
const intentionallyNonIsolatableScannerRules = []
const uncoveredScannerRules = stableScannerRules.filter(
  (rule) =>
    !exercisedScannerRules.has(rule) &&
    !intentionallyNonIsolatableScannerRules.includes(rule)
)

check('every stable scanner rule has isolated fixture coverage', () => {
  assert.deepEqual(fixtureCoveredScannerRules, stableScannerRules)
  assert.deepEqual(liveScanOnlyScannerRules, [])
  assert.deepEqual(intentionallyNonIsolatableScannerRules, [])
  assert.deepEqual(uncoveredScannerRules, [])
})

await Promise.all(pendingChecks)

console.log(
  `Core V2 contract checks passed: ${testCount} tests; ${scannerFixtureCount} scanner fixtures; ` +
    `${stableScannerRules.length} stable rule IDs; fixture-covered IDs: ` +
    `${fixtureCoveredScannerRules.join(', ')}; live-scan-only IDs: ` +
    `${liveScanOnlyScannerRules.join(', ') || 'none'}; intentionally non-isolatable IDs: ` +
    `${intentionallyNonIsolatableScannerRules.join(', ') || 'none'}; uncovered IDs: ` +
    `${uncoveredScannerRules.join(', ') || 'none'}.`
)
