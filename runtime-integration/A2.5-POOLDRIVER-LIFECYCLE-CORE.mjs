import { createHash } from 'node:crypto';

export const LIFECYCLE_STATES = Object.freeze([
  'CHECKED_OUT', 'TRANSACTION_ACTIVE', 'COMMITTING', 'COMMITTED',
  'ROLLING_BACK', 'ROLLED_BACK', 'CANCELLING',
  'CANCELLED_ROLLBACK_PROVEN', 'UNKNOWN', 'DESTROYED', 'RELEASED'
]);

export const LIFECYCLE_EVENTS = Object.freeze([
  'CHECKOUT', 'BEGIN_OK', 'BEGIN_FAIL', 'QUERY_OK', 'QUERY_FAIL',
  'COMMIT_START', 'COMMIT_OK', 'COMMIT_FAIL', 'ROLLBACK_START',
  'ROLLBACK_OK', 'ROLLBACK_FAIL', 'CANCEL_START', 'CANCEL_SETTLED',
  'CANCEL_FAILED', 'SANITATION_PASS', 'SANITATION_FAIL',
  'IDENTITY_MATCH', 'IDENTITY_MISMATCH', 'SOCKET_ERROR', 'PROTOCOL_ERROR',
  'TIMEOUT_DATABASE', 'TIMEOUT_CLIENT', 'TIMEOUT_PROCESS',
  'RELEASE_NORMAL', 'RELEASE_DESTROY'
]);

const stateSet = new Set(LIFECYCLE_STATES);
const eventSet = new Set(LIFECYCLE_EVENTS);
const terminalSet = new Set(['DESTROYED', 'RELEASED']);
const acceptedKeys = new Set([
  'state', 'sanitation_passed', 'identity_matched', 'destroy_required',
  'failure_code', 'recorded_utc', 'sequence', 'state_hash'
]);

function canonicalValue(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (Number.isFinite(value) && Number.isInteger(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  throw new TypeError('CANONICAL_VALUE_INVALID');
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function deterministicHash(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function frozenState(fields) {
  const state = Object.freeze({
    state: fields.state,
    sanitation_passed: fields.sanitation_passed,
    identity_matched: fields.identity_matched,
    destroy_required: fields.destroy_required,
    failure_code: fields.failure_code,
    recorded_utc: fields.recorded_utc,
    sequence: fields.sequence
  });
  return Object.freeze({ ...state, state_hash: deterministicHash(state) });
}

export function createLifecycleState(input = {}) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) throw new TypeError('LIFECYCLE_INPUT_INVALID');
  for (const key of Object.keys(input)) if (!acceptedKeys.has(key)) throw new TypeError('LIFECYCLE_FIELD_UNKNOWN');
  const state = input.state ?? 'CHECKED_OUT';
  if (!stateSet.has(state)) throw new TypeError('LIFECYCLE_STATE_UNKNOWN');
  if (input.recorded_utc !== undefined && input.recorded_utc !== null && typeof input.recorded_utc !== 'string') throw new TypeError('RECORDED_UTC_INVALID');
  return frozenState({
    state,
    sanitation_passed: input.sanitation_passed ?? false,
    identity_matched: input.identity_matched ?? null,
    destroy_required: input.destroy_required ?? false,
    failure_code: input.failure_code ?? null,
    recorded_utc: input.recorded_utc ?? null,
    sequence: input.sequence ?? 0
  });
}

function next(current, patch) {
  return frozenState({ ...current, ...patch, sequence: current.sequence + 1 });
}

function invalid(current, failureCode = 'LIFECYCLE_TRANSITION_INVALID') {
  return next(current, { failure_code: failureCode });
}

function unknown(current, failureCode) {
  return next(current, { state: 'UNKNOWN', destroy_required: true, failure_code: failureCode, sanitation_passed: false });
}

export function reduceLifecycle(input, event) {
  if (!input || typeof input !== 'object') throw new TypeError('LIFECYCLE_INPUT_INVALID');
  if (!stateSet.has(input.state)) throw new TypeError('LIFECYCLE_STATE_UNKNOWN');
  if (!eventSet.has(event)) throw new TypeError('LIFECYCLE_EVENT_UNKNOWN');
  const current = createLifecycleState(input);
  if (terminalSet.has(current.state)) return invalid(current, 'TERMINAL_STATE_RESURRECTION_REJECTED');

  if (event === 'RELEASE_DESTROY') return next(current, { state: 'DESTROYED', destroy_required: true });
  if (event === 'RELEASE_NORMAL') {
    const eligible = ['COMMITTED', 'ROLLED_BACK', 'CANCELLED_ROLLBACK_PROVEN'].includes(current.state);
    return eligible && current.sanitation_passed && !current.destroy_required
      ? next(current, { state: 'RELEASED' })
      : invalid(current, 'RELEASE_STATE_INVALID');
  }

  if (event === 'SOCKET_ERROR') return unknown(current, 'SOCKET_ERROR');
  if (event === 'PROTOCOL_ERROR') return unknown(current, 'PROTOCOL_ERROR');
  if (event === 'IDENTITY_MISMATCH') return unknown(current, 'IDENTITY_MISMATCH');
  if (event === 'SANITATION_FAIL') return unknown(current, 'SANITATION_FAILED');
  if (event === 'TIMEOUT_CLIENT') return unknown(current, 'TIMEOUT_CLIENT_UNRESOLVED');
  if (event === 'TIMEOUT_PROCESS') return unknown(current, 'TIMEOUT_PROCESS_UNRESOLVED');
  if (event === 'CANCEL_FAILED') return unknown(current, 'CANCEL_STATE_UNRESOLVED');
  if (event === 'ROLLBACK_FAIL') return unknown(current, 'ROLLBACK_FAILED');

  const table = {
    CHECKED_OUT: {
      BEGIN_OK: { state: 'TRANSACTION_ACTIVE' },
      BEGIN_FAIL: { state: 'UNKNOWN', destroy_required: true, failure_code: 'BEGIN_FAILED' },
      IDENTITY_MATCH: { identity_matched: true },
      TIMEOUT_DATABASE: { state: 'ROLLING_BACK', failure_code: 'DATABASE_TIMEOUT' }
    },
    TRANSACTION_ACTIVE: {
      QUERY_OK: {}, QUERY_FAIL: { failure_code: 'QUERY_FAILED' },
      COMMIT_START: { state: 'COMMITTING' }, ROLLBACK_START: { state: 'ROLLING_BACK' },
      CANCEL_START: { state: 'CANCELLING' }, IDENTITY_MATCH: { identity_matched: true },
      TIMEOUT_DATABASE: { state: 'ROLLING_BACK', failure_code: 'DATABASE_TIMEOUT' }
    },
    COMMITTING: {
      COMMIT_OK: { state: 'COMMITTED' },
      COMMIT_FAIL: { state: 'ROLLING_BACK', failure_code: 'COMMIT_FAILED' }
    },
    COMMITTED: { SANITATION_PASS: { sanitation_passed: true }, IDENTITY_MATCH: { identity_matched: true } },
    ROLLING_BACK: { ROLLBACK_OK: { state: 'ROLLED_BACK' } },
    ROLLED_BACK: { SANITATION_PASS: { sanitation_passed: true }, IDENTITY_MATCH: { identity_matched: true } },
    CANCELLING: { CANCEL_SETTLED: { state: 'ROLLING_BACK', failure_code: 'CANCEL_SETTLED' } },
    CANCELLED_ROLLBACK_PROVEN: { SANITATION_PASS: { sanitation_passed: true } },
    UNKNOWN: {},
    DESTROYED: {},
    RELEASED: {}
  };
  const patch = table[current.state][event];
  if (patch === undefined) return invalid(current);
  const result = next(current, patch);
  if (current.state === 'ROLLING_BACK' && event === 'ROLLBACK_OK' && current.failure_code === 'CANCEL_SETTLED') {
    return next(current, { state: 'CANCELLED_ROLLBACK_PROVEN' });
  }
  return result;
}

export function validateTimeoutHierarchy(input) {
  if (!input || Object.keys(input).sort().join(',') !== 'client_timeout_ms,database_timeout_ms,process_timeout_ms') {
    return Object.freeze({ valid: false, failure_code: 'TIMEOUT_CONFIGURATION_INVALID' });
  }
  const values = [input.database_timeout_ms, input.client_timeout_ms, input.process_timeout_ms];
  const validNumbers = values.every((value) => Number.isSafeInteger(value) && value > 0 && value <= 86_400_000);
  const ordered = values[0] < values[1] && values[1] < values[2];
  return Object.freeze(validNumbers && ordered
    ? { valid: true, failure_code: null }
    : { valid: false, failure_code: 'TIMEOUT_CONFIGURATION_INVALID' });
}
