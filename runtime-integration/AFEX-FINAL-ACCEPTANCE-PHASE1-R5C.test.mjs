import assert from 'node:assert/strict'
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
