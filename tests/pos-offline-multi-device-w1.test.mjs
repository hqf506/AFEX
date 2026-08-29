import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const packageRoot = path.join(
  root,
  'docs/investigations/AFEX-OFFLINE-MULTI-DEVICE-CONCURRENT-W1-ONBOARDING-FOUNDATION'
)
const forward = fs.readFileSync(
  path.join(packageRoot, '01-ADD-MULTI-DEVICE-ONBOARDING-FOUNDATION.sql'),
  'utf8'
)
const preflight = fs.readFileSync(
  path.join(packageRoot, '00-READ-ONLY-W1-PREFLIGHT.sql'),
  'utf8'
)
const post = fs.readFileSync(
  path.join(packageRoot, '02-READ-ONLY-W1-POST-ATTESTATION.sql'),
  'utf8'
)
const deactivate = fs.readFileSync(
  path.join(packageRoot, '90-DEACTIVATE-W1-MULTI-DEVICE-ONBOARDING.sql'),
  'utf8'
)
const transport = fs.readFileSync(
  path.join(root, 'lib/server/offline/pre-pin-provisioning.ts'),
  'utf8'
)
const runtime = fs.readFileSync(
  path.join(root, 'lib/offline/complete-runtime.ts'),
  'utf8'
)
const coreBridge = fs.readFileSync(
  path.join(root, 'lib/offline/core-v2-offline-authority-bridge.ts'),
  'utf8'
)

function createModel() {
  return { devices: new Map(), envelopes: new Map(), bootstraps: new Map() }
}

function onboard(model, count, branch = 'branch-a') {
  for (let index = 1; index <= count; index += 1) {
    const deviceId = `device-${index}`
    const proof = `proof-${index}`
    const wrap = `wrap-${index}`
    const existing = model.devices.get(deviceId)
    if (existing && (existing.proof !== proof || existing.wrap !== wrap)) {
      throw new Error('AFEX_MULTI_DEVICE_ID_IMMUTABLE_CONFLICT')
    }
    if (!existing) {
      model.devices.set(deviceId, {
        deviceId,
        branch,
        proof,
        wrap,
        generation: 1,
        status: 'active',
      })
      model.envelopes.set(deviceId, {
        deviceId,
        branch,
        generation: 1,
        status: 'active',
      })
      model.bootstraps.set(deviceId, {
        deviceId,
        branch,
        generation: 1,
        status: 'active',
      })
    }
  }
  return model
}

test('W1 installs exact-device guards before removing the branch singleton', () => {
  const guard = forward.indexOf('CREATE UNIQUE INDEX offline_devices_active_device_identity_v2_uidx')
  const lookup = forward.indexOf('CREATE INDEX offline_devices_active_branch_lookup_v2_idx')
  const privateContract = forward.indexOf('CREATE FUNCTION afex_offline_authority.register_offline_device_v2')
  const drop = forward.indexOf('DROP INDEX afex_offline_authority.offline_devices_one_active_branch_uidx')
  assert.ok(guard >= 0 && lookup > guard && privateContract > lookup && drop > privateContract)
  assert.doesNotMatch(forward, /CREATE UNIQUE INDEX[\s\S]{0,180}\(tenant_id,branch_id\)[\s\S]{0,100}status='active'/)
})

test('one, five and twenty-five active devices are valid in the same branch', () => {
  for (const count of [1, 5, 25]) {
    const model = onboard(createModel(), count)
    assert.equal(model.devices.size, count)
    assert.equal([...model.devices.values()].filter((d) => d.status === 'active').length, count)
    assert.equal(new Set([...model.devices.values()].map((d) => d.branch)).size, 1)
  }
})

test('second and third device onboarding preserves the first device byte-for-byte', () => {
  const model = onboard(createModel(), 1)
  const first = JSON.stringify(model.devices.get('device-1'))
  onboard(model, 3)
  assert.equal(JSON.stringify(model.devices.get('device-1')), first)
  assert.equal(model.devices.size, 3)
  assert.equal(model.envelopes.size, 3)
  assert.equal(model.bootstraps.size, 3)
})

test('same device and keys replay idempotently while key substitution fails closed', () => {
  const model = onboard(createModel(), 1)
  const first = model.devices.get('device-1')
  onboard(model, 1)
  assert.equal(model.devices.get('device-1'), first)
  assert.throws(() => {
    const conflicting = model.devices.get('device-1')
    conflicting.wrap = 'substituted'
    onboard(model, 1)
  }, /AFEX_MULTI_DEVICE_ID_IMMUTABLE_CONFLICT/)
})

test('SQL uses per-device locks and never calls replacement in normal onboarding', () => {
  assert.match(forward, /afex-multi-device-register:'\|\|p_device_id::text/)
  assert.match(forward, /afex-multi-device-activate:'\|\|p_device_id::text/)
  assert.match(forward, /afex-pre-pin-device-v3:'\|\|p_device_id::text/)
  assert.doesNotMatch(forward, /PERFORM\s+afex_offline_authority\.replace_offline_device_v1/i)
  assert.doesNotMatch(forward, /PERFORM\s+afex_offline_authority\.transition_offline_device_v1/i)
  assert.match(forward, /'siblingDeviceMutationCount',0,'replacementRequired',false/)
})

test('every device retains independent envelope, bootstrap and namespace authority', () => {
  const model = onboard(createModel(), 25)
  assert.equal(new Set(model.envelopes.keys()).size, 25)
  assert.equal(new Set(model.bootstraps.keys()).size, 25)
  const namespaces = [...model.devices.keys()].map(
    (deviceId) => `origin-a:tenant-a:branch-a:${deviceId}`
  )
  assert.equal(new Set(namespaces).size, 25)
  assert.match(runtime, /namespaceId[\s\S]{0,320}deviceId/)
  assert.match(runtime, /crypto\.subtle\.generateKey/)
  assert.match(runtime, /crypto\.subtle\.generateKey\([\s\S]{0,180}\n\s*false,/)
})

test('PIN bootstrap and roster remain bound to exact device and branch', () => {
  assert.match(forward, /d\.device_id=p_device_id AND d\.tenant_id=p_tenant_id/)
  assert.match(forward, /d\.branch_id=p_branch_id AND d\.status='active'/)
  assert.match(forward, /read_pre_pin_employee_roster_v2\([\s\S]*p_device_id/)
  assert.match(forward, /publish_pre_pin_account_bootstrap_v2\([\s\S]*p_device_id/)
})

test('logout or restart of one modeled device leaves siblings active', () => {
  const model = onboard(createModel(), 3)
  model.devices.get('device-2').status = 'logged_out'
  assert.equal(model.devices.get('device-1').status, 'active')
  assert.equal(model.devices.get('device-3').status, 'active')
  assert.equal(model.envelopes.get('device-1').status, 'active')
  assert.equal(model.bootstraps.get('device-3').status, 'active')
})

test('W1 is aligned to live W0 relation names and active V2 bootstrap status', () => {
  const packageFiles = fs.readdirSync(packageRoot)
    .filter((name) => name !== 'W1-MANIFEST.sha256')
    .map((name) => fs.readFileSync(path.join(packageRoot, name), 'utf8'))
    .join('\n')
  const retiredEmployeeName = ['offline_employee', 'enrollments'].join('_')
  const retiredCommandName = ['offline', 'commands'].join('_')
  const retiredBootstrapStatus = ["status='", 'current', "'"].join('')
  const retiredBootstrapField = ['current', 'BootstrapCount'].join('')
  const retiredOrphanField = ['orphanCurrent', 'BootstrapCount'].join('')

  assert.doesNotMatch(packageFiles, new RegExp(retiredEmployeeName))
  assert.doesNotMatch(packageFiles, new RegExp(retiredCommandName))
  assert.doesNotMatch(packageFiles, new RegExp(retiredBootstrapStatus))
  assert.doesNotMatch(packageFiles, new RegExp(`${retiredBootstrapField}|${retiredOrphanField}`))
  assert.match(packageFiles, /offline_employee_authorities/)
  assert.match(packageFiles, /offline_command_bindings/)
  assert.match(preflight, /active_v2_bootstrap_count/)
  assert.match(preflight, /b\.status='active'/)
  assert.match(post, /orphan_active_v2_bootstrap_count/)
})

test('W1 preflight proves exact live W0 function, catalog, ACL and membership identities', () => {
  for (const marker of [
    'body_md5',
    'body_octets',
    'expected_execute_grantees',
    'required_relations',
    'relation_acl_checks',
    'expected_foreign_keys',
    'singleton_index',
    'expected_policies',
    'expected_triggers',
    'expected_memberships',
  ]) {
    assert.match(preflight, new RegExp(marker))
  }
  assert.match(preflight, /2d70f2fb4a7f1eeb165eb26db0b5913c/)
  assert.match(preflight, /e5bfbd02831e2b5ffe45fd9a6f676592/)
  assert.match(preflight, /supabase_admin/)
  assert.match(preflight, /true,false,false/)
})

test('ACL grantee boundaries normalize PostgreSQL name values to text before array equality', () => {
  const allSql = `${preflight}\n${forward}\n${post}\n${deactivate}`
  const typedBoundary =
    /CASE WHEN a\.grantee=0 THEN 'PUBLIC'::text ELSE grantee\.rolname::text END AS grantee/g
  const untypedBoundary =
    /CASE WHEN a\.grantee=0 THEN 'PUBLIC'(?!::text) ELSE grantee\.rolname END AS grantee/g
  const typedAggregate =
    /ARRAY_AGG\(a\.grantee::text ORDER BY a\.grantee::text\)/g
  const untypedAggregate =
    /ARRAY_AGG\(a\.grantee ORDER BY a\.grantee\)/g

  assert.equal([...allSql.matchAll(typedBoundary)].length, 7)
  assert.equal([...allSql.matchAll(untypedBoundary)].length, 0)
  assert.equal([...allSql.matchAll(typedAggregate)].length, 3)
  assert.equal([...allSql.matchAll(untypedAggregate)].length, 0)

  assert.equal([...preflight.matchAll(typedBoundary)].length, 2)
  assert.equal([...forward.matchAll(typedBoundary)].length, 2)
  assert.equal([...post.matchAll(typedBoundary)].length, 3)
})

test('PostgreSQL 17 relation-owner ACL includes MAINTAIN in every W1 attestation boundary', () => {
  const exactOwnerPrivileges =
    "ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]"
  const pre17OwnerPrivileges =
    "ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]"

  for (const [name, sql] of [
    ['preflight', preflight],
    ['forward W0 gate', forward],
    ['post-attestation', post],
  ]) {
    assert.equal(
      sql.split(exactOwnerPrivileges).length - 1,
      1,
      `${name} must attest the exact eight PostgreSQL 17 owner privileges once`
    )
    assert.doesNotMatch(sql, new RegExp(pre17OwnerPrivileges.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  const allSql = `${preflight}\n${forward}\n${post}\n${deactivate}`
  assert.doesNotMatch(allSql, /^\s*(?:GRANT|REVOKE)\s+MAINTAIN\b/im)
})

test('live W0 trigger inventory is the exact bidirectional four-row set at every W1 boundary', () => {
  const expectedTriggers = [
    'afex_offline_authority.offline_command_bindings|offline_command_bindings_immutable_guard|afex_offline_authority.reject_offline_command_binding_mutation_v1()',
    'afex_offline_authority.offline_device_events|offline_device_events_immutable_guard|afex_offline_authority.reject_immutable_offline_evidence_v1()',
    'afex_offline_authority.offline_employee_authorities|offline_employee_authorities_capacity_guard|afex_offline_authority.enforce_enrollment_capacity_v1()',
    'afex_offline_authority.offline_pre_pin_bootstrap_events_v2|offline_pre_pin_bootstrap_events_immutable_v2|afex_offline_authority.reject_immutable_offline_evidence_v1()',
  ].sort()
  const triggerLiteralPattern =
    /\('(afex_offline_authority\.(?:offline_device_events|offline_pre_pin_bootstrap_events_v2|offline_command_bindings|offline_employee_authorities))','(offline_[a-z0-9_]+)','(afex_offline_authority\.[a-z0-9_]+\(\))'\)/g
  const wrongCommandBindingFunction = [
    'afex_offline_authority.reject_immutable',
    'offline_evidence_v1()',
  ].join('_')
  const extractExpectedTriggers = (sql) => [...sql.matchAll(triggerLiteralPattern)]
    .map((match) => `${match[1]}|${match[2]}|${match[3]}`)
    .sort()

  for (const [name, sql] of [
    ['preflight', preflight],
    ['forward W0 gate', forward],
    ['post-attestation', post],
  ]) {
    const extracted = extractExpectedTriggers(sql)
    assert.equal(extracted.length, 4, `${name} must require all four live W0 triggers`)
    assert.deepEqual(extracted, expectedTriggers, `${name} trigger set must match live W0 exactly`)
  }

  const allAttestations = `${preflight}\n${forward}\n${post}`
  assert.equal(extractExpectedTriggers(allAttestations).some((row) =>
    row === `afex_offline_authority.offline_command_bindings|offline_command_bindings_immutable_guard|${wrongCommandBindingFunction}`
  ), false)
  assert.match(
    allAttestations,
    /offline_employee_authorities_capacity_guard','afex_offline_authority\.enforce_enrollment_capacity_v1\(\)'/
  )
  assert.match(
    preflight,
    /required_triggers_exact'[\s\S]*SELECT identity,trigger_name,function_identity FROM expected_triggers\) EXCEPT[\s\S]*AND NOT EXISTS\(\(SELECT identity,tgname,function_identity FROM trigger_rows\) EXCEPT/
  )
  assert.match(
    forward,
    /SELECT NOT EXISTS \(\(SELECT \* FROM expected\) EXCEPT \(SELECT \* FROM actual\)\)[\s\S]*AND NOT EXISTS \(\(SELECT \* FROM actual\) EXCEPT \(SELECT \* FROM expected\)\)/
  )
  assert.match(
    post,
    /trigger_exact AS \([\s\S]*SELECT NOT EXISTS \(\(SELECT \* FROM expected_triggers\) EXCEPT \(SELECT \* FROM trigger_facts\)\)[\s\S]*AND NOT EXISTS \(\(SELECT \* FROM trigger_facts\) EXCEPT \(SELECT \* FROM expected_triggers\)\)/
  )
  assert.doesNotMatch(forward, /\b(?:CREATE|DROP|ALTER)\s+TRIGGER\b/i)
})

test('foreign-key attestations preserve all twenty-one live identities including deferred NO ACTION', () => {
  const allSql = `${preflight}\n${forward}\n${post}\n${deactivate}`
  const forbiddenExpectedForeignKeys =
    /expected_foreign_keys\s*\([^)]*,\s*deferrable\s*,\s*deferred\s*\)/i
  const forbiddenInlineExpected =
    /\bexpected\s*\([^)]*constraint_name\s*,\s*deferrable\s*,\s*deferred\s*\)/i
  assert.doesNotMatch(allSql, forbiddenExpectedForeignKeys)
  assert.doesNotMatch(allSql, forbiddenInlineExpected)

  for (const [name, sql, marker] of [
    [
      'preflight',
      preflight,
      'expected_foreign_keys(identity,constraint_name,expected_deferrable,expected_initially_deferred,expected_update_action,expected_delete_action)',
    ],
    [
      'forward W0 gate',
      forward,
      'WITH expected(identity,constraint_name,expected_deferrable,expected_initially_deferred,expected_update_action,expected_delete_action)',
    ],
    [
      'post-attestation',
      post,
      'expected_foreign_keys(identity,constraint_name,expected_deferrable,expected_initially_deferred,expected_update_action,expected_delete_action)',
    ],
  ]) {
    assert.match(sql, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(sql, /condeferrable<>e\.expected_deferrable/)
    assert.match(sql, /condeferred<>e\.expected_initially_deferred/)
    assert.match(sql, /confupdtype<>e\.expected_update_action/)
    assert.match(sql, /confdeltype<>e\.expected_delete_action/)

    const foreignKeys = [...sql.matchAll(
      /\('afex_offline_authority\.[^']+','((?:offline_devices|offline_device_events|offline_key_envelopes|offline_pre_pin_bootstrap|offline_employee_authorities|offline_command_bindings)[^']*_fk)',(true|false),(true|false),'([ar])','([ar])'\)/g
    )].map((match) => ({
      constraint: match[1],
      deferrable: match[2] === 'true',
      initiallyDeferred: match[3] === 'true',
      updateAction: match[4],
      deleteAction: match[5],
    }))
    assert.equal(foreignKeys.length, 21, `${name} must attest all twenty-one live foreign keys`)

    const deferredEnvelopeScope = foreignKeys.filter(
      (row) => row.constraint === 'offline_employee_authorities_device_envelope_scope_fk'
    )
    assert.deepEqual(deferredEnvelopeScope, [{
      constraint: 'offline_employee_authorities_device_envelope_scope_fk',
      deferrable: true,
      initiallyDeferred: true,
      updateAction: 'a',
      deleteAction: 'a',
    }])
    assert.equal(foreignKeys.filter((row) =>
      !row.deferrable && !row.initiallyDeferred
      && row.updateAction === 'r' && row.deleteAction === 'r'
    ).length, 20)
  }

  assert.match(post, /foreign_key_facts AS \([\s\S]*c\.contype='f'/)
  assert.match(post, /f\.constraint_name IS NULL OR f\.contype<>'f' OR NOT f\.convalidated/)
  assert.doesNotMatch(allSql, /confupdtype<>'r'|confdeltype<>'r'/)
  assert.doesNotMatch(forward, /ALTER\s+TABLE[\s\S]{0,160}\b(?:ADD|DROP)\s+CONSTRAINT\b/i)
  assert.match(
    post,
    /NOT EXISTS \([\s\S]*FROM foreign_key_facts AS f[\s\S]*LEFT JOIN expected_foreign_keys AS e[\s\S]*WHERE e\.constraint_name IS NULL\) AS exact/
  )
  assert.match(post, /'foreign_keys_unchanged_exact',\(SELECT exact FROM foreign_keys_exact\)/)
})

test('all accepted live W0 function body identities remain bound across preflight forward and post', () => {
  const inventory = JSON.parse(fs.readFileSync(
    path.join(packageRoot, 'W1-FUNCTION-SIGNATURE-INVENTORY.json'),
    'utf8'
  ))

  assert.equal(inventory.liveW0DependencyCount, 13)
  assert.equal(inventory.liveW0Dependencies.length, 13)
  for (const dependency of inventory.liveW0Dependencies) {
    for (const [name, sql] of [
      ['preflight', preflight],
      ['forward', forward],
      ['post-attestation', post],
    ]) {
      assert.match(sql, new RegExp(dependency.normalizedBodyMd5), `${name}: ${dependency.identity}`)
      assert.match(sql, new RegExp(`['\"]?${dependency.normalizedBodyOctets}['\"]?`), `${name}: ${dependency.identity}`)
    }
  }
})

test('legacy function preservation uses the same exact thirteen-function set at all three forward gates', () => {
  const expected = [
    'afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)',
    'afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)',
    'afex_offline_authority.replace_offline_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,text)',
    'afex_offline_authority.transition_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text)',
    'afex_offline_authority.pre_pin_context_matches_v2(uuid,uuid,uuid,uuid)',
    'afex_offline_authority.provision_pre_pin_device_v2(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)',
    'afex_offline_authority.read_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid)',
    'afex_offline_authority.publish_pre_pin_account_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)',
    'afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb)',
    'public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)',
    'public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)',
    'public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb)',
    'public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)',
  ].sort()

  const extractIdentities = (segment) => [...segment.matchAll(
    /\('((?:afex_offline_authority|public)\.[^']+)'\)/g
  )].map((match) => match[1]).sort()
  const snapshotStart = forward.indexOf(
    "SELECT pg_catalog.set_config('afex.w1.legacy_functions_before',(")
  const snapshotEnd = forward.indexOf('),true);', snapshotStart)
  const compareStarts = [...forward.matchAll(
    /SELECT pg_catalog\.current_setting\('afex\.w1\.legacy_functions_before'\)::jsonb=\(/g
  )].map((match) => match.index)

  assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart)
  assert.equal(compareStarts.length, 2)
  const singletonEnd = forward.indexOf(') INTO legacy_still_exact;', compareStarts[0])
  const finalEnd = forward.indexOf(') INTO legacy_ok;', compareStarts[1])
  assert.ok(singletonEnd > compareStarts[0] && finalEnd > compareStarts[1])

  const sets = [
    extractIdentities(forward.slice(snapshotStart, snapshotEnd)),
    extractIdentities(forward.slice(compareStarts[0], singletonEnd)),
    extractIdentities(forward.slice(compareStarts[1], finalEnd)),
  ]
  for (const identities of sets) {
    assert.equal(identities.length, 13)
    assert.deepEqual(identities, expected)
  }

  const diagnostic = forward.match(
    /RAISE EXCEPTION\s+'AFEX_MULTI_DEVICE_W1_POST_ATTESTATION_FAILED:[^']+'[\s\S]*?;/
  )?.[0]
  assert.ok(diagnostic)
  assert.deepEqual(
    [...diagnostic.matchAll(/(functions_ok|acl_ok|data_ok|legacy_ok|memberships_ok|public_create_ok)=%/g)]
      .map((match) => match[1]),
    ['functions_ok', 'acl_ok', 'data_ok', 'legacy_ok', 'memberships_ok', 'public_create_ok']
  )
  const diagnosticPayload = diagnostic.slice(diagnostic.indexOf(':') + 1)
  assert.doesNotMatch(
    diagnosticPayload,
    /uuid|sha256|hash|tenant|branch|device|employee|customer|payload|pii/i
  )
})

test('singleton removal is gated by exact live W0 identity and installed guards', () => {
  const exactGate = forward.indexOf("set_config('afex.w1.live_w0_identity_gate','true',true)")
  const guardValidation = forward.indexOf('AFEX_MULTI_DEVICE_W1_SINGLETON_DROP_GATE_FAILED')
  const singletonDrop = forward.indexOf('DROP INDEX afex_offline_authority.offline_devices_one_active_branch_uidx')
  assert.ok(exactGate >= 0 && guardValidation > exactGate && singletonDrop > guardValidation)
})

test('historical explicit replacement vocabulary is context-bound and excluded from W1 onboarding', () => {
  assert.match(transport, /offline-pre-pin-device-retirement\.v2/)
  assert.match(transport, /currentBootstrapCount/)
  assert.doesNotMatch(forward, /offline-pre-pin-device-retirement\.v2|currentBootstrapCount/)
})

test('every pre-existing W1 SQL relation resolves against the W0 catalog inventory', () => {
  const w0Inventory = JSON.parse(fs.readFileSync(path.join(
    root,
    'docs/investigations/AFEX-OFFLINE-MULTI-DEVICE-CONCURRENT-W0-LIVE-CATALOG-ATTESTATION/W0-CATALOG-INVENTORY.json'
  ), 'utf8'))
  const knownRelations = new Set(Object.values(w0Inventory.relations).flat()
    .filter((identity) => typeof identity === 'string' && identity.includes('.')))
  const sql = [preflight, forward, post, deactivate].join('\n')
  const relationReferences = [...sql.matchAll(
    /\b(?:FROM|JOIN|UPDATE|INTO|ON)\s+(afex_offline_authority\.[a-z0-9_]+)/gi
  )].map((match) => match[1])
  const unresolved = [...new Set(relationReferences.filter(
    (identity) => !knownRelations.has(identity)
  ))]
  assert.deepEqual(unresolved, [])
})

test('Preview-only flag routes all four preparation operations to v3', () => {
  assert.match(transport, /process\.env\.VERCEL_ENV === 'preview'/)
  assert.match(transport, /AFEX_OFFLINE_MULTI_DEVICE_ONBOARDING_W1_ENABLED === 'true'/)
  for (const operation of [
    'device.provision',
    'employee.roster',
    'inventory.publish',
    'bootstrap.publish',
  ]) {
    assert.match(transport, new RegExp(`'${operation}'[\\s\\S]{0,180}prePinFacade`))
  }
  assert.match(transport, /!multiDeviceOnboardingW1Enabled\(\)[\s\S]{0,220}AFEX_DEVICE_ACTIVATION_AUTHORITY_INVALID/)
})

test('one preparation attempt is pinned to one exact V2 or V3 contract before every RPC', () => {
  assert.match(transport, /const PRE_PIN_ATTEMPT_CONTRACT_COOKIE = 'afex_pre_pin_attempt_contract'/)
  assert.match(
    transport,
    /const contractVersion = activePrePinContractVersion\(\)[\s\S]{0,900}response\.cookies\.set\(PRE_PIN_ATTEMPT_CONTRACT_COOKIE, contractVersion/u
  )
  assert.match(transport, /httpOnly:\s*true/u)
  assert.match(transport, /sameSite:\s*'strict'/u)
  assert.match(transport, /maxAge:\s*PRE_PIN_ATTEMPT_CONTRACT_MAX_AGE_SECONDS/u)
  const requestGuard = transport.indexOf(
    'const attemptContractVersion = request.cookies.get('
  )
  const payloadRead = transport.indexOf('const body = exactRecord(', requestGuard)
  const trustedContext = transport.indexOf(
    'const trusted = await trustedPrePinContext()',
    requestGuard
  )
  const executeCall = transport.indexOf(
    'const data = await execute(operation, payload, trusted)',
    requestGuard
  )
  assert.ok(requestGuard > 0)
  assert.ok(payloadRead > requestGuard)
  assert.ok(trustedContext > payloadRead)
  assert.ok(executeCall > trustedContext)
  assert.match(
    transport.slice(requestGuard, payloadRead),
    /attemptContractVersion !== activePrePinContractVersion\(\)[\s\S]*OFFLINE_PRE_PIN_ATTEMPT_CONTRACT_MISMATCH/u
  )
  assert.doesNotMatch(
    transport,
    /NEXT_PUBLIC_AFEX_OFFLINE_MULTI_DEVICE_ONBOARDING_W1_ENABLED/u
  )
})

test('historical replacement operations remain present but are not W1 routing targets', () => {
  assert.match(transport, /'device\.replacement\.inspect'/)
  assert.match(transport, /'device\.replacement\.retire'/)
  const mapping = JSON.parse(
    fs.readFileSync(path.join(packageRoot, 'W1-OLD-TO-NEW-CALLER-MAPPING.json'), 'utf8')
  )
  assert.equal(mapping.historicalReplacementInvokedByW1Onboarding, false)
  assert.equal(mapping.productionRoutingChanged, false)
})

test('browser roles receive no direct private or facade EXECUTE', () => {
  for (const sql of [forward, post]) {
    assert.match(sql, /PUBLIC[\s\S]{0,80}anon[\s\S]{0,80}authenticated/)
  }
  assert.match(forward, /TO afex_function_owner;/)
  assert.match(forward, /TO service_role;/)
  assert.doesNotMatch(forward, /GRANT EXECUTE[\s\S]{0,500}\bTO\s+(?:PUBLIC|anon|authenticated)\b/i)
})

test('preflight, post-attestation and deactivation are bounded and data-preserving', () => {
  assert.match(preflight, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/)
  assert.match(preflight, /ROLLBACK;\s*$/)
  assert.match(post, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/)
  assert.match(post, /ROLLBACK;\s*$/)
  assert.match(deactivate, /deviceStatusChanged',false/)
  assert.match(deactivate, /singletonIndexRestored',false/)
  assert.doesNotMatch(deactivate, /\b(?:DELETE|TRUNCATE)\b/i)
})

test('existing rows are protected by transaction-local aggregate identities', () => {
  for (const relation of ['offline_devices', 'offline_key_envelopes', 'offline_pre_pin_bootstrap_authorities_v2']) {
    assert.match(forward, new RegExp(`${relation}[\\s\\S]{0,1800}sha256`))
  }
  assert.match(forward, /AFEX_MULTI_DEVICE_W1_POST_ATTESTATION_FAILED/)
  assert.doesNotMatch(forward, /UPDATE\s+afex_offline_authority\.offline_devices[\s\S]{0,100}(?:WHERE\s+tenant_id|WHERE\s+branch_id)/i)
})

test('installer authority is transaction-bounded and baseline-restored', () => {
  assert.match(forward, /GRANTED BY CURRENT_USER/)
  assert.match(forward, /REVOKE afex_offline_authority_owner FROM postgres[\s\S]{0,80}GRANTED BY CURRENT_USER RESTRICT/)
  assert.match(forward, /REVOKE afex_function_owner FROM postgres[\s\S]{0,80}GRANTED BY CURRENT_USER RESTRICT/)
  assert.match(forward, /memberships_before/)
  assert.match(forward, /function_owner_create_before/)
})

test('W1 adds no effect ledger and preserves provider/external-effect closure', () => {
  assert.doesNotMatch(forward, /CREATE\s+TABLE[\s\S]{0,80}(?:effect|outbox)/i)
  assert.match(coreBridge, /paymentProviderAction:\s*false/)
  assert.match(coreBridge, /externalEffects:\s*false/)
  assert.match(coreBridge, /dispatch:\s*false/)
  assert.doesNotMatch(forward, /order_create|inventory_conflict|provider|whatsapp/i)
})

test('W1 has no fixed UUID allowlist, device cap or W2 claim', () => {
  const all = `${forward}\n${transport}`
  assert.doesNotMatch(all, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  assert.doesNotMatch(forward, /device_count\s*[<>]=?\s*(?:1|5|25)/i)
  assert.doesNotMatch(forward, /concurrent[_ ]checkout[_ ]ready/i)
})
