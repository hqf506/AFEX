import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  assessActorSessionIssueResult,
  PosActorSessionIssueError,
} from '../lib/pos-actor-session-issue.ts'

const validRow = {
  session_id: 'session',
  expires_at: '2026-08-15T18:00:00.000Z',
  actor_id: 'actor',
  tenant_id: 'tenant',
  branch_id: 'branch',
  actor_role: 'cashier',
}

const pinRoute = readFileSync(
  'app/api/pos/identify-employee-by-pin/route.ts',
  'utf8'
)
const pinPage = readFileSync('app/pos/employee-pin/page.tsx', 'utf8')

test('classifies PostgREST transport errors without raw diagnostics', () => {
  const result = assessActorSessionIssueResult(null, {
    code: 'PGRST202',
    message: 'must never be retained',
    details: 'must never be retained',
    status: 404,
  })
  assert.deepEqual(result, {
    classification: 'RPC_TRANSPORT_ERROR',
    codeCategory: 'PGRST202',
    httpStatus: 404,
    rowCountClassification: 'ZERO',
    row: null,
  })
  assert.equal(JSON.stringify(result).includes('must never be retained'), false)
})

test('classifies database errors by closed SQLSTATE class', () => {
  const result = assessActorSessionIssueResult(null, { code: '42501' })
  assert.equal(result.classification, 'RPC_DATABASE_ERROR')
  assert.equal(result.codeCategory, 'SQLSTATE_42')
})

test('classifies empty, multiple and malformed results separately', () => {
  assert.equal(
    assessActorSessionIssueResult([], null).classification,
    'RPC_EMPTY_RESULT'
  )
  assert.equal(
    assessActorSessionIssueResult([validRow, validRow], null).classification,
    'RPC_MULTIPLE_ROWS'
  )
  assert.equal(
    assessActorSessionIssueResult([{ session_id: 'only-one-field' }], null)
      .classification,
    'RPC_CONTRACT_INVALID'
  )
})

test('accepts exactly one complete result', () => {
  const result = assessActorSessionIssueResult([validRow], null)
  assert.equal(result.classification, 'ACTOR_SESSION_ISSUED')
  assert.equal(result.rowCountClassification, 'ONE')
})

test('typed failure cannot degrade to undefined', () => {
  const assessment = assessActorSessionIssueResult([], null)
  const error = new PosActorSessionIssueError(assessment)
  assert.equal(error.message, 'RPC_EMPTY_RESULT')
  assert.equal(error.assessment.classification, 'RPC_EMPTY_RESULT')
  assert.notEqual(error.message, undefined)
})

test('PIN success remains a single issued-session response', () => {
  assert.match(pinRoute, /classification: 'ACTOR_SESSION_ISSUED'/)
  assert.match(pinRoute, /rowCountClassification: 'ONE'/)
  assert.match(pinRoute, /response\.cookies\.set\(/)
})

test('invalid PIN returns a closed public code, Arabic message and support reference', () => {
  assert.match(pinRoute, /errorCode: 'PIN_INVALID'/)
  assert.match(pinRoute, /message: PIN_BRANCH_MISMATCH_MESSAGE/)
  assert.match(pinRoute, /reference = createSupportReference\(\)/)
  assert.match(pinPage, /getClientErrorMessage\(result, INVALID_PIN_MESSAGE\)/)
  assert.match(pinPage, /\{error\}/)
})

test('verification RPC failure returns a closed public response', () => {
  assert.match(pinRoute, /errorCode: 'PIN_VERIFICATION_FAILED'/)
  assert.match(pinRoute, /message: PIN_INTERNAL_ERROR_MESSAGE/)
})

test('empty and malformed issuance results have distinct closed classifications', () => {
  assert.equal(
    assessActorSessionIssueResult([], null).classification,
    'RPC_EMPTY_RESULT'
  )
  assert.equal(
    assessActorSessionIssueResult([{ session_id: 'malformed' }], null)
      .classification,
    'RPC_CONTRACT_INVALID'
  )
  assert.match(pinRoute, /errorCode: 'POS_ACTOR_SESSION_ISSUE_FAILED'/)
})

test('issuance failure log is allowlisted and never includes protected fields', () => {
  const start = pinRoute.indexOf("console.error('[POS actor session issuance failure]'")
  const end = pinRoute.indexOf('const response = pinFailureResponse', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const logBlock = pinRoute.slice(start, end)
  for (const allowed of [
    'reference',
    'POS_ACTOR_SESSION_ISSUE',
    'classification',
    'upstreamCodeCategory',
    'httpCategory',
    'rowCountClassification',
    'safeRequestCorrelation',
  ]) {
    assert.match(logBlock, new RegExp(allowed))
  }
  for (const forbidden of [
    'pin',
    'password',
    'email',
    'actorId',
    'customerId',
    'tenantId',
    'branchId',
    'token',
    'cookie',
    'jwt',
    'payload',
    'message',
    'details',
    'exception',
    'stack',
  ]) {
    assert.doesNotMatch(logBlock, new RegExp(forbidden, 'i'))
  }
})
