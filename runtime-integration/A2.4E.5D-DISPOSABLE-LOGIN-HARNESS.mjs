import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_MARKER = "A24E5D_900_DISPOSABLE_LOGIN_HARNESS_COMPLETE";
const OBSERVATION_SCHEMA = "A24E5D_HARNESS_OBSERVATION_V1";
const FIXTURE_SCHEMA = "A24E5D_FIXTURE_RESULT_V1";
const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;
const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/u;
const RUN_ID = /^[A-Za-z0-9._-]{1,128}$/u;
const ROLE_NAME = /^afex_core_test_login_[0-9]{14}_[0-9a-f]{8}$/u;
const POSITIVE_OID = /^[1-9][0-9]{0,9}$/u;
const REGPROCEDURE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\([a-z0-9_,. ()\[\]]*\)$/u;
const ADVISORY_IDENTITY = /^[A-Za-z0-9._|:-]{1,512}$/u;
const DIAGNOSTIC_STAGES = Object.freeze(["ENTRY", "OPERATION_RESOLUTION", "CONTRACT_VALIDATION", "PATH_VALIDATION", "HASH_VALIDATION", "RUNTIME_SQL_CONSTRUCTION", "PROCESS_SPAWN", "STREAM_INITIALIZATION", "PROCESS_WAIT", "OUTPUT_DECODE", "RESULT_VALIDATION", "EVIDENCE_PUBLICATION", "COMPLETE"]);
const DIAGNOSTIC_STAGE_SET = new Set(DIAGNOSTIC_STAGES);
const SAFE_SYSTEM_CODES = new Set(["ENOENT", "EACCES", "EPERM", "EINVAL", "ENOTDIR", "EISDIR", "EMFILE", "ENFILE"]);
let diagnosticStage = "ENTRY";

function setDiagnosticStage(stage) {
  if (!DIAGNOSTIC_STAGE_SET.has(stage)) throw new Error("DIAGNOSTIC_STAGE_INVALID");
  diagnosticStage = stage;
}

function classifyFailure(error, stage = diagnosticStage) {
  const safeStage = DIAGNOSTIC_STAGE_SET.has(stage) ? stage : "ENTRY";
  if (error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message)) return Object.freeze({ code: error.message, stage: safeStage, failureClass: "EXPLICIT_CODE" });
  let failureClass = "UNKNOWN_ERROR";
  if (error instanceof TypeError) failureClass = "TYPE_ERROR";
  else if (error instanceof RangeError) failureClass = "RANGE_ERROR";
  else if (error instanceof URIError) failureClass = "URI_ERROR";
  else if (error && typeof error === "object" && SAFE_SYSTEM_CODES.has(error.code)) failureClass = `SYSTEM_${error.code}`;
  else if (safeStage === "PROCESS_SPAWN") failureClass = "PROCESS_SETUP_ERROR";
  else if (safeStage === "STREAM_INITIALIZATION" || safeStage === "PROCESS_WAIT") failureClass = "STREAM_ERROR";
  else if (safeStage === "OUTPUT_DECODE") failureClass = "ENCODING_ERROR";
  return Object.freeze({ code: `HARNESS_PRELAUNCH_${safeStage}_${failureClass}`, stage: safeStage, failureClass });
}

const COMMON_VARIABLES = Object.freeze({
  A24E5D_RUN_ID: Object.freeze({ psql: "run_id", grammar: "run" }),
  A24E5D_DISPOSABLE_ROLE_NAME: Object.freeze({ psql: "disposable_role_name", grammar: "role" }),
  A24E5D_EXPECTED_DATABASE_NAME: Object.freeze({ psql: "expected_database_name", grammar: "identifier" }),
  A24E5D_EXPECTED_POSTGRES_MAJOR: Object.freeze({ psql: "expected_postgres_major", grammar: "major" }),
});

const OPERATIONS = Object.freeze({
  RUNTIME_TEST: Object.freeze({
    marker: "A24E5D_910_DISPOSABLE_LOGIN_RUNTIME_TEST_COMPLETE",
    resultPrefix: "A24E5D_RUNTIME_RESULT",
    variables: Object.freeze({
      ...COMMON_VARIABLES,
      A24E5D_EXPECTED_RUNTIME_ROLE_NAME: Object.freeze({ psql: "expected_runtime_role_name", grammar: "identifier" }),
      A24E5D_EXPECTED_DISPOSABLE_ROLE_OID: Object.freeze({ psql: "expected_disposable_role_oid", grammar: "oid" }),
    }),
  }),
  ROLE_ATTESTATION: Object.freeze({
    sqlFile: "A2.4E.5A-DISPOSABLE-LOGIN-ROLE-ATTESTATION.sql",
    sqlHash: "c0257bedceea45d9e394c264a30c118747a6f126797405f219bfe578f5908cc3",
    marker: "A24E5A_900_DISPOSABLE_LOGIN_ROLE_ATTESTATION_COMPLETE",
    resultPrefix: "A24E4A_ROLE_IDENTITY",
    variables: Object.freeze({
      ...COMMON_VARIABLES,
      A24E5D_EXPECTED_RUNTIME_ROLE_NAME: Object.freeze({ psql: "expected_runtime_role_name", grammar: "identifier" }),
      A24E5D_EXPECTED_RUNTIME_ROLE_OID: Object.freeze({ psql: "expected_runtime_role_oid", grammar: "oid" }),
      A24E5D_EXPECTED_TARGET_REGPROCEDURE: Object.freeze({ psql: "expected_target_regprocedure", grammar: "regprocedure" }),
      A24E5D_EXPECTED_TARGET_OID: Object.freeze({ psql: "expected_target_oid", grammar: "oid" }),
      A24E5D_EXPECTED_FUNCTION_OWNER: Object.freeze({ psql: "expected_function_owner", grammar: "identifier" }),
    }),
  }),
  CLEANUP: Object.freeze({
    sqlFile: "A2.4E.5B-DISPOSABLE-LOGIN-CLEANUP.sql",
    sqlHash: "0a324b066f126207a489eb4c00836ca770f786b97a91052dd5fb799f61ea874b",
    marker: "A24E5B_900_DISPOSABLE_LOGIN_CLEANUP_COMPLETE",
    resultPrefix: "A24E5B_RESULT",
    variables: Object.freeze({
      ...COMMON_VARIABLES,
      A24E5D_EXPECTED_RUNTIME_ROLE_NAME: Object.freeze({ psql: "expected_runtime_role_name", grammar: "identifier" }),
      A24E5D_EXPECTED_RUNTIME_ROLE_OID: Object.freeze({ psql: "expected_runtime_role_oid", grammar: "oid" }),
      A24E5D_EXPECTED_DISPOSABLE_ROLE_OID: Object.freeze({ psql: "expected_disposable_role_oid", grammar: "oid" }),
      A24E5D_ADVISORY_LOCK_IDENTITY: Object.freeze({ psql: "advisory_lock_identity", grammar: "advisory" }),
    }),
  }),
  POST_CLEANUP_ATTESTATION: Object.freeze({
    sqlFile: "A2.4E.5C-DISPOSABLE-LOGIN-POST-CLEANUP-ATTESTATION.sql",
    sqlHash: "6a7ff904c3055cb45b2411cce70c918167fac132e704c13ca2e7bf7ba8abf009",
    marker: "A24E5C_900_DISPOSABLE_LOGIN_POST_CLEANUP_ATTESTATION_COMPLETE",
    resultPrefix: "A24E5C_RESULT",
    variables: Object.freeze({
      ...COMMON_VARIABLES,
      A24E5D_EXPECTED_DISPOSABLE_ROLE_OID: Object.freeze({ psql: "expected_disposable_role_oid", grammar: "oid" }),
    }),
  }),
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function safeText(text) {
  return !/(?:postgres(?:ql)?:\/\/\S+|SCRAM-SHA-256\$|\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]{20,}\.)/iu.test(text);
}

function validateValue(value, grammar) {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  if (grammar === "run") return RUN_ID.test(value);
  if (grammar === "role") return ROLE_NAME.test(value);
  if (grammar === "identifier") return IDENTIFIER.test(value);
  if (grammar === "oid") return POSITIVE_OID.test(value);
  if (grammar === "major") return value === "17";
  if (grammar === "regprocedure") return value.length <= 512 && REGPROCEDURE.test(value) && !/[;'"\\:]/u.test(value);
  if (grammar === "advisory") return ADVISORY_IDENTITY.test(value);
  return false;
}

function selectOperation(env) {
  const operation = env.A24E5D_OPERATION;
  if (!Object.hasOwn(OPERATIONS, operation ?? "")) throw new Error(operation ? "OPERATION_INVALID" : "OPERATION_MISSING");
  return Object.freeze({ operation, config: OPERATIONS[operation] });
}

function bindVariables(config, env) {
  const values = Object.create(null);
  const args = [];
  for (const [environmentName, rule] of Object.entries(config.variables)) {
    const value = env[environmentName];
    if (!validateValue(value, rule.grammar)) throw new Error(value ? `VARIABLE_INVALID_${rule.psql.toUpperCase()}` : `VARIABLE_MISSING_${rule.psql.toUpperCase()}`);
    values[rule.psql] = value;
    args.push(`--set=${rule.psql}=${value}`);
  }
  return Object.freeze({ values: Object.freeze(values), args: Object.freeze(args) });
}

async function verifySqlArtifact(config, requestedPath) {
  setDiagnosticStage("PATH_VALIDATION");
  if (!requestedPath) throw new Error("SQL_PATH_MISSING");
  const expectedPath = resolve(dirname(fileURLToPath(import.meta.url)), config.sqlFile);
  const actualPath = resolve(requestedPath);
  if (actualPath.toLowerCase() !== expectedPath.toLowerCase()) throw new Error("SQL_PATH_MISMATCH");
  const bytes = await readFile(actualPath);
  setDiagnosticStage("HASH_VALIDATION");
  const actualHash = verifySqlBytes(config, bytes);
  return Object.freeze({ path: actualPath, bytes, hash: actualHash });
}

function verifySqlBytes(config, bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error("SQL_BOM_REJECTED");
  if (bytes.includes(0x0d)) throw new Error("SQL_CRLF_REJECTED");
  const actualHash = sha256(bytes);
  if (actualHash !== config.sqlHash) throw new Error("SQL_HASH_MISMATCH");
  return actualHash;
}

function decodeCapture(bytes) {
  setDiagnosticStage("OUTPUT_DECODE");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function validateMachineResult({ operation, config, values, stdout, stderr }) {
  const stdoutText = decodeCapture(stdout);
  const stderrText = decodeCapture(stderr);
  setDiagnosticStage("RESULT_VALIDATION");
  if (!safeText(stdoutText)) throw new Error("STDOUT_REDACTION_REJECTED");
  if (!safeText(stderrText)) throw new Error("STDERR_REDACTION_REJECTED");
  if (stdoutText.includes("|FAIL") || stderrText.includes("|FAIL")) throw new Error("FAIL_ROW_REJECTED");
  const lines = stdoutText.split(/\r?\n/u);
  const markerCount = lines.filter((line) => line === config.marker).length;
  if (markerCount !== 1) throw new Error(markerCount === 0 ? "MARKER_MISSING" : "MARKER_DUPLICATE");
  const resultRows = lines.filter((line) => line.startsWith(`${config.resultPrefix}|`));
  if (resultRows.length !== 1) throw new Error(resultRows.length === 0 ? "RESULT_ROW_MISSING" : "RESULT_ROW_DUPLICATE");
  const fields = resultRows[0].split("|");
  if (fields.length !== 5 || fields[0] !== config.resultPrefix || fields[1] !== values.run_id || fields[2] !== values.disposable_role_name || fields[4] !== "PASS") throw new Error("RESULT_ROW_BINDING_INVALID");
  if (!POSITIVE_OID.test(fields[3])) throw new Error("RESULT_OID_INVALID");
  if (operation !== "ROLE_ATTESTATION" && fields[3] !== values.expected_disposable_role_oid) throw new Error("RESULT_OID_MISMATCH");
  return Object.freeze({ markerCount, resultRowCount: 1, resultStatus: "PASS", disposableRoleOid: fields[3] });
}

async function runBoundedProcess({ executable, args, input, env, timeoutMs }) {
  return await new Promise((resolvePromise) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let settled = false;
    let launched = false;
    let timedOut = false;
    let child;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolvePromise(Object.freeze(result));
    };
    try {
      setDiagnosticStage("PROCESS_SPAWN");
      child = spawn(executable, args, { env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      launched = true;
    } catch {
      finish({ launched: false, timedOut: false, exitCode: null, stdout, stderr, processErrorCode: "LAUNCH_FAILURE" });
      return;
    }
    setDiagnosticStage("STREAM_INITIALIZATION");
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const append = (current, chunk) => {
      if (current.length + chunk.length > MAX_CAPTURE_BYTES) {
        child.kill("SIGKILL");
        return current;
      }
      return Buffer.concat([current, chunk]);
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.on("error", () => {
      clearTimeout(timer);
      finish({ launched, timedOut, exitCode: null, stdout, stderr, processErrorCode: "PROCESS_ERROR" });
    });
    child.on("close", (code) => {
      setDiagnosticStage("PROCESS_WAIT");
      clearTimeout(timer);
      finish({ launched, timedOut, exitCode: Number.isInteger(code) ? code : null, stdout, stderr, processErrorCode: timedOut ? "TIMEOUT" : "NONE" });
    });
    child.stdin.end(input);
  });
}

function validateProcess(observation) {
  if (!observation.launched) throw new Error(observation.processErrorCode);
  if (observation.timedOut) throw new Error("TIMEOUT");
  if (observation.exitCode === null) throw new Error("EXIT_CODE_MISSING");
  if (observation.exitCode !== 0) throw new Error(classifyProcessFailure(observation));
}

function classifyProcessFailure(observation) {
  let stderrText;
  try { stderrText = decodeCapture(observation.stderr); } catch { return "STDERR_UTF8_INVALID"; }
  if (!safeText(stderrText)) return "STDERR_REDACTION_REJECTED";
  if (/server does not support SSL|SSL is not enabled on the server/iu.test(stderrText)) return "SSL_DEPENDENCY_INCOMPATIBLE";
  const sqlError = stderrText.match(/ERROR:\s+(?:[0-9A-Z]{5}:\s+)?([A-Z][A-Z0-9_]{2,127})\b/u);
  if (sqlError) return `PSQL_${sqlError[1]}`;
  return `PSQL_NONZERO_EXIT_${observation.exitCode}`;
}

function newObservation({ operation, values, process, artifact, config, result }) {
  return Object.freeze({
    schemaVersion: OBSERVATION_SCHEMA,
    operation,
    runId: values.run_id,
    launched: process.launched,
    timedOut: process.timedOut,
    exitCode: process.exitCode,
    processErrorCode: process.processErrorCode,
    sqlArtifactSha256: artifact.hash,
    expectedMarker: config.marker,
    markerCount: result.markerCount,
    resultRowCount: result.resultRowCount,
    resultStatus: result.resultStatus,
    disposableRoleName: values.disposable_role_name,
    disposableRoleOid: result.disposableRoleOid,
    stdoutSha256: sha256(process.stdout),
    stderrSha256: sha256(process.stderr),
    finalStatus: "PASS",
  });
}

async function publishEvidence(directory, observation, stdout, stderr) {
  setDiagnosticStage("EVIDENCE_PUBLICATION");
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const outputs = Object.freeze({
    "results.json": Buffer.from(`${canonical(observation)}\n`, "utf8"),
    "stdout.txt": stdout,
    "stderr.txt": stderr,
  });
  for (const [name, bytes] of Object.entries(outputs)) await writeFile(resolve(root, name), bytes, { flag: "wx", mode: 0o600 });
  await writeFile(resolve(root, "results.sha256"), `${sha256(outputs["results.json"])}  results.json\n`, { flag: "wx", mode: 0o600 });
}

async function publishFailureEvidence(directory, operation, values, processResult, artifact, config, failureCode) {
  const stdoutSafe = (() => { try { const text = decodeCapture(processResult.stdout); return safeText(text) ? processResult.stdout : Buffer.from("redaction_result=FAIL\n"); } catch { return Buffer.from("utf8_result=FAIL\n"); } })();
  const stderrSafe = (() => { try { const text = decodeCapture(processResult.stderr); return safeText(text) ? processResult.stderr : Buffer.from("redaction_result=FAIL\n"); } catch { return Buffer.from("utf8_result=FAIL\n"); } })();
  const observation = Object.freeze({
    schemaVersion: OBSERVATION_SCHEMA,
    operation,
    runId: values.run_id,
    launched: processResult.launched,
    timedOut: processResult.timedOut,
    exitCode: processResult.exitCode,
    processErrorCode: processResult.processErrorCode,
    failureCode,
    sqlArtifactSha256: artifact.hash,
    expectedMarker: config.marker,
    disposableRoleName: values.disposable_role_name,
    disposableRoleOid: values.expected_disposable_role_oid,
    stdoutSha256: sha256(stdoutSafe),
    stderrSha256: sha256(stderrSafe),
    finalStatus: "FAIL",
  });
  await publishEvidence(directory, observation, stdoutSafe, stderrSafe);
}

function fixtureEnvironment(operation) {
  return {
    A24E5D_OPERATION: operation,
    A24E5D_RUN_ID: "A2.4E.fixture-001",
    A24E5D_DISPOSABLE_ROLE_NAME: "afex_core_test_login_20260803120000_abcdef12",
    A24E5D_EXPECTED_DATABASE_NAME: "postgres",
    A24E5D_EXPECTED_POSTGRES_MAJOR: "17",
    A24E5D_EXPECTED_RUNTIME_ROLE_NAME: "afex_core_runtime",
    A24E5D_EXPECTED_RUNTIME_ROLE_OID: "101",
    A24E5D_EXPECTED_TARGET_REGPROCEDURE: "public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)",
    A24E5D_EXPECTED_TARGET_OID: "42382",
    A24E5D_EXPECTED_FUNCTION_OWNER: "afex_function_owner",
    A24E5D_EXPECTED_DISPOSABLE_ROLE_OID: "202",
    A24E5D_ADVISORY_LOCK_IDENTITY: "project|postgres|role|202|run",
  };
}

function fixtureOutput(operation, env) {
  const config = OPERATIONS[operation];
  const oid = operation === "ROLE_ATTESTATION" ? "303" : env.A24E5D_EXPECTED_DISPOSABLE_ROLE_OID;
  return `${config.resultPrefix}|${env.A24E5D_RUN_ID}|${env.A24E5D_DISPOSABLE_ROLE_NAME}|${oid}|PASS\n${config.marker}\n`;
}

function buildRuntimeTestInvocation(config, binding, env) {
  setDiagnosticStage("RUNTIME_SQL_CONSTRUCTION");
  const executable = env.A24E5D_PSQL_PATH;
  const evidenceDirectory = env.A24E5D_EVIDENCE_DIRECTORY;
  const pgpass = env.PGPASSFILE;
  if (!executable) throw new Error("PSQL_PATH_MISSING");
  if (!evidenceDirectory) throw new Error("EVIDENCE_DIRECTORY_MISSING");
  if (!pgpass) throw new Error("RUNTIME_PGPASSFILE_MISSING");
  if (env.PGUSER !== binding.values.disposable_role_name) throw new Error("RUNTIME_PGUSER_MISMATCH");
  if (env.PGPORT !== "6543") throw new Error("RUNTIME_PORT_MISMATCH");
  if (env.PGDATABASE !== binding.values.expected_database_name) throw new Error("RUNTIME_DATABASE_MISMATCH");
  if (!env.PGHOST) throw new Error("RUNTIME_HOST_MISSING");
  const timeoutMs = Number.parseInt(env.A24E5D_TIMEOUT_MS ?? "300000", 10);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000) throw new Error("TIMEOUT_INVALID");
  const childEnv = { PATH: env.PATH ?? "", SystemRoot: env.SystemRoot ?? "", PGPASSFILE: pgpass, PGSSLMODE: "require" };
  for (const name of ["PGHOST", "PGPORT", "PGUSER", "PGDATABASE"]) if (env[name]) childEnv[name] = env[name];
  const input = [
    "\\set ON_ERROR_STOP on",
    "\\pset tuples_only on",
    "\\pset format unaligned",
    "BEGIN TRANSACTION READ ONLY;",
    "SELECT pg_catalog.set_config('a24e.disposable_role_name', :'disposable_role_name', true);",
    "DO $a24e5d$ BEGIN IF session_user <> pg_catalog.current_setting('a24e.disposable_role_name') OR current_user <> pg_catalog.current_setting('a24e.disposable_role_name') THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RUNTIME_LOGIN_IDENTITY_MISMATCH'; END IF; BEGIN PERFORM * FROM public.afex_core_direct_execute_probe_v1(); RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DIRECT_EXECUTE_UNEXPECTEDLY_ALLOWED'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $a24e5d$;",
    "SET ROLE :\"expected_runtime_role_name\";",
    "SELECT * FROM public.afex_core_direct_execute_probe_v1();",
    "ROLLBACK;",
    `SELECT '${config.resultPrefix}|' || :'run_id' || '|' || :'disposable_role_name' || '|' || :'expected_disposable_role_oid' || '|PASS';`,
    `SELECT '${config.marker}';`,
    "",
  ].join("\n");
  return Object.freeze({ executable, evidenceDirectory, timeoutMs, childEnv: Object.freeze(childEnv), input, args: Object.freeze(["-X", "--no-password", "--set=ON_ERROR_STOP=1", ...binding.args]) });
}

function runRuntimeConstructionFixture() {
  const env = fixtureEnvironment("RUNTIME_TEST");
  Object.assign(env, {
    A24E5D_PSQL_PATH: "fake-psql",
    A24E5D_EVIDENCE_DIRECTORY: "fake-evidence",
    A24E5D_TIMEOUT_MS: "300000",
    PGPASSFILE: "fake-pgpass",
    PGHOST: "fake-host",
    PGPORT: "6543",
    PGUSER: env.A24E5D_DISPOSABLE_ROLE_NAME,
    PGDATABASE: "postgres",
  });
  const selected = selectOperation(env);
  const binding = bindVariables(selected.config, env);
  const invocation = buildRuntimeTestInvocation(selected.config, binding, env);
  const expectedArgs = ["-X", "--no-password", "--set=ON_ERROR_STOP=1", ...binding.args];
  if (canonical(invocation.args) !== canonical(expectedArgs)) throw new Error("RUNTIME_ARGUMENT_CONSTRUCTION_INVALID");
  if (invocation.args.includes("--fixture") || invocation.args.some((value) => /postgres(?:ql)?:\/\//iu.test(value))) throw new Error("RUNTIME_ARGUMENT_SAFETY_INVALID");
  if (invocation.childEnv.PGPASSFILE !== "fake-pgpass" || invocation.childEnv.PGUSER !== env.A24E5D_DISPOSABLE_ROLE_NAME) throw new Error("RUNTIME_ENVIRONMENT_CONSTRUCTION_INVALID");
  const process = Object.freeze({ launched: true, timedOut: false, exitCode: 0, processErrorCode: "NONE", stdout: Buffer.from(fixtureOutput("RUNTIME_TEST", env)), stderr: Buffer.alloc(0) });
  validateProcess(process);
  validateMachineResult({ operation: "RUNTIME_TEST", config: selected.config, values: binding.values, stdout: process.stdout, stderr: process.stderr });
  return Object.freeze({ schemaVersion: FIXTURE_SCHEMA, fixtureCount: 1, passCount: 1, finalStatus: "PASS" });
}

async function runFixtures() {
  const cases = [];
  const expectPass = async (id, action) => {
    try { await action(); cases.push(Object.freeze({ id, status: "PASS" })); }
    catch { cases.push(Object.freeze({ id, status: "FAIL" })); }
  };
  const expectReject = async (id, code, action) => {
    try { await action(); cases.push(Object.freeze({ id, status: "FAIL" })); }
    catch (error) { cases.push(Object.freeze({ id, status: error.message === code ? "PASS" : "FAIL" })); }
  };
  for (const [id, operation] of [["valid-5a", "ROLE_ATTESTATION"], ["valid-5b", "CLEANUP"], ["valid-5c", "POST_CLEANUP_ATTESTATION"]]) {
    await expectPass(id, () => { const env = fixtureEnvironment(operation); const selected = selectOperation(env); const bound = bindVariables(selected.config, env); validateMachineResult({ operation, config: selected.config, values: bound.values, stdout: Buffer.from(fixtureOutput(operation, env)), stderr: Buffer.alloc(0) }); });
  }
  await expectReject("missing-variable", "VARIABLE_MISSING_RUN_ID", () => { const env = fixtureEnvironment("ROLE_ATTESTATION"); delete env.A24E5D_RUN_ID; bindVariables(OPERATIONS.ROLE_ATTESTATION, env); });
  await expectReject("invalid-role", "VARIABLE_INVALID_DISPOSABLE_ROLE_NAME", () => { const env = fixtureEnvironment("ROLE_ATTESTATION"); env.A24E5D_DISPOSABLE_ROLE_NAME = "bad"; bindVariables(OPERATIONS.ROLE_ATTESTATION, env); });
  await expectReject("invalid-oid", "VARIABLE_INVALID_EXPECTED_RUNTIME_ROLE_OID", () => { const env = fixtureEnvironment("ROLE_ATTESTATION"); env.A24E5D_EXPECTED_RUNTIME_ROLE_OID = "0"; bindVariables(OPERATIONS.ROLE_ATTESTATION, env); });
  await expectReject("sql-hash-mismatch", "SQL_HASH_MISMATCH", () => verifySqlBytes(OPERATIONS.ROLE_ATTESTATION, Buffer.from("x\n")));
  const baseEnv = fixtureEnvironment("CLEANUP"); const baseConfig = OPERATIONS.CLEANUP; const baseValues = bindVariables(baseConfig, baseEnv).values; const valid = fixtureOutput("CLEANUP", baseEnv);
  const validate = (stdout, stderr = "") => validateMachineResult({ operation: "CLEANUP", config: baseConfig, values: baseValues, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr) });
  await expectReject("missing-result", "RESULT_ROW_MISSING", () => validate(`${baseConfig.marker}\n`));
  await expectReject("duplicate-result", "RESULT_ROW_DUPLICATE", () => validate(`${valid.split("\n")[0]}\n${valid}`));
  await expectReject("wrong-run", "RESULT_ROW_BINDING_INVALID", () => validate(valid.replace(baseEnv.A24E5D_RUN_ID, "wrong")));
  await expectReject("wrong-role", "RESULT_ROW_BINDING_INVALID", () => validate(valid.replace(baseEnv.A24E5D_DISPOSABLE_ROLE_NAME, "afex_core_test_login_20260803120000_00000000")));
  await expectReject("wrong-oid", "RESULT_OID_MISMATCH", () => validate(valid.replace("|202|PASS", "|999|PASS")));
  await expectReject("missing-marker", "MARKER_MISSING", () => validate(valid.replace(`${baseConfig.marker}\n`, "")));
  await expectReject("duplicate-marker", "MARKER_DUPLICATE", () => validate(`${valid}${baseConfig.marker}\n`));
  await expectReject("unrelated-marker", "MARKER_MISSING", () => validate(valid.replace(baseConfig.marker, OPERATIONS.ROLE_ATTESTATION.marker)));
  await expectReject("fail-row", "FAIL_ROW_REJECTED", () => validate(valid.replace("|PASS", "|FAIL")));
  await expectReject("sensitive-stdout", "STDOUT_REDACTION_REJECTED", () => validate(`${valid}postgresql://user:value@example.invalid/db\n`));
  await expectReject("sensitive-stderr", "STDERR_REDACTION_REJECTED", () => validate(valid, "Bearer unsafe-token-value"));
  await expectReject("timeout", "TIMEOUT", () => validateProcess({ launched: true, timedOut: true, exitCode: null, processErrorCode: "TIMEOUT" }));
  await expectReject("nonzero-exit", "PSQL_NONZERO_EXIT_3", () => validateProcess({ launched: true, timedOut: false, exitCode: 3, processErrorCode: "NONE", stderr: Buffer.alloc(0) }));
  await expectReject("missing-exit", "EXIT_CODE_MISSING", () => validateProcess({ launched: true, timedOut: false, exitCode: null, processErrorCode: "NONE" }));
  await expectReject("malformed-utf8", "The encoded data was not valid for encoding utf-8", () => decodeCapture(Buffer.from([0xc3, 0x28])));
  await expectPass("canonical-determinism", () => { const a = canonical({ b: 2, a: 1 }); const b = canonical({ a: 1, b: 2 }); if (a !== b || sha256(Buffer.from(a)) !== sha256(Buffer.from(b))) throw new Error("NONDETERMINISTIC"); });
  await expectPass("evidence-create-once", async () => { const dir = await mkdtemp(resolve(tmpdir(), "a24e5d-create-")); try { const observation = Object.freeze({ schemaVersion: FIXTURE_SCHEMA, fixtureCount: 24, passCount: 24, finalStatus: "PASS" }); await publishEvidence(dir, observation, Buffer.alloc(0), Buffer.alloc(0)); let rejected = false; try { await publishEvidence(dir, observation, Buffer.alloc(0), Buffer.alloc(0)); } catch { rejected = true; } if (!rejected) throw new Error("OVERWRITE_ALLOWED"); } finally { await rm(dir, { recursive: true, force: true }); } });
  const passCount = cases.filter((item) => item.status === "PASS").length;
  if (cases.length !== 24 || passCount !== 24) {
    const failed = cases.filter((item) => item.status !== "PASS").map((item) => item.id.toUpperCase().replaceAll("-", "_")).join("_");
    throw new Error(`FIXTURE_FAILURE_${failed || "COUNT"}`);
  }
  return Object.freeze({ schemaVersion: FIXTURE_SCHEMA, fixtureCount: 24, passCount, cases: Object.freeze(cases), finalStatus: "PASS" });
}

async function runRuntimeCleanupCorrectionFixtures() {
  const cases = [];
  const pass = async (id, action) => { try { await action(); cases.push({ id, status: "PASS" }); } catch { cases.push({ id, status: "FAIL" }); } };
  const reject = async (id, code, action) => { try { await action(); cases.push({ id, status: "FAIL" }); } catch (error) { cases.push({ id, status: error.message === code ? "PASS" : "FAIL" }); } };
  const runtimeEnv = fixtureEnvironment("RUNTIME_TEST");
  Object.assign(runtimeEnv, { A24E5D_PSQL_PATH: "fake-psql", A24E5D_EVIDENCE_DIRECTORY: "fake-evidence", A24E5D_TIMEOUT_MS: "300000", PGPASSFILE: "fake-pgpass", PGHOST: "127.0.0.1", PGPORT: "6543", PGUSER: runtimeEnv.A24E5D_DISPOSABLE_ROLE_NAME, PGDATABASE: runtimeEnv.A24E5D_EXPECTED_DATABASE_NAME });
  const runtimeBinding = bindVariables(OPERATIONS.RUNTIME_TEST, runtimeEnv);
  await pass("runtime-valid", () => buildRuntimeTestInvocation(OPERATIONS.RUNTIME_TEST, runtimeBinding, runtimeEnv));
  await reject("runtime-pgpass-missing", "RUNTIME_PGPASSFILE_MISSING", () => buildRuntimeTestInvocation(OPERATIONS.RUNTIME_TEST, runtimeBinding, { ...runtimeEnv, PGPASSFILE: "" }));
  await reject("runtime-user-mismatch", "RUNTIME_PGUSER_MISMATCH", () => buildRuntimeTestInvocation(OPERATIONS.RUNTIME_TEST, runtimeBinding, { ...runtimeEnv, PGUSER: "postgres" }));
  await reject("runtime-oid-mismatch", "RESULT_OID_MISMATCH", () => validateMachineResult({ operation: "RUNTIME_TEST", config: OPERATIONS.RUNTIME_TEST, values: runtimeBinding.values, stdout: Buffer.from(fixtureOutput("RUNTIME_TEST", { ...runtimeEnv, A24E5D_EXPECTED_DISPOSABLE_ROLE_OID: "999" })), stderr: Buffer.alloc(0) }));
  await reject("runtime-port-mismatch", "RUNTIME_PORT_MISMATCH", () => buildRuntimeTestInvocation(OPERATIONS.RUNTIME_TEST, runtimeBinding, { ...runtimeEnv, PGPORT: "55432" }));
  await reject("runtime-ssl-incompatible", "SSL_DEPENDENCY_INCOMPATIBLE", () => validateProcess({ launched: true, timedOut: false, exitCode: 2, processErrorCode: "NONE", stderr: Buffer.from("psql: error: server does not support SSL, but SSL was required\n") }));
  await reject("runtime-safe-inner-error", "PSQL_RUNTIME_LOGIN_IDENTITY_MISMATCH", () => validateProcess({ launched: true, timedOut: false, exitCode: 3, processErrorCode: "NONE", stderr: Buffer.from("ERROR:  42501: RUNTIME_LOGIN_IDENTITY_MISMATCH\n") }));
  const cleanupEnv = fixtureEnvironment("CLEANUP");
  await pass("cleanup-valid", () => bindVariables(OPERATIONS.CLEANUP, cleanupEnv));
  await reject("cleanup-path-missing", "SQL_PATH_MISSING", () => verifySqlArtifact(OPERATIONS.CLEANUP, ""));
  await reject("cleanup-hash-mismatch", "SQL_HASH_MISMATCH", () => verifySqlBytes(OPERATIONS.CLEANUP, Buffer.from("x\n")));
  await reject("cleanup-binding-mismatch", "RESULT_OID_MISMATCH", () => validateMachineResult({ operation: "CLEANUP", config: OPERATIONS.CLEANUP, values: bindVariables(OPERATIONS.CLEANUP, cleanupEnv).values, stdout: Buffer.from(fixtureOutput("CLEANUP", { ...cleanupEnv, A24E5D_EXPECTED_DISPOSABLE_ROLE_OID: "999" })), stderr: Buffer.alloc(0) }));
  await reject("cleanup-advisory-missing", "VARIABLE_MISSING_ADVISORY_LOCK_IDENTITY", () => bindVariables(OPERATIONS.CLEANUP, { ...cleanupEnv, A24E5D_ADVISORY_LOCK_IDENTITY: "" }));
  await reject("cleanup-safe-inner-error", "PSQL_ROLE_NAME_OID_MISMATCH", () => validateProcess({ launched: true, timedOut: false, exitCode: 3, processErrorCode: "NONE", stderr: Buffer.from("ERROR:  55000: ROLE_NAME_OID_MISMATCH\n") }));
  const postEnv = fixtureEnvironment("POST_CLEANUP_ATTESTATION"); const postValues = bindVariables(OPERATIONS.POST_CLEANUP_ATTESTATION, postEnv).values; const postOutput = fixtureOutput("POST_CLEANUP_ATTESTATION", postEnv);
  await pass("post-valid", () => validateMachineResult({ operation: "POST_CLEANUP_ATTESTATION", config: OPERATIONS.POST_CLEANUP_ATTESTATION, values: postValues, stdout: Buffer.from(postOutput), stderr: Buffer.alloc(0) }));
  await reject("marker-missing", "MARKER_MISSING", () => validateMachineResult({ operation: "POST_CLEANUP_ATTESTATION", config: OPERATIONS.POST_CLEANUP_ATTESTATION, values: postValues, stdout: Buffer.from(postOutput.replace(`${OPERATIONS.POST_CLEANUP_ATTESTATION.marker}\n`, "")), stderr: Buffer.alloc(0) }));
  await reject("marker-duplicate", "MARKER_DUPLICATE", () => validateMachineResult({ operation: "POST_CLEANUP_ATTESTATION", config: OPERATIONS.POST_CLEANUP_ATTESTATION, values: postValues, stdout: Buffer.from(`${postOutput}${OPERATIONS.POST_CLEANUP_ATTESTATION.marker}\n`), stderr: Buffer.alloc(0) }));
  await reject("secret-stderr", "STDERR_REDACTION_REJECTED", () => validateProcess({ launched: true, timedOut: false, exitCode: 3, processErrorCode: "NONE", stderr: Buffer.from("postgresql://user:secret@example.invalid/db") }));
  const passCount = cases.filter((item) => item.status === "PASS").length;
  if (cases.length !== 17 || passCount !== 17) throw new Error(`CORRECTION_FIXTURE_FAILURE_${cases.filter((item) => item.status !== "PASS").map((item) => item.id.toUpperCase().replaceAll("-", "_")).join("_") || "COUNT"}`);
  return Object.freeze({ schemaVersion: FIXTURE_SCHEMA, fixtureCount: 17, passCount, cases: Object.freeze(cases), finalStatus: "PASS" });
}

function runPrelaunchDiagnosticFixtures() {
  const cases = [];
  const pass = (id, condition) => cases.push(Object.freeze({ id, status: condition ? "PASS" : "FAIL" }));
  const classify = (error, stage) => classifyFailure(error, stage).code;
  pass("explicit-code", classify(new Error("SQL_HASH_MISMATCH"), "HASH_VALIDATION") === "SQL_HASH_MISMATCH");
  pass("environment-type", classify(new TypeError("password secret postgresql://hidden"), "CONTRACT_VALIDATION") === "HARNESS_PRELAUNCH_CONTRACT_VALIDATION_TYPE_ERROR");
  pass("process-type", classify(new TypeError("arbitrary"), "PROCESS_SPAWN") === "HARNESS_PRELAUNCH_PROCESS_SPAWN_TYPE_ERROR");
  pass("enoent", classify(Object.assign(new Error("C:\\secret\\file"), { code: "ENOENT", path: "C:\\secret\\file" }), "PATH_VALIDATION") === "HARNESS_PRELAUNCH_PATH_VALIDATION_SYSTEM_ENOENT");
  pass("eacces", classify(Object.assign(new Error("password"), { code: "EACCES" }), "PATH_VALIDATION") === "HARNESS_PRELAUNCH_PATH_VALIDATION_SYSTEM_EACCES");
  pass("unknown-error", classify(new Error("free form"), "ENTRY") === "HARNESS_PRELAUNCH_ENTRY_UNKNOWN_ERROR");
  pass("null-throw", classify(null, "ENTRY") === "HARNESS_PRELAUNCH_ENTRY_UNKNOWN_ERROR");
  pass("string-throw", classify("postgresql://user:secret@example.invalid/db", "ENTRY") === "HARNESS_PRELAUNCH_ENTRY_UNKNOWN_ERROR");
  const secretCode = classify(new TypeError("password passwd secret SCRAM-SHA-256 bearer token"), "CONTRACT_VALIDATION");
  pass("secret-not-persisted", !/password|passwd|secret|scram|bearer|token/iu.test(secretCode));
  const urlCode = classify(new Error("postgresql://user:value@example.invalid/db"), "ENTRY");
  pass("url-not-persisted", !/postgres(?:ql)?:\/\//iu.test(urlCode));
  const pathCode = classify(Object.assign(new Error("failure"), { code: "ENOENT", path: "C:\\private\\credential.txt", syscall: "open" }), "PATH_VALIDATION");
  pass("path-not-persisted", !/private|credential|open/iu.test(pathCode));
  pass("stack-not-persisted", !classifyFailure(Object.assign(new TypeError("x"), { stack: "SECRET_STACK" }), "ENTRY").code.includes("STACK"));
  let invalidRejected = false; try { setDiagnosticStage("CALLER_VALUE"); } catch (error) { invalidRejected = error.message === "DIAGNOSTIC_STAGE_INVALID"; } finally { setDiagnosticStage("ENTRY"); }
  pass("stage-closed", invalidRejected);
  pass("invalid-stage-not-emitted", classify(new TypeError("x"), "CALLER_VALUE") === "HARNESS_PRELAUNCH_ENTRY_TYPE_ERROR");
  pass("deterministic", classify(new TypeError("one"), "CONTRACT_VALIDATION") === classify(new TypeError("two"), "CONTRACT_VALIDATION"));
  pass("stage-distinct", classify(new TypeError("x"), "CONTRACT_VALIDATION") !== classify(new TypeError("x"), "PROCESS_SPAWN"));
  const code = classify(new TypeError("x"), "RUNTIME_SQL_CONSTRUCTION");
  const config = OPERATIONS.RUNTIME_TEST; const env = fixtureEnvironment("RUNTIME_TEST");
  const observation = Object.freeze({ schemaVersion: OBSERVATION_SCHEMA, operation: "RUNTIME_TEST", runId: env.A24E5D_RUN_ID, launched: false, timedOut: false, exitCode: null, processErrorCode: "PRELAUNCH_FAILURE", failureCode: code, sqlArtifactSha256: "0".repeat(64), expectedMarker: config.marker, disposableRoleName: env.A24E5D_DISPOSABLE_ROLE_NAME, disposableRoleOid: env.A24E5D_EXPECTED_DISPOSABLE_ROLE_OID, stdoutSha256: sha256(Buffer.alloc(0)), stderrSha256: sha256(Buffer.alloc(0)), finalStatus: "FAIL" });
  pass("stderr-result-code-equal", observation.failureCode === code);
  pass("prelaunch-shape", observation.launched === false && observation.exitCode === null && observation.processErrorCode === "PRELAUNCH_FAILURE");
  pass("empty-hashes", observation.stdoutSha256 === sha256(Buffer.alloc(0)) && observation.stderrSha256 === sha256(Buffer.alloc(0)));
  pass("marker-exact", observation.expectedMarker === "A24E5D_910_DISPOSABLE_LOGIN_RUNTIME_TEST_COMPLETE");
  pass("fallback-unreachable", DIAGNOSTIC_STAGE_SET.has(diagnosticStage) && classify(undefined, diagnosticStage).startsWith("HARNESS_PRELAUNCH_"));
  const passCount = cases.filter((item) => item.status === "PASS").length;
  if (cases.length !== 21 || passCount !== 21) throw new Error(`DIAGNOSTIC_FIXTURE_FAILURE_${cases.filter((item) => item.status !== "PASS").map((item) => item.id.toUpperCase().replaceAll("-", "_")).join("_") || "COUNT"}`);
  return Object.freeze({ schemaVersion: FIXTURE_SCHEMA, fixtureCount: 21, passCount, cases: Object.freeze(cases), finalStatus: "PASS" });
}

async function runRuntimeEvidencePublicationFixtures() {
  const cases = [];
  const pass = (id, condition) => cases.push(Object.freeze({ id, status: condition ? "PASS" : "FAIL" }));
  const env = fixtureEnvironment("RUNTIME_TEST");
  Object.assign(env, { A24E5D_PSQL_PATH: "fake-psql", A24E5D_EVIDENCE_DIRECTORY: "fake-evidence", A24E5D_TIMEOUT_MS: "300000", PGPASSFILE: "fake-pgpass", PGHOST: "127.0.0.1", PGPORT: "6543", PGUSER: env.A24E5D_DISPOSABLE_ROLE_NAME, PGDATABASE: env.A24E5D_EXPECTED_DATABASE_NAME });
  const binding = bindVariables(OPERATIONS.RUNTIME_TEST, env);
  const invocation = buildRuntimeTestInvocation(OPERATIONS.RUNTIME_TEST, binding, env);
  pass("no-sql-path", !Object.hasOwn(env, "A24E5D_SQL_PATH"));
  pass("runtime-construction", invocation.executable === "fake-psql" && invocation.args.length > 3);
  const successProcess = Object.freeze({ launched: true, timedOut: false, exitCode: 0, processErrorCode: "NONE", stdout: Buffer.from(fixtureOutput("RUNTIME_TEST", env)), stderr: Buffer.alloc(0) });
  pass("explicit-buffer-types", Buffer.isBuffer(successProcess.stdout) && Buffer.isBuffer(successProcess.stderr));
  validateProcess(successProcess);
  const result = validateMachineResult({ operation: "RUNTIME_TEST", config: OPERATIONS.RUNTIME_TEST, values: binding.values, stdout: successProcess.stdout, stderr: successProcess.stderr });
  const artifact = Object.freeze({ path: "engine-owned-runtime-probe", hash: "0".repeat(64), sizeBytes: Buffer.byteLength(invocation.input) });
  const observation = newObservation({ operation: "RUNTIME_TEST", values: binding.values, process: successProcess, artifact, config: OPERATIONS.RUNTIME_TEST, result });
  pass("zero-sql-hash", observation.sqlArtifactSha256 === "0".repeat(64));
  pass("success-process", observation.launched === true && observation.exitCode === 0 && observation.finalStatus === "PASS");
  const prelaunch = Object.freeze({ schemaVersion: OBSERVATION_SCHEMA, operation: "RUNTIME_TEST", runId: env.A24E5D_RUN_ID, launched: false, timedOut: false, exitCode: null, processErrorCode: "PRELAUNCH_FAILURE", failureCode: "HARNESS_PRELAUNCH_ENTRY_UNKNOWN_ERROR", sqlArtifactSha256: "0".repeat(64), expectedMarker: OPERATIONS.RUNTIME_TEST.marker, disposableRoleName: env.A24E5D_DISPOSABLE_ROLE_NAME, disposableRoleOid: env.A24E5D_EXPECTED_DISPOSABLE_ROLE_OID, stdoutSha256: sha256(Buffer.alloc(0)), stderrSha256: sha256(Buffer.alloc(0)), finalStatus: "FAIL" });
  pass("prelaunch-shape", prelaunch.launched === false && prelaunch.exitCode === null);
  pass("empty-stdout", prelaunch.stdoutSha256 === sha256(Buffer.alloc(0)));
  pass("empty-stderr", prelaunch.stderrSha256 === sha256(Buffer.alloc(0)));
  const hasUndefined = (value) => value === undefined || (value !== null && typeof value === "object" && Object.values(value).some(hasUndefined));
  pass("no-undefined-observation", !hasUndefined(observation) && !hasUndefined(prelaunch));
  pass("canonical-deterministic", canonical(observation) === canonical(observation));
  pass("hash-input-defined", typeof canonical(observation) === "string");
  pass("path-input-defined", typeof invocation.evidenceDirectory === "string");
  let nonzeroCode = ""; try { validateProcess({ launched: true, timedOut: false, exitCode: 3, processErrorCode: "NONE", stderr: Buffer.from("ERROR:  42501: RUNTIME_LOGIN_IDENTITY_MISMATCH\n") }); } catch (error) { nonzeroCode = error.message; }
  pass("nonzero-exact", nonzeroCode === "PSQL_RUNTIME_LOGIN_IDENTITY_MISMATCH");
  let timeoutCode = ""; try { validateProcess({ launched: true, timedOut: true, exitCode: null, processErrorCode: "TIMEOUT", stderr: Buffer.alloc(0) }); } catch (error) { timeoutCode = error.message; }
  pass("timeout-exact", timeoutCode === "TIMEOUT");
  let utf8Code = ""; try { decodeCapture(Buffer.from([0xc3, 0x28])); } catch (error) { utf8Code = classifyFailure(error, "OUTPUT_DECODE").code; }
  pass("utf8-exact", utf8Code === "HARNESS_PRELAUNCH_OUTPUT_DECODE_TYPE_ERROR");
  const dir = await mkdtemp(resolve(tmpdir(), "a24e5d-runtime-publication-"));
  try {
    await publishEvidence(dir, observation, successProcess.stdout, successProcess.stderr);
    const resultsBytes = await readFile(resolve(dir, "results.json"));
    const digestBytes = await readFile(resolve(dir, "results.sha256"));
    pass("results-json-once", resultsBytes.length > 0);
    pass("results-sha-once", digestBytes.toString("utf8") === `${sha256(resultsBytes)}  results.json\n`);
    pass("results-canonical", resultsBytes.toString("utf8") === `${canonical(observation)}\n`);
    let duplicateRejected = false; try { await publishEvidence(dir, observation, Buffer.alloc(0), Buffer.alloc(0)); } catch { duplicateRejected = true; }
    pass("create-once", duplicateRejected);
  } finally { await rm(dir, { recursive: true, force: true }); }
  pass("sql-backed-hash-contract", OPERATIONS.ROLE_ATTESTATION.sqlHash === "c0257bedceea45d9e394c264a30c118747a6f126797405f219bfe578f5908cc3" && OPERATIONS.CLEANUP.sqlHash === "0a324b066f126207a489eb4c00836ca770f786b97a91052dd5fb799f61ea874b" && OPERATIONS.POST_CLEANUP_ATTESTATION.sqlHash === "6a7ff904c3055cb45b2411cce70c918167fac132e704c13ca2e7bf7ba8abf009");
  pass("marker-contract", OPERATIONS.RUNTIME_TEST.marker === "A24E5D_910_DISPOSABLE_LOGIN_RUNTIME_TEST_COMPLETE");
  const passCount = cases.filter((item) => item.status === "PASS").length;
  if (cases.length !== 21 || passCount !== 21) throw new Error(`RUNTIME_EVIDENCE_FIXTURE_FAILURE_${cases.filter((item) => item.status !== "PASS").map((item) => item.id.toUpperCase().replaceAll("-", "_")).join("_") || "COUNT"}`);
  return Object.freeze({ schemaVersion: FIXTURE_SCHEMA, fixtureCount: 21, passCount, cases: Object.freeze(cases), finalStatus: "PASS" });
}

async function liveMain(env) {
  setDiagnosticStage("OPERATION_RESOLUTION");
  const { operation, config } = selectOperation(env);
  setDiagnosticStage("CONTRACT_VALIDATION");
  const binding = bindVariables(config, env);
  if (operation === "RUNTIME_TEST") {
    const invocation = buildRuntimeTestInvocation(config, binding, env);
    const processResult = await runBoundedProcess({ executable: invocation.executable, args: invocation.args, input: Buffer.from(invocation.input, "utf8"), env: invocation.childEnv, timeoutMs: invocation.timeoutMs });
    let result;
    try {
      validateProcess(processResult);
      result = validateMachineResult({ operation, config, values: binding.values, stdout: processResult.stdout, stderr: processResult.stderr });
    } catch (error) {
      const failureCode = classifyFailure(error).code;
      await publishFailureEvidence(invocation.evidenceDirectory, operation, binding.values, processResult, Object.freeze({ hash: "0".repeat(64) }), config, failureCode);
      throw error;
    }
    const observation = newObservation({ operation, values: binding.values, process: processResult, artifact: Object.freeze({ path: "engine-owned-runtime-probe", hash: "0".repeat(64), sizeBytes: Buffer.byteLength(invocation.input) }), config, result });
    await publishEvidence(invocation.evidenceDirectory, observation, processResult.stdout, processResult.stderr);
    return observation;
  }
  const artifact = await verifySqlArtifact(config, env.A24E5D_SQL_PATH);
  const executable = env.A24E5D_PSQL_PATH;
  const evidenceDirectory = env.A24E5D_EVIDENCE_DIRECTORY;
  const pgpass = env.PGPASSFILE;
  if (!executable || !evidenceDirectory || !pgpass) throw new Error("LIVE_INPUT_MISSING");
  const timeoutMs = Number.parseInt(env.A24E5D_TIMEOUT_MS ?? "300000", 10);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 3600000) throw new Error("TIMEOUT_INVALID");
  const childEnv = { PATH: env.PATH ?? "", SystemRoot: env.SystemRoot ?? "", PGPASSFILE: pgpass, PGSSLMODE: "require" };
  for (const name of ["PGHOST", "PGPORT", "PGUSER", "PGDATABASE"]) if (env[name]) childEnv[name] = env[name];
  const args = Object.freeze(["-X", "--no-password", "--set=ON_ERROR_STOP=1", ...binding.args]);
  const processResult = await runBoundedProcess({ executable, args, input: artifact.bytes, env: childEnv, timeoutMs });
  let result;
  try {
    validateProcess(processResult);
    result = validateMachineResult({ operation, config, values: binding.values, stdout: processResult.stdout, stderr: processResult.stderr });
  } catch (error) {
    const failureCode = classifyFailure(error).code;
    await publishFailureEvidence(evidenceDirectory, operation, binding.values, processResult, artifact, config, failureCode);
    throw error;
  }
  const observation = newObservation({ operation, values: binding.values, process: processResult, artifact, config, result });
  await publishEvidence(evidenceDirectory, observation, processResult.stdout, processResult.stderr);
  return observation;
}

async function main() {
  setDiagnosticStage("ENTRY");
  if (process.argv.includes("--fixture-runtime-evidence-publication")) {
    await runRuntimeEvidencePublicationFixtures();
  } else if (process.argv.includes("--fixture-prelaunch-diagnostics")) {
    runPrelaunchDiagnosticFixtures();
  } else if (process.argv.includes("--fixture-runtime-cleanup-correction")) {
    await runRuntimeCleanupCorrectionFixtures();
  } else if (process.argv.includes("--fixture-live-construction")) {
    runRuntimeConstructionFixture();
  } else if (process.argv.includes("--fixture")) {
    const result = await runFixtures();
    if (process.env.A24E5D_EVIDENCE_DIRECTORY) await publishEvidence(process.env.A24E5D_EVIDENCE_DIRECTORY, result, Buffer.alloc(0), Buffer.alloc(0));
  } else {
    await liveMain(process.env);
  }
  setDiagnosticStage("COMPLETE");
  process.stdout.write(`${HARNESS_MARKER}\n`);
}

main().catch(async (error) => {
  const classification = classifyFailure(error);
  const safeCode = classification.code;
  const operation = Object.hasOwn(OPERATIONS, process.env.A24E5D_OPERATION ?? "") ? process.env.A24E5D_OPERATION : "UNKNOWN";
  const config = OPERATIONS[operation];
  const evidenceDirectory = process.env.A24E5D_EVIDENCE_DIRECTORY;
  if (config && evidenceDirectory) {
    const values = Object.freeze({
      run_id: validateValue(process.env.A24E5D_RUN_ID, "run") ? process.env.A24E5D_RUN_ID : "INVALID_RUN_ID",
      disposable_role_name: validateValue(process.env.A24E5D_DISPOSABLE_ROLE_NAME, "role") ? process.env.A24E5D_DISPOSABLE_ROLE_NAME : "INVALID_ROLE_NAME",
      expected_disposable_role_oid: validateValue(process.env.A24E5D_EXPECTED_DISPOSABLE_ROLE_OID, "oid") ? process.env.A24E5D_EXPECTED_DISPOSABLE_ROLE_OID : "0",
    });
    const observation = Object.freeze({ schemaVersion: OBSERVATION_SCHEMA, operation, runId: values.run_id, launched: false, timedOut: false, exitCode: null, processErrorCode: "PRELAUNCH_FAILURE", failureCode: safeCode, sqlArtifactSha256: "0".repeat(64), expectedMarker: config.marker, disposableRoleName: values.disposable_role_name, disposableRoleOid: values.expected_disposable_role_oid, stdoutSha256: sha256(Buffer.alloc(0)), stderrSha256: sha256(Buffer.alloc(0)), finalStatus: "FAIL" });
    try { await publishEvidence(evidenceDirectory, observation, Buffer.alloc(0), Buffer.alloc(0)); } catch { /* Earlier process-failure evidence is authoritative and create-once. */ }
  }
  process.stderr.write(`failure_code=${safeCode}\n`);
  process.exitCode = 1;
});
