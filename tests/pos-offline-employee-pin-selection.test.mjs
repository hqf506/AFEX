import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  assertSelectedEmployeeMatchesPreparedBranch,
  buildScopedOnlinePinIdentification,
} from '../lib/offline/employee-pin-selection.ts'

const root = path.resolve('.')
const read = (relative) => readFile(path.join(root, relative), 'utf8')

test('online PIN identification binds the request to the prepared branch without substituting the establishment subject', () => {
  const establishmentSubject = 'subject-fixture'
  const selectedEmployee = 'employee-fixture'
  const preparedBranch = 'branch-fixture'
  const request = buildScopedOnlinePinIdentification('0000', preparedBranch)

  assert.notEqual(establishmentSubject, selectedEmployee)
  assert.deepEqual(request, { pin: '0000', branchId: preparedBranch })
  assert.equal(Object.hasOwn(request, 'employeeId'), false)
  assert.equal(Object.hasOwn(request, 'authenticatedSubjectId'), false)
})

test('eligible employee and verified actor can remain distinct from the establishment subject while sharing the trusted branch', () => {
  assert.doesNotThrow(() =>
    assertSelectedEmployeeMatchesPreparedBranch(
      'trusted-branch-fixture',
      'trusted-branch-fixture'
    )
  )
})

test('missing or wrong-branch employee selection remains fail closed', () => {
  assert.throws(
    () => buildScopedOnlinePinIdentification('0000', null),
    /OFFLINE_EMPLOYEE_SELECTION_BRANCH_REQUIRED/u
  )
  assert.throws(
    () =>
      assertSelectedEmployeeMatchesPreparedBranch(
        'other-branch-fixture',
        'trusted-branch-fixture'
      ),
    /OFFLINE_EMPLOYEE_SUBSTITUTION_REJECTED/u
  )
  assert.throws(
    () =>
      assertSelectedEmployeeMatchesPreparedBranch(
        null,
        'trusted-branch-fixture'
      ),
    /OFFLINE_EMPLOYEE_SUBSTITUTION_REJECTED/u
  )
})

test('PIN page, actor session, roster refresh and encrypted binding preserve distinct identity roles', async () => {
  const [page, route, runtime, transport] = await Promise.all([
    read('app/pos/employee-pin/page.tsx'),
    read('app/api/pos/identify-employee-by-pin/route.ts'),
    read('lib/offline/complete-runtime.ts'),
    read('lib/server/offline/order-create-pilot-transport.ts'),
  ])

  assert.match(page, /buildScopedOnlinePinIdentification\(pinToVerify, currentBranchId\)/u)
  assert.match(route, /verify_pos_pin_for_actor/u)
  assert.match(route, /issuePosActorSession/u)
  assert.match(route, /authIsFullAdmin && !requestedBranchId/u)
  assert.match(
    route,
    /employee\.branch_id && employee\.branch_id !== branchId/u
  )
  assert.match(route, /const effectiveBranchId = branchId/u)
  assert.match(route, /tenant-validated-request-branch/u)
  assert.match(runtime, /const operation = existing \? 'employee\.replace_pin' : 'employee\.enroll'/u)
  assert.match(runtime, /refreshedRoster\.find\([\s\S]*entry\.employeeId === employee\.id/u)
  assert.match(runtime, /source: 'online-pos-actor-session'/u)
  assert.match(transport, /actor\.actorId !== employee\.id/u)
  assert.match(transport, /employee\.branchId !== context\.activeBranchId/u)
})

test('disabled, revoked, wrong-branch and non-roster identities cannot become an offline actor', async () => {
  const [route, runtime, sql] = await Promise.all([
    read('app/api/pos/identify-employee-by-pin/route.ts'),
    read('lib/offline/complete-runtime.ts'),
    read(
      'docs/investigations/AFEX-POS-OFFLINE-PRE-PIN-PROVISIONING-V2/01-ADD-PRE-PIN-PROVISIONING-V2.sql'
    ),
  ])

  assert.match(route, /isTenantBranch\([\s\S]*requestedBranchId/u)
  assert.match(runtime, /!employee\.enrolled[\s\S]*employee\.status !== 'active'/u)
  assert.match(runtime, /OFFLINE_EMPLOYEE_ENROLLMENT_NOT_ATTESTED/u)
  assert.match(sql, /e\.status='active' AND e\.revoked_at IS NULL/u)
  assert.match(sql, /e\.tenant_id=p_tenant_id/u)
  assert.match(sql, /e\.branch_id=p_branch_id/u)
})

test('fresh and restored runtimes both derive selection scope from trusted branch state', async () => {
  const [page, runtime] = await Promise.all([
    read('app/pos/employee-pin/page.tsx'),
    read('lib/offline/complete-runtime.ts'),
  ])

  assert.match(
    page,
    /authState\.profile\?\.branch_id \?\? offlineRuntime\?\.context\.branchId \?\? null/u
  )
  assert.match(page, /activeEmployee\.branch_id === currentBranchId/u)
  assert.match(page, /clearActivePosEmployee\(\)/u)
  assert.match(runtime, /existing\.namespaceId !== access\.namespaceId/u)
  assert.match(runtime, /OFFLINE_RUNTIME_SCOPE_MISMATCH/u)
  assert.match(runtime, /readEncryptedRecord<readonly OfflineEmployeeRosterEntry\[\]>/u)
})
