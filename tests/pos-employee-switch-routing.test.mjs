import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  resolveAuthenticatedPosEntryRoute,
  resolveProtectedPosRoute,
} from '../lib/pos-route-guard.ts'

const root = path.resolve('.')
const read = (relative) => readFile(path.join(root, relative), 'utf8')

test('authenticated prepared organization without an employee routes only to PIN', () => {
  assert.deepEqual(
    resolveProtectedPosRoute({
      authSettled: true,
      organizationAuthorized: true,
      offlineRecoveryReady: false,
      preparedDevice: true,
      explicitlyLoggedOut: false,
      requiresEmployee: true,
      employeeCheckReady: true,
      hasEmployeeActor: false,
    }),
    {
      route: '/pos/employee-pin',
      reason: 'employee-selection-required',
    }
  )
})

test('refresh recovery bypasses preparation for an already prepared device', () => {
  assert.deepEqual(
    resolveAuthenticatedPosEntryRoute({
      preparedDevice: true,
      explicitlyLoggedOut: false,
    }),
    {
      route: '/pos/employee-pin',
      reason: 'existing-loop-recovery',
    }
  )
})

test('first device still prepares and explicit organization logout stays at login', () => {
  assert.deepEqual(
    resolveAuthenticatedPosEntryRoute({
      preparedDevice: false,
      explicitlyLoggedOut: false,
    }),
    {
      route: '/pos/offline-preparation',
      reason: 'device-preparation-required',
    }
  )
  assert.equal(
    resolveAuthenticatedPosEntryRoute({
      preparedDevice: true,
      explicitlyLoggedOut: true,
    }),
    null
  )
})

test('switch lifecycle retains organization auth and never prepares or replaces a device', async () => {
  const employeeSession = await read('lib/pos-employee-session.ts')
  const switchStart = employeeSession.indexOf(
    'export async function switchPosEmployeeAndRequirePin'
  )
  const logoutStart = employeeSession.indexOf(
    'export async function endFullPosSessionAndRequireLogin'
  )
  const switchSource = employeeSession.slice(switchStart, logoutStart)

  assert.match(switchSource, /clearPosEmployeePlaintextCaches/u)
  assert.doesNotMatch(
    switchSource,
    /signOut|clearCurrentUserProfileCache|clearProtectedClientResources|offline-preparation|prepare|provision|replace|purgeExactNamespace/u
  )
  assert.match(employeeSession, /clearFullPosSessionPlaintextCaches/u)
})

test('switch UI cannot purge IndexedDB and uses one in-flight action', async () => {
  const dialog = await read('components/pos-logout-retention-dialog.tsx')
  assert.match(dialog, /actionInFlightRef\.current/u)
  assert.match(dialog, /intent === 'logout' && deleteCachedData/u)
  assert.match(dialog, /intent === 'logout' \? \(/u)
  assert.doesNotMatch(dialog, /indexedDB\.deleteDatabase|localStorage\.clear/u)
})

test('resource 401 has no navigation authority during employee relock', async () => {
  const settingsHook = await read('hooks/use-system-settings.ts')
  assert.match(settingsHook, /expectedPosActorRelock/u)
  assert.doesNotMatch(
    settingsHook,
    /window\.location\.(?:href|assign|replace)\s*=|router\.(?:push|replace)/u
  )
})

test('protected shell uses one route decision effect independent of checkout flags', async () => {
  const shell = await read('components/pos-shell-layout.tsx')
  assert.match(shell, /navigationInFlightRef/u)
  assert.match(shell, /resolveProtectedPosRoute/u)
  assert.match(shell, /subscribeToPosEmployeeSessionChanges/u)
  assert.doesNotMatch(
    shell,
    /OFFLINE_CAPABILITIES\.businessCommandDispatch[\s\S]{0,300}employee-pin/u
  )
})

test('transition diagnostics expose only reason and route', async () => {
  const guard = await read('lib/pos-route-guard.ts')
  const consoleStart = guard.indexOf("console.info('[POS route transition]'")
  const diagnostic = guard.slice(consoleStart, guard.indexOf('})', consoleStart) + 2)
  assert.match(diagnostic, /reason: decision\.reason/u)
  assert.match(diagnostic, /route: decision\.route/u)
  assert.doesNotMatch(
    diagnostic,
    /uuid|tenant|branch|device|employee|pin|token|key|hash|payload|customer/iu
  )
})

test('employee selection writes the new actor and clears stale resource denial', async () => {
  const [pinPage, employeeSession] = await Promise.all([
    read('app/pos/employee-pin/page.tsx'),
    read('lib/pos-employee-session.ts'),
  ])
  assert.match(pinPage, /writeActivePosEmployee\(selectedEmployee\)/u)
  assert.match(employeeSession, /resetProtectedResourceUnauthorized\(\)/u)
})

test('reconnect revokes the stale server actor then relocks to PIN without preparation', async () => {
  const employeeSession = await read('lib/pos-employee-session.ts')
  const flushStart = employeeSession.indexOf(
    'export async function flushPendingPosActorRevocation'
  )
  const flushEnd = employeeSession.indexOf('\n}', flushStart) + 2
  const flushSource = employeeSession.slice(flushStart, flushEnd)

  assert.match(
    flushSource,
    /await revokeCurrentPosActorSession\(\)[\s\S]*clearActivePosEmployee\(\)/u
  )
  assert.doesNotMatch(
    flushSource,
    /offline-preparation|prepare|provision|replace|signOut|indexedDB/u
  )
})
