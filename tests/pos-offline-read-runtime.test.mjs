import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')
const read = (relative) => readFile(path.join(root, relative), 'utf8')

test('airplane-mode cold reload is served by the real POS shell without API caching', async () => {
  const [worker, phase2] = await Promise.all([
    read('public/sw.js'),
    read('lib/offline/phase2.ts'),
  ])
  for (const route of [
    '/pos', '/pos/employee-pin', '/pos/sale/customer', '/pos/sale/items',
    '/pos/sale/checkout', '/pos/settings', '/pos/order-status',
    '/pos/order-history', '/pos/invoices',
  ]) assert.match(worker, new RegExp(`'${route.replaceAll('/', '\\/')}'`, 'u'))
  assert.match(phase2, /AFEX_POS_SERVICE_WORKER_SCOPE = '\/'/u)
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/u)
  assert.doesNotMatch(worker, /cache\.put\([^\n]*(?:api|customers|orders|runtime)/iu)
})

test('preparation installs every required dataset before the atomic completeness pivot and 100 percent', async () => {
  const runtime = await read('lib/offline/complete-runtime.ts')
  for (const dataset of [
    'applicationShell', 'employeeRoster', 'customers', 'customerSearch',
    'catalog', 'categories', 'variants', 'prices', 'discounts', 'vat',
    'branchInventory', 'posSettings', 'receiptSettings',
    'paymentConfiguration', 'recentOrders',
  ]) assert.match(runtime, new RegExp(`'${dataset}'|${dataset}:`, 'u'))
  const catalogWrite = runtime.search(/'catalog',\r?\n\s+snapshotVersion/u)
  const customerWrite = runtime.search(/'customers',\r?\n\s+snapshotVersion/u)
  const ordersWrite = runtime.search(/'orders',\r?\n\s+snapshotVersion/u)
  const settingsWrite = runtime.slice(ordersWrite).search(
    /'runtimeSettings',\r?\n\s+snapshotVersion/u
  ) + ordersWrite
  const pivotWrite = runtime.indexOf('putEncryptedDraftBatch', settingsWrite)
  const ready = runtime.indexOf("progress(100, 'اكتمل")
  assert.ok(catalogWrite >= 0 && customerWrite > catalogWrite && ordersWrite > customerWrite)
  assert.ok(settingsWrite > ordersWrite && pivotWrite > settingsWrite && ready > pivotWrite)
  assert.match(
    runtime.slice(pivotWrite, ready),
    /READ_COMPLETENESS_RECORD_KEY/u
  )
  assert.match(runtime, /OFFLINE_DURABLE_INTEGRITY_ATTESTATION_FAILED/u)
  assert.match(runtime, /const variants = catalogRows\.flatMap/u)
  assert.match(runtime, /installedVariants\.length !== completeness\.counts\.variants/u)
  assert.match(runtime, /fetchCompleteCatalogSnapshot/u)
  assert.match(runtime, /fetchCompleteRecentOrdersSnapshot/u)
  assert.match(runtime, /MAX_REQUIRED_READ_RECORDS = 10_000/u)
})

test('interrupted refresh retains the last complete version and corrupt or partial snapshots fail closed', async () => {
  const [runtime, phase2, phase1] = await Promise.all([
    read('lib/offline/complete-runtime.ts'),
    read('lib/offline/phase2.ts'),
    read('lib/offline/phase1.ts'),
  ])
  assert.match(runtime, /readInstalledReadCompleteness/u)
  assert.match(runtime, /retainedSnapshotVersions/u)
  assert.match(
    runtime,
    /putEncryptedDraftBatch\(material\.descriptor\.namespaceId,[\s\S]{0,1100}READ_COMPLETENESS_RECORD_KEY/u
  )
  assert.match(phase2, /retainSnapshotVersions/u)
  assert.match(phase2, /protectedVersions\.has\(obsolete\.snapshotVersion\)/u)
  assert.match(runtime, /OFFLINE_READ_COMPLETENESS_INVALID/u)
  assert.match(phase1, /OFFLINE_INTEGRITY_FAILED/u)
})

test('employee roster, local PIN and switching are encrypted, rate-limited and network independent', async () => {
  const [runtime, employee, phase1] = await Promise.all([
    read('lib/offline/complete-runtime.ts'),
    read('lib/pos-employee-session.ts'),
    read('lib/offline/phase1.ts'),
  ])
  assert.match(runtime, /value\.containsPlaintextPin !== false/u)
  assert.match(runtime, /PBKDF2/u)
  assert.match(runtime, /constantTimeHexEqual/u)
  assert.match(runtime, /PIN_ATTEMPT_RECORD_KEY/u)
  assert.match(runtime, /OFFLINE_PIN_MAX_ATTEMPTS/u)
  assert.match(runtime, /putEncryptedDraft/u)
  assert.match(employee, /navigator\.onLine === false/u)
  assert.match(employee, /POS_ACTOR_REVOCATION_PENDING_KEY/u)
  assert.match(phase1, /lockOfflineRuntime\('employee-switch'\)/u)
  assert.match(phase1, /afex:offline-runtime-locked/u)
  assert.match(runtime, /currentRuntime = null[\s\S]{0,100}currentReadCompleteness = null/u)
  assert.match(phase1, /primaryAuthRetained:\s*true/u)
  assert.doesNotMatch(employee, /supabase\.auth\.signOut[\s\S]{0,400}switchPosEmployeeAndRequirePin/u)
})

test('customer, catalog, settings and read-only order pages use validated local snapshots', async () => {
  const sources = await Promise.all([
    read('components/invoice-customer-step.tsx'),
    read('lib/invoices/catalog.ts'),
    read('hooks/use-system-settings.ts'),
    read('app/pos/order-status/page.tsx'),
    read('app/pos/order-history/page.tsx'),
    read('app/pos/invoices/page.tsx'),
  ]).then((parts) => parts.join('\n'))
  for (const reader of [
    'searchOfflineCustomers', 'readOfflineCustomerProfile',
    'readOfflineCatalogPage', 'readOfflineSystemSettings',
    'readOfflineOrderRecord', 'readOfflineOrderRecords',
  ]) assert.match(sources, new RegExp(reader, 'u'))
  assert.match(sources, /تحديث حالة الطلب يتطلب الاتصال/u)
  assert.match(sources, /shouldUseOfflineReadFallback/u)
  assert.match(
    await read('lib/offline/complete-runtime.ts'),
    /inventoryByCatalogItem[\s\S]{0,900}quantity_on_hand:\s*confirmedStock/u
  )
  const phase2 = await read('lib/offline/phase2.ts')
  assert.match(phase2, /customerReads:\s*true/u)
  assert.match(phase2, /orderInvoiceReads:\s*true/u)
  assert.match(phase2, /businessMutationDispatch:\s*false/u)
})

test('cart and totals remain local while checkout, payment and customer mutation are blocked Offline', async () => {
  const [hook, checkout, customer] = await Promise.all([
    read('hooks/use-invoice-checkout.ts'),
    read('app/pos/sale/checkout/page.tsx'),
    read('components/invoice-customer-step.tsx'),
  ])
  assert.match(hook, /إتمام البيع والدفع غير متاح/u)
  assert.doesNotMatch(hook, /resolveOfflineOrderCreatePilotCheckout/u)
  assert.match(checkout, /if \(isOffline\)[\s\S]{0,80}return false/u)
  assert.match(customer, /إضافة عميل جديد تتطلب اتصالًا بالإنترنت/u)
})

test('POS drafts avoid Local Storage and sensitive payloads are excluded from service-worker caches and logs', async () => {
  const [customer, items, checkout, worker] = await Promise.all([
    read('components/invoice-customer-step.tsx'),
    read('components/invoice-items-step.tsx'),
    read('hooks/use-invoice-checkout.ts'),
    read('public/sw.js'),
  ])
  assert.match(customer, /variant === 'pos' \? sessionStorage : localStorage/u)
  assert.match(items, /variant === 'pos' \? sessionStorage : localStorage/u)
  assert.match(checkout, /window\.sessionStorage/u)
  assert.match(worker, /AFEX_SENSITIVE_SHELL_MARKERS/u)
  assert.match(worker, /AFEX_OFFLINE_COORDINATION_V1/u)
  assert.doesNotMatch(
    await read('lib/offline/phase1.ts'),
    /localStorage\.setItem\([^)]*offline-control/iu
  )
  assert.doesNotMatch(worker, /console\.(?:log|warn|error)\(/u)
  const pinPage = await read('app/pos/employee-pin/page.tsx')
  assert.doesNotMatch(
    pinPage,
    /(?:branchId:\s*currentBranchId|employeeBranchId:|tenant_id:\s*authState|tenant_name:\s*authState|error:\s*typeof resultBody)/u
  )
})

test('two devices remain isolated by the existing namespace descriptor and never share local keys', async () => {
  const [phase1, runtime] = await Promise.all([
    read('lib/offline/phase1.ts'),
    read('lib/offline/complete-runtime.ts'),
  ])
  assert.match(phase1, /deviceCacheId/u)
  assert.match(runtime, /deviceCacheReference/u)
  assert.match(phase1, /namespaceId/u)
  assert.match(runtime, /material\.deviceId/u)
  assert.match(runtime, /allowCreate:\s*false/u)
  assert.doesNotMatch(runtime, /replace_offline_device_v1/u)
})

test('the finite read inventory maps every offline dependency and preserves W2 boundary', async () => {
  const inventory = JSON.parse(await read(
    'docs/investigations/AFEX-POS-OFFLINE-READ-RUNTIME-CLOSURE/OFFLINE-READ-DEPENDENCY-INVENTORY.json'
  ))
  assert.equal(inventory.dependencies.length, 10)
  assert.deepEqual(inventory.mandatoryNetworkReadsRemainingWhileOffline, [])
  assert.equal(inventory.offlineMutationBoundaries.orderCreate, 'disabled pending W2')
  assert.equal(inventory.offlineMutationBoundaries.providerEffects, 'disabled')
  for (const dependency of inventory.dependencies) {
    for (const key of ['onlineSource', 'localDatasetStore', 'snapshotPublisher', 'installer', 'offlineReader', 'uiConsumers']) {
      assert.ok(dependency[key])
    }
  }
})
