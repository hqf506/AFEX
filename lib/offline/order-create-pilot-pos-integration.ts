'use client'

import { APP_COMPAT_SAFETY_FLAGS } from '@/lib/offline/application-compatibility'
import type { PosPaymentMethod } from '@/lib/invoices/payment-method'

export const OFFLINE_ORDER_CREATE_POS_INTEGRATION = Object.freeze({
  pilotCommandType: 'order.create' as const,
  offlineOrderCreate: APP_COMPAT_SAFETY_FLAGS.offlineOrderCreate,
  providerActions: false,
  externalEffects: false,
  maximumPinFailures: 5,
  preservePendingCommandsOnExplicitLogout: true,
  requireSameAccountOnlineRecovery: true,
  adminDashboardOfflineBehavior: false,
} as const)

export const OFFLINE_ORDER_CREATE_PILOT_PAYMENT_METHODS = Object.freeze([
  'mada',
  'cash',
  'visa',
  'cod',
  'card',
  'bank_transfer',
  'transfer',
  'on_delivery',
] as const)

const OFFLINE_ORDER_CREATE_PILOT_PAYMENT_METHOD_SET = new Set<string>(
  OFFLINE_ORDER_CREATE_PILOT_PAYMENT_METHODS
)

type OfflineCheckoutCandidate = Readonly<{
  paymentMethod: PosPaymentMethod
  itemCount: number
  branchId: string | null
  actualPosEmployeeId: string | null
}>

export function resolveOfflineOrderCreatePilotCheckout(
  input: OfflineCheckoutCandidate
) {
  if (!OFFLINE_ORDER_CREATE_POS_INTEGRATION.offlineOrderCreate) {
    return Object.freeze({
      handled: false as const,
      classification: 'OFFLINE_ORDER_CREATE_PILOT_DISABLED' as const,
      providerActions: 0 as const,
      externalEffects: 0 as const,
    })
  }
  if (
    !input.branchId ||
    !input.actualPosEmployeeId ||
    input.itemCount < 1 ||
    !OFFLINE_ORDER_CREATE_PILOT_PAYMENT_METHOD_SET.has(input.paymentMethod)
  ) {
    return Object.freeze({
      handled: true as const,
      queued: false as const,
      classification: 'OFFLINE_ORDER_CREATE_PILOT_LOCAL_AUTHORITY_INVALID' as const,
      providerActions: 0 as const,
      externalEffects: 0 as const,
    })
  }
  // The encrypted Phase 1/3 repository remains the sole future persistence path.
  // It is deliberately unreachable until the already-frozen authority flags are
  // enabled after manual Activation and qualification.
  return Object.freeze({
    handled: true as const,
    queued: false as const,
    classification: 'OFFLINE_ORDER_CREATE_PILOT_AUTHORITY_LOCKED' as const,
    providerActions: 0 as const,
    externalEffects: 0 as const,
  })
}

export async function notifyOfflineOrderCreatePilotLogout(input: Readonly<{
  operationId: string
  deviceId: string
  evidenceSha256: string
}>) {
  if (!OFFLINE_ORDER_CREATE_POS_INTEGRATION.offlineOrderCreate) {
    return Object.freeze({
      notified: false as const,
      classification: 'OFFLINE_ORDER_CREATE_PILOT_DISABLED' as const,
    })
  }
  const response = await fetch('/api/pos/offline-pilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'account.logout', payload: input }),
  })
  if (!response.ok) {
    throw new Error('OFFLINE_ORDER_CREATE_PILOT_LOGOUT_AUTHORITY_FAILED')
  }
  return Object.freeze({ notified: true as const })
}
