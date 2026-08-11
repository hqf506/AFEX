import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COMPATIBILITY_CHECK_ORDER, DIAGNOSTIC_CODES, EXIT_CODES, INFRASTRUCTURE_FILE_HASHES,
  OUTPUT_FILENAMES, POOLER_AUTHORITY, POOLER_IDENTITY, POOLER_POLICY, POOLER_SCENARIO_ORDER,
  canonicalAggregateDigest, closeHarnessBounded, createAggregateEvidence, createPoolerHarness,
  canonicalInfrastructureAttestationDigest, defaultShutdownProbe, executeCompatibilityChecks,
  fixedConnectionConfig, INFRASTRUCTURE_ATTESTATION_CONSTANTS, INFRASTRUCTURE_ATTESTATION_FILENAME,
  main, readRunnerInputs, readRunningInfrastructureAttestation, resultBeforeDeadline,
  runPoolerEvidence, validateInfrastructureAttestation, validateOutputDirectory,
  validateRunningInfrastructureAttestation,
  verifyRepositoryInfrastructure, verifyShutdownRejection, writeEvidenceFiles
} from './A2.5-PD6F-POOLER-RUNNER.mjs';
import { AdapterFailure } from './A2.5-PD5-REAL-DRIVER-ERROR-MAP.mjs';
import { LOCAL_PG_OPERATION_IDS, resolveLocalPgOperation } from './A2.5-PD6-LOCAL-PG-FIXTURES.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const SAFE_OUTPUT = 'D:\\AFEX-Evidence\\A2.5-PD6F';
const ENV = Object.freeze({
  AFEX_A25_PD6_PASSWORD: 'fake-only-secret', AFEX_A25_PD6F_OUTPUT_DIR: SAFE_OUTPUT,
  AFEX_A25_PD6F_DIRTY_SOURCE: 'C:\\dirty'
});

test('01 inert import exposes explicit main', () => assert.equal(typeof main, 'function'));
test('02 missing credential fails closed', () => assert.throws(() => readRunnerInputs({ ...ENV, AFEX_A25_PD6_PASSWORD: undefined }), /CREDENTIAL_REQUIRED/));
test('03 whitespace credential fails closed', () => assert.throws(() => readRunnerInputs({ ...ENV, AFEX_A25_PD6_PASSWORD: ' ' }), /CREDENTIAL_REQUIRED/));
test('04 missing output or missing empty and whitespace dirty source fail closed', () => {
  for (const env of [
    { ...ENV, AFEX_A25_PD6F_OUTPUT_DIR: undefined },
    { ...ENV, AFEX_A25_PD6F_DIRTY_SOURCE: undefined },
    { ...ENV, AFEX_A25_PD6F_DIRTY_SOURCE: '' },
    { ...ENV, AFEX_A25_PD6F_DIRTY_SOURCE: ' ' }
  ]) assert.throws(() => readRunnerInputs(env), /OUTPUT_PATH_INVALID/);
});
test('05 ambient database variables are ignored', () => {
  const inputs = readRunnerInputs({ ...ENV, PGHOST: 'localhost', PGPORT: '5432', DATABASE_URL: 'postgres://forbidden', AFEX_A25_PD6F_INFRASTRUCTURE_DIGEST: 'caller-value' });
  assert.deepEqual(Object.keys(inputs).sort(), ['dirtySource', 'outputDir', 'password']);
});
test('06 exact fixed endpoint only', () => assert.deepEqual(fixedConnectionConfig('x'), { ...POOLER_IDENTITY, password: 'x' }));
test('07 direct and alternate ports are absent', () => assert.equal([55432, 6543, 5432].includes(POOLER_IDENTITY.port), false));
test('08 endpoint host rejects localhost and IPv6 by construction', () => assert.equal(POOLER_IDENTITY.host, '127.0.0.1'));
test('09 scenario registry is exactly PD6-D-032', () => assert.deepEqual(POOLER_SCENARIO_ORDER, ['PD6-D-032']));
test('10 provider scenarios are excluded', () => assert.equal(POOLER_SCENARIO_ORDER.some((id) => ['PD6-D-033', 'PD6-D-034'].includes(id)), false));
test('11 compatibility registry is exact closed order', () => assert.deepEqual(COMPATIBILITY_CHECK_ORDER, [
  'POOLER_BASELINE', 'UNNAMED_QUERY', 'TRANSACTION_COMMIT', 'ORDINARY_FAILURE_ROLLBACK',
  'STATEMENT_TIMEOUT', 'RESULT_BEFORE_DEADLINE', 'DESTRUCTIVE_REPLACEMENT', 'CHECKOUT_CONTENTION',
  'SANITATION_REACQUISITION', 'SHUTDOWN_BEFORE_BORROWER', 'NO_SESSION_AFFINITY', 'NO_NAMED_STATEMENTS'
]));
test('12 infrastructure attestation exact values pass', () => assert.deepEqual(validateInfrastructureAttestation(POOLER_AUTHORITY), POOLER_AUTHORITY));
test('13 product version and mode drift fail closed', () => {
  for (const [key, value] of [['pooler_product', 'OTHER'], ['pooler_version', '1.25.1'], ['pooler_mode', 'SESSION']]) {
    assert.throws(() => validateInfrastructureAttestation({ ...POOLER_AUTHORITY, [key]: value }), /INFRASTRUCTURE_ATTESTATION_INVALID/);
  }
});
test('14 infrastructure and configuration digest drift fail closed', () => {
  for (const key of ['infrastructure_digest', 'configuration_digest']) {
    assert.throws(() => validateInfrastructureAttestation({ ...POOLER_AUTHORITY, [key]: '0'.repeat(64) }), /INFRASTRUCTURE_ATTESTATION_INVALID/);
  }
});
test('15 max-one borrower policy is frozen', () => assert.equal(POOLER_POLICY.max, 1));
test('16 pool construction preserves fixed identity and no TLS fallback', () => {
  let options;
  class FakePool extends EventEmitter { constructor(value) { super(); options = value; } end() {} }
  createPoolerHarness(fixedConnectionConfig('x'), { PoolBase: FakePool });
  assert.equal(options.host, '127.0.0.1'); assert.equal(options.port, 56432); assert.equal(options.ssl, false);
});
test('17 pool construction rejects direct endpoint', () => assert.throws(() => createPoolerHarness({ ...fixedConnectionConfig('x'), port: 55432 }, { PoolBase: EventEmitter }), /POOLER_CONNECT_FAILED/));
test('18 all trusted descriptors are static unnamed configs', () => {
  for (const operationId of LOCAL_PG_OPERATION_IDS) assert.deepEqual(Object.keys(resolveLocalPgOperation({ operationId, values: Array(resolveValueCount(operationId)).fill(1) })).sort(), ['text', 'values']);
});
test('19 named descriptor field is rejected', () => assert.throws(() => resolveLocalPgOperation({ operationId: 'READ_STATUS_FIXTURE', values: [], name: 'forbidden' }), /PD6_OPERATION_INVALID/));
test('20 trusted operation authority remains exactly 18', () => assert.equal(LOCAL_PG_OPERATION_IDS.length, 18));
test('21 result-before-deadline disarms timer exactly once', async () => {
  let cleared = 0; let late;
  const scheduler = { setTimeout: (callback) => { late = callback; return 1; }, clearTimeout: () => { cleared += 1; } };
  assert.equal(await resultBeforeDeadline(async () => 'ok', 10, scheduler), 'ok'); late(); assert.equal(cleared, 1);
});
test('22 result-before-deadline maps expiry to bounded failure', async () => {
  const scheduler = { setTimeout: (callback) => { queueMicrotask(callback); return 1; }, clearTimeout: () => {} };
  await assert.rejects(() => resultBeforeDeadline(() => new Promise(() => {}), 1, scheduler), /POOLER_TRANSACTION_FAILED/);
});
test('23 successful shutdown is bounded and invoked once', async () => { let calls = 0; await closeHarnessBounded({ close: async () => { calls += 1; } }); assert.equal(calls, 1); });
test('24 shutdown failure is bounded', async () => assert.rejects(() => closeHarnessBounded({ close: async () => { throw new Error('raw'); } }), /POOLER_SHUTDOWN_FAILED/));
test('25 aggregate schema construction is exact and closed', () => {
  const evidence = aggregate();
  assert.deepEqual(Object.keys(evidence), ['schema_version', 'scenario_count', 'scenario_order', 'endpoint_class', 'evidence_tier', 'pooler_product', 'pooler_version', 'pooler_mode', 'driver_version', 'postgres_version', 'infrastructure_digest', 'configuration_digest', 'compatibility_checks', 'results', 'aggregate_pass', 'canonical_digest']);
});
test('26 aggregate binds one exact bounded result', () => { const value = aggregate(); assert.equal(value.scenario_count, 1); assert.equal(value.results.length, 1); assert.equal(value.results[0].scenario_id, 'PD6-D-032'); });
test('27 aggregate rejects reordered compatibility checks', () => { const checks = fakeChecks(); [checks[0], checks[1]] = [checks[1], checks[0]]; assert.throws(() => createAggregateEvidence({ postgresVersion: '17.10', compatibilityChecks: checks, result: fakeResult(), infrastructure: POOLER_AUTHORITY }), /SCHEMA_VALIDATION_FAILED/); });
test('28 aggregate rejects extra check fields', () => { const checks = fakeChecks(); checks[0] = { ...checks[0], detail: 'forbidden' }; assert.throws(() => createAggregateEvidence({ postgresVersion: '17.10', compatibilityChecks: checks, result: fakeResult(), infrastructure: POOLER_AUTHORITY }), /SCHEMA_VALIDATION_FAILED/); });
test('29 digest is deterministic and canonical by key order', () => assert.equal(canonicalAggregateDigest({ b: 2, a: 1 }), canonicalAggregateDigest({ a: 1, b: 2 })));
test('30 digest changes with every authority field class', () => {
  const base = aggregate();
  for (const key of ['postgres_version', 'infrastructure_digest', 'configuration_digest', 'pooler_version', 'pooler_mode']) {
    const payload = { ...base }; delete payload.canonical_digest; payload[key] = `${payload[key]}x`;
    assert.notEqual(canonicalAggregateDigest(payload), base.canonical_digest);
  }
  for (const mutation of [
    (payload) => { payload.compatibility_checks = payload.compatibility_checks.map((item, index) => index === 0 ? { ...item, pass: false } : item); },
    (payload) => { payload.results = [{ ...payload.results[0], transaction_status_after: 'UNKNOWN' }]; }
  ]) {
    const payload = structuredClone(base); delete payload.canonical_digest; mutation(payload);
    assert.notEqual(canonicalAggregateDigest(payload), base.canonical_digest);
  }
});
test('31 output containment rejects relative and protected paths', async () => {
  await assert.rejects(() => validateOutputDirectory('relative', windowsPolicy()), /OUTPUT_PATH_INVALID/);
  await assert.rejects(() => validateOutputDirectory(SAFE_OUTPUT, { ...windowsPolicy(), dirtySource: 'relative' }), /OUTPUT_PATH_INVALID/);
  for (const value of ['C:\\repo', 'C:\\repo\\out', 'C:\\work\\out', 'C:\\dirty\\out']) await assert.rejects(() => validateOutputDirectory(value, windowsPolicy()), /OUTPUT_PATH_INVALID/);
});
test('32 reparse aliases into protected paths are rejected', async () => {
  const canonicalize = async (value, { pathApi }) => pathApi.resolve(value).toLowerCase() === 'c:\\alias' ? 'C:\\repo' : pathApi.resolve(value);
  await assert.rejects(() => validateOutputDirectory('C:\\alias', { ...windowsPolicy(), canonicalize }), /OUTPUT_PATH_INVALID/);
});
test('33 external absolute evidence path passes containment', async () => assert.equal(await validateOutputDirectory(SAFE_OUTPUT, windowsPolicy()), SAFE_OUTPUT));
test('34 publication produces exactly three finals with summary last', async () => {
  const fs = fakeFs(); await writeEvidenceFiles(SAFE_OUTPUT, aggregate(), fs.io);
  assert.deepEqual(fs.renames.map((item) => path.win32.basename(item)), OUTPUT_FILENAMES);
});
test('35 pre-existing final blocks all writes and overwrite', async () => {
  const target = path.win32.join(SAFE_OUTPUT, OUTPUT_FILENAMES[0]); const fs = fakeFs({ initial: [target] });
  await assert.rejects(() => writeEvidenceFiles(SAFE_OUTPUT, aggregate(), fs.io), /OUTPUT_WRITE_FAILED/);
  assert.equal(fs.writes, 0); assert.equal(fs.files.has(target), true);
});
test('36 publication rename failure rolls back current attempt', async () => {
  const fs = fakeFs({ failRename: 2 }); await assert.rejects(() => writeEvidenceFiles(SAFE_OUTPUT, aggregate(), fs.io));
  assert.equal([...fs.files].some((item) => OUTPUT_FILENAMES.includes(path.win32.basename(item))), false);
});
test('37 successful runner orders checks then shutdown then aggregate digest publication', async () => {
  const order = []; const harness = { close: async () => { order.push('shutdown'); } };
  const result = await runPoolerEvidence({ env: ENV, outputPolicy: windowsPolicy(), createHarness: () => harness,
    executeChecks: async () => { order.push('terminalization'); return { postgresVersion: '17.10', checks: fakeChecks() }; },
    verifyInfrastructure: async () => POOLER_AUTHORITY,
    readAttestation: async () => validRunningAttestation(),
    aggregateEvidence: (input) => { order.push('aggregate'); return createAggregateEvidence({ ...input, result: fakeResult() }); },
    writeEvidence: async () => { order.push('publish'); } });
  assert.equal(result.exitCode, 0); assert.deepEqual(order, ['terminalization', 'shutdown', 'aggregate', 'publish']);
});
test('38 shutdown failure prevents aggregate digest and publication', async () => {
  const order = []; const result = await runPoolerEvidence({ env: ENV, outputPolicy: windowsPolicy(),
    createHarness: () => ({ close: async () => { order.push('shutdown'); throw new Error('raw'); } }),
    verifyInfrastructure: async () => POOLER_AUTHORITY,
    readAttestation: async () => validRunningAttestation(),
    executeChecks: async () => ({ postgresVersion: '17.10', checks: fakeChecks() }),
    aggregateEvidence: () => { order.push('aggregate'); }, writeEvidence: async () => { order.push('publish'); } });
  assert.equal(result.exitCode, EXIT_CODES.POOLER_SHUTDOWN); assert.deepEqual(order, ['shutdown', 'shutdown']);
});
test('39 exact bounded diagnostics and unique exits are frozen', () => {
  assert.equal(new Set(Object.values(EXIT_CODES)).size, Object.values(EXIT_CODES).length);
  assert.equal(Object.values(DIAGNOSTIC_CODES).length, 13);
});
test('40 main suppresses raw errors and credential', async () => {
  let output = ''; const code = await main({ env: { ...ENV, AFEX_A25_PD6_PASSWORD: undefined }, stdout: { write: (value) => { output += value; } } });
  assert.equal(code, EXIT_CODES.CREDENTIAL); assert.equal(output, 'PD6F_POOLER_FAIL code=CREDENTIAL_REQUIRED scenario=PD6-D-032\n'); assert.equal(output.includes('fake-only-secret'), false);
});
test('41 schema artifact is closed with exact tuple registries', async () => {
  const schema = JSON.parse(await readFile(new URL('./A2.5-PD6F-POOLER-EVIDENCE.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.additionalProperties, false); assert.equal(schema.properties.scenario_count.const, 1);
  assert.deepEqual(schema.properties.scenario_order.prefixItems.map((item) => item.const), ['PD6-D-032']);
  assert.deepEqual(schema.properties.compatibility_checks.prefixItems.map((item) => item.properties.check_id.const), COMPATIBILITY_CHECK_ORDER);
});
test('42 repository source forbids session affinity named statements private APIs and developer paths', async () => {
  const source = await readFile(new URL('./A2.5-PD6F-POOLER-RUNNER.mjs', import.meta.url), 'utf8');
  const developerPaths = [`C:${'\\'}Users${'\\'}NSC-LUA`, ['leather', 'fix', 'erp', 'clean'].join('-')];
  for (const forbidden of ['pg_backend_pid(', 'processID', '.connection.', 'LISTEN ', 'SET SESSION', 'pg_advisory_lock', 'child_process', 'DATABASE_URL', ...developerPaths]) assert.equal(source.includes(forbidden), false, forbidden);
});
test('43 repository source has no retry implementation', async () => { const source = await readFile(new URL('./A2.5-PD6F-POOLER-RUNNER.mjs', import.meta.url), 'utf8'); assert.equal(/\bretry\b/i.test(source), false); });
test('44 infrastructure file hashes bind reviewed files', async () => {
  for (const [name, expected] of Object.entries(INFRASTRUCTURE_FILE_HASHES)) {
    const bytes = await readFile(new URL(`./pd6f-pooler/${name}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, name);
  }
  assert.equal(createHash('sha256').update(JSON.stringify(INFRASTRUCTURE_FILE_HASHES)).digest('hex'), POOLER_AUTHORITY.infrastructure_digest);
});
test('45 infrastructure config freezes transaction mode and disables prepared statements', async () => {
  const ini = await readFile(new URL('./pd6f-pooler/pgbouncer.ini', import.meta.url), 'utf8');
  for (const line of ['pool_mode = transaction', 'unix_socket_dir =', 'max_prepared_statements = 0', 'server_reset_query = DISCARD ALL', 'auth_type = scram-sha-256']) assert.equal(ini.includes(line), true);
  assert.equal(/^unix_socket_dir =$/m.test(ini), true);
  assert.equal(/unix_socket_dir =[ \t]*\S+/m.test(ini), false);
  assert.equal(ini.includes('auth_query'), false);
});
test('46 compose publishes loopback only and externalizes userlist', async () => {
  const compose = await readFile(new URL('./pd6f-pooler/compose.yaml', import.meta.url), 'utf8');
  assert.equal(compose.includes('127.0.0.1:56432:6432'), true); assert.equal(compose.includes('AFEX_A25_PD6F_USERLIST_PATH'), true); assert.equal(compose.includes('password'), false);
});
test('47 Dockerfile pins official archive and immutable base', async () => {
  const dockerfile = await readFile(new URL('./pd6f-pooler/Dockerfile', import.meta.url), 'utf8');
  assert.equal((dockerfile.match(/sha256:14358309/g) ?? []).length, 2); assert.equal(dockerfile.includes('924ad35113fd0a71'), true); assert.equal(dockerfile.includes('USER pgbouncer:pgbouncer'), true);
});
test('48 aggregate excludes secrets PID paths clocks raw errors and identity', () => {
  const text = JSON.stringify(aggregate());
  for (const forbidden of ['fake-only-secret', 'userlist.txt', 'processID', 'container', 'duration', 'stack', SAFE_OUTPUT]) assert.equal(text.includes(forbidden), false);
});

test('49 actual repository infrastructure is hashed and parsed without caller paths', async () => {
  assert.deepEqual(await verifyRepositoryInfrastructure(), POOLER_AUTHORITY);
});
test('50 environment cannot override computed infrastructure authority', () => {
  const input = readRunnerInputs({ ...ENV, AFEX_A25_PD6F_INFRASTRUCTURE_DIGEST: '0'.repeat(64), AFEX_A25_PD6F_POOLER_MODE: 'SESSION' });
  assert.deepEqual(input, { password: ENV.AFEX_A25_PD6_PASSWORD, outputDir: SAFE_OUTPUT, dirtySource: ENV.AFEX_A25_PD6F_DIRTY_SOURCE });
});
test('51 each infrastructure file drift fails closed', async () => {
  const files = await infrastructureBuffers();
  for (const name of Object.keys(INFRASTRUCTURE_FILE_HASHES)) {
    const drifted = { ...files, [name]: Buffer.concat([files[name], Buffer.from('drift')]) };
    await assert.rejects(() => verifyRepositoryInfrastructure(infrastructureIo(drifted)), /INFRASTRUCTURE_ATTESTATION_INVALID/);
  }
});
test('52 infrastructure reparse escape fails closed', async () => {
  const files = await infrastructureBuffers();
  const io = infrastructureIo(files, { escape: 'compose.yaml' });
  await assert.rejects(() => verifyRepositoryInfrastructure(io), /INFRASTRUCTURE_ATTESTATION_INVALID/);
});
test('53 actual compatibility orchestrator proves all ordered paths and restores baseline', async () => {
  const fake = orchestrationFake();
  const outcome = await executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'),
    shutdownHarnessFactory, scheduler: immediateScheduler() });
  assert.equal(outcome.postgresVersion, '17.10');
  assert.deepEqual(outcome.checks.map((item) => item.check_id), COMPATIBILITY_CHECK_ORDER);
  assert.deepEqual(fake.transactionRow, { fixture_id: 1, revision: 0, payload: 'pd6-transaction-baseline' });
  assert.equal(fake.events.filter((item) => item === 'rollback').length, 2);
  assert.equal(fake.events.includes('destroy:PD6F-A'), true);
  assert.equal(fake.events.includes('checkout-timeout-before-ownership'), true);
});
test('54 actual orchestrator performs commit mutation then restoration transaction', async () => {
  const fake = orchestrationFake();
  await executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() });
  assert.deepEqual(fake.updates, [[1, 'pd6f-pooler-commit'], [0, 'pd6-transaction-baseline']]);
  assert.equal(fake.events.filter((item) => item === 'commit').length, 2);
});
test('55 committed-state observation failure triggers restoration attempt and blocks PASS', async () => {
  const fake = orchestrationFake({ failCommittedObservation: true });
  await assert.rejects(() => executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() }));
  assert.equal(fake.updates.some(([revision, payload]) => revision === 0 && payload === 'pd6-transaction-baseline'), true);
  assert.deepEqual(fake.transactionRow, { fixture_id: 1, revision: 0, payload: 'pd6-transaction-baseline' });
});
test('56 restoration failure blocks compatibility PASS', async () => {
  const fake = orchestrationFake({ failRestore: true });
  await assert.rejects(() => executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() }));
});
test('57 ordinary failure and statement timeout each roll back exactly once', async () => {
  const fake = orchestrationFake();
  await executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() });
  assert.equal(fake.events.filter((item) => item === 'rollback:PD6F-ORDINARY_QUERY_ERROR').length, 1);
  assert.equal(fake.events.filter((item) => item === 'rollback:PD6F-SAFE_DELAY').length, 1);
  assert.equal(fake.events.includes('query:PD6F-SAFE_DELAY:SET_LOCAL_STATEMENT_TIMEOUT'), true);
});
test('58 replacement uses distinct public client objects and safe query', async () => {
  const fake = orchestrationFake();
  await executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() });
  assert.notEqual(fake.clients.find((item) => item.borrower === 'PD6F-A'), fake.clients.find((item) => item.borrower === 'PD6F-B'));
  assert.equal(fake.events.includes('query:PD6F-B:READ_STATUS_FIXTURE'), true);
});
test('59 contention grants no waiter lease and performs no waiter cleanup', async () => {
  const fake = orchestrationFake();
  await executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() });
  assert.equal(fake.clients.some((item) => item.borrower === 'PD6F-WAITER'), false);
  assert.equal(fake.events.some((item) => /(?:rollback|release):PD6F-WAITER/.test(item)), false);
});
test('60 exact PG_POOL_SHUTDOWN rejection is accepted without ownership or retry', async () => {
  assert.deepEqual(await verifyShutdownRejection(() => Promise.reject(new AdapterFailure('PG_POOL_SHUTDOWN'))),
    { failure_code: 'PG_POOL_SHUTDOWN', ownership_granted: false, retry_attempted: false });
});
test('61 unrelated adapter shutdown rejection fails', async () => assert.rejects(
  () => verifyShutdownRejection(() => Promise.reject(new AdapterFailure('PG_QUERY_FAILED'))), /POOLER_SHUTDOWN_FAILED/
));
test('62 generic shutdown rejection fails', async () => assert.rejects(
  () => verifyShutdownRejection(() => Promise.reject(new Error('raw'))), /POOLER_SHUTDOWN_FAILED/
));
test('63 unexpected post-shutdown acquisition success fails', async () => assert.rejects(
  () => verifyShutdownRejection(async () => ({ owned: true })), /POOLER_SHUTDOWN_FAILED/
));
test('64 topology uses only dedicated external backend network and alias', async () => {
  const compose = await readFile(new URL('./pd6f-pooler/compose.yaml', import.meta.url), 'utf8');
  const ini = await readFile(new URL('./pd6f-pooler/pgbouncer.ini', import.meta.url), 'utf8');
  assert.equal(compose.includes('external: true'), true); assert.equal(compose.includes('afex-pd6f-isolated'), true);
  assert.equal(ini.includes('host=pd6f-postgres-backend port=5432'), true);
  for (const forbidden of ['host.docker.internal', 'port=55432', 'network_mode: host', '0.0.0.0:56432']) assert.equal(`${compose}\n${ini}`.includes(forbidden), false);
});
test('65 every external APK and source artifact has exact URL and SHA-256', async () => {
  const dockerfile = await readFile(new URL('./pd6f-pooler/Dockerfile', import.meta.url), 'utf8');
  const adds = dockerfile.split('\n').filter((line) => line.startsWith('ADD '));
  assert.equal(adds.length, 37);
  assert.equal(adds.every((line) => /^ADD --checksum=sha256:[a-f0-9]{64} https:\/\/[^ ]+/.test(line)), true);
  assert.equal(adds.filter((line) => line.endsWith('.apk /packages/')).length, 36);
  assert.equal(dockerfile.includes('apk add --no-network --allow-untrusted /packages/*.apk'), true);
  assert.equal(dockerfile.includes('apk add --no-cache'), false);
  assert.equal(dockerfile.includes('/etc/apk/repositories'), false);
  assert.equal(dockerfile.includes('make -j2 pgbouncer'), true);
  assert.equal(dockerfile.includes('install -D -m0755 pgbouncer /out/usr/bin/pgbouncer'), true);
  assert.equal(/(?:make(?:\s+-j\d+)?\s*(?:\\\n)?\s*&&|make[^\n]*\b(?:all|install|doc|man)\b|pandoc)/.test(dockerfile), false);
});
test('66 Docker runtime stage contains no compiler or build tool installation', async () => {
  const dockerfile = await readFile(new URL('./pd6f-pooler/Dockerfile', import.meta.url), 'utf8');
  const runtime = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
  for (const forbidden of ['gcc=', 'make=', 'autoconf=', 'automake=', 'libtool=', 'curl=']) assert.equal(runtime.includes(forbidden), false);
  assert.equal(runtime.includes('USER pgbouncer:pgbouncer'), true);
});
test('67 authentication policy is exact plaintext external secret for both SCRAM legs', async () => {
  const ini = await readFile(new URL('./pd6f-pooler/pgbouncer.ini', import.meta.url), 'utf8');
  const compose = await readFile(new URL('./pd6f-pooler/compose.yaml', import.meta.url), 'utf8');
  const plan = await readFile(new URL('./A2.5-PD6F-POOLER-EXECUTION-PLAN.md', import.meta.url), 'utf8');
  assert.equal(ini.includes('auth_type = scram-sha-256'), true);
  assert.equal(ini.includes('auth_file = /run/secrets/userlist.txt'), true);
  assert.equal(ini.includes('auth_query'), false);
  assert.equal(compose.includes('/run/secrets/userlist.txt:ro'), true);
  assert.equal(plan.includes('"afex_a25_pd6_runner" "PLAINTEXT_PASSWORD_VALUE"'), true);
  assert.equal(plan.includes('no separately salted verifier is generated'), true);
});
test('68 environment contains no infrastructure authority inputs', () => {
  assert.deepEqual(readRunnerInputs({ ...ENV, AFEX_A25_PD6F_POOLER_VERSION: '0', AFEX_A25_PD6F_CONFIGURATION_DIGEST: '0' }),
    { password: ENV.AFEX_A25_PD6_PASSWORD, outputDir: SAFE_OUTPUT, dirtySource: ENV.AFEX_A25_PD6F_DIRTY_SOURCE });
});

function fakeChecks() { return COMPATIBILITY_CHECK_ORDER.map((check_id) => ({ check_id, pass: true })); }
function fakeResult() { return { scenario_id: 'PD6-D-032', evidence_tier: 'PD6F_POOLER', endpoint_class: 'PGBOUNCER_TRANSACTION_POOL', driver_version: '8.22.0', postgres_version: '17.10', terminal_classification: 'COMPLETED_SAFE', release_action: 'NORMAL_RELEASE', failure_code: null, sqlstate: null, transaction_status_before: 'IDLE', transaction_status_after: 'IDLE', rollback_attempts: 0, retry_attempted: false, client_destroyed: false, replacement_observed: false, decoded_value_class: 'NOT_APPLICABLE', pass: true }; }
function aggregate() { return createAggregateEvidence({ postgresVersion: '17.10', compatibilityChecks: fakeChecks(), result: fakeResult(), infrastructure: POOLER_AUTHORITY }); }
function resolveValueCount(id) { return ['UPDATE_STATUS_FIXTURE', 'UPDATE_TRANSACTION_FIXTURE'].includes(id) ? 2 : 0; }
function windowsPolicy() { return { repositoryRoot: 'C:\\repo', currentWorktree: 'C:\\work', dirtySource: 'C:\\dirty', platform: 'win32', pathApi: path.win32, canonicalize: async (value, { pathApi }) => pathApi.resolve(value) }; }
function fakeFs({ initial = [], failRename = 0 } = {}) {
  const files = new Set(initial); const renames = []; let renameCount = 0; let writes = 0;
  const io = { mkdir: async () => {}, lstat: async (target) => { if (!files.has(target)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return {}; },
    writeFile: async (target) => { writes += 1; if (files.has(target)) throw new Error('exists'); files.add(target); },
    rename: async (from, to) => { renameCount += 1; if (renameCount === failRename) throw new Error('rename'); files.delete(from); files.add(to); renames.push(to); },
    rm: async (target) => { files.delete(target); } };
  return { io, files, renames, get writes() { return writes; } };
}

async function infrastructureBuffers() {
  return Object.fromEntries(await Promise.all(Object.keys(INFRASTRUCTURE_FILE_HASHES).map(async (name) => [
    name, await readFile(new URL(`./pd6f-pooler/${name}`, import.meta.url))
  ])));
}

function infrastructureIo(files, { escape = null } = {}) {
  return {
    lstat: async () => ({}),
    realpath: async (target) => {
      if (escape && path.basename(target) === escape) return path.join(path.parse(target).root, 'outside', escape);
      return path.resolve(target);
    },
    readFile: async (target) => files[path.basename(target)]
  };
}

function immediateScheduler() {
  return { setTimeout: () => 1, clearTimeout: () => {} };
}

function shutdownHarnessFactory() {
  let closed = false;
  return { close: async () => { closed = true; }, adapter: { acquire: async () => {
    if (closed) throw new AdapterFailure('PG_POOL_SHUTDOWN');
    throw new Error('probe not closed');
  } } };
}

function orchestrationFake({ failCommittedObservation = false, failRestore = false,
  failRestoreCommit = false, failRestoreReread = false, missingRestoreRow = false,
  wrongRestoreRevision = false, wrongRestorePayload = false, wrongRestoreFixtureId = false } = {}) {
  const state = {
    events: [], updates: [], clients: [],
    transactionRow: { fixture_id: 1, revision: 0, payload: 'pd6-transaction-baseline' },
    failCommittedObservation, failRestore, failRestoreCommit, failRestoreReread, missingRestoreRow,
    wrongRestoreRevision, wrongRestorePayload, wrongRestoreFixtureId, committedObservationFailed: false
  };
  const adapter = {
    acquire: async (borrower, options = {}) => {
      if (borrower === 'PD6F-WAITER') {
        state.events.push('checkout-timeout-before-ownership');
        assert.equal(options.timeoutClass, 'POOL_CHECKOUT_TIMEOUT');
        throw new AdapterFailure('PG_POOL_CHECKOUT_TIMEOUT');
      }
      const client = { borrower, ordinal: state.clients.length + 1 };
      state.clients.push(client);
      let status = 'IDLE'; let rollbackAttempts = 0; let released = false; let pending = null;
      return {
        begin: async (owner) => { assert.equal(owner, borrower); status = 'IN_TRANSACTION'; state.events.push(`begin:${borrower}`); },
        query: async (owner, descriptor) => {
          assert.equal(owner, borrower); assert.deepEqual(Object.keys(descriptor).sort(), ['operationId', 'values']);
          const id = descriptor.operationId; state.events.push(`query:${borrower}:${id}`);
          if (id === 'READ_SERVER_VERSION') return { rows: [{ postgres_version: '17.10' }] };
          if (id === 'READ_TRANSACTION_FIXTURE') {
            if (state.failCommittedObservation && state.transactionRow.revision === 1 && !state.committedObservationFailed) {
              state.committedObservationFailed = true; throw new AdapterFailure('PG_QUERY_FAILED');
            }
            if (borrower === 'PD6F-RESTORE-VERIFY') {
              if (state.failRestoreReread) throw new AdapterFailure('PG_QUERY_FAILED');
              if (state.missingRestoreRow) return { rows: [] };
              return { rows: [{ ...state.transactionRow,
                fixture_id: state.wrongRestoreFixtureId ? 2 : state.transactionRow.fixture_id,
                revision: state.wrongRestoreRevision ? 9 : state.transactionRow.revision,
                payload: state.wrongRestorePayload ? 'wrong' : state.transactionRow.payload }] };
            }
            return { rows: [{ ...state.transactionRow }] };
          }
          if (id === 'UPDATE_TRANSACTION_FIXTURE') {
            const [revision, payload] = descriptor.values;
            state.updates.push([revision, payload]);
            if (state.failRestore && revision === 0) { status = 'FAILED_TRANSACTION'; throw new AdapterFailure('PG_QUERY_FAILED'); }
            pending = { fixture_id: 1, revision, payload };
            return { rows: [{ ...pending }] };
          }
          if (id === 'ORDINARY_QUERY_ERROR') { status = 'FAILED_TRANSACTION'; throw new AdapterFailure('PG_QUERY_FAILED'); }
          if (id === 'SAFE_DELAY') { status = 'FAILED_TRANSACTION'; throw new AdapterFailure('PG_STATEMENT_TIMEOUT', { sqlstate: '57014' }); }
          return { rows: [{ fixture_id: 1, revision: 0, lifecycle_marker: 'pd6-status-baseline' }] };
        },
        commit: async (owner) => { assert.equal(owner, borrower); state.events.push(`commit:${borrower}`);
          if (borrower === 'PD6F-RESTORE' && state.failRestoreCommit) { status = 'UNKNOWN'; throw new AdapterFailure('PG_COMMIT_FAILED'); }
          if (pending) state.transactionRow = { ...pending }; pending = null; status = 'IDLE'; state.events.push('commit'); },
        rollback: async (owner) => { assert.equal(owner, borrower); pending = null; status = 'IDLE'; rollbackAttempts += 1; state.events.push('rollback'); state.events.push(`rollback:${borrower}`); },
        sanitize: (owner) => { assert.equal(owner, borrower); return { passed: status === 'IDLE' }; },
        release: (owner) => {
          if (released) throw new AdapterFailure('PG_RELEASE_STATE_INVALID');
          released = true;
          if (owner !== borrower) { state.events.push(`destroy:${borrower}`); return 'DESTROY_RELEASE'; }
          state.events.push(`release:${borrower}`); return status === 'IDLE' ? 'NORMAL_RELEASE' : 'DESTROY_RELEASE';
        },
        snapshot: () => ({ transactionStatus: status, rollbackAttempts, released })
      };
    }
  };
  state.harness = { adapter, observeClientObjects: () => state.clients.slice(), close: async () => {} };
  return state;
}

function validRunningAttestation(overrides = {}, { recompute = true } = {}) {
  const value = {
    ...INFRASTRUCTURE_ATTESTATION_CONSTANTS, image_id: `sha256:${'a'.repeat(64)}`,
    dockerfile_sha256: INFRASTRUCTURE_FILE_HASHES.Dockerfile,
    compose_sha256: INFRASTRUCTURE_FILE_HASHES['compose.yaml'],
    pgbouncer_config_sha256: INFRASTRUCTURE_FILE_HASHES['pgbouncer.ini'],
    infrastructure_digest: POOLER_AUTHORITY.infrastructure_digest,
    ...overrides, attestation_digest: '0'.repeat(64)
  };
  if (recompute) value.attestation_digest = canonicalInfrastructureAttestationDigest(value);
  return value;
}

function configurableShutdownHarness({ failure = new AdapterFailure('PG_POOL_SHUTDOWN'), success = false,
  closeFailure = null, events = [] } = {}) {
  let closed = false; let acquisitions = 0;
  const harness = { close: async () => { events.push('close'); if (closeFailure) throw closeFailure; closed = true; },
    adapter: { acquire: async (borrower) => { events.push(`acquire:${borrower}`); acquisitions += 1;
      assert.equal(closed, true); if (success) return { owned: true }; throw failure; } } };
  return { harness, get acquisitions() { return acquisitions; } };
}

test('69 real default shutdown helper invokes close before exact failed acquisition', async () => {
  const events = []; const fake = configurableShutdownHarness({ events });
  await defaultShutdownProbe(fixedConnectionConfig('x'), { createHarness: () => fake.harness, scheduler: immediateScheduler() });
  assert.deepEqual(events, ['close', 'acquire:PD6F-AFTER-SHUTDOWN']); assert.equal(fake.acquisitions, 1);
});
test('70 real default shutdown helper accepts only exact PG_POOL_SHUTDOWN without borrower cleanup', async () => {
  const events = []; await defaultShutdownProbe(fixedConnectionConfig('x'), {
    createHarness: () => configurableShutdownHarness({ events }).harness, scheduler: immediateScheduler()
  });
  assert.equal(events.some((item) => /rollback|release/.test(item)), false);
});
test('71 real default shutdown helper rejects unrelated adapter failure', async () => assert.rejects(
  () => defaultShutdownProbe(fixedConnectionConfig('x'), { createHarness: () => configurableShutdownHarness({ failure: new AdapterFailure('PG_QUERY_FAILED') }).harness, scheduler: immediateScheduler() }),
  /POOLER_SHUTDOWN_FAILED/
));
test('72 real default shutdown helper rejects generic and arbitrary rejection', async () => {
  for (const failure of [new Error('raw'), { failureCode: 'ARBITRARY' }]) await assert.rejects(
    () => defaultShutdownProbe(fixedConnectionConfig('x'), { createHarness: () => configurableShutdownHarness({ failure }).harness, scheduler: immediateScheduler() }),
    /POOLER_SHUTDOWN_FAILED/
  );
});
test('73 real default shutdown helper rejects successful post-close acquisition', async () => assert.rejects(
  () => defaultShutdownProbe(fixedConnectionConfig('x'), { createHarness: () => configurableShutdownHarness({ success: true }).harness, scheduler: immediateScheduler() }),
  /POOLER_SHUTDOWN_FAILED/
));
test('74 real default shutdown helper maps bounded close failure', async () => assert.rejects(
  () => defaultShutdownProbe(fixedConnectionConfig('x'), { createHarness: () => configurableShutdownHarness({ closeFailure: new Error('raw') }).harness, scheduler: immediateScheduler() }),
  /POOLER_SHUTDOWN_FAILED/
));
test('75 compatibility orchestrator executes real default shutdown helper via fake harness factory', async () => {
  const fake = orchestrationFake(); const events = [];
  const outcome = await executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'),
    shutdownHarnessFactory: () => configurableShutdownHarness({ events }).harness, scheduler: immediateScheduler() });
  assert.equal(outcome.checks.at(-3).check_id, 'SHUTDOWN_BEFORE_BORROWER');
  assert.deepEqual(events, ['close', 'acquire:PD6F-AFTER-SHUTDOWN']);
});

test('76 real restoration proves mutation commit restore begin update commit and exact reread', async () => {
  const fake = orchestrationFake(); await executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() });
  for (const event of ['commit:PD6F-COMMIT', 'begin:PD6F-RESTORE', 'query:PD6F-RESTORE:UPDATE_TRANSACTION_FIXTURE',
    'commit:PD6F-RESTORE', 'query:PD6F-RESTORE-VERIFY:READ_TRANSACTION_FIXTURE']) assert.equal(fake.events.includes(event), true, event);
  assert.deepEqual(fake.transactionRow, { fixture_id: 1, revision: 0, payload: 'pd6-transaction-baseline' });
});
for (const [number, label, option] of [
  [77, 'wrong restored revision', 'wrongRestoreRevision'], [78, 'wrong restored payload', 'wrongRestorePayload'],
  [79, 'restoration UPDATE failure', 'failRestore'], [80, 'restoration COMMIT failure', 'failRestoreCommit'],
  [81, 'restoration reread query failure', 'failRestoreReread'], [82, 'restoration missing row', 'missingRestoreRow'],
  [83, 'restoration wrong fixture id', 'wrongRestoreFixtureId']
]) test(`${number} ${label} rejects real restoration path`, async () => {
  const fake = orchestrationFake({ [option]: true });
  await assert.rejects(() => executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() }));
  assert.equal(fake.updates.filter(([revision]) => revision === 0).length, 1);
});
test('84 restoration update uncertainty rolls back and releases exactly once', async () => {
  const fake = orchestrationFake({ failRestore: true });
  await assert.rejects(() => executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() }));
  assert.equal(fake.events.filter((item) => item === 'rollback:PD6F-RESTORE').length, 1);
  assert.equal(fake.events.filter((item) => item === 'release:PD6F-RESTORE').length, 1);
});
test('85 restoration commit ambiguity destroys exactly once without rollback', async () => {
  const fake = orchestrationFake({ failRestoreCommit: true });
  await assert.rejects(() => executeCompatibilityChecks({ harness: fake.harness, config: fixedConnectionConfig('x'), shutdownHarnessFactory, scheduler: immediateScheduler() }));
  assert.equal(fake.events.filter((item) => item === 'rollback:PD6F-RESTORE').length, 0);
  assert.equal(fake.events.filter((item) => item === 'destroy:PD6F-RESTORE').length, 1);
});
test('86 restoration uncertainty blocks aggregate digest and publication', async () => {
  const fake = orchestrationFake({ failRestore: true }); let aggregates = 0; let publications = 0;
  const outcome = await runPoolerEvidence({ env: ENV, outputPolicy: windowsPolicy(), createHarness: () => fake.harness,
    verifyInfrastructure: async () => POOLER_AUTHORITY, readAttestation: async () => validRunningAttestation(),
    aggregateEvidence: () => { aggregates += 1; }, writeEvidence: async () => { publications += 1; } });
  assert.notEqual(outcome.exitCode, 0); assert.equal(aggregates, 0); assert.equal(publications, 0);
});

test('87 valid closed running-infrastructure attestation is accepted', () => assert.deepEqual(
  validateRunningInfrastructureAttestation(validRunningAttestation()), validRunningAttestation()
));
test('88 attestation missing key is rejected', () => { const value = validRunningAttestation(); delete value.image_id; assert.throws(() => validateRunningInfrastructureAttestation(value)); });
test('89 attestation additional key and secret material are rejected', () => {
  for (const extra of [{ extra: true }, { password: 'forbidden' }]) assert.throws(() => validateRunningInfrastructureAttestation({ ...validRunningAttestation(), ...extra }));
});
test('90 invalid image id is rejected', () => assert.throws(() => validateRunningInfrastructureAttestation(validRunningAttestation({ image_id: 'tag:latest' }))));
for (const [number, label, key, value] of [
  [91, 'version', 'pooler_version', '1.25.1'], [92, 'mode', 'pooler_mode', 'SESSION'],
  [93, 'network', 'network_name', 'other'], [94, 'binding', 'host_binding', '0.0.0.0:56432'],
  [95, 'backend alias', 'backend_alias', 'other'], [96, 'Dockerfile hash', 'dockerfile_sha256', '0'.repeat(64)],
  [97, 'Compose hash', 'compose_sha256', '0'.repeat(64)], [98, 'PgBouncer hash', 'pgbouncer_config_sha256', '0'.repeat(64)],
  [99, 'infrastructure digest', 'infrastructure_digest', '0'.repeat(64)]
]) test(`${number} wrong attestation ${label} is rejected`, () => assert.throws(
  () => validateRunningInfrastructureAttestation(validRunningAttestation({ [key]: value }))
));
test('100 wrong attestation digest is rejected', () => assert.throws(
  () => validateRunningInfrastructureAttestation(validRunningAttestation({ attestation_digest: '0'.repeat(64) }, { recompute: false }))
));
test('101 fixed attestation reader permits no caller path override', async () => {
  let observed; const value = await readRunningInfrastructureAttestation(SAFE_OUTPUT, { readFile: async (target) => {
    observed = target; return JSON.stringify(validRunningAttestation());
  } });
  assert.equal(observed, path.join(SAFE_OUTPUT, INFRASTRUCTURE_ATTESTATION_FILENAME));
  assert.equal(value.image_id, `sha256:${'a'.repeat(64)}`);
});
test('102 environment cannot override attestation path or values', () => assert.deepEqual(
  readRunnerInputs({ ...ENV, AFEX_A25_PD6F_ATTESTATION_PATH: 'C:\\arbitrary.json', AFEX_A25_PD6F_IMAGE_ID: 'tag:latest' }),
  { password: ENV.AFEX_A25_PD6_PASSWORD, outputDir: SAFE_OUTPUT, dirtySource: ENV.AFEX_A25_PD6F_DIRTY_SOURCE }
));

let passed = 0;
for (const { name, run } of tests) {
  try { await run(); passed += 1; console.log(`ok ${passed} - ${name}`); }
  catch (error) { console.error(`not ok ${passed + 1} - ${name}`); throw error; }
}
console.log(`1..${tests.length}`);
console.log(`# pass ${passed}`);
