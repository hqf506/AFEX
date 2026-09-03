import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const sourcePath = new URL(
  '../lib/offline/core-v2-offline-authority-bridge.ts',
  import.meta.url
)
const databaseSignaturesPath = new URL(
  '../docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-ORDER-CREATE-PILOT-CONTRACT/PILOT-CONTRACT-DATABASE-SIGNATURES.json',
  import.meta.url
)
const orderCreateEnvelopePath = new URL(
  '../docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-ORDER-CREATE-PILOT-CONTRACT/PILOT-CONTRACT-ORDER-CREATE-ENVELOPE.json',
  import.meta.url
)
const deferredCommandsPath = new URL(
  '../docs/investigations/AFEX-POS-LOCAL-FIRST-OFFLINE-ENGINE-ORDER-CREATE-PILOT-CONTRACT/PILOT-CONTRACT-DEFERRED-COMMANDS.json',
  import.meta.url
)

async function importBridge() {
  const source = await readFile(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText.replace(/import ['"]server-only['"];?/u, '')
  return import(
    `data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled)}#${Date.now()}-${Math.random()}`
  )
}

const ids = {
  localCommand: '00000000-0000-4000-8000-000000000001',
  user: '00000000-0000-4000-8000-000000000002',
  tenant: '00000000-0000-4000-8000-000000000003',
  branch: '00000000-0000-4000-8000-000000000004',
  employee: '00000000-0000-4000-8000-000000000005',
  device: '00000000-0000-4000-8000-000000000006',
  item: '00000000-0000-4000-8000-000000000007',
  snapshot: '00000000-0000-4000-8000-000000000008',
  serverCommand: '00000000-0000-4000-8000-000000000009',
  review: '00000000-0000-4000-8000-000000000010',
  reviewer: '00000000-0000-4000-8000-000000000011',
  paymentCommand: '00000000-0000-4000-8000-000000000012',
  secondItem: '00000000-0000-4000-8000-000000000013',
  order: '00000000-0000-4000-8000-000000000014',
  customer: '00000000-0000-4000-8000-000000000015',
  payment: '00000000-0000-4000-8000-000000000016',
  audit: '00000000-0000-4000-8000-000000000017',
  otherTenant: '00000000-0000-4000-8000-000000000018',
  otherBranch: '00000000-0000-4000-8000-000000000019',
  otherEmployee: '00000000-0000-4000-8000-000000000020',
  otherDevice: '00000000-0000-4000-8000-000000000021',
  bootstrap: '00000000-0000-4000-8000-000000000022',
  enrollment: '00000000-0000-4000-8000-000000000023',
  keyEnvelope: '00000000-0000-4000-8000-000000000024',
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}

function coreOrderPayload() {
  const lineId = '00000000-0000-4000-8000-000000000025'
  return {
    payload_version: 'order-command-payload-v1',
    fingerprint_version: 'order-request-fingerprint-v1',
    command_type: 'order.create', tenant_id: ids.tenant, branch_id: ids.branch,
    authenticated_actor_id: ids.user,
    customer: { mode: 'existing', customer_id: ids.customer, expected_record_version: 1,
      normalized_phone: null, display_phone: null, name: null, email: null,
      address: null, notes: null, allowed_update_fields: [], conflict_behavior: 'reject' },
    items: [{ line_id: lineId, line_number: 1, catalog_item_id: ids.item,
      name_snapshot: 'عنصر', sku_snapshot: 'SKU-1', category_snapshot: 'CAT',
      item_type_snapshot: 'service', quantity: '1', unit_snapshot: 'item',
      inventory_tracking_mode: 'service', fulfillment_class: 'immediate',
      line_note: null, modifiers: [] }],
    pricing: { currency: 'SAR', currency_precision: 2, subtotal: '100.00',
      taxable_subtotal: '100.00', total: '115.00', rounding_strategy: 'invoice-half-up-v1',
      price_version: 'v1', branch_pricing_version: null, quote_reference: 'quote-1',
      quote_version: 'financial-quote-v1', quote_fingerprint: 'f'.repeat(64),
      financial_engine_version: 'financial-engine-v2-r1',
      lines: [{ line_id: lineId, unit_price: '100.00', pricing_source: 'catalog_default',
        source_catalog_id: ids.item, source_branch_price_id: null,
        source_catalog_version: '2026-08-26T10:00:00.000000Z',
        source_branch_price_version: null, gross_amount: '100.00',
        discount_allocation: '0.00', taxable_amount: '100.00',
        vat_amount: '15.00', net_amount: '100.00' }] },
    vat: { mode: 'exclusive', tax_inclusive: false, setting_id: null, rate: '15.00',
      amount: '15.00', rule_version: 'v1', effective_at: '2026-08-26T10:00:00.000000Z' },
    discount: { id: null, source: 'none', name_snapshot: null, type: null,
      value: null, amount: '0.00', eligibility_version: null, rule_version: null },
    payment: { method: 'mada', amount_tendered: '115.00', expected_status: 'paid',
      cash_received: null, remaining_from_customer: '0.00', cash_change: '0.00',
      rule_version: 'v1', provider_reference: null },
    fulfillment: { method: 'immediate', branch_id: ids.branch, requested_at: null,
      address: null, instructions: null }, order: { note: null },
    metadata: { source_channel: 'pos', request_reference: 'request-1',
      offline_draft_id: null, correlation_id: 'correlation-1', device_id: null,
      pos_terminal_id: null, client_version: null },
    versions: { customer_engine: 'v1', financial_engine: 'financial-engine-v2-r1',
      inventory_engine: 'v1', numbering_engine: 'v1', authorization_contract: 'v1',
      payload_contract: 'order-command-payload-v1' },
  }
}

function sha(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex')
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function originAuthorityReference(overrides = {}) {
  return {
    bootstrapId: ids.bootstrap,
    bootstrapGeneration: 1,
    primaryAuthenticatedSubjectId: ids.user,
    tenantId: ids.tenant,
    branchId: ids.branch,
    deviceId: ids.device,
    deviceGeneration: 1,
    enrollmentId: ids.enrollment,
    actualPosEmployeeId: ids.employee,
    employeeEnrollmentGeneration: 1,
    commandGeneration: 1,
    keyEnvelopeId: ids.keyEnvelope,
    keyEnvelopeVersion: 1,
    namespaceGeneration: 1,
    originAuthorityVersion: 'afex-offline-origin-authority.v2',
    ...overrides,
  }
}

function payloadFor(commandType) {
  if (commandType === 'order.create') {
    const coreOrder = coreOrderPayload()
    return {
      aggregateReference: ids.order,
      customerReference: { kind: 'server', id: ids.customer },
      itemReferences: [
        {
          catalogItemReference: ids.item,
          quantity: 1,
          unitPrice: '100.00',
          grossAmount: '100.00', discountAllocation: '0.00',
          taxableAmount: '100.00', vatRate: '15.00', vatBasis: '100.00',
          vatAmount: '15.00', lineSubtotal: '100.00', lineTotal: '115.00',
        },
      ],
      paymentAttestationCommandId: ids.paymentCommand,
      paymentMethod: 'mada',
      currency: 'SAR',
      subtotalAmount: '100.00',
      discountAmount: '0.00',
      taxAmount: '15.00',
      totalAmount: '115.00',
      canonicalPayloadVersion: 'order-command-payload-v1',
      coreOrderCanonicalPayload: coreOrder,
      coreFingerprintProjection: { command_type: 'order.create', tenant_id: ids.tenant },
      corePayloadCanonicalHash: sha(coreOrder),
      idempotencyKey: 'idempotency-key-1',
      inventorySnapshotId: ids.snapshot,
      inventoryFrontierVersion: 'frontier-1',
    }
  }
  if (commandType === 'order.status.change') {
    return {
      orderReference: { kind: 'server', id: ids.order },
      fromStatus: 'in_progress',
      toStatus: 'ready',
      transitionContractVersion: 'status-v1',
    }
  }
  if (commandType === 'customer.create') {
    return {
      aggregateReference: ids.customer,
      name: 'عميل اختبار',
      phone: '0500000000',
      email: null,
      address: null,
      notes: null,
    }
  }
  if (commandType === 'customer.update') {
    return {
      aggregateReference: ids.customer,
      expectedVersion: 'customer-v1',
      changes: { notes: 'ملاحظة آمنة' },
    }
  }
  if (commandType === 'payment.employee_attestation') {
    return {
      orderAggregateReference: ids.order,
      paymentMethod: 'mada',
      amount: '115.00',
      currency: 'SAR',
      employeeConfirmedExternalPayment: true,
      employeeConfirmedAtLocal: '2026-08-26T10:00:00.000Z',
      paymentProviderConfirmationStatus: 'employee_attested',
      paymentReplayPolicy: 'never_charge_or_invoke_provider',
      reconciliationStatus: 'pending',
    }
  }
  if (commandType === 'audit.event.append') {
    return {
      aggregateReference: ids.audit,
      causalCommandId: ids.paymentCommand,
      eventType: 'offline_qualification_reviewed',
      details: { source: 'synthetic-test' },
    }
  }
  if (commandType === 'order.cancel') {
    return {
      orderReference: { kind: 'server', id: ids.order },
      expectedVersion: 'order-v1',
      reasonCode: 'customer_request',
    }
  }
  return {
    orderReference: { kind: 'server', id: ids.order },
    paymentReference: ids.payment,
    amount: '10.00',
    currency: 'SAR',
    reasonCode: 'approved_reason',
  }
}

function commandShape(
  commandType,
  payload,
  localCommandId = ids.localCommand,
  idempotencyKey = 'offline-order-0001'
) {
  if (commandType === 'order.create') {
    return {
      aggregateType: 'order',
      aggregateId: ids.order,
      localAggregateReference: null,
      dependencyReferences: [payload.paymentAttestationCommandId],
      paymentAttestation: {
        attestationCommandId: payload.paymentAttestationCommandId,
        orderAggregateReference: payload.aggregateReference,
        primaryAuthenticatedUserId: ids.user,
        actualPosEmployeeId: ids.employee,
        tenantId: ids.tenant,
        branchId: ids.branch,
        deviceId: ids.device,
        deviceGeneration: 1,
        employeeEnrollmentGeneration: 1,
        commandGeneration: 1,
        method: payload.paymentMethod,
        amount: payload.totalAmount,
        currency: 'SAR',
        employeeAttestedExternalStep: true,
        attestedAtLocal: '2026-08-26T10:00:00.000Z',
        providerStatus: 'unverified',
        providerConfirmation: 'not_claimed',
        providerSettlement: 'not_claimed',
        bankSettlement: 'not_claimed',
        cardAuthorization: 'not_claimed',
        refundCompletion: 'not_claimed',
        paymentProviderActionRequested: false,
        orderCreateLocalCommandId: localCommandId,
        orderCreateIdempotencyKeyHash: sha256Text(idempotencyKey),
      },
      inventoryFrontierReference: {
        contractVersion: 'branch-inventory-frontier.v1',
        tenantId: ids.tenant,
        branchId: ids.branch,
        snapshotId: ids.snapshot,
        frontierVersion: 'frontier-1',
        localCommitmentFrontier: 'commitment-frontier-1',
        items: payload.itemReferences
          .map((item) => ({
            catalogItemId: item.catalogItemReference,
            requestedQuantity: item.quantity,
            pendingLocalCommitments: 0,
            syncingLocalCommitments: 0,
          }))
          .sort((left, right) =>
            left.catalogItemId.localeCompare(right.catalogItemId)
          ),
      },
    }
  }
  if (commandType === 'order.status.change') {
    return {
      aggregateType: 'order',
      aggregateId: payload.orderReference.id,
      localAggregateReference: null,
      dependencyReferences: [],
      paymentAttestation: null,
      inventoryFrontierReference: null,
    }
  }
  if (commandType === 'customer.create' || commandType === 'customer.update') {
    return {
      aggregateType: 'customer',
      aggregateId: payload.aggregateReference,
      localAggregateReference: null,
      dependencyReferences: [],
      paymentAttestation: null,
      inventoryFrontierReference: null,
    }
  }
  if (commandType === 'payment.employee_attestation') {
    return {
      aggregateType: 'payment',
      aggregateId: payload.orderAggregateReference,
      localAggregateReference: null,
      dependencyReferences: [],
      paymentAttestation: {
        attestationCommandId: localCommandId,
        orderAggregateReference: payload.orderAggregateReference,
        primaryAuthenticatedUserId: ids.user,
        actualPosEmployeeId: ids.employee,
        tenantId: ids.tenant,
        branchId: ids.branch,
        deviceId: ids.device,
        deviceGeneration: 1,
        employeeEnrollmentGeneration: 1,
        commandGeneration: 1,
        method: payload.paymentMethod,
        amount: payload.amount,
        currency: 'SAR',
        employeeAttestedExternalStep: true,
        attestedAtLocal: payload.employeeConfirmedAtLocal,
        providerStatus: 'unverified',
        providerConfirmation: 'not_claimed',
        providerSettlement: 'not_claimed',
        bankSettlement: 'not_claimed',
        cardAuthorization: 'not_claimed',
        refundCompletion: 'not_claimed',
        paymentProviderActionRequested: false,
        orderCreateLocalCommandId: localCommandId,
        orderCreateIdempotencyKeyHash: sha256Text('idempotency-key-1'),
      },
      inventoryFrontierReference: null,
    }
  }
  if (commandType === 'audit.event.append') {
    return {
      aggregateType: 'audit',
      aggregateId: payload.aggregateReference,
      localAggregateReference: null,
      dependencyReferences: [payload.causalCommandId],
      paymentAttestation: null,
      inventoryFrontierReference: null,
    }
  }
  if (commandType === 'order.cancel') {
    return {
      aggregateType: 'order',
      aggregateId: payload.orderReference.id,
      localAggregateReference: null,
      dependencyReferences: [],
      paymentAttestation: null,
      inventoryFrontierReference: null,
    }
  }
  return {
    aggregateType: 'payment',
    aggregateId: payload.paymentReference,
    localAggregateReference: null,
    dependencyReferences: [],
    paymentAttestation: null,
    inventoryFrontierReference: null,
  }
}

async function fixture(overrides = {}) {
  const bridge = await importBridge()
  const envelopeOverrides = { ...overrides }
  delete envelopeOverrides.dependencyStates
  delete envelopeOverrides.existingAcquisition
  delete envelopeOverrides.detectedConflict
  const commandType = overrides.commandType ?? 'order.create'
  const suppliedPayload = overrides.payload ?? payloadFor(commandType)
  const idempotencyKey =
    overrides.idempotencyKey ??
    (commandType === 'order.create'
      ? suppliedPayload.idempotencyKey
      : 'offline-order-0001')
  const payload =
    commandType === 'order.create' &&
    !Object.prototype.hasOwnProperty.call(overrides, 'payload')
      ? { ...suppliedPayload, idempotencyKey }
      : suppliedPayload
  const localCommandId = overrides.localCommandId ?? ids.localCommand
  const shape = commandShape(
    commandType,
    payload,
    localCommandId,
    idempotencyKey
  )
  const payloadCanonicalHash = bridge.sha256OfflineReplayPayload(
    bridge.canonicalizeOfflineReplayPayload(payload)
  )
  const commandContractVersion =
    commandType === 'order.create'
      ? bridge.CORE_V2_OFFLINE_ORDER_CREATE_CONTRACT_VERSION
      : bridge.CORE_V2_OFFLINE_SHADOW_CONTRACT_VERSION
  const baseEnvelope = {
    localCommandId,
    idempotencyKey,
    commandType,
    commandContractVersion,
    schemaVersion: 1,
    primaryAuthenticatedUserId: ids.user,
    tenantId: ids.tenant,
    branchId: ids.branch,
    actualPosEmployeeId: ids.employee,
    deviceId: ids.device,
    deviceGeneration: 1,
    employeeEnrollmentGeneration: 1,
    commandGeneration: 1,
    ...shape,
    localCreatedAt: '2026-08-26T10:00:00.000Z',
    payload,
    payloadCanonicalHash,
    keyEnvelopeId: ids.keyEnvelope,
    keyEnvelopeVersion: 1,
    clientApplicationVersion: '1.0.0',
    ...envelopeOverrides,
    payload,
    payloadCanonicalHash: overrides.payloadCanonicalHash ?? payloadCanonicalHash,
  }
  baseEnvelope.originAuthorityReference =
    overrides.originAuthorityReference ??
    originAuthorityReference({
      tenantId: baseEnvelope.tenantId,
      branchId: baseEnvelope.branchId,
      deviceId: baseEnvelope.deviceId,
      deviceGeneration: baseEnvelope.deviceGeneration,
      actualPosEmployeeId: baseEnvelope.actualPosEmployeeId,
      employeeEnrollmentGeneration:
        baseEnvelope.employeeEnrollmentGeneration,
      commandGeneration: baseEnvelope.commandGeneration,
      keyEnvelopeId: baseEnvelope.keyEnvelopeId,
      keyEnvelopeVersion: baseEnvelope.keyEnvelopeVersion,
    })
  if (
    baseEnvelope.paymentAttestation &&
    !Object.prototype.hasOwnProperty.call(overrides, 'paymentAttestation')
  ) {
    baseEnvelope.paymentAttestation = {
      ...baseEnvelope.paymentAttestation,
      primaryAuthenticatedUserId: baseEnvelope.primaryAuthenticatedUserId,
      actualPosEmployeeId: baseEnvelope.actualPosEmployeeId,
      tenantId: baseEnvelope.tenantId,
      branchId: baseEnvelope.branchId,
      deviceId: baseEnvelope.deviceId,
      deviceGeneration: baseEnvelope.deviceGeneration,
      employeeEnrollmentGeneration:
        baseEnvelope.employeeEnrollmentGeneration,
      commandGeneration: baseEnvelope.commandGeneration,
    }
  }
  const authorityBindingCanonicalHash =
    bridge.computeCoreV2OfflineAuthorityBindingCanonicalHash({
      commandContractVersion: baseEnvelope.commandContractVersion,
      schemaVersion: baseEnvelope.schemaVersion,
      localCommandId: baseEnvelope.localCommandId,
      idempotencyKey: baseEnvelope.idempotencyKey,
      commandType: baseEnvelope.commandType,
      primaryAuthenticatedUserId: baseEnvelope.primaryAuthenticatedUserId,
      tenantId: baseEnvelope.tenantId,
      branchId: baseEnvelope.branchId,
      actualPosEmployeeId: baseEnvelope.actualPosEmployeeId,
      deviceId: baseEnvelope.deviceId,
      deviceGeneration: baseEnvelope.deviceGeneration,
      employeeEnrollmentGeneration:
        baseEnvelope.employeeEnrollmentGeneration,
      commandGeneration: baseEnvelope.commandGeneration,
      keyEnvelopeId: baseEnvelope.keyEnvelopeId,
      keyEnvelopeVersion: baseEnvelope.keyEnvelopeVersion,
      aggregateType: baseEnvelope.aggregateType,
      aggregateId: baseEnvelope.aggregateId,
      localAggregateReference: baseEnvelope.localAggregateReference,
      payloadCanonicalHash: baseEnvelope.payloadCanonicalHash,
      paymentAttestation: baseEnvelope.paymentAttestation,
      inventoryFrontierReference: baseEnvelope.inventoryFrontierReference,
      originAuthorityReference: baseEnvelope.originAuthorityReference,
    })
  return {
    bridge,
    envelope: {
      ...baseEnvelope,
      authorityBindingCanonicalHash:
        overrides.authorityBindingCanonicalHash ??
        authorityBindingCanonicalHash,
    },
  }
}

function rebindEnvelope(bridge, envelope, overrides) {
  const next = { ...envelope, ...overrides }
  if (
    Object.prototype.hasOwnProperty.call(overrides, 'idempotencyKey') &&
    envelope.commandType === 'order.create' &&
    !Object.prototype.hasOwnProperty.call(overrides, 'payload')
  ) {
    next.payload = { ...envelope.payload, idempotencyKey: next.idempotencyKey }
    next.payloadCanonicalHash = bridge.sha256OfflineReplayPayload(
      bridge.canonicalizeOfflineReplayPayload(next.payload)
    )
  }
  if (
    (Object.prototype.hasOwnProperty.call(overrides, 'idempotencyKey') ||
      Object.prototype.hasOwnProperty.call(overrides, 'localCommandId')) &&
    envelope.paymentAttestation &&
    !Object.prototype.hasOwnProperty.call(overrides, 'paymentAttestation')
  ) {
    next.paymentAttestation = {
      ...envelope.paymentAttestation,
      orderCreateLocalCommandId: next.localCommandId,
      orderCreateIdempotencyKeyHash: sha256Text(next.idempotencyKey),
    }
  }
  if (!Object.prototype.hasOwnProperty.call(overrides, 'originAuthorityReference')) {
    next.originAuthorityReference = originAuthorityReference({
      primaryAuthenticatedSubjectId: next.primaryAuthenticatedUserId,
      tenantId: next.tenantId,
      branchId: next.branchId,
      deviceId: next.deviceId,
      deviceGeneration: next.deviceGeneration,
      actualPosEmployeeId: next.actualPosEmployeeId,
      employeeEnrollmentGeneration: next.employeeEnrollmentGeneration,
      commandGeneration: next.commandGeneration,
      keyEnvelopeId: next.keyEnvelopeId,
      keyEnvelopeVersion: next.keyEnvelopeVersion,
    })
  }
  return {
    ...next,
    authorityBindingCanonicalHash:
      bridge.computeCoreV2OfflineAuthorityBindingCanonicalHash({
        commandContractVersion: next.commandContractVersion,
        schemaVersion: next.schemaVersion,
        localCommandId: next.localCommandId,
        idempotencyKey: next.idempotencyKey,
        commandType: next.commandType,
        primaryAuthenticatedUserId: next.primaryAuthenticatedUserId,
        tenantId: next.tenantId,
        branchId: next.branchId,
        actualPosEmployeeId: next.actualPosEmployeeId,
        deviceId: next.deviceId,
        deviceGeneration: next.deviceGeneration,
        employeeEnrollmentGeneration: next.employeeEnrollmentGeneration,
        commandGeneration: next.commandGeneration,
        keyEnvelopeId: next.keyEnvelopeId,
        keyEnvelopeVersion: next.keyEnvelopeVersion,
        aggregateType: next.aggregateType,
        aggregateId: next.aggregateId,
        localAggregateReference: next.localAggregateReference,
        payloadCanonicalHash: next.payloadCanonicalHash,
        paymentAttestation: next.paymentAttestation,
        inventoryFrontierReference: next.inventoryFrontierReference,
        originAuthorityReference: next.originAuthorityReference,
      }),
  }
}

function authorityBindingInput(envelope) {
  return {
    commandContractVersion: envelope.commandContractVersion,
    commandType: envelope.commandType,
    schemaVersion: envelope.schemaVersion,
    localCommandId: envelope.localCommandId,
    idempotencyKey: envelope.idempotencyKey,
    primaryAuthenticatedUserId: envelope.primaryAuthenticatedUserId,
    actualPosEmployeeId: envelope.actualPosEmployeeId,
    tenantId: envelope.tenantId,
    branchId: envelope.branchId,
    deviceId: envelope.deviceId,
    deviceGeneration: envelope.deviceGeneration,
    employeeEnrollmentGeneration: envelope.employeeEnrollmentGeneration,
    commandGeneration: envelope.commandGeneration,
    keyEnvelopeId: envelope.keyEnvelopeId,
    keyEnvelopeVersion: envelope.keyEnvelopeVersion,
    aggregateType: envelope.aggregateType,
    aggregateId: envelope.aggregateId,
    localAggregateReference: envelope.localAggregateReference,
    payloadCanonicalHash: envelope.payloadCanonicalHash,
    paymentAttestation: envelope.paymentAttestation,
    inventoryFrontierReference: envelope.inventoryFrontierReference,
    originAuthorityReference: envelope.originAuthorityReference,
  }
}

function authority(overrides = {}) {
  return {
    source: 'trusted_server',
    authorityVersion: 'authority-1',
    resolvedAtServer: '2026-08-26T10:01:00.000Z',
    primaryAuthenticatedUserId: ids.user,
    tenantId: ids.tenant,
    branchId: ids.branch,
    actualPosEmployeeId: ids.employee,
    deviceId: ids.device,
    deviceGeneration: 1,
    employeeEnrollmentGeneration: 1,
    commandGeneration: 1,
    keyEnvelopeId: ids.keyEnvelope,
    keyEnvelopeVersion: 1,
    originAuthorityReference: originAuthorityReference(),
    keyEnvelopeValidated: true,
    employeeRevoked: false,
    deviceRevoked: false,
    supportedCommandTypes: ['order.create'],
    inventoryFrontier: {
      source: 'trusted_server',
      tenantId: ids.tenant,
      branchId: ids.branch,
      snapshotId: ids.snapshot,
      serverConfirmedAt: '2026-08-26T09:59:00.000Z',
      frontierVersion: 'frontier-1',
      items: [{ catalogItemId: ids.item, confirmedStock: 10 }],
    },
    coreV2Available: true,
    ...overrides,
  }
}

function acquisition(envelope, overrides = {}) {
  const next = {
    serverCommandId: ids.serverCommand,
    commandContractVersion: envelope.commandContractVersion,
    primaryAuthenticatedUserId: envelope.primaryAuthenticatedUserId,
    tenantId: envelope.tenantId,
    branchId: envelope.branchId,
    actualPosEmployeeId: envelope.actualPosEmployeeId,
    deviceId: envelope.deviceId,
    deviceGeneration: envelope.deviceGeneration,
    employeeEnrollmentGeneration: envelope.employeeEnrollmentGeneration,
    commandGeneration: envelope.commandGeneration,
    commandType: envelope.commandType,
    idempotencyKey: envelope.idempotencyKey,
    payloadCanonicalHash: envelope.payloadCanonicalHash,
    authorityBindingCanonicalHash: envelope.authorityBindingCanonicalHash,
    originAuthorityReference: envelope.originAuthorityReference,
    state: 'in_progress',
    receipt: null,
    ...overrides,
  }
  if (!Object.prototype.hasOwnProperty.call(overrides, 'originAuthorityReference')) {
    next.originAuthorityReference = originAuthorityReference({
      primaryAuthenticatedSubjectId: next.primaryAuthenticatedUserId,
      tenantId: next.tenantId,
      branchId: next.branchId,
      deviceId: next.deviceId,
      deviceGeneration: next.deviceGeneration,
      actualPosEmployeeId: next.actualPosEmployeeId,
      employeeEnrollmentGeneration: next.employeeEnrollmentGeneration,
      commandGeneration: next.commandGeneration,
      keyEnvelopeId: next.originAuthorityReference.keyEnvelopeId,
      keyEnvelopeVersion: next.originAuthorityReference.keyEnvelopeVersion,
    })
  }
  return next
}

function syncedDependencyStates(envelope) {
  return envelope.dependencyReferences.map((localCommandId) => ({
    localCommandId,
    state: 'synced',
  }))
}

function resolver(snapshot = authority()) {
  let calls = 0
  return {
    get calls() {
      return calls
    },
    resolveBatch: async (claims) => {
      calls += 1
      return claims.map((claim) => ({
        position: claim.position,
        claimBindingHash: claim.claimBindingHash,
        available: true,
        authority: snapshot,
      }))
    },
  }
}

async function qualify(overrides = {}, authorityOverrides = {}) {
  const { bridge, envelope } = await fixture(overrides)
  const dependencyStates =
    overrides.dependencyStates ??
    syncedDependencyStates(envelope)
  return {
    bridge,
    envelope,
    result: await bridge.qualifyCoreV2OfflineReplay(
      {
        envelope,
        dependencyStates,
        existingAcquisition: overrides.existingAcquisition ?? null,
        detectedConflict: overrides.detectedConflict ?? null,
      },
      resolver(authority(authorityOverrides))
    ),
  }
}

test('exact envelope schema accepts the contract and rejects unknown fields', async () => {
  const { bridge, envelope } = await fixture()
  assert.equal(bridge.parseCoreV2OfflineCommandEnvelope(envelope).schemaVersion, 1)
  assert.throws(
    () => bridge.parseCoreV2OfflineCommandEnvelope({ ...envelope, invented: true }),
    /UNKNOWN_OR_MISSING_FIELD/u
  )
  assert.throws(
    () => {
      const missing = { ...envelope }
      delete missing.branchId
      bridge.parseCoreV2OfflineCommandEnvelope(missing)
    },
    /UNKNOWN_OR_MISSING_FIELD/u
  )
})

test('malformed identifiers unsupported schemas and unregistered commands reject', async () => {
  const { bridge, envelope } = await fixture()
  for (const changed of [
    { localCommandId: 'not-a-uuid' },
    { schemaVersion: 2 },
    { commandType: 'unknown.write' },
  ]) {
    assert.throws(
      () => bridge.parseCoreV2OfflineCommandEnvelope({ ...envelope, ...changed }),
      /MALFORMED_IDENTIFIER|UNSUPPORTED_SCHEMA_VERSION|UNREGISTERED_COMMAND_TYPE/u
    )
  }
})

test('canonical payload hashing is stable and mismatches become conflicts', async () => {
  const { bridge, envelope } = await fixture()
  const first = bridge.sha256OfflineReplayPayload(
    bridge.canonicalizeOfflineReplayPayload({ b: 2, a: 'é' })
  )
  const second = bridge.sha256OfflineReplayPayload(
    bridge.canonicalizeOfflineReplayPayload({ a: 'e\u0301', b: 2 })
  )
  assert.equal(first, second)
  const mismatch = await bridge.qualifyCoreV2OfflineReplay({
    envelope: { ...envelope, payloadCanonicalHash: '0'.repeat(64) },
    dependencyStates: [],
    existingAcquisition: null,
  })
  assert.equal(mismatch.outcome, 'conflict')
  assert.equal(mismatch.code, 'PAYLOAD_HASH_MISMATCH')
})

test('authority binding is exact deterministic and every covered field is effective', async () => {
  const { bridge, envelope } = await fixture()
  const binding = authorityBindingInput(envelope)
  assert.deepEqual(
    Object.keys(binding),
    [...bridge.CORE_V2_OFFLINE_AUTHORITY_BINDING_KEYS]
  )
  const baseHash =
    bridge.computeCoreV2OfflineOrderCreateAuthorityBindingCanonicalHash(binding)
  const reversed = Object.fromEntries(Object.entries(binding).reverse())
  assert.equal(
    bridge.computeCoreV2OfflineOrderCreateAuthorityBindingCanonicalHash(reversed),
    baseHash
  )
  const canonical = JSON.parse(
    bridge.canonicalizeCoreV2OfflineAuthorityBinding(binding)
  )
  assert.equal(Object.hasOwn(canonical, 'aggregateId'), true)
  assert.equal(Object.hasOwn(canonical, 'localAggregateReference'), true)
  assert.equal(canonical.localAggregateReference, null)
  assert.equal(
    bridge.CORE_V2_OFFLINE_AUTHORITY_BINDING_CANONICALIZATION.version,
    'afex-authority-binding-canonical-json.v2'
  )

  const changedFields = [
    ['localCommandId', ids.reviewer],
    ['idempotencyKey', 'offline-order-0002'],
    ['primaryAuthenticatedUserId', ids.reviewer],
    ['actualPosEmployeeId', ids.reviewer],
    ['tenantId', ids.reviewer],
    ['branchId', ids.reviewer],
    ['deviceId', ids.reviewer],
    ['deviceGeneration', 2],
    ['employeeEnrollmentGeneration', 2],
    ['commandGeneration', 2],
    ['keyEnvelopeId', ids.reviewer],
    ['keyEnvelopeVersion', 2],
    ['aggregateType', 'customer'],
    ['aggregateId', ids.reviewer],
    ['payloadCanonicalHash', 'f'.repeat(64)],
    [
      'paymentAttestation',
      { ...binding.paymentAttestation, attestedAtLocal: '2026-08-26T10:00:01.000Z' },
    ],
    [
      'inventoryFrontierReference',
      { ...binding.inventoryFrontierReference, frontierVersion: 'frontier-2' },
    ],
  ]
  const originBoundFields = new Set([
    'primaryAuthenticatedUserId',
    'actualPosEmployeeId',
    'tenantId',
    'branchId',
    'deviceId',
    'deviceGeneration',
    'employeeEnrollmentGeneration',
    'commandGeneration',
    'keyEnvelopeId',
    'keyEnvelopeVersion',
  ])
  for (const [field, value] of changedFields) {
    const candidate = { ...binding, [field]: value }
    if (originBoundFields.has(field)) {
      candidate.originAuthorityReference = {
        ...binding.originAuthorityReference,
        [field === 'primaryAuthenticatedUserId'
          ? 'primaryAuthenticatedSubjectId'
          : field]: value,
      }
    }
    assert.notEqual(
      bridge.computeCoreV2OfflineAuthorityBindingCanonicalHash(candidate),
      baseHash,
      field
    )
  }

  for (const invalid of [
    { ...binding, commandType: 'customer.create' },
    { ...binding, commandContractVersion: 'core-v2-offline-shadow.v1' },
    { ...binding, schemaVersion: 2 },
    { ...binding, localAggregateReference: 'unexpected-local-reference' },
  ]) {
    assert.throws(
      () =>
        bridge.computeCoreV2OfflineOrderCreateAuthorityBindingCanonicalHash(
          invalid
        ),
      /PILOT_COMMAND_DISPATCH_BLOCKED|COMMAND_CONTRACT_VERSION_MISMATCH|UNSUPPORTED_SCHEMA_VERSION|AMBIGUOUS_AGGREGATE_IDENTITY/u
    )
  }
  const missing = { ...binding }
  delete missing.schemaVersion
  assert.throws(
    () => bridge.computeCoreV2OfflineAuthorityBindingCanonicalHash(missing),
    /UNKNOWN_OR_MISSING_FIELD/u
  )
  assert.throws(
    () =>
      bridge.computeCoreV2OfflineAuthorityBindingCanonicalHash({
        ...binding,
        invented: true,
      }),
    /UNKNOWN_OR_MISSING_FIELD/u
  )
  assert.throws(
    () =>
      bridge.parseCoreV2OfflineCommandEnvelope({
        ...envelope,
        authorityBindingCanonicalHash: '0'.repeat(64),
      }),
    /AUTHORITY_BINDING_HASH_MISMATCH/u
  )
})

test('database acquisition signature exposes every hash input and correct writer counts', async () => {
  const bridge = await importBridge()
  const databaseSignatures = JSON.parse(
    await readFile(databaseSignaturesPath, 'utf8')
  )
  const envelopeContract = JSON.parse(
    await readFile(orderCreateEnvelopePath, 'utf8')
  )
  const deferred = JSON.parse(await readFile(deferredCommandsPath, 'utf8'))
  const acquisition = databaseSignatures.contracts.find(
    (entry) => entry.id === 'DBSIG-ORDER-ACQUIRE-001'
  )
  assert.ok(acquisition)
  assert.match(acquisition.identity, /^afex_offline_authority\.acquire_offline_order_create_v2\(/u)
  assert.equal(acquisition.authorityFirst, true)
  assert.equal(acquisition.coreV2SameTransaction, true)
  assert.deepEqual(
    envelopeContract.authorityBindingCanonicalHashIncludes,
    [...bridge.CORE_V2_OFFLINE_AUTHORITY_BINDING_KEYS]
  )
  assert.equal(envelopeContract.authorityBindingCanonicalization.databaseMustRecompute, true)
  assert.equal(envelopeContract.authorityBindingCanonicalization.opaqueCallerHashSufficient, false)
  assert.deepEqual(deferred.databaseContractClassification, {
    requiredForEventualPilotOperation: 4,
    requiredContracts: [
      'DBSIG-ORDER-ACQUIRE-001',
      'DBSIG-RESOLVE-001',
      'DBSIG-RECEIPT-001',
      'DBSIG-INVENTORY-001',
    ],
    implementedInThisTask: 4,
    executableForwardWaveFiles: 11,
    readOnlyAttestationFiles: 2,
    disablementFiles: 1,
    sqlStatementsExecuted: 0,
    deferredCommandWritersBlockingOrderCreatePilot: 0,
  })
})

test('caller UUID equality is not a trusted sync-uploader authority', async () => {
  const bridge = await importBridge()
  assert.equal(
    Object.hasOwn(bridge, 'requireTrustedCoreV2OfflineAuthenticatedActor'),
    false
  )
  assert.equal(
    bridge.CORE_V2_OFFLINE_TRUSTED_ACTOR_RULE.browserUuidEqualityIsAuthority,
    false
  )
  assert.equal(
    bridge.CORE_V2_OFFLINE_TRUSTED_ACTOR_RULE.activation,
    'SHADOW_PROVENANCE_NOT_ACTIVE'
  )
  assert.equal(
    bridge.CORE_V2_OFFLINE_TRUSTED_ACTOR_RULE.browserRoleExecutionAllowed,
    false
  )
  assert.equal(
    bridge.CORE_V2_OFFLINE_TRUSTED_ACTOR_RULE.secondActorAuthorityCreated,
    false
  )
})

test('origin authority is immutable and substitution fails closed', async () => {
  const { bridge, envelope } = await fixture()
  assert.equal(bridge.CORE_V2_OFFLINE_AUTHORITY_BINDING_KEYS.length, 22)
  assert.throws(
    () =>
      bridge.parseCoreV2OfflineCommandEnvelope({
        ...envelope,
        originAuthorityReference: {
          ...envelope.originAuthorityReference,
          deviceId: ids.otherDevice,
        },
      }),
    /ORIGIN_AUTHORITY_CORRESPONDENCE_MISMATCH|AUTHORITY_BINDING_HASH_MISMATCH/u
  )
  assert.throws(
    () =>
      bridge.parseCoreV2OfflineCommandEnvelope({
        ...envelope,
        originAuthorityReference: {
          ...envelope.originAuthorityReference,
          originAuthorityVersion: 'afex-offline-origin-authority.v3',
        },
      }),
    /ORIGIN_AUTHORITY_VERSION_MISMATCH/u
  )
})

test('all eight payment methods remain distinct and valid', async () => {
  const { bridge } = await fixture()
  assert.deepEqual(bridge.CORE_V2_OFFLINE_PAYMENT_METHODS, [
    'mada',
    'cash',
    'visa',
    'cod',
    'card',
    'bank_transfer',
    'transfer',
    'on_delivery',
  ])
  for (const method of bridge.CORE_V2_OFFLINE_PAYMENT_METHODS) {
    const { envelope } = await fixture({
      payload: { ...payloadFor('order.create'), paymentMethod: method },
    })
    const parsed = bridge.parseCoreV2OfflineCommandEnvelope(envelope)
    assert.equal(parsed.payload.paymentMethod, method)
    assert.equal(parsed.paymentAttestation.method, method)
    assert.equal(parsed.paymentAttestation.amount, parsed.payload.totalAmount)
    assert.equal(parsed.paymentAttestation.providerStatus, 'unverified')
    assert.equal(parsed.paymentAttestation.paymentProviderActionRequested, false)
  }
})

test('unknown sensitive mismatched and provider-authoritative payment claims reject', async () => {
  const { bridge, envelope } = await fixture()
  for (const paymentAttestation of [
    {
      ...envelope.paymentAttestation,
      providerConfirmation: 'provider_confirmed',
    },
    { ...envelope.paymentAttestation, providerStatus: 'verified' },
    { ...envelope.paymentAttestation, amount: '114.99' },
    { ...envelope.paymentAttestation, unknownField: true },
    { ...envelope.paymentAttestation, pan: 'synthetic' },
  ]) {
    assert.throws(
      () =>
        bridge.parseCoreV2OfflineCommandEnvelope(
          rebindEnvelope(bridge, envelope, { paymentAttestation })
        ),
      /PROVIDER_AUTHORITY_CLAIM_FORBIDDEN|PAYMENT_ATTESTATION_BINDING_MISMATCH|UNKNOWN_OR_MISSING_FIELD/u
    )
  }
  assert.throws(
    () => bridge.canonicalizeOfflineReplayPayload({ cardNumber: 'synthetic' }),
    /FORBIDDEN_PAYLOAD_FIELD/u
  )
})

test('browser authority claims never override unavailable trusted authority', async () => {
  const { bridge, envelope } = await fixture()
  const result = await bridge.qualifyCoreV2OfflineReplay({
    envelope,
    dependencyStates: syncedDependencyStates(envelope),
    existingAcquisition: null,
  })
  assert.equal(result.outcome, 'blocked')
  assert.equal(result.code, 'CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE')
})

test('actor tenant branch and employee correspondence mismatches fail unavailable', async () => {
  for (const override of [
    { primaryAuthenticatedUserId: ids.reviewer },
    { tenantId: ids.reviewer },
    { branchId: ids.reviewer },
    { actualPosEmployeeId: ids.reviewer },
  ]) {
    const { result } = await qualify({}, override)
    assert.equal(result.outcome, 'blocked')
    assert.equal(result.code, 'CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE')
  }
})

test('device mismatch stale generations and revocations fail closed', async () => {
  for (const override of [
    { deviceId: ids.reviewer },
    { deviceGeneration: 2 },
    { employeeEnrollmentGeneration: 2 },
    { commandGeneration: 2 },
  ]) {
    const { result } = await qualify({}, override)
    assert.equal(result.outcome, 'blocked')
    assert.equal(result.code, 'CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE')
  }
  for (const [override, code] of [
    [{ employeeRevoked: true }, 'POS_EMPLOYEE_REVOKED'],
    [{ deviceRevoked: true }, 'DEVICE_REVOKED'],
  ]) {
    const { result } = await qualify({}, override)
    assert.equal(result.outcome, 'blocked')
    assert.equal(result.code, code)
  }
})

test('missing or mismatched trusted inventory frontier is blocked', async () => {
  for (const [override, code] of [
    [{ inventoryFrontier: null }, 'TRUSTED_INVENTORY_FRONTIER_UNAVAILABLE'],
    [
      {
        inventoryFrontier: {
          ...authority().inventoryFrontier,
          snapshotId: ids.reviewer,
        },
      },
      'INVENTORY_FRONTIER_MISMATCH',
    ],
  ]) {
    const { result } = await qualify({}, override)
    assert.equal(result.outcome, 'blocked')
    assert.equal(result.code, code)
  }
})

test('inventory zero insufficient and durable restart projections fail closed deterministically', async () => {
  const { bridge, envelope } = await fixture()
  for (const scenario of [
    {
      confirmedStock: 0,
      pendingLocalCommitments: 0,
      syncingLocalCommitments: 0,
      code: 'INVENTORY_LOCAL_AVAILABLE_ZERO',
    },
    {
      confirmedStock: 3,
      pendingLocalCommitments: 2,
      syncingLocalCommitments: 1,
      code: 'INVENTORY_LOCAL_AVAILABLE_ZERO',
    },
    {
      confirmedStock: 3,
      pendingLocalCommitments: 1,
      syncingLocalCommitments: 1,
      requestedQuantity: 2,
      code: 'INVENTORY_QUANTITY_INSUFFICIENT',
    },
  ]) {
    const item = {
      ...envelope.inventoryFrontierReference.items[0],
      requestedQuantity: scenario.requestedQuantity ?? 1,
      pendingLocalCommitments: scenario.pendingLocalCommitments,
      syncingLocalCommitments: scenario.syncingLocalCommitments,
    }
    const adjustedPayload = {
      ...envelope.payload,
      itemReferences: [
        {
          ...envelope.payload.itemReferences[0],
          quantity: item.requestedQuantity,
          grossAmount: `${item.requestedQuantity * 100}.00`,
          discountAllocation: '0.00',
          taxableAmount: `${item.requestedQuantity * 100}.00`,
          vatBasis: `${item.requestedQuantity * 100}.00`,
          vatAmount: `${item.requestedQuantity * 15}.00`,
          lineSubtotal: `${item.requestedQuantity * 100}.00`,
          lineTotal: `${item.requestedQuantity * 115}.00`,
        },
      ],
      subtotalAmount: `${item.requestedQuantity * 100}.00`,
      taxAmount: `${item.requestedQuantity * 15}.00`,
      totalAmount: `${item.requestedQuantity * 115}.00`,
    }
    const payloadCanonicalHash = bridge.sha256OfflineReplayPayload(
      bridge.canonicalizeOfflineReplayPayload(adjustedPayload)
    )
    const paymentAttestation = {
      ...envelope.paymentAttestation,
      amount: adjustedPayload.totalAmount,
    }
    const adjusted = rebindEnvelope(bridge, envelope, {
      payload: adjustedPayload,
      payloadCanonicalHash,
      paymentAttestation,
      inventoryFrontierReference: {
        ...envelope.inventoryFrontierReference,
        items: [item],
      },
    })
    const result = await bridge.qualifyCoreV2OfflineReplay(
      {
        envelope: adjusted,
        dependencyStates: syncedDependencyStates(adjusted),
        existingAcquisition: null,
      },
      resolver(
        authority({
          inventoryFrontier: {
            ...authority().inventoryFrontier,
            items: [
              {
                catalogItemId: ids.item,
                confirmedStock: scenario.confirmedStock,
              },
            ],
          },
        })
      )
    )
    assert.equal(result.code, scenario.code)
  }

  const serializedProjection = JSON.stringify(
    envelope.inventoryFrontierReference
  )
  const reconstructed = JSON.parse(serializedProjection)
  assert.deepEqual(reconstructed, envelope.inventoryFrontierReference)
  assert.equal(
    bridge.calculateCoreV2OfflineLocalAvailableQuantity({
      lastConfirmedBranchStock: 10,
      pendingLocalCommitments:
        reconstructed.items[0].pendingLocalCommitments,
      syncingLocalCommitments:
        reconstructed.items[0].syncingLocalCommitments,
    }),
    10
  )
})

test('first acquisition and duplicate receipt contracts are stable', async () => {
  const { bridge, envelope } = await fixture()
  assert.equal(
    bridge.classifyIdempotencyAcquisition(envelope, null).kind,
    'first_acquisition_candidate'
  )
  const receipt = {
    receiptVersion: 1,
    commandContractVersion: envelope.commandContractVersion,
    serverCommandId: ids.serverCommand,
    idempotencyKey: envelope.idempotencyKey,
    payloadCanonicalHash: envelope.payloadCanonicalHash,
    authorityBindingCanonicalHash: envelope.authorityBindingCanonicalHash,
    originAuthorityReference: envelope.originAuthorityReference,
    disposition: 'completed',
    resultCode: 'ORDER_CREATED',
    completedAt: '2026-08-26T10:02:00.000Z',
    responseReference: 'order-0001',
    retryable: false,
  }
  const existingAcquisition = acquisition(envelope, {
    state: 'completed',
    receipt,
  })
  const first = await bridge.qualifyCoreV2OfflineReplay({
    envelope,
    dependencyStates: [],
    existingAcquisition,
  }, resolver())
  const second = await bridge.qualifyCoreV2OfflineReplay({
    envelope,
    dependencyStates: [],
    existingAcquisition,
  }, resolver())
  assert.equal(first.outcome, 'already_processed')
  assert.deepEqual(first.receipt, second.receipt)
  assert.deepEqual(
    bridge.mapCoreV2OfflineReplayOutcome({
      currentState: 'syncing',
      qualification: first,
      transport: 'stable_receipt',
    }),
    {
      state: 'synced',
      retained: true,
      retryable: false,
      receiptVerified: true,
      code: 'ORDER_CREATED',
    }
  )
})

test('stable rejected receipt remains terminal without false synced state', async () => {
  const { bridge, envelope } = await fixture()
  const qualification = await bridge.qualifyCoreV2OfflineReplay({
    envelope,
    dependencyStates: [],
    existingAcquisition: acquisition(envelope, {
      state: 'rejected',
      receipt: {
        receiptVersion: 1,
        commandContractVersion: envelope.commandContractVersion,
        serverCommandId: ids.serverCommand,
        idempotencyKey: envelope.idempotencyKey,
        payloadCanonicalHash: envelope.payloadCanonicalHash,
        authorityBindingCanonicalHash: envelope.authorityBindingCanonicalHash,
        originAuthorityReference: envelope.originAuthorityReference,
        disposition: 'rejected',
        resultCode: 'AUTHORITY_REJECTED',
        completedAt: '2026-08-26T10:02:00.000Z',
        responseReference: null,
        retryable: false,
      },
    }),
  }, resolver())
  const mapped = bridge.mapCoreV2OfflineReplayOutcome({
    currentState: 'syncing',
    qualification,
    transport: 'stable_receipt',
  })
  assert.equal(qualification.code, 'STABLE_REJECTED_RECEIPT')
  assert.equal(mapped.state, 'failed')
  assert.equal(mapped.receiptVerified, true)
  assert.equal(mapped.retained, true)
})

test('same idempotency key with a different payload is a hard conflict', async () => {
  const { bridge, envelope } = await fixture()
  const result = await bridge.qualifyCoreV2OfflineReplay({
    envelope,
    dependencyStates: [],
    existingAcquisition: acquisition(envelope, {
      payloadCanonicalHash: 'f'.repeat(64),
      state: 'in_progress',
      receipt: null,
    }),
  })
  assert.equal(result.outcome, 'conflict')
  assert.equal(result.code, 'IDEMPOTENCY_PAYLOAD_CONFLICT')
})

test('duplicate in progress is retryable without a second authority resolution', async () => {
  const { bridge, envelope } = await fixture()
  let authorityCalls = 0
  const result = await bridge.qualifyCoreV2OfflineReplay(
    {
      envelope,
      dependencyStates: [],
      existingAcquisition: acquisition(envelope, {
        state: 'in_progress',
        receipt: null,
      }),
    },
    {
      resolveBatch: async () => {
        authorityCalls += 1
        return []
      },
    }
  )
  assert.equal(result.outcome, 'temporarily_unavailable')
  assert.equal(result.code, 'IDEMPOTENCY_DUPLICATE_IN_PROGRESS')
  assert.equal(authorityCalls, 0)
})

test('dependency pending blocks while dependency conflict propagates', async () => {
  const dependency = '00000000-0000-4000-8000-000000000012'
  for (const [state, outcome] of [
    ['pending', 'blocked'],
    ['conflict', 'conflict'],
  ]) {
    const { result } = await qualify({
      dependencyReferences: [dependency],
      dependencyStates: [{ localCommandId: dependency, state }],
    })
    assert.equal(result.outcome, outcome)
  }
})

test('qualification order is exact and successful qualification performs no mutation', async () => {
  const { bridge, envelope } = await fixture()
  const trustedResolver = resolver()
  const result = await bridge.qualifyCoreV2OfflineReplay(
    {
      envelope,
      dependencyStates: syncedDependencyStates(envelope),
      existingAcquisition: null,
    },
    trustedResolver
  )
  assert.equal(result.outcome, 'qualified')
  assert.deepEqual(result.checkedStages, bridge.CORE_V2_OFFLINE_QUALIFICATION_STAGES)
  assert.equal(trustedResolver.calls, 1)
})

test('payment attestation conflict and Core availability gates remain explicit', async () => {
  const missingPayment = await qualify({ paymentAttestation: null })
  assert.equal(missingPayment.result.outcome, 'rejected')
  assert.equal(missingPayment.result.code, 'PAYMENT_ATTESTATION_REQUIRED')

  const detectedConflict = await qualify({
    detectedConflict: {
      reasonCode: 'AGGREGATE_VERSION_CONFLICT',
      expectedVersion: '1',
      actualVersion: '2',
      detectedAtServer: '2026-08-26T10:01:00.000Z',
    },
  })
  assert.equal(detectedConflict.result.outcome, 'conflict')
  assert.equal(detectedConflict.result.code, 'AGGREGATE_VERSION_CONFLICT')

  const unavailable = await qualify({}, { coreV2Available: false })
  assert.equal(unavailable.result.outcome, 'temporarily_unavailable')
  assert.equal(unavailable.result.code, 'CORE_V2_OFFLINE_CORE_UNAVAILABLE')
})

test('all eight command payload contracts are exact and canonical', async () => {
  const { bridge } = await fixture()
  for (const commandType of bridge.CORE_V2_OFFLINE_COMMAND_TYPES) {
    const payload = payloadFor(commandType)
    assert.deepEqual(
      bridge.parseCoreV2OfflineCommandPayload(commandType, payload),
      payload
    )
    assert.throws(
      () =>
        bridge.parseCoreV2OfflineCommandPayload(commandType, {
          ...payload,
          invented: true,
        }),
      /UNKNOWN_OR_MISSING_FIELD/u
    )
    const [firstKey] = Object.keys(payload)
    const missing = { ...payload }
    delete missing[firstKey]
    assert.throws(
      () => bridge.parseCoreV2OfflineCommandPayload(commandType, missing),
      /UNKNOWN_OR_MISSING_FIELD/u
    )
    const commandFixture = await fixture({ commandType })
    assert.equal(
      commandFixture.bridge.parseCoreV2OfflineCommandEnvelope(
        commandFixture.envelope
      ).commandType,
      commandType
    )
    assert.throws(
      () =>
        commandFixture.bridge.parseCoreV2OfflineCommandEnvelope({
          ...commandFixture.envelope,
          aggregateType:
            commandFixture.envelope.aggregateType === 'order'
              ? 'customer'
              : 'order',
        }),
      /COMMAND_AGGREGATE_TYPE_MISMATCH|AUTHORITY_BINDING_HASH_MISMATCH/u
    )
  }
  assert.throws(
    () =>
      bridge.parseCoreV2OfflineCommandPayload(
        'order.create',
        payloadFor('customer.create')
      ),
    /UNKNOWN_OR_MISSING_FIELD/u
  )
})

test('order create rejects malformed lines duplicate items and inconsistent money', async () => {
  const { bridge } = await fixture()
  const base = payloadFor('order.create')
  for (const payload of [
    { ...base, itemReferences: [] },
    {
      ...base,
      itemReferences: [{ ...base.itemReferences[0], quantity: 0 }],
    },
    {
      ...base,
      itemReferences: [{ ...base.itemReferences[0], quantity: 1.5 }],
    },
    {
      ...base,
      itemReferences: [base.itemReferences[0], base.itemReferences[0]],
    },
    {
      ...base,
      itemReferences: [{ ...base.itemReferences[0], lineTotal: '99.99' }],
    },
    { ...base, subtotalAmount: '100' },
    { ...base, totalAmount: '116.00' },
  ]) {
    assert.throws(
      () => bridge.parseCoreV2OfflineCommandPayload('order.create', payload),
      /INVALID_ORDER_PAYLOAD|INVALID_ORDER_ITEM_QUANTITY|INVALID_MONEY|DUPLICATE_ORDER_ITEM|ORDER_LINE_TOTAL_MISMATCH|ORDER_TOTALS_MISMATCH/u
    )
  }

  const reversed = {
    ...base,
    itemReferences: [
      {
        ...base.itemReferences[0],
        catalogItemReference: ids.secondItem,
        quantity: 1,
        unitPrice: '50.00',
        grossAmount: '50.00',
        taxableAmount: '50.00',
        vatBasis: '50.00',
        vatAmount: '7.50',
        lineSubtotal: '50.00',
        lineTotal: '57.50',
      },
      base.itemReferences[0],
    ],
    subtotalAmount: '150.00',
    taxAmount: '22.50',
    totalAmount: '172.50',
  }
  const normalized = bridge.parseCoreV2OfflineCommandPayload(
    'order.create',
    reversed
  )
  assert.deepEqual(
    normalized.itemReferences.map((item) => item.catalogItemReference),
    [ids.item, ids.secondItem]
  )
})

test('envelope semantics bind aggregate frontier payment and irrelevant authority fields', async () => {
  const { bridge, envelope } = await fixture()
  for (const changed of [
    { aggregateType: 'customer' },
    { aggregateId: ids.customer },
    {
      inventoryFrontierReference: {
        ...envelope.inventoryFrontierReference,
        items: [],
      },
    },
    {
      inventoryFrontierReference: {
        ...envelope.inventoryFrontierReference,
        items: [
          ...envelope.inventoryFrontierReference.items,
          {
            catalogItemId: ids.secondItem,
            requestedQuantity: 1,
            pendingLocalCommitments: 0,
            syncingLocalCommitments: 0,
          },
        ],
      },
    },
    {
      paymentAttestation: {
        ...envelope.paymentAttestation,
        orderAggregateReference: ids.customer,
      },
    },
    {
      paymentAttestation: {
        ...envelope.paymentAttestation,
        method: 'cash',
      },
    },
    {
      paymentAttestation: {
        ...envelope.paymentAttestation,
        amount: '100.00',
      },
    },
  ]) {
    assert.throws(
      () => bridge.parseCoreV2OfflineCommandEnvelope({ ...envelope, ...changed }),
      /COMMAND_AGGREGATE_TYPE_MISMATCH|COMMAND_AGGREGATE_IDENTITY_MISMATCH|INVALID_INVENTORY_FRONTIER_REFERENCE|INVENTORY_FRONTIER_ITEM_SET_MISMATCH|PAYMENT_ATTESTATION_BINDING_MISMATCH|AUTHORITY_BINDING_HASH_MISMATCH/u
    )
  }

  const customerFixture = await fixture({ commandType: 'customer.create' })
  assert.throws(
    () =>
      customerFixture.bridge.parseCoreV2OfflineCommandEnvelope({
        ...customerFixture.envelope,
        paymentAttestation: envelope.paymentAttestation,
      }),
    /IRRELEVANT_PAYMENT_ATTESTATION|AUTHORITY_BINDING_HASH_MISMATCH/u
  )
  assert.throws(
    () =>
      customerFixture.bridge.parseCoreV2OfflineCommandEnvelope({
        ...customerFixture.envelope,
        inventoryFrontierReference: envelope.inventoryFrontierReference,
      }),
    /IRRELEVANT_INVENTORY_FRONTIER|AUTHORITY_BINDING_HASH_MISMATCH/u
  )
})

test('stable receipts require current trusted authority and exact acquisition scope', async () => {
  const { bridge, envelope } = await fixture()
  const completed = acquisition(envelope, {
    state: 'completed',
    receipt: {
      receiptVersion: 1,
      commandContractVersion: envelope.commandContractVersion,
      serverCommandId: ids.serverCommand,
      idempotencyKey: envelope.idempotencyKey,
      payloadCanonicalHash: envelope.payloadCanonicalHash,
      authorityBindingCanonicalHash: envelope.authorityBindingCanonicalHash,
      originAuthorityReference: envelope.originAuthorityReference,
      disposition: 'completed',
      resultCode: 'ORDER_CREATED',
      completedAt: '2026-08-26T10:02:00.000Z',
      responseReference: 'order-0001',
      retryable: false,
    },
  })
  const trustedResolver = resolver()
  const replay = await bridge.qualifyCoreV2OfflineReplay(
    {
      envelope,
      dependencyStates: [],
      existingAcquisition: completed,
    },
    trustedResolver
  )
  assert.equal(replay.outcome, 'already_processed')
  assert.equal(trustedResolver.calls, 1)

  const noAuthority = await bridge.qualifyCoreV2OfflineReplay({
    envelope,
    dependencyStates: [],
    existingAcquisition: completed,
  })
  assert.equal(noAuthority.outcome, 'blocked')
  assert.equal(noAuthority.code, bridge.CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE)
  assert.equal(noAuthority.receipt, null)

  for (const [changed, code] of [
    [{ primaryAuthenticatedUserId: ids.reviewer }, 'ACQUISITION_AUTHENTICATED_ACTOR_CONFLICT'],
    [{ tenantId: ids.otherTenant }, 'ACQUISITION_TENANT_CONFLICT'],
    [{ branchId: ids.otherBranch }, 'ACQUISITION_BRANCH_CONFLICT'],
    [{ actualPosEmployeeId: ids.otherEmployee }, 'ACQUISITION_POS_EMPLOYEE_CONFLICT'],
    [{ deviceId: ids.otherDevice }, 'ACQUISITION_DEVICE_CONFLICT'],
    [{ deviceGeneration: 2 }, 'ACQUISITION_GENERATION_CONFLICT'],
    [{ commandType: 'customer.create' }, 'ACQUISITION_COMMAND_TYPE_CONFLICT'],
  ]) {
    const conflict = await bridge.qualifyCoreV2OfflineReplay({
      envelope,
      dependencyStates: [],
      existingAcquisition: acquisition(envelope, changed),
    })
    assert.equal(
      conflict.outcome,
      'conflict',
      JSON.stringify({ changed, conflict })
    )
    assert.equal(conflict.code, code)
  }
})

test('receipt identity mismatch and malformed acquisition records fail closed', async () => {
  const { bridge, envelope } = await fixture()
  const mismatchedReceipt = await bridge.qualifyCoreV2OfflineReplay({
    envelope,
    dependencyStates: [],
    existingAcquisition: acquisition(envelope, {
      state: 'completed',
      receipt: {
        receiptVersion: 1,
        commandContractVersion: envelope.commandContractVersion,
        serverCommandId: ids.reviewer,
        idempotencyKey: envelope.idempotencyKey,
        payloadCanonicalHash: envelope.payloadCanonicalHash,
        authorityBindingCanonicalHash: envelope.authorityBindingCanonicalHash,
        originAuthorityReference: envelope.originAuthorityReference,
        disposition: 'completed',
        resultCode: 'ORDER_CREATED',
        completedAt: '2026-08-26T10:02:00.000Z',
        responseReference: null,
        retryable: false,
      },
    }),
  })
  assert.equal(mismatchedReceipt.outcome, 'conflict')
  assert.equal(mismatchedReceipt.code, 'RECEIPT_IDENTITY_CONFLICT')

  assert.throws(
    () =>
      bridge.parseExistingIdempotencyAcquisition({
        ...acquisition(envelope),
        invented: true,
      }),
    /UNKNOWN_OR_MISSING_FIELD/u
  )
  const invalidLookup = await bridge.qualifyCoreV2OfflineReplay({
    envelope,
    dependencyStates: [],
    existingAcquisition: acquisition(envelope, {
      idempotencyKey: 'different-key',
    }),
  })
  assert.equal(invalidLookup.outcome, 'rejected')
  assert.equal(invalidLookup.code, 'IDEMPOTENCY_LOOKUP_IDENTITY_INVALID')
})

test('authority resolution validation rejects malformed snapshots and isolates candidates', async () => {
  const first = await fixture()
  const second = await fixture({
    localCommandId: '00000000-0000-4000-8000-000000000022',
    idempotencyKey: 'offline-order-0002',
  })
  const inputs = [first, second].map(({ envelope }) => ({
    envelope,
    dependencyStates: syncedDependencyStates(envelope),
    existingAcquisition: null,
  }))
  const mixed = await first.bridge.qualifyCoreV2OfflineReplayBatch(inputs, {
    resolveBatch: async (claims) => claims.map((claim, index) => ({
      position: claim.position,
      claimBindingHash: claim.claimBindingHash,
      available: true,
      authority:
        index === 0 ? { ...authority(), invented: true } : authority(),
    })),
  })
  assert.equal(mixed[0].code, first.bridge.CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE)
  assert.equal(mixed[1].outcome, 'qualified')

  for (const malformedAuthority of [
    { ...authority(), employeeRevoked: 'false' },
    { ...authority(), deviceGeneration: 0 },
    { ...authority(), resolvedAtServer: 'not-a-time' },
    {
      ...authority(),
      supportedCommandTypes: ['order.create', 'order.create'],
    },
    {
      ...authority(),
      inventoryFrontier: {
        ...authority().inventoryFrontier,
        items: [
          authority().inventoryFrontier.items[0],
          authority().inventoryFrontier.items[0],
        ],
      },
    },
  ]) {
    const [blocked] = await first.bridge.qualifyCoreV2OfflineReplayBatch(
      [inputs[0]],
      {
        resolveBatch: async (claims) => claims.map((claim) => ({
          position: claim.position,
          claimBindingHash: claim.claimBindingHash,
          available: true,
          authority: malformedAuthority,
        })),
      }
    )
    assert.equal(blocked.outcome, 'blocked')
    assert.equal(
      blocked.code,
      first.bridge.CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE
    )
  }
})

test('authority resolver count order undefined and oversized outputs fail closed', async () => {
  const first = await fixture()
  const second = await fixture({
    localCommandId: '00000000-0000-4000-8000-000000000023',
    idempotencyKey: 'offline-order-0003',
    tenantId: ids.otherTenant,
    branchId: ids.otherBranch,
    inventoryFrontierReference: {
      ...first.envelope.inventoryFrontierReference,
      tenantId: ids.otherTenant,
      branchId: ids.otherBranch,
    },
  })
  const inputs = [first, second].map(({ envelope }) => ({
    envelope,
    dependencyStates: syncedDependencyStates(envelope),
    existingAcquisition: null,
  }))
  const allBlocked = async (resolveBatch) => {
    const results = await first.bridge.qualifyCoreV2OfflineReplayBatch(
      inputs,
      { resolveBatch }
    )
    assert.equal(
      results.every(
        (entry) =>
          entry.outcome === 'blocked' &&
          entry.code === first.bridge.CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE
      ),
      true
    )
  }
  await allBlocked(async () => [])
  await allBlocked(async () => {
    throw new Error('synthetic resolver failure')
  })
  await allBlocked(async () => [undefined, undefined])
  await allBlocked(async (claims) => claims.map(() => ({
    position: claims[0].position,
    claimBindingHash: claims[0].claimBindingHash,
    available: true,
    authority: authority(),
  })))
  await allBlocked(async (claims) => [
    {
      position: claims[1].position,
      claimBindingHash: claims[1].claimBindingHash,
      available: true,
      authority: authority({
        tenantId: ids.otherTenant,
        branchId: ids.otherBranch,
        inventoryFrontier: {
          ...authority().inventoryFrontier,
          tenantId: ids.otherTenant,
          branchId: ids.otherBranch,
        },
      }),
    },
    {
      position: claims[0].position,
      claimBindingHash: claims[0].claimBindingHash,
      available: true,
      authority: authority(),
    },
  ])

  const oversizedItems = Array.from({ length: 201 }, (_, index) => ({
    catalogItemId: `00000000-0000-4000-8${String(index).padStart(3, '0')}-000000000099`,
    confirmedStock: 1,
  }))
  const [oversized] = await first.bridge.qualifyCoreV2OfflineReplayBatch(
    [inputs[0]],
    {
      resolveBatch: async (claims) => claims.map((claim) => ({
          position: claim.position,
          claimBindingHash: claim.claimBindingHash,
          available: true,
          authority: authority({
            inventoryFrontier: {
              ...authority().inventoryFrontier,
              items: oversizedItems,
            },
          }),
        })),
    }
  )
  assert.equal(oversized.code, first.bridge.CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE)
})

test('batch qualification resolves authority once for 1000 commands', async () => {
  const { bridge, envelope } = await fixture()
  const trustedResolver = resolver()
  const inputs = Array.from({ length: 1000 }, (_, index) => ({
    envelope: rebindEnvelope(bridge, envelope, {
      localCommandId: `00000000-0000-4000-8${String(index).padStart(3, '0')}-000000000001`,
      idempotencyKey: `offline-${index}`,
    }),
    dependencyStates: syncedDependencyStates(envelope),
    existingAcquisition: null,
  }))
  const results = await bridge.qualifyCoreV2OfflineReplayBatch(inputs, trustedResolver)
  assert.equal(results.length, 1000)
  assert.equal(results.every((entry) => entry.outcome === 'qualified'), true)
  assert.equal(trustedResolver.calls, 1)
})

test('synced requires a verified stable receipt and retry paths retain the command', async () => {
  const { bridge, envelope } = await fixture()
  const qualified = await bridge.qualifyCoreV2OfflineReplay(
    {
      envelope,
      dependencyStates: syncedDependencyStates(envelope),
      existingAcquisition: null,
    },
    resolver()
  )
  for (const transport of [
    'aborted',
    'timeout',
    'unknown_response',
    'http_2xx_without_receipt',
  ]) {
    const mapped = bridge.mapCoreV2OfflineReplayOutcome({
      currentState: 'syncing',
      qualification: qualified,
      transport,
    })
    assert.equal(mapped.state, 'pending')
    assert.equal(mapped.retained, true)
    assert.equal(mapped.receiptVerified, false)
  }
})

test('review container enforces compare-and-set resolution', async () => {
  const { bridge, envelope } = await fixture()
  const parsed = bridge.parseCoreV2OfflineCommandEnvelope(envelope)
  const container = bridge.createCoreV2OfflineReviewContainer({
    reviewId: ids.review,
    reasonCode: 'INVENTORY_CONFLICT',
    envelope: parsed,
    authority: authority(),
    conflictSnapshot: {
      reasonCode: 'INVENTORY_CONFLICT',
      expectedVersion: 'frontier-1',
      actualVersion: 'frontier-2',
      detectedAtServer: '2026-08-26T10:02:00.000Z',
    },
  })
  const resolved = bridge.resolveCoreV2OfflineReviewContainer(container, {
    expectedVersion: 1,
    reviewerState: 'rejected',
    reviewerId: ids.reviewer,
    resolvedAt: '2026-08-26T10:03:00.000Z',
    resolutionCode: 'REJECTED_BY_REVIEWER',
  })
  assert.equal(resolved.compareAndSetVersion, 2)
  assert.throws(
    () =>
      bridge.resolveCoreV2OfflineReviewContainer(resolved, {
        expectedVersion: 1,
        reviewerState: 'accepted',
        reviewerId: ids.reviewer,
        resolvedAt: '2026-08-26T10:04:00.000Z',
        resolutionCode: 'ACCEPTED_BY_REVIEWER',
      }),
    /REVIEW_CAS_CONFLICT/u
  )
})

test('external effect identities are deterministic unique and never executable', async () => {
  const { bridge } = await fixture()
  const intents = ['whatsapp', 'printing', 'notification', 'other'].map(
    (effectType, index) =>
      bridge.createCoreV2OfflineExternalEffectIntent({
        serverCommandId: ids.serverCommand,
        effectType,
        effectVersion: index + 1,
        payloadReference: `effect-${index + 1}`,
      })
  )
  assert.equal(new Set(intents.map((intent) => intent.identity)).size, 4)
  assert.equal(intents.every((intent) => intent.executionAllowed === false), true)
})

test('all seven non-pilot commands remain shadow contracts with dispatch forbidden', async () => {
  for (const [commandType, aggregateType] of [
    ['order.status.change', 'order'],
    ['customer.create', 'customer'],
    ['customer.update', 'customer'],
    ['payment.employee_attestation', 'payment'],
    ['audit.event.append', 'audit'],
    ['order.cancel', 'order'],
    ['payment.refund', 'payment'],
  ]) {
    const { bridge, result } = await qualify(
      {
        commandType,
        aggregateType,
      },
      { supportedCommandTypes: [commandType] }
    )
    assert.equal(result.outcome, 'blocked')
    assert.equal(result.code, 'PILOT_COMMAND_DISPATCH_BLOCKED')
    assert.equal(
      bridge.getCoreV2OfflinePilotCommandMode(commandType),
      'shadow_mode_dispatch_forbidden'
    )
  }
})

test('all mutation flags are immutable false and source has no side-effect calls', async () => {
  const bridge = await importBridge()
  assert.equal(Object.values(bridge.CORE_V2_OFFLINE_BRIDGE_FLAGS).length, 12)
  assert.equal(Object.values(bridge.CORE_V2_OFFLINE_BRIDGE_FLAGS).every((v) => v === false), true)
  const source = await readFile(sourcePath, 'utf8')
  assert.doesNotMatch(source, /process\.env|\bfetch\s*\(|\.rpc\s*\(|supabase|service.?role|setInterval/u)
  assert.match(
    source,
    /at-least-once transport with idempotent server acquisition and stable receipt replay/u
  )
})

test('synthetic qualification measurements cover 10 100 and 1000 commands', async () => {
  const { bridge, envelope } = await fixture()
  const measurements = []
  for (const count of [10, 100, 1000]) {
    const batchResolver = resolver()
    const inputs = Array.from({ length: count }, (_, index) => ({
      envelope: rebindEnvelope(bridge, envelope, {
        localCommandId: `00000000-0000-4000-8${String(index).padStart(3, '0')}-000000000002`,
        idempotencyKey: `measure-${count}-${index}`,
      }),
      dependencyStates: syncedDependencyStates(envelope),
      existingAcquisition: null,
    }))
    const startedAt = performance.now()
    const results = await bridge.qualifyCoreV2OfflineReplayBatch(inputs, batchResolver)
    measurements.push({
      count,
      durationMs: performance.now() - startedAt,
      authorityBatchCalls: batchResolver.calls,
    })
    assert.equal(results.every((entry) => entry.outcome === 'qualified'), true)
    assert.equal(batchResolver.calls, 1)
  }
  console.log(`CORE_V2_OFFLINE_SYNTHETIC_MEASUREMENTS=${JSON.stringify(measurements)}`)
})
