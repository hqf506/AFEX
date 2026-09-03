import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [adapter, route, flags, checkout, checkoutIdentity, customers, customerRoute, modal] = await Promise.all([
  read('lib/server/core-v2/atomic-order.ts'),
  read('app/api/orders/route.ts'),
  read('lib/core-v2-flags.ts'),
  read('hooks/use-invoice-checkout.ts'),
  read('lib/pos-checkout-identity.ts'),
  read('lib/customers.ts'),
  read('app/api/customers/route.ts'),
  read('components/pos-add-customer-modal.tsx'),
])

const checks = [
  ['server-only boundary', adapter.startsWith("import 'server-only'")],
  ['flag defaults closed', flags.includes("process.env[name] === 'true'")],
  ['dedicated flag', flags.includes('AFEX_CORE_V2_ORDER_EXECUTION_ENABLED')],
  ['trusted actor', route.includes('actorId: auth.user.id')],
  ['trusted tenant', route.includes('tenantId: profileTenantId')],
  ['trusted branch', route.includes('branchId,')],
  ['selected customer propagated', checkout.includes('customerId,') && route.includes('customerId,')],
  ['selected customer exact match', adapter.includes('customer.customer_id === input.customerId')],
  ['legacy ambiguity remains closed', adapter.includes("!input.customerId && customers[0].resolution_status !== 'RESOLVED'")],
  ['stable request id', checkout.includes('acquirePosCheckoutIdentity') && checkoutIdentity.includes('sessionStorage')],
  ['submit lock', checkout.includes('if (loading) return')],
  ['acquire facade', adapter.includes("'acquire_atomic_order_command_result_v1'")],
  ['claim', adapter.includes("'claim_atomic_order_command_v1'")],
  ['token execute', adapter.includes("'execute_atomic_order_command_v1'") && adapter.includes('t: claimed.claimToken')],
  ['transport replay', adapter.includes("'replay_atomic_order_command_v1'")],
  ['no retry rpc', !adapter.includes('authorize_atomic_order_retry_v1')],
  ['no legacy adapter fallback', !adapter.includes('create_invoice_with_items_safe')],
  ['conflict disposition', adapter.includes("acquiredResult === 'fingerprint_conflict'")],
  ['in-progress disposition', adapter.includes("acquiredResult === 'in_progress'")],
  ['closed acquisition errors', adapter.includes("type AcquisitionFailureCode = 'UNAUTHORIZED' | 'INTERNAL_ERROR'")],
  ['acquisition error preserved', adapter.includes('errorCode: acquisitionFailureCode(acquired.errorCode)')],
  ['undefined acquisition error impossible', adapter.includes("return value === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'INTERNAL_ERROR'")],
  ['safe acquisition log', route.includes("phase: 'acquisition'") && route.includes('classification: coreResult.errorCode')],
  ['safe SQLSTATE validation', adapter.includes("/^[0-9A-Z]{5}$/.test(value)")],
  ['closed failure phase validation', adapter.includes('ACQUISITION_FAILURE_PHASES.has')],
  ['safe diagnostics logged server-side', route.includes('safeSqlState: coreResult.safeSqlState') && route.includes('failurePhase: coreResult.failurePhase')],
  ['internal failure support reference', route.includes('مرجع الدعم: ${clientIdempotencyKey}')],
  ['reconciliation disposition', adapter.includes("kind: 'reconciliation'")],
  ['replay suppresses follow-up', route.includes('if (coreResult.duplicate)')],
  ['replay suppresses duplicate print', checkout.includes('shouldAutoPrintThermal: createOrderResult.duplicate !== true')],
  ['closed Arabic disposition surfaced', checkout.includes('createOrderResult?.message')],
  ['tenant phone identity', customerRoute.includes(".eq('normalized_phone', normalizedPhone)")],
  ['atomic customer creation', customerRoute.includes(".rpc('create_customer_with_phone_identity_v1'")],
  ['ambiguous phone not canonicalized', customers.includes('AMBIGUOUS') || customerRoute.includes('duplicatePhoneCandidates')],
  [
    'classified customer failure message',
    customers.includes('CUSTOMER_CREATE_FAILURE_MESSAGES') &&
      customers.includes('resolveCustomerCreateFailure') &&
      modal.includes('resolveCustomerCreateFailure') &&
      modal.includes('setError(failure.message)'),
  ],
  ['no direct secret response', !adapter.includes('SUPABASE_SERVICE_ROLE_KEY')],
  ['feature off legacy branch', route.includes('} else {') && route.includes('serviceSupabase.rpc(rpcName, rpcPayload)')],
]

for (const [name, passed] of checks) assert.equal(passed, true, name)
console.log(`Core V2 order integration checks: ${checks.length}/${checks.length} PASS`)
