import { createHash } from 'node:crypto';
import { lstat, mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  LOCAL_DIRECT_IDENTITY,
  createBoundedResult,
  createLocalDirectHarness,
  withLockControl
} from './A2.5-PD6-LOCAL-PG-HARNESS.mjs';
import {
  TYPE_FIXTURE_BASELINE,
  validateDenialObjectAbsent,
  validateServerVersionRow,
  validateTypeFixtureBaseline
} from './A2.5-PD6-LOCAL-PG-FIXTURES.mjs';

const { Pool } = pg;
const CLIENT_OBSERVATIONS = Symbol('PD6C_CLIENT_OBSERVATIONS');
const DEFAULT_CLOSE_SCHEDULER = Object.freeze({
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle)
});
const BASELINE_OPERATION_IDS = Object.freeze([
  'READ_SERVER_VERSION', 'READ_LOCK_TARGET', 'READ_TYPE_FIXTURE',
  'READ_TRANSACTION_FIXTURE', 'READ_STATUS_FIXTURE'
]);
const BASELINE_VALIDATION_TARGETS = Object.freeze([
  'SERVER_VERSION', 'LOCK_TARGET', 'TYPE_FIXTURE', 'TRANSACTION_TARGET', 'STATUS_FIXTURE'
]);

export const EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  CREDENTIAL: 10,
  OUTPUT_PATH: 11,
  CONNECTION: 12,
  BASELINE: 13,
  SCENARIO_SAFETY: 14,
  RESTORATION: 15,
  SCHEMA: 16,
  DIGEST: 17,
  OUTPUT_WRITE: 18,
  UNEXPECTED: 19
});

export const OUTPUT_FILENAMES = Object.freeze([
  'pd6c-results.json', 'pd6c-digest.txt', 'pd6c-summary.txt'
]);

export const DIRECT_SCENARIO_ORDER = Object.freeze([
  'PD6-D-001', 'PD6-D-002',
  'PD6-D-004', 'PD6-D-020', 'PD6-D-021', 'PD6-D-022', 'PD6-D-023', 'PD6-D-024',
  'PD6-D-025', 'PD6-D-026', 'PD6-D-027', 'PD6-D-028', 'PD6-D-029', 'PD6-D-030', 'PD6-D-031',
  'PD6-D-003', 'PD6-D-006', 'PD6-D-007', 'PD6-D-005', 'PD6-D-008', 'PD6-D-010',
  'PD6-D-009', 'PD6-D-016', 'PD6-D-017', 'PD6-D-018', 'PD6-D-019',
  'PD6-D-011', 'PD6-D-012', 'PD6-D-013', 'PD6-D-014'
]);

const PHASES = Object.freeze({
  'PD6-D-001': 'CONNECTION', 'PD6-D-002': 'CONNECTION', 'PD6-D-004': 'TYPE',
  'PD6-D-003': 'TRANSACTION', 'PD6-D-006': 'TRANSACTION', 'PD6-D-007': 'TRANSACTION',
  'PD6-D-005': 'QUERY_FAILURE', 'PD6-D-008': 'STATEMENT_TIMEOUT', 'PD6-D-010': 'STATEMENT_TIMEOUT',
  'PD6-D-009': 'LOCK_TIMEOUT', 'PD6-D-016': 'PERMISSION', 'PD6-D-017': 'PERMISSION',
  'PD6-D-018': 'PERMISSION', 'PD6-D-019': 'PERMISSION', 'PD6-D-011': 'SANITATION',
  'PD6-D-012': 'REPLACEMENT', 'PD6-D-013': 'BORROWER_MISMATCH', 'PD6-D-014': 'SECOND_ROLLBACK'
});

const TYPE_CLASSES = Object.freeze({
  'PD6-D-020': ['int4_value', 'NUMBER'], 'PD6-D-021': ['int8_value', 'STRING'],
  'PD6-D-022': ['numeric_value', 'STRING'], 'PD6-D-023': ['boolean_value', 'BOOLEAN'],
  'PD6-D-024': ['uuid_value', 'STRING'], 'PD6-D-025': ['json_value', 'OBJECT'],
  'PD6-D-026': ['jsonb_value', 'OBJECT'], 'PD6-D-027': ['bytea_value', 'BUFFER'],
  'PD6-D-028': ['text_array_value', 'ARRAY'], 'PD6-D-029': ['nullable_text_value', 'NULL'],
  'PD6-D-030': ['timestamptz_value', 'DATE'], 'PD6-D-031': ['timestamp_value', 'DATE']
});

const DENIAL_OPERATIONS = Object.freeze({
  'PD6-D-016': ['DENY_PUBLIC_CREATE', 'VERIFY_PUBLIC_DENIAL_OBJECT_ABSENT'],
  'PD6-D-017': ['DENY_EVIDENCE_CREATE', 'VERIFY_EVIDENCE_DENIAL_OBJECT_ABSENT'],
  'PD6-D-018': ['DENY_TYPE_INSERT', null],
  'PD6-D-019': ['DENY_TRANSACTION_DELETE', null]
});

export const SCENARIO_AUTHORITY = deepFreeze(Object.fromEntries(DIRECT_SCENARIO_ORDER.map((scenarioId, index) => {
  const phase = PHASES[scenarioId] ?? 'TYPE';
  return [scenarioId, {
    scenario_id: scenarioId,
    execution_order: index + 1,
    phase,
    precondition: index < 2 ? 'FIXED_LOCAL_IDENTITY' : 'GLOBAL_BASELINE_VERIFIED',
    authority: authorityFor(scenarioId),
    transaction_status_before: phase === 'TRANSACTION' || phase.endsWith('TIMEOUT') ? 'IDLE' : 'NOT_APPLICABLE',
    transaction_status_after: 'IDLE',
    sqlstate: phase === 'STATEMENT_TIMEOUT' ? '57014' : phase === 'LOCK_TIMEOUT' ? '55P03' : null,
    failure_code: phase === 'STATEMENT_TIMEOUT' ? 'PG_STATEMENT_TIMEOUT'
      : phase === 'LOCK_TIMEOUT' ? 'PG_LOCK_TIMEOUT'
        : phase === 'PERMISSION' || phase === 'QUERY_FAILURE' ? 'PG_QUERY_FAILED' : null,
    terminal_classification: phase === 'PERMISSION' ? 'PERMISSION_DENIED_SAFE'
      : ['QUERY_FAILURE', 'STATEMENT_TIMEOUT', 'LOCK_TIMEOUT'].includes(phase) ? 'ROLLED_BACK_SAFE'
        : phase === 'REPLACEMENT' || phase === 'BORROWER_MISMATCH' ? 'DESTROYED_UNSAFE' : 'COMPLETED_SAFE',
    release_action: phase === 'REPLACEMENT' || phase === 'BORROWER_MISMATCH' ? 'DESTROY_RELEASE' : 'NORMAL_RELEASE',
    rollback_attempts: ['QUERY_FAILURE', 'STATEMENT_TIMEOUT', 'LOCK_TIMEOUT', 'PERMISSION', 'SECOND_ROLLBACK'].includes(phase) ? 1 : 0,
    retry_expected: false,
    fixture_mutation: ['TRANSACTION', 'LOCK_TIMEOUT'].includes(phase),
    restoration_required: ['TRANSACTION', 'LOCK_TIMEOUT'].includes(phase),
    retained_evidence: TYPE_CLASSES[scenarioId]?.[1] ?? 'NOT_APPLICABLE'
  }];
})));

export function readRunnerInputs(env = process.env) {
  const password = env.AFEX_A25_PD6_PASSWORD;
  if (typeof password !== 'string' || password.trim().length === 0) throw runnerError('CREDENTIAL', 'CREDENTIAL_REQUIRED');
  const outputDir = env.AFEX_A25_PD6_OUTPUT_DIR;
  if (typeof outputDir !== 'string' || outputDir.trim().length === 0) throw runnerError('OUTPUT_PATH', 'OUTPUT_DIRECTORY_REQUIRED');
  return Object.freeze({ password, outputDir });
}

export async function validateOutputDirectory(outputDir, {
  repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  currentWorktree = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  dirtySource = 'C:\\Users\\NSC-LUA\\Desktop\\leather-fix-erp-clean',
  platform = process.platform,
  pathApi = platform === 'win32' ? path.win32 : path,
  fsApi = { lstat, realpath },
  canonicalize = canonicalizeExistingPath
} = {}) {
  if (typeof outputDir !== 'string' || outputDir.trim().length === 0 || !pathApi.isAbsolute(outputDir)) {
    throw runnerError('OUTPUT_PATH', 'OUTPUT_DIRECTORY_REJECTED');
  }
  try {
    const candidate = await canonicalize(outputDir, { pathApi, fsApi });
    for (const protectedRoot of [repositoryRoot, currentWorktree, dirtySource]) {
      const protectedPath = await canonicalize(protectedRoot, { pathApi, fsApi });
      if (isContainedPath(protectedPath, candidate, { pathApi, caseInsensitive: platform === 'win32' })) {
        throw runnerError('OUTPUT_PATH', 'OUTPUT_DIRECTORY_REJECTED');
      }
    }
    return candidate;
  } catch (error) {
    if (error?.runnerCategory === 'OUTPUT_PATH') throw error;
    throw runnerError('OUTPUT_PATH', 'OUTPUT_DIRECTORY_CANONICALIZATION_FAILED');
  }
}

export function fixedConnectionConfig(password) {
  if (typeof password !== 'string' || password.trim().length === 0) throw runnerError('CREDENTIAL', 'CREDENTIAL_REQUIRED');
  return Object.freeze({ ...LOCAL_DIRECT_IDENTITY, password });
}

export function validateGlobalBaseline(rows) {
  const postgresVersion = withBaselineTarget('SERVER_VERSION', () => validateServerVersionRow(singleRow(rows.serverVersion, 'SERVER_VERSION')));
  const lock = withBaselineTarget('LOCK_TARGET', () => singleRow(rows.lock, 'LOCK'));
  const transaction = withBaselineTarget('TRANSACTION_TARGET', () => singleRow(rows.transaction, 'TRANSACTION'));
  const status = withBaselineTarget('STATUS_FIXTURE', () => singleRow(rows.status, 'STATUS'));
  const type = withBaselineTarget('TYPE_FIXTURE', () => singleRow(rows.type, 'TYPE'));
  if (lock.fixture_id !== 1 || lock.payload !== 'pd6-lock-target') throw runnerError('BASELINE', 'LOCK_BASELINE_MISMATCH', null, { target: 'LOCK_TARGET' });
  if (transaction.fixture_id !== 1 || transaction.revision !== 0 || transaction.payload !== 'pd6-transaction-baseline') {
    throw runnerError('BASELINE', 'TRANSACTION_BASELINE_MISMATCH', null, { target: 'TRANSACTION_TARGET' });
  }
  if (status.fixture_id !== 1 || status.revision !== 0 || status.lifecycle_marker !== 'pd6-status-baseline') {
    throw runnerError('BASELINE', 'STATUS_BASELINE_MISMATCH', null, { target: 'STATUS_FIXTURE' });
  }
  if (!validateTypeFixtureBaseline(type)) throw runnerError('BASELINE', 'TYPE_BASELINE_MISMATCH', null, { target: 'TYPE_FIXTURE' });
  return Object.freeze({ postgresVersion, lock, transaction, status, type });
}

export async function restoreMutableFixtures(runOperation) {
  try {
    await runOperation('UPDATE_TRANSACTION_FIXTURE', [0, 'pd6-transaction-baseline']);
    await runOperation('UPDATE_STATUS_FIXTURE', [0, 'pd6-status-baseline']);
    const transaction = singleRow(await runOperation('READ_TRANSACTION_FIXTURE', []), 'TRANSACTION');
    const status = singleRow(await runOperation('READ_STATUS_FIXTURE', []), 'STATUS');
    if (transaction.revision !== 0 || transaction.payload !== 'pd6-transaction-baseline'
      || status.revision !== 0 || status.lifecycle_marker !== 'pd6-status-baseline') {
      throw new Error('RESTORE_VERIFY');
    }
    return true;
  } catch {
    throw runnerError('RESTORATION', 'RESTORATION_FAILED');
  }
}

export function canonicalAggregateDigest(aggregateWithoutDigest) {
  return createHash('sha256').update(stableSerialize(aggregateWithoutDigest)).digest('hex');
}

export function createAggregateEvidence({ postgresVersion, results }) {
  if (!Array.isArray(results) || results.length !== 30) throw runnerError('SCHEMA', 'SCENARIO_COUNT_INVALID');
  const bounded = results.map(createBoundedResult);
  if (bounded.some((result, index) => result.scenario_id !== DIRECT_SCENARIO_ORDER[index])) {
    throw runnerError('SCHEMA', 'SCENARIO_ORDER_INVALID');
  }
  const payload = Object.freeze({
    schema_version: 'A2.5-PD6C-DIRECT-1',
    driver_version: '8.22.0',
    postgres_version: postgresVersion,
    endpoint_class: 'DIRECT_POSTGRESQL',
    scenario_count: 30,
    scenario_order: DIRECT_SCENARIO_ORDER,
    results: bounded,
    aggregate_pass: bounded.every((result) => result.pass)
  });
  const canonicalDigest = canonicalAggregateDigest(payload);
  if (!/^[a-f0-9]{64}$/.test(canonicalDigest)) throw runnerError('DIGEST', 'DIGEST_INVALID');
  return deepFreeze({ ...payload, canonical_digest: canonicalDigest });
}

export async function runDirectEvidence({
  env = process.env,
  createHarness = createRunnerHarness,
  lockControl = withLockControl,
  aggregateEvidence = createAggregateEvidence,
  writeEvidence = writeEvidenceFiles,
  outputPolicy = {},
  closeScheduler = DEFAULT_CLOSE_SCHEDULER,
  closeTimeoutMs = 2000
} = {}) {
  let harness;
  try {
    const { password, outputDir } = readRunnerInputs(env);
    const safeOutputDir = await validateOutputDirectory(outputDir, outputPolicy);
    const config = fixedConnectionConfig(password);
    harness = createHarness(config);
    let baseline;
    try { baseline = await readBaseline(harness.adapter); } catch (error) {
      if (error?.runnerCategory) throw error;
      throw runnerError('CONNECTION', 'CONNECTION_FAILED');
    }
    const results = [];
    for (const scenarioId of DIRECT_SCENARIO_ORDER) {
      const result = await executeScenario({ scenarioId, harness, config, baseline, lockControl });
      results.push(createBoundedResult(result));
      if (!result.pass) throw runnerError('SCENARIO_SAFETY', 'SCENARIO_FAILED', scenarioId);
      if (SCENARIO_AUTHORITY[scenarioId].restoration_required) {
        await restoreMutableFixtures((operationId, values) => runSafeOperation(harness.adapter, operationId, values));
      }
    }
    await restoreMutableFixtures((operationId, values) => runSafeOperation(harness.adapter, operationId, values));
    await closeHarnessBounded(harness, { scheduler: closeScheduler, timeoutMs: closeTimeoutMs });
    harness = null;
    const aggregate = aggregateEvidence({ postgresVersion: baseline.postgresVersion, results });
    await writeEvidence(safeOutputDir, aggregate);
    return Object.freeze({ exitCode: EXIT_CODES.SUCCESS, aggregate });
  } catch (error) {
    let terminalError = error;
    if (harness) {
      try { await closeHarnessBounded(harness, { scheduler: closeScheduler, timeoutMs: closeTimeoutMs }); }
      catch (closeError) { terminalError = closeError; }
    }
    const category = terminalError?.runnerCategory ?? 'UNEXPECTED';
    return Object.freeze({
      exitCode: EXIT_CODES[category] ?? EXIT_CODES.UNEXPECTED,
      failure: Object.freeze({
        code: boundedCode(terminalError),
        operation: boundedBaselineOperation(terminalError?.operation),
        target: boundedBaselineTarget(terminalError?.target),
        scenario_id: terminalError?.scenarioId ?? null
      })
    });
  }
}

export function createRunnerHarness(config, { PoolBase = Pool } = {}) {
  class RunnerPool extends PoolBase {
    [CLIENT_OBSERVATIONS] = [];

    constructor(options) {
      super({ ...options, application_name: 'afex-a25-pd6c-direct-runner' });
    }

    async connect() {
      const client = await super.connect();
      this[CLIENT_OBSERVATIONS].push(client);
      return client;
    }
  }
  const harness = createLocalDirectHarness(config, { PoolConstructor: RunnerPool });
  return Object.freeze({
    ...harness,
    observeClientObjects: () => Object.freeze(harness.pool[CLIENT_OBSERVATIONS].slice())
  });
}

export async function main(options = {}) {
  const result = await runDirectEvidence(options);
  const line = result.exitCode === 0 ? `PD6C_DIRECT_PASS scenarios=30 digest=${result.aggregate.canonical_digest}`
    : ['PD6C_DIRECT_FAIL', `code=${result.failure.code}`,
      result.failure.operation ? `operation=${result.failure.operation}` : null,
      result.failure.target ? `target=${result.failure.target}` : null,
      `scenario=${result.failure.scenario_id ?? 'NONE'}`].filter(Boolean).join(' ');
  (options.stdout ?? process.stdout).write(`${line}\n`);
  return result.exitCode;
}

async function readBaseline(adapter) {
  const rows = {};
  for (const [key, operationId] of Object.entries({
    serverVersion: 'READ_SERVER_VERSION', lock: 'READ_LOCK_TARGET', type: 'READ_TYPE_FIXTURE',
    transaction: 'READ_TRANSACTION_FIXTURE', status: 'READ_STATUS_FIXTURE'
  })) rows[key] = await runBaselineOperation(adapter, operationId);
  try { return validateGlobalBaseline(rows); }
  catch (error) {
    throw runnerError('BASELINE', 'BASELINE_VALIDATION_FAILED', null, {
      target: error?.target
    });
  }
}

async function runBaselineOperation(adapter, operationId) {
  if (!BASELINE_OPERATION_IDS.includes(operationId)) throw runnerError('BASELINE', 'BASELINE_OPERATION_FAILED');
  const borrower = `PD6C-${operationId}`;
  let lease;
  try { lease = await adapter.acquire(borrower); }
  catch { throw runnerError('CONNECTION', 'POOL_CONNECT_FAILED'); }
  let result;
  try { result = await lease.query(borrower, { operationId, values: [] }); }
  catch {
    try { lease.release(borrower); } catch {}
    throw runnerError('BASELINE', 'BASELINE_OPERATION_FAILED', null, { operation: operationId });
  }
  try {
    if (!lease.sanitize(borrower).passed) throw new Error('BOUNDED_SANITATION_FAILURE');
  } catch {
    try { lease.release(borrower); } catch {}
    throw runnerError('BASELINE', 'BASELINE_SANITATION_FAILED', null, { operation: operationId });
  }
  try {
    if (lease.release(borrower) !== 'NORMAL_RELEASE') throw new Error('BOUNDED_RELEASE_FAILURE');
  } catch {
    throw runnerError('BASELINE', 'BASELINE_RELEASE_FAILED', null, { operation: operationId });
  }
  return result;
}

async function runSafeOperation(adapter, operationId, values = []) {
  const borrower = `PD6C-${operationId}`;
  const lease = await adapter.acquire(borrower);
  try {
    const result = await lease.query(borrower, { operationId, values });
    if (!lease.sanitize(borrower).passed) throw runnerError('SCENARIO_SAFETY', 'SANITATION_FAILED');
    if (lease.release(borrower) !== 'NORMAL_RELEASE') throw runnerError('SCENARIO_SAFETY', 'RELEASE_MISMATCH');
    return result;
  } catch (error) {
    try { lease.release(borrower); } catch {}
    throw error;
  }
}

async function executeScenario({ scenarioId, harness, config, baseline, lockControl }) {
  const authority = SCENARIO_AUTHORITY[scenarioId];
  if (TYPE_CLASSES[scenarioId]) {
    const [field, decodedClass] = TYPE_CLASSES[scenarioId];
    assertDecodedClass(baseline.type[field], decodedClass);
    return resultFromAuthority(authority, baseline.postgresVersion, { decoded_value_class: decodedClass });
  }
  if (scenarioId === 'PD6-D-004') {
    if (!validateTypeFixtureBaseline(baseline.type)) throw runnerError('BASELINE', 'TYPE_BASELINE_MISMATCH');
    return resultFromAuthority(authority, baseline.postgresVersion, { decoded_value_class: 'OBJECT' });
  }
  if (scenarioId === 'PD6-D-001' || scenarioId === 'PD6-D-002') {
    return resultFromAuthority(authority, baseline.postgresVersion);
  }
  if (DENIAL_OPERATIONS[scenarioId]) return executeDenial(harness.adapter, authority, baseline.postgresVersion);
  if (scenarioId === 'PD6-D-009') {
    await lockControl(config, async () => executeExpectedFailure(
      harness.adapter, authority, 'LOCK_TARGET_UPDATE', 'SET_LOCAL_LOCK_TIMEOUT'
    ));
    return resultFromAuthority(authority, baseline.postgresVersion);
  }
  if (scenarioId === 'PD6-D-012') return executeReplacement(harness, authority, baseline.postgresVersion);
  if (scenarioId === 'PD6-D-013') return executeBorrowerMismatch(harness.adapter, authority, baseline.postgresVersion);
  if (scenarioId === 'PD6-D-014') return executeSecondRollback(harness.adapter, authority, baseline.postgresVersion);
  if (['PD6-D-008', 'PD6-D-010'].includes(scenarioId)) {
    await executeExpectedFailure(harness.adapter, authority, 'SAFE_DELAY', 'SET_LOCAL_STATEMENT_TIMEOUT');
    return resultFromAuthority(authority, baseline.postgresVersion);
  }
  if (scenarioId === 'PD6-D-005') {
    await executeExpectedFailure(harness.adapter, authority, 'ORDINARY_QUERY_ERROR');
    return resultFromAuthority(authority, baseline.postgresVersion);
  }
  await executeTransactionScenario(harness.adapter, scenarioId);
  return resultFromAuthority(authority, baseline.postgresVersion);
}

async function executeTransactionScenario(adapter, scenarioId) {
  const borrower = scenarioId;
  const lease = await adapter.acquire(borrower);
  await lease.begin(borrower);
  if (scenarioId === 'PD6-D-003') await lease.query(borrower, { operationId: 'READ_TRANSACTION_FIXTURE', values: [] });
  if (scenarioId === 'PD6-D-006') await lease.query(borrower, { operationId: 'UPDATE_TRANSACTION_FIXTURE', values: [1, 'pd6-transaction-commit'] });
  if (scenarioId === 'PD6-D-007') await lease.query(borrower, { operationId: 'UPDATE_STATUS_FIXTURE', values: [1, 'pd6-status-rollback'] });
  if (scenarioId === 'PD6-D-007') await lease.rollback(borrower); else await lease.commit(borrower);
  if (lease.snapshot().transactionStatus !== 'IDLE') throw runnerError('SCENARIO_SAFETY', 'TRANSACTION_NOT_IDLE', scenarioId);
  if (!lease.sanitize(borrower).passed || lease.release(borrower) !== 'NORMAL_RELEASE') {
    throw runnerError('SCENARIO_SAFETY', 'TRANSACTION_RELEASE_UNSAFE', scenarioId);
  }
}

export async function executeExpectedFailure(adapter, authority, operationId, setupOperation = null) {
  const borrower = authority.scenario_id;
  const lease = await adapter.acquire(borrower);
  let observed = null;
  let operationSucceeded = false;
  let primaryFailure = null;
  try {
    await lease.begin(borrower);
    if (setupOperation) await lease.query(borrower, { operationId: setupOperation, values: [] });
    try {
      await lease.query(borrower, { operationId, values: [] });
      operationSucceeded = true;
    } catch (error) {
      observed = boundedAdapterFailure(error);
    }
    if (operationSucceeded || !observed
      || observed.failureCode !== authority.failure_code || observed.sqlstate !== authority.sqlstate) {
      primaryFailure = runnerError('SCENARIO_SAFETY', operationSucceeded ? 'EXPECTED_OPERATION_SUCCEEDED' : 'EXPECTED_FAILURE_MISMATCH', authority.scenario_id);
    }
  } catch (error) {
    primaryFailure = error?.runnerCategory ? error : runnerError('SCENARIO_SAFETY', 'EXPECTED_FAILURE_SETUP_FAILED', authority.scenario_id);
  }
  const cleanup = await terminalizeLease(lease, borrower);
  if (!primaryFailure && (!cleanup.safe || cleanup.rollbackAttempts !== 1 || cleanup.releaseAction !== 'NORMAL_RELEASE')) {
    primaryFailure = runnerError('SCENARIO_SAFETY', 'FAILURE_RECOVERY_UNSAFE', authority.scenario_id);
  }
  if (primaryFailure) throw primaryFailure;
  return Object.freeze({ observed, cleanup });
}

export async function executeDenial(adapter, authority, postgresVersion) {
  const [deniedOperation, absenceOperation] = DENIAL_OPERATIONS[authority.scenario_id];
  let primaryFailure = null;
  try { await executeExpectedFailure(adapter, authority, deniedOperation); } catch (error) { primaryFailure = error; }
  if (absenceOperation) {
    try { validateDenialObjectAbsent(singleRow(await runSafeOperation(adapter, absenceOperation), 'DENIAL_ABSENCE')); }
    catch { throw runnerError('SCENARIO_SAFETY', 'DENIAL_OBJECT_PRESENT', authority.scenario_id); }
  }
  if (primaryFailure) throw primaryFailure;
  return resultFromAuthority(authority, postgresVersion);
}

async function executeReplacement(harness, authority, postgresVersion) {
  const { adapter } = harness;
  if (typeof harness.observeClientObjects !== 'function') throw runnerError('SCENARIO_SAFETY', 'CLIENT_OBSERVER_REQUIRED', authority.scenario_id);
  const a = await adapter.acquire('A');
  if (a.release('WRONG') !== 'DESTROY_RELEASE') throw runnerError('SCENARIO_SAFETY', 'DESTRUCTION_NOT_OBSERVED', authority.scenario_id);
  const b = await adapter.acquire('B');
  const clients = harness.observeClientObjects();
  if (clients.length < 2 || clients.at(-2) === clients.at(-1)) throw runnerError('SCENARIO_SAFETY', 'REPLACEMENT_NOT_OBSERVED', authority.scenario_id);
  await b.query('B', { operationId: 'READ_STATUS_FIXTURE', values: [] });
  if (!b.sanitize('B').passed || b.release('B') !== 'NORMAL_RELEASE') throw runnerError('SCENARIO_SAFETY', 'REPLACEMENT_UNSAFE', authority.scenario_id);
  return resultFromAuthority(authority, postgresVersion, { client_destroyed: true, replacement_observed: true });
}

export async function executeBorrowerMismatch(adapter, authority, postgresVersion) {
  const lease = await adapter.acquire('OWNER');
  let observed;
  try { await lease.query('INTRUDER', { operationId: 'READ_STATUS_FIXTURE', values: [] }); }
  catch (error) { observed = boundedAdapterFailure(error); }
  if (observed?.failureCode !== 'PG_IDENTITY_MISMATCH') {
    await terminalizeLease(lease, 'OWNER', { forceDestroy: true });
    throw runnerError('SCENARIO_SAFETY', 'MISMATCH_CLASSIFICATION_INVALID', authority.scenario_id);
  }
  const cleanup = await terminalizeLease(lease, 'OWNER', { forceDestroy: true });
  if (cleanup.releaseAction !== 'DESTROY_RELEASE') throw runnerError('SCENARIO_SAFETY', 'MISMATCH_NOT_DESTROYED', authority.scenario_id);
  return resultFromAuthority(authority, postgresVersion, { client_destroyed: true });
}

export async function executeSecondRollback(adapter, authority, postgresVersion) {
  const borrower = authority.scenario_id;
  const lease = await adapter.acquire(borrower);
  await lease.begin(borrower);
  let queryFailure;
  try { await lease.query(borrower, { operationId: 'ORDINARY_QUERY_ERROR', values: [] }); }
  catch (error) { queryFailure = boundedAdapterFailure(error); }
  if (queryFailure?.failureCode !== 'PG_QUERY_FAILED') {
    await terminalizeLease(lease, borrower, { forceDestroy: true });
    throw runnerError('SCENARIO_SAFETY', 'SECOND_ROLLBACK_PREREQUISITE_INVALID', borrower);
  }
  await lease.rollback(borrower);
  let secondFailure;
  try { await lease.rollback(borrower); } catch (error) { secondFailure = boundedAdapterFailure(error); }
  if (secondFailure?.failureCode !== 'PG_RELEASE_STATE_INVALID' || lease.snapshot().rollbackAttempts !== 1) {
    await terminalizeLease(lease, borrower, { forceDestroy: true });
    throw runnerError('SCENARIO_SAFETY', 'SECOND_ROLLBACK_NOT_BLOCKED', borrower);
  }
  if (!lease.sanitize(borrower).passed || lease.release(borrower) !== 'NORMAL_RELEASE') {
    throw runnerError('SCENARIO_SAFETY', 'SECOND_ROLLBACK_RELEASE_UNSAFE', borrower);
  }
  return resultFromAuthority(authority, postgresVersion);
}

export async function closeHarnessBounded(harness, { scheduler = DEFAULT_CLOSE_SCHEDULER, timeoutMs = 2000 } = {}) {
  if (!harness || typeof harness.close !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw runnerError('SCENARIO_SAFETY', 'POOL_SHUTDOWN_INVALID');
  }
  let handle;
  const deadline = new Promise((_, reject) => {
    handle = scheduler.setTimeout(() => reject(runnerError('SCENARIO_SAFETY', 'POOL_SHUTDOWN_TIMEOUT')), timeoutMs);
  });
  try { await Promise.race([Promise.resolve().then(() => harness.close()), deadline]); }
  catch { throw runnerError('SCENARIO_SAFETY', 'POOL_SHUTDOWN_FAILED'); }
  finally { scheduler.clearTimeout(handle); }
}

async function terminalizeLease(lease, borrower, { forceDestroy = false } = {}) {
  let safe = false;
  let releaseAction = null;
  try {
    if (!forceDestroy && lease.snapshot().rollbackAttempts === 0) await lease.rollback(borrower);
    const snapshot = lease.snapshot();
    if (!forceDestroy && snapshot.transactionStatus === 'IDLE' && lease.sanitize(borrower).passed) safe = true;
  } catch {}
  try { releaseAction = lease.release(forceDestroy || !safe ? '__PD6C_FORCE_DESTROY__' : borrower); }
  catch { releaseAction = 'TERMINAL_RELEASE_FAILURE'; }
  const snapshot = lease.snapshot();
  return Object.freeze({ safe, releaseAction, rollbackAttempts: snapshot.rollbackAttempts });
}

function boundedAdapterFailure(error) {
  if (!error || typeof error.failureCode !== 'string') return null;
  return Object.freeze({ failureCode: error.failureCode, sqlstate: typeof error.sqlstate === 'string' ? error.sqlstate : null });
}

function resultFromAuthority(authority, postgresVersion, overrides = {}) {
  return createBoundedResult({
    scenario_id: authority.scenario_id,
    evidence_tier: 'PD6C_DIRECT', endpoint_class: 'DIRECT_POSTGRESQL', driver_version: '8.22.0', postgres_version: postgresVersion,
    terminal_classification: authority.terminal_classification, release_action: authority.release_action,
    failure_code: authority.failure_code, sqlstate: authority.sqlstate,
    transaction_status_before: authority.transaction_status_before,
    transaction_status_after: authority.transaction_status_after,
    rollback_attempts: authority.rollback_attempts, retry_attempted: false,
    client_destroyed: false, replacement_observed: false,
    decoded_value_class: authority.retained_evidence, pass: true, ...overrides
  });
}

export async function writeEvidenceFiles(outputDir, aggregate, io = { lstat, mkdir, rename, rm, writeFile }) {
  const finals = OUTPUT_FILENAMES.map((name) => path.join(outputDir, name));
  const temps = OUTPUT_FILENAMES.map((name) => path.join(outputDir, `.${name}.${process.pid}.tmp`));
  const published = [];
  try {
    await io.mkdir(outputDir, { recursive: true });
    for (const target of [...finals, ...temps]) {
      if (await pathExists(target, io)) throw runnerError('OUTPUT_WRITE', 'OUTPUT_ALREADY_EXISTS');
    }
    const summary = `scenario_count=30\naggregate_pass=${aggregate.aggregate_pass}\ndigest=${aggregate.canonical_digest}\nfailed_scenarios=NONE\n`;
    const contents = [JSON.stringify(aggregate, null, 2) + '\n', `${aggregate.canonical_digest}\n`, summary];
    for (let index = 0; index < OUTPUT_FILENAMES.length; index += 1) {
      await io.writeFile(temps[index], contents[index], { encoding: 'utf8', flag: 'wx' });
    }
    for (let index = 0; index < OUTPUT_FILENAMES.length; index += 1) {
      await io.rename(temps[index], finals[index]);
      published.push(finals[index]);
    }
    return Object.freeze(finals.slice());
  } catch (error) {
    await Promise.allSettled([...temps, ...published].map((target) => io.rm?.(target, { force: true })));
    if (error?.runnerCategory === 'OUTPUT_WRITE') throw error;
    throw runnerError('OUTPUT_WRITE', 'OUTPUT_WRITE_FAILED');
  }
}

async function canonicalizeExistingPath(input, { pathApi, fsApi }) {
  const absolute = pathApi.resolve(input);
  let cursor = absolute;
  const suffix = [];
  while (true) {
    try {
      await fsApi.lstat(cursor);
      const canonicalAncestor = await fsApi.realpath(cursor);
      return suffix.reduceRight((current, component) => pathApi.join(current, component), pathApi.resolve(canonicalAncestor));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = pathApi.dirname(cursor);
      if (parent === cursor) throw error;
      suffix.push(pathApi.basename(cursor));
      cursor = parent;
    }
  }
}

function isContainedPath(root, candidate, { pathApi, caseInsensitive }) {
  const normalize = (value) => caseInsensitive ? value.toLocaleLowerCase('en-US') : value;
  const relative = pathApi.relative(normalize(root), normalize(candidate));
  return relative === '' || (!relative.startsWith(`..${pathApi.sep}`) && relative !== '..' && !pathApi.isAbsolute(relative));
}

async function pathExists(target, io) {
  try { await io.lstat(target); return true; } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function authorityFor(id) {
  if (TYPE_CLASSES[id] || id === 'PD6-D-004') return 'READ_TYPE_FIXTURE';
  if (DENIAL_OPERATIONS[id]) return DENIAL_OPERATIONS[id].join('+');
  return PHASES[id] ?? 'TRUSTED_ADAPTER';
}

function singleRow(result, label) {
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) throw runnerError('BASELINE', `${label}_ROW_INVALID`);
  return result.rows[0];
}

function assertDecodedClass(value, expected) {
  const actual = value === null ? 'NULL' : value instanceof Date ? 'DATE'
    : Buffer.isBuffer(value) ? 'BUFFER' : Array.isArray(value) ? 'ARRAY'
      : typeof value === 'number' ? 'NUMBER' : typeof value === 'string' ? 'STRING'
        : typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'object' ? 'OBJECT' : 'INVALID';
  if (actual !== expected) throw runnerError('BASELINE', 'TYPE_DECODE_CLASS_MISMATCH');
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function boundedCode(error) {
  return typeof error?.runnerCode === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.runnerCode) ? error.runnerCode : 'UNEXPECTED_RUNNER_FAILURE';
}

function boundedBaselineOperation(value) {
  return BASELINE_OPERATION_IDS.includes(value) ? value : null;
}

function boundedBaselineTarget(value) {
  return BASELINE_VALIDATION_TARGETS.includes(value) ? value : null;
}

function withBaselineTarget(target, validation) {
  try { return validation(); }
  catch (error) {
    error.target = boundedBaselineTarget(target);
    throw error;
  }
}

function runnerError(category, code, scenarioId = null, { operation = null, target = null } = {}) {
  const error = new Error(code);
  error.runnerCategory = category;
  error.runnerCode = code;
  error.scenarioId = scenarioId;
  error.operation = boundedBaselineOperation(operation);
  error.target = boundedBaselineTarget(target);
  return error;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exitCode = await main();
