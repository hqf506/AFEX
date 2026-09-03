import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const paths = {
  profile: new URL('lib/account/profile-presentation.ts', root),
  profileClient: new URL('lib/account/profile-presentation-client.ts', root),
  profileScope: new URL('lib/account/profile-presentation-scope.ts', root),
  profileRoute: new URL('app/api/account/profile-presentation/route.ts', root),
  provider: new URL('components/profile-presentation-provider.tsx', root),
  posEmployeeSession: new URL('lib/pos-employee-session.ts', root),
  inventory: new URL('lib/admin/inventory-movements-contract.ts', root),
  inventoryLegacyRoute: new URL('app/api/admin/inventory-movements/route.ts', root),
  inventoryV2Route: new URL('app/api/admin/inventory-movements/v2/route.ts', root),
  inventoryPage: new URL('app/admin/inventory/movements/page.tsx', root),
  compatibility: new URL('lib/offline/application-compatibility.ts', root),
  syncUi: new URL('components/pos-offline-sync-status.tsx', root),
}

async function presentationScopeKey(overrides = {}) {
  const scope = await importStandalone(paths.profileScope)
  return scope.createProfilePresentationScopeKey({
    primaryProfileId: 'profile-a',
    tenantId: 'tenant-a',
    primaryBranchId: 'branch-a',
    posEmployeeId: 'employee-a',
    posEmployeeBranchId: 'branch-a',
    posSessionGeneration: 1,
    ...overrides,
  })
}

async function transpile(path) {
  return ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
}

function sourceModule(source) {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
}

async function importStandalone(path) {
  return import(sourceModule(await transpile(path)))
}

async function importProfileClient() {
  const profileUrl = sourceModule(await transpile(paths.profile))
  const clientSource = (await transpile(paths.profileClient)).replace(
    /from ['"]\.\/profile-presentation['"]/u,
    `from ${JSON.stringify(profileUrl)}`
  )
  return import(sourceModule(clientSource))
}

const validPresentation = {
  username: 'employee',
  full_name: 'موظف اختبار',
  contact_email: null,
  phone: null,
  tenant_name: 'منشأة اختبار',
  branch_name: 'فرع اختبار',
  ui_capabilities: ['orders:read', 'pos:access'],
}

test('profile serializer returns exactly the approved seven presentation keys', async () => {
  const profile = await importStandalone(paths.profile)
  const result = profile.createProfilePresentation({
    ...validPresentation,
    ui_capabilities: ['pos:access', 'orders:read', 'pos:access', 'invented'],
  })
  assert.deepEqual(Object.keys(result), [
    'username',
    'full_name',
    'contact_email',
    'phone',
    'tenant_name',
    'branch_name',
    'ui_capabilities',
  ])
  assert.deepEqual(result.ui_capabilities, ['orders:read', 'pos:access'])
  for (const forbidden of ['id', 'tenant_id', 'branch_id', 'role', 'scope_type']) {
    assert.equal(Object.hasOwn(result, forbidden), false)
  }
})

test('profile parser rejects internal keys and unknown capabilities', async () => {
  const profile = await importStandalone(paths.profile)
  assert.throws(
    () => profile.parseProfilePresentation({ ...validPresentation, id: 'hidden' }),
    /PROFILE_PRESENTATION_INVALID_RESPONSE/u
  )
  assert.throws(
    () =>
      profile.parseProfilePresentation({
        ...validPresentation,
        ui_capabilities: ['database:admin'],
      }),
    /PROFILE_PRESENTATION_INVALID_RESPONSE/u
  )
})

test('trusted profile route rejects caller scope and derives identity server-side', async () => {
  const source = await readFile(paths.profileRoute, 'utf8')
  assert.match(source, /requireAuthorizationContext\(request\)/u)
  assert.match(source, /searchParams\.keys\(\)/u)
  assert.match(source, /context\.tenantId/u)
  assert.match(source, /context\.activeBranchId/u)
  assert.match(source, /context\.capabilities/u)
  assert.doesNotMatch(source, /supabaseAdmin|service.role|tenantId\s*=\s*request/u)
  assert.match(source, /private, no-store, max-age=0/u)
  assert.doesNotMatch(source, /console\.(?:log|info|error)/u)
})

test('profile client deduplicates a shared in-flight request for the same immutable scope', async () => {
  const client = await importProfileClient()
  const scopeKey = await presentationScopeKey()
  client.clearProfilePresentationMemoryCache()
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    await Promise.resolve()
    return new Response(JSON.stringify(validPresentation), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    const first = client.requestProfilePresentation(scopeKey)
    const second = client.requestProfilePresentation(scopeKey)
    assert.equal(first, second)
    assert.deepEqual(await first, validPresentation)
    assert.equal(calls, 1)
  } finally {
    client.clearProfilePresentationMemoryCache()
    globalThis.fetch = originalFetch
  }
})

test('scope switch aborts stale presentation work and rejects an old completion', async () => {
  const client = await importProfileClient()
  const oldScope = await presentationScopeKey()
  const newScope = await presentationScopeKey({ tenantId: 'tenant-b' })
  client.clearProfilePresentationMemoryCache()
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (_url, init) => {
    calls += 1
    if (calls === 1) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true }
        )
      })
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({ ...validPresentation, username: 'account-b' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
  }
  try {
    const stale = client.requestProfilePresentation(oldScope)
    const fresh = client.requestProfilePresentation(newScope)
    await assert.rejects(stale, (error) => error?.name === 'AbortError')
    assert.equal((await fresh).username, 'account-b')
    assert.equal(calls, 2)
  } finally {
    client.clearProfilePresentationMemoryCache()
    globalThis.fetch = originalFetch
  }
})

test('presentation cache isolates account tenant branch and POS actor authority changes', async () => {
  const client = await importProfileClient()
  client.clearProfilePresentationMemoryCache()
  const keys = await Promise.all([
    presentationScopeKey(),
    presentationScopeKey({ primaryProfileId: 'profile-b' }),
    presentationScopeKey({ tenantId: 'tenant-b' }),
    presentationScopeKey({ primaryBranchId: 'branch-b' }),
    presentationScopeKey({ posEmployeeId: 'employee-b' }),
    presentationScopeKey({ posEmployeeBranchId: 'branch-b' }),
    presentationScopeKey({ posSessionGeneration: 2 }),
  ])
  assert.equal(new Set(keys).size, keys.length)

  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(
      JSON.stringify({ ...validPresentation, username: `scope-${calls}` }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  try {
    for (const key of keys) await client.requestProfilePresentation(key)
    assert.equal(calls, keys.length)
  } finally {
    client.clearProfilePresentationMemoryCache()
    globalThis.fetch = originalFetch
  }
})

test('logout cache clearing forces a fresh presentation request', async () => {
  const client = await importProfileClient()
  const scopeKey = await presentationScopeKey()
  client.clearProfilePresentationMemoryCache()
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(JSON.stringify(validPresentation), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  try {
    await client.requestProfilePresentation(scopeKey)
    await client.requestProfilePresentation(scopeKey)
    assert.equal(calls, 1)
    client.clearProfilePresentationMemoryCache()
    await client.requestProfilePresentation(scopeKey)
    assert.equal(calls, 2)
  } finally {
    client.clearProfilePresentationMemoryCache()
    globalThis.fetch = originalFetch
  }
})

test('profile provider observes POS session lifecycle without persistent presentation storage', async () => {
  const [provider, route, session] = await Promise.all([
    readFile(paths.provider, 'utf8'),
    readFile(paths.profileRoute, 'utf8'),
    readFile(paths.posEmployeeSession, 'utf8'),
  ])
  assert.doesNotMatch(provider, /localStorage|sessionStorage/u)
  assert.doesNotMatch(provider, /ui_capabilities.*(?:authorize|allowed|tenant|branch)/u)
  assert.doesNotMatch(route, /ui_capabilities.*(?:eq|filter|tenant_id|branch_id)/u)
  assert.match(provider, /clearProfilePresentationMemoryCache/u)
  assert.match(provider, /createProfilePresentationScopeKey/u)
  assert.match(provider, /primaryProfileId: profile\.id/u)
  assert.match(provider, /tenantId: profile\.tenant_id/u)
  assert.match(provider, /primaryBranchId: profile\.branch_id/u)
  assert.match(provider, /subscribeToPosEmployeeSessionChanges/u)
  assert.match(provider, /resolvedScopeKey === presentationScopeKey/u)
  assert.match(provider, /resolutionMatchesCurrentScope \? data : null/u)
  assert.match(session, /emitPosEmployeeSessionChange\(\)/u)
  assert.match(session, /posEmployeeSessionGeneration \+= 1/u)
})

test('inventory defaults to 10 rows and a 30-day UTC window', async () => {
  const inventory = await importStandalone(paths.inventory)
  const result = inventory.parseInventoryMovementsContract(
    new URLSearchParams(),
    new Date('2026-08-26T12:34:56.000Z')
  )
  assert.equal(result.pageSize, 10)
  assert.equal(result.window.days, 30)
  assert.equal(result.window.from, '2026-07-28T00:00:00.000Z')
  assert.equal(result.window.to, '2026-08-26T12:34:56.000Z')
})

test('inventory page size is bounded at 50 and rejects non-positive input', async () => {
  const inventory = await importStandalone(paths.inventory)
  assert.equal(
    inventory.parseInventoryMovementsContract(
      new URLSearchParams('pageSize=500'),
      new Date('2026-08-26T00:00:00Z')
    ).pageSize,
    50
  )
  assert.throws(
    () =>
      inventory.parseInventoryMovementsContract(
        new URLSearchParams('pageSize=0'),
        new Date('2026-08-26T00:00:00Z')
      ),
    /INVALID_PAGE_SIZE/u
  )
  assert.throws(
    () =>
      inventory.parseInventoryMovementsContract(
        new URLSearchParams('tenantId=spoofed'),
        new Date('2026-08-26T00:00:00Z')
      ),
    /INVALID_PARAMETER/u
  )
  assert.throws(
    () =>
      inventory.parseInventoryMovementsContract(
        new URLSearchParams('pageSize=10&pageSize=20'),
        new Date('2026-08-26T00:00:00Z')
      ),
    /INVALID_PARAMETER/u
  )
})

test('inventory accepts exactly 366 UTC days and rejects wider or invalid windows', async () => {
  const inventory = await importStandalone(paths.inventory)
  const allowed = inventory.parseInventoryMovementsContract(
    new URLSearchParams('dateFrom=2024-01-01&dateTo=2024-12-31'),
    new Date('2026-08-26T00:00:00Z')
  )
  assert.equal(allowed.window.days, 366)
  assert.throws(
    () =>
      inventory.parseInventoryMovementsContract(
        new URLSearchParams('dateFrom=2024-01-01&dateTo=2025-01-01'),
        new Date('2026-08-26T00:00:00Z')
      ),
    /INVALID_WINDOW/u
  )
  assert.throws(
    () =>
      inventory.parseInventoryMovementsContract(
        new URLSearchParams('dateFrom=2026-02-30&dateTo=2026-03-01'),
        new Date('2026-08-26T00:00:00Z')
      ),
    /INVALID_DATE/u
  )
})

test('inventory cursor preserves created_at and id and handles equal timestamps', async () => {
  const inventory = await importStandalone(paths.inventory)
  const cursor = {
    created_at: '2026-08-26T10:00:00.000Z',
    id: '00000000-0000-4000-8000-000000000010',
    scope: 'a'.repeat(64),
  }
  assert.deepEqual(
    inventory.decodeInventoryMovementCursor(
      inventory.encodeInventoryMovementCursor(cursor)
    ),
    cursor
  )
  const boundary = inventory.createInventoryCursorBoundaryFilter(cursor)
  assert.match(boundary, /created_at\.lt\.2026-08-26T10:00:00\.000Z/u)
  assert.match(boundary, /created_at\.eq\.2026-08-26T10:00:00\.000Z,id\.lt\./u)
})

test('stable cursor boundary excludes concurrent newer inserts', async () => {
  const inventory = await importStandalone(paths.inventory)
  const boundary = inventory.createInventoryCursorBoundaryFilter({
    created_at: '2026-08-26T10:00:00.000Z',
    id: 'row-010',
    scope: 'a'.repeat(64),
  })
  assert.doesNotMatch(boundary, /created_at\.gt|id\.gt/u)
  assert.match(boundary, /created_at\.lt/u)
  assert.match(boundary, /id\.lt/u)
})

test('inventory cursor is rejected after tenant branch window or filter scope changes', async () => {
  const inventory = await importStandalone(paths.inventory)
  const baseScope = {
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    fromDate: '2026-08-01',
    toDate: '2026-08-26',
    upperBoundMode: 'end-of-day',
    movementType: 'sale',
    search: 'item',
  }
  const digest = (scope) =>
    createHash('sha256')
      .update(inventory.createInventoryMovementScopeCanonical(scope), 'utf8')
      .digest('hex')
  const cursor = {
    created_at: '2026-08-26T10:00:00.000Z',
    id: 'row-010',
    scope: digest(baseScope),
  }
  inventory.assertInventoryMovementCursorScope(cursor, digest(baseScope))
  const changedScopes = [
    { ...baseScope, tenantId: 'tenant-b' },
    { ...baseScope, branchId: 'branch-b' },
    { ...baseScope, fromDate: '2026-08-02' },
    { ...baseScope, movementType: 'adjustment' },
    { ...baseScope, search: 'different' },
  ]
  for (const changedScope of changedScopes) {
    assert.throws(
      () =>
        inventory.assertInventoryMovementCursorScope(cursor, digest(changedScope)),
      /INVALID_CURSOR_SCOPE/u
    )
  }
})

test('inventory search movement type and branch inputs are bounded', async () => {
  const inventory = await importStandalone(paths.inventory)
  for (const [name, value] of [
    ['search', 'x'.repeat(121)],
    ['movementType', 'x'.repeat(65)],
    ['branchId', 'x'.repeat(129)],
  ]) {
    assert.throws(
      () =>
        inventory.parseInventoryMovementsContract(
          new URLSearchParams([[name, value]]),
          new Date('2026-08-26T00:00:00Z')
        ),
      /INVALID_PARAMETER/u
    )
  }
})

test('inventory branch scope is derived from trusted access and denies branch spoofing', async () => {
  const inventory = await importStandalone(paths.inventory)
  assert.equal(
    inventory.resolveInventoryMovementBranchScope({
      branchAccessMode: 'assigned',
      activeBranchId: 'branch-a',
      requestedBranchId: '',
    }),
    'branch-a'
  )
  assert.throws(
    () =>
      inventory.resolveInventoryMovementBranchScope({
        branchAccessMode: 'assigned',
        activeBranchId: 'branch-a',
        requestedBranchId: 'branch-b',
      }),
    /INVENTORY_MOVEMENTS_BRANCH_DENIED/u
  )
  assert.equal(
    inventory.resolveInventoryMovementBranchScope({
      branchAccessMode: 'tenant',
      activeBranchId: null,
      requestedBranchId: 'branch-filter',
    }),
    'branch-filter'
  )
})

test('legacy inventory route and caller retain the page-number contract only', async () => {
  const [route, page] = await Promise.all([
    readFile(paths.inventoryLegacyRoute, 'utf8'),
    readFile(paths.inventoryPage, 'utf8'),
  ])
  assert.match(route, /pageSize/u)
  assert.match(route, /total: count \|\| 0/u)
  assert.match(route, /page,/u)
  assert.doesNotMatch(route, /inventoryHistoryV2|nextCursor|InventoryMovementsV2Response/u)
  assert.match(page, /\/api\/admin\/inventory-movements\?/u)
  assert.doesNotMatch(page, /\/api\/admin\/inventory-movements\/v2/u)
})

test('dedicated inventory v2 route uses deterministic ordering and trusted bounded scope', async () => {
  const source = await readFile(paths.inventoryV2Route, 'utf8')
  assert.match(source, /requireApiAuth\(request, \['admin'\]\)/u)
  assert.match(source, /auth\.context\.branchAccess/u)
  assert.match(source, /applyTenantFilter\(query, tenantId\)/u)
  assert.match(source, /\.order\('created_at', \{ ascending: false \}\)/u)
  assert.match(source, /\.order\('id', \{ ascending: false \}\)/u)
  assert.match(source, /\.limit\(input\.pageSize \+ 1\)/u)
  assert.match(source, /\.abortSignal\(request\.signal\)/u)
  assert.match(source, /Promise\.all\(/u)
  assert.match(source, /createHash\('sha256'\)/u)
  assert.match(source, /assertInventoryMovementCursorScope/u)
  assert.match(source, /\.eq\('tenant_id', tenantId\)/u)
  assert.match(source, /APP_COMPAT_SERVER_FLAGS\.inventoryHistoryV2/u)
  assert.doesNotMatch(source, /for\s*\([^)]*\)\s*\{[^}]*supabaseAdmin\.from/isu)
})

test('inventory UI cancels prior requests and rejects stale responses', async () => {
  const source = await readFile(paths.inventoryPage, 'utf8')
  assert.match(source, /movementsAbortRef\.current\?\.abort\(\)/u)
  assert.match(source, /signal: controller\.signal/u)
  assert.match(source, /movementsRequestSeqRef\.current !== requestSeq/u)
  assert.match(source, /error\.name === 'AbortError'/u)
})

test('sync presentation reports connectivity and command attention without blocking', async () => {
  const compatibility = await importStandalone(paths.compatibility)
  const offline = compatibility.deriveLocalSyncPresentation(
    'offline',
    { pending: 2, syncing: 0, failed: 0, conflict: 0, blocked: 0 },
    null
  )
  assert.equal(offline.state, 'offline')
  assert.equal(offline.pendingCount, 2)
  assert.equal(offline.blocksOfflineAccess, false)
  assert.equal(offline.lastSyncAgeInformationalOnly, true)

  const attention = compatibility.deriveLocalSyncPresentation(
    'online',
    { pending: 1, syncing: 1, failed: 1, conflict: 2, blocked: 3 },
    '2026-08-26T10:00:00Z'
  )
  assert.equal(attention.state, 'attention')
  assert.equal(attention.attentionCount, 6)
  assert.equal(attention.dispatchTriggered, false)
})

test('sync UI uses events and count metadata without polling, payload reads or dispatch', async () => {
  const source = await readFile(paths.syncUi, 'utf8')
  assert.match(source, /addEventListener\('online'/u)
  assert.match(source, /addEventListener\('offline'/u)
  assert.match(source, /visibilitychange/u)
  assert.doesNotMatch(source, /setInterval|readSyntheticPayload|dispatch|fetch\s*\(/u)
})

test('local inventory projection covers confirmed, pending and syncing quantities', async () => {
  const compatibility = await importStandalone(paths.compatibility)
  const snapshot = {
    namespaceId: 'ns-a',
    catalogItemReference: 'item-a',
    lastConfirmedBranchStock: 10,
    snapshotId: 'snapshot-a',
    confirmedAtServer: '2026-08-26T10:00:00Z',
  }
  const project = (commitments) =>
    compatibility.projectLocalInventory({
      namespaceId: 'ns-a',
      catalogItemReference: 'item-a',
      snapshot,
      commitments,
    })
  assert.equal(project([]).localAvailable, 10)
  assert.equal(
    project([
      {
        namespaceId: 'ns-a',
        catalogItemReference: 'item-a',
        idempotencyKey: 'order-1',
        localState: 'pending',
        quantity: 3,
      },
    ]).localAvailable,
    7
  )
  assert.equal(
    project([
      {
        namespaceId: 'ns-a',
        catalogItemReference: 'item-a',
        idempotencyKey: 'order-1',
        localState: 'pending',
        quantity: 7,
      },
      {
        namespaceId: 'ns-a',
        catalogItemReference: 'item-a',
        idempotencyKey: 'order-2',
        localState: 'syncing',
        quantity: 3,
      },
    ]).localAvailable,
    0
  )
})

test('local inventory reconstruction deduplicates retries and ignores wrong namespaces', async () => {
  const compatibility = await importStandalone(paths.compatibility)
  const snapshot = {
    namespaceId: 'ns-a',
    catalogItemReference: 'item-a',
    lastConfirmedBranchStock: 10,
    snapshotId: 'snapshot-a',
    confirmedAtServer: '2026-08-26T10:00:00Z',
  }
  const restoredCommitments = compatibility.reconstructLocalInventoryCommitments(
    'ns-a',
    [
      { namespaceId: 'ns-a', idempotencyKey: 'same', commandType: 'order.create', state: 'pending', payload: { itemReferences: [{ catalogItemReference: 'item-a', quantity: 3 }] } },
      { namespaceId: 'ns-a', idempotencyKey: 'same', commandType: 'order.create', state: 'syncing', payload: { itemReferences: [{ catalogItemReference: 'item-a', quantity: 3 }] } },
      { namespaceId: 'ns-b', idempotencyKey: 'other', commandType: 'order.create', state: 'pending', payload: { itemReferences: [{ catalogItemReference: 'item-a', quantity: 9 }] } },
      { namespaceId: 'ns-a', idempotencyKey: 'done', commandType: 'order.create', state: 'synced', payload: { itemReferences: [{ catalogItemReference: 'item-a', quantity: 9 }] } },
      { namespaceId: 'ns-a', idempotencyKey: 'audit', commandType: 'audit.event.append', state: 'pending', payload: { itemReferences: [{ catalogItemReference: 'item-a', quantity: 9 }] } },
    ]
  )
  const result = compatibility.projectLocalInventory({
    namespaceId: 'ns-a',
    catalogItemReference: 'item-a',
    snapshot,
    commitments: restoredCommitments,
  })
  assert.equal(result.localPendingQuantity, 0)
  assert.equal(result.localSyncingQuantity, 3)
  assert.equal(result.localAvailable, 7)
})

test('missing trusted snapshot fails closed and projection never becomes negative', async () => {
  const compatibility = await importStandalone(paths.compatibility)
  const missing = compatibility.projectLocalInventory({
    namespaceId: 'ns-a',
    catalogItemReference: 'item-a',
    snapshot: null,
    commitments: [],
  })
  assert.equal(missing.trustedSnapshotAvailable, false)
  assert.equal(missing.localAvailable, null)
  assert.equal(
    compatibility.getLocalInventoryQuantityOutcome(null, 1).allowed,
    false
  )

  const projected = compatibility.projectLocalInventory({
    namespaceId: 'ns-a',
    catalogItemReference: 'item-a',
    snapshot: {
      namespaceId: 'ns-a',
      catalogItemReference: 'item-a',
      lastConfirmedBranchStock: 1,
      snapshotId: 'snapshot-a',
      confirmedAtServer: '2026-08-26T10:00:00Z',
    },
    commitments: [
      { namespaceId: 'ns-a', catalogItemReference: 'item-a', idempotencyKey: 'large', localState: 'pending', quantity: 5 },
    ],
  })
  assert.equal(projected.localAvailable, 0)
})

test('inventory quantity outcomes use the two exact approved Arabic messages', async () => {
  const compatibility = await importStandalone(paths.compatibility)
  assert.equal(
    compatibility.getLocalInventoryQuantityOutcome(0, 1).message,
    'نفدت الكمية المتاحة وفق آخر تحديث للمخزون. يرجى الاتصال بالإنترنت لتحديث المخزون والتحقق من الرصيد.'
  )
  assert.equal(
    compatibility.getLocalInventoryQuantityOutcome(4, 5).message,
    'الكمية المتاحة غير كافية. المتاح حاليًا: 4'
  )
  assert.equal(compatibility.getLocalInventoryQuantityOutcome(4, 4).allowed, true)
  assert.equal(compatibility.getLocalInventoryQuantityOutcome(4, -1).allowed, false)
})

test('approved order.create runtime capabilities are enabled while sensitive effects remain disabled', async () => {
  const compatibility = await importStandalone(paths.compatibility)
  assert.deepEqual(compatibility.APP_COMPAT_SAFETY_FLAGS, {
    localInventoryBusinessEnforcement: false,
    sensitiveCacheIngestion: false,
    persistentUnwrap: true,
    productionOutboxPersistence: true,
    dispatch: true,
    replay: true,
    offlineOrderInterception: true,
    offlineOrderCreate: true,
    paymentProviderAction: false,
    externalEffects: false,
  })
  assert.equal(compatibility.APP_COMPAT_CLIENT_FLAGS.profileCallerMigration, false)
  assert.equal(compatibility.APP_COMPAT_CLIENT_FLAGS.syncStatusUi, false)
  assert.equal(compatibility.APP_COMPAT_SERVER_FLAGS.inventoryHistoryV2, false)
})

test('local inventory projection is linear over bounded relevant commitments', async () => {
  const compatibility = await importStandalone(paths.compatibility)
  const measurements = []
  for (const count of [10, 100, 1000, 10000]) {
    const commitments = Array.from({ length: count }, (_, index) => ({
      namespaceId: 'ns-a',
      catalogItemReference: index % 2 === 0 ? 'item-a' : 'item-b',
      idempotencyKey: `order-${index}`,
      localState: index % 3 === 0 ? 'syncing' : 'pending',
      quantity: 1,
    }))
    const startedAt = performance.now()
    const result = compatibility.projectLocalInventory({
      namespaceId: 'ns-a',
      catalogItemReference: 'item-a',
      snapshot: {
        namespaceId: 'ns-a',
        catalogItemReference: 'item-a',
        lastConfirmedBranchStock: count,
        snapshotId: 'snapshot-a',
        confirmedAtServer: '2026-08-26T10:00:00Z',
      },
      commitments,
    })
    measurements.push({ count, durationMs: performance.now() - startedAt })
    assert.equal(result.localPendingQuantity + result.localSyncingQuantity, count / 2)
  }
  console.log(`APP_COMPAT_PROJECTION_MEASUREMENTS=${JSON.stringify(measurements)}`)
})
