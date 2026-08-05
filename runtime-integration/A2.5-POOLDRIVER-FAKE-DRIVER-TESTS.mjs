import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LIFECYCLE_EVENTS, LIFECYCLE_STATES, canonicalJson, createLifecycleState,
  deterministicHash, reduceLifecycle, validateTimeoutHierarchy
} from './A2.5-POOLDRIVER-LIFECYCLE-CORE.mjs';
import { FakeClient, FakeClock, FakePool } from './A2.5-POOLDRIVER-FAKE-DRIVER.mjs';
import { FAKE_DRIVER_FIXTURES } from './A2.5-POOLDRIVER-FAKE-DRIVER-FIXTURES.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const AUTHORITY_MANIFEST = Object.freeze({
  'A2.4A-POSTGRESQL-DRIVER-ADR-AMENDMENT.md': 'b5c33d8f728bfdb646150d2e1d5909644a0755574916d2203bd3d1e60952b93c',
  'A2.5-POOLDRIVER-CLOSED-SCENARIO-MATRIX.json': 'bda1e4fc93b161ae6f0ac62c42cdcf8646fea2ba0d286e9f96ab283d1bb90dd3',
  'A2.5-POOLDRIVER-EVIDENCE-DESIGN.md': 'a715c5923f6551ae6acbd86c13cb3fa74c2d8e275c819aaca2adec32577cd399',
  'A2.5-POOLDRIVER-RESULT.schema.json': '33ba81f5ef8686b55feba200f1cd7017c3fca8b969a18da7a9fc8786e8602839'
});
const categories = Object.fromEntries(['lifecycle_transitions', 'invalid_transitions', 'pool_behavior', 'timeout_cancellation', 'immutability_determinism'].map((name) => [name, new Set()]));
let assertions = 0;
let fixtureExecutions = 0;

function check(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) { check(canonicalJson(actual) === canonicalJson(expected), message); }

function expectThrow(action, expected) {
  let actual = null;
  try { action(); } catch (error) { actual = error.message; }
  check(actual === expected, `EXPECTED_${expected}_GOT_${actual}`);
}

function test(category, name, action) {
  check(!categories[category].has(name), `DUPLICATE_TEST_${name}`);
  categories[category].add(name);
  action();
}

function zeroCounts() { return { total: 0, checked_out: 0, idle: 0, destroyed: 0, released: 0, queued: 0 }; }

function verifyAuthorityBoundary() {
  check(Object.isFrozen(AUTHORITY_MANIFEST), 'AUTHORITY_MANIFEST_MUTABLE');
  check(Object.keys(AUTHORITY_MANIFEST).length === 4, 'AUTHORITY_MANIFEST_COUNT_INVALID');
  for (const [path, hash] of Object.entries(AUTHORITY_MANIFEST)) {
    check(/^[0-9a-f]{64}$/.test(hash), `AUTHORITY_HASH_INVALID_${path}`);
  }
  const matrix = JSON.parse(readFileSync(join(here, 'A2.5-POOLDRIVER-CLOSED-SCENARIO-MATRIX.json'), 'utf8'));
  const schema = JSON.parse(readFileSync(join(here, 'A2.5-POOLDRIVER-RESULT.schema.json'), 'utf8'));
  check(Array.isArray(matrix.scenarios) && matrix.scenarios.length === 23, 'MATRIX_SCENARIO_COUNT_INVALID');
  check(schema.additionalProperties === false, 'RESULT_SCHEMA_NOT_CLOSED');
  return new Set(matrix.scenarios.map((scenario) => scenario.scenario_id));
}

function finishClient(client, mode = 'commit') {
  client.begin();
  if (mode === 'commit') client.commit(); else client.rollback();
  client.sanitize();
}

function executeLifecycleFixture(fixture) {
  const pool = new FakePool();
  const client = pool.checkout();
  client.lifecycle = createLifecycleState({ state: fixture.initial_state });
  client.inject(...fixture.injected_faults);
  let action = 'NONE';
  let caught = null;
  for (const event of fixture.events) {
    try {
      if (event === 'SANITATION_PASS') client.sanitize();
      else if (event === 'RELEASE_NORMAL') { client.release('normal'); action = 'NORMAL'; }
      else if (event === 'RELEASE_DESTROY') { client.release('destroy'); action = 'DESTROY'; }
      else client.apply(event);
    } catch (error) { caught = error.message; action = 'REJECT'; break; }
  }
  return { terminal: client.lifecycle.state, action, failure: caught ?? client.lifecycle.failure_code, counts: pool.counts };
}

function executeSpecialFixture(fixture, number) {
  if (number === 20 || number === 21) {
    const pool = new FakePool(); const client = pool.checkout(); finishClient(client); client.release('normal');
    let failure = null;
    try { number === 20 ? client.release('normal') : client.query('OP_AFTER_RELEASE'); } catch (error) { failure = error.message; }
    return { terminal: client.lifecycle.state, action: 'REJECT', failure, counts: pool.counts };
  }
  if (number === 22) {
    const pool = new FakePool(); const client = pool.checkout(); client.release('destroy');
    let failure = null; try { client.query('OP_AFTER_DESTROY'); } catch (error) { failure = error.message; }
    return { terminal: client.lifecycle.state, action: 'REJECT', failure, counts: pool.counts };
  }
  if (number === 23 || number === 24) {
    const terminal = number === 23 ? 'RELEASED' : 'DESTROYED';
    const result = reduceLifecycle(createLifecycleState({ state: terminal }), 'BEGIN_OK');
    return { terminal: result.state, action: 'REJECT', failure: result.failure_code, counts: zeroCounts() };
  }
  if (number === 25) {
    const pool = new FakePool({ max: 1 }); const a = pool.checkout(); const id = a.id; finishClient(a); a.release('normal');
    const b = pool.checkout(); check(b.id === id, 'FIXTURE_025_NOT_REUSED'); finishClient(b, 'rollback'); b.release('normal');
    return { terminal: b.lifecycle.state, action: 'NORMAL', failure: null, counts: pool.counts };
  }
  if (number === 26) {
    const pool = new FakePool({ max: 2 }); const a = pool.checkout(); const b = pool.checkout();
    check(a.id === 'FAKE_CLIENT_0001' && b.id === 'FAKE_CLIENT_0002', 'FIXTURE_026_ORDER_INVALID');
    return { terminal: b.lifecycle.state, action: 'NONE', failure: null, counts: pool.counts };
  }
  if (number === 27) {
    const pool = new FakePool(); const a = pool.checkout(); a.release('destroy'); const b = pool.checkout();
    check(a.id !== b.id, 'FIXTURE_027_DESTROYED_REACQUIRED');
    return { terminal: a.lifecycle.state, action: 'DESTROY', failure: null, counts: pool.counts };
  }
  if (number === 28) {
    const pool = new FakePool(); const a = pool.checkout(); a.contamination.add('BORROWER_A'); finishClient(a); a.release('normal');
    const b = pool.checkout(); check(!b.contamination.has('BORROWER_A'), 'FIXTURE_028_CONTAMINATION_LEAK');
    return { terminal: b.lifecycle.state, action: 'NORMAL', failure: null, counts: pool.counts };
  }
  if (number === 29) {
    const result = validateTimeoutHierarchy({ database_timeout_ms: 20, client_timeout_ms: 10, process_timeout_ms: 30 });
    return { terminal: 'CHECKED_OUT', action: 'REJECT', failure: result.failure_code, counts: zeroCounts() };
  }
  if (number === 30) {
    let failure = null; try { reduceLifecycle(createLifecycleState(), 'UNRECOGNIZED'); } catch (error) { failure = error.message; }
    return { terminal: 'CHECKED_OUT', action: 'REJECT', failure, counts: zeroCounts() };
  }
  if (number === 31) {
    let failure = null; try { createLifecycleState({ state: 'UNRECOGNIZED' }); } catch (error) { failure = error.message; }
    return { terminal: 'UNRECOGNIZED', action: 'REJECT', failure, counts: zeroCounts() };
  }
  if (number === 32) {
    let failure = null; try { new FakePool({ identityLabel: '' }); } catch (error) { failure = error.message; }
    return { terminal: 'CHECKED_OUT', action: 'REJECT', failure, counts: zeroCounts() };
  }
  if (number === 33) {
    const pool = new FakePool(); const client = pool.checkout(); let failure = null;
    try { client.inject('UNRECOGNIZED_FAULT'); } catch (error) { failure = error.message; }
    return { terminal: client.lifecycle.state, action: 'REJECT', failure, counts: pool.counts };
  }
  if (number === 34) {
    let failure = null;
    try { new FakeClient({}, { id: 'INVALID', backendPid: 0, identityLabel: 'FAKE_RUNTIME', recordedUtc: null }); } catch (error) { failure = error.message; }
    return { terminal: 'CHECKED_OUT', action: 'REJECT', failure, counts: zeroCounts() };
  }
  if (number === 35) {
    const input = { state: 'CHECKED_OUT' }; const before = canonicalJson(input); reduceLifecycle(input, 'IDENTITY_MATCH');
    check(canonicalJson(input) === before, 'FIXTURE_035_INPUT_MUTATED');
    return { terminal: 'CHECKED_OUT', action: 'NONE', failure: null, counts: zeroCounts() };
  }
  const events = ['BEGIN_OK', 'ROLLBACK_START', 'ROLLBACK_OK'];
  const replay = () => events.reduce((state, event) => reduceLifecycle(state, event), createLifecycleState());
  const a = replay(); const b = replay(); equal(a, b, 'FIXTURE_036_REPLAY_MISMATCH');
  return { terminal: a.state, action: 'NONE', failure: null, counts: zeroCounts() };
}

function runFixtures(scenarioIds) {
  check(Object.isFrozen(FAKE_DRIVER_FIXTURES) && FAKE_DRIVER_FIXTURES.length === 36, 'FIXTURE_CATALOG_INVALID');
  const seen = new Set();
  for (const [index, fixture] of FAKE_DRIVER_FIXTURES.entries()) {
    const number = index + 1; fixtureExecutions += 1;
    check(fixture.fixture_id === `A25-PD3-FX-${String(number).padStart(3, '0')}`, `FIXTURE_ID_INVALID_${number}`);
    check(!seen.has(fixture.fixture_id), `FIXTURE_DUPLICATE_${fixture.fixture_id}`); seen.add(fixture.fixture_id);
    check(Object.isFrozen(fixture) && Object.isFrozen(fixture.events) && Object.isFrozen(fixture.expected_pool_counts), `FIXTURE_MUTABLE_${fixture.fixture_id}`);
    check(scenarioIds.has(fixture.scenario_reference), `FIXTURE_SCENARIO_UNKNOWN_${fixture.fixture_id}`);
    const actual = number <= 19 ? executeLifecycleFixture(fixture) : executeSpecialFixture(fixture, number);
    check(actual.terminal === fixture.expected_terminal_state, `${fixture.fixture_id}_TERMINAL_${actual.terminal}`);
    check(actual.action === fixture.expected_release_action, `${fixture.fixture_id}_ACTION_${actual.action}`);
    check(actual.failure === fixture.expected_failure_code, `${fixture.fixture_id}_FAILURE_${actual.failure}`);
    equal(actual.counts, fixture.expected_pool_counts, `${fixture.fixture_id}_COUNTS_MISMATCH`);
  }
}

function runLifecycleCoverage() {
  const pairs = [];
  for (const state of LIFECYCLE_STATES) for (const event of LIFECYCLE_EVENTS) pairs.push([state, event]);
  for (const [state, event] of pairs) test('lifecycle_transitions', `${state}:${event}`, () => {
    const input = createLifecycleState({ state }); const first = reduceLifecycle(input, event); const second = reduceLifecycle(input, event);
    equal(first, second, `TRANSITION_NONDETERMINISTIC_${state}_${event}`);
    check(LIFECYCLE_STATES.includes(first.state), `TRANSITION_STATE_OPEN_${state}_${event}`);
  });
  const invalidPairs = [
    ['CHECKED_OUT','COMMIT_OK'],['CHECKED_OUT','ROLLBACK_OK'],['CHECKED_OUT','SANITATION_PASS'],['CHECKED_OUT','QUERY_OK'],
    ['TRANSACTION_ACTIVE','BEGIN_OK'],['TRANSACTION_ACTIVE','COMMIT_OK'],['TRANSACTION_ACTIVE','ROLLBACK_OK'],
    ['COMMITTING','BEGIN_OK'],['COMMITTING','QUERY_OK'],['COMMITTING','ROLLBACK_OK'],['COMMITTED','QUERY_OK'],
    ['ROLLING_BACK','QUERY_OK'],['ROLLING_BACK','COMMIT_OK'],['ROLLED_BACK','QUERY_OK'],['CANCELLING','QUERY_OK'],
    ['CANCELLING','COMMIT_OK'],['CANCELLED_ROLLBACK_PROVEN','QUERY_OK'],['UNKNOWN','QUERY_OK'],['UNKNOWN','RELEASE_NORMAL'],
    ['RELEASED','BEGIN_OK'],['RELEASED','RELEASE_NORMAL'],['DESTROYED','BEGIN_OK'],['DESTROYED','RELEASE_DESTROY']
  ];
  for (const [state, event] of invalidPairs) test('invalid_transitions', `${state}:${event}`, () => {
    const result = reduceLifecycle(createLifecycleState({ state }), event);
    check(result.failure_code === (['RELEASED','DESTROYED'].includes(state) ? 'TERMINAL_STATE_RESURRECTION_REJECTED' : event === 'RELEASE_NORMAL' ? 'RELEASE_STATE_INVALID' : 'LIFECYCLE_TRANSITION_INVALID'), `INVALID_PAIR_ACCEPTED_${state}_${event}`);
  });
}

function runPoolCoverage() {
  test('pool_behavior', 'max-one-queues', () => { const p=new FakePool();p.checkout();const w=p.checkout();check(w.status==='QUEUED'&&p.counts.queued===1,'MAX_ONE_QUEUE_INVALID'); });
  test('pool_behavior', 'release-wakes-oldest', () => { const p=new FakePool();const a=p.checkout();const w=p.checkout();finishClient(a);a.release('normal');check(w.status==='READY'&&w.take().id===a.id,'RELEASE_WAKE_INVALID'); });
  test('pool_behavior', 'max-two-queues', () => { const p=new FakePool({max:2});p.checkout();p.checkout();check(p.checkout().status==='QUEUED','MAX_TWO_QUEUE_INVALID'); });
  test('pool_behavior', 'three-waiter-fifo', () => { const p=new FakePool();const a=p.checkout();const w1=p.checkout(),w2=p.checkout(),w3=p.checkout();finishClient(a);a.release('normal');const b=w1.take();finishClient(b);b.release('normal');const c=w2.take();finishClient(c);c.release('normal');check(w3.status==='READY','FIFO_THREE_INVALID'); });
  test('pool_behavior', 'destroy-creates-capacity', () => { const p=new FakePool();const a=p.checkout(),w=p.checkout();a.release('destroy');check(w.take().id==='FAKE_CLIENT_0002','DESTROY_CAPACITY_INVALID'); });
  test('pool_behavior', 'cancelled-waiter-skipped', () => { const p=new FakePool();const a=p.checkout(),w1=p.checkout(),w2=p.checkout();check(w1.cancel(),'WAITER_CANCEL_FAILED');finishClient(a);a.release('normal');check(w2.status==='READY'&&p.counts.queued===0,'CANCEL_SKIP_INVALID'); });
  test('pool_behavior', 'waiter-resolves-once', () => { const p=new FakePool();const a=p.checkout(),w=p.checkout();finishClient(a);a.release('normal');w.take();expectThrow(()=>w.take(),'WAITER_ALREADY_TAKEN'); });
  test('pool_behavior', 'queued-take-rejected', () => { const p=new FakePool();p.checkout();const w=p.checkout();expectThrow(()=>w.take(),'WAITER_NOT_RESOLVED'); });
  test('pool_behavior', 'cancelled-take-rejected', () => { const p=new FakePool();p.checkout();const w=p.checkout();w.cancel();expectThrow(()=>w.take(),'WAITER_CANCELLED'); });
  test('pool_behavior', 'deterministic-identifiers', () => { const p=new FakePool({max:2});check(p.checkout().id==='FAKE_CLIENT_0001'&&p.checkout().backendPid===20002,'IDENTIFIERS_INVALID'); });
  test('pool_behavior', 'exact-checkout-counts', () => { const p=new FakePool({max:2});p.checkout();p.checkout();equal(p.counts,{total:2,checked_out:2,idle:0,destroyed:0,released:0,queued:0},'CHECKOUT_COUNTS_INVALID'); });
  test('pool_behavior', 'exact-release-counts', () => { const p=new FakePool();const a=p.checkout();finishClient(a);a.release('normal');equal(p.counts,{total:1,checked_out:0,idle:1,destroyed:0,released:1,queued:0},'RELEASE_COUNTS_INVALID'); });
  test('pool_behavior', 'exact-destroy-counts', () => { const p=new FakePool();p.checkout().release('destroy');equal(p.counts,{total:0,checked_out:0,idle:0,destroyed:1,released:0,queued:0},'DESTROY_COUNTS_INVALID'); });
  test('pool_behavior', 'destroyed-never-reacquired', () => { const p=new FakePool();const a=p.checkout();a.release('destroy');check(p.checkout().id!==a.id,'DESTROYED_REACQUIRED'); });
  test('pool_behavior', 'no-duplicate-live-client', () => { const p=new FakePool({max:2});const a=p.checkout(),b=p.checkout();check(a.id!==b.id&&a.backendPid!==b.backendPid,'DUPLICATE_LIVE_IDENTITY'); });
  test('pool_behavior', 'contaminated-normal-release-rejected', () => { const p=new FakePool();const a=p.checkout();finishClient(a);a.contamination.add('A');expectThrow(()=>a.release('normal'),'SANITATION_FAILED');check(a.lifecycle.destroy_required,'CONTAMINATION_NOT_FAIL_CLOSED'); });
  test('pool_behavior', 'sanitation-bypass-rejected', () => { const a=new FakePool().checkout();expectThrow(()=>a.apply('SANITATION_PASS'),'SANITATION_BYPASS_REJECTED'); });
  test('pool_behavior', 'sanitize-clears-contamination', () => { const a=new FakePool().checkout();a.begin();a.commit();a.contamination.add('A');a.sanitize();check(a.contamination.size===0&&a.lifecycle.sanitation_passed,'SANITATION_NOT_EXPLICIT'); });
  test('pool_behavior', 'sanitation-failure-destroys', () => { const p=new FakePool();const a=p.checkout();a.begin();a.rollback();a.inject('SANITATION_FAIL');a.sanitize();expectThrow(()=>a.release('normal'),'RELEASE_STATE_INVALID');a.release('destroy');check(a.destroyed,'SANITATION_FAILURE_NOT_DESTROYED'); });
  test('pool_behavior', 'borrower-b-clean-after-sanitation', () => { const p=new FakePool();const a=p.checkout();a.contamination.add('A');finishClient(a);a.release('normal');const b=p.checkout();check(b.contamination.size===0,'BORROWER_B_DIRTY'); });
  test('pool_behavior', 'destroy-discards-without-sanitation', () => { const p=new FakePool();const a=p.checkout();a.contamination.add('A');a.release('destroy');check(!a.lifecycle.sanitation_passed&&p.checkout().id!==a.id,'DESTROY_SANITATION_OVERCLAIM'); });
  test('pool_behavior', 'first-waiter-identity', () => { const p=new FakePool();p.checkout();check(p.checkout().id==='FAKE_WAITER_0001','FIRST_WAITER_ID_INVALID'); });
  test('pool_behavior', 'three-waiter-identities', () => { const p=new FakePool();p.checkout();const ids=[p.checkout().id,p.checkout().id,p.checkout().id];equal(ids,['FAKE_WAITER_0001','FAKE_WAITER_0002','FAKE_WAITER_0003'],'WAITER_ID_ORDER_INVALID'); });
  test('pool_behavior', 'same-timestamp-unique-identities', () => { const p=new FakePool();p.checkout('2026-08-05T00:00:00Z');const a=p.checkout('2026-08-05T00:00:00Z'),b=p.checkout('2026-08-05T00:00:00Z');check(a.id!==b.id,'TIMESTAMP_DERIVED_WAITER_ID'); });
  test('pool_behavior', 'fifo-identity-assignment-history', () => { const p=new FakePool();const a=p.checkout(),w1=p.checkout(),w2=p.checkout(),w3=p.checkout();const history=[];finishClient(a);a.release('normal');const b=w1.take();history.push([w1.id,b.id]);finishClient(b);b.release('normal');const c=w2.take();history.push([w2.id,c.id]);finishClient(c);c.release('normal');history.push([w3.id,w3.take().id]);equal(history,[['FAKE_WAITER_0001','FAKE_CLIENT_0001'],['FAKE_WAITER_0002','FAKE_CLIENT_0001'],['FAKE_WAITER_0003','FAKE_CLIENT_0001']],'WAITER_ASSIGNMENT_HISTORY_INVALID'); });
  test('pool_behavior', 'cancelled-identity-retained-not-reused', () => { const p=new FakePool();p.checkout();const w1=p.checkout(),w2=p.checkout(),w3=p.checkout();const id=w2.id;w2.cancel();const w4=p.checkout();check(w2.id===id&&w4.id==='FAKE_WAITER_0004'&&w3.id==='FAKE_WAITER_0003','CANCELLED_ID_REUSED'); });
  test('pool_behavior', 'release-preserves-oldest-identity', () => { const p=new FakePool();const a=p.checkout(),w=p.checkout();const id=w.id;finishClient(a);a.release('normal');check(w.id===id&&w.status==='READY','RELEASE_CHANGED_WAITER_ID'); });
  test('pool_behavior', 'destroy-preserves-oldest-identity', () => { const p=new FakePool();const a=p.checkout(),w=p.checkout();const id=w.id;a.release('destroy');check(w.id===id&&w.status==='READY','DESTROY_CHANGED_WAITER_ID'); });
  test('pool_behavior', 'resolved-waiter-cannot-resolve-twice', () => { const p=new FakePool();const a=p.checkout(),w=p.checkout();finishClient(a);a.release('normal');expectThrow(()=>w._resolve(a),'WAITER_ALREADY_FINAL'); });
  test('pool_behavior', 'waiter-identity-immutable', () => { const p=new FakePool();p.checkout();const w=p.checkout();const d=Object.getOwnPropertyDescriptor(w,'id');check(d.enumerable&&!d.writable&&!d.configurable&&Object.isFrozen(w.identity),'WAITER_ID_MUTABLE'); });
  test('pool_behavior', 'new-identity-after-resolution', () => { const p=new FakePool();const a=p.checkout(),w1=p.checkout();finishClient(a);a.release('normal');w1.take();check(p.checkout().id==='FAKE_WAITER_0002','RESOLVED_ID_REUSED'); });
  test('pool_behavior', 'independent-pool-identities', () => { const a=new FakePool(),b=new FakePool();a.checkout();b.checkout();check(a.checkout().id==='FAKE_WAITER_0001'&&b.checkout().id==='FAKE_WAITER_0001','WAITER_ID_NOT_POOL_SCOPED'); });
  test('pool_behavior', 'waiter-identity-replay', () => { const run=()=>{const p=new FakePool();const a=p.checkout(),w1=p.checkout(),w2=p.checkout();finishClient(a);a.release('normal');return [[w1.id,w1.take().id],[w2.id,w2.status]];};equal(run(),run(),'WAITER_ID_REPLAY_INVALID'); });
  for (const [name,value] of [['zero',0],['negative',-1],['noninteger',1.5],['nan',Number.NaN],['infinity',Number.POSITIVE_INFINITY],['oversized',10000]]) {
    test('pool_behavior', `invalid-waiter-sequence-${name}`, () => expectThrow(()=>new FakePool({waiterSequenceStart:value}),'WAITER_ID_SEQUENCE_INVALID'));
  }
  test('pool_behavior', 'waiter-sequence-exhaustion', () => { const p=new FakePool({waiterSequenceStart:9999});p.checkout();check(p.checkout().id==='FAKE_WAITER_9999','LAST_WAITER_ID_INVALID');expectThrow(()=>p.checkout(),'WAITER_ID_SEQUENCE_EXHAUSTED');check(p.counts.queued===1,'EXHAUSTION_CONSUMED_OR_QUEUED_ID'); });
}

function runTimeoutCoverage() {
  const invalid = [
    ['missing',{}],['zero',{database_timeout_ms:0,client_timeout_ms:20,process_timeout_ms:30}],
    ['negative',{database_timeout_ms:-1,client_timeout_ms:20,process_timeout_ms:30}],['equal',{database_timeout_ms:10,client_timeout_ms:10,process_timeout_ms:30}],
    ['reversed',{database_timeout_ms:20,client_timeout_ms:10,process_timeout_ms:30}],['noninteger',{database_timeout_ms:1.5,client_timeout_ms:20,process_timeout_ms:30}],
    ['oversized',{database_timeout_ms:10,client_timeout_ms:20,process_timeout_ms:86400001}]
  ];
  test('timeout_cancellation','valid-hierarchy',()=>check(validateTimeoutHierarchy({database_timeout_ms:10,client_timeout_ms:20,process_timeout_ms:30}).valid,'VALID_TIMEOUT_REJECTED'));
  for(const [name,value] of invalid)test('timeout_cancellation',`invalid-${name}`,()=>check(!validateTimeoutHierarchy(value).valid,`INVALID_TIMEOUT_ACCEPTED_${name}`));
  test('timeout_cancellation','client-timeout-destroy-required',()=>{let s=reduceLifecycle(createLifecycleState(),'TIMEOUT_CLIENT');check(s.destroy_required,'CLIENT_TIMEOUT_OPEN');});
  test('timeout_cancellation','process-timeout-destroy-required',()=>{let s=reduceLifecycle(createLifecycleState(),'TIMEOUT_PROCESS');check(s.destroy_required,'PROCESS_TIMEOUT_OPEN');});
  test('timeout_cancellation','cancel-failure-destroy-required',()=>{let s=reduceLifecycle(createLifecycleState({state:'TRANSACTION_ACTIVE'}),'CANCEL_FAILED');check(s.destroy_required,'CANCEL_FAILURE_OPEN');});
  test('timeout_cancellation','cancel-proven-release',()=>{let s=createLifecycleState({state:'TRANSACTION_ACTIVE'});for(const e of ['CANCEL_START','CANCEL_SETTLED','ROLLBACK_OK','SANITATION_PASS','RELEASE_NORMAL'])s=reduceLifecycle(s,e);check(s.state==='RELEASED','CANCEL_RELEASE_INVALID');});
  test('timeout_cancellation','fake-clock-order',()=>{const c=new FakeClock(),o=[];c.schedule(2,()=>o.push('B'));c.schedule(1,()=>o.push('A'));c.advance(2);equal(o,['A','B'],'CLOCK_ORDER_INVALID');});
  test('timeout_cancellation','fake-clock-cancel',()=>{const c=new FakeClock(),o=[];const id=c.schedule(1,()=>o.push('X'));check(c.cancel(id),'CLOCK_CANCEL_FALSE');c.advance(1);equal(o,[],'CLOCK_CANCEL_RAN');});
}

function runImmutabilityCoverage() {
  test('immutability_determinism','state-frozen',()=>check(Object.isFrozen(createLifecycleState()),'STATE_MUTABLE'));
  test('immutability_determinism','fixture-root-frozen',()=>check(Object.isFrozen(FAKE_DRIVER_FIXTURES),'FIXTURE_ROOT_MUTABLE'));
  test('immutability_determinism','fixture-nested-frozen',()=>check(Object.isFrozen(FAKE_DRIVER_FIXTURES[0].expected_pool_counts),'FIXTURE_NESTED_MUTABLE'));
  test('immutability_determinism','input-not-mutated',()=>{const x={state:'CHECKED_OUT'};reduceLifecycle(x,'IDENTITY_MATCH');equal(x,{state:'CHECKED_OUT'},'INPUT_MUTATED');});
  test('immutability_determinism','canonical-key-order',()=>check(canonicalJson({b:2,a:1})==='{"a":1,"b":2}','CANONICAL_ORDER_INVALID'));
  test('immutability_determinism','hash-repeat',()=>check(deterministicHash({a:1})===deterministicHash({a:1}),'HASH_NONDETERMINISTIC'));
  test('immutability_determinism','hash-lowercase',()=>check(/^[0-9a-f]{64}$/.test(deterministicHash({a:1})),'HASH_FORMAT_INVALID'));
  test('immutability_determinism','clock-repeat-order',()=>{const run=()=>{const c=new FakeClock(),o=[];c.schedule(1,()=>o.push(1));c.schedule(1,()=>o.push(2));c.advance(1);return o;};equal(run(),run(),'CLOCK_REPLAY_INVALID');});
  test('immutability_determinism','pool-id-replay',()=>check(new FakePool().checkout().id===new FakePool().checkout().id,'POOL_REPLAY_INVALID'));
  test('immutability_determinism','unknown-canonical-rejected',()=>expectThrow(()=>canonicalJson({a:undefined}),'CANONICAL_VALUE_INVALID'));
}

function run() {
  const scenarioIds = verifyAuthorityBoundary();
  runFixtures(scenarioIds); runLifecycleCoverage(); runPoolCoverage(); runTimeoutCoverage(); runImmutabilityCoverage();
  const counts = Object.freeze({ fixtures: fixtureExecutions, ...Object.fromEntries(Object.entries(categories).map(([key,value])=>[key,value.size])), assertions });
  check(counts.fixtures===36,'FIXTURE_COUNT_INVALID');
  check(counts.lifecycle_transitions>=60,'TRANSITION_MINIMUM_NOT_MET');check(counts.invalid_transitions>=20,'INVALID_MINIMUM_NOT_MET');
  check(counts.pool_behavior>=15,'POOL_MINIMUM_NOT_MET');check(counts.timeout_cancellation>=12,'TIMEOUT_MINIMUM_NOT_MET');check(counts.immutability_determinism>=10,'DETERMINISM_MINIMUM_NOT_MET');
  process.stdout.write(`A25PD3_900_FAKE_DRIVER_LIFECYCLE_TESTS_PASS ${canonicalJson(counts)}\n`);
}

try { run(); } catch (error) { process.stderr.write(`A25PD3_FAILURE_${error.message}\n`); process.exitCode=1; }
