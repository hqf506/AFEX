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
  operation()
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

console.log(
  `Core V2 contract checks passed: ${testCount} tests; ${scannerFixtureCount} scanner fixtures; ` +
    `${stableScannerRules.length} stable rule IDs; fixture-covered IDs: ` +
    `${fixtureCoveredScannerRules.join(', ')}; live-scan-only IDs: ` +
    `${liveScanOnlyScannerRules.join(', ') || 'none'}; intentionally non-isolatable IDs: ` +
    `${intentionallyNonIsolatableScannerRules.join(', ') || 'none'}; uncovered IDs: ` +
    `${uncoveredScannerRules.join(', ') || 'none'}.`
)
