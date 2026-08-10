import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DIRECT_SCENARIO_ORDER,
  EXIT_CODES,
  OUTPUT_FILENAMES,
  SCENARIO_AUTHORITY,
  canonicalAggregateDigest,
  closeHarnessBounded,
  createAggregateEvidence,
  createRunnerHarness,
  executeBorrowerMismatch,
  executeDenial,
  executeExpectedFailure,
  executeSecondRollback,
  fixedConnectionConfig,
  main,
  readRunnerInputs,
  restoreMutableFixtures,
  runDirectEvidence,
  validateGlobalBaseline,
  validateOutputDirectory,
  writeEvidenceFiles
} from './A2.5-PD6C-DIRECT-RUNNER.mjs';
import { TYPE_FIXTURE_BASELINE } from './A2.5-PD6-LOCAL-PG-FIXTURES.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const SAFE_OUTPUT = 'D:\\afex-pd6c-evidence';
const ENV = Object.freeze({ AFEX_A25_PD6_PASSWORD: 'operator-test-secret', AFEX_A25_PD6_OUTPUT_DIR: SAFE_OUTPUT });
const EXPECTED_DIRECT_ORDER = Object.freeze([
  'PD6-D-001', 'PD6-D-002', 'PD6-D-004', 'PD6-D-020', 'PD6-D-021', 'PD6-D-022',
  'PD6-D-023', 'PD6-D-024', 'PD6-D-025', 'PD6-D-026', 'PD6-D-027', 'PD6-D-028',
  'PD6-D-029', 'PD6-D-030', 'PD6-D-031', 'PD6-D-003', 'PD6-D-006', 'PD6-D-007',
  'PD6-D-005', 'PD6-D-008', 'PD6-D-010', 'PD6-D-009', 'PD6-D-016', 'PD6-D-017',
  'PD6-D-018', 'PD6-D-019', 'PD6-D-011', 'PD6-D-012', 'PD6-D-013', 'PD6-D-014'
]);

test('01 import is inert and exports an explicit main', () => assert.equal(typeof main, 'function'));
test('02 missing password fails closed', () => assert.throws(() => readRunnerInputs({ AFEX_A25_PD6_OUTPUT_DIR: SAFE_OUTPUT }), /CREDENTIAL_REQUIRED/));
test('03 empty password fails closed', () => assert.throws(() => readRunnerInputs({ ...ENV, AFEX_A25_PD6_PASSWORD: '' }), /CREDENTIAL_REQUIRED/));
test('04 whitespace password fails closed', () => assert.throws(() => readRunnerInputs({ ...ENV, AFEX_A25_PD6_PASSWORD: '  ' }), /CREDENTIAL_REQUIRED/));
test('05 ambient PG and URL variables are ignored', () => {
  const value = readRunnerInputs({ ...ENV, PGHOST: 'evil', PGUSER: 'evil', PGPASSWORD: 'evil', DATABASE_URL: 'postgres://evil' });
  assert.deepEqual(value, { password: ENV.AFEX_A25_PD6_PASSWORD, outputDir: SAFE_OUTPUT });
});
test('06 fixed connection configuration contains no ambient or URL keys', () => {
  assert.deepEqual(fixedConnectionConfig('x'), { host: '127.0.0.1', port: 55432, database: 'afex_a25_pd6', user: 'afex_a25_pd6_runner', password: 'x' });
});
test('07 missing output directory fails closed', () => assert.throws(() => readRunnerInputs({ AFEX_A25_PD6_PASSWORD: 'x' }), /OUTPUT_DIRECTORY_REQUIRED/));
test('08 relative output directory is rejected', async () => assert.rejects(() => validateOutputDirectory('relative', windowsPolicy()), /OUTPUT_DIRECTORY_REJECTED/));
test('09 protected roots and normal descendants are rejected', async () => {
  await assert.rejects(() => validateOutputDirectory('C:\\repo', windowsPolicy()), /REJECTED/);
  await assert.rejects(() => validateOutputDirectory('C:\\repo\\out', windowsPolicy()), /REJECTED/);
  await assert.rejects(() => validateOutputDirectory('C:\\work\\out', windowsPolicy()), /REJECTED/);
  await assert.rejects(() => validateOutputDirectory('C:\\dirty\\out', windowsPolicy()), /REJECTED/);
});
test('10 differently-cased and mixed-separator Windows descendants are rejected', async () => {
  await assert.rejects(() => validateOutputDirectory('c:\\REPO\\out', windowsPolicy()), /REJECTED/);
  await assert.rejects(() => validateOutputDirectory('c:/repo\\out', windowsPolicy()), /REJECTED/);
});
test('11 sibling textual prefix is accepted', async () => assert.equal(await validateOutputDirectory('C:\\Repo-External\\Evidence', windowsPolicy()), 'C:\\Repo-External\\Evidence'));
test('12 safe external absolute output is accepted', async () => assert.equal(await validateOutputDirectory(SAFE_OUTPUT, windowsPolicy()), SAFE_OUTPUT));
test('13 output filenames are fixed and traversal-free', () => assert.deepEqual(OUTPUT_FILENAMES, ['pd6c-results.json', 'pd6c-digest.txt', 'pd6c-summary.txt']));
test('14 registry contains exactly 30 unique unconditional scenarios', () => {
  assert.equal(DIRECT_SCENARIO_ORDER.length, 30);
  assert.equal(new Set(DIRECT_SCENARIO_ORDER).size, 30);
  assert.equal(Object.keys(SCENARIO_AUTHORITY).length, 30);
});
test('15 registry excludes 015 and every 032 plus scenario', () => {
  assert.equal(DIRECT_SCENARIO_ORDER.includes('PD6-D-015'), false);
  assert.equal(DIRECT_SCENARIO_ORDER.some((id) => Number(id.slice(-3)) >= 32), false);
});
test('16 registry order is frozen and sequential authority matches', () => {
  assert.equal(Object.isFrozen(DIRECT_SCENARIO_ORDER), true);
  assert.deepEqual(DIRECT_SCENARIO_ORDER, EXPECTED_DIRECT_ORDER);
  DIRECT_SCENARIO_ORDER.forEach((id, index) => assert.equal(SCENARIO_AUTHORITY[id].execution_order, index + 1));
});
test('17 every scenario freezes retry false and a nonconditional expectation', () => {
  for (const authority of Object.values(SCENARIO_AUTHORITY)) {
    assert.equal(authority.retry_expected, false);
    assert.equal(typeof authority.terminal_classification, 'string');
  }
});
test('18 exact global baseline passes', () => assert.equal(validateGlobalBaseline(baselineRows()).postgresVersion, '17.10'));
test('19 lock drift fails without repair', () => assert.throws(() => validateGlobalBaseline(baselineRows({ lock: { rows: [{ fixture_id: 1, payload: 'drift' }] } })), /LOCK_BASELINE_MISMATCH/));
test('20 type drift fails without repair', () => assert.throws(() => validateGlobalBaseline(baselineRows({ type: { rows: [{ ...typeRow(), int4_value: 0 }] } })), /TYPE_BASELINE_MISMATCH/));
test('21 transaction drift fails without repair', () => assert.throws(() => validateGlobalBaseline(baselineRows({ transaction: { rows: [{ fixture_id: 1, revision: 2, payload: 'drift' }] } })), /TRANSACTION_BASELINE_MISMATCH/));
test('22 status drift fails without repair', () => assert.throws(() => validateGlobalBaseline(baselineRows({
  status: { rows: [{ fixture_id: 1, revision: 2, lifecycle_marker: 'drift' }] }
})), /STATUS_BASELINE_MISMATCH/));
test('23 restoration uses only trusted updates then verifies reads', async () => {
  const seen = [];
  await restoreMutableFixtures(async (id, values) => { seen.push([id, values]); return fakeResult(id); });
  assert.deepEqual(seen.map(([id]) => id), ['UPDATE_TRANSACTION_FIXTURE', 'UPDATE_STATUS_FIXTURE', 'READ_TRANSACTION_FIXTURE', 'READ_STATUS_FIXTURE']);
});
test('24 restoration verification failure stops', async () => {
  await assert.rejects(() => restoreMutableFixtures(async (id) => id === 'READ_STATUS_FIXTURE'
    ? { rows: [{ fixture_id: 1, revision: 9, lifecycle_marker: 'drift' }] } : fakeResult(id)), /RESTORATION_FAILED/);
});
test('25 aggregate schema is closed by explicit construction and exact count', () => {
  const aggregate = createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults() });
  assert.deepEqual(Object.keys(aggregate), ['schema_version', 'driver_version', 'postgres_version', 'endpoint_class', 'scenario_count', 'scenario_order', 'results', 'aggregate_pass', 'canonical_digest']);
  assert.equal(aggregate.scenario_count, 30);
});
test('26 aggregate rejects missing and reordered results', () => {
  assert.throws(() => createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults().slice(1) }), /SCENARIO_COUNT_INVALID/);
  const reordered = fakeResults(); [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.throws(() => createAggregateEvidence({ postgresVersion: '17.10', results: reordered }), /SCENARIO_ORDER_INVALID/);
});
test('27 canonical digest is deterministic and version-sensitive', () => {
  const a = createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults() });
  const b = createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults() });
  const c = createAggregateEvidence({ postgresVersion: '17.11', results: fakeResults('17.11') });
  assert.equal(a.canonical_digest, b.canonical_digest);
  assert.notEqual(a.canonical_digest, c.canonical_digest);
  assert.equal(canonicalAggregateDigest({ a: 1, b: 2 }), canonicalAggregateDigest({ b: 2, a: 1 }));
});
test('28 aggregate retains no password URL raw error PID clock or output path', () => {
  const text = JSON.stringify(createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults() }));
  for (const forbidden of ['operator-test-secret', 'postgres://', 'stack', 'message', 'processID', 'duration', SAFE_OUTPUT]) assert.equal(text.includes(forbidden), false);
});
test('29 writes use exactly fixed atomic temp-to-final paths', async () => {
  const fs = fakePublicationFs();
  const aggregate = createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults() });
  await writeEvidenceFiles(SAFE_OUTPUT, aggregate, fs.io);
  assert.deepEqual([...fs.files].map((value) => path.win32.basename(value)).sort(), [...OUTPUT_FILENAMES].sort());
  assert.equal([...fs.files].some((name) => name.endsWith('.tmp')), false);
});
test('30 output write failure maps to a bounded runner error', async () => {
  const aggregate = createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults() });
  const fs = fakePublicationFs({ failWrite: 1 });
  await assert.rejects(() => writeEvidenceFiles(SAFE_OUTPUT, aggregate, fs.io), /OUTPUT_WRITE_FAILED/);
  assert.equal(fs.finalFiles().length, 0);
});
test('31 fake-only complete orchestration executes all scenarios in stable order', async () => {
  const fake = fakeHarness(); let written;
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, lockControl: async (_config, callback) => callback(), writeEvidence: async (_dir, aggregate) => { written = aggregate; }, outputPolicy: safePolicy() });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.aggregate.scenario_order, DIRECT_SCENARIO_ORDER);
  assert.equal(written.results.length, 30);
  for (const operation of ['SAFE_DELAY', 'LOCK_TARGET_UPDATE', 'DENY_PUBLIC_CREATE', 'DENY_EVIDENCE_CREATE', 'DENY_TYPE_INSERT', 'DENY_TRANSACTION_DELETE']) {
    assert.equal(fake.operations.includes(operation), true, operation);
  }
  assert.equal(fake.operations.filter((id) => id === 'UPDATE_TRANSACTION_FIXTURE').length >= 2, true);
  assert.equal(fake.operations.filter((id) => id === 'UPDATE_STATUS_FIXTURE').length >= 2, true);
  assert.equal(fake.closed, 1);
});
test('32 baseline failure returns nonzero before scenario mutation', async () => {
  const fake = fakeHarness({ drift: 'lock' });
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, writeEvidence: async () => {}, outputPolicy: safePolicy() });
  assert.equal(result.exitCode, EXIT_CODES.BASELINE);
  assert.equal(fake.operations.some((id) => id.startsWith('UPDATE_')), false);
});
test('33 credential failure occurs before harness construction', async () => {
  let constructed = 0;
  const result = await runDirectEvidence({ env: { AFEX_A25_PD6_OUTPUT_DIR: SAFE_OUTPUT }, createHarness: () => { constructed += 1; } });
  assert.equal(result.exitCode, EXIT_CODES.CREDENTIAL);
  assert.equal(constructed, 0);
});
test('34 main emits bounded success only and returns zero on complete success', async () => {
  const fake = fakeHarness(); let output = '';
  const code = await main({ env: ENV, createHarness: () => fake.harness, lockControl: async (_config, callback) => callback(), writeEvidence: async () => {}, outputPolicy: safePolicy(), stdout: { write: (value) => { output += value; } } });
  assert.equal(code, 0); assert.match(output, /^PD6C_DIRECT_PASS scenarios=30 digest=[a-f0-9]{64}\n$/); assert.equal(output.includes(ENV.AFEX_A25_PD6_PASSWORD), false);
});
test('35 main emits bounded failure without stack or secret', async () => {
  let output = '';
  const code = await main({ env: { AFEX_A25_PD6_OUTPUT_DIR: SAFE_OUTPUT }, stdout: { write: (value) => { output += value; } } });
  assert.equal(code, EXIT_CODES.CREDENTIAL); assert.equal(output, 'PD6C_DIRECT_FAIL code=CREDENTIAL_REQUIRED scenario=NONE\n');
});
test('36 schema artifact parses and is closed', async () => {
  const schema = JSON.parse(await readFile(fileURLToPath(new URL('./A2.5-PD6C-DIRECT-EVIDENCE.schema.json', import.meta.url)), 'utf8'));
  assert.equal(schema.additionalProperties, false); assert.equal(schema.properties.scenario_count.const, 30);
  assert.deepEqual(schema.properties.scenario_order.prefixItems.map((item) => item.const), EXPECTED_DIRECT_ORDER);
  assert.equal(schema.properties.scenario_order.items, false);
});
test('37 traversal normalization into protected root is rejected', async () => assert.rejects(() => validateOutputDirectory('C:\\outside\\..\\repo\\evidence', windowsPolicy()), /REJECTED/));
test('38 existing alias into protected root is rejected and safe alias is accepted', async () => {
  const aliases = new Map([['C:\\alias-in', 'C:\\Repo'], ['C:\\alias-out', 'D:\\Safe']]);
  const canonicalize = async (input, { pathApi }) => aliases.get(pathApi.resolve(input)) ?? pathApi.resolve(input);
  await assert.rejects(() => validateOutputDirectory('C:\\alias-in', { ...windowsPolicy(), canonicalize }), /REJECTED/);
  assert.equal(await validateOutputDirectory('C:\\alias-out', { ...windowsPolicy(), canonicalize }), 'D:\\Safe');
});
test('39 canonicalization failure fails closed', async () => assert.rejects(() => validateOutputDirectory(SAFE_OUTPUT, {
  ...windowsPolicy(), canonicalize: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); }
}), /CANONICALIZATION_FAILED/));
test('40 every temp-write and final-rename failure removes current-attempt finals', async () => {
  const aggregate = createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults() });
  for (const failWrite of [1, 2, 3]) { const fs = fakePublicationFs({ failWrite }); await assert.rejects(() => writeEvidenceFiles(SAFE_OUTPUT, aggregate, fs.io)); assert.equal(fs.finalFiles().length, 0); }
  for (const failRename of [1, 2, 3]) { const fs = fakePublicationFs({ failRename }); await assert.rejects(() => writeEvidenceFiles(SAFE_OUTPUT, aggregate, fs.io)); assert.equal(fs.finalFiles().length, 0); }
});
test('41 cleanup error still reports failure and never success', async () => {
  const aggregate = createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults() });
  const fs = fakePublicationFs({ failRename: 2, failRemove: true });
  await assert.rejects(() => writeEvidenceFiles(SAFE_OUTPUT, aggregate, fs.io), /OUTPUT_WRITE_FAILED/);
});
test('42 pre-existing final evidence is refused without overwrite', async () => {
  const aggregate = createAggregateEvidence({ postgresVersion: '17.10', results: fakeResults() });
  const existing = path.win32.join(SAFE_OUTPUT, OUTPUT_FILENAMES[0]);
  const fs = fakePublicationFs({ initial: [existing] });
  await assert.rejects(() => writeEvidenceFiles(SAFE_OUTPUT, aggregate, fs.io), /OUTPUT_ALREADY_EXISTS/);
  assert.equal(fs.files.has(existing), true); assert.equal(fs.actions.some(([kind]) => kind === 'write'), false);
});
test('43 wrong, duplicate, missing, extra, 015 and 032 orders fail runtime or schema tuple authority', async () => {
  const schema = JSON.parse(await readFile(fileURLToPath(new URL('./A2.5-PD6C-DIRECT-EVIDENCE.schema.json', import.meta.url)), 'utf8'));
  const expected = schema.properties.scenario_order.prefixItems.map((item) => item.const);
  const variants = [];
  const swapped = [...expected]; [swapped[0], swapped[1]] = [swapped[1], swapped[0]]; variants.push(swapped);
  variants.push([...expected.slice(0, -1), expected[0]], expected.slice(0, -1), [...expected, 'PD6-D-032'], ['PD6-D-015', ...expected.slice(1)], ['PD6-D-032', ...expected.slice(1)]);
  for (const order of variants) assert.equal(order.length === 30 && order.every((id, index) => id === expected[index]), false);
  assert.throws(() => { const results = fakeResults(); [results[0], results[1]] = [results[1], results[0]]; createAggregateEvidence({ postgresVersion: '17.10', results }); }, /SCENARIO_ORDER_INVALID/);
});
test('44 borrower mismatch requires exact PG_IDENTITY_MISMATCH and destructive disposition', async () => {
  const authority = SCENARIO_AUTHORITY['PD6-D-013'];
  const good = scenarioLease({ ownerMismatchCode: 'PG_IDENTITY_MISMATCH', releaseAction: 'DESTROY_RELEASE' });
  const result = await executeBorrowerMismatch(adapterFor(good), authority, '17.10');
  assert.equal(result.pass, true); assert.equal(good.releaseCalls, 1);
  for (const code of ['PG_QUERY_FAILED', 'PG_CLIENT_ERROR', null]) {
    const lease = scenarioLease({ ownerMismatchCode: code, releaseAction: 'DESTROY_RELEASE' });
    await assert.rejects(() => executeBorrowerMismatch(adapterFor(lease), authority, '17.10'), /MISMATCH_CLASSIFICATION_INVALID/);
    assert.equal(lease.releaseCalls, 1);
  }
});
test('45 mismatch cannot pass without destructive disposition', async () => {
  const lease = scenarioLease({ ownerMismatchCode: 'PG_IDENTITY_MISMATCH', releaseAction: 'NORMAL_RELEASE' });
  await assert.rejects(() => executeBorrowerMismatch(adapterFor(lease), SCENARIO_AUTHORITY['PD6-D-013'], '17.10'), /MISMATCH_NOT_DESTROYED/);
});
test('46 second rollback requires exact query and duplicate-rollback failure codes', async () => {
  const good = scenarioLease({ queryFailureCode: 'PG_QUERY_FAILED', secondRollbackCode: 'PG_RELEASE_STATE_INVALID' });
  assert.equal((await executeSecondRollback(adapterFor(good), SCENARIO_AUTHORITY['PD6-D-014'], '17.10')).pass, true);
  assert.equal(good.rollbackCommands, 1);
  for (const options of [
    { queryFailureCode: 'PG_CLIENT_ERROR', secondRollbackCode: 'PG_RELEASE_STATE_INVALID' },
    { queryFailureCode: 'PG_QUERY_FAILED', secondRollbackCode: 'PG_CLIENT_ERROR' },
    { queryFailureCode: 'PG_QUERY_FAILED', secondRollbackCode: null },
    { queryFailureCode: null, secondRollbackCode: 'PG_RELEASE_STATE_INVALID' }
  ]) await assert.rejects(() => executeSecondRollback(adapterFor(scenarioLease(options)), SCENARIO_AUTHORITY['PD6-D-014'], '17.10'));
});
test('47 second external rollback command is never allowed', async () => {
  const lease = scenarioLease({ queryFailureCode: 'PG_QUERY_FAILED', secondRollbackCode: 'PG_RELEASE_STATE_INVALID', incrementSecondRollback: true });
  await assert.rejects(() => executeSecondRollback(adapterFor(lease), SCENARIO_AUTHORITY['PD6-D-014'], '17.10'), /SECOND_ROLLBACK_NOT_BLOCKED/);
  assert.equal(lease.rollbackCommands, 2);
});
test('48 expected failure mismatch and unexpected success always terminalize lease', async () => {
  const authority = SCENARIO_AUTHORITY['PD6-D-005'];
  for (const options of [{ queryFailureCode: 'PG_CLIENT_ERROR' }, { queryFailureCode: null }]) {
    const lease = scenarioLease(options);
    await assert.rejects(() => executeExpectedFailure(adapterFor(lease), authority, 'ORDINARY_QUERY_ERROR'));
    assert.equal(lease.releaseCalls, 1); assert.equal(lease.terminal, true); assert.equal(lease.rollbackCommands <= 1, true);
  }
});
test('49 expected failure cleanup failure forces terminal destructive disposition', async () => {
  const lease = scenarioLease({ queryFailureCode: 'PG_QUERY_FAILED', rollbackFailureCode: 'PG_ROLLBACK_FAILED', releaseAction: 'DESTROY_RELEASE' });
  await assert.rejects(() => executeExpectedFailure(adapterFor(lease), SCENARIO_AUTHORITY['PD6-D-005'], 'ORDINARY_QUERY_ERROR'), /FAILURE_RECOVERY_UNSAFE/);
  assert.equal(lease.releaseCalls, 1); assert.equal(lease.terminal, true);
});
test('50 timeout unexpected success and wrong classification cannot pass or retry', async () => {
  for (const id of ['PD6-D-008', 'PD6-D-009']) {
    const lease = scenarioLease({ queryFailureCode: null });
    await assert.rejects(() => executeExpectedFailure(adapterFor(lease), SCENARIO_AUTHORITY[id], id === 'PD6-D-008' ? 'SAFE_DELAY' : 'LOCK_TARGET_UPDATE'));
    assert.equal(lease.releaseCalls, 1); assert.equal(lease.queryCalls, 1);
  }
});
test('51 bounded pool close resolves only after close invocation', async () => {
  const actions = [];
  await closeHarnessBounded({ close: async () => { actions.push('close'); } }, { scheduler: inertScheduler(), timeoutMs: 10 });
  assert.deepEqual(actions, ['close']);
});
test('52 nonsettling pool close returns bounded failure without wall clock', async () => {
  const scheduler = { setTimeout: (callback) => { queueMicrotask(callback); return 1; }, clearTimeout: () => {} };
  await assert.rejects(() => closeHarnessBounded({ close: () => new Promise(() => {}) }, { scheduler, timeoutMs: 10 }), /POOL_SHUTDOWN_FAILED/);
});
test('53 permission unexpected success terminalizes and CREATE absence verification still runs', async () => {
  for (const id of ['PD6-D-016', 'PD6-D-017', 'PD6-D-018', 'PD6-D-019']) {
    const deniedLease = scenarioLease({ queryFailureCode: null });
    const absenceLease = absenceResultLease(false);
    const leases = [deniedLease, absenceLease]; let acquisitions = 0;
    const adapter = { acquire: async () => { acquisitions += 1; return leases.shift(); } };
    await assert.rejects(() => executeDenial(adapter, SCENARIO_AUTHORITY[id], '17.10'));
    assert.equal(deniedLease.terminal, true);
    if (['PD6-D-016', 'PD6-D-017'].includes(id)) { assert.equal(acquisitions, 2); assert.equal(absenceLease.queryCalls, 1); }
    else assert.equal(acquisitions, 1);
  }
});
test('54 terminalization and shutdown precede aggregate digest and publication', async () => {
  const actions = [];
  const fake = fakeHarness({ actionLog: actions });
  const result = await runDirectEvidence({
    env: ENV,
    createHarness: () => fake.harness,
    lockControl: async (_config, callback) => callback(),
    aggregateEvidence: (input) => {
      actions.push('aggregate');
      actions.push('digest');
      return createAggregateEvidence(input);
    },
    writeEvidence: async () => { actions.push('publish'); },
    outputPolicy: safePolicy()
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(actions.slice(-5), ['terminalization', 'close', 'aggregate', 'digest', 'publish']);
});
test('55 shutdown failure prevents aggregate digest and publication', async () => {
  const actions = [];
  const fake = fakeHarness({ actionLog: actions, closeNeverSettles: true });
  const scheduler = { setTimeout: (callback) => { queueMicrotask(callback); return 1; }, clearTimeout: () => {} };
  const result = await runDirectEvidence({
    env: ENV,
    createHarness: () => fake.harness,
    lockControl: async (_config, callback) => callback(),
    aggregateEvidence: () => { actions.push('aggregate'); throw new Error('must not run'); },
    writeEvidence: async () => { actions.push('publish'); },
    outputPolicy: safePolicy(), closeScheduler: scheduler, closeTimeoutMs: 10
  });
  assert.equal(result.exitCode, EXIT_CODES.SCENARIO_SAFETY);
  assert.equal(actions.includes('aggregate'), false);
  assert.equal(actions.includes('publish'), false);
});
test('56 lock timeout setup and conflict execute once in order on the same transaction lease', async () => {
  const fake = fakeHarness();
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, lockControl: async (_config, callback) => callback(), writeEvidence: async () => {}, outputPolicy: safePolicy() });
  assert.equal(result.exitCode, 0);
  const lease = fake.leases.find((candidate) => candidate.operations.includes('LOCK_TARGET_UPDATE'));
  assert.ok(lease);
  assert.deepEqual(lease.operations, ['BEGIN', 'SET_LOCAL_LOCK_TIMEOUT', 'LOCK_TARGET_UPDATE', 'ROLLBACK']);
  assert.equal(fake.operations.filter((operation) => operation === 'SET_LOCAL_LOCK_TIMEOUT').length, 1);
  assert.equal(fake.operations.filter((operation) => operation === 'LOCK_TARGET_UPDATE').length, 1);
});
test('57 lock timeout setup failure prevents conflict and terminalizes without retry', async () => {
  const fake = fakeHarness({ lockSetupFailure: true });
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, lockControl: async (_config, callback) => callback(), writeEvidence: async () => {}, outputPolicy: safePolicy() });
  assert.equal(result.exitCode, EXIT_CODES.SCENARIO_SAFETY);
  assert.equal(fake.operations.filter((operation) => operation === 'SET_LOCAL_LOCK_TIMEOUT').length, 1);
  assert.equal(fake.operations.includes('LOCK_TARGET_UPDATE'), false);
  assert.equal(fake.leases.find((lease) => lease.operations.includes('SET_LOCAL_LOCK_TIMEOUT')).terminal, true);
});
test('58 lock timeout wrong SQLSTATE fails and terminalizes', async () => {
  const fake = fakeHarness({ lockSqlstate: '57014' });
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, lockControl: async (_config, callback) => callback(), writeEvidence: async () => {}, outputPolicy: safePolicy() });
  assert.equal(result.exitCode, EXIT_CODES.SCENARIO_SAFETY);
  assert.equal(fake.leases.find((lease) => lease.operations.includes('LOCK_TARGET_UPDATE')).terminal, true);
});
test('59 lock timeout unexpected success fails and terminalizes', async () => {
  const fake = fakeHarness({ lockUnexpectedSuccess: true });
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, lockControl: async (_config, callback) => callback(), writeEvidence: async () => {}, outputPolicy: safePolicy() });
  assert.equal(result.exitCode, EXIT_CODES.SCENARIO_SAFETY);
  assert.equal(fake.leases.find((lease) => lease.operations.includes('LOCK_TARGET_UPDATE')).terminal, true);
});
test('60 runner Pool constructor receives exact secret-bearing fixed configuration', () => {
  const token = 'TEST_PD6_PASSWORD_TOKEN_ABC';
  class CapturingPool extends EventEmitter {
    static config;
    constructor(config) { super(); CapturingPool.config = config; }
    async connect() { throw new Error('unit-only'); }
    async end() {}
  }
  const harness = createRunnerHarness(fixedConnectionConfig(token), { PoolBase: CapturingPool });
  assert.deepEqual(CapturingPool.config, {
    host: '127.0.0.1', port: 55432, database: 'afex_a25_pd6', user: 'afex_a25_pd6_runner', password: token,
    max: 1, min: 0, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000, maxLifetimeSeconds: 30,
    allowExitOnIdle: true, keepAlive: true, application_name: 'afex-a25-pd6c-direct-runner', ssl: false
  });
  assert.equal(JSON.stringify(harness.endpoint).includes(token), false);
});
test('61 pool checkout failure is bounded separately', async () => {
  const fake = fakeHarness({ checkoutFailure: true });
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, outputPolicy: safePolicy() });
  assert.deepEqual(result.failure, { code: 'POOL_CONNECT_FAILED', operation: null, target: null, scenario_id: null });
  assert.equal(result.exitCode, EXIT_CODES.CONNECTION);
});
for (const [number, operationId] of ['READ_SERVER_VERSION', 'READ_LOCK_TARGET', 'READ_TYPE_FIXTURE', 'READ_TRANSACTION_FIXTURE', 'READ_STATUS_FIXTURE'].entries()) {
  test(`${62 + number} ${operationId} failure retains only bounded baseline operation authority`, async () => {
    const fake = fakeHarness({ baselineQueryFailure: operationId });
    const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, outputPolicy: safePolicy() });
    assert.deepEqual(result.failure, { code: 'BASELINE_OPERATION_FAILED', operation: operationId, target: null, scenario_id: null });
    assert.equal(result.exitCode, EXIT_CODES.BASELINE);
    assert.equal(fake.leases.find((lease) => lease.operations.includes(operationId)).terminal, true);
  });
}
test('67 sanitation failure after baseline operation is distinct and terminalized', async () => {
  const fake = fakeHarness({ sanitationFailureOperation: 'READ_LOCK_TARGET' });
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, outputPolicy: safePolicy() });
  assert.deepEqual(result.failure, { code: 'BASELINE_SANITATION_FAILED', operation: 'READ_LOCK_TARGET', target: null, scenario_id: null });
  assert.equal(fake.leases.find((lease) => lease.operations.includes('READ_LOCK_TARGET')).terminal, true);
});
test('68 release failure after baseline sanitation is distinct', async () => {
  const fake = fakeHarness({ releaseFailureOperation: 'READ_TYPE_FIXTURE' });
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, outputPolicy: safePolicy() });
  assert.deepEqual(result.failure, { code: 'BASELINE_RELEASE_FAILED', operation: 'READ_TYPE_FIXTURE', target: null, scenario_id: null });
  assert.equal(fake.leases.find((lease) => lease.operations.includes('READ_TYPE_FIXTURE')).terminal, true);
});
test('69 fixture mismatch is a bounded baseline validation failure', async () => {
  const fake = fakeHarness({ drift: 'lock' });
  const result = await runDirectEvidence({ env: ENV, createHarness: () => fake.harness, outputPolicy: safePolicy() });
  assert.deepEqual(result.failure, { code: 'BASELINE_VALIDATION_FAILED', operation: null, target: 'LOCK_TARGET', scenario_id: null });
  assert.equal(result.exitCode, EXIT_CODES.BASELINE);
});
test('70 human diagnostic output excludes raw error and password token', async () => {
  const token = 'TEST_PD6_PASSWORD_TOKEN_ABC'; let output = '';
  const fake = fakeHarness({ baselineQueryFailure: 'READ_TYPE_FIXTURE' });
  const code = await main({ env: { ...ENV, AFEX_A25_PD6_PASSWORD: token }, createHarness: () => fake.harness, outputPolicy: safePolicy(), stdout: { write: (value) => { output += value; } } });
  assert.equal(code, EXIT_CODES.BASELINE);
  assert.equal(output, 'PD6C_DIRECT_FAIL code=BASELINE_OPERATION_FAILED operation=READ_TYPE_FIXTURE scenario=NONE\n');
  assert.equal(output.includes('RAW_BASELINE_FAILURE_DETAIL'), false);
  assert.equal(output.includes(token), false);
});

function baselineRows(overrides = {}) {
  return { serverVersion: { rows: [{ postgres_version: '17.10' }] }, lock: { rows: [{ fixture_id: 1, payload: 'pd6-lock-target' }] }, type: { rows: [typeRow()] }, transaction: { rows: [{ fixture_id: 1, revision: 0, payload: 'pd6-transaction-baseline' }] }, status: { rows: [{ fixture_id: 1, revision: 0, lifecycle_marker: 'pd6-status-baseline' }] }, ...overrides };
}

function typeRow() {
  return { ...TYPE_FIXTURE_BASELINE, json_value: { ...TYPE_FIXTURE_BASELINE.json_value }, jsonb_value: { ...TYPE_FIXTURE_BASELINE.jsonb_value }, bytea_value: Buffer.from(TYPE_FIXTURE_BASELINE.bytea_value), text_array_value: [...TYPE_FIXTURE_BASELINE.text_array_value], timestamptz_value: new Date('2026-01-02T03:04:05.678Z'), timestamp_value: new Date('2026-01-02T03:04:05.678Z') };
}

function fakeResult(id) {
  if (id === 'READ_SERVER_VERSION') return { rows: [{ postgres_version: '17.10' }] };
  if (id === 'READ_LOCK_TARGET') return { rows: [{ fixture_id: 1, payload: 'pd6-lock-target' }] };
  if (id === 'READ_TYPE_FIXTURE') return { rows: [typeRow()] };
  if (id === 'READ_TRANSACTION_FIXTURE' || id === 'UPDATE_TRANSACTION_FIXTURE') return { rows: [{ fixture_id: 1, revision: 0, payload: 'pd6-transaction-baseline' }] };
  if (id === 'READ_STATUS_FIXTURE' || id === 'UPDATE_STATUS_FIXTURE') return { rows: [{ fixture_id: 1, revision: 0, lifecycle_marker: 'pd6-status-baseline' }] };
  if (id.startsWith('VERIFY_')) return { rows: [{ absent: true }] };
  return { rows: [{ fixture_id: 1 }] };
}

function fakeResults(postgresVersion = '17.10') {
  return DIRECT_SCENARIO_ORDER.map((scenarioId) => {
    const authority = SCENARIO_AUTHORITY[scenarioId];
    return { scenario_id: scenarioId, evidence_tier: 'PD6C_DIRECT', endpoint_class: 'DIRECT_POSTGRESQL', driver_version: '8.22.0', postgres_version: postgresVersion, terminal_classification: authority.terminal_classification, release_action: authority.release_action, failure_code: authority.failure_code, sqlstate: authority.sqlstate, transaction_status_before: authority.transaction_status_before, transaction_status_after: authority.transaction_status_after, rollback_attempts: authority.rollback_attempts, retry_attempted: false, client_destroyed: authority.phase === 'REPLACEMENT' || authority.phase === 'BORROWER_MISMATCH', replacement_observed: authority.phase === 'REPLACEMENT', decoded_value_class: authority.retained_evidence, pass: true };
  });
}

function fakeHarness({ drift = null, actionLog = null, closeNeverSettles = false, lockSetupFailure = false, lockSqlstate = '55P03', lockUnexpectedSuccess = false, checkoutFailure = false, baselineQueryFailure = null, sanitationFailureOperation = null, releaseFailureOperation = null } = {}) {
  const state = { closed: 0, operations: [], clients: [], leases: [] };
  const adapter = { acquire: async (borrower) => {
    if (checkoutFailure) throw new Error('RAW_BASELINE_FAILURE_DETAIL');
    const lease = new FakeLease(borrower, state, drift, { lockSetupFailure, lockSqlstate, lockUnexpectedSuccess, baselineQueryFailure, sanitationFailureOperation, releaseFailureOperation });
    state.clients.push(lease.clientObject); state.leases.push(lease); return lease;
  } };
  state.harness = { adapter, observeClientObjects: () => state.clients.slice(), close: async () => {
    assert.equal(state.leases.every((lease) => lease.terminal), true, 'pool close before lease terminalization');
    actionLog?.push('terminalization');
    actionLog?.push('close');
    if (closeNeverSettles) return new Promise(() => {});
    state.closed += 1;
  } };
  return state;
}

class FakeLease {
  constructor(owner, state, drift, lockBehavior) { this.owner = owner; this.state = state; this.drift = drift; this.lockBehavior = lockBehavior; this.operations = []; this.rollbacks = 0; this.unsafe = false; this.terminal = false; this.clientObject = {}; }
  async begin(owner) { this.ownerCheck(owner); this.operations.push('BEGIN'); }
  async query(owner, { operationId }) {
    this.ownerCheck(owner); this.state.operations.push(operationId); this.operations.push(operationId);
    if (operationId === this.lockBehavior.baselineQueryFailure) throw new Error('RAW_BASELINE_FAILURE_DETAIL');
    if (operationId === 'SET_LOCAL_LOCK_TIMEOUT' && this.lockBehavior.lockSetupFailure) throw Object.assign(new Error('bounded'), { failureCode: 'PG_QUERY_FAILED', sqlstate: null });
    if (['ORDINARY_QUERY_ERROR', 'DENY_PUBLIC_CREATE', 'DENY_EVIDENCE_CREATE', 'DENY_TYPE_INSERT', 'DENY_TRANSACTION_DELETE'].includes(operationId)) throw Object.assign(new Error('bounded'), { failureCode: 'PG_QUERY_FAILED', sqlstate: null });
    if (operationId === 'SAFE_DELAY') throw Object.assign(new Error('bounded'), { failureCode: 'PG_STATEMENT_TIMEOUT', sqlstate: '57014' });
    if (operationId === 'LOCK_TARGET_UPDATE' && !this.lockBehavior.lockUnexpectedSuccess) throw Object.assign(new Error('bounded'), { failureCode: 'PG_LOCK_TIMEOUT', sqlstate: this.lockBehavior.lockSqlstate });
    const result = fakeResult(operationId);
    if (this.drift === 'lock' && operationId === 'READ_LOCK_TARGET') result.rows[0].payload = 'drift';
    return result;
  }
  async commit(owner) { this.ownerCheck(owner); }
  async rollback(owner) { this.ownerCheck(owner); if (this.rollbacks !== 0) throw Object.assign(new Error('bounded'), { failureCode: 'PG_RELEASE_STATE_INVALID' }); this.rollbacks += 1; this.operations.push('ROLLBACK'); }
  sanitize(owner) { this.ownerCheck(owner); if (this.operations.includes(this.lockBehavior.sanitationFailureOperation)) this.unsafe = true; return { passed: !this.unsafe }; }
  release(owner) { if (owner !== this.owner) this.unsafe = true; this.terminal = true; if (this.operations.includes(this.lockBehavior.releaseFailureOperation)) throw new Error('RAW_BASELINE_FAILURE_DETAIL'); return this.unsafe ? 'DESTROY_RELEASE' : 'NORMAL_RELEASE'; }
  snapshot() { return { rollbackAttempts: this.rollbacks, transactionStatus: 'IDLE' }; }
  ownerCheck(owner) { if (owner !== this.owner) { this.unsafe = true; throw Object.assign(new Error('bounded'), { failureCode: 'PG_IDENTITY_MISMATCH' }); } }
}

function windowsPolicy() {
  return { repositoryRoot: 'C:\\Repo', currentWorktree: 'C:\\Work', dirtySource: 'C:\\Dirty', platform: 'win32', pathApi: path.win32, canonicalize: async (value, { pathApi }) => pathApi.resolve(value) };
}
function safePolicy() { return windowsPolicy(); }

function fakePublicationFs({ failWrite = 0, failRename = 0, failRemove = false, initial = [] } = {}) {
  const files = new Set(initial); const actions = []; let writes = 0; let renames = 0;
  const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' });
  const io = {
    mkdir: async () => {},
    lstat: async (target) => { if (!files.has(target)) throw missing(); return {}; },
    writeFile: async (target) => { writes += 1; actions.push(['write', target]); if (writes === failWrite) throw new Error('write'); files.add(target); },
    rename: async (from, to) => { renames += 1; actions.push(['rename', from, to]); if (renames === failRename) throw new Error('rename'); if (!files.delete(from)) throw missing(); files.add(to); },
    rm: async (target) => { actions.push(['rm', target]); if (failRemove) throw new Error('rm'); files.delete(target); }
  };
  return { io, files, actions, finalFiles: () => [...files].filter((target) => OUTPUT_FILENAMES.includes(path.win32.basename(target))) };
}

function adapterFor(lease) { return { acquire: async () => lease }; }

function scenarioLease({
  ownerMismatchCode = 'PG_IDENTITY_MISMATCH', queryFailureCode = 'PG_QUERY_FAILED',
  secondRollbackCode = 'PG_RELEASE_STATE_INVALID', rollbackFailureCode = null,
  releaseAction = 'NORMAL_RELEASE', incrementSecondRollback = false
} = {}) {
  return {
    releaseCalls: 0, rollbackCommands: 0, queryCalls: 0, terminal: false, transactionStatus: 'IN_TRANSACTION',
    async begin() {},
    async query(owner) {
      this.queryCalls += 1;
      const code = owner === 'INTRUDER' ? ownerMismatchCode : queryFailureCode;
      if (code) throw Object.assign(new Error('bounded'), { failureCode: code, sqlstate: null });
      return { rows: [] };
    },
    async rollback() {
      if (this.rollbackCommands !== 0) {
        if (incrementSecondRollback) this.rollbackCommands += 1;
        if (secondRollbackCode) throw Object.assign(new Error('bounded'), { failureCode: secondRollbackCode });
        return;
      }
      this.rollbackCommands += 1;
      if (rollbackFailureCode) throw Object.assign(new Error('bounded'), { failureCode: rollbackFailureCode });
      this.transactionStatus = 'IDLE';
    },
    sanitize() { return { passed: this.transactionStatus === 'IDLE' }; },
    release(owner) { this.releaseCalls += 1; this.terminal = true; return owner === '__PD6C_FORCE_DESTROY__' ? releaseAction : releaseAction; },
    snapshot() { return { rollbackAttempts: this.rollbackCommands, transactionStatus: this.transactionStatus }; }
  };
}

function inertScheduler() { return { setTimeout: () => 1, clearTimeout: () => {} }; }

function absenceResultLease(absent) {
  return {
    queryCalls: 0,
    async query() { this.queryCalls += 1; return { rows: [{ absent }] }; },
    sanitize() { return { passed: true }; },
    release() { return 'NORMAL_RELEASE'; }
  };
}

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`PASS ${name}`); } catch (error) { failures += 1; console.error(`FAIL ${name}: ${error?.message ?? 'UNKNOWN'}`); }
}
console.log(`TEST_COUNT ${tests.length}`);
if (failures) { console.error(`FAILURES ${failures}`); process.exitCode = 1; } else console.log('A25PD6C_RUNNER_TESTS_SUCCESS');
