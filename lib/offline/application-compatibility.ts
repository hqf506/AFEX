export const APP_COMPAT_CLIENT_FLAGS = Object.freeze({
  profileCallerMigration:
    process.env.NEXT_PUBLIC_AFEX_PROFILE_PRESENTATION_MIGRATION === 'true',
  syncStatusUi:
    process.env.NEXT_PUBLIC_AFEX_OFFLINE_SYNC_STATUS_UI === 'true',
})

export const APP_COMPAT_SERVER_FLAGS = Object.freeze({
  profilePresentationRoute: true,
  inventoryHistoryV2:
    process.env.AFEX_INVENTORY_HISTORY_CONTRACT_V2 === 'true',
})

export const APP_COMPAT_SAFETY_FLAGS = Object.freeze({
  localInventoryBusinessEnforcement: false,
  sensitiveCacheIngestion: false,
  persistentUnwrap: true,
  productionOutboxPersistence: true,
  dispatch: true,
  replay: true,
  offlineOrderInterception: true,
  offlineOrderCreate: true,
  paymentProviderAction: false,
  externalEffects: false,
})

export const ZERO_LOCAL_STOCK_MESSAGE =
  'نفدت الكمية المتاحة وفق آخر تحديث للمخزون. يرجى الاتصال بالإنترنت لتحديث المخزون والتحقق من الرصيد.'

export const INSUFFICIENT_LOCAL_STOCK_MESSAGE_PREFIX =
  'الكمية المتاحة غير كافية. المتاح حاليًا:'

export type LocalInventorySnapshot = Readonly<{
  namespaceId: string
  catalogItemReference: string
  lastConfirmedBranchStock: number
  snapshotId: string
  confirmedAtServer: string
}>

export type LocalInventoryCommitment = Readonly<{
  namespaceId: string
  idempotencyKey: string
  localState: 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'blocked'
  catalogItemReference: string
  quantity: number
}>

export type Phase3InventoryCommandRecord = Readonly<{
  namespaceId: string
  idempotencyKey: string
  commandType: string
  state: LocalInventoryCommitment['localState']
  payload: Readonly<{
    itemReferences?: readonly Readonly<{
      catalogItemReference: string
      quantity: number
    }>[]
  }>
}>

export type LocalInventoryProjection = Readonly<{
  trustedSnapshotAvailable: boolean
  localAvailable: number | null
  localPendingQuantity: number
  localSyncingQuantity: number
  snapshotAgeInformationalOnly: true
}>

function isFiniteNonNegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

export function reconstructLocalInventoryCommitments(
  namespaceId: string,
  restoredCommands: readonly Phase3InventoryCommandRecord[]
) {
  const commitments: LocalInventoryCommitment[] = []
  for (const command of restoredCommands) {
    if (
      command.namespaceId !== namespaceId ||
      !command.idempotencyKey ||
      command.commandType !== 'order.create' ||
      !['pending', 'syncing'].includes(command.state) ||
      !Array.isArray(command.payload.itemReferences)
    ) {
      continue
    }

    const quantitiesByItem = new Map<string, number>()
    for (const item of command.payload.itemReferences) {
      if (
        !item.catalogItemReference ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        continue
      }
      quantitiesByItem.set(
        item.catalogItemReference,
        (quantitiesByItem.get(item.catalogItemReference) ?? 0) + item.quantity
      )
    }

    for (const [catalogItemReference, quantity] of quantitiesByItem) {
      commitments.push(
        Object.freeze({
          namespaceId,
          idempotencyKey: command.idempotencyKey,
          localState: command.state,
          catalogItemReference,
          quantity,
        })
      )
    }
  }
  return Object.freeze(commitments)
}

export function projectLocalInventory(params: Readonly<{
  namespaceId: string
  catalogItemReference: string
  snapshot: LocalInventorySnapshot | null
  commitments: readonly LocalInventoryCommitment[]
}>): LocalInventoryProjection {
  const { namespaceId, catalogItemReference, snapshot, commitments } = params
  if (
    !snapshot ||
    snapshot.namespaceId !== namespaceId ||
    snapshot.catalogItemReference !== catalogItemReference ||
    !snapshot.snapshotId ||
    !Number.isFinite(Date.parse(snapshot.confirmedAtServer)) ||
    !isFiniteNonNegativeInteger(snapshot.lastConfirmedBranchStock)
  ) {
    return Object.freeze({
      trustedSnapshotAvailable: false,
      localAvailable: null,
      localPendingQuantity: 0,
      localSyncingQuantity: 0,
      snapshotAgeInformationalOnly: true,
    })
  }

  const deduplicated = new Map<string, LocalInventoryCommitment>()
  for (const commitment of commitments) {
    if (
      commitment.namespaceId !== namespaceId ||
      commitment.catalogItemReference !== catalogItemReference ||
      !isFiniteNonNegativeInteger(commitment.quantity) ||
      !['pending', 'syncing'].includes(commitment.localState)
    ) {
      continue
    }

    const existing = deduplicated.get(commitment.idempotencyKey)
    if (!existing || existing.localState === 'pending') {
      deduplicated.set(commitment.idempotencyKey, commitment)
    }
  }

  let localPendingQuantity = 0
  let localSyncingQuantity = 0
  for (const commitment of deduplicated.values()) {
    if (commitment.localState === 'pending') {
      localPendingQuantity += commitment.quantity
    } else {
      localSyncingQuantity += commitment.quantity
    }
  }

  return Object.freeze({
    trustedSnapshotAvailable: true,
    localAvailable: Math.max(
      0,
      snapshot.lastConfirmedBranchStock -
        localPendingQuantity -
        localSyncingQuantity
    ),
    localPendingQuantity,
    localSyncingQuantity,
    snapshotAgeInformationalOnly: true,
  })
}

export function getLocalInventoryQuantityOutcome(
  localAvailable: number | null,
  requestedQuantity: number
) {
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1) {
    return Object.freeze({
      allowed: false,
      code: 'LOCAL_QUANTITY_INVALID',
      message: 'الكمية المطلوبة غير صالحة.',
    })
  }

  if (localAvailable === null) {
    return Object.freeze({
      allowed: false,
      code: 'TRUSTED_LOCAL_STOCK_SNAPSHOT_REQUIRED',
      message:
        'تعذر التحقق من المخزون المحلي الموثوق. يرجى الاتصال بالإنترنت لتحديث المخزون والتحقق من الرصيد.',
    })
  }

  if (localAvailable === 0) {
    return Object.freeze({
      allowed: false,
      code: 'LOCAL_STOCK_EXHAUSTED',
      message: ZERO_LOCAL_STOCK_MESSAGE,
    })
  }

  if (requestedQuantity > localAvailable) {
    return Object.freeze({
      allowed: false,
      code: 'LOCAL_STOCK_INSUFFICIENT',
      message: `${INSUFFICIENT_LOCAL_STOCK_MESSAGE_PREFIX} ${localAvailable}`,
    })
  }

  return Object.freeze({ allowed: true, code: 'LOCAL_STOCK_AVAILABLE', message: null })
}

export type LocalSyncCounters = Readonly<{
  pending: number
  syncing: number
  failed: number
  conflict: number
  blocked: number
}>

export function deriveLocalSyncPresentation(
  connectionState: 'online' | 'offline' | 'unknown',
  counters: LocalSyncCounters | null,
  lastSuccessfulSynchronizationAt: string | null
) {
  const attentionCount = counters
    ? counters.failed + counters.conflict + counters.blocked
    : 0
  const state = attentionCount > 0
    ? 'attention'
    : counters && counters.syncing > 0
      ? 'syncing'
      : connectionState

  return Object.freeze({
    state,
    pendingCount: counters?.pending ?? null,
    attentionCount: counters ? attentionCount : null,
    lastSuccessfulSynchronizationAt,
    lastSyncAgeInformationalOnly: true,
    blocksOfflineAccess: false,
    dispatchTriggered: false,
  })
}
