const operationDefinitions = {
  READ_TYPE_FIXTURE: {
    text: `SELECT fixture_id, int4_value, int8_value, numeric_value, boolean_value,
      uuid_value, json_value, jsonb_value, bytea_value, text_array_value,
      nullable_text_value, timestamptz_value, timestamp_value
      FROM pd6_evidence.type_fixture WHERE fixture_id = 1`,
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
