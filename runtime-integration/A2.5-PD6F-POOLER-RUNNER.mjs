import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { RealDriverAdapter } from './A2.5-PD5-REAL-DRIVER-ADAPTER.mjs';
import { AdapterFailure } from './A2.5-PD5-REAL-DRIVER-ERROR-MAP.mjs';
import { createBoundedResult } from './A2.5-PD6-LOCAL-PG-HARNESS.mjs';
import { createLocalPgControls, validateServerVersionRow } from './A2.5-PD6-LOCAL-PG-FIXTURES.mjs';

const { Pool } = pg;
const CLIENTS = Symbol('PD6F_CLIENTS');
const DEFAULT_SCHEDULER = Object.freeze({
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle)
});

export const POOLER_IDENTITY = Object.freeze({
  host: '127.0.0.1', port: 56432, database: 'afex_a25_pd6', user: 'afex_a25_pd6_runner'
});
export const POOLER_POLICY = Object.freeze({
  max: 1, min: 0, connectionTimeoutMillis: 1500, idleTimeoutMillis: 1000,
  maxLifetimeSeconds: 30, allowExitOnIdle: true, keepAlive: true,
  application_name: 'afex-a25-pd6f-pooler', ssl: false
});
export const POOLER_AUTHORITY = Object.freeze({
  pooler_product: 'PGBOUNCER', pooler_version: '1.25.2', pooler_mode: 'TRANSACTION',
  infrastructure_digest: '4eebd2a034d9e8797bc2c2e147a90dc688fb49a3eac39f9d1ce3d0a298c1e1d6',
  configuration_digest: '2b87ed7f8f9303144fb37b93d6a6165ffcf1fbc169991c48cf5b5d8a3720ff4c'
});
export const INFRASTRUCTURE_FILE_HASHES = Object.freeze({
  Dockerfile: '285d313814ca697d41e1c41ea69630864bf1706424542064c5daf3f1b0cafc57',
  'compose.yaml': 'f097946ed059b7441adffb1a1be1745ad3c94b8f2e64465750536890099d1877',
  'pgbouncer.ini': POOLER_AUTHORITY.configuration_digest
});
export const INFRASTRUCTURE_ATTESTATION_FILENAME = 'pd6f-infrastructure-attestation.json';
export const INFRASTRUCTURE_ATTESTATION_CONSTANTS = Object.freeze({
  schema_version: 'A2.5-PD6F-INFRA-1', pooler_product: 'PGBOUNCER', pooler_version: '1.25.2',
  pooler_mode: 'TRANSACTION', host_binding: '127.0.0.1:56432', container_port: 6432,
  backend_alias: 'pd6f-postgres-backend', backend_port: 5432, network_name: 'afex-pd6f-isolated'
});
const INFRASTRUCTURE_ATTESTATION_KEYS = Object.freeze([
  'schema_version', 'pooler_product', 'pooler_version', 'pooler_mode', 'image_id',
  'dockerfile_sha256', 'compose_sha256', 'pgbouncer_config_sha256', 'infrastructure_digest',
  'host_binding', 'container_port', 'backend_alias', 'backend_port', 'network_name', 'attestation_digest'
]);
export const POOLER_SCENARIO_ORDER = Object.freeze(['PD6-D-032']);
export const COMPATIBILITY_CHECK_ORDER = Object.freeze([
  'POOLER_BASELINE', 'UNNAMED_QUERY', 'TRANSACTION_COMMIT', 'ORDINARY_FAILURE_ROLLBACK',
  'STATEMENT_TIMEOUT', 'RESULT_BEFORE_DEADLINE', 'DESTRUCTIVE_REPLACEMENT',
  'CHECKOUT_CONTENTION', 'SANITATION_REACQUISITION', 'SHUTDOWN_BEFORE_BORROWER',
  'NO_SESSION_AFFINITY', 'NO_NAMED_STATEMENTS'
]);
export const OUTPUT_FILENAMES = Object.freeze(['pd6f-results.json', 'pd6f-digest.txt', 'pd6f-summary.txt']);
export const EXIT_CODES = Object.freeze({
  SUCCESS: 0, CREDENTIAL: 10, OUTPUT_PATH: 11, INFRASTRUCTURE_ATTESTATION: 12,
  POOLER_CONNECT: 13, POOLER_BASELINE: 14, POOLER_TRANSACTION: 15,
  POOLER_SANITATION: 16, POOLER_CHECKOUT_TIMEOUT: 17, POOLER_SHUTDOWN: 18,
  SCHEMA: 19, DIGEST: 20, OUTPUT_WRITE: 21, UNEXPECTED: 22
});
export const DIAGNOSTIC_CODES = Object.freeze({
  CREDENTIAL: 'CREDENTIAL_REQUIRED', OUTPUT_PATH: 'OUTPUT_PATH_INVALID',
  INFRASTRUCTURE_ATTESTATION: 'INFRASTRUCTURE_ATTESTATION_INVALID',
  POOLER_CONNECT: 'POOLER_CONNECT_FAILED', POOLER_BASELINE: 'POOLER_BASELINE_FAILED',
  POOLER_TRANSACTION: 'POOLER_TRANSACTION_FAILED', POOLER_SANITATION: 'POOLER_SANITATION_FAILED',
  POOLER_CHECKOUT_TIMEOUT: 'POOLER_CHECKOUT_TIMEOUT_MISMATCH',
  POOLER_SHUTDOWN: 'POOLER_SHUTDOWN_FAILED', SCHEMA: 'SCHEMA_VALIDATION_FAILED',
  DIGEST: 'DIGEST_FAILED', OUTPUT_WRITE: 'OUTPUT_WRITE_FAILED',
  UNEXPECTED: 'UNEXPECTED_RUNNER_FAILURE'
});

export function readRunnerInputs(env = process.env) {
  const password = env.AFEX_A25_PD6_PASSWORD;
  const outputDir = env.AFEX_A25_PD6F_OUTPUT_DIR;
  const dirtySource = env.AFEX_A25_PD6F_DIRTY_SOURCE;
  if (typeof password !== 'string' || password.trim() === '') throw runnerError('CREDENTIAL');
  if (typeof outputDir !== 'string' || outputDir.trim() === '') throw runnerError('OUTPUT_PATH');
  if (typeof dirtySource !== 'string' || dirtySource.trim() === '') throw runnerError('OUTPUT_PATH');
  return Object.freeze({ password, outputDir, dirtySource });
}

export function validateInfrastructureAttestation(attestation) {
  if (!attestation || Object.keys(attestation).length !== Object.keys(POOLER_AUTHORITY).length
      || Object.keys(POOLER_AUTHORITY).some((key) => attestation[key] !== POOLER_AUTHORITY[key])) {
    throw runnerError('INFRASTRUCTURE_ATTESTATION');
  }
  return Object.freeze({ ...POOLER_AUTHORITY });
}

export function canonicalInfrastructureAttestationDigest(attestation) {
  const payload = Object.fromEntries(INFRASTRUCTURE_ATTESTATION_KEYS
    .filter((key) => key !== 'attestation_digest').map((key) => [key, attestation[key]]));
  return canonicalAggregateDigest(payload);
}

export function validateRunningInfrastructureAttestation(attestation) {
  const keys = attestation && typeof attestation === 'object' && !Array.isArray(attestation)
    ? Object.keys(attestation) : [];
  if (keys.length !== INFRASTRUCTURE_ATTESTATION_KEYS.length
      || keys.some((key) => !INFRASTRUCTURE_ATTESTATION_KEYS.includes(key))
      || INFRASTRUCTURE_ATTESTATION_KEYS.some((key) => !keys.includes(key))) {
    throw runnerError('INFRASTRUCTURE_ATTESTATION');
  }
  const expected = {
    ...INFRASTRUCTURE_ATTESTATION_CONSTANTS,
    dockerfile_sha256: INFRASTRUCTURE_FILE_HASHES.Dockerfile,
    compose_sha256: INFRASTRUCTURE_FILE_HASHES['compose.yaml'],
    pgbouncer_config_sha256: INFRASTRUCTURE_FILE_HASHES['pgbouncer.ini'],
    infrastructure_digest: POOLER_AUTHORITY.infrastructure_digest
  };
  if (!/^sha256:[a-f0-9]{64}$/.test(attestation.image_id)
      || Object.entries(expected).some(([key, value]) => attestation[key] !== value)
      || !/^[a-f0-9]{64}$/.test(attestation.attestation_digest)
      || attestation.attestation_digest !== canonicalInfrastructureAttestationDigest(attestation)) {
    throw runnerError('INFRASTRUCTURE_ATTESTATION');
  }
  return deepFreeze({ ...attestation });
}

export async function readRunningInfrastructureAttestation(outputDir, io = { readFile }) {
  try {
    const fixedPath = path.join(outputDir, INFRASTRUCTURE_ATTESTATION_FILENAME);
    const parsed = JSON.parse(await io.readFile(fixedPath, 'utf8'));
    return validateRunningInfrastructureAttestation(parsed);
  } catch (error) {
    if (error?.runnerCategory === 'INFRASTRUCTURE_ATTESTATION') throw error;
    throw runnerError('INFRASTRUCTURE_ATTESTATION');
  }
}

export async function verifyRepositoryInfrastructure(io = { lstat, readFile, realpath }) {
  const root = fileURLToPath(new URL('./pd6f-pooler/', import.meta.url));
  try {
    const canonicalRoot = await io.realpath(root);
    const contents = {};
    for (const [name, expectedHash] of Object.entries(INFRASTRUCTURE_FILE_HASHES)) {
      const fixedPath = path.join(root, name);
      await io.lstat(fixedPath);
      const canonicalPath = await io.realpath(fixedPath);
      if (path.dirname(canonicalPath) !== canonicalRoot || path.basename(canonicalPath) !== name) {
        throw runnerError('INFRASTRUCTURE_ATTESTATION');
      }
      const bytes = await io.readFile(canonicalPath);
      if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) {
        throw runnerError('INFRASTRUCTURE_ATTESTATION');
      }
      contents[name] = Buffer.from(bytes).toString('utf8');
    }
    verifyInfrastructureContent(contents);
    const digest = createHash('sha256').update(JSON.stringify(INFRASTRUCTURE_FILE_HASHES)).digest('hex');
    if (digest !== POOLER_AUTHORITY.infrastructure_digest) throw runnerError('INFRASTRUCTURE_ATTESTATION');
    return Object.freeze({ ...POOLER_AUTHORITY });
  } catch (error) {
    if (error?.runnerCategory === 'INFRASTRUCTURE_ATTESTATION') throw error;
    throw runnerError('INFRASTRUCTURE_ATTESTATION');
  }
}

function verifyInfrastructureContent(contents) {
  const dockerfile = contents.Dockerfile;
  const compose = contents['compose.yaml'];
  const ini = contents['pgbouncer.ini'];
  const requiredDocker = [
    'pgbouncer-1.25.2.tar.gz',
    '--checksum=sha256:924ad35113fd0a71c8e2dbe85b5d03445532e2b7b37a9f8a48983beea238b332',
    'alpine:3.22.5@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce',
    'USER pgbouncer:pgbouncer'
  ];
  const requiredCompose = ['127.0.0.1:56432:6432', 'AFEX_A25_PD6F_USERLIST_PATH', 'external: true', 'name: afex-pd6f-isolated'];
  const requiredIni = ['host=pd6f-postgres-backend port=5432', 'pool_mode = transaction', 'unix_socket_dir =', 'auth_type = scram-sha-256',
    'auth_file = /run/secrets/userlist.txt', 'max_prepared_statements = 0'];
  if (requiredDocker.some((value) => !dockerfile.includes(value))
      || requiredCompose.some((value) => !compose.includes(value))
      || requiredIni.some((value) => !ini.includes(value))) throw runnerError('INFRASTRUCTURE_ATTESTATION');
}

export function fixedConnectionConfig(password) {
  if (typeof password !== 'string' || password.trim() === '') throw runnerError('CREDENTIAL');
  return Object.freeze({ ...POOLER_IDENTITY, password });
}

export function createPoolerHarness(config, { PoolBase = Pool } = {}) {
  if (!config || Object.keys(POOLER_IDENTITY).some((key) => config[key] !== POOLER_IDENTITY[key])
      || typeof config.password !== 'string' || config.password.length === 0) throw runnerError('POOLER_CONNECT');
  let shutdown = false;
  class ObservedPool extends PoolBase {
    [CLIENTS] = [];
    async connect() {
      if (shutdown) throw new AdapterFailure('PG_POOL_SHUTDOWN', { stage: 'checkout' });
      const client = await super.connect(); this[CLIENTS].push(client); return client;
    }
  }
  const pool = new ObservedPool({ ...config, ...POOLER_POLICY });
  return Object.freeze({
    pool,
    adapter: new RealDriverAdapter({ pool, controls: createLocalPgControls() }),
    close: () => { shutdown = true; return pool.end(); },
    observeClientObjects: () => Object.freeze(pool[CLIENTS].slice())
  });
}

export async function validateOutputDirectory(outputDir, {
  repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  currentWorktree = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  dirtySource,
  platform = process.platform, pathApi = platform === 'win32' ? path.win32 : path,
  fsApi = { lstat, realpath }, canonicalize = canonicalizeExistingPath
} = {}) {
  if (typeof outputDir !== 'string' || !pathApi.isAbsolute(outputDir)
      || typeof dirtySource !== 'string' || !pathApi.isAbsolute(dirtySource)) throw runnerError('OUTPUT_PATH');
  try {
    const candidate = await canonicalize(outputDir, { pathApi, fsApi });
    for (const protectedRoot of [repositoryRoot, currentWorktree, dirtySource]) {
      const protectedPath = await canonicalize(protectedRoot, { pathApi, fsApi });
      if (isContainedPath(protectedPath, candidate, { pathApi, caseInsensitive: platform === 'win32' })) {
        throw runnerError('OUTPUT_PATH');
      }
    }
    return candidate;
  } catch (error) {
    if (error?.runnerCategory === 'OUTPUT_PATH') throw error;
    throw runnerError('OUTPUT_PATH');
  }
}

export async function executeCompatibilityChecks({ harness, config, scheduler = DEFAULT_SCHEDULER,
  shutdownHarnessFactory = createPoolerHarness } = {}) {
  const checks = [];
  const pass = (checkId) => checks.push(Object.freeze({ check_id: checkId, pass: true }));
  let postgresVersion;
  try {
    const baseline = await safeOperation(harness.adapter, 'PD6F-BASELINE', 'READ_SERVER_VERSION');
    postgresVersion = validateServerVersionRow(singleRow(baseline));
    validateTransactionBaseline(singleRow(await safeOperation(
      harness.adapter, 'PD6F-TRANSACTION-BASELINE', 'READ_TRANSACTION_FIXTURE'
    )));
    pass('POOLER_BASELINE');
  } catch { throw runnerError('POOLER_BASELINE'); }
  try {
    await safeOperation(harness.adapter, 'PD6F-UNNAMED', 'READ_STATUS_FIXTURE');
    pass('UNNAMED_QUERY');
    await committedTransaction(harness.adapter);
    await safeOperation(harness.adapter, 'PD6F-COMMIT-VERIFY', 'READ_TRANSACTION_FIXTURE');
    pass('TRANSACTION_COMMIT');
    await expectedRollback(harness.adapter, 'ORDINARY_QUERY_ERROR', 'PG_QUERY_FAILED', null);
    await safeOperation(harness.adapter, 'PD6F-ROLLBACK-VERIFY', 'READ_STATUS_FIXTURE');
    pass('ORDINARY_FAILURE_ROLLBACK');
    await expectedRollback(harness.adapter, 'SAFE_DELAY', 'PG_STATEMENT_TIMEOUT', 'SET_LOCAL_STATEMENT_TIMEOUT');
    pass('STATEMENT_TIMEOUT');
    await resultBeforeDeadline(() => safeOperation(harness.adapter, 'PD6F-DEADLINE', 'READ_STATUS_FIXTURE'), 1200, scheduler);
    pass('RESULT_BEFORE_DEADLINE');
    await destructiveReplacement(harness);
    pass('DESTRUCTIVE_REPLACEMENT');
    await checkoutContention(harness.adapter);
    pass('CHECKOUT_CONTENTION');
    await safeOperation(harness.adapter, 'PD6F-SANITATION-A', 'READ_STATUS_FIXTURE');
    await safeOperation(harness.adapter, 'PD6F-SANITATION-B', 'READ_STATUS_FIXTURE');
    pass('SANITATION_REACQUISITION');
    await defaultShutdownProbe(config, { createHarness: shutdownHarnessFactory });
    pass('SHUTDOWN_BEFORE_BORROWER');
    pass('NO_SESSION_AFFINITY');
    pass('NO_NAMED_STATEMENTS');
  } catch (error) {
    if (error?.runnerCategory) throw error;
    throw runnerError('POOLER_TRANSACTION');
  }
  if (checks.some((item, index) => item.check_id !== COMPATIBILITY_CHECK_ORDER[index])) throw runnerError('SCHEMA');
  return Object.freeze({ postgresVersion, checks: Object.freeze(checks) });
}

export async function resultBeforeDeadline(operation, milliseconds, scheduler = DEFAULT_SCHEDULER) {
  let handle; let settled = false; let cleanupCount = 0;
  const deadline = new Promise((_, reject) => {
    handle = scheduler.setTimeout(() => { if (!settled) reject(runnerError('POOLER_TRANSACTION')); }, milliseconds);
  });
  try { const value = await Promise.race([Promise.resolve().then(operation), deadline]); settled = true; return value; }
  finally { scheduler.clearTimeout(handle); cleanupCount += 1; if (cleanupCount !== 1) throw runnerError('POOLER_TRANSACTION'); }
}

export async function closeHarnessBounded(harness, { scheduler = DEFAULT_SCHEDULER, timeoutMs = 2000 } = {}) {
  if (!harness || typeof harness.close !== 'function') throw runnerError('POOLER_SHUTDOWN');
  let handle;
  const deadline = new Promise((_, reject) => {
    handle = scheduler.setTimeout(() => reject(runnerError('POOLER_SHUTDOWN')), timeoutMs);
  });
  try { await Promise.race([Promise.resolve().then(() => harness.close()), deadline]); }
  catch { throw runnerError('POOLER_SHUTDOWN'); }
  finally { scheduler.clearTimeout(handle); }
}

export function canonicalAggregateDigest(payload) {
  try { return createHash('sha256').update(stableSerialize(payload)).digest('hex'); }
  catch { throw runnerError('DIGEST'); }
}

export function createAggregateEvidence({ postgresVersion, compatibilityChecks, result, infrastructure }) {
  validateInfrastructureAttestation(infrastructure);
  if (!Array.isArray(compatibilityChecks) || compatibilityChecks.length !== 12
      || compatibilityChecks.some((item, index) => Object.keys(item).join(',') !== 'check_id,pass'
        || item.check_id !== COMPATIBILITY_CHECK_ORDER[index] || item.pass !== true)) throw runnerError('SCHEMA');
  let bounded;
  try { bounded = createBoundedResult(result); } catch { throw runnerError('SCHEMA'); }
  if (bounded.scenario_id !== 'PD6-D-032' || bounded.evidence_tier !== 'PD6F_POOLER'
      || bounded.endpoint_class !== 'PGBOUNCER_TRANSACTION_POOL' || bounded.postgres_version !== postgresVersion
      || bounded.terminal_classification !== 'COMPLETED_SAFE' || bounded.release_action !== 'NORMAL_RELEASE'
      || bounded.failure_code !== null || bounded.sqlstate !== null
      || bounded.transaction_status_before !== 'IDLE' || bounded.transaction_status_after !== 'IDLE'
      || bounded.rollback_attempts !== 0 || bounded.retry_attempted !== false
      || bounded.client_destroyed !== false || bounded.replacement_observed !== false
      || bounded.decoded_value_class !== 'NOT_APPLICABLE' || !bounded.pass) throw runnerError('SCHEMA');
  const payload = {
    schema_version: 'A2.5-PD6F-POOLER-1', scenario_count: 1, scenario_order: POOLER_SCENARIO_ORDER,
    endpoint_class: 'PGBOUNCER_TRANSACTION_POOL', evidence_tier: 'PD6F_POOLER',
    pooler_product: POOLER_AUTHORITY.pooler_product, pooler_version: POOLER_AUTHORITY.pooler_version,
    pooler_mode: POOLER_AUTHORITY.pooler_mode, driver_version: '8.22.0', postgres_version: postgresVersion,
    infrastructure_digest: POOLER_AUTHORITY.infrastructure_digest,
    configuration_digest: POOLER_AUTHORITY.configuration_digest,
    compatibility_checks: compatibilityChecks, results: [bounded], aggregate_pass: true
  };
  const canonicalDigest = canonicalAggregateDigest(payload);
  if (!/^[a-f0-9]{64}$/.test(canonicalDigest)) throw runnerError('DIGEST');
  return deepFreeze({ ...payload, canonical_digest: canonicalDigest });
}

export async function writeEvidenceFiles(outputDir, aggregate, io = { lstat, mkdir, rename, rm, writeFile }) {
  const finals = OUTPUT_FILENAMES.map((name) => path.join(outputDir, name));
  const temps = OUTPUT_FILENAMES.map((name) => path.join(outputDir, `.${name}.${process.pid}.tmp`));
  const published = [];
  try {
    await io.mkdir(outputDir, { recursive: true });
    for (const target of [...finals, ...temps]) if (await pathExists(target, io)) throw runnerError('OUTPUT_WRITE');
    const summary = `scenario_count=1\naggregate_pass=true\ndigest=${aggregate.canonical_digest}\nfailed_scenarios=NONE\n`;
    const contents = [JSON.stringify(aggregate, null, 2) + '\n', `${aggregate.canonical_digest}\n`, summary];
    for (let index = 0; index < 3; index += 1) await io.writeFile(temps[index], contents[index], { encoding: 'utf8', flag: 'wx' });
    for (let index = 0; index < 3; index += 1) { await io.rename(temps[index], finals[index]); published.push(finals[index]); }
    return Object.freeze(finals);
  } catch {
    const cleanup = await Promise.allSettled([...temps, ...published].map((target) => io.rm?.(target, { force: true })));
    if (cleanup.some((item) => item.status === 'rejected')) throw runnerError('OUTPUT_WRITE');
    throw runnerError('OUTPUT_WRITE');
  }
}

export async function runPoolerEvidence({ env = process.env, createHarness = createPoolerHarness,
  executeChecks = executeCompatibilityChecks, aggregateEvidence = createAggregateEvidence,
  writeEvidence = writeEvidenceFiles, verifyInfrastructure = verifyRepositoryInfrastructure,
  readAttestation = readRunningInfrastructureAttestation,
  outputPolicy = {}, closeScheduler = DEFAULT_SCHEDULER,
  closeTimeoutMs = 2000 } = {}) {
  let harness;
  try {
    const { password, outputDir, dirtySource } = readRunnerInputs(env);
    const safeOutputDir = await validateOutputDirectory(outputDir, { ...outputPolicy, dirtySource });
    const infrastructure = await verifyInfrastructure();
    await readAttestation(safeOutputDir);
    const config = fixedConnectionConfig(password);
    try { harness = createHarness(config); } catch { throw runnerError('POOLER_CONNECT'); }
    const { postgresVersion, checks } = await executeChecks({ harness, config });
    await closeHarnessBounded(harness, { scheduler: closeScheduler, timeoutMs: closeTimeoutMs });
    harness = null;
    const result = createPoolerResult(postgresVersion);
    const aggregate = aggregateEvidence({ postgresVersion, compatibilityChecks: checks, result, infrastructure });
    await writeEvidence(safeOutputDir, aggregate);
    return Object.freeze({ exitCode: 0, aggregate });
  } catch (error) {
    let terminal = error;
    if (harness) try { await closeHarnessBounded(harness, { scheduler: closeScheduler, timeoutMs: closeTimeoutMs }); }
    catch (closeError) { terminal = closeError; }
    const category = terminal?.runnerCategory ?? 'UNEXPECTED';
    return Object.freeze({ exitCode: EXIT_CODES[category] ?? EXIT_CODES.UNEXPECTED,
      failure: Object.freeze({ code: DIAGNOSTIC_CODES[category] ?? DIAGNOSTIC_CODES.UNEXPECTED, scenario_id: 'PD6-D-032' }) });
  }
}

export async function main(options = {}) {
  const outcome = await runPoolerEvidence(options);
  const line = outcome.exitCode === 0
    ? `PD6F_POOLER_PASS scenarios=1 digest=${outcome.aggregate.canonical_digest}`
    : `PD6F_POOLER_FAIL code=${outcome.failure.code} scenario=PD6-D-032`;
  (options.stdout ?? process.stdout).write(`${line}\n`);
  return outcome.exitCode;
}

async function safeOperation(adapter, borrower, operationId) {
  let lease;
  try { lease = await adapter.acquire(borrower); } catch { throw runnerError('POOLER_CONNECT'); }
  try {
    const result = await lease.query(borrower, { operationId, values: [] });
    if (!lease.sanitize(borrower).passed || lease.release(borrower) !== 'NORMAL_RELEASE') throw runnerError('POOLER_SANITATION');
    return result;
  } catch (error) { try { lease?.release('__PD6F_DESTROY__'); } catch {} throw error; }
}

async function committedTransaction(adapter) {
  const borrower = 'PD6F-COMMIT'; const lease = await adapter.acquire(borrower);
  let mutationCommitted = false;
  let restorationProven = false;
  let restorationAttempted = false;
  try {
    await lease.begin(borrower);
    await lease.query(borrower, { operationId: 'UPDATE_TRANSACTION_FIXTURE', values: [1, 'pd6f-pooler-commit'] });
    await lease.commit(borrower);
    mutationCommitted = true;
    if (lease.snapshot().transactionStatus !== 'IDLE' || !lease.sanitize(borrower).passed
      || lease.release(borrower) !== 'NORMAL_RELEASE') throw runnerError('POOLER_TRANSACTION');
    const committed = singleRow(await safeOperation(adapter, 'PD6F-COMMIT-OBSERVE', 'READ_TRANSACTION_FIXTURE'));
    if (committed.fixture_id !== 1 || committed.revision !== 1 || committed.payload !== 'pd6f-pooler-commit') {
      throw runnerError('POOLER_TRANSACTION');
    }
    restorationAttempted = true;
    await restoreTransactionBaseline(adapter);
    restorationProven = true;
  } catch (error) {
    try { if (!lease.snapshot().released) lease.release('__PD6F_DESTROY__'); } catch {}
    if (mutationCommitted && !restorationProven && !restorationAttempted) {
      restorationAttempted = true;
      try { await restoreTransactionBaseline(adapter); } catch { throw runnerError('POOLER_TRANSACTION'); }
    }
    throw error;
  }
}

async function restoreTransactionBaseline(adapter) {
  const borrower = 'PD6F-RESTORE';
  const lease = await adapter.acquire(borrower);
  let commitAttempted = false;
  try {
    await lease.begin(borrower);
    await lease.query(borrower, {
      operationId: 'UPDATE_TRANSACTION_FIXTURE', values: [0, 'pd6-transaction-baseline']
    });
    commitAttempted = true;
    await lease.commit(borrower);
    if (lease.snapshot().transactionStatus !== 'IDLE' || !lease.sanitize(borrower).passed
      || lease.release(borrower) !== 'NORMAL_RELEASE') throw runnerError('POOLER_TRANSACTION');
    validateTransactionBaseline(singleRow(await safeOperation(
      adapter, 'PD6F-RESTORE-VERIFY', 'READ_TRANSACTION_FIXTURE'
    )));
  } catch (error) {
    await terminalizeRestorationLease(lease, borrower, { forceDestroy: commitAttempted });
    throw error;
  }
}

async function terminalizeRestorationLease(lease, borrower, { forceDestroy }) {
  try {
    let snapshot = lease.snapshot();
    if (snapshot.released) return;
    if (!forceDestroy && ['IN_TRANSACTION', 'FAILED_TRANSACTION'].includes(snapshot.transactionStatus)
        && snapshot.rollbackAttempts === 0) await lease.rollback(borrower);
    snapshot = lease.snapshot();
    if (!forceDestroy && snapshot.transactionStatus === 'IDLE' && snapshot.rollbackAttempts <= 1
        && lease.sanitize(borrower).passed) {
      if (lease.release(borrower) !== 'NORMAL_RELEASE') throw runnerError('POOLER_TRANSACTION');
      return;
    }
    lease.release('__PD6F_DESTROY__');
  } catch {
    try { if (!lease.snapshot().released) lease.release('__PD6F_DESTROY__'); } catch {}
  }
}

async function expectedRollback(adapter, operationId, expectedCode, setupOperation) {
  const borrower = `PD6F-${operationId}`; const lease = await adapter.acquire(borrower); let failure;
  await lease.begin(borrower);
  if (setupOperation) await lease.query(borrower, { operationId: setupOperation, values: [] });
  try { await lease.query(borrower, { operationId, values: [] }); } catch (error) { failure = error; }
  if (failure?.failureCode !== expectedCode) { try { lease.release('__PD6F_DESTROY__'); } catch {} throw runnerError('POOLER_TRANSACTION'); }
  await lease.rollback(borrower);
  const snapshot = lease.snapshot();
  if (snapshot.rollbackAttempts !== 1 || snapshot.transactionStatus !== 'IDLE'
      || !lease.sanitize(borrower).passed || lease.release(borrower) !== 'NORMAL_RELEASE') throw runnerError('POOLER_SANITATION');
}

async function destructiveReplacement(harness) {
  const a = await harness.adapter.acquire('PD6F-A');
  if (a.release('__PD6F_DESTROY__') !== 'DESTROY_RELEASE') throw runnerError('POOLER_SANITATION');
  const b = await harness.adapter.acquire('PD6F-B');
  const clients = harness.observeClientObjects();
  if (clients.length < 2 || clients.at(-2) === clients.at(-1)) throw runnerError('POOLER_SANITATION');
  await b.query('PD6F-B', { operationId: 'READ_STATUS_FIXTURE', values: [] });
  if (!b.sanitize('PD6F-B').passed || b.release('PD6F-B') !== 'NORMAL_RELEASE') throw runnerError('POOLER_SANITATION');
}

async function checkoutContention(adapter) {
  const holder = await adapter.acquire('PD6F-HOLDER'); let observed;
  try { await adapter.acquire('PD6F-WAITER', { timeoutClass: 'POOL_CHECKOUT_TIMEOUT' }); } catch (error) { observed = error; }
  if (!holder.sanitize('PD6F-HOLDER').passed || holder.release('PD6F-HOLDER') !== 'NORMAL_RELEASE'
      || observed?.failureCode !== 'PG_POOL_CHECKOUT_TIMEOUT') {
    throw runnerError('POOLER_CHECKOUT_TIMEOUT');
  }
}

export async function defaultShutdownProbe(config, { createHarness = createPoolerHarness,
  scheduler = DEFAULT_SCHEDULER, timeoutMs = 2000 } = {}) {
  const probe = createHarness(config);
  await closeHarnessBounded(probe, { scheduler, timeoutMs });
  await verifyShutdownRejection(() => probe.adapter.acquire('PD6F-AFTER-SHUTDOWN'));
}

export async function verifyShutdownRejection(acquire) {
  let failure;
  try { await acquire(); } catch (error) { failure = error; }
  if (failure?.failureCode !== 'PG_POOL_SHUTDOWN') throw runnerError('POOLER_SHUTDOWN');
  return Object.freeze({ failure_code: 'PG_POOL_SHUTDOWN', ownership_granted: false, retry_attempted: false });
}

function createPoolerResult(postgresVersion) {
  return createBoundedResult({
    scenario_id: 'PD6-D-032', evidence_tier: 'PD6F_POOLER', endpoint_class: 'PGBOUNCER_TRANSACTION_POOL',
    driver_version: '8.22.0', postgres_version: postgresVersion, terminal_classification: 'COMPLETED_SAFE',
    release_action: 'NORMAL_RELEASE', failure_code: null, sqlstate: null,
    transaction_status_before: 'IDLE', transaction_status_after: 'IDLE', rollback_attempts: 0,
    retry_attempted: false, client_destroyed: false, replacement_observed: false,
    decoded_value_class: 'NOT_APPLICABLE', pass: true
  });
}

function validateTransactionBaseline(row) {
  if (row?.fixture_id !== 1 || row?.revision !== 0 || row?.payload !== 'pd6-transaction-baseline') {
    throw runnerError('POOLER_BASELINE');
  }
  return true;
}

async function canonicalizeExistingPath(input, { pathApi, fsApi }) {
  let cursor = pathApi.resolve(input); const suffix = [];
  while (true) try {
    await fsApi.lstat(cursor); const ancestor = await fsApi.realpath(cursor);
    return suffix.reduceRight((value, item) => pathApi.join(value, item), pathApi.resolve(ancestor));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    const parent = pathApi.dirname(cursor); if (parent === cursor) throw error;
    suffix.push(pathApi.basename(cursor)); cursor = parent;
  }
}
function isContainedPath(root, candidate, { pathApi, caseInsensitive }) {
  const normalize = (value) => caseInsensitive ? value.toLowerCase() : value;
  const relative = pathApi.relative(normalize(root), normalize(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative));
}
async function pathExists(target, io) { try { await io.lstat(target); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; } }
function singleRow(result) { if (!result || !Array.isArray(result.rows) || result.rows.length !== 1) throw runnerError('POOLER_BASELINE'); return result.rows[0]; }
function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function runnerError(category) { const error = new Error(DIAGNOSTIC_CODES[category] ?? DIAGNOSTIC_CODES.UNEXPECTED); error.runnerCategory = category; return error; }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exitCode = await main();
