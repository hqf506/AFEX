import { EventEmitter } from 'node:events';
import {
  AdapterFailure,
  boundedEvidence,
  classifySqlstate,
  mapBoundedError,
  selectPrimaryFailure
} from './A2.5-PD5-REAL-DRIVER-ERROR-MAP.mjs';

export const TRANSACTION_STATUS = Object.freeze({
  IDLE: 'IDLE',
  IN_TRANSACTION: 'IN_TRANSACTION',
  FAILED_TRANSACTION: 'FAILED_TRANSACTION',
  UNKNOWN: 'UNKNOWN'
});

export const ROLLBACK_STATE = Object.freeze({
  NOT_REQUIRED: 'NOT_REQUIRED',
  REQUIRED: 'REQUIRED',
  ATTEMPTED: 'ATTEMPTED',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  SKIPPED_UNSETTLED: 'SKIPPED_UNSETTLED'
});

const ROLLBACK_COMMAND_OUTCOME = Object.freeze({
  NOT_ATTEMPTED: 'NOT_ATTEMPTED',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  SKIPPED: 'SKIPPED'
});

export const COMMIT_OUTCOME = Object.freeze({
  KNOWN_COMMITTED: 'KNOWN_COMMITTED',
  KNOWN_NOT_COMMITTED: 'KNOWN_NOT_COMMITTED',
  AMBIGUOUS: 'AMBIGUOUS',
  NOT_ATTEMPTED: 'NOT_ATTEMPTED'
});

export const RELEASE_ACTION = Object.freeze({
  NORMAL_RELEASE: 'NORMAL_RELEASE',
  DESTROY_RELEASE: 'DESTROY_RELEASE',
  NO_RELEASE: 'NO_RELEASE'
});

export const ACTIVE_OPERATION = Object.freeze({
  QUERY: 'QUERY',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  SANITIZE: 'SANITIZE',
  RELEASE: 'RELEASE'
});

export function mapTransactionStatus(raw) {
  if (raw === 'I') return TRANSACTION_STATUS.IDLE;
  if (raw === 'T') return TRANSACTION_STATUS.IN_TRANSACTION;
  if (raw === 'E') return TRANSACTION_STATUS.FAILED_TRANSACTION;
  return TRANSACTION_STATUS.UNKNOWN;
}

export function observeTransactionStatus(client, expected = null) {
  if (!client || typeof client.getTransactionStatus !== 'function') return TRANSACTION_STATUS.UNKNOWN;
  let mapped;
  try {
    mapped = mapTransactionStatus(client.getTransactionStatus());
  } catch {
    return TRANSACTION_STATUS.UNKNOWN;
  }
  return expected && mapped !== expected ? TRANSACTION_STATUS.UNKNOWN : mapped;
}

export function classifyCommitOutcome({ rejected, ordinarilySettled, unsafe, transactionStatus }) {
  if (unsafe || !ordinarilySettled) return COMMIT_OUTCOME.AMBIGUOUS;
  if (!rejected && transactionStatus === TRANSACTION_STATUS.IDLE) return COMMIT_OUTCOME.KNOWN_COMMITTED;
  if (rejected && [TRANSACTION_STATUS.IN_TRANSACTION, TRANSACTION_STATUS.FAILED_TRANSACTION].includes(transactionStatus)) {
    return COMMIT_OUTCOME.KNOWN_NOT_COMMITTED;
  }
  return COMMIT_OUTCOME.AMBIGUOUS;
}

export function verifySanitation(state) {
  const passed = Boolean(state?.owned)
    && state.querySettlement !== 'PENDING'
    && state.transactionStatus === TRANSACTION_STATUS.IDLE
    && state.activeOperation === null
    && !state.unsafe
    && !state.outstandingTimeout
    && !state.forbiddenSessionMutation
    && state.identityMatched;
  return Object.freeze({ passed, failureCode: passed ? null : 'PG_SANITATION_FAILED' });
}

export function decideRelease(state) {
  if (!state?.acquired) return RELEASE_ACTION.NO_RELEASE;
  const knownOutcome = state.commitOutcome === COMMIT_OUTCOME.KNOWN_COMMITTED
    || state.commitOutcome === COMMIT_OUTCOME.NOT_ATTEMPTED;
  const rollbackSatisfied = state.rollbackState === ROLLBACK_STATE.NOT_REQUIRED
    || state.rollbackState === ROLLBACK_STATE.SUCCEEDED;
  const normal = state.owned
    && state.querySettlement !== 'PENDING'
    && state.querySettlement !== 'UNKNOWN'
    && state.activeOperation === null
    && state.transactionStatus === TRANSACTION_STATUS.IDLE
    && knownOutcome
    && rollbackSatisfied
    && !state.unsafe
    && state.sanitationPassed
    && state.identityMatched
    && !state.outstandingTimeout
    && !state.released;
  return normal ? RELEASE_ACTION.NORMAL_RELEASE : RELEASE_ACTION.DESTROY_RELEASE;
}

export class RollbackCoordinator {
  state = ROLLBACK_STATE.NOT_REQUIRED;
  attempts = 0;
  commandOutcome = ROLLBACK_COMMAND_OUTCOME.NOT_ATTEMPTED;
  observedTransactionStatus = TRANSACTION_STATUS.UNKNOWN;

  require() {
    if (this.state === ROLLBACK_STATE.NOT_REQUIRED) this.state = ROLLBACK_STATE.REQUIRED;
  }

  async attempt({ ordinarilySettled, run, observeStatus, timedOut = false }) {
    if (this.attempts !== 0) throw new AdapterFailure('PG_RELEASE_STATE_INVALID', { stage: 'rollback' });
    if (!ordinarilySettled) {
      this.state = ROLLBACK_STATE.SKIPPED_UNSETTLED;
      this.commandOutcome = ROLLBACK_COMMAND_OUTCOME.SKIPPED;
      return this.state;
    }
    this.attempts = 1;
    this.state = ROLLBACK_STATE.ATTEMPTED;
    if (timedOut) {
      this.state = ROLLBACK_STATE.TIMED_OUT;
      this.commandOutcome = ROLLBACK_COMMAND_OUTCOME.TIMED_OUT;
      return this.state;
    }
    try {
      await run();
      this.commandOutcome = ROLLBACK_COMMAND_OUTCOME.SUCCEEDED;
      this.observedTransactionStatus = observeStatus();
      this.state = this.observedTransactionStatus === TRANSACTION_STATUS.IDLE
        ? ROLLBACK_STATE.SUCCEEDED
        : ROLLBACK_STATE.FAILED;
    } catch {
      this.commandOutcome = ROLLBACK_COMMAND_OUTCOME.FAILED;
      this.state = ROLLBACK_STATE.FAILED;
    }
    return this.state;
  }
}

export class PoolErrorObserver {
  #events = [];

  constructor(pool) {
    if (!(pool instanceof EventEmitter) && typeof pool?.on !== 'function') {
      throw new TypeError('PG_RELEASE_STATE_INVALID');
    }
    pool.on('error', (error) => {
      const mapped = mapBoundedError(error, { unsafeKind: 'pool' });
      this.#events.push(boundedEvidence(mapped.failureCode, {
        stage: 'pool_idle',
        sqlstate: mapped.sqlstate,
        transactionStatus: 'UNKNOWN'
      }));
    });
  }

  snapshot() {
    return Object.freeze(this.#events.slice());
  }
}

export class RealDriverAdapter {
  constructor({ pool, controls }) {
    if (!pool || typeof pool.connect !== 'function' || typeof pool.on !== 'function') {
      throw new TypeError('PG_RELEASE_STATE_INVALID');
    }
    if (!controls || !['begin', 'execute', 'commit', 'rollback'].every((key) => typeof controls[key] === 'function')) {
      throw new TypeError('PG_RELEASE_STATE_INVALID');
    }
    this.pool = pool;
    this.controls = Object.freeze({ ...controls });
    this.poolErrors = new PoolErrorObserver(pool);
  }

  async acquire(borrowerId, { timeoutClass = null } = {}) {
    if (typeof borrowerId !== 'string' || borrowerId.length === 0) {
      throw new AdapterFailure('PG_IDENTITY_MISMATCH', { stage: 'checkout' });
    }
    let client;
    try {
      client = await this.pool.connect();
    } catch (error) {
      const mapped = mapBoundedError(error, { stage: 'checkout', timeoutClass });
      throw new AdapterFailure(mapped.failureCode, { stage: 'checkout', sqlstate: mapped.sqlstate });
    }
    return new ClientLease({ client, borrowerId, controls: this.controls });
  }
}

export class ClientLease {
  #client;
  #borrowerId;
  #controls;
  #clientErrorListener;
  #clientEndListener;
  #commitDeadlineResolve = null;
  #commitAttempted = false;
  #rollback = new RollbackCoordinator();
  #state;

  constructor({ client, borrowerId, controls }) {
    if (!client || typeof client.query !== 'function' || typeof client.release !== 'function' || typeof client.on !== 'function') {
      throw new TypeError('PG_RELEASE_STATE_INVALID');
    }
    this.#client = client;
    this.#borrowerId = borrowerId;
    this.#controls = controls;
    this.#state = {
      acquired: true,
      owned: true,
      identityMatched: true,
      querySettlement: 'NOT_STARTED',
      activeOperation: null,
      transactionStatus: observeTransactionStatus(client),
      commitOutcome: COMMIT_OUTCOME.NOT_ATTEMPTED,
      unsafe: false,
      unsafeCode: null,
      sanitationPassed: false,
      outstandingTimeout: false,
      forbiddenSessionMutation: false,
      released: false,
      releaseAction: null,
      releaseFailureCode: null
    };
    this.#clientErrorListener = (error) => this.#recordUnsafe(mapBoundedError(error, {
      unsafeKind: error?.code === '08P01' ? 'protocol' : 'client'
    }).failureCode);
    this.#clientEndListener = () => this.#recordUnsafe('PG_SOCKET_ERROR');
    client.on('error', this.#clientErrorListener);
    client.on('end', this.#clientEndListener);
  }

  snapshot() {
    return Object.freeze({
      ...this.#state,
      rollbackState: this.#rollback.state,
      rollbackAttempts: this.#rollback.attempts,
      rollbackCommandOutcome: this.#rollback.commandOutcome,
      rollbackObservedTransactionStatus: this.#rollback.observedTransactionStatus
    });
  }

  async begin(borrowerId) {
    this.#assertUsableOwner(borrowerId);
    this.#enterOperation(ACTIVE_OPERATION.QUERY);
    try {
      await this.#controls.begin(this.#client);
      this.#state.transactionStatus = observeTransactionStatus(this.#client, TRANSACTION_STATUS.IN_TRANSACTION);
      if (this.#state.transactionStatus === TRANSACTION_STATUS.UNKNOWN) this.#recordUnsafe('PG_TRANSACTION_STATUS_UNKNOWN');
    } catch {
      this.#recordUnsafe('PG_TRANSACTION_STATUS_UNKNOWN');
      throw new AdapterFailure('PG_TRANSACTION_STATUS_UNKNOWN', { stage: 'begin' });
    } finally {
      this.#leaveOperation(ACTIVE_OPERATION.QUERY);
    }
    return this.snapshot();
  }

  async query(borrowerId, queryConfig) {
    this.#assertUsableOwner(borrowerId);
    validateQueryConfig(queryConfig);
    this.#enterOperation(ACTIVE_OPERATION.QUERY);
    if (Number.isFinite(queryConfig.query_timeout) && queryConfig.query_timeout > 0) {
      this.#state.querySettlement = 'UNKNOWN';
      this.#state.outstandingTimeout = true;
      this.#recordUnsafe('PG_QUERY_TIMEOUT_LOCAL');
      this.#leaveOperation(ACTIVE_OPERATION.QUERY);
      throw new AdapterFailure('PG_QUERY_TIMEOUT_LOCAL', { stage: 'query' });
    }
    this.#state.querySettlement = 'PENDING';
    try {
      const result = await this.#controls.execute(this.#client, Object.freeze({
        operationId: queryConfig.operationId,
        values: Object.freeze([...(queryConfig.values ?? [])])
      }));
      if (this.#state.outstandingTimeout) {
        this.#state.querySettlement = 'UNKNOWN';
        throw new AdapterFailure('PG_QUERY_SETTLEMENT_UNKNOWN', { stage: 'query' });
      }
      this.#state.querySettlement = 'ORDINARY_SUCCESS';
      this.#state.transactionStatus = observeTransactionStatus(this.#client);
      if (this.#state.transactionStatus === TRANSACTION_STATUS.UNKNOWN) this.#recordUnsafe('PG_TRANSACTION_STATUS_UNKNOWN');
      return result;
    } catch (error) {
      if (error instanceof AdapterFailure) throw error;
      if (this.#state.unsafe) {
        this.#state.querySettlement = 'UNKNOWN';
        throw new AdapterFailure(this.#state.unsafeCode, { stage: 'query' });
      }
      const mapped = classifySqlstate(error?.code, { stage: 'query' });
      this.#state.querySettlement = 'ORDINARY_ERROR';
      this.#state.transactionStatus = observeTransactionStatus(this.#client);
      this.#rollback.require();
      if (this.#state.transactionStatus === TRANSACTION_STATUS.UNKNOWN) {
        this.#recordUnsafe('PG_TRANSACTION_STATUS_UNKNOWN');
      }
      const failureCode = selectPrimaryFailure(mapped.failureCode, this.#state.unsafeCode);
      throw new AdapterFailure(failureCode, {
        stage: 'query',
        sqlstate: mapped.sqlstate,
        transactionStatus: this.#state.transactionStatus
      });
    } finally {
      this.#leaveOperation(ACTIVE_OPERATION.QUERY);
    }
  }

  expireApplicationDeadline(borrowerId) {
    this.#assertUsableOwner(borrowerId);
    if (this.#state.querySettlement === 'PENDING') {
      this.#state.querySettlement = 'UNKNOWN';
      this.#state.outstandingTimeout = true;
      this.#state.transactionStatus = TRANSACTION_STATUS.UNKNOWN;
      this.#recordUnsafe('PG_QUERY_SETTLEMENT_UNKNOWN');
    } else if (this.#state.activeOperation === ACTIVE_OPERATION.COMMIT) {
      this.#makeCommitAmbiguous('APPLICATION_DEADLINE');
    }
    return this.snapshot();
  }

  expireOverallOperation(borrowerId) {
    this.#assertUsableOwner(borrowerId);
    if (this.#state.activeOperation === ACTIVE_OPERATION.COMMIT) this.#makeCommitAmbiguous('OVERALL_OPERATION_TIMEOUT');
    else if (this.#state.querySettlement === 'PENDING') {
      this.#state.querySettlement = 'UNKNOWN';
      this.#state.outstandingTimeout = true;
      this.#state.transactionStatus = TRANSACTION_STATUS.UNKNOWN;
      this.#recordUnsafe('PG_QUERY_SETTLEMENT_UNKNOWN');
    }
    return this.snapshot();
  }

  async rollback(borrowerId, { timedOut = false } = {}) {
    this.#assertUsableOwner(borrowerId);
    this.#enterOperation(ACTIVE_OPERATION.ROLLBACK);
    const ordinarilySettled = ['ORDINARY_SUCCESS', 'ORDINARY_ERROR'].includes(this.#state.querySettlement)
      || this.#state.commitOutcome === COMMIT_OUTCOME.KNOWN_NOT_COMMITTED;
    let state;
    try {
      state = await this.#rollback.attempt({
        ordinarilySettled,
        timedOut,
        run: () => this.#controls.rollback(this.#client),
        observeStatus: () => observeTransactionStatus(this.#client)
      });
    } finally {
      this.#leaveOperation(ACTIVE_OPERATION.ROLLBACK);
    }
    this.#state.transactionStatus = this.#rollback.observedTransactionStatus;
    if (this.#rollback.commandOutcome === ROLLBACK_COMMAND_OUTCOME.SUCCEEDED
      && this.#rollback.observedTransactionStatus === TRANSACTION_STATUS.IDLE) {
      this.#state.transactionStatus = TRANSACTION_STATUS.IDLE;
      this.#state.commitOutcome = COMMIT_OUTCOME.NOT_ATTEMPTED;
      return state;
    }
    const code = this.#rollback.commandOutcome === ROLLBACK_COMMAND_OUTCOME.TIMED_OUT ? 'PG_ROLLBACK_TIMEOUT'
      : this.#rollback.commandOutcome === ROLLBACK_COMMAND_OUTCOME.SKIPPED ? 'PG_QUERY_SETTLEMENT_UNKNOWN'
        : this.#rollback.commandOutcome === ROLLBACK_COMMAND_OUTCOME.SUCCEEDED
          && this.#rollback.observedTransactionStatus === TRANSACTION_STATUS.UNKNOWN
          ? 'PG_TRANSACTION_STATUS_UNKNOWN'
          : 'PG_ROLLBACK_FAILED';
    this.#recordUnsafe(code);
    throw new AdapterFailure(code, { stage: 'rollback' });
  }

  async commit(borrowerId) {
    this.#assertUsableOwner(borrowerId);
    if (this.#commitAttempted) throw new AdapterFailure('PG_RELEASE_STATE_INVALID', { stage: 'commit' });
    this.#enterOperation(ACTIVE_OPERATION.COMMIT);
    this.#commitAttempted = true;
    this.#state.commitOutcome = COMMIT_OUTCOME.NOT_ATTEMPTED;
    let signalDeadline;
    const deadline = new Promise((resolve) => { signalDeadline = resolve; });
    this.#commitDeadlineResolve = signalDeadline;
    const settlement = Promise.resolve().then(() => this.#controls.commit(this.#client)).then(
      () => Object.freeze({ kind: 'RESOLVED' }),
      (error) => Object.freeze({ kind: 'REJECTED', error })
    );
    let observed;
    try {
      observed = await Promise.race([settlement, deadline]);
    } finally {
      this.#commitDeadlineResolve = null;
      this.#leaveOperation(ACTIVE_OPERATION.COMMIT);
    }
    if (observed.kind === 'AMBIGUOUS') {
      throw new AdapterFailure('PG_COMMIT_OUTCOME_UNKNOWN', { stage: 'commit' });
    }
    const rejected = observed.kind === 'REJECTED';
    const captured = observed.error;
    const transactionStatus = observeTransactionStatus(this.#client);
    const outcome = classifyCommitOutcome({
      rejected,
      ordinarilySettled: !this.#state.outstandingTimeout,
      unsafe: this.#state.unsafe,
      transactionStatus
    });
    this.#state.transactionStatus = transactionStatus;
    this.#state.commitOutcome = outcome;
    if (outcome === COMMIT_OUTCOME.KNOWN_COMMITTED) return outcome;
    if (outcome === COMMIT_OUTCOME.KNOWN_NOT_COMMITTED) {
      this.#rollback.require();
      const mapped = classifySqlstate(captured?.code, { stage: 'commit' });
      throw new AdapterFailure(selectPrimaryFailure('PG_COMMIT_FAILED', mapped.failureCode), {
        stage: 'commit',
        sqlstate: mapped.sqlstate,
        transactionStatus
      });
    }
    this.#recordUnsafe('PG_COMMIT_OUTCOME_UNKNOWN');
    throw new AdapterFailure('PG_COMMIT_OUTCOME_UNKNOWN', { stage: 'commit' });
  }

  sanitize(borrowerId) {
    this.#assertUsableOwner(borrowerId);
    this.#enterOperation(ACTIVE_OPERATION.SANITIZE);
    try {
      this.#state.transactionStatus = observeTransactionStatus(this.#client);
      const result = verifySanitation({ ...this.#state, activeOperation: null, rollbackState: this.#rollback.state });
      this.#state.sanitationPassed = result.passed;
      if (!result.passed) this.#recordUnsafe(result.failureCode);
      return result;
    } finally {
      this.#leaveOperation(ACTIVE_OPERATION.SANITIZE);
    }
  }

  release(borrowerId) {
    if (this.#state.released) throw new AdapterFailure('PG_RELEASE_STATE_INVALID', { stage: 'release' });
    if (!this.#state.owned) throw new AdapterFailure('PG_RELEASE_STATE_INVALID', { stage: 'release' });
    this.#enterOperation(ACTIVE_OPERATION.RELEASE);
    if (borrowerId !== this.#borrowerId) {
      this.#state.identityMatched = false;
      this.#recordUnsafe('PG_IDENTITY_MISMATCH');
    }
    const action = decideRelease({ ...this.#state, activeOperation: null, rollbackState: this.#rollback.state });
    this.#state.releaseAction = action;
    this.#state.released = true;
    this.#state.owned = false;
    this.#detachOwnershipListeners();
    try {
      if (action === RELEASE_ACTION.NORMAL_RELEASE) this.#client.release();
      else this.#client.release(true);
    } catch {
      const failureCode = action === RELEASE_ACTION.DESTROY_RELEASE
        ? 'PG_CLIENT_DESTROY_REQUIRED'
        : 'PG_RELEASE_STATE_INVALID';
      this.#state.unsafe = true;
      this.#state.unsafeCode = selectPrimaryFailure(this.#state.unsafeCode, failureCode);
      this.#state.releaseFailureCode = failureCode;
      throw new AdapterFailure(failureCode, { stage: 'release' });
    }
    return action;
  }

  #assertUsableOwner(borrowerId) {
    if (this.#state.released || !this.#state.owned) {
      throw new AdapterFailure('PG_RELEASE_STATE_INVALID', { stage: 'ownership' });
    }
    if (borrowerId !== this.#borrowerId) {
      this.#state.identityMatched = false;
      this.#recordUnsafe('PG_IDENTITY_MISMATCH');
      throw new AdapterFailure('PG_IDENTITY_MISMATCH', { stage: 'ownership' });
    }
  }

  #recordUnsafe(failureCode) {
    if (this.#state.released) return;
    this.#state.unsafe = true;
    this.#state.unsafeCode = selectPrimaryFailure(this.#state.unsafeCode, failureCode);
    this.#state.sanitationPassed = false;
    if (this.#state.activeOperation === ACTIVE_OPERATION.COMMIT) this.#makeCommitAmbiguous('UNSAFE_EVENT');
  }

  #enterOperation(operation) {
    if (this.#state.activeOperation !== null) {
      throw new AdapterFailure('PG_RELEASE_STATE_INVALID', { stage: 'operation' });
    }
    this.#state.activeOperation = operation;
  }

  #leaveOperation(operation) {
    if (!this.#state.released && this.#state.activeOperation === operation) this.#state.activeOperation = null;
  }

  #makeCommitAmbiguous() {
    if (this.#state.activeOperation !== ACTIVE_OPERATION.COMMIT) return;
    this.#state.commitOutcome = COMMIT_OUTCOME.AMBIGUOUS;
    this.#state.outstandingTimeout = true;
    this.#state.transactionStatus = TRANSACTION_STATUS.UNKNOWN;
    this.#state.unsafe = true;
    this.#state.unsafeCode = selectPrimaryFailure(this.#state.unsafeCode, 'PG_COMMIT_OUTCOME_UNKNOWN');
    this.#state.sanitationPassed = false;
    this.#commitDeadlineResolve?.(Object.freeze({ kind: 'AMBIGUOUS' }));
  }

  #detachOwnershipListeners() {
    const remove = typeof this.#client.off === 'function'
      ? this.#client.off.bind(this.#client)
      : this.#client.removeListener?.bind(this.#client);
    remove?.('error', this.#clientErrorListener);
    remove?.('end', this.#clientEndListener);
  }
}

function validateQueryConfig(queryConfig) {
  if (!queryConfig || typeof queryConfig !== 'object'
    || typeof queryConfig.operationId !== 'string' || queryConfig.operationId.length === 0
    || (queryConfig.values !== undefined && !Array.isArray(queryConfig.values))) {
    throw new AdapterFailure('PG_RELEASE_STATE_INVALID', { stage: 'query' });
  }
  if (['text', 'name', 'sessionMutation'].some((key) => Object.prototype.hasOwnProperty.call(queryConfig, key))) {
    throw new AdapterFailure('PG_RELEASE_STATE_INVALID', { stage: 'query' });
  }
  const allowed = new Set(['operationId', 'values', 'query_timeout']);
  if (Object.keys(queryConfig).some((key) => !allowed.has(key))) {
    throw new AdapterFailure('PG_RELEASE_STATE_INVALID', { stage: 'query' });
  }
}
