import { deepFreeze } from './A2.5-POOLDRIVER-FAKE-DRIVER.mjs';

const definitions = [
  ['Successful commit then normal release', 'A25-PD-001', ['BEGIN_OK', 'QUERY_OK', 'COMMIT_START', 'COMMIT_OK', 'SANITATION_PASS', 'RELEASE_NORMAL'], [], 'RELEASED', 'NORMAL', null, 'PASS'],
  ['Explicit rollback then normal release', 'A25-PD-002', ['BEGIN_OK', 'ROLLBACK_START', 'ROLLBACK_OK', 'SANITATION_PASS', 'RELEASE_NORMAL'], [], 'RELEASED', 'NORMAL', null, 'PASS'],
  ['Query failure then rollback then normal release', 'A25-PD-003', ['BEGIN_OK', 'QUERY_FAIL', 'ROLLBACK_START', 'ROLLBACK_OK', 'SANITATION_PASS', 'RELEASE_NORMAL'], ['QUERY_FAIL'], 'RELEASED', 'NORMAL', 'QUERY_FAILED', 'PASS'],
  ['Query failure with rollback failure then destroy', 'A25-PD-004', ['BEGIN_OK', 'QUERY_FAIL', 'ROLLBACK_START', 'ROLLBACK_FAIL', 'RELEASE_DESTROY'], ['QUERY_FAIL', 'ROLLBACK_FAIL'], 'DESTROYED', 'DESTROY', 'ROLLBACK_FAILED', 'PASS'],
  ['Commit failure then rollback then normal release', 'A25-PD-005', ['BEGIN_OK', 'COMMIT_START', 'COMMIT_FAIL', 'ROLLBACK_OK', 'SANITATION_PASS', 'RELEASE_NORMAL'], ['COMMIT_FAIL'], 'RELEASED', 'NORMAL', 'COMMIT_FAILED', 'PASS'],
  ['Commit failure with rollback failure then destroy', 'A25-PD-006', ['BEGIN_OK', 'COMMIT_START', 'COMMIT_FAIL', 'ROLLBACK_FAIL', 'RELEASE_DESTROY'], ['COMMIT_FAIL', 'ROLLBACK_FAIL'], 'DESTROYED', 'DESTROY', 'ROLLBACK_FAILED', 'PASS'],
  ['Database timeout then rollback then normal release', 'A25-PD-007', ['BEGIN_OK', 'TIMEOUT_DATABASE', 'ROLLBACK_OK', 'SANITATION_PASS', 'RELEASE_NORMAL'], ['DATABASE_TIMEOUT'], 'RELEASED', 'NORMAL', 'DATABASE_TIMEOUT', 'PASS'],
  ['Client timeout with unresolved query then destroy', 'A25-PD-008', ['BEGIN_OK', 'TIMEOUT_CLIENT', 'RELEASE_DESTROY'], ['CLIENT_TIMEOUT'], 'DESTROYED', 'DESTROY', 'TIMEOUT_CLIENT_UNRESOLVED', 'PASS'],
  ['Cancellation settles and rollback proven then normal release', 'A25-PD-009', ['BEGIN_OK', 'CANCEL_START', 'CANCEL_SETTLED', 'ROLLBACK_OK', 'SANITATION_PASS', 'RELEASE_NORMAL'], [], 'RELEASED', 'NORMAL', 'CANCEL_SETTLED', 'PASS'],
  ['Cancellation failure then destroy', 'A25-PD-010', ['BEGIN_OK', 'CANCEL_START', 'CANCEL_FAILED', 'RELEASE_DESTROY'], ['CANCEL_FAIL'], 'DESTROYED', 'DESTROY', 'CANCEL_STATE_UNRESOLVED', 'PASS'],
  ['Cancellation settles dirty then destroy', 'A25-PD-011', ['BEGIN_OK', 'CANCEL_START', 'CANCEL_SETTLED', 'SANITATION_FAIL', 'RELEASE_DESTROY'], ['CANCEL_SETTLES_DIRTY'], 'DESTROYED', 'DESTROY', 'SANITATION_FAILED', 'PASS'],
  ['Socket error then destroy', 'A25-PD-012', ['BEGIN_OK', 'SOCKET_ERROR', 'RELEASE_DESTROY'], ['SOCKET_ERROR'], 'DESTROYED', 'DESTROY', 'SOCKET_ERROR', 'PASS'],
  ['Protocol error then destroy', 'A25-PD-013', ['BEGIN_OK', 'PROTOCOL_ERROR', 'RELEASE_DESTROY'], ['PROTOCOL_ERROR'], 'DESTROYED', 'DESTROY', 'PROTOCOL_ERROR', 'PASS'],
  ['Identity match then continue', 'A25-PD-014', ['IDENTITY_MATCH', 'BEGIN_OK'], [], 'TRANSACTION_ACTIVE', 'NONE', null, 'PASS'],
  ['Identity mismatch then destroy', 'A25-PD-015', ['IDENTITY_MISMATCH', 'RELEASE_DESTROY'], ['IDENTITY_MISMATCH'], 'DESTROYED', 'DESTROY', 'IDENTITY_MISMATCH', 'PASS'],
  ['Sanitation pass after rollback', 'A25-PD-016', ['BEGIN_OK', 'ROLLBACK_START', 'ROLLBACK_OK', 'SANITATION_PASS'], [], 'ROLLED_BACK', 'NONE', null, 'PASS'],
  ['Sanitation failure then destroy', 'A25-PD-017', ['BEGIN_OK', 'ROLLBACK_START', 'ROLLBACK_OK', 'SANITATION_FAIL', 'RELEASE_DESTROY'], ['SANITATION_FAIL'], 'DESTROYED', 'DESTROY', 'SANITATION_FAILED', 'PASS'],
  ['Normal release attempted during active transaction', 'A25-PD-018', ['BEGIN_OK', 'RELEASE_NORMAL'], [], 'TRANSACTION_ACTIVE', 'REJECT', 'RELEASE_STATE_INVALID', 'PASS'],
  ['Normal release attempted from UNKNOWN', 'A25-PD-019', ['RELEASE_NORMAL'], [], 'UNKNOWN', 'REJECT', 'RELEASE_STATE_INVALID', 'PASS'],
  ['Double release', 'A25-PD-020', ['RELEASE_NORMAL', 'RELEASE_NORMAL'], [], 'RELEASED', 'REJECT', 'CLIENT_ALREADY_RELEASED', 'PASS'],
  ['Query after release', 'A25-PD-021', ['RELEASE_NORMAL', 'QUERY_OK'], [], 'RELEASED', 'REJECT', 'CLIENT_ALREADY_RELEASED', 'PASS'],
  ['Query after destroy', 'A25-PD-022', ['RELEASE_DESTROY', 'QUERY_OK'], [], 'DESTROYED', 'REJECT', 'CLIENT_ALREADY_DESTROYED', 'PASS'],
  ['Resurrect released client attempt', 'A25-PD-023', ['RELEASE_NORMAL', 'BEGIN_OK'], [], 'RELEASED', 'REJECT', 'TERMINAL_STATE_RESURRECTION_REJECTED', 'PASS'],
  ['Resurrect destroyed client attempt', 'A25-PD-023', ['RELEASE_DESTROY', 'BEGIN_OK'], [], 'DESTROYED', 'REJECT', 'TERMINAL_STATE_RESURRECTION_REJECTED', 'PASS'],
  ['Pool max=1 deterministic reuse', 'A25-PD-001', [], [], 'RELEASED', 'NORMAL', null, 'PASS'],
  ['Pool max=2 checkout ordering', 'A25-PD-001', [], [], 'CHECKED_OUT', 'NONE', null, 'PASS'],
  ['Destroyed client is never reacquired', 'A25-PD-001', [], [], 'DESTROYED', 'DESTROY', null, 'PASS'],
  ['Borrower B receives no Borrower A contamination', 'A25-PD-001', [], [], 'CHECKED_OUT', 'NORMAL', null, 'PASS'],
  ['Invalid timeout ordering', 'A25-PD-001', [], [], 'CHECKED_OUT', 'REJECT', 'TIMEOUT_CONFIGURATION_INVALID', 'PASS'],
  ['Unknown lifecycle event', 'A25-PD-001', ['UNRECOGNIZED'], [], 'CHECKED_OUT', 'REJECT', 'LIFECYCLE_EVENT_UNKNOWN', 'PASS'],
  ['Unknown lifecycle state', 'A25-PD-001', [], [], 'UNRECOGNIZED', 'REJECT', 'LIFECYCLE_STATE_UNKNOWN', 'PASS'],
  ['Missing identity', 'A25-PD-001', [], [], 'CHECKED_OUT', 'REJECT', 'IDENTITY_MISSING', 'PASS'],
  ['Unknown fault injection', 'A25-PD-001', [], ['UNRECOGNIZED_FAULT'], 'CHECKED_OUT', 'REJECT', 'FAULT_UNKNOWN', 'PASS'],
  ['Invalid backend PID', 'A25-PD-001', [], [], 'CHECKED_OUT', 'REJECT', 'BACKEND_PID_INVALID', 'PASS'],
  ['Mutable input defense', 'A25-PD-001', [], [], 'CHECKED_OUT', 'NONE', null, 'PASS'],
  ['Deterministic replay equality', 'A25-PD-001', ['BEGIN_OK', 'ROLLBACK_START', 'ROLLBACK_OK'], [], 'ROLLED_BACK', 'NONE', null, 'PASS']
];

const poolCounts = (index) => {
  const normal = new Set([0, 1, 2, 4, 6, 8]);
  const destroy = new Set([3, 5, 7, 9, 10, 11, 12, 14, 16]);
  const values = {
    19: [1, 0, 1, 0, 1], 20: [1, 0, 1, 0, 1], 21: [0, 0, 0, 1, 0],
    24: [1, 0, 1, 0, 2], 25: [2, 2, 0, 0, 0], 26: [1, 1, 0, 1, 0],
    27: [1, 1, 0, 0, 1], 32: [1, 1, 0, 0, 0]
  }[index] ?? (normal.has(index) ? [1, 0, 1, 0, 1] : destroy.has(index) ? [0, 0, 0, 1, 0] : index <= 18 ? [1, 1, 0, 0, 0] : [0, 0, 0, 0, 0]);
  return { total: values[0], checked_out: values[1], idle: values[2], destroyed: values[3], released: values[4], queued: 0 };
};

export const FAKE_DRIVER_FIXTURES = deepFreeze(definitions.map((definition, index) => ({
  fixture_id: `A25-PD3-FX-${String(index + 1).padStart(3, '0')}`,
  title: definition[0],
  scenario_reference: definition[1],
  initial_state: index === 18 ? 'UNKNOWN' : 'CHECKED_OUT',
  events: definition[2],
  injected_faults: definition[3],
  expected_terminal_state: definition[4],
  expected_release_action: definition[5],
  expected_failure_code: definition[6],
  expected_pool_counts: poolCounts(index),
  expected_result: definition[7]
})));
