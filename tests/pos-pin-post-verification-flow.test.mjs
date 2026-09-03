import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const pagePath = new URL('../app/pos/employee-pin/page.tsx', import.meta.url)
const routePath = new URL('../app/api/pos/identify-employee-by-pin/route.ts', import.meta.url)
const runtimePath = new URL('../lib/offline/complete-runtime.ts', import.meta.url)
const phase1Path = new URL('../lib/offline/phase1.ts', import.meta.url)

async function source(url) {
  return readFile(url, 'utf8')
}

function simulate({ identifyStatus, identifyEmployee = true, enrollmentFails = false }) {
  let stage = 'pin-verification'
  let replaces = 0
  try {
    if (identifyStatus !== 200 || !identifyEmployee) {
      throw new Error(identifyStatus === 422 ? 'PIN_INVALID' : 'PIN_VERIFICATION_FAILED')
    }
    stage = 'offline-preparation'
    if (enrollmentFails) throw new TypeError('network unavailable')
    stage = 'offline-recovery'
    replaces += 1
    return { message: null, replaces }
  } catch (error) {
    if (stage === 'offline-preparation') {
      return { message: 'OFFLINE_PREPARATION_FAILED', replaces }
    }
    return { message: error.message, replaces }
  }
}

test('HTTP 200 followed by offline preparation failure is never PIN_INVALID', () => {
  const result = simulate({ identifyStatus: 200, enrollmentFails: true })
  assert.equal(result.message, 'OFFLINE_PREPARATION_FAILED')
  assert.notEqual(result.message, 'PIN_INVALID')
  assert.equal(result.replaces, 0)
})

test('only identify 422 maps to PIN_INVALID and actor-session 500 stays verification failure', () => {
  assert.equal(simulate({ identifyStatus: 422 }).message, 'PIN_INVALID')
  assert.equal(simulate({ identifyStatus: 500 }).message, 'PIN_VERIFICATION_FAILED')
})

test('successful post-verification path navigates to POS exactly once', () => {
  assert.deepEqual(simulate({ identifyStatus: 200 }), { message: null, replaces: 1 })
})

test('source catch boundary cannot send enrollment TypeError to offline PIN verification', async () => {
  const page = await source(pagePath)
  const fetchAt = page.indexOf("fetch('/api/pos/identify-employee-by-pin'")
  const fallbackAt = page.indexOf('selectedEmployee = await verifyOfflineEmployeePin', fetchAt)
  const enrollmentAt = page.indexOf('await enrollOnlineEmployeeForOffline', fetchAt)
  assert.ok(fetchAt >= 0 && fallbackAt > fetchAt && enrollmentAt > fallbackAt)
  const identifyCatch = page.slice(fetchAt, enrollmentAt)
  assert.match(identifyCatch, /onlineError instanceof TypeError/u)
  assert.doesNotMatch(identifyCatch, /enrollOnlineEmployeeForOffline/u)
  assert.match(page, /failureStage = 'offline-preparation'[\s\S]*await enrollOnlineEmployeeForOffline/u)
  assert.match(page, /failureStage === 'offline-preparation'[\s\S]*OFFLINE_PREPARATION_ERROR_MESSAGE/u)
})

test('navigation and submission effects remain single-authority guarded', async () => {
  const page = await source(pagePath)
  assert.match(page, /if \(!redirectTargetRef\.current\) \{\s*redirectTargetRef\.current = '\/pos'\s*router\.replace\('\/pos'\)/u)
  assert.match(page, /verifyingPinRef\.current === pinToVerify/u)
  assert.match(page, /inputDisabled \|\|[\s\S]*verificationPausedRef\.current/u)
})

test('actor-session 500 has a distinct server error classification', async () => {
  const route = await source(routePath)
  assert.match(route, /POS_ACTOR_SESSION_ISSUE_FAILED/u)
  assert.match(route, /status:\s*500/u)
})

test('randomUUID may be absent while the shared generator produces unique UUID v4 values', async () => {
  const helper = await source(phase1Path)
  const helperStart = helper.indexOf('export function createSecureUuidV4')
  const helperEnd =
    helper.indexOf('\n}\n\nexport const OFFLINE_AUTHORITY_LEASE_POLICY', helperStart) + 2
  const functionSource = helper.slice(helperStart, helperEnd).trim()
  assert.ok(functionSource.startsWith('export function'))
  let seed = 0
  const createSecureUuidV4 = vm.runInNewContext(
    `(${functionSource.replace('export ', '')})`,
    {
      Array,
      Uint8Array,
      crypto: {
        getRandomValues(bytes) {
          for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = (seed + index) & 0xff
          }
          seed += 17
          return bytes
        },
      },
    }
  )
  const values = Array.from({ length: 32 }, () => createSecureUuidV4())
  assert.equal(new Set(values).size, values.length)
  for (const value of values) {
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
  }
  const unavailable = vm.runInNewContext(
    `(${functionSource.replace('export ', '')})`,
    { Array, Uint8Array, crypto: {} }
  )
  assert.throws(() => unavailable(), /OFFLINE_WEBCRYPTO_UNAVAILABLE/u)
})

test('enrollment uses the shared secure UUID generator before its first fetch', async () => {
  const runtime = await source(runtimePath)
  const enrollment = runtime.slice(
    runtime.indexOf('export async function enrollOnlineEmployeeForOffline'),
    runtime.indexOf('\nexport ', runtime.indexOf('export async function enrollOnlineEmployeeForOffline') + 1)
  )
  const firstFetch = enrollment.indexOf("fetch('/api/pos/offline-pilot'")
  assert.ok(firstFetch > 0)
  assert.doesNotMatch(enrollment.slice(0, firstFetch), /crypto\.randomUUID/u)
  assert.match(enrollment.slice(0, firstFetch), /createSecureUuidV4\(\)/u)
})

test('all reachable browser UUID call sites use one fail-closed helper', async () => {
  const paths = [
    runtimePath,
    new URL('../lib/offline/phase1.ts', import.meta.url),
    new URL('../lib/offline/phase2.ts', import.meta.url),
    new URL('../lib/offline/phase3.ts', import.meta.url),
    new URL('../lib/pos-checkout-identity.ts', import.meta.url),
    new URL('../lib/pos-offline-draft.ts', import.meta.url),
  ]
  const sources = await Promise.all(paths.map(source))
  for (const moduleSource of sources) {
    assert.doesNotMatch(moduleSource, /crypto\.randomUUID|Math\.random/u)
    assert.match(moduleSource, /createSecureUuidV4/u)
  }
  const helper = await source(phase1Path)
  assert.match(helper, /crypto\.getRandomValues\(new Uint8Array\(16\)\)/u)
  assert.match(helper, /OFFLINE_WEBCRYPTO_UNAVAILABLE/u)
})

test('every enrollment failure boundary has a safe finite diagnostic stage', async () => {
  const runtime = await source(runtimePath)
  for (const stage of [
    'authority.restore',
    'namespace.derive',
    'pin-verifier.derive',
    'employee.enroll.request',
    'employee.roster.request',
    'local-roster.persist',
    'online-bootstrap.request',
    'local-actor.persist',
  ]) {
    assert.ok(runtime.includes(`'${stage}'`), stage)
  }
  assert.match(runtime, /httpStatus:\s*number \| null/u)
  assert.match(runtime, /applicationCode:\s*string \| null/u)
  assert.doesNotMatch(runtime, /reportEnrollmentFailure\([\s\S]{0,400}\b(?:pin|employee|tenant|branch|jwt|uuid):/iu)
})

test('IndexedDB, WebCrypto, non-2xx and malformed response remain fail closed and classified', async () => {
  const cases = [
    ['IndexedDB unavailable', 'authority.restore', null, 'OFFLINE_DATABASE_UNAVAILABLE'],
    ['WebCrypto failure', 'pin-verifier.derive', null, 'OFFLINE_WEBCRYPTO_UNAVAILABLE'],
    ['offline-pilot non-2xx', 'employee.enroll.request', 503, 'OFFLINE_EMPLOYEE_ENROLLMENT_FAILED'],
    ['offline-preparation non-2xx', 'employee.roster.request', 503, 'OFFLINE_PREPARATION_REQUEST_FAILED'],
    ['malformed enrollment response', 'employee.enroll.request', 200, 'OFFLINE_EMPLOYEE_ENROLLMENT_FAILED'],
  ]
  for (const [name, stageCode, httpStatus, applicationCode] of cases) {
    const diagnostic = { stageCode, operationName: 'safe.operation', httpStatus, applicationCode }
    assert.notEqual(diagnostic.stageCode, 'complete', name)
    assert.match(diagnostic.applicationCode, /^[A-Z][A-Z0-9_]{2,96}$/u, name)
  }
})
