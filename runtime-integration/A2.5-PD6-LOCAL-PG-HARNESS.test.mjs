import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import {
  LOCAL_DIRECT_IDENTITY,
  LOCAL_DIRECT_POOL_POLICY,
  LOCK_CONTROL_TIMEOUTS,
  DECODED_VALUE_CLASSES,
  ENDPOINT_CLASSES,
  EVIDENCE_TIERS,
  PD6_SCENARIO_IDS,
  RELEASE_ACTIONS,
  RESULT_TRANSACTION_STATUSES,
  TERMINAL_CLASSIFICATIONS,
  canonicalEvidenceDigest,
  createBoundedResult,
  createLocalDirectHarness,
  createLocalDirectPool,
  describeLocalConfig,
  validateExplicitLocalConfig,
  withLockControl
} from './A2.5-PD6-LOCAL-PG-HARNESS.mjs';
import { FAILURE_CODES, SQLSTATE_ALLOWLIST } from './A2.5-PD5-REAL-DRIVER-ERROR-MAP.mjs';
import {
  LOCAL_PG_OPERATION_IDS,
  LOCAL_PG_OPERATIONS,
  createLocalPgControls,
  resolveLocalPgOperation
} from './A2.5-PD6-LOCAL-PG-FIXTURES.mjs';

const PASSWORD = 'operator-only-test-value';
const validConfig = () => ({ ...LOCAL_DIRECT_IDENTITY, password: PASSWORD });
const tests = [];
const test = (name, run) => tests.push({ name, run });

class FakePool extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.ended = false;
  }
  async connect() { throw new Error('database execution unavailable in unit test'); }
  async end() { this.ended = true; }
}

class FakeClient {
  queries = [];
  query(config) { this.queries.push(config); return Promise.resolve({ rows: [] }); }
}

class FakeControlClient {
  static instances = [];
  constructor(config) {
    this.config = config;
    this.actions = [];
    this.failOn = null;
    FakeControlClient.instances.push(this);
  }
  async connect() { this.actions.push('CONNECT'); if (this.failOn === 'CONNECT') throw new Error('not retained'); }
  async query(config) {
    const action = config.text.split(/\s+/)[0];
    this.actions.push(action);
    if (this.failOn === action) throw new Error('not retained');
    return { rows: [] };
  }
  async end() { this.actions.push('END'); if (this.failOn === 'END') throw new Error('not retained'); }
}

class ManualScheduler {
  constructor() { this.pending = new Map(); this.nextHandle = 1; }
  setTimeout(callback, milliseconds) {
    const handle = this.nextHandle++;
    this.pending.set(handle, { callback, milliseconds });
    return handle;
  }
  clearTimeout(handle) { this.pending.delete(handle); }
  advance(milliseconds) {
    const next = [...this.pending.entries()].find(([, entry]) => entry.milliseconds === milliseconds);
    assert.ok(next, 'expected a pending deterministic deadline');
    const [handle, entry] = next;
    this.pending.delete(handle);
    entry.callback();
  }
}

const never = () => new Promise(() => {});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};
async function reachDeadline(scheduler, milliseconds) {
  for (let turn = 0; turn < 30
    && ![...scheduler.pending.values()].some((entry) => entry.milliseconds === milliseconds); turn += 1) {
    await Promise.resolve();
  }
  scheduler.advance(milliseconds);
}
async function reachAction(client, action) {
  for (let turn = 0; turn < 100 && !client.actions.includes(action); turn += 1) await Promise.resolve();
  assert.ok(client.actions.includes(action), `expected ${action} action`);
}

function result(overrides = {}) {
  return {
    scenario_id: 'PD6-D-001', evidence_tier: 'PD6C_DIRECT', endpoint_class: 'DIRECT_POSTGRESQL',
    driver_version: '8.22.0', postgres_version: null, terminal_classification: 'COMPLETED_SAFE',
    release_action: 'NORMAL_RELEASE', failure_code: null, sqlstate: null,
    transaction_status_before: 'IDLE', transaction_status_after: 'IDLE', rollback_attempts: 0,
    retry_attempted: false, client_destroyed: false, replacement_observed: false,
    decoded_value_class: null, pass: true, ...overrides
  };
}

test('01 explicit config is required', () => assert.throws(() => validateExplicitLocalConfig(), /PD6_CONFIG_REQUIRED/));
test('02 wrong host is rejected', () => assert.throws(() => validateExplicitLocalConfig({ ...validConfig(), host: 'localhost' }), /HOST_REJECTED/));
test('03 wrong port is rejected', () => assert.throws(() => validateExplicitLocalConfig({ ...validConfig(), port: 6543 }), /PORT_REJECTED/));
test('04 wrong database is rejected', () => assert.throws(() => validateExplicitLocalConfig({ ...validConfig(), database: 'afex_local' }), /DATABASE_REJECTED/));
test('05 wrong user is rejected', () => assert.throws(() => validateExplicitLocalConfig({ ...validConfig(), user: 'postgres' }), /USER_REJECTED/));
test('06 password is required and redacted', () => {
  assert.throws(() => validateExplicitLocalConfig({ ...LOCAL_DIRECT_IDENTITY }), /PASSWORD_REQUIRED/);
  assert.equal(JSON.stringify(describeLocalConfig()).includes(PASSWORD), false);
  assert.equal(describeLocalConfig().password, 'REDACTED');
});
test('07 production and ambient-style fields are rejected', () => {
  for (const extra of [{ connectionString: 'forbidden' }, { ssl: true }, { DATABASE_URL: 'forbidden' }]) {
    assert.throws(() => validateExplicitLocalConfig({ ...validConfig(), ...extra }), /UNKNOWN_FIELD/);
  }
});
test('08 pool policy is frozen to one', () => {
  const pool = createLocalDirectPool(validConfig(), { PoolConstructor: FakePool });
  assert.equal(pool.config.max, 1);
  assert.equal(pool.config.min, 0);
  assert.equal(pool.config.ssl, false);
  assert.deepEqual(LOCAL_DIRECT_POOL_POLICY.max, 1);
});
test('09 raw SQL descriptor and named query metadata are rejected', () => {
  assert.throws(() => resolveLocalPgOperation({ text: 'SELECT 1' }), /OPERATION_INVALID/);
  assert.throws(() => resolveLocalPgOperation({ operationId: 'READ_TYPE_FIXTURE', name: 'named' }), /OPERATION_INVALID/);
});
test('10 unknown operations and wrong values are rejected', () => {
  assert.throws(() => resolveLocalPgOperation({ operationId: 'UNKNOWN' }), /OPERATION_UNKNOWN/);
  assert.throws(() => resolveLocalPgOperation({ operationId: 'UPDATE_STATUS_FIXTURE', values: [] }), /VALUES_INVALID/);
});
test('11 trusted executor dispatches unnamed fixed query configs', async () => {
  const client = new FakeClient();
  await createLocalPgControls().execute(client, { operationId: 'READ_TYPE_FIXTURE', values: [] });
  assert.equal(client.queries.length, 1);
  assert.equal(Object.hasOwn(client.queries[0], 'name'), false);
  assert.match(client.queries[0].text, /pd6_evidence\.type_fixture/);
});
test('12 fixture operations are qualified or bounded builtins', () => {
  for (const [id, operation] of Object.entries(LOCAL_PG_OPERATIONS)) {
    assert.equal(/pd6_evidence\.|public\.a25_pd6_denial_probe|pg_catalog\.|SELECT 1 \/ 0|SET LOCAL/.test(operation.text), true, id);
    assert.equal(/afex_local|supabase|auth\.|storage\.|orders|customers|inventory|profiles/i.test(operation.text), false, id);
  }
});
test('13 cleanup and private pg operations are unavailable', () => {
  assert.equal(LOCAL_PG_OPERATION_IDS.some((id) => /DROP|CLEANUP|TERMINATE|CANCEL|PROCESS|SECRET|SOCKET|PROTOCOL/.test(id)), false);
});
test('14 unknown result fields and raw error fields are rejected', () => {
  assert.throws(() => createBoundedResult({ ...result(), message: 'secret' }), /UNKNOWN_FIELD/);
  assert.throws(() => createBoundedResult({ ...result(), stack: 'secret' }), /UNKNOWN_FIELD/);
  assert.throws(() => createBoundedResult({ ...result(), sqlstate: 'SECRET' }), /SQLSTATE/);
});
test('15 retry remains false and digest ordering is deterministic', () => {
  const first = result({ scenario_id: 'PD6-D-002' });
  const second = result({ scenario_id: 'PD6-D-001' });
  assert.equal(createBoundedResult(first).retry_attempted, false);
  assert.equal(canonicalEvidenceDigest([first, second]), canonicalEvidenceDigest([second, first]));
});
test('16 result JSON schema is closed', async () => {
  const schema = JSON.parse(await readFile(new URL('./A2.5-PD6-LOCAL-PG-RESULT.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), schema.required.slice().sort());
  assert.equal(schema.properties.retry_attempted.const, false);
  assert.equal(schema.properties.rollback_attempts.maximum, 1);
});
test('17 harness construction is inert and close is explicit', async () => {
  const harness = createLocalDirectHarness(validConfig(), { PoolConstructor: FakePool });
  assert.equal(harness.pool.ended, false);
  await harness.close();
  assert.equal(harness.pool.ended, true);
});
test('18 invalid evidence tier is rejected', () => assert.throws(() => createBoundedResult(result({ evidence_tier: 'UNIT' })), /EVIDENCE_TIER/));
test('19 invalid endpoint class is rejected', () => assert.throws(() => createBoundedResult(result({ endpoint_class: 'UNKNOWN' })), /ENDPOINT_CLASS/));
test('20 invalid release action is rejected', () => assert.throws(() => createBoundedResult(result({ release_action: 'INVALID' })), /RELEASE_ACTION/));
test('21 invalid terminal classification is rejected', () => assert.throws(() => createBoundedResult(result({ terminal_classification: 'INVALID' })), /TERMINAL_CLASSIFICATION/));
test('22 invalid transaction status is rejected', () => assert.throws(() => createBoundedResult(result({ transaction_status_after: 'INVALID' })), /TRANSACTION_STATUS_AFTER/));
test('23 rollback attempts below range are rejected', () => assert.throws(() => createBoundedResult(result({ rollback_attempts: -1 })), /ROLLBACK_ATTEMPTS/));
test('24 rollback attempts above range are rejected', () => assert.throws(() => createBoundedResult(result({ rollback_attempts: 2 })), /ROLLBACK_ATTEMPTS/));
test('25 retry string and true are rejected', () => {
  assert.throws(() => createBoundedResult(result({ retry_attempted: 'false' })), /RETRY_ATTEMPTED/);
  assert.throws(() => createBoundedResult(result({ retry_attempted: true })), /RETRY_ATTEMPTED/);
});
test('26 string booleans are rejected', () => {
  assert.throws(() => createBoundedResult(result({ client_destroyed: 'false' })), /CLIENT_DESTROYED/);
  assert.throws(() => createBoundedResult(result({ replacement_observed: 'false' })), /REPLACEMENT_OBSERVED/);
  assert.throws(() => createBoundedResult(result({ pass: 'true' })), /PASS/);
});
test('27 invalid decoded class is rejected', () => assert.throws(() => createBoundedResult(result({ decoded_value_class: 'MAP' })), /DECODED_VALUE_CLASS/));
test('28 invalid scenario ID is rejected', () => assert.throws(() => createBoundedResult(result({ scenario_id: 'PD6-D-999' })), /SCENARIO_ID/));
test('29 invalid allowed-field failure code is rejected', () => assert.throws(() => createBoundedResult(result({ failure_code: 'PG_UNKNOWN' })), /FAILURE_CODE/));
test('30 runtime and JSON schema vocabularies have exact parity', async () => {
  const schema = JSON.parse(await readFile(new URL('./A2.5-PD6-LOCAL-PG-RESULT.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(schema.properties.scenario_id.enum, PD6_SCENARIO_IDS);
  assert.deepEqual(schema.properties.evidence_tier.enum, EVIDENCE_TIERS);
  assert.deepEqual(schema.properties.endpoint_class.enum, ENDPOINT_CLASSES);
  assert.deepEqual(schema.properties.terminal_classification.enum, TERMINAL_CLASSIFICATIONS);
  assert.deepEqual(schema.properties.release_action.enum, RELEASE_ACTIONS);
  assert.deepEqual(schema.properties.failure_code.enum, [null, ...FAILURE_CODES]);
  assert.deepEqual(schema.properties.sqlstate.enum, [null, ...SQLSTATE_ALLOWLIST]);
  assert.deepEqual(schema.properties.transaction_status_before.enum, [null, ...RESULT_TRANSACTION_STATUSES]);
  assert.deepEqual(schema.properties.transaction_status_after.enum, [null, ...RESULT_TRANSACTION_STATUSES]);
  assert.deepEqual(schema.properties.decoded_value_class.enum, [null, ...DECODED_VALUE_CLASSES]);
});
test('31 lock control uses a distinct explicit control client and fixed lock operation', async () => {
  FakeControlClient.instances.length = 0;
  let observed;
  const bounded = await withLockControl(validConfig(), (control) => { observed = control; }, { ClientConstructor: FakeControlClient });
  const client = FakeControlClient.instances[0];
  assert.equal(client.config.host, '127.0.0.1');
  assert.equal(client.config.port, 55432);
  assert.equal(client.config.user, 'afex_a25_pd6_runner');
  assert.equal(client.config.application_name, 'afex-a25-pd6-local-direct-control');
  assert.deepEqual(observed, { controlLabel: 'CONTROL', lockAcquired: true });
  assert.deepEqual(client.actions, ['CONNECT', 'BEGIN', 'UPDATE', 'ROLLBACK', 'END']);
  assert.deepEqual(bounded, { controlLabel: 'CONTROL', lockAcquired: true, rollbackAttempts: 1, closed: true });
});
test('32 lock control rejects unsafe identity before creating a client', async () => {
  FakeControlClient.instances.length = 0;
  await assert.rejects(withLockControl({ ...validConfig(), user: 'postgres' }, async () => {}, { ClientConstructor: FakeControlClient }), /USER_REJECTED/);
  assert.equal(FakeControlClient.instances.length, 0);
});
test('33 lock control callback cannot supply SQL and cleanup runs after callback failure', async () => {
  FakeControlClient.instances.length = 0;
  await assert.rejects(withLockControl(validConfig(), async (control) => {
    assert.deepEqual(Object.keys(control), ['controlLabel', 'lockAcquired']);
    throw new Error('not retained');
  }, { ClientConstructor: FakeControlClient }), (error) => error.failureCode === 'PG_QUERY_FAILED' && !error.message.includes('not retained'));
  assert.deepEqual(FakeControlClient.instances[0].actions, ['CONNECT', 'BEGIN', 'UPDATE', 'ROLLBACK', 'END']);
});
test('34 lock control reports rollback cleanup failure and still closes', async () => {
  class RollbackFailClient extends FakeControlClient {
    async query(config) {
      if (config.text === 'ROLLBACK') this.failOn = 'ROLLBACK';
      return super.query(config);
    }
  }
  FakeControlClient.instances.length = 0;
  await assert.rejects(withLockControl(validConfig(), async () => {}, { ClientConstructor: RollbackFailClient }), (error) => error.failureCode === 'PG_ROLLBACK_FAILED');
  assert.deepEqual(FakeControlClient.instances[0].actions.slice(-2), ['ROLLBACK', 'END']);
});
test('35 lock control attempts close after connect failure', async () => {
  class ConnectFailClient extends FakeControlClient {
    constructor(config) { super(config); this.failOn = 'CONNECT'; }
  }
  FakeControlClient.instances.length = 0;
  await assert.rejects(withLockControl(validConfig(), async () => {}, { ClientConstructor: ConnectFailClient }), (error) => error.failureCode === 'PG_QUERY_FAILED');
  assert.deepEqual(FakeControlClient.instances[0].actions, ['CONNECT', 'END']);
});
test('36 lock control rejects every unsafe endpoint identity before construction', async () => {
  for (const invalid of [
    { host: 'localhost' }, { port: 6543 }, { database: 'afex_local' }, { user: 'postgres' }
  ]) {
    FakeControlClient.instances.length = 0;
    await assert.rejects(withLockControl({ ...validConfig(), ...invalid }, async () => {}, { ClientConstructor: FakeControlClient }));
    assert.equal(FakeControlClient.instances.length, 0);
  }
});
test('37 driver and postgres version contracts are enforced', () => {
  assert.throws(() => createBoundedResult(result({ driver_version: '8.21.0' })), /DRIVER_VERSION/);
  assert.throws(() => createBoundedResult(result({ postgres_version: '' })), /POSTGRES_VERSION/);
  assert.throws(() => createBoundedResult(result({ postgres_version: 17.10 })), /POSTGRES_VERSION/);
  assert.doesNotThrow(() => createBoundedResult(result({ postgres_version: '17.10' })));
});
test('38 lock-control budgets are explicit, bounded, and leave orchestration margin', () => {
  assert.equal(Object.isFrozen(LOCK_CONTROL_TIMEOUTS), true);
  assert.equal(Object.values(LOCK_CONTROL_TIMEOUTS).every((value) => value >= 100), true);
  const stageTotal = LOCK_CONTROL_TIMEOUTS.connectMs + LOCK_CONTROL_TIMEOUTS.beginMs
    + LOCK_CONTROL_TIMEOUTS.lockMs + LOCK_CONTROL_TIMEOUTS.criticalSectionMs
    + LOCK_CONTROL_TIMEOUTS.rollbackMs + LOCK_CONTROL_TIMEOUTS.endMs;
  assert.ok(stageTotal < LOCK_CONTROL_TIMEOUTS.overallMs);
  assert.ok(LOCK_CONTROL_TIMEOUTS.criticalSectionMs < LOCK_CONTROL_TIMEOUTS.overallMs);
});
test('39 callback resolution before deadline cleans up exactly once', async () => {
  FakeControlClient.instances.length = 0;
  const scheduler = new ManualScheduler();
  const outcome = await withLockControl(validConfig(), async () => 'discarded', {
    ClientConstructor: FakeControlClient, scheduler
  });
  assert.equal(outcome.rollbackAttempts, 1);
  assert.deepEqual(FakeControlClient.instances[0].actions.slice(-2), ['ROLLBACK', 'END']);
  assert.equal(scheduler.pending.size, 0);
});
test('40 callback rejection before deadline cleans up exactly once without retaining raw data', async () => {
  FakeControlClient.instances.length = 0;
  const scheduler = new ManualScheduler();
  await assert.rejects(withLockControl(validConfig(), async () => { throw new Error('raw-callback-secret'); }, {
    ClientConstructor: FakeControlClient, scheduler
  }), (error) => error.failureCode === 'PG_QUERY_FAILED' && !error.message.includes('raw-callback-secret'));
  assert.deepEqual(FakeControlClient.instances[0].actions.slice(-2), ['ROLLBACK', 'END']);
});
test('41 non-settling callback deadline forces exactly-once rollback and end', async () => {
  FakeControlClient.instances.length = 0;
  const scheduler = new ManualScheduler();
  const operation = withLockControl(validConfig(), never, { ClientConstructor: FakeControlClient, scheduler });
  await reachDeadline(scheduler, LOCK_CONTROL_TIMEOUTS.criticalSectionMs);
  await assert.rejects(operation, (error) => error.failureCode === 'PG_QUERY_FAILED'
    && !error.message.includes('PD6_CONTROL_DEADLINE_EXPIRED'));
  const actions = FakeControlClient.instances[0].actions;
  assert.equal(actions.filter((action) => action === 'ROLLBACK').length, 1);
  assert.equal(actions.filter((action) => action === 'END').length, 1);
});
test('42 rollback rejection still ends exactly once with bounded cleanup failure', async () => {
  class RollbackRejectClient extends FakeControlClient {
    async query(config) {
      if (config.text === 'ROLLBACK') { this.actions.push('ROLLBACK'); throw new Error('raw-rollback-secret'); }
      return super.query(config);
    }
  }
  FakeControlClient.instances.length = 0;
  await assert.rejects(withLockControl(validConfig(), async () => {}, {
    ClientConstructor: RollbackRejectClient, scheduler: new ManualScheduler()
  }), (error) => error.failureCode === 'PG_ROLLBACK_FAILED' && !error.message.includes('raw-rollback-secret'));
  assert.deepEqual(FakeControlClient.instances[0].actions.slice(-2), ['ROLLBACK', 'END']);
});
test('43 non-settling rollback expires and still ends exactly once', async () => {
  class RollbackHangClient extends FakeControlClient {
    query(config) {
      if (config.text === 'ROLLBACK') { this.actions.push('ROLLBACK'); return never(); }
      return super.query(config);
    }
  }
  FakeControlClient.instances.length = 0;
  const scheduler = new ManualScheduler();
  const operation = withLockControl(validConfig(), async () => {}, { ClientConstructor: RollbackHangClient, scheduler });
  await reachAction(FakeControlClient.instances[0], 'ROLLBACK');
  await reachDeadline(scheduler, LOCK_CONTROL_TIMEOUTS.rollbackMs);
  await assert.rejects(operation, (error) => error.failureCode === 'PG_ROLLBACK_FAILED');
  assert.deepEqual(FakeControlClient.instances[0].actions.slice(-2), ['ROLLBACK', 'END']);
});
test('44 end rejection and non-settlement both terminate as bounded close failures', async () => {
  class EndRejectClient extends FakeControlClient {
    async end() { this.actions.push('END'); throw new Error('raw-end-secret'); }
  }
  FakeControlClient.instances.length = 0;
  await assert.rejects(withLockControl(validConfig(), async () => {}, {
    ClientConstructor: EndRejectClient, scheduler: new ManualScheduler()
  }), (error) => error.failureCode === 'PG_CLIENT_DESTROY_REQUIRED' && !error.message.includes('raw-end-secret'));
  class EndHangClient extends FakeControlClient { end() { this.actions.push('END'); return never(); } }
  FakeControlClient.instances.length = 0;
  const scheduler = new ManualScheduler();
  const operation = withLockControl(validConfig(), async () => {}, { ClientConstructor: EndHangClient, scheduler });
  await reachAction(FakeControlClient.instances[0], 'END');
  await reachDeadline(scheduler, LOCK_CONTROL_TIMEOUTS.endMs);
  await assert.rejects(operation, (error) => error.failureCode === 'PG_CLIENT_DESTROY_REQUIRED');
  assert.equal(FakeControlClient.instances[0].actions.filter((action) => action === 'END').length, 1);
});
test('45 late callback resolution cannot restore success or repeat cleanup', async () => {
  FakeControlClient.instances.length = 0;
  const scheduler = new ManualScheduler();
  const callback = deferred();
  const operation = withLockControl(validConfig(), () => callback.promise, { ClientConstructor: FakeControlClient, scheduler });
  await reachDeadline(scheduler, LOCK_CONTROL_TIMEOUTS.criticalSectionMs);
  const failure = await operation.catch((error) => error);
  callback.resolve('late-raw-result');
  await Promise.resolve();
  assert.equal(failure.failureCode, 'PG_QUERY_FAILED');
  assert.deepEqual(FakeControlClient.instances[0].actions.slice(-2), ['ROLLBACK', 'END']);
});
test('46 late callback rejection is observed without state mutation or repeated cleanup', async () => {
  FakeControlClient.instances.length = 0;
  const scheduler = new ManualScheduler();
  const callback = deferred();
  const operation = withLockControl(validConfig(), () => callback.promise, { ClientConstructor: FakeControlClient, scheduler });
  await reachDeadline(scheduler, LOCK_CONTROL_TIMEOUTS.criticalSectionMs);
  const failure = await operation.catch((error) => error);
  callback.reject(new Error('late-raw-rejection'));
  await Promise.resolve();
  assert.equal(failure.failureCode, 'PG_QUERY_FAILED');
  assert.equal(FakeControlClient.instances[0].actions.filter((action) => action === 'ROLLBACK').length, 1);
  assert.equal(FakeControlClient.instances[0].actions.filter((action) => action === 'END').length, 1);
});

const outcomes = [];
for (const entry of tests) {
  try {
    await entry.run();
    outcomes.push({ name: entry.name, status: 'PASS' });
  } catch (error) {
    outcomes.push({ name: entry.name, status: 'FAIL', error: error?.message ?? String(error) });
  }
}
for (const outcome of outcomes) console.log(`${outcome.status} ${outcome.name}${outcome.error ? ` :: ${outcome.error}` : ''}`);
console.log(`TEST_COUNT ${outcomes.length}`);
if (outcomes.some((outcome) => outcome.status === 'FAIL')) {
  console.log('A25PD6B_TESTS_FAILURE');
  process.exitCode = 1;
} else {
  console.log('A25PD6B_TESTS_SUCCESS');
}
