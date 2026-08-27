import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')
const read = (relative) => readFile(path.join(root, relative), 'utf8')
const sqlRoot =
  'docs/investigations/AFEX-POS-OFFLINE-PRE-PIN-PROVISIONING-V2'

test('successful POS login always enters the real preparation route before PIN', async () => {
  const login = await read('app/pos/login/page.tsx')
  assert.equal((login.match(/router\.replace\('\/pos\/offline-preparation'\)/gu) ?? []).length, 2)
  assert.doesNotMatch(login, /router\.replace\('\/pos\/employee-pin'\)/u)
})

test('preparation UI exposes exact Arabic title, real progress and fail-closed actions', async () => {
  const page = await read('app/pos/offline-preparation/page.tsx')
  assert.match(page, /جاري تجهيز نقطة البيع للعمل دون اتصال/u)
  assert.match(page, /role="progressbar"/u)
  assert.match(page, /aria-valuenow/u)
  assert.match(page, /إعادة المحاولة/u)
  assert.match(page, /العودة إلى تسجيل الدخول/u)
  assert.match(page, /prepareCompleteOfflineRuntime/u)
  assert.doesNotMatch(page, /setInterval|fake|mock/iu)
})

test('runtime progress uses only the seven approved completed-stage boundaries', async () => {
  const runtime = await read('lib/offline/complete-runtime.ts')
  for (const boundary of [0, 10, 20, 35, 50, 75, 90, 100]) {
    assert.match(runtime, new RegExp(`progress\\(${boundary},`, 'u'))
  }
  const firstHundred = runtime.indexOf("progress(100, 'اكتمل")
  const integrityGate = runtime.indexOf('OFFLINE_PERSISTENCE_INTEGRITY_FAILED')
  assert.ok(firstHundred > integrityGate)
})

test('pre-PIN route derives scope from verified server context and accepts no authority UUIDs from browser', async () => {
  const transport = await read('lib/server/offline/pre-pin-provisioning.ts')
  assert.match(transport, /requireVerifiedAuthContext\(supabase\)/u)
  assert.match(transport, /\.from\('profiles'\)/u)
  assert.match(transport, /OFFLINE_PRE_PIN_EXACT_BRANCH_REQUIRED/u)
  assert.doesNotMatch(transport, /payload\.(?:tenantId|branchId|accountId|employeeId|posActorSessionId)/u)
  assert.doesNotMatch(transport, /NEXT_PUBLIC_|service_role(?:_key|Key)/iu)
})

test('global flag is the only activation configuration and static UUID allowlists remain absent', async () => {
  const sources = await Promise.all([
    read('lib/server/offline/pre-pin-provisioning.ts'),
    read('lib/server/offline/order-create-pilot-transport.ts'),
  ]).then((parts) => parts.join('\n'))
  assert.match(sources, /AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED/u)
  for (const name of ['ACCOUNT_ID', 'TENANT_ID', 'BRANCH_ID', 'DEVICE_ID', 'EMPLOYEE_ID']) {
    assert.doesNotMatch(sources, new RegExp(`AFEX_OFFLINE_ORDER_CREATE_PILOT_${name}`, 'u'))
  }
})

test('global kill switch preserves the existing Online PIN path without claiming Offline readiness', async () => {
  const page = await read('app/pos/offline-preparation/page.tsx')
  assert.match(page, /OFFLINE_PILOT_DISABLED/u)
  assert.match(page, /router\.replace\('\/pos\/employee-pin'\)/u)
  assert.match(
    page,
    /OFFLINE_PILOT_DISABLED'[\s\S]{0,240}router\.replace\('\/pos\/employee-pin'\)/u
  )
})

test('managed device material is stable and uses nonextractable private Web Crypto keys', async () => {
  const runtime = await read('lib/offline/complete-runtime.ts')
  assert.match(runtime, /readOfflineRuntimeMaterial/u)
  assert.match(runtime, /putOfflineRuntimeMaterial/u)
  assert.match(runtime, /RSA-OAEP/u)
  assert.match(runtime, /modulusLength:\s*3072/u)
  assert.match(runtime, /ECDSA/u)
  assert.match(runtime, /namedCurve:\s*'P-256'/u)
  assert.match(runtime, /false,\s*\['wrapKey', 'unwrapKey'\]/u)
  assert.match(runtime, /false,\s*\['sign', 'verify'\]/u)
  assert.match(runtime, /RUNTIME_MATERIAL_PREFIX/u)
  assert.match(runtime, /primarySubjectId:[\s\S]*tenantId:[\s\S]*branchId:/u)
  assert.match(runtime, /putOfflineRuntimeAccessState/u)
})

test('encrypted dataset and outbox persist through IndexedDB without PIN-derived dataset keys', async () => {
  const [runtime, phase1, phase3] = await Promise.all([
    read('lib/offline/complete-runtime.ts'),
    read('lib/offline/phase1.ts'),
    read('lib/offline/phase3.ts'),
  ])
  assert.match(runtime, /EncryptedOfflineRepository/u)
  assert.match(runtime, /Phase2DatasetRepository/u)
  assert.match(runtime, /Phase3CommandRepository/u)
  assert.match(phase1, /AES-GCM/u)
  assert.match(phase3, /encryptedPayload/u)
  assert.doesNotMatch(runtime, /derive.*(?:dek|dataset).*pin/iu)
})

test('explicit logout clears bootstrap access but preserves pending encrypted evidence', async () => {
  const phase1 = await read('lib/offline/phase1.ts')
  assert.match(phase1, /clearOfflineBootstrapReady/u)
  assert.match(phase1, /lockOfflineRuntime\('logout-start'\)/u)
  assert.match(phase1, /markOfflineRuntimeAccessLoggedOut/u)
  assert.match(phase1, /loggedOut:\s*true/u)
  assert.match(phase1, /primaryAuthRetained:\s*false/u)
  assert.doesNotMatch(phase1, /delete.*commandOutbox/iu)
})

test('employee PIN supports online enrollment and offline verifier selection without primary authentication substitution', async () => {
  const [pinPage, runtime] = await Promise.all([
    read('app/pos/employee-pin/page.tsx'),
    read('lib/offline/complete-runtime.ts'),
  ])
  assert.match(pinPage, /verifyOfflineEmployeePin/u)
  assert.match(pinPage, /enrollOnlineEmployeeForOffline/u)
  assert.match(runtime, /PBKDF2/u)
  assert.match(runtime, /600_000/u)
  assert.match(runtime, /OFFLINE_EMPLOYEE_SUBSTITUTION_REJECTED/u)
  assert.match(runtime, /primaryAuthenticatedSubjectId/u)
  assert.match(runtime, /const operation = existing \? 'employee\.replace_pin' : 'employee\.enroll'/u)
  assert.doesNotMatch(runtime, /!runtime\.roster\.some\(\(entry\) => entry\.employeeId === employee\.id\)/u)
})

test('post-PIN enrollment creates the existing actor-bound v1 bootstrap before dispatch', async () => {
  const runtime = await read('lib/offline/complete-runtime.ts')
  assert.match(runtime, /operation:\s*'online\.bootstrap'/u)
  assert.match(runtime, /OFFLINE_ACTOR_BOOTSTRAP_FAILED/u)
  assert.ok(runtime.indexOf("operation: 'online.bootstrap'") < runtime.indexOf("source: 'online-pos-actor-session'"))
})

test('actual checkout caller enqueues an immutable local order and never reports Online business success', async () => {
  const [hook, integration, runtime] = await Promise.all([
    read('hooks/use-invoice-checkout.ts'),
    read('lib/offline/order-create-pilot-pos-integration.ts'),
    read('lib/offline/complete-runtime.ts'),
  ])
  assert.match(hook, /navigator\.onLine === false/u)
  assert.match(hook, /await resolveOfflineOrderCreatePilotCheckout/u)
  assert.match(integration, /await enqueueOfflineOrderCreate/u)
  assert.match(runtime, /commands\.enqueue/u)
  assert.match(runtime, /state:\s*'pending_sync'/u)
})

test('offline order creation binds the trusted customer record version captured Online', async () => {
  const [customerRoute, customerProfileRoute, customerDraft, hook, runtime, customerStep] =
    await Promise.all([
      read('app/api/customers/route.ts'),
      read('app/api/customers/[customerId]/route.ts'),
      read('lib/invoices/customer.ts'),
      read('hooks/use-invoice-checkout.ts'),
      read('lib/offline/complete-runtime.ts'),
      read('components/invoice-customer-step.tsx'),
    ])
  assert.match(customerRoute, /lookup_customer_phone_identity_v1/u)
  assert.match(customerProfileRoute, /lookup_customer_phone_identity_v1/u)
  assert.match(customerDraft, /customerRecordVersion/u)
  assert.match(hook, /customerRecordVersion/u)
  assert.match(runtime, /expected_record_version:\s*input\.customerRecordVersion/u)
  assert.doesNotMatch(runtime, /expected_record_version:\s*1[,\s]/u)
  assert.match(customerStep, /setSelectedCustomerRecordVersion\(storedCustomer\.customerRecordVersion\)/u)
  assert.match(customerStep, /يجب تحديث بيانات العميل عبر الإنترنت مرة واحدة قبل استخدامه دون اتصال/u)
})

test('all eight payment methods remain distinct and provider execution remains impossible', async () => {
  const [payment, runtime, compat] = await Promise.all([
    read('lib/invoices/payment-method.ts'),
    read('lib/offline/complete-runtime.ts'),
    read('lib/offline/application-compatibility.ts'),
  ])
  for (const method of ['mada','cash','visa','cod','card','bank_transfer','transfer','on_delivery']) {
    assert.match(payment, new RegExp(`'${method}'`, 'u'))
    assert.match(await read('lib/offline/phase3.ts'), new RegExp(`'${method}'`, 'u'))
  }
  assert.match(compat, /paymentProviderAction:\s*false/u)
  assert.match(compat, /externalEffects:\s*false/u)
  assert.match(runtime, /never_charge_or_invoke_provider/u)
  assert.match(runtime, /completeLocalEmployeePaymentAttestation/u)
})

test('local inventory uses pending plus syncing commitments and exact zero/insufficient messages', async () => {
  const [runtime, hook] = await Promise.all([
    read('lib/offline/complete-runtime.ts'),
    read('hooks/use-invoice-checkout.ts'),
  ])
  assert.match(runtime, /\['pending', 'syncing'\]/u)
  assert.match(runtime, /Math\.max\(0,/u)
  assert.match(hook, /نفدت الكمية المتاحة وفق آخر تحديث للمخزون/u)
  assert.match(hook, /الكمية المتاحة غير كافية\. المتاح حاليًا/u)
})

test('idempotency stabilizes the local receipt and rejects same key with a changed payload', async () => {
  const runtime = await read('lib/offline/complete-runtime.ts')
  assert.match(runtime, /createPhase3CommandIdentity/u)
  assert.match(runtime, /submissionHash/u)
  assert.match(runtime, /putEncryptedDraftIfAbsent/u)
  assert.match(runtime, /status:\s*'preparing'/u)
  assert.match(runtime, /status:\s*'complete'/u)
  assert.match(runtime, /stable-local-pending-receipt/u)
  assert.match(runtime, /OFFLINE_IDEMPOTENCY_PAYLOAD_CONFLICT/u)
  assert.match(runtime, /readCommandIdentityByDeduplication/u)
  assert.match(runtime, /excludedLocalCommandId/u)
  assert.match(runtime, /status:\s*'preparing'/u)
})

test('reconnect synchronization is bounded, validates fresh actor authority and persists receipt before synced state', async () => {
  const runtime = await read('lib/offline/complete-runtime.ts')
  assert.match(runtime, /MAX_SYNC_BATCH = 10/u)
  assert.match(runtime, /order\.create\.resolve_and_acquire/u)
  assert.match(runtime, /markSyncing/u)
  assert.match(runtime, /receiptReference/u)
  assert.ok(runtime.indexOf("'stable-server-receipt'") < runtime.lastIndexOf('markSynced'))
  assert.match(runtime, /restorePendingAfterRetryableFailure/u)
  assert.match(runtime, /markSyncConflict/u)
})

test('reconnect handler runs one client batch and service worker never dispatches', async () => {
  const [registration, sw, phase3, runtime] = await Promise.all([
    read('components/pos-offline-shell-registration.tsx'),
    read('public/sw.js'),
    read('lib/offline/phase3.ts'),
    read('lib/offline/complete-runtime.ts'),
  ])
  assert.match(registration, /installOfflineReconnectSynchronization/u)
  assert.match(registration, /hasOfflineBootstrapReadyMarker/u)
  assert.match(registration, /hasPosLoggedOut/u)
  assert.match(runtime, /readActivePosEmployee/u)
  assert.match(runtime, /status:\s*'actor-required'/u)
  assert.match(runtime, /await actorAuthority\(runtime, employee\.id\)/u)
  assert.doesNotMatch(sw, /offline-pilot|resolve_and_acquire|commandOutbox/u)
  assert.match(phase3, /serviceWorkerDispatch:\s*false/u)
})

test('service worker caches only POS shell/static assets and excludes APIs, login, Admin and Dashboard', async () => {
  const sw = await read('public/sw.js')
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/u)
  assert.match(sw, /request\.mode === 'navigate'/u)
  assert.match(sw, /!url\.pathname\.startsWith\('\/pos\/login'\)/u)
  assert.doesNotMatch(sw, /\/admin|\/dashboard/u)
  assert.match(sw, /\/_next\/static\//u)
})

test('Admin and Dashboard import no Offline runtime or outbox business caller', async () => {
  const shell = await read('components/pos-shell-layout.tsx')
  const registration = await read('components/pos-offline-shell-registration.tsx')
  assert.match(shell, /PosOfflineShellRegistration/u)
  assert.match(registration, /scope:\s*'\/pos\/'/u)
})

test('pre-PIN SQL is additive, v2, Auth-bound and contains no order acquisition', async () => {
  const sql = await read(`${sqlRoot}/01-ADD-PRE-PIN-PROVISIONING-V2.sql`)
  assert.match(sql, /afex_current_auth_session_matches_v1/u)
  assert.match(sql, /offline_pre_pin_bootstrap_authorities_v2/u)
  assert.match(sql, /selectedEmployeeId',NULL/u)
  assert.match(sql, /orderAcquisitionAuthorized',false/u)
  assert.doesNotMatch(sql, /CREATE FUNCTION[^\n]*acquire_offline_order/iu)
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|FUNCTION|SCHEMA)/iu)
})

test('pre-PIN SQL exposes exactly four service facades and no browser EXECUTE', async () => {
  const sql = await read(`${sqlRoot}/01-ADD-PRE-PIN-PROVISIONING-V2.sql`)
  const facades = new Set(
    [...sql.matchAll(/CREATE FUNCTION public\.(afex_offline_server_pre_pin_[a-z_]+_v2)/gu)]
      .map((match) => match[1])
      .filter((name) => name !== 'afex_offline_server_pre_pin_context_matches_v2')
  )
  assert.equal(facades.size, 4)
  assert.match(sql, /TO service_role;/u)
  assert.match(sql, /FROM PUBLIC,anon,authenticated,service_role;/u)
  assert.match(sql, /SET search_path=pg_catalog/u)
  assert.doesNotMatch(sql, /CREATE FUNCTION public\.afex_offline_server_pre_pin_context_matches_v2/u)
  assert.match(sql, /CREATE FUNCTION afex_offline_authority\.pre_pin_context_matches_v2/u)
})

test('pre-PIN roster contains only eligible enrolled authorities and honest verifier metadata', async () => {
  const [sql, runtime] = await Promise.all([
    read(`${sqlRoot}/01-ADD-PRE-PIN-PROVISIONING-V2.sql`),
    read('lib/offline/complete-runtime.ts'),
  ])
  assert.match(sql, /e\.status='active' AND e\.revoked_at IS NULL/u)
  assert.match(sql, /e\.revocation_generation=d\.revocation_generation/u)
  assert.match(sql, /e\.local_lock_state='unlocked'/u)
  assert.match(sql, /e\.allowed_command_types=ARRAY\['order\.create'\]::text\[\]/u)
  assert.match(sql, /employee_count>25/u)
  assert.doesNotMatch(sql, /employee_count<1/u)
  assert.match(sql, /'containsPlaintextPin',false/u)
  assert.match(sql, /'containsOfflinePinVerifier',true/u)
  assert.doesNotMatch(sql, /containsOperationalPosPinHash/u)
  assert.match(runtime, /pinVerifierAlgorithm !== 'PBKDF2-HMAC-SHA256'/u)
  assert.match(runtime, /pinVerifierIterations !== 600000/u)
  assert.match(runtime, /value\.enrolledEmployeeCount !== value\.employees\.length/u)
})

test('pre-PIN device hash inputs are semantically bound and obsolete package input is removed only from device operation', async () => {
  const [sql, transport, runtime] = await Promise.all([
    read(`${sqlRoot}/01-ADD-PRE-PIN-PROVISIONING-V2.sql`),
    read('lib/server/offline/pre-pin-provisioning.ts'),
    read('lib/offline/complete-runtime.ts'),
  ])
  assert.match(sql, /p_wrap_public_key_jwk->>'n'/u)
  assert.match(sql, /AFEX_PRE_PIN_DEVICE_PUBLIC_KEY_HASH_MISMATCH/u)
  assert.doesNotMatch(sql, /provision_pre_pin_device_v2\([\s\S]{0,700}p_package_sha256/u)
  assert.doesNotMatch(transport, /'device\.provision':[\s\S]{0,360}'packageSha256'/u)
  assert.doesNotMatch(runtime, /postPreparation\('device\.provision',[\s\S]{0,520}packageSha256/u)
  assert.match(transport, /'bootstrap\.publish':[\s\S]{0,260}'packageSha256'/u)
})

test('pre-PIN bootstrap replay returns immutable stored disposition only after fresh authority checks', async () => {
  const sql = await read(`${sqlRoot}/01-ADD-PRE-PIN-PROVISIONING-V2.sql`)
  assert.match(sql, /result_disposition jsonb NOT NULL/u)
  assert.match(sql, /UNIQUE \(operation_id\)/u)
  assert.match(sql, /pg_advisory_xact_lock/u)
  assert.ok(
    sql.indexOf('afex_current_auth_session_matches_v1') <
      sql.indexOf('RETURN prior_event.result_disposition')
  )
  assert.match(sql, /AFEX_PRE_PIN_BOOTSTRAP_OPERATION_CONFLICT/u)
  assert.match(sql, /INSERT INTO afex_offline_authority\.offline_pre_pin_bootstrap_events_v2[\s\S]*result_disposition/u)
})

test('pre-PIN owner and ACL lifecycle is temporary, private-first and fail-before-commit', async () => {
  const [sql, rollback] = await Promise.all([
    read(`${sqlRoot}/01-ADD-PRE-PIN-PROVISIONING-V2.sql`),
    read(`${sqlRoot}/90-DEACTIVATE-PRE-PIN-PROVISIONING-V2.sql`),
  ])
  assert.match(sql, /GRANT CREATE ON SCHEMA public TO afex_function_owner/u)
  assert.match(sql, /REVOKE CREATE ON SCHEMA public FROM afex_function_owner/u)
  assert.ok(sql.indexOf('REVOKE CREATE ON SCHEMA public') < sql.lastIndexOf('COMMIT;'))
  assert.match(sql, /NOT pg_catalog\.has_schema_privilege\('afex_function_owner','public','CREATE'\)/u)
  assert.doesNotMatch(sql, /pg_catalog\.coalesce/iu)
  assert.match(rollback, /SET LOCAL ROLE afex_function_owner/u)
  assert.match(rollback, /REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER/u)
  assert.match(rollback, /deactivate_membership/u)
})

test('pre-PIN SQL accepts every application POS account role without browser authority', async () => {
  const sql = await read('docs/investigations/AFEX-POS-OFFLINE-PRE-PIN-PROVISIONING-V2/01-ADD-PRE-PIN-PROVISIONING-V2.sql')
  assert.match(
    sql,
    /p\.role IN \('owner','admin','manager','employee','cashier'\)/u
  )
  assert.doesNotMatch(sql, /TO\s+(?:PUBLIC|anon|authenticated)\s*;/iu)
})

test('preflight, forward and deactivation are complete bounded transactions', async () => {
  const [preflight, forward, rollback] = await Promise.all([
    read(`${sqlRoot}/00-READ-ONLY-PREFLIGHT.sql`),
    read(`${sqlRoot}/01-ADD-PRE-PIN-PROVISIONING-V2.sql`),
    read(`${sqlRoot}/90-DEACTIVATE-PRE-PIN-PROVISIONING-V2.sql`),
  ])
  assert.match(preflight, /BEGIN TRANSACTION READ ONLY/u)
  assert.match(preflight, /ROLLBACK;/u)
  assert.equal((forward.match(/^BEGIN;$/gmu) ?? []).length, 1)
  assert.equal((forward.match(/^COMMIT;$/gmu) ?? []).length, 1)
  assert.match(forward, /server_version_num'\)\s*<>\s*'170006'/u)
  assert.match(rollback, /REVOKE EXECUTE ON FUNCTION/u)
  assert.doesNotMatch(rollback, /^\s*(?:DELETE|TRUNCATE|DROP)\b/gimu)
})

test('temporary installer SET memberships are transaction-bounded and restored', async () => {
  const sql = await read(`${sqlRoot}/01-ADD-PRE-PIN-PROVISIONING-V2.sql`)
  for (const role of ['afex_offline_authority_owner', 'afex_function_owner']) {
    assert.match(sql, new RegExp(`GRANT ${role} TO postgres[\\s\\S]*SET TRUE`, 'u'))
    assert.match(sql, new RegExp(`REVOKE ${role} FROM postgres GRANTED BY CURRENT_USER`, 'u'))
  }
  assert.match(sql, /m\.set_option/u)
})

test('one active managed device, roster limit and deterministic device replay remain database enforced', async () => {
  const [sql, invariant] = await Promise.all([
    read(`${sqlRoot}/01-ADD-PRE-PIN-PROVISIONING-V2.sql`),
    read('docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-SQL-AUTHORITY-FINAL-CANDIDATE/13-INDEXES-CONSTRAINTS-AND-INVARIANTS.sql'),
  ])
  assert.match(invariant, /offline_devices_one_active_branch_uidx/u)
  assert.match(sql, /STABLE_IDENTITY_CONFLICT/u)
  assert.match(sql, /ROSTER_COUNT_EXCEEDS_25/u)
  assert.match(sql, /result_disposition|operation_id/iu)
})

test('no plaintext PIN, card secret, service credential or provider token is persisted', async () => {
  const sources = await Promise.all([
    read('lib/offline/complete-runtime.ts'),
    read('lib/server/offline/pre-pin-provisioning.ts'),
    read('public/sw.js'),
  ]).then((parts) => parts.join('\n'))
  assert.doesNotMatch(sources, /(?:cardNumber|cvv|cvc|cardPin|providerToken)\s*:/u)
  assert.doesNotMatch(sources, /SUPABASE_SERVICE_ROLE_KEY/u)
  assert.doesNotMatch(sources, /localStorage\.setItem\([^\n]*(?:pin|payload)/iu)
})
