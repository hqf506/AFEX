import { createLifecycleState, reduceLifecycle, validateTimeoutHierarchy } from './A2.5-POOLDRIVER-LIFECYCLE-CORE.mjs';

const faults = new Set([
  'BEGIN_FAIL', 'QUERY_FAIL', 'COMMIT_FAIL', 'ROLLBACK_FAIL', 'CANCEL_FAIL',
  'CANCEL_SETTLES_DIRTY', 'SOCKET_ERROR', 'PROTOCOL_ERROR', 'IDENTITY_MISMATCH',
  'SANITATION_FAIL', 'DATABASE_TIMEOUT', 'CLIENT_TIMEOUT', 'PROCESS_TIMEOUT'
]);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export class FakeClock {
  #now = 0;
  #nextId = 1;
  #tasks = [];

  get now() { return this.#now; }

  schedule(delayMs, callback) {
    if (!Number.isSafeInteger(delayMs) || delayMs < 0 || typeof callback !== 'function') throw new TypeError('FAKE_CLOCK_INPUT_INVALID');
    const task = { id: this.#nextId++, at: this.#now + delayMs, callback, cancelled: false };
    this.#tasks.push(task);
    return task.id;
  }

  cancel(id) {
    const task = this.#tasks.find((candidate) => candidate.id === id);
    if (!task) return false;
    task.cancelled = true;
    return true;
  }

  advance(milliseconds) {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new TypeError('FAKE_CLOCK_ADVANCE_INVALID');
    const target = this.#now + milliseconds;
    while (true) {
      this.#tasks.sort((a, b) => a.at - b.at || a.id - b.id);
      const task = this.#tasks.find((candidate) => !candidate.cancelled && candidate.at <= target);
      if (!task) break;
      this.#tasks.splice(this.#tasks.indexOf(task), 1);
      this.#now = task.at;
      task.callback();
    }
    this.#now = target;
  }
}

export class FakeCancellationController {
  #settled = false;
  #failed = false;
  cancel({ fail = false } = {}) {
    if (this.#settled || this.#failed) throw new Error('CANCELLATION_ALREADY_FINAL');
    if (fail) this.#failed = true;
    else this.#settled = true;
    return Object.freeze({ settled: this.#settled, failed: this.#failed });
  }
}

export class FakeTransaction {
  constructor(client) { this.client = client; }
  begin() { return this.client.apply('BEGIN_OK'); }
  query(operationId) { return this.client.query(operationId); }
  commit() { return this.client.commit(); }
  rollback() { return this.client.rollback(); }
  cancel() { return this.client.cancel(); }
}

export class FakeClient {
  constructor(pool, descriptor) {
    if (!Number.isSafeInteger(descriptor.backendPid) || descriptor.backendPid <= 0) throw new TypeError('BACKEND_PID_INVALID');
    this.pool = pool;
    this.id = descriptor.id;
    this.backendPid = descriptor.backendPid;
    this.identityLabel = descriptor.identityLabel;
    this.lifecycle = createLifecycleState({ state: 'CHECKED_OUT', recorded_utc: descriptor.recordedUtc });
    this.transactionStatus = 'IDLE';
    this.contamination = new Set();
    this.queryLog = [];
    this.faults = new Set();
    this.released = false;
    this.destroyed = false;
  }

  inject(...names) {
    for (const name of names) {
      if (!faults.has(name)) throw new TypeError('FAULT_UNKNOWN');
      this.faults.add(name);
    }
  }

  ensureUsable() {
    if (this.released) throw new Error('CLIENT_ALREADY_RELEASED');
    if (this.destroyed) throw new Error('CLIENT_ALREADY_DESTROYED');
  }

  apply(event) {
    this.ensureUsable();
    if (event === 'SANITATION_PASS') throw new Error('SANITATION_BYPASS_REJECTED');
    this.lifecycle = reduceLifecycle(this.lifecycle, event);
    return this.lifecycle;
  }

  _applySanitationPass() {
    this.lifecycle = reduceLifecycle(this.lifecycle, 'SANITATION_PASS');
    return this.lifecycle;
  }

  transaction() { this.ensureUsable(); return new FakeTransaction(this); }

  begin() {
    this.ensureUsable();
    if (this.faults.has('BEGIN_FAIL')) return this.apply('BEGIN_FAIL');
    this.transactionStatus = 'ACTIVE';
    return this.apply('BEGIN_OK');
  }

  query(operationId) {
    this.ensureUsable();
    if (!/^OP_[A-Z0-9_]+$/.test(operationId)) throw new TypeError('OPERATION_ID_INVALID');
    this.queryLog.push(operationId);
    if (this.faults.has('SOCKET_ERROR')) return this.apply('SOCKET_ERROR');
    if (this.faults.has('PROTOCOL_ERROR')) return this.apply('PROTOCOL_ERROR');
    if (this.faults.has('DATABASE_TIMEOUT')) return this.apply('TIMEOUT_DATABASE');
    if (this.faults.has('CLIENT_TIMEOUT')) return this.apply('TIMEOUT_CLIENT');
    if (this.faults.has('PROCESS_TIMEOUT')) return this.apply('TIMEOUT_PROCESS');
    return this.apply(this.faults.has('QUERY_FAIL') ? 'QUERY_FAIL' : 'QUERY_OK');
  }

  commit() {
    this.ensureUsable();
    this.apply('COMMIT_START');
    if (this.faults.has('COMMIT_FAIL')) return this.apply('COMMIT_FAIL');
    this.transactionStatus = 'IDLE';
    return this.apply('COMMIT_OK');
  }

  rollback() {
    this.ensureUsable();
    if (this.lifecycle.state !== 'ROLLING_BACK') this.apply('ROLLBACK_START');
    if (this.faults.has('ROLLBACK_FAIL')) return this.apply('ROLLBACK_FAIL');
    this.transactionStatus = 'IDLE';
    return this.apply('ROLLBACK_OK');
  }

  cancel() {
    this.ensureUsable();
    this.apply('CANCEL_START');
    if (this.faults.has('CANCEL_FAIL')) return this.apply('CANCEL_FAILED');
    this.apply('CANCEL_SETTLED');
    if (this.faults.has('CANCEL_SETTLES_DIRTY')) return this.apply('SANITATION_FAIL');
    return this.rollback();
  }

  attestIdentity(actualLabel) {
    this.ensureUsable();
    if (!actualLabel) return this.apply('IDENTITY_MISMATCH');
    return this.apply(actualLabel === this.identityLabel && !this.faults.has('IDENTITY_MISMATCH') ? 'IDENTITY_MATCH' : 'IDENTITY_MISMATCH');
  }

  sanitize() {
    this.ensureUsable();
    if (!['COMMITTED', 'ROLLED_BACK', 'CANCELLED_ROLLBACK_PROVEN'].includes(this.lifecycle.state)) {
      return this.apply('SANITATION_FAIL');
    }
    if (this.faults.has('SANITATION_FAIL')) return this.apply('SANITATION_FAIL');
    this.contamination.clear();
    if (this.contamination.size !== 0) return this.apply('SANITATION_FAIL');
    return this._applySanitationPass();
  }

  release(action) {
    this.ensureUsable();
    if (action === 'normal') {
      if (this.contamination.size !== 0) {
        this.lifecycle = reduceLifecycle(this.lifecycle, 'SANITATION_FAIL');
        throw new Error('SANITATION_FAILED');
      }
      const outcome = this.apply('RELEASE_NORMAL');
      if (outcome.state !== 'RELEASED') throw new Error(outcome.failure_code);
      this.released = true;
      this.pool._return(this);
      return outcome;
    }
    if (action === 'destroy') {
      const outcome = this.apply('RELEASE_DESTROY');
      this.destroyed = true;
      this.pool._destroy(this);
      return outcome;
    }
    throw new TypeError('RELEASE_ACTION_INVALID');
  }
}

export class FakePool {
  #max;
  #nextClient = 1;
  #nextWaiter;
  #idle = [];
  #checkedOut = new Map();
  #allIds = new Set();
  #queue = [];
  #destroyed = 0;
  #releases = 0;

  constructor({ max = 1, identityLabel = 'FAKE_RUNTIME', clock = new FakeClock(), waiterSequenceStart = 1, timeouts = { database_timeout_ms: 10, client_timeout_ms: 20, process_timeout_ms: 30 } } = {}) {
    if (!Number.isSafeInteger(max) || max < 1 || max > 64) throw new TypeError('POOL_MAX_INVALID');
    const timeoutResult = validateTimeoutHierarchy(timeouts);
    if (!timeoutResult.valid) throw new TypeError(timeoutResult.failure_code);
    if (!identityLabel) throw new TypeError('IDENTITY_MISSING');
    if (!Number.isSafeInteger(waiterSequenceStart) || waiterSequenceStart < 1 || waiterSequenceStart > 9_999) throw new TypeError('WAITER_ID_SEQUENCE_INVALID');
    this.#max = max;
    this.#nextWaiter = waiterSequenceStart;
    this.identityLabel = identityLabel;
    this.clock = clock;
    this.timeouts = deepFreeze({ ...timeouts });
  }

  get counts() {
    return Object.freeze({ total: this.#allIds.size - this.#destroyed, checked_out: this.#checkedOut.size, idle: this.#idle.length, destroyed: this.#destroyed, released: this.#releases, queued: this.#queue.length });
  }

  checkout(recordedUtc = '2026-08-05T00:00:00Z') {
    const client = this.#acquire(recordedUtc);
    if (client) return client;
    if (!Number.isSafeInteger(this.#nextWaiter) || this.#nextWaiter < 1) throw new Error('WAITER_ID_SEQUENCE_INVALID');
    if (this.#nextWaiter > 9_999) throw new Error('WAITER_ID_SEQUENCE_EXHAUSTED');
    const waiterId = `FAKE_WAITER_${String(this.#nextWaiter).padStart(4, '0')}`;
    const waiter = new FakeCheckoutWaiter(this, recordedUtc, waiterId);
    this.#queue.push(waiter);
    this.#nextWaiter += 1;
    return waiter;
  }

  #acquire(recordedUtc, returnedClient = null) {
    let client = returnedClient ?? this.#idle.shift() ?? null;
    if (!client && this.#allIds.size - this.#destroyed < this.#max) {
      const number = this.#nextClient++;
      const id = `FAKE_CLIENT_${String(number).padStart(4, '0')}`;
      if (this.#allIds.has(id)) throw new Error('DUPLICATE_CLIENT_ID');
      this.#allIds.add(id);
      client = new FakeClient(this, { id, backendPid: 20_000 + number, identityLabel: this.identityLabel, recordedUtc });
    } else if (client) {
      if (client.destroyed) throw new Error('DESTROYED_CLIENT_REACQUIRED');
      if (client.contamination.size !== 0) throw new Error('BORROWER_CONTAMINATION_PRESENT');
      client.released = false;
      client.lifecycle = createLifecycleState({ state: 'CHECKED_OUT', recorded_utc: recordedUtc });
    }
    if (client) this.#checkedOut.set(client.id, client);
    return client;
  }

  _cancelWaiter(waiter) {
    const index = this.#queue.indexOf(waiter);
    if (index < 0) return false;
    this.#queue.splice(index, 1);
    return true;
  }

  #wakeNext(returnedClient = null) {
    const waiter = this.#queue.shift() ?? null;
    if (!waiter) {
      if (returnedClient) this.#idle.push(returnedClient);
      return;
    }
    const client = this.#acquire(waiter.recordedUtc, returnedClient);
    if (!client) throw new Error('WAITER_CAPACITY_INCONSISTENT');
    waiter._resolve(client);
  }

  _return(client) {
    this.#checkedOut.delete(client.id);
    this.#releases += 1;
    this.#wakeNext(client);
  }

  _destroy(client) {
    this.#checkedOut.delete(client.id);
    this.#idle = this.#idle.filter((candidate) => candidate.id !== client.id);
    this.#destroyed += 1;
    this.#wakeNext();
  }
}

export class FakeCheckoutWaiter {
  #pool;
  #client = null;
  #status = 'QUEUED';

  constructor(pool, recordedUtc, id) {
    if (!/^FAKE_WAITER_\d{4}$/.test(id)) throw new TypeError('WAITER_ID_INVALID');
    this.#pool = pool;
    this.recordedUtc = recordedUtc;
    Object.defineProperties(this, {
      id: { value: id, enumerable: true, writable: false, configurable: false },
      identity: { value: Object.freeze({ waiter_id: id }), enumerable: true, writable: false, configurable: false }
    });
  }

  get status() { return this.#status; }
  get client() { return this.#client; }

  cancel() {
    if (this.#status !== 'QUEUED') return false;
    if (!this.#pool._cancelWaiter(this)) return false;
    this.#status = 'CANCELLED';
    return true;
  }

  take() {
    if (this.#status === 'QUEUED') throw new Error('WAITER_NOT_RESOLVED');
    if (this.#status === 'CANCELLED') throw new Error('WAITER_CANCELLED');
    if (this.#status === 'TAKEN') throw new Error('WAITER_ALREADY_TAKEN');
    this.#status = 'TAKEN';
    return this.#client;
  }

  _resolve(client) {
    if (this.#status !== 'QUEUED') throw new Error('WAITER_ALREADY_FINAL');
    this.#client = client;
    this.#status = 'READY';
  }
}

export { deepFreeze };
