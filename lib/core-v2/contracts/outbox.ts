import 'server-only'

import type {
  CommandId,
  CorrelationId,
  OutboxEventId,
  TenantId,
} from './identities'

declare const outboxEventTypeBrand: unique symbol
declare const validatedOutboxPayloadBrand: unique symbol

export type OutboxEventType = string & {
  readonly [outboxEventTypeBrand]: 'OutboxEventType'
}

export type OutboxDeliveryState =
  | 'pending'
  | 'claimed'
  | 'delivered'
  | 'retry_scheduled'
  | 'dead_lettered'

export type UntrustedJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly UntrustedJsonValue[]
  | Readonly<{ [key: string]: UntrustedJsonValue }>

export type ValidatedOutboxPayload = Readonly<{
  value: UntrustedJsonValue
  readonly [validatedOutboxPayloadBrand]: true
}>

type OutboxEventFields = Readonly<{
  eventId: OutboxEventId
  eventType: OutboxEventType
  tenantId: TenantId
  commandId: CommandId
  aggregateType: string
  aggregateId: string
  correlationId: CorrelationId
  recipientReference: string | null
  provider: string | null
  createdAt: string
}>

export type UntrustedOutboxEventInput = OutboxEventFields &
  Readonly<{ safePayload: UntrustedJsonValue }>

export type OutboxEventEnvelope = OutboxEventFields &
  Readonly<{ safePayload: ValidatedOutboxPayload }>

export type OutboxAttemptMetadata = Readonly<{
  eventId: OutboxEventId
  attempt: number
  state: OutboxDeliveryState
  startedAt: string
  completedAt: string | null
  nextAttemptAt: string | null
  internalDiagnosticCode: string | null
}>
