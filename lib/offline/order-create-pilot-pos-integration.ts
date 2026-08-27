'use client'

import { APP_COMPAT_SAFETY_FLAGS } from '@/lib/offline/application-compatibility'
import {
  enqueueOfflineOrderCreate,
  type OfflineCheckoutInput,
} from '@/lib/offline/complete-runtime'

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

type OfflineCheckoutCandidate = OfflineCheckoutInput

export async function resolveOfflineOrderCreatePilotCheckout(
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
    !input.employee?.id ||
    input.items.length < 1 ||
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
  try {
    const result = await enqueueOfflineOrderCreate(input)
    return Object.freeze({
      handled: true as const,
      queued: true as const,
      classification: result.duplicate
        ? ('OFFLINE_ORDER_CREATE_DUPLICATE_RECEIPT' as const)
        : ('OFFLINE_ORDER_CREATE_QUEUED' as const),
      duplicate: result.duplicate,
      receipt: result.receipt,
      providerActions: 0 as const,
      externalEffects: 0 as const,
    })
  } catch (error) {
    return Object.freeze({
      handled: true as const,
      queued: false as const,
      classification:
        error instanceof Error && error.message
          ? error.message
          : 'OFFLINE_ORDER_CREATE_PILOT_LOCAL_AUTHORITY_INVALID',
      providerActions: 0 as const,
      externalEffects: 0 as const,
    })
  }
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
