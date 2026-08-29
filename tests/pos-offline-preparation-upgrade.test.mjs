import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')
const read = (relative) => readFile(path.join(root, relative), 'utf8')

test('35 percent is the completed device boundary followed by employee roster', async () => {
  const runtime = await read('lib/offline/complete-runtime.ts')
  const deviceComplete = runtime.indexOf(
    "progress(35, 'تم تسجيل الجهاز المُدار والتحقق منه')"
  )
  const rosterRequest = runtime.indexOf(
    "postPreparation('employee.roster'",
    deviceComplete
  )
  const snapshotRequest = runtime.indexOf(
    'await fetchRequiredReadDatasets(context)',
    rosterRequest
  )
  assert.ok(deviceComplete > 0)
  assert.ok(rosterRequest > deviceComplete)
  assert.ok(snapshotRequest > rosterRequest)
  assert.equal(
    (runtime.match(/fetch\(`\/api\/pos\/offline-read-snapshot\?branchId=/gu) ?? [])
      .length,
    1
  )
})

test('the live roster contract may be empty and the client resumes through enrollment instead of claiming readiness', async () => {
  const [runtime, sql, page, pinPage] = await Promise.all([
    read('lib/offline/complete-runtime.ts'),
    read(
      'docs/investigations/AFEX-POS-OFFLINE-PRE-PIN-PROVISIONING-V2/01-ADD-PRE-PIN-PROVISIONING-V2.sql'
    ),
    read('app/pos/offline-preparation/page.tsx'),
    read('app/pos/employee-pin/page.tsx'),
  ])
  assert.doesNotMatch(sql, /employee_count\s*<\s*1/iu)
  assert.match(runtime, /requireEnrolledEmployee:\s*false/u)
  assert.match(runtime, /if \(roster\.length < 1\)/u)
  assert.match(runtime, /persistPendingPreparationCheckpoint/u)
  assert.match(runtime, /OFFLINE_EMPLOYEE_ENROLLMENT_REQUIRED/u)
  assert.ok(
    runtime.indexOf('if (roster.length < 1)') <
      runtime.indexOf('fetchRequiredReadDatasets(context)')
  )
  assert.match(page, /OFFLINE_EMPLOYEE_ENROLLMENT_REQUIRED/u)
  assert.match(page, /router\.replace\('\/pos\/employee-pin'\)/u)
  assert.match(pinPage, /enrollment\.preparationResumeRequired/u)
  assert.match(pinPage, /router\.replace\('\/pos\/offline-preparation'\)/u)
})

test('existing W1 IndexedDB material is restored and checkpoint recovery cannot create a replacement device', async () => {
  const [runtime, phase1] = await Promise.all([
    read('lib/offline/complete-runtime.ts'),
    read('lib/offline/phase1.ts'),
  ])
  assert.match(phase1, /OFFLINE_DATABASE_VERSION = 3/u)
  assert.match(runtime, /PREPARATION_CHECKPOINT_RECORD_KEY/u)
  assert.match(runtime, /OFFLINE_STORES\.drafts/u)
  assert.match(
    runtime,
    /restorePendingPreparationCheckpoint[\s\S]*loadOrCreateRuntimeMaterial\(existing\.material\.context, \{[\s\S]*allowCreate: false/u
  )
  const restoreStart = runtime.indexOf(
    'async function restorePendingPreparationCheckpoint'
  )
  const restoreEnd = runtime.indexOf(
    'async function employeeEnrollmentAuthority',
    restoreStart
  )
  const restoreSource = runtime.slice(restoreStart, restoreEnd)
  assert.doesNotMatch(
    restoreSource,
    /createRuntimeMaterial|crypto\.randomUUID\(\)/u
  )
})

test('interrupted enrollment retry preserves material and completes snapshot only after roster attestation', async () => {
  const runtime = await read('lib/offline/complete-runtime.ts')
  assert.match(runtime, /state: 'employee-enrollment-required'/u)
  assert.match(runtime, /source: 'preparation-checkpoint'/u)
  assert.match(runtime, /preparationResumeRequired: true/u)
  assert.match(runtime, /pre-pin-employee-roster-resume/u)
  const enrollmentGate = runtime.indexOf('if (roster.length < 1)')
  const snapshotFetch = runtime.indexOf('await fetchRequiredReadDatasets(context)')
  assert.ok(enrollmentGate > 0 && snapshotFetch > enrollmentGate)
})

test('safe Preview diagnostics contain only bounded operational metadata', async () => {
  const [runtime, server] = await Promise.all([
    read('lib/offline/complete-runtime.ts'),
    read('lib/server/offline/pre-pin-provisioning.ts'),
  ])
  assert.match(runtime, /schemaVersion: OFFLINE_DATABASE_VERSION/u)
  assert.match(runtime, /serviceWorkerState/u)
  assert.match(runtime, /runtimeMaterialState/u)
  assert.match(server, /AFEX_OFFLINE_PREPARATION_CLIENT_DIAGNOSTIC/u)
  assert.match(server, /process\.env\.VERCEL_ENV !== 'preview'/u)
  const logStart = server.indexOf(
    "event: 'AFEX_OFFLINE_PREPARATION_CLIENT_DIAGNOSTIC'"
  )
  const logEnd = server.indexOf('providerActions: 0', logStart)
  const logSource = server.slice(logStart, logEnd)
  assert.doesNotMatch(
    logSource,
    /uuid|tenant|branch|deviceId|employeeId|pin|verifier|token|key|hash|payload|customer/iu
  )
})

test('old Service Worker control is replaced by an attested current protocol before shell installation', async () => {
  const [phase2, worker] = await Promise.all([
    read('lib/offline/phase2.ts'),
    read('public/sw.js'),
  ])
  assert.match(phase2, /AFEX_SERVICE_WORKER_PROTOCOL_VERSION = 3/u)
  assert.match(phase2, /readAfexWorkerProtocol/u)
  assert.match(phase2, /navigator\.serviceWorker\.controller/u)
  assert.match(phase2, /waitForCurrentAfexWorker/u)
  assert.match(worker, /AFEX_SHELL_STATUS_V3/u)
  assert.match(worker, /afex-pos-shell-v4/u)
  assert.match(worker, /self\.clients\.claim\(\)/u)
})

test('fresh installation and resumed preparation keep external effects and offline checkout disabled', async () => {
  const [runtime, compat, checkout] = await Promise.all([
    read('lib/offline/complete-runtime.ts'),
    read('lib/offline/application-compatibility.ts'),
    read('hooks/use-invoice-checkout.ts'),
  ])
  assert.match(runtime, /runtimeMaterialState = 'created'/u)
  assert.match(runtime, /runtimeMaterialState = 'restored'/u)
  assert.match(compat, /externalEffects:\s*false/u)
  assert.match(compat, /paymentProviderAction:\s*false/u)
  assert.match(checkout, /إتمام البيع والدفع غير متاح/u)
})
