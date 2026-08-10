export const TIMEOUT_CLASSES = Object.freeze([
  'POOL_CHECKOUT_TIMEOUT',
  'CONNECTION_ESTABLISHMENT_TIMEOUT',
  'APPLICATION_DEADLINE',
  'DRIVER_QUERY_TIMEOUT',
  'SERVER_STATEMENT_TIMEOUT',
  'SERVER_LOCK_TIMEOUT',
  'IDLE_IN_TRANSACTION_TIMEOUT',
  'CANCEL_SETTLEMENT_TIMEOUT',
  'ROLLBACK_TIMEOUT',
  'CLIENT_DESTROY_TIMEOUT',
  'OVERALL_OPERATION_TIMEOUT'
]);

export function validateTimeoutPlan(plan) {
  const required = [
    'checkoutMs', 'connectionMs', 'lockMs', 'statementMs', 'applicationMs',
    'settlementMs', 'rollbackMs', 'destroyMs', 'overallMs'
  ];
  if (!plan || required.some((key) => !Number.isSafeInteger(plan[key]) || plan[key] <= 0)) {
    return Object.freeze({ valid: false, failureCode: 'PG_RELEASE_STATE_INVALID' });
  }
  const ordered = plan.lockMs <= plan.statementMs
    && plan.statementMs < plan.applicationMs
    && plan.applicationMs < plan.overallMs
    && plan.settlementMs < plan.overallMs
    && plan.rollbackMs < plan.overallMs
    && plan.destroyMs < plan.overallMs;
  return Object.freeze({ valid: ordered, failureCode: ordered ? null : 'PG_RELEASE_STATE_INVALID' });
}

export class DeterministicScheduler {
  #now = 0;
  #nextId = 1;
  #tasks = [];

  get now() {
    return this.#now;
  }

  schedule(delayMs, callback) {
    if (!Number.isSafeInteger(delayMs) || delayMs < 0 || typeof callback !== 'function') {
      throw new TypeError('PG_RELEASE_STATE_INVALID');
    }
    const task = { id: this.#nextId++, at: this.#now + delayMs, callback, cancelled: false };
    this.#tasks.push(task);
    this.#tasks.sort((a, b) => a.at - b.at || a.id - b.id);
    return task.id;
  }

  cancel(id) {
    const task = this.#tasks.find((candidate) => candidate.id === id && !candidate.cancelled);
    if (!task) return false;
    task.cancelled = true;
    return true;
  }

  advanceTo(targetMs) {
    if (!Number.isSafeInteger(targetMs) || targetMs < this.#now) throw new TypeError('PG_RELEASE_STATE_INVALID');
    while (true) {
      const task = this.#tasks.find((candidate) => !candidate.cancelled && candidate.at <= targetMs);
      if (!task) break;
      task.cancelled = true;
      this.#now = task.at;
      task.callback();
    }
    this.#now = targetMs;
  }

  pendingCount() {
    return this.#tasks.filter((task) => !task.cancelled).length;
  }
}

export function createDeadline(scheduler, delayMs, onExpire) {
  const id = scheduler.schedule(delayMs, onExpire);
  let active = true;
  return Object.freeze({
    disarm() {
      if (!active) return false;
      active = false;
      return scheduler.cancel(id);
    },
    isActive() {
      return active;
    }
  });
}
