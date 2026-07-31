import type {
  OutboxEventEnvelope,
  ValidatedOutboxPayload,
} from '../lib/core-v2/contracts/outbox'

const untrustedPayload = { value: { event: 'unsafe' } }

// @ts-expect-error plain JSON lacks validated provenance
const invalidPayload: ValidatedOutboxPayload = untrustedPayload

const invalidEnvelope: OutboxEventEnvelope = {
  eventId: '' as never,
  eventType: '' as never,
  tenantId: '' as never,
  commandId: '' as never,
  aggregateType: 'order',
  aggregateId: '1',
  correlationId: '' as never,
  // @ts-expect-error event envelope requires validated provenance
  safePayload: untrustedPayload,
  recipientReference: null,
  provider: null,
  createdAt: 'now',
}

void invalidPayload
void invalidEnvelope
