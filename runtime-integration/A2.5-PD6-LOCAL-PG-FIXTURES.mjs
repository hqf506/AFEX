const operationDefinitions = {
  READ_TYPE_FIXTURE: {
    text: `SELECT fixture_id, int4_value, int8_value, numeric_value, boolean_value,
      uuid_value, json_value, jsonb_value, bytea_value, text_array_value,
      nullable_text_value, timestamptz_value, timestamp_value,
      pg_catalog.to_char(timestamptz_value AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS timestamptz_logical_value,
      pg_catalog.to_char(timestamp_value,
        'YYYY-MM-DD HH24:MI:SS.US') AS timestamp_logical_value
      FROM pd6_evidence.type_fixture WHERE fixture_id = 1`,
    valueCount: 0
  },
  READ_SERVER_VERSION: {
    text: `SELECT substring(pg_catalog.current_setting('server_version')
      FROM '^[0-9]+(?:\\.[0-9]+){1,2}') AS postgres_version`,
    valueCount: 0
  },
  READ_LOCK_TARGET: {
    text: `SELECT fixture_id, payload
      FROM pd6_evidence.lock_target WHERE fixture_id = 1`,
    valueCount: 0
  },
  VERIFY_PUBLIC_DENIAL_OBJECT_ABSENT: {
    text: `SELECT pg_catalog.to_regclass('public.a25_pd6_denial_probe') IS NULL AS absent`,
    valueCount: 0
  },
  VERIFY_EVIDENCE_DENIAL_OBJECT_ABSENT: {
    text: `SELECT pg_catalog.to_regclass('pd6_evidence.a25_pd6_denial_probe') IS NULL AS absent`,
    valueCount: 0
  },
  READ_STATUS_FIXTURE: {
    text: `SELECT fixture_id, revision, lifecycle_marker
      FROM pd6_evidence.status_fixture WHERE fixture_id = 1`,
    valueCount: 0
  },
  UPDATE_STATUS_FIXTURE: {
    text: `UPDATE pd6_evidence.status_fixture
      SET revision = $1, lifecycle_marker = $2 WHERE fixture_id = 1
      RETURNING fixture_id, revision, lifecycle_marker`,
    valueCount: 2
  },
  READ_TRANSACTION_FIXTURE: {
    text: `SELECT fixture_id, revision, payload
      FROM pd6_evidence.transaction_target WHERE fixture_id = 1`,
    valueCount: 0
  },
  UPDATE_TRANSACTION_FIXTURE: {
    text: `UPDATE pd6_evidence.transaction_target
      SET revision = $1, payload = $2 WHERE fixture_id = 1
      RETURNING fixture_id, revision, payload`,
    valueCount: 2
  },
  LOCK_TARGET_UPDATE: {
    text: `UPDATE pd6_evidence.lock_target
      SET payload = payload WHERE fixture_id = 1 RETURNING fixture_id`,
    valueCount: 0
  },
  SAFE_DELAY: {
    text: 'SELECT pg_catalog.pg_sleep(3)',
    valueCount: 0
  },
  SET_LOCAL_STATEMENT_TIMEOUT: {
    text: "SET LOCAL statement_timeout = '2000ms'",
    valueCount: 0
  },
  SET_LOCAL_LOCK_TIMEOUT: {
    text: "SET LOCAL lock_timeout = '1000ms'",
    valueCount: 0
  },
  ORDINARY_QUERY_ERROR: {
    text: 'SELECT 1 / 0',
    valueCount: 0
  },
  DENY_PUBLIC_CREATE: {
    text: 'CREATE TABLE public.a25_pd6_denial_probe (id integer)',
    valueCount: 0
  },
  DENY_EVIDENCE_CREATE: {
    text: 'CREATE TABLE pd6_evidence.a25_pd6_denial_probe (id integer)',
    valueCount: 0
  },
  DENY_TYPE_INSERT: {
    text: `INSERT INTO pd6_evidence.type_fixture
      (fixture_id, int4_value, int8_value, numeric_value, boolean_value, uuid_value,
       json_value, jsonb_value, bytea_value, text_array_value, nullable_text_value,
       timestamptz_value, timestamp_value)
      VALUES (2, 0, 0, 0, false, '00000000-0000-0000-0000-000000000002',
       '{}'::json, '{}'::jsonb, ''::bytea, ARRAY[]::text[], NULL,
       '2026-01-01T00:00:00Z'::timestamptz, '2026-01-01T00:00:00'::timestamp)`,
    valueCount: 0
  },
  DENY_TRANSACTION_DELETE: {
    text: 'DELETE FROM pd6_evidence.transaction_target WHERE fixture_id = 1',
    valueCount: 0
  }
};

export const LOCAL_PG_OPERATION_IDS = Object.freeze(Object.keys(operationDefinitions));

export const LOCAL_PG_OPERATIONS = Object.freeze(Object.fromEntries(
  Object.entries(operationDefinitions).map(([operationId, definition]) => [
    operationId,
    Object.freeze({ ...definition })
  ])
));

export const TRANSACTION_CONTROL = Object.freeze({
  begin: 'BEGIN',
  commit: 'COMMIT',
  rollback: 'ROLLBACK'
});

export const TYPE_FIXTURE_BASELINE = deepFreeze({
  fixture_id: 1,
  int4_value: 2147483647,
  int8_value: '9007199254740993',
  numeric_value: '1234567890.123456789',
  boolean_value: true,
  uuid_value: '12345678-1234-5678-9abc-def012345678',
  json_value: { kind: 'pd6', format: 'json', ordinal: 1 },
  jsonb_value: { kind: 'pd6', format: 'jsonb', ordinal: 1 },
  bytea_value: [0x00, 0x01, 0x02, 0xfe, 0xff],
  text_array_value: ['alpha', 'beta', 'gamma'],
  nullable_text_value: null,
  timestamptz_logical_value: '2026-01-02T03:04:05.678901Z',
  timestamp_logical_value: '2026-01-02 03:04:05.678901'
});

export function validateServerVersionRow(row) {
  const value = row?.postgres_version;
  if (typeof value !== 'string' || !/^[0-9]{1,3}\.[0-9]{1,3}(?:\.[0-9]{1,3})?$/.test(value)) {
    throw new TypeError('PD6_SERVER_VERSION_INVALID');
  }
  return value;
}

export function validateDenialObjectAbsent(row) {
  if (row?.absent !== true) throw new TypeError('PD6_DENIAL_OBJECT_PRESENT');
  return true;
}

export function validateTypeFixtureBaseline(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  return row.fixture_id === TYPE_FIXTURE_BASELINE.fixture_id
    && row.int4_value === TYPE_FIXTURE_BASELINE.int4_value
    && String(row.int8_value) === TYPE_FIXTURE_BASELINE.int8_value
    && String(row.numeric_value) === TYPE_FIXTURE_BASELINE.numeric_value
    && row.boolean_value === TYPE_FIXTURE_BASELINE.boolean_value
    && row.uuid_value === TYPE_FIXTURE_BASELINE.uuid_value
    && canonicalJson(row.json_value) === canonicalJson(TYPE_FIXTURE_BASELINE.json_value)
    && canonicalJson(row.jsonb_value) === canonicalJson(TYPE_FIXTURE_BASELINE.jsonb_value)
    && exactBytes(row.bytea_value, TYPE_FIXTURE_BASELINE.bytea_value)
    && canonicalJson(row.text_array_value) === canonicalJson(TYPE_FIXTURE_BASELINE.text_array_value)
    && row.nullable_text_value === null
    && row.timestamptz_logical_value === TYPE_FIXTURE_BASELINE.timestamptz_logical_value
    && row.timestamp_logical_value === TYPE_FIXTURE_BASELINE.timestamp_logical_value;
}

export function resolveLocalPgOperation(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new TypeError('PD6_OPERATION_INVALID');
  }
  const keys = Object.keys(descriptor);
  if (keys.some((key) => !['operationId', 'values'].includes(key))
      || typeof descriptor.operationId !== 'string'
      || (descriptor.values !== undefined && !Array.isArray(descriptor.values))) {
    throw new TypeError('PD6_OPERATION_INVALID');
  }
  const operation = LOCAL_PG_OPERATIONS[descriptor.operationId];
  if (!operation) throw new TypeError('PD6_OPERATION_UNKNOWN');
  const values = descriptor.values ?? [];
  if (values.length !== operation.valueCount) throw new TypeError('PD6_OPERATION_VALUES_INVALID');
  return Object.freeze({ text: operation.text, values: Object.freeze([...values]) });
}

export function createLocalPgControls() {
  return Object.freeze({
    begin: (client) => client.query({ text: TRANSACTION_CONTROL.begin, values: [] }),
    commit: (client) => client.query({ text: TRANSACTION_CONTROL.commit, values: [] }),
    rollback: (client) => client.query({ text: TRANSACTION_CONTROL.rollback, values: [] }),
    execute: (client, descriptor) => client.query(resolveLocalPgOperation(descriptor))
  });
}

function exactBytes(actual, expected) {
  if (!(actual instanceof Uint8Array) && !Array.isArray(actual)) return false;
  return actual.length === expected.length && expected.every((value, index) => actual[index] === value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
