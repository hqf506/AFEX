import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  prePinDatabaseEvidence,
  safePrePinDatabaseCode,
  sanitizePrePinDatabaseText,
} from '../lib/server/offline/pre-pin-safe-diagnostics.ts'

const root = path.resolve('.')
const read = (relative) => readFile(path.join(root, relative), 'utf8')

test('SQLSTATE and PostgREST codes are preserved while generic labels fail closed', () => {
  assert.equal(safePrePinDatabaseCode('42883'), '42883')
  assert.equal(safePrePinDatabaseCode('PGRST202'), 'PGRST202')
  assert.equal(
    safePrePinDatabaseCode('ERROR'),
    'DATABASE_ERROR_UNCLASSIFIED'
  )
})

test('database diagnostics retain safe function evidence and redact sensitive values', () => {
  const evidence = prePinDatabaseEvidence({
    code: '42501',
    message:
      'permission denied for function afex_offline_server_pre_pin_provision_device_v2 token=secret-value',
    details:
      'subject 123e4567-e89b-42d3-a456-426614174000 phone +966566118082 hash 989442b7ba3741300c39f543b2a59c5f5bf1fb149eea6a782dc26f0ffdc872bd',
    hint: 'Use the trusted server facade',
  })
  assert.equal(evidence.databaseCode, '42501')
  assert.match(
    evidence.databaseMessage ?? '',
    /afex_offline_server_pre_pin_provision_device_v2/u
  )
  assert.doesNotMatch(JSON.stringify(evidence), /secret-value|123e4567|566118082|989442b7/iu)
  assert.match(JSON.stringify(evidence), /\[redacted\]|\[uuid\]|\[phone\]|\[hash\]/u)
})

test('diagnostic text is bounded and strips control characters', () => {
  const value = sanitizePrePinDatabaseText(
    `safe\u0000message ${'bounded diagnostic '.repeat(50)}`
  )
  assert.equal(value?.includes('\u0000'), false)
  assert.equal(value?.length, 512)
})

test('Preview failure logging is correlation-bound, payload-free and production-gated', async () => {
  const transport = await read('lib/server/offline/pre-pin-provisioning.ts')
  assert.match(transport, /process\.env\.VERCEL_ENV === 'preview'/u)
  assert.match(transport, /AFEX_PRE_PIN_PREVIEW_REQUEST_FAILED/u)
  assert.match(transport, /correlationId/u)
  assert.match(transport, /x-afex-correlation-id/u)
  assert.match(transport, /databaseCode/u)
  assert.match(transport, /databaseMessage/u)
  assert.match(transport, /databaseDetails/u)
  assert.match(transport, /rpcName/u)
  const logStart = transport.indexOf("event: 'AFEX_PRE_PIN_PREVIEW_REQUEST_FAILED'")
  const logEnd = transport.indexOf('externalEffects: 0', logStart)
  assert.ok(logStart > 0 && logEnd > logStart)
  assert.doesNotMatch(
    transport.slice(logStart, logEnd),
    /\b(?:payload|args|token|jwt|publicKeySha256|wrappedKeySha256)\s*:/u
  )
})

test('device provisioning selects only approved versioned public facades and never bypasses Foundation', async () => {
  const [transport, sql, w1Sql] = await Promise.all([
    read('lib/server/offline/pre-pin-provisioning.ts'),
    read(
      'docs/investigations/AFEX-POS-OFFLINE-PRE-PIN-PROVISIONING-V2/01-ADD-PRE-PIN-PROVISIONING-V2.sql'
    ),
    read(
      'docs/investigations/AFEX-OFFLINE-MULTI-DEVICE-CONCURRENT-W1-ONBOARDING-FOUNDATION/01-ADD-MULTI-DEVICE-ONBOARDING-FOUNDATION.sql'
    ),
  ])
  assert.match(transport, /function prePinFacade\(/u)
  assert.match(transport, /multiDeviceOnboardingW1Enabled\(\) \? 'v3' : 'v2'/u)
  assert.match(transport, /invoke\(\s*operation,\s*prePinFacade\(operation\)/u)
  assert.doesNotMatch(
    transport,
    /supabaseAdmin\.rpc\(['"](?:register_offline_device_v1|register_offline_device_v2|provision_pre_pin_device_v2|provision_pre_pin_device_v3)/u
  )
  const signature = [
    'p_authenticated_subject_id uuid',
    'p_authenticated_session_id uuid',
    'p_tenant_id uuid',
    'p_branch_id uuid',
    'p_operation_id uuid',
    'p_device_id uuid',
    'p_mode text',
    'p_proof_public_key_jwk jsonb',
    'p_wrap_public_key_jwk jsonb',
    'p_key_envelope_id uuid',
    'p_wrapped_key_sha256 text',
    'p_public_key_sha256 text',
    'p_envelope_aad_sha256 text',
    'p_envelope_ciphertext_sha256 text',
    'p_evidence_sha256 text',
  ]
  const facade = sql.slice(
    sql.indexOf('CREATE FUNCTION public.afex_offline_server_pre_pin_provision_device_v2('),
    sql.indexOf('CREATE FUNCTION public.afex_offline_server_pre_pin_employee_roster_v2(')
  )
  for (const parameter of signature) {
    assert.match(facade, new RegExp(parameter.replace(' ', '\\s+'), 'u'))
    assert.match(
      transport,
      new RegExp(`${parameter.split(' ')[0]}\\s*:`, 'u')
    )
  }
  assert.match(
    facade,
    /RETURN afex_offline_authority\.provision_pre_pin_device_v2\(/u
  )
  const w1Facade = w1Sql.slice(
    w1Sql.indexOf('CREATE FUNCTION public.afex_offline_server_pre_pin_provision_device_v3('),
    w1Sql.indexOf('CREATE FUNCTION public.afex_offline_server_pre_pin_employee_roster_v3(')
  )
  for (const parameter of signature) {
    assert.match(w1Facade, new RegExp(parameter.replace(' ', '\\s+'), 'u'))
  }
  assert.match(
    w1Facade,
    /RETURN afex_offline_authority\.provision_pre_pin_device_v3\(/u
  )
})
