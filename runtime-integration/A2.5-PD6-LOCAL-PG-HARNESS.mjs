import { createHash } from 'node:crypto';
import pg from 'pg';
import { RealDriverAdapter } from './A2.5-PD5-REAL-DRIVER-ADAPTER.mjs';
import {
  AdapterFailure,
  FAILURE_CODES,
  SQLSTATE_ALLOWLIST,
  isFailureCode,
  mapBoundedError,
  retainSqlstate
} from './A2.5-PD5-REAL-DRIVER-ERROR-MAP.mjs';
import { createLocalPgControls, resolveLocalPgOperation } from './A2.5-PD6-LOCAL-PG-FIXTURES.mjs';

const { Client, Pool } = pg;

export const LOCAL_DIRECT_IDENTITY = Object.freeze({
  host: '127.0.0.1',
  port: 55432,
  database: 'afex_a25_pd6',
  user: 'afex_a25_pd6_runner'
});

export const LOCAL_DIRECT_POOL_POLICY = Object.freeze({
  max: 1,
  min: 0,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 1000,
  maxLifetimeSeconds: 30,
  allowExitOnIdle: true,
  keepAlive: true,
  application_name: 'afex-a25-pd6-local-direct'
});

export const LOCAL_DIRECT_TIMEOUTS = Object.freeze({
  lockMs: 1000,
  statementMs: 2000,
  applicationMs: 3500,
  settlementMs: 1500,
  rollbackMs: 1500,
  overallMs: 9000
});

export const LOCK_CONTROL_TIMEOUTS = Object.freeze({
  connectMs: 3000,
  beginMs: 750,
  lockMs: 1000,
  criticalSectionMs: 1500,
  rollbackMs: 750,
  endMs: 750,
  overallMs: 8500
});

const DEFAULT_SCHEDULER = Object.freeze({
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle)
});

const CONFIG_KEYS = Object.freeze(['host', 'port', 'database', 'user', 'password']);
const RESULT_KEYS = Object.freeze([
  'scenario_id', 'evidence_tier', 'endpoint_class', 'driver_version', 'postgres_version',
  'terminal_classification', 'release_action', 'failure_code', 'sqlstate',
  'transaction_status_before', 'transaction_status_after', 'rollback_attempts',
  'retry_attempted', 'client_destroyed', 'replacement_observed', 'decoded_value_class', 'pass'
]);
export const PD6_SCENARIO_IDS = Object.freeze(Array.from({ length: 37 }, (_, index) => `PD6-D-${String(index + 1).padStart(3, '0')}`));
export const EVIDENCE_TIERS = Object.freeze(['PD6C_DIRECT', 'PD6F_POOLER', 'PROVIDER', 'NOT_SAFE_LOCAL']);
export const ENDPOINT_CLASSES = Object.freeze([
  'DIRECT_POSTGRESQL', 'PGBOUNCER_TRANSACTION_POOL', 'SUPAVISOR_TRANSACTION_POOL', 'NOT_APPLICABLE'
]);
export const TERMINAL_CLASSIFICATIONS = Object.freeze([
  'COMPLETED_SAFE', 'ROLLED_BACK_SAFE', 'DESTROYED_UNSAFE', 'CHECKOUT_REJECTED',
  'CONNECTION_REJECTED', 'POOL_EVENT_ONLY', 'PERMISSION_DENIED_SAFE', 'DEFERRED_NOT_EXECUTED'
]);
export const RELEASE_ACTIONS = Object.freeze(['NORMAL_RELEASE', 'DESTROY_RELEASE', 'NO_RELEASE']);
export const RESULT_TRANSACTION_STATUSES = Object.freeze([
  'IDLE', 'IN_TRANSACTION', 'FAILED_TRANSACTION', 'UNKNOWN', 'NOT_APPLICABLE'
]);
export const DECODED_VALUE_CLASSES = Object.freeze([
  'NUMBER', 'STRING', 'BOOLEAN', 'OBJECT', 'BUFFER', 'ARRAY', 'NULL', 'DATE', 'NOT_APPLICABLE'
]);

export function validateExplicitLocalConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('PD6_CONFIG_REQUIRED');
  if (Object.keys(input).some((key) => !CONFIG_KEYS.includes(key))) throw new TypeError('PD6_CONFIG_UNKNOWN_FIELD');
  for (const [key, expected] of Object.entries(LOCAL_DIRECT_IDENTITY)) {
    if (input[key] !== expected) throw new TypeError(`PD6_CONFIG_${key.toUpperCase()}_REJECTED`);
  }
  if (typeof input.password !== 'string' || input.password.length === 0) throw new TypeError('PD6_CONFIG_PASSWORD_REQUIRED');
  return Object.freeze({ ...LOCAL_DIRECT_IDENTITY, password: input.password });
}

export function describeLocalConfig() {
  return Object.freeze({
    ...LOCAL_DIRECT_IDENTITY,
    password: 'REDACTED',
    endpointClass: 'DIRECT_POSTGRESQL'
  });
}

export function createLocalDirectPool(input, { PoolConstructor = Pool } = {}) {
  const config = validateExplicitLocalConfig(input);
  return new PoolConstructor(Object.freeze({
    ...config,
    ...LOCAL_DIRECT_POOL_POLICY,
    ssl: false
  }));
}

export function createLocalDirectHarness(input, options = {}) {
  const pool = createLocalDirectPool(input, options);
  const adapter = new RealDriverAdapter({ pool, controls: createLocalPgControls() });
  return Object.freeze({
    adapter,
    pool,
    endpoint: describeLocalConfig(),
    close: () => pool.end()
  });
}

export async function withLockControl(input, criticalSection, {
  ClientConstructor = Client,
  scheduler = DEFAULT_SCHEDULER
} = {}) {
  const config = validateExplicitLocalConfig(input);
  if (typeof criticalSection !== 'function') throw new TypeError('PD6_CONTROL_CALLBACK_REQUIRED');
  validateScheduler(scheduler);
  const client = new ClientConstructor(Object.freeze({
    ...config,
    connectionTimeoutMillis: LOCAL_DIRECT_POOL_POLICY.connectionTimeoutMillis,
    keepAlive: true,
    application_name: 'afex-a25-pd6-local-direct-control',
    ssl: false
  }));
  let transactionStarted = false;
  let lockAcquired = false;
  let primaryFailure = null;
  let cleanupFailure = null;
  let rollbackAttempts = 0;
  let endAttempts = 0;
  let controlTerminal = false;
  const rollbackOnce = async () => {
    if (!controlTerminal || !transactionStarted || rollbackAttempts !== 0) return;
    rollbackAttempts = 1;
    try {
      await withinDeadline(
        () => client.query({ text: 'ROLLBACK', values: [] }),
        LOCK_CONTROL_TIMEOUTS.rollbackMs,
        scheduler
      );
    } catch {
      cleanupFailure = new AdapterFailure('PG_ROLLBACK_FAILED', { stage: 'lock_control_cleanup' });
    }
  };
  const endOnce = async () => {
    if (!controlTerminal || endAttempts !== 0) return;
    endAttempts = 1;
    try {
      await withinDeadline(() => client.end(), LOCK_CONTROL_TIMEOUTS.endMs, scheduler);
    } catch {
      cleanupFailure ??= new AdapterFailure('PG_CLIENT_DESTROY_REQUIRED', { stage: 'lock_control_cleanup' });
    }
  };
  try {
    await withinDeadline(() => client.connect(), LOCK_CONTROL_TIMEOUTS.connectMs, scheduler);
    await withinDeadline(
      () => client.query({ text: 'BEGIN', values: [] }),
      LOCK_CONTROL_TIMEOUTS.beginMs,
      scheduler
    );
    transactionStarted = true;
    await withinDeadline(
      () => client.query(resolveLocalPgOperation({ operationId: 'LOCK_TARGET_UPDATE', values: [] })),
      LOCK_CONTROL_TIMEOUTS.lockMs,
      scheduler
    );
    lockAcquired = true;
    await withinDeadline(
      () => criticalSection(Object.freeze({ controlLabel: 'CONTROL', lockAcquired: true })),
      LOCK_CONTROL_TIMEOUTS.criticalSectionMs,
      scheduler
    );
  } catch (error) {
    const mapped = mapBoundedError(error, { stage: transactionStarted ? 'query' : 'connect' });
    primaryFailure = new AdapterFailure(mapped.failureCode, { stage: 'lock_control', sqlstate: mapped.sqlstate });
  } finally {
    controlTerminal = true;
    await rollbackOnce();
    await endOnce();
  }
  if (cleanupFailure) throw cleanupFailure;
  if (primaryFailure) throw primaryFailure;
  return Object.freeze({
    controlLabel: 'CONTROL',
    lockAcquired,
    rollbackAttempts,
    closed: endAttempts === 1
  });
}

function validateScheduler(scheduler) {
  if (!scheduler || typeof scheduler.setTimeout !== 'function' || typeof scheduler.clearTimeout !== 'function') {
    throw new TypeError('PD6_CONTROL_SCHEDULER_REQUIRED');
  }
}

async function withinDeadline(operation, milliseconds, scheduler) {
  let handle;
  const operationPromise = Promise.resolve().then(operation);
  const deadlinePromise = new Promise((_, reject) => {
    handle = scheduler.setTimeout(
      () => reject(new Error('PD6_CONTROL_DEADLINE_EXPIRED')),
      milliseconds
    );
  });
  try {
    return await Promise.race([operationPromise, deadlinePromise]);
  } finally {
    scheduler.clearTimeout(handle);
  }
}

export function createBoundedResult(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('PD6_RESULT_INVALID');
  if (Object.keys(input).some((key) => !RESULT_KEYS.includes(key))) throw new TypeError('PD6_RESULT_UNKNOWN_FIELD');
  if (RESULT_KEYS.some((key) => !Object.hasOwn(input, key))) throw new TypeError('PD6_RESULT_MISSING_FIELD');
  assertEnum(input.scenario_id, PD6_SCENARIO_IDS, 'SCENARIO_ID');
  assertEnum(input.evidence_tier, EVIDENCE_TIERS, 'EVIDENCE_TIER');
  assertEnum(input.endpoint_class, ENDPOINT_CLASSES, 'ENDPOINT_CLASS');
  if (input.driver_version !== '8.22.0') throw new TypeError('PD6_RESULT_DRIVER_VERSION');
  if (input.postgres_version !== null
      && (typeof input.postgres_version !== 'string' || input.postgres_version.length === 0 || input.postgres_version.length > 32)) {
    throw new TypeError('PD6_RESULT_POSTGRES_VERSION');
  }
  assertEnum(input.terminal_classification, TERMINAL_CLASSIFICATIONS, 'TERMINAL_CLASSIFICATION');
  assertEnum(input.release_action, RELEASE_ACTIONS, 'RELEASE_ACTION');
  if (input.failure_code !== null && !isFailureCode(input.failure_code)) throw new TypeError('PD6_RESULT_FAILURE_CODE');
  if (input.sqlstate !== null && !SQLSTATE_ALLOWLIST.includes(input.sqlstate)) throw new TypeError('PD6_RESULT_SQLSTATE');
  assertNullableEnum(input.transaction_status_before, RESULT_TRANSACTION_STATUSES, 'TRANSACTION_STATUS_BEFORE');
  assertNullableEnum(input.transaction_status_after, RESULT_TRANSACTION_STATUSES, 'TRANSACTION_STATUS_AFTER');
  if (!Number.isInteger(input.rollback_attempts) || input.rollback_attempts < 0 || input.rollback_attempts > 1) {
    throw new TypeError('PD6_RESULT_ROLLBACK_ATTEMPTS');
  }
  if (input.retry_attempted !== false) throw new TypeError('PD6_RESULT_RETRY_ATTEMPTED');
  for (const key of ['client_destroyed', 'replacement_observed', 'pass']) {
    if (typeof input[key] !== 'boolean') throw new TypeError(`PD6_RESULT_${key.toUpperCase()}`);
  }
  assertNullableEnum(input.decoded_value_class, DECODED_VALUE_CLASSES, 'DECODED_VALUE_CLASS');
  return Object.freeze({ ...input, sqlstate: retainSqlstate(input.sqlstate) });
}

export function canonicalEvidenceDigest(results) {
  if (!Array.isArray(results)) throw new TypeError('PD6_RESULTS_REQUIRED');
  const canonical = results.map(createBoundedResult).sort((a, b) => a.scenario_id.localeCompare(b.scenario_id));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function assertEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new TypeError(`PD6_RESULT_${label}`);
}

function assertNullableEnum(value, allowed, label) {
  if (value !== null) assertEnum(value, allowed, label);
}
