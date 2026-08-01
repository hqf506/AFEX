import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type QueryRow = Readonly<Record<string, unknown>>;
type QueryResult = { rows: ReadonlyArray<QueryRow>; rowCount: number | null };
type FixedClient = {
  query(config: { text: string; values?: readonly unknown[]; name?: never }): Promise<QueryResult>;
  release(destroy?: boolean): void;
};
type FixedPool = {
  connect(): Promise<FixedClient>;
  end(): Promise<void>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
};
type PgModule = { Pool: new (config: Record<string, unknown>) => FixedPool };
type SqlStateError = Error & { code?: string };
type ResultStatus = "PASS" | "FAIL" | "INCOMPLETE";
type DenialRecord = Readonly<{ operationId: string; targetCategory: string; expectedSqlState: "42501"; actualSqlState: string; status: "PASS" | "FAIL"; safeErrorClass: string; timestampUtc: string }>;
type CaseResult = Readonly<{
  id: string;
  status: ResultStatus;
  startedAtUtc: string;
  endedAtUtc: string;
  assertions: ReadonlyArray<string>;
  observations: Readonly<Record<string, unknown>>;
}>;
type ControllerDefinition = Readonly<{
  id: string;
  prerequisites: ReadonlyArray<string>;
  phases: ReadonlyArray<string>;
  timeoutInput: string;
  expected: string;
  quarantine: string;
  evidence: ReadonlyArray<string>;
  cleanup: string;
  sourceStatus: "IMPLEMENTED" | "BLOCKED_PLACEHOLDER";
}>;

const AUTHORIZATION_LITERAL = "A24B3_ISOLATED_EXECUTION_APPROVED";
const LOGIN_NAME = "afex_core_direct_execute_test_login";
const COMPLETE_MARKER = "A24B3_800_ISOLATED_HARNESS_COMPLETE";

class AssertionFailure extends Error {
  readonly assertionId: string;
  readonly phase: string;
  readonly expected: string;
  readonly actual: string;
  readonly timestampUtc: string;
  constructor(assertionId: string, phase: string, expected: string, actual: string) {
    super("Semantic assertion failed");
    this.name = "AssertionFailure";
    this.assertionId = assertionId;
    this.phase = phase;
    this.expected = expected;
    this.actual = actual;
    this.timestampUtc = new Date().toISOString();
  }
}

const SQL = Object.freeze({
  identity: "SELECT session_user::text, current_user::text, pg_backend_pid()::integer, current_setting('application_name')::text",
  preparedState: "SELECT count(*)::integer AS prepared_count FROM pg_catalog.pg_prepared_statements",
  begin: "BEGIN",
  commit: "COMMIT",
  rollback: "ROLLBACK",
  probe: "SELECT * FROM public.afex_core_direct_execute_probe_v1()",
  deniedTable: "SELECT 1 FROM public.afex_core_direct_execute_denied_table_v1 LIMIT 0",
  deniedSequence: "SELECT last_value FROM public.afex_core_direct_execute_denied_sequence_v1 LIMIT 0",
  deniedFunction: "SELECT public.canonicalize_atomic_order_json_v1('{}'::jsonb)",
  xactLock: "SELECT pg_advisory_xact_lock($1::bigint)",
  setLockTimeout: "SELECT set_config('lock_timeout', $1::text, true)",
  setStatementTimeout: "SELECT set_config('statement_timeout', $1::text, true)",
  cancellable: "SELECT pg_sleep(1)",
});

const controllerDefinitions: ReadonlyArray<ControllerDefinition> = Object.freeze([
  { id: "two-client-advisory-lock-contention", prerequisites: ["two checked-out clients"], phases: ["holder-lock", "contender-timeout", "holder-rollback", "contender-acquire"], timeoutInput: "A24B3_LOCK_TIMEOUT_MS", expected: "55P03 followed by successful acquisition", quarantine: "destroy contender on unexpected state", evidence: ["holder_pid", "contender_pid", "denial_sqlstate", "release_acquired"], cleanup: "ROLLBACK both clients", sourceStatus: "IMPLEMENTED" },
  { id: "cancellation-controller", prerequisites: ["approved cancellation controller"], phases: ["start", "cancel", "quarantine", "reacquire"], timeoutInput: "A24B3_CONTROLLER_TIMEOUT_MS", expected: "57014", quarantine: "destroy cancelled client", evidence: ["pid", "sqlstate", "replacement_pid"], cleanup: "destroy and drain", sourceStatus: "BLOCKED_PLACEHOLDER" },
  { id: "abrupt-disconnect", prerequisites: ["approved isolated child-process controller"], phases: ["start", "disconnect", "observe", "quarantine"], timeoutInput: "A24B3_CONTROLLER_TIMEOUT_MS", expected: "connection loss with no reusable client", quarantine: "destroy uncertain client", evidence: ["pid", "disconnect_phase", "pool_counters"], cleanup: "drain pool", sourceStatus: "BLOCKED_PLACEHOLDER" },
  { id: "unknown-outcome-classification", prerequisites: ["approved harmless ambiguity controller"], phases: ["begin", "boundary", "disconnect", "classify"], timeoutInput: "A24B3_CONTROLLER_TIMEOUT_MS", expected: "INCOMPLETE until externally reconciled", quarantine: "destroy client and stop", evidence: ["last_confirmed_phase", "classification"], cleanup: "external harmless-state reconciliation", sourceStatus: "BLOCKED_PLACEHOLDER" },
  { id: "pool-exhaustion", prerequisites: ["pool max two"], phases: ["checkout-two", "third-wait", "bounded-timeout", "release"], timeoutInput: "A24B3_CHECKOUT_TIMEOUT_MS", expected: "third checkout fails within bound", quarantine: "drain on unexpected checkout", evidence: ["pool_counters", "elapsed_ms"], cleanup: "release both clients", sourceStatus: "IMPLEMENTED" },
  { id: "sequential-contamination", prerequisites: ["fixed iteration count"], phases: ["checkout", "identity", "prepared-state", "release"], timeoutInput: "A24B3_CONTROLLER_TIMEOUT_MS", expected: "stable identity, zero prepared statements", quarantine: "destroy mismatch client", evidence: ["identities", "pids", "prepared_counts"], cleanup: "release or destroy each client", sourceStatus: "IMPLEMENTED" },
  { id: "concurrent-isolation", prerequisites: ["two simultaneous checked-out clients"], phases: ["checkout-two", "identity", "assert-distinct", "release"], timeoutInput: "A24B3_CONTROLLER_TIMEOUT_MS", expected: "two distinct PIDs with exact identity", quarantine: "destroy both on mismatch", evidence: ["pids", "identities"], cleanup: "release or destroy both", sourceStatus: "IMPLEMENTED" },
  { id: "login-disablement", prerequisites: ["provider-approved external mutation controller"], phases: ["disable", "deny-new-login", "terminate", "verify"], timeoutInput: "A24B3_CONTROLLER_TIMEOUT_MS", expected: "blocked pending provider authority", quarantine: "external emergency revoke", evidence: ["external_step_results"], cleanup: "provider-approved absence attestation", sourceStatus: "BLOCKED_PLACEHOLDER" },
  { id: "execute-revocation", prerequisites: ["provider-approved external mutation controller"], phases: ["revoke", "deny", "restore-or-clean"], timeoutInput: "A24B3_CONTROLLER_TIMEOUT_MS", expected: "blocked pending provider authority", quarantine: "stop on privilege ambiguity", evidence: ["external_step_results"], cleanup: "provider-approved cleanup", sourceStatus: "BLOCKED_PLACEHOLDER" },
]);

function assertCondition(condition: unknown, code: string, assertions: string[], phase = "semantic_assertion", expected = "true", actual = String(Boolean(condition))): asserts condition {
  if (!condition) throw new AssertionFailure(code, phase, expected, actual);
  assertions.push(code);
}

function requireHash(name: string): string {
  const value = process.env[name];
  if (!value || !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name}_MISSING_OR_INVALID`);
  return value;
}

function safeAssertionFailure(error: unknown): Readonly<Record<string, string>> {
  if (error instanceof AssertionFailure) return Object.freeze({ errorType: error.name, assertionId: error.assertionId, phase: error.phase, expected: error.expected, actual: error.actual, safeMessage: error.message, timestampUtc: error.timestampUtc });
  return Object.freeze({ errorType: error instanceof Error ? error.name : "UnknownError", assertionId: "UNCLASSIFIED_FAILURE", phase: "case_execution", expected: "successful fixed operation", actual: "safe failure", safeMessage: "Fixed operation failed", timestampUtc: new Date().toISOString() });
}

function normalizeVersionEvidence(name: string, raw: string | undefined, required: boolean): string {
  if (raw === undefined || raw === "") {
    if (required) throw new Error(`${name}_MISSING`);
    return "NOT_INSTALLED";
  }
  if (raw.length > 64 || raw !== raw.trim() || /[\r\n]/.test(raw) || !/^v?[0-9]+(?:\.[0-9]+){1,3}(?:[-+][0-9a-z.-]+)?$/i.test(raw)) throw new Error(`${name}_INVALID`);
  return raw.toLowerCase();
}

function safeBoundedString(value: unknown): string {
  if (typeof value !== "string" || value.length > 128 || /[\r\n]/.test(value) || !/^[a-zA-Z0-9_.:@+\-/ ]*$/.test(value)) return "REDACTED";
  return value;
}

function safeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function projectIdentity(value: unknown): Readonly<Record<string, unknown>> {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.freeze({ sessionUser: safeBoundedString(row.session_user), currentUser: safeBoundedString(row.current_user), backendPid: safeInteger(row.pg_backend_pid), applicationName: safeBoundedString(row.current_setting ?? row.application_name) });
}

function projectCaseResult(result: CaseResult): Readonly<Record<string, unknown>> {
  const observations = result.observations;
  let safeObservations: Readonly<Record<string, unknown>>;
  if (result.status === "FAIL") {
    safeObservations = Object.freeze({ errorType: safeBoundedString(observations.errorType), assertionId: safeBoundedString(observations.assertionId), phase: safeBoundedString(observations.phase), expectedCategory: safeBoundedString(observations.expected), actualCategory: safeBoundedString(observations.actual), safeMessage: safeBoundedString(observations.safeMessage), timestampUtc: safeBoundedString(observations.timestampUtc) });
  } else if (result.id === "identity-commit-rollback-direct-execute") {
    const probe = observations.probe && typeof observations.probe === "object" ? observations.probe as Record<string, unknown> : {};
    safeObservations = Object.freeze({ before: projectIdentity(observations.before), postBegin: projectIdentity(observations.postBegin), postCommit: projectIdentity(observations.postCommit), postRollback: projectIdentity(observations.postRollback), probe: Object.freeze({ sessionUser: safeBoundedString(probe.caller_session_user), currentUser: safeBoundedString(probe.effective_function_user), backendPid: safeInteger(probe.backend_pid), probeValue: safeBoundedString(probe.probe_value) }) });
  } else if (result.id === "object-denials") {
    safeObservations = Object.freeze({ tableSqlState: safeBoundedString(observations.tableSqlState), sequenceSqlState: safeBoundedString(observations.sequenceSqlState), functionSqlState: safeBoundedString(observations.functionSqlState) });
  } else if (result.id === "two-client-advisory-lock-contention") {
    safeObservations = Object.freeze({ holderPid: safeInteger(observations.holderPid), contenderPid: safeInteger(observations.contenderPid), actualSqlState: safeBoundedString(observations.denialSqlState), releaseAcquired: observations.releaseAcquired === true });
  } else if (result.id === "bounded-statement-timeout-quarantine") {
    safeObservations = Object.freeze({ timedOut: observations.timedOut === true, quarantineStatus: observations.quarantined === true ? "QUARANTINED" : "NOT_QUARANTINED", actualSqlState: safeBoundedString(observations.sqlState) });
  } else if (result.id === "pool-exhaustion") {
    safeObservations = Object.freeze({ elapsedMs: safeInteger(observations.elapsedMs), totalCount: safeInteger(observations.totalCount), idleCount: safeInteger(observations.idleCount), waitingCount: safeInteger(observations.waitingCount) });
  } else if (result.id === "sequential-contamination") {
    const rows = Array.isArray(observations.observations) ? observations.observations.slice(0, 20) : [];
    safeObservations = Object.freeze({ count: safeInteger(observations.count), identities: rows.map(projectIdentity) });
  } else if (result.id === "concurrent-isolation") {
    const rows = Array.isArray(observations.identities) ? observations.identities.slice(0, 2) : [];
    safeObservations = Object.freeze({ identities: rows.map(projectIdentity) });
  } else {
    const stringArray = (value: unknown) => Array.isArray(value) ? value.slice(0, 12).map(safeBoundedString) : [];
    safeObservations = Object.freeze({ sourceStatus: safeBoundedString(observations.sourceStatus), prerequisites: stringArray(observations.prerequisites), phases: stringArray(observations.phases), expectedCategory: safeBoundedString(observations.expected), quarantineStatus: safeBoundedString(observations.quarantine), evidenceFields: stringArray(observations.evidence), cleanupStatus: safeBoundedString(observations.cleanup) });
  }
  return Object.freeze({ operationId: safeBoundedString(result.id), status: result.status, startedAtUtc: result.startedAtUtc, endedAtUtc: result.endedAtUtc, assertionIds: result.assertions.slice(0, 128).map(safeBoundedString), observations: safeObservations });
}

function projectAuthoritativeEvidence(input: Readonly<{
  runId: string;
  capturedAtUtc: string;
  topology: Readonly<Record<string, unknown>>;
  versions: Readonly<Record<string, string>>;
  artifactHashes: Readonly<Record<string, string>>;
  denialRecords: ReadonlyArray<DenialRecord>;
  results: ReadonlyArray<CaseResult>;
  cleanupStatus: string;
  absenceAttestationStatus: string;
  independentReviewVerdict: string;
  finalStatus: ResultStatus;
}>): Readonly<Record<string, unknown>> {
  const safeResults = input.results.map(projectCaseResult);
  const selectResults = (patterns: ReadonlyArray<string>) => safeResults.filter(result => patterns.some(pattern => String(result.operationId).includes(pattern)));
  const denialMatrix = input.denialRecords.slice(0, 16).map(record => Object.freeze({ operationId: safeBoundedString(record.operationId), targetCategory: safeBoundedString(record.targetCategory), expectedSqlState: record.expectedSqlState, actualSqlState: safeBoundedString(record.actualSqlState), status: record.status, safeErrorClass: safeBoundedString(record.safeErrorClass), timestampUtc: record.timestampUtc }));
  return Object.freeze({
    schemaVersion: 1,
    runId: input.runId,
    authorizationMarker: AUTHORIZATION_LITERAL,
    completionMarker: COMPLETE_MARKER,
    capturedAtUtc: input.capturedAtUtc,
    topology: Object.freeze({ endpointClass: safeBoundedString(input.topology.endpointClass), port: safeBoundedString(input.topology.port), tlsMode: safeBoundedString(input.topology.tlsMode), certificateVerificationClaimed: input.topology.certificateVerificationClaimed === true, hostDigest: safeBoundedString(input.topology.hostDigest) }),
    runtime: Object.freeze({ node: input.versions.node, npm: input.versions.npm, dependencies: Object.freeze({ pg: input.versions.pg, typesPg: input.versions.typesPg, vercelFunctions: input.versions.vercelFunctions }), evidenceSchema: input.versions.evidenceSchema, harnessTool: input.versions.harnessTool }),
    artifactHashes: input.artifactHashes,
    process: Object.freeze({ exitCode: input.finalStatus === "PASS" ? 0 : 3, stdoutReference: "stdout.txt", stderrReference: "stderr.txt" }),
    semanticAssertions: safeResults.map(result => Object.freeze({ operationId: result.operationId, status: result.status, assertionIds: result.assertionIds })),
    identityAndPidEvidence: selectResults(["identity", "contamination", "isolation"]),
    denialMatrix,
    contaminationMatrix: selectResults(["contamination", "isolation"]),
    lockEvidence: selectResults(["lock"]),
    cancellationTimeoutDisconnectEvidence: selectResults(["timeout", "cancellation", "disconnect", "unknown"]),
    quarantineLog: safeResults.filter(result => result.status !== "PASS").map(result => Object.freeze({ operationId: result.operationId, status: result.status, quarantineStatus: "REQUIRED" })),
    cleanupStatus: safeBoundedString(input.cleanupStatus),
    absenceAttestationStatus: safeBoundedString(input.absenceAttestationStatus),
    independentReviewVerdict: safeBoundedString(input.independentReviewVerdict),
    results: safeResults,
    finalStatus: input.finalStatus,
  });
}

function validateSourceContractFixtures(): void {
  const rejectedVersions = ["1.2.3\nsecret", "1.2.3/../../token", "x".repeat(65)];
  for (const candidate of rejectedVersions) {
    let rejected = false;
    try { normalizeVersionEvidence("FIXTURE", candidate, true); } catch { rejected = true; }
    if (!rejected) throw new Error("VERSION_FIXTURE_REJECTION_FAILED");
  }
  if (normalizeVersionEvidence("OPTIONAL_FIXTURE", undefined, false) !== "NOT_INSTALLED") throw new Error("OPTIONAL_VERSION_SENTINEL_FIXTURE_FAILED");
  const forbiddenFixtureFields = Object.freeze(["token", "password", "connectionString", "rawHost", "stack", "arbitraryPayload", "queryText"]);
  const syntheticObservations = Object.freeze({ sourceStatus: "SAFE_FIXTURE_PRESENT", token: "SYNTHETIC_OMIT_TOKEN", password: "SYNTHETIC_OMIT_PASSWORD", connectionString: "SYNTHETIC_OMIT_CONNECTION", rawHost: "SYNTHETIC_OMIT_HOST", stack: "SYNTHETIC_OMIT_STACK", arbitraryPayload: "SYNTHETIC_OMIT_PAYLOAD", queryText: "SYNTHETIC_OMIT_QUERY" });
  const fixture: CaseResult = Object.freeze({ id: "fixture", status: "PASS", startedAtUtc: "2026-01-01T00:00:00.000Z", endedAtUtc: "2026-01-01T00:00:00.000Z", assertions: Object.freeze([]), observations: syntheticObservations });
  const serializedFixture = JSON.stringify(projectCaseResult(fixture));
  if (!serializedFixture.includes("SAFE_FIXTURE_PRESENT")) throw new Error("AUTHORITATIVE_PROJECTION_SAFE_NEIGHBOR_FIXTURE_FAILED");
  for (const field of forbiddenFixtureFields) {
    if (serializedFixture.includes(field) || serializedFixture.includes(String(syntheticObservations[field as keyof typeof syntheticObservations]))) throw new Error(`AUTHORITATIVE_PROJECTION_FIXTURE_FAILED_${field}`);
  }
}

function requireIntegerInput(name: string, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (!raw || !/^[0-9]+$/.test(raw)) throw new Error(`${name}_MISSING_OR_INVALID`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name}_OUT_OF_RANGE`);
  return value;
}

function requireServerOnlyConfiguration() {
  if (process.env.A24B3_EXECUTION_AUTHORIZED !== AUTHORIZATION_LITERAL) throw new Error("A24B3_HARNESS_DISABLED");
  const connectionString = process.env.A24B3_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("A24B3_TEST_DATABASE_URL_MISSING");
  const parsed = new URL(connectionString);
  const endpointClass = process.env.A24B3_ENDPOINT_CLASS;
  const localSimulation = process.env.A24B3_LOCAL_SIMULATION_AUTHORIZED === "A24B3_LOCAL_SIMULATION_APPROVED";
  const approvedPort = process.env.A24B3_APPROVED_POOLER_PORT;
  const approvedHostSuffix = process.env.A24B3_APPROVED_POOLER_HOST_SUFFIX?.toLowerCase().replace(/^\./, "");
  const requiredTlsMode = process.env.A24B3_REQUIRED_TLS_MODE;
  if (!approvedPort || !approvedHostSuffix || !requiredTlsMode) throw new Error("A24B3_TOPOLOGY_INPUT_MISSING");
  const hostname = parsed.hostname.toLowerCase();
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  if (loopback && !localSimulation) throw new Error("A24B3_LOOPBACK_REJECTED");
  if (!loopback) {
    if (endpointClass !== "TRANSACTION_POOLER") throw new Error("A24B3_TRANSACTION_POOLER_CLASS_REQUIRED");
    if (!(hostname === approvedHostSuffix || hostname.endsWith(`.${approvedHostSuffix}`))) throw new Error("A24B3_POOLER_HOST_REJECTED");
    if (parsed.port !== approvedPort) throw new Error("A24B3_POOLER_PORT_REJECTED");
  }
  const queryKeys = Array.from(parsed.searchParams.keys());
  if (queryKeys.some(key => key !== "sslmode") || parsed.searchParams.getAll("sslmode").length > 1) throw new Error("A24B3_CONNECTION_QUERY_REJECTED");
  const actualTlsMode = parsed.searchParams.get("sslmode") ?? "require";
  if (!['require', 'verify-ca', 'verify-full'].includes(requiredTlsMode) || actualTlsMode !== requiredTlsMode) throw new Error("A24B3_TLS_MODE_REJECTED");
  const evidenceDirectory = process.env.A24B3_EVIDENCE_RUN_DIR;
  if (!evidenceDirectory) throw new Error("A24B3_EVIDENCE_RUN_DIR_MISSING");
  const timeoutInputs = Object.freeze({
    controllerMs: requireIntegerInput("A24B3_CONTROLLER_TIMEOUT_MS", 100, 60000),
    lockMs: requireIntegerInput("A24B3_LOCK_TIMEOUT_MS", 50, 10000),
    statementMs: requireIntegerInput("A24B3_STATEMENT_TIMEOUT_MS", 100, 30000),
    checkoutMs: requireIntegerInput("A24B3_CHECKOUT_TIMEOUT_MS", 50, 10000),
    processMs: requireIntegerInput("A24B3_PROCESS_TIMEOUT_MS", 1000, 3600000),
  });
  if (!(timeoutInputs.lockMs < timeoutInputs.statementMs && timeoutInputs.statementMs < timeoutInputs.controllerMs && timeoutInputs.controllerMs < timeoutInputs.processMs)) throw new Error("A24B3_TIMEOUT_HIERARCHY_INVALID");
  const versions = Object.freeze({
    node: normalizeVersionEvidence("NODE_VERSION", process.version, true),
    npm: normalizeVersionEvidence("NPM_VERSION", process.env.A24B3_APPROVED_NPM_VERSION, true),
    pg: normalizeVersionEvidence("PG_VERSION", process.env.A24B3_APPROVED_PG_VERSION, true),
    typesPg: normalizeVersionEvidence("TYPES_PG_VERSION", process.env.A24B3_APPROVED_TYPES_PG_VERSION, false),
    vercelFunctions: normalizeVersionEvidence("VERCEL_FUNCTIONS_VERSION", process.env.A24B3_APPROVED_VERCEL_FUNCTIONS_VERSION, false),
    evidenceSchema: normalizeVersionEvidence("EVIDENCE_SCHEMA_VERSION", "1.0.0", true),
    harnessTool: normalizeVersionEvidence("HARNESS_TOOL_VERSION", "1.0.0", true),
  });
  return {
    connectionString,
    evidenceDirectory,
    timeoutInputs,
    versions,
    runId: process.env.A24B3_RUN_ID,
    artifactHashes: { sql: requireHash("A24B3_ATTESTATION_SHA256"), runner: requireHash("A24B3_RUNNER_SHA256"), harness: requireHash("A24B3_HARNESS_SHA256") },
    maskedTopology: {
      endpointClass: loopback ? "LOCAL_SIMULATION" : "TRANSACTION_POOLER",
      port: parsed.port,
      tlsMode: actualTlsMode,
      certificateVerificationClaimed: false,
      hostDigest: createHash("sha256").update(hostname).digest("hex").slice(0, 16),
    },
  };
}

async function loadPg(): Promise<PgModule> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;
  return await dynamicImport("pg") as PgModule;
}

async function withClient<T>(pool: FixedPool, operation: (client: FixedClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let destroy = false;
  try { return await operation(client); }
  catch (error) { destroy = true; throw error; }
  finally { client.release(destroy); }
}

async function runCase(id: string, operation: (assertions: string[]) => Promise<Record<string, unknown>>): Promise<CaseResult> {
  const startedAtUtc = new Date().toISOString();
  const assertions: string[] = [];
  try {
    const observations = await operation(assertions);
    return Object.freeze({ id, status: "PASS", startedAtUtc, endedAtUtc: new Date().toISOString(), assertions: Object.freeze(assertions), observations: Object.freeze(observations) });
  } catch (error) {
    return Object.freeze({ id, status: "FAIL", startedAtUtc, endedAtUtc: new Date().toISOString(), assertions: Object.freeze(assertions), observations: safeAssertionFailure(error) });
  }
}

function incompleteController(definition: ControllerDefinition): CaseResult {
  const now = new Date().toISOString();
  return Object.freeze({ id: definition.id, status: "INCOMPLETE", startedAtUtc: now, endedAtUtc: now, assertions: Object.freeze([]), observations: Object.freeze({ sourceStatus: definition.sourceStatus, prerequisites: definition.prerequisites, phases: definition.phases, timeoutInput: definition.timeoutInput, expected: definition.expected, quarantine: definition.quarantine, evidence: definition.evidence, cleanup: definition.cleanup }) });
}

function identityMatches(row: QueryRow): boolean {
  return row.session_user === LOGIN_NAME && row.current_user === LOGIN_NAME;
}

async function expectDenied(client: FixedClient, text: string, assertions: string[], id: string, targetCategory: string, denialRecords: DenialRecord[]): Promise<string> {
  try { await client.query({ text }); throw new Error("DENIAL_EXPECTED_BUT_ALLOWED"); }
  catch (error) {
    const sqlState = (error as SqlStateError).code;
    denialRecords.push(Object.freeze({ operationId: id, targetCategory, expectedSqlState: "42501", actualSqlState: sqlState ?? "MISSING", status: sqlState === "42501" ? "PASS" : "FAIL", safeErrorClass: error instanceof Error ? error.name : "UnknownError", timestampUtc: new Date().toISOString() }));
    assertCondition(sqlState === "42501", `${id}_SQLSTATE_42501`, assertions);
    return sqlState;
  }
}

async function run(): Promise<void> {
  validateSourceContractFixtures();
  const config = requireServerOnlyConfiguration();
  const pg = await loadPg();
  const pool = new pg.Pool({ connectionString: config.connectionString, max: 2, min: 0, idleTimeoutMillis: 5000, connectionTimeoutMillis: config.timeoutInputs.checkoutMs, statement_timeout: config.timeoutInputs.controllerMs, application_name: "afex-a24b3-isolated", allowExitOnIdle: true });
  if (!config.runId || !/^A2\.4B\.3-[0-9]{8}T[0-9]{9}Z$/.test(config.runId)) throw new Error("A24B3_RUN_ID_INVALID");
  const runId = config.runId;
  const results: CaseResult[] = [];
  const denialRecords: DenialRecord[] = [];
  try {
    results.push(await runCase("identity-commit-rollback-direct-execute", async assertions => withClient(pool, async client => {
      const before = (await client.query({ text: SQL.identity })).rows[0] ?? {};
      assertCondition(identityMatches(before), "BEFORE_IDENTITY", assertions);
      await client.query({ text: SQL.begin });
      const postBegin = (await client.query({ text: SQL.identity })).rows[0] ?? {};
      assertCondition(identityMatches(postBegin), "POST_BEGIN_IDENTITY", assertions);
      assertCondition(before.pg_backend_pid === postBegin.pg_backend_pid, "BEGIN_PID_STABLE", assertions);
      const probe = (await client.query({ text: SQL.probe })).rows[0] ?? {};
      assertCondition(probe.probe_value === "A24B3_DIRECT_EXECUTE_OK", "PROBE_VALUE", assertions);
      assertCondition(probe.caller_session_user === LOGIN_NAME, "PROBE_SESSION_IDENTITY", assertions);
      assertCondition(probe.effective_function_user === "afex_function_owner", "PROBE_DEFINER_IDENTITY", assertions);
      await client.query({ text: SQL.commit });
      const postCommit = (await client.query({ text: SQL.identity })).rows[0] ?? {};
      assertCondition(identityMatches(postCommit), "POST_COMMIT_IDENTITY", assertions);
      await client.query({ text: SQL.begin });
      await client.query({ text: SQL.rollback });
      const postRollback = (await client.query({ text: SQL.identity })).rows[0] ?? {};
      assertCondition(identityMatches(postRollback), "POST_ROLLBACK_IDENTITY", assertions);
      assertCondition(postRollback.pg_backend_pid === before.pg_backend_pid, "ROLLBACK_PID_STABLE", assertions);
      return { before, postBegin, probe, postCommit, postRollback };
    })));

    results.push(await runCase("object-denials", async assertions => withClient(pool, async client => ({
      tableSqlState: await expectDenied(client, SQL.deniedTable, assertions, "TABLE_DENIAL", "table", denialRecords),
      sequenceSqlState: await expectDenied(client, SQL.deniedSequence, assertions, "SEQUENCE_DENIAL", "sequence", denialRecords),
      functionSqlState: await expectDenied(client, SQL.deniedFunction, assertions, "FUNCTION_DENIAL", "function", denialRecords),
    }))));

    results.push(await runCase("two-client-advisory-lock-contention", async assertions => {
      const holder = await pool.connect();
      const contender = await pool.connect();
      let destroyHolder = false;
      let destroyContender = false;
      try {
        await holder.query({ text: SQL.begin });
        await contender.query({ text: SQL.begin });
        const holderIdentity = (await holder.query({ text: SQL.identity })).rows[0] ?? {};
        const contenderIdentity = (await contender.query({ text: SQL.identity })).rows[0] ?? {};
        assertCondition(holderIdentity.pg_backend_pid !== contenderIdentity.pg_backend_pid, "LOCK_DISTINCT_PIDS", assertions);
        await holder.query({ text: SQL.xactLock, values: [424243] });
        await contender.query({ text: SQL.setLockTimeout, values: [`${config.timeoutInputs.lockMs}ms`] });
        let denialSqlState = "";
        try { await contender.query({ text: SQL.xactLock, values: [424243] }); }
        catch (error) { denialSqlState = (error as SqlStateError).code ?? ""; }
        assertCondition(denialSqlState === "55P03", "LOCK_CONTENTION_SQLSTATE_55P03", assertions, "contender-timeout", "55P03", denialSqlState || "MISSING");
        await contender.query({ text: SQL.rollback });
        await holder.query({ text: SQL.rollback });
        await contender.query({ text: SQL.begin });
        await contender.query({ text: SQL.xactLock, values: [424243] });
        await contender.query({ text: SQL.rollback });
        assertCondition(true, "LOCK_RELEASE_REACQUIRED", assertions);
        return { holderPid: holderIdentity.pg_backend_pid, contenderPid: contenderIdentity.pg_backend_pid, denialSqlState, releaseAcquired: true };
      } catch (error) { destroyHolder = true; destroyContender = true; throw error; }
      finally { holder.release(destroyHolder); contender.release(destroyContender); }
    }));

    results.push(await runCase("bounded-statement-timeout-quarantine", async assertions => {
      const client = await pool.connect();
      let destroy = true;
      try {
        await client.query({ text: SQL.begin });
        await client.query({ text: SQL.setStatementTimeout, values: [`${config.timeoutInputs.statementMs}ms`] });
        await client.query({ text: SQL.cancellable });
        throw new Error("TIMEOUT_EXPECTED_BUT_COMPLETED");
      } catch (error) {
        assertCondition((error as SqlStateError).code === "57014", "TIMEOUT_SQLSTATE_57014", assertions);
        return { timedOut: true, quarantined: true, sqlState: "57014" };
      } finally { client.release(destroy); }
    }));

    results.push(await runCase("pool-exhaustion", async assertions => {
      const first = await pool.connect();
      const second = await pool.connect();
      const started = Date.now();
      try {
        let rejected = false;
        const pending = pool.connect().then(client => { client.release(true); }).catch(() => { rejected = true; });
        await new Promise(resolveDelay => setTimeout(resolveDelay, config.timeoutInputs.checkoutMs + 100));
        await pending;
        assertCondition(rejected, "THIRD_CHECKOUT_REJECTED", assertions);
        assertCondition(Date.now() - started <= config.timeoutInputs.checkoutMs + 1000, "CHECKOUT_BOUND", assertions);
        return { elapsedMs: Date.now() - started, totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount };
      } finally { first.release(); second.release(); }
    }));

    results.push(await runCase("sequential-contamination", async assertions => {
      const observations: QueryRow[] = [];
      for (let index = 0; index < 20; index += 1) {
        observations.push(await withClient(pool, async client => {
          const identity = (await client.query({ text: SQL.identity })).rows[0] ?? {};
          const prepared = (await client.query({ text: SQL.preparedState })).rows[0] ?? {};
          assertCondition(identityMatches(identity), `SEQUENTIAL_IDENTITY_${index}`, assertions);
          assertCondition(prepared.prepared_count === 0, `SEQUENTIAL_UNNAMED_${index}`, assertions);
          return { iteration: index, session_user: identity.session_user, current_user: identity.current_user, pg_backend_pid: identity.pg_backend_pid, application_name: identity.current_setting, prepared_count: prepared.prepared_count };
        }));
      }
      return { count: observations.length, observations };
    }));

    results.push(await runCase("concurrent-isolation", async assertions => {
      const first = await pool.connect();
      const second = await pool.connect();
      let destroy = false;
      try {
        const identities = await Promise.all([first.query({ text: SQL.identity }), second.query({ text: SQL.identity })]);
        const firstIdentity = identities[0].rows[0] ?? {};
        const secondIdentity = identities[1].rows[0] ?? {};
        assertCondition(identityMatches(firstIdentity) && identityMatches(secondIdentity), "CONCURRENT_IDENTITIES", assertions);
        assertCondition(firstIdentity.pg_backend_pid !== secondIdentity.pg_backend_pid, "CONCURRENT_DISTINCT_PIDS", assertions);
        return { identities: [firstIdentity, secondIdentity] };
      } catch (error) { destroy = true; throw error; }
      finally { first.release(destroy); second.release(destroy); }
    }));

    for (const definition of controllerDefinitions.filter(item => item.sourceStatus === "BLOCKED_PLACEHOLDER")) {
      results.push(incompleteController(definition));
    }
  } finally {
    await pool.end();
  }

  const cleanupStatus: string = "NOT_RUN_EXTERNAL_GATE";
  const absenceAttestationStatus: string = "NOT_RUN_EXTERNAL_GATE";
  const independentReviewVerdict: string = "PENDING";
  const externalCompletionReady = cleanupStatus === "PASS" && absenceAttestationStatus === "PASS" && independentReviewVerdict === "APPROVED";
  const finalStatus: ResultStatus = results.some(result => result.status === "FAIL") ? "FAIL" : results.some(result => result.status === "INCOMPLETE") || !externalCompletionReady ? "INCOMPLETE" : "PASS";
  const evidenceDir = resolve(config.evidenceDirectory);
  await mkdir(evidenceDir, { recursive: true });
  const evidenceObject = projectAuthoritativeEvidence({ runId, capturedAtUtc: new Date().toISOString(), topology: config.maskedTopology, versions: config.versions, artifactHashes: config.artifactHashes, denialRecords, results, cleanupStatus, absenceAttestationStatus, independentReviewVerdict, finalStatus });
  const evidence = JSON.stringify(evidenceObject, null, 2) + "\n";
  await writeFile(resolve(evidenceDir, "results.json"), evidence, { encoding: "utf8", flag: "wx" });
  await writeFile(resolve(evidenceDir, "results.sha256"), createHash("sha256").update(evidence).digest("hex") + "  results.json\n", { encoding: "utf8", flag: "wx" });
  if (finalStatus === "PASS") process.stdout.write(`${COMPLETE_MARKER}\n`);
  else process.exitCode = 3;
}

void run().catch(error => {
  process.stderr.write(`A2.4B.3 harness failed: ${error instanceof Error ? error.name : "UnknownError"}\n`);
  process.exitCode = 3;
});
