import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const root = process.cwd()
const require = createRequire(import.meta.url)

function loadTypeScriptModule(relativePath, imports = {}) {
  const filename = path.join(root, relativePath)
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText
  const commonJsModule = { exports: {} }
  const localRequire = (specifier) => {
    if (specifier === 'server-only') return {}
    if (specifier in imports) return imports[specifier]
    return require(specifier)
  }
  new Function('require', 'module', 'exports', output)(
    localRequire,
    commonJsModule,
    commonJsModule.exports
  )
  return commonJsModule.exports
}

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    )
  }
  return value ?? null
}
const canonicalJson = (value) => JSON.stringify(canonicalize(value))
const sha256Hex = (value) =>
  require('node:crypto').createHash('sha256').update(value).digest('hex')
const application = loadTypeScriptModule(
  'lib/atomic-order/application.ts',
  {
    '@/lib/idempotency/core': { canonicalJson, sha256Hex },
  }
)
const contracts = loadTypeScriptModule('lib/atomic-order/contracts.ts')

const authorization = {
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  actor: { type: 'pos_employee', id: 'employee-1' },
  authorization: {
    role: 'cashier',
  },
}
const financial = {
  snapshot: {
    requestFingerprint: 'request-fingerprint',
    quoteFingerprint: 'quote-fingerprint',
  },
}
const auditInput = {
  authorization,
  financial,
  correlationId: 'correlation-1',
  orderId: null,
  invoiceId: null,
  customerId: null,
  timestamp: '2026-07-24T09:00:00.000Z',
}
const auditFirst = application.buildAtomicAuditCandidate(auditInput)
const auditSecond = application.buildAtomicAuditCandidate(auditInput)
assert.deepEqual(auditFirst, auditSecond)
assert.equal(auditFirst.actorId, 'employee-1')
assert.equal(auditFirst.actorRole, 'cashier')
assert.equal(auditFirst.persistenceStatus, 'pending_database_transaction')
assert.equal('browserActorId' in auditFirst, false)

const outboxInput = {
  correlationId: 'correlation-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  timestamp: '2026-07-24T09:00:00.000Z',
  events: [
    {
      eventType: 'invoice_created',
      aggregateType: 'invoice',
      aggregateId: null,
      payload: { invoiceReference: null },
    },
    {
      eventType: 'pdf_generate',
      aggregateType: 'invoice',
      aggregateId: null,
      payload: { invoiceReference: null },
    },
  ],
}
const outboxFirst = application.buildAtomicOutboxCandidates(outboxInput)
const outboxSecond = application.buildAtomicOutboxCandidates(outboxInput)
assert.deepEqual(outboxFirst, outboxSecond)
assert.equal(outboxFirst.length, 2)
assert.equal(outboxFirst[0].executionStatus, 'pending_commit')
assert.deepEqual(outboxFirst[0].payload, { invoiceReference: null })
assert.match(outboxFirst[0].eventId, /^[a-f0-9-]{36}$/)
assert.match(outboxFirst[0].payloadHashCandidate, /^[a-f0-9]{64}$/)
assert.notEqual(
  outboxFirst[0].payloadHashCandidate,
  outboxFirst[1].payloadHashCandidate
)

assert.deepEqual(application.AFTER_COMMIT_EXECUTION_ORDER, [
  'invoice_committed',
  'inventory_committed',
  'audit_committed',
  'outbox_committed',
  'pdf_generate',
  'whatsapp_send',
  'email_send',
  'analytics_publish',
  'webhook_dispatch',
])
assert.equal(
  application.ATOMIC_ROLLBACK_CONTRACT.strategy,
  'database_transaction_rollback'
)
assert.equal(
  application.ATOMIC_ROLLBACK_CONTRACT.externalRollbackRequired,
  false
)
assert.ok(
  application.INSIDE_ATOMIC_TRANSACTION.includes('idempotency_commit')
)
assert.ok(
  application.INSIDE_ATOMIC_TRANSACTION.includes('outbox_persistence')
)
assert.ok(
  application.OUTSIDE_ATOMIC_TRANSACTION.includes('whatsapp_delivery')
)
assert.ok(
  application.OUTSIDE_ATOMIC_TRANSACTION.includes('pdf_generation')
)

assert.equal(application.selectAtomicExecutionMode(false), 'legacy_only')
assert.equal(application.selectAtomicExecutionMode(true), 'core_v2_only')
application.assertLegacyIsolation({
  mode: 'legacy_only',
  attemptedPaths: ['legacy'],
})
application.assertLegacyIsolation({
  mode: 'core_v2_only',
  attemptedPaths: ['core_v2'],
})
assert.throws(() =>
  application.assertLegacyIsolation({
    mode: 'core_v2_only',
    attemptedPaths: ['core_v2', 'legacy'],
  })
)

assert.deepEqual(
  contracts.ATOMIC_ORDER_STAGE_ORDER.slice(-3),
  ['audit', 'outbox', 'idempotency_commit']
)
assert.equal(
  contracts.ATOMIC_ORDER_STAGE_DEFINITIONS.outbox.requiredPreviousStage,
  'audit'
)
assert.equal(
  contracts.ATOMIC_ORDER_STAGE_DEFINITIONS.idempotency_commit
    .requiredPreviousStage,
  'outbox'
)

for (const relativePath of [
  'lib/atomic-order/application.ts',
  'lib/atomic-order/adapters.ts',
]) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  assert.doesNotMatch(
    source,
    /\.from\(|\.insert\(|\.update\(|\.delete\(|\.rpc\(|fetch\(/
  )
}
const routeSource = fs.readFileSync(
  path.join(root, 'app/api/orders/route.ts'),
  'utf8'
)
assert.match(routeSource, /create_invoice_with_items_safe/)
assert.doesNotMatch(routeSource, /createAtomicOrderFoundation/)

console.log('Atomic application foundation checks passed.')
