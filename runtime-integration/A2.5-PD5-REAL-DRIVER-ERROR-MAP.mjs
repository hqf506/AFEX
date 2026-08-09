export const FAILURE_CODES = Object.freeze([
  'PG_POOL_CHECKOUT_TIMEOUT',
  'PG_POOL_SHUTDOWN',
  'PG_CONNECTION_TIMEOUT',
  'PG_QUERY_FAILED',
  'PG_QUERY_TIMEOUT_LOCAL',
  'PG_STATEMENT_TIMEOUT',
  'PG_LOCK_TIMEOUT',
  'PG_CANCEL_REQUEST_FAILED',
  'PG_CANCEL_SETTLEMENT_TIMEOUT',
  'PG_QUERY_SETTLEMENT_UNKNOWN',
  'PG_TRANSACTION_STATUS_UNKNOWN',
  'PG_ROLLBACK_FAILED',
  'PG_ROLLBACK_TIMEOUT',
  'PG_COMMIT_FAILED',
  'PG_COMMIT_OUTCOME_UNKNOWN',
  'PG_SOCKET_ERROR',
  'PG_PROTOCOL_ERROR',
  'PG_CLIENT_ERROR',
  'PG_POOL_ERROR',
  'PG_IDENTITY_MISMATCH',
  'PG_SANITATION_FAILED',
  'PG_RELEASE_STATE_INVALID',
  'PG_CLIENT_DESTROY_REQUIRED'
]);

const failureCodeSet = new Set(FAILURE_CODES);

export const SQLSTATE_ALLOWLIST = Object.freeze([
  '57014', '55P03', '40001', '40P01', '25P02',
  '08000', '08001', '08003', '08004', '08006', '08007', '08P01'
]);

const sqlstateSet = new Set(SQLSTATE_ALLOWLIST);

export const FAILURE_PRECEDENCE = Object.freeze([
  Object.freeze(['PG_COMMIT_OUTCOME_UNKNOWN']),
  Object.freeze(['PG_CONNECTION_TIMEOUT', 'PG_SOCKET_ERROR', 'PG_PROTOCOL_ERROR', 'PG_CLIENT_ERROR']),
  Object.freeze(['PG_QUERY_SETTLEMENT_UNKNOWN', 'PG_CANCEL_SETTLEMENT_TIMEOUT', 'PG_TRANSACTION_STATUS_UNKNOWN']),
  Object.freeze(['PG_ROLLBACK_FAILED', 'PG_ROLLBACK_TIMEOUT']),
  Object.freeze(['PG_IDENTITY_MISMATCH', 'PG_SANITATION_FAILED', 'PG_RELEASE_STATE_INVALID', 'PG_CLIENT_DESTROY_REQUIRED']),
  Object.freeze(['PG_POOL_CHECKOUT_TIMEOUT', 'PG_POOL_SHUTDOWN', 'PG_POOL_ERROR']),
  Object.freeze(['PG_QUERY_FAILED', 'PG_QUERY_TIMEOUT_LOCAL', 'PG_STATEMENT_TIMEOUT', 'PG_LOCK_TIMEOUT', 'PG_COMMIT_FAILED', 'PG_CANCEL_REQUEST_FAILED'])
]);

const precedenceRank = new Map(
  FAILURE_PRECEDENCE.flatMap((codes, rank) => codes.map((code) => [code, rank]))
);

export class AdapterFailure extends Error {
  constructor(failureCode, { stage = 'adapter', sqlstate = null, transactionStatus = 'UNKNOWN' } = {}) {
    if (!failureCodeSet.has(failureCode)) throw new TypeError('PG_FAILURE_CODE_UNKNOWN');
    super(failureCode);
    this.name = 'AdapterFailure';
    this.failureCode = failureCode;
    this.stage = stage;
    this.sqlstate = sqlstateSet.has(sqlstate) ? sqlstate : null;
    this.transactionStatus = transactionStatus;
    this.retryable = false;
    Object.freeze(this);
  }
}

export function isFailureCode(value) {
  return failureCodeSet.has(value);
}

export function retainSqlstate(value) {
  return typeof value === 'string' && sqlstateSet.has(value) ? value : null;
}

export function classifySqlstate(sqlstate, { stage = 'query' } = {}) {
  const retained = retainSqlstate(sqlstate);
  let failureCode = 'PG_QUERY_FAILED';
  if (retained === '57014') failureCode = 'PG_STATEMENT_TIMEOUT';
  else if (retained === '55P03') failureCode = 'PG_LOCK_TIMEOUT';
  else if (retained === '08007' && stage === 'commit') failureCode = 'PG_COMMIT_OUTCOME_UNKNOWN';
  else if (retained === '08P01') failureCode = 'PG_PROTOCOL_ERROR';
  else if (retained?.startsWith('08')) failureCode = stage === 'connect' ? 'PG_CONNECTION_TIMEOUT' : 'PG_CLIENT_ERROR';
  return Object.freeze({ failureCode, sqlstate: retained, retryable: false });
}

export function mapBoundedError(error, { stage = 'query', timeoutClass = null, unsafeKind = null } = {}) {
  if (error instanceof AdapterFailure) {
    return Object.freeze({ failureCode: error.failureCode, sqlstate: error.sqlstate, retryable: false });
  }
  if (timeoutClass === 'POOL_CHECKOUT_TIMEOUT') return bounded('PG_POOL_CHECKOUT_TIMEOUT');
  if (timeoutClass === 'CONNECTION_ESTABLISHMENT_TIMEOUT') return bounded('PG_CONNECTION_TIMEOUT');
  if (timeoutClass === 'DRIVER_QUERY_TIMEOUT') return bounded('PG_QUERY_TIMEOUT_LOCAL');
  if (timeoutClass === 'APPLICATION_DEADLINE') return bounded('PG_QUERY_SETTLEMENT_UNKNOWN');
  if (timeoutClass === 'CANCEL_SETTLEMENT_TIMEOUT') return bounded('PG_CANCEL_SETTLEMENT_TIMEOUT');
  if (timeoutClass === 'ROLLBACK_TIMEOUT') return bounded('PG_ROLLBACK_TIMEOUT');
  if (unsafeKind === 'socket') return bounded('PG_SOCKET_ERROR', error?.code);
  if (unsafeKind === 'protocol') return bounded('PG_PROTOCOL_ERROR', error?.code);
  if (unsafeKind === 'client') return bounded('PG_CLIENT_ERROR', error?.code);
  if (unsafeKind === 'pool') return bounded('PG_POOL_ERROR', error?.code);
  return classifySqlstate(error?.code, { stage });
}

export function selectPrimaryFailure(...codes) {
  const valid = codes.filter(isFailureCode);
  if (valid.length === 0) return null;
  return valid.reduce((selected, candidate) =>
    precedenceRank.get(candidate) < precedenceRank.get(selected) ? candidate : selected
  );
}

export function boundedEvidence(failureCode, { stage, sqlstate = null, transactionStatus = 'UNKNOWN' } = {}) {
  if (!isFailureCode(failureCode)) throw new TypeError('PG_FAILURE_CODE_UNKNOWN');
  return Object.freeze({
    failureCode,
    stage,
    sqlstate: retainSqlstate(sqlstate),
    transactionStatus,
    retryable: false
  });
}

function bounded(failureCode, sqlstate = null) {
  return Object.freeze({ failureCode, sqlstate: retainSqlstate(sqlstate), retryable: false });
}
