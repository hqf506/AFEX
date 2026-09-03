import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { transitionOrderStatus } from '../lib/server/orders/order-status-transition.ts'

const routeSource = readFileSync('app/api/pos/orders/[id]/status/route.ts', 'utf8')
const pageSource = readFileSync('app/pos/order-status/page.tsx', 'utf8')
const auditSource = readFileSync('lib/audit-log.ts', 'utf8')
const historySource = readFileSync('lib/server/orders/order-status-history.ts', 'utf8')
const cssSource = readFileSync('app/pos/order-status/order-status.module.css', 'utf8')

const authority = {
  tenantId: 'tenant-a',
  branchId: 'branch-a',
  actorId: 'actor-a',
  actorRole: 'employee',
  canWriteOrders: true,
}

function order(overrides = {}) {
  return {
    id: 'order-a',
    orderNumber: '02-0048',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    status: 'in_progress',
    ...overrides,
  }
}

function harness(options = {}) {
  let persisted = options.order === undefined ? order() : options.order
  const calls = { loads: [], updates: [], audits: [] }
  const gateway = {
    async loadOrder(input) {
      calls.loads.push(input)
      if (options.readThrows) throw new Error('sensitive database error')
      if (!persisted || persisted.tenantId !== input.tenantId || persisted.id !== input.orderId) return null
      return { ...persisted }
    },
    async compareAndSetStatus(input) {
      calls.updates.push(input)
      if (options.updateThrows) throw new Error('sensitive update error')
      if (options.updateOutcome === 'persistence_error') return { outcome: 'persistence_error' }
      if (options.raceToTarget) {
        persisted = { ...persisted, status: input.targetStatus }
        return { outcome: 'not_updated' }
      }
      if (options.updateOutcome === 'not_updated') return { outcome: 'not_updated' }
      if (!persisted || persisted.status !== input.currentStatus) return { outcome: 'not_updated' }
      persisted = { ...persisted, status: input.targetStatus }
      return { outcome: 'updated', order: { ...persisted } }
    },
    async recordAudit(input) {
      calls.audits.push(input)
      if (options.auditThrows) throw new Error('audit unavailable')
    },
  }
  return { calls, gateway, getPersisted: () => persisted }
}

test('1 valid in_progress to ready persists once and records the POS actor once', async () => {
  const run = harness()
  const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
  assert.equal(result.ok, true)
  assert.equal(result.classification, 'ORDER_STATUS_UPDATED')
  assert.equal(result.order.status, 'ready')
  assert.equal(run.calls.updates.length, 1)
  assert.equal(run.calls.audits.length, 1)
  assert.equal(run.calls.audits[0].actorId, 'actor-a')
})

test('2 existing ready to closed transition remains authorized', async () => {
  const run = harness({ order: order({ status: 'ready' }) })
  const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'closed', authority }, run.gateway)
  assert.equal(result.ok, true)
  assert.equal(result.order.status, 'closed')
})

test('3 invalid transition is rejected without update or audit', async () => {
  const run = harness()
  const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'closed', authority }, run.gateway)
  assert.deepEqual([result.ok, result.classification], [false, 'ORDER_STATUS_TRANSITION_INVALID'])
  assert.equal(run.calls.updates.length, 0)
  assert.equal(run.calls.audits.length, 0)
})

test('4 primary authenticated session is required by the route before any gateway use', () => {
  assert.match(routeSource, /requireApiAuth\(request, \[\.\.\.POS_ACCESS_ROLES\]\)/)
  assert.match(routeSource, /if \(!auth\.ok\) return auth\.response/)
})

test('5 missing or expired POS actor is rejected explicitly', () => {
  assert.match(routeSource, /const actor = auth\.context\.posEmployee/)
  assert.match(routeSource, /if \(!actor \|\| !actor\.branchId\)/)
  assert.match(routeSource, /POS_ACTOR_SESSION_REQUIRED/)
})

test('6 unauthorized actor role or missing orders capability is rejected', async () => {
  for (const patch of [{ actorRole: 'viewer' }, { canWriteOrders: false }]) {
    const run = harness()
    const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority: { ...authority, ...patch } }, run.gateway)
    assert.deepEqual([result.ok, result.classification], [false, 'ORDER_STATUS_FORBIDDEN'])
    assert.equal(run.calls.updates.length, 0)
  }
})

test('7 cross-tenant orders are not disclosed', async () => {
  const run = harness({ order: order({ tenantId: 'tenant-b' }) })
  const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
  assert.deepEqual([result.ok, result.classification], [false, 'ORDER_NOT_FOUND'])
})

test('8 cross-branch orders are rejected before mutation', async () => {
  const run = harness({ order: order({ branchId: 'branch-b' }) })
  const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
  assert.deepEqual([result.ok, result.classification], [false, 'ORDER_SCOPE_FORBIDDEN'])
  assert.equal(run.calls.updates.length, 0)
})

test('9 missing order is explicit and non-mutating', async () => {
  const run = harness({ order: null })
  const result = await transitionOrderStatus({ orderId: 'missing', targetStatus: 'ready', authority }, run.gateway)
  assert.deepEqual([result.ok, result.classification], [false, 'ORDER_NOT_FOUND'])
  assert.equal(run.calls.updates.length, 0)
})

test('10 zero-row update is re-read and remains a failure when target is unproven', async () => {
  const run = harness({ updateOutcome: 'not_updated' })
  const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
  assert.deepEqual([result.ok, result.classification], [false, 'ORDER_STATUS_STALE'])
  assert.equal(run.calls.loads.length, 2)
  assert.equal(run.calls.audits.length, 0)
})

test('11 stale current state cannot be widened into another transition', async () => {
  const run = harness({ order: order({ status: 'closed' }) })
  const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
  assert.deepEqual([result.ok, result.classification], [false, 'ORDER_STATUS_TRANSITION_INVALID'])
})

test('12 repeated identical request is idempotent and does not duplicate audit', async () => {
  const run = harness()
  const first = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
  const retry = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
  assert.equal(first.classification, 'ORDER_STATUS_UPDATED')
  assert.equal(retry.classification, 'ORDER_STATUS_ALREADY_APPLIED')
  assert.equal(retry.idempotent, true)
  assert.equal(run.calls.updates.length, 1)
  assert.equal(run.calls.audits.length, 1)
})

test('13 concurrent tab winner is recognized only after authoritative re-read', async () => {
  const run = harness({ raceToTarget: true })
  const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
  assert.equal(result.classification, 'ORDER_STATUS_ALREADY_APPLIED')
  assert.equal(run.calls.loads.length, 2)
  assert.equal(run.calls.audits.length, 0)
})

test('14 persistence failures are classified without raw database details', async () => {
  for (const options of [{ updateOutcome: 'persistence_error' }, { updateThrows: true }, { readThrows: true }]) {
    const run = harness(options)
    const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
    assert.deepEqual([result.ok, result.classification], [false, 'ORDER_STATUS_PERSISTENCE_FAILED'])
    assert.equal(JSON.stringify(result).includes('sensitive'), false)
  }
  assert.doesNotMatch(routeSource, /error\.message|error\.details|error\.hint|updateError/)
})

test('15 audit remains the proved best-effort existing contract without false atomicity claim', async () => {
  const run = harness({ auditThrows: true })
  const result = await transitionOrderStatus({ orderId: 'order-a', targetStatus: 'ready', authority }, run.gateway)
  assert.equal(result.ok, true)
  assert.equal(result.auditMode, 'BEST_EFFORT_EXISTING_CONTRACT')
  assert.equal(run.calls.audits.length, 1)
  assert.match(auditSource, /try \{[\s\S]*?from\('audit_logs'\)[\s\S]*?catch \(error\)/)
})

test('16 employee attribution uses the trusted POS actor and history resolves pos_profiles', () => {
  assert.match(routeSource, /actorUserId: input\.actorId/)
  assert.match(auditSource, /actor_user_id: effectiveActorUserId/)
  assert.match(historySource, /from\('pos_profiles'\)/)
  assert.match(historySource, /Promise\.all\(\[[\s\S]*?profilesQuery,[\s\S]*?posProfilesQuery/)
})

test('17 server reload and CAS derive tenant branch and actor only from trusted context', () => {
  assert.match(routeSource, /tenantId: actor\.tenantId/)
  assert.match(routeSource, /branchId: actorBranchId/)
  assert.match(routeSource, /actorId: actor\.id/)
  assert.match(routeSource, /canWriteOrders: auth\.context\.can\('orders:write'\)/)
  assert.match(routeSource, /\.eq\('tenant_id', input\.tenantId\)/)
  assert.match(routeSource, /\.eq\('branch_id', input\.branchId\)/)
  assert.match(routeSource, /\.eq\('status', input\.currentStatus\)/)
  assert.match(routeSource, /bodyKeys\.length === 1 && bodyKeys\[0\] === 'status'/)
  assert.doesNotMatch(routeSource, /body\.(tenant|branch|employee|role)/)
})

test('18 client prevents duplicate click and disables only the selected order action', () => {
  assert.match(pageSource, /if \(!nextStatus \|\| updatingId/)
  assert.match(pageSource, /disabled=\{updatingId === order\.id\}/)
  assert.match(pageSource, /aria-busy=\{updatingId === order\.id\}/)
})

test('19 authoritative response updates card counters details and revalidates the list once', () => {
  const advance = pageSource.slice(pageSource.indexOf('const advance'), pageSource.indexOf("if (access.loading"))
  assert.match(advance, /persistedStatus !== nextStatus/)
  assert.match(advance, /setOrders\(\(current\) => current/)
  assert.match(advance, /storeOrderDetails\(order\.id/)
  assert.equal((advance.match(/await loadOrders\(1\)/g) || []).length, 1)
  assert.match(pageSource, /columns\.in_progress\.length/)
  assert.match(pageSource, /columns\.ready\.length/)
})

test('20 mutation failure feedback does not replace the order workspace or regress inline details geometry', () => {
  assert.match(pageSource, /setMutationFeedback\(\{[\s\S]*?type: 'error'/)
  assert.match(pageSource, /\{mutationFeedback \? <div[\s\S]*?data-feedback-type/)
  assert.doesNotMatch(pageSource, /setError\(`تعذر تحديث حالة الطلب/)
  assert.match(pageSource, /data-order-status-inline-details/)
  assert.match(pageSource, /data-order-status-action/)
  assert.match(cssSource, /\.inlineDetails/)
  assert.doesNotMatch(pageSource, /from ['"]@\/lib\/supabase\/client['"]/)
})
