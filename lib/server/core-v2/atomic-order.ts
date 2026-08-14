import 'server-only'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CoreV2Result = {
  kind: 'success' | 'in_progress' | 'conflict' | 'reconciliation' | 'failed'
  duplicate: boolean
  snapshot?: Record<string, unknown>
  message: string
}

type CatalogRow = {
  id: string
  code: string
  name: string
  category: string
  item_type: 'product' | 'service'
  default_price: number | string
  updated_at: string
  track_inventory: boolean
}

type BranchPriceRow = {
  id: string
  catalog_item_id: string
  price: number | string
  updated_at: string
}

type Input = {
  actorId: string
  tenantId: string
  branchId: string
  clientRequestId: string
  customerId: string | null
  customerName: string
  normalizedCustomerPhone: string
  paymentMethod: 'cash' | 'mada' | 'visa' | 'cod'
  cashReceived: number
  remainingFromCustomer: number
  cashChange: number
  discountAmount: number
  taxAmount: number
  note: string | null
  items: Array<{ item_id: string; quantity: number; unit_price?: number }>
}

const VERSION = 'p2d22-n03c-v1'

function money(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error('CORE_INPUT_INVALID')
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2)
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('CORE_CANONICAL_NUMBER_INVALID')
    return String(value)
  }
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'))
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort((a, b) =>
      Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
    )
    return `{${keys.map((key) => `${canonicalJson(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new Error('CORE_CANONICAL_TYPE_INVALID')
}

function digest(value: unknown) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

function pgTimestamp(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00(?::?00)?)$/.exec(value)
  if (!match) throw new Error('CORE_TIMESTAMP_INVALID')
  return `${match[1]}T${match[2]}.${(match[3] || '').padEnd(6, '0')}Z`
}

function projection(payload: Record<string, unknown>) {
  const pricing = payload.pricing as Record<string, unknown>
  const payment = payload.payment as Record<string, unknown>
  const versions = payload.versions as Record<string, unknown>
  const projectedLines = (pricing.lines as Array<Record<string, unknown>>).map((line) =>
    Object.fromEntries(Object.entries(line).filter(([key]) => key !== 'net_amount'))
  )
  return {
    ...payload,
    fingerprint_version: undefined,
    metadata: { source_channel: 'pos' },
    payment: Object.fromEntries(Object.entries(payment).filter(([key]) => key !== 'provider_reference')),
    pricing: {
      ...pricing,
      lines: projectedLines,
    },
    versions: Object.fromEntries(Object.entries(versions).filter(([key]) => key !== 'payload_contract')),
  }
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, stripUndefined(entry)]))
  }
  return value
}

function allocate(totalCents: number, weights: number[]) {
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)
  let remaining = totalCents
  return weights.map((weight, index) => {
    const value = index === weights.length - 1 ? remaining : Math.floor(totalCents * weight / weightTotal)
    remaining -= value
    return value
  })
}

async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const response = await client.rpc(name, args)
  if (response.error) throw new Error(`CORE_RPC_${name.toUpperCase()}_FAILED`)
  if (!response.data || typeof response.data !== 'object') throw new Error('CORE_RESPONSE_INVALID')
  return response.data as Record<string, unknown>
}

export async function executeCoreV2AtomicOrder(client: SupabaseClient, input: Input): Promise<CoreV2Result> {
  if (!input.clientRequestId || !input.normalizedCustomerPhone || input.items.length === 0) {
    return { kind: 'failed', duplicate: false, message: 'فشل آمن دون إنشاء طلب.' }
  }

  const customerLookup = await client.rpc('lookup_customer_phone_identity_v1', {
    p_tenant_id: input.tenantId,
    p_normalized_phone: input.normalizedCustomerPhone,
    p_branch_id: input.branchId,
  })
  if (customerLookup.error) throw new Error('CORE_CUSTOMER_LOOKUP_FAILED')
  let customers = Array.isArray(customerLookup.data) ? customerLookup.data as Array<Record<string, unknown>> : []
  if (input.customerId) {
    const selectedCustomers = customers.filter(
      (customer) => customer.customer_id === input.customerId
    )
    if (selectedCustomers.length !== 1) {
      return { kind: 'conflict', duplicate: false, message: 'تعارض في بيانات العميل أو المحاولة.' }
    }
    customers = selectedCustomers
  } else if (customers.length === 0) {
    const created = await client.rpc('create_customer_with_phone_identity_v1', {
      p_tenant_id: input.tenantId,
      p_branch_id: input.branchId,
      p_name: input.customerName,
      p_display_phone: input.normalizedCustomerPhone,
      p_email: null,
      p_notes: null,
    })
    if (created.error) throw new Error('CORE_CUSTOMER_CREATE_FAILED')
    const refreshed = await client.rpc('lookup_customer_phone_identity_v1', {
      p_tenant_id: input.tenantId,
      p_normalized_phone: input.normalizedCustomerPhone,
      p_branch_id: input.branchId,
    })
    if (refreshed.error) throw new Error('CORE_CUSTOMER_LOOKUP_FAILED')
    customers = Array.isArray(refreshed.data) ? refreshed.data as Array<Record<string, unknown>> : []
  }
  if (
    customers.length !== 1 ||
    (!input.customerId && customers[0].resolution_status !== 'RESOLVED')
  ) {
    return { kind: 'conflict', duplicate: false, message: 'تعارض في بيانات العميل أو المحاولة.' }
  }

  const catalogIds = [...new Set(input.items.map((item) => item.item_id))]
  const [catalogResponse, branchPriceResponse, vatResponse] = await Promise.all([
    client.from('catalog_items').select('id,code,name,category,item_type,default_price,updated_at,track_inventory').eq('tenant_id', input.tenantId).in('id', catalogIds),
    client.from('branch_catalog_items').select('id,catalog_item_id,price,updated_at').eq('tenant_id', input.tenantId).eq('branch_id', input.branchId).eq('is_active', true).in('catalog_item_id', catalogIds),
    client.from('vat_settings').select('id,branch_id,rate,updated_at').eq('tenant_id', input.tenantId).eq('is_active', true).or(`branch_id.eq.${input.branchId},branch_id.is.null`),
  ])
  if (catalogResponse.error || branchPriceResponse.error || vatResponse.error) throw new Error('CORE_EVIDENCE_LOOKUP_FAILED')
  const catalog = new Map((catalogResponse.data as CatalogRow[] | null || []).map((row) => [row.id, row]))
  const branchPrices = new Map((branchPriceResponse.data as BranchPriceRow[] | null || []).map((row) => [row.catalog_item_id, row]))
  if (catalog.size !== catalogIds.length) throw new Error('CORE_CATALOG_SCOPE_INVALID')

  const grossCents = input.items.map((entry) => {
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) throw new Error('CORE_QUANTITY_INVALID')
    const row = catalog.get(entry.item_id)!
    const authoritativePrice = Number(branchPrices.get(entry.item_id)?.price ?? row.default_price)
    if (entry.unit_price !== undefined && money(entry.unit_price) !== money(authoritativePrice)) throw new Error('CORE_PRICE_STALE')
    return Math.round(authoritativePrice * 100) * entry.quantity
  })
  const subtotalCents = grossCents.reduce((sum, value) => sum + value, 0)
  const discountCents = Math.round(input.discountAmount * 100)
  if (discountCents < 0 || discountCents > subtotalCents) throw new Error('CORE_DISCOUNT_INVALID')
  const discountAllocations = allocate(discountCents, grossCents)
  const taxableCents = grossCents.map((gross, index) => gross - discountAllocations[index])
  const taxableTotalCents = taxableCents.reduce((sum, value) => sum + value, 0)
  const vatRows = (vatResponse.data || []) as Array<{ id: string; branch_id: string | null; rate: number | string; updated_at: string }>
  const vat = vatRows.find((row) => row.branch_id === input.branchId) || vatRows.find((row) => row.branch_id === null) || null
  const vatRate = vat ? Number(vat.rate) : 0
  const taxTotalCents = Math.round(taxableTotalCents * vatRate / 100)
  if (Math.round(input.taxAmount * 100) !== taxTotalCents) throw new Error('CORE_VAT_STALE')
  const vatAllocations = allocate(taxTotalCents, taxableCents)
  const correlation = `pos:${input.clientRequestId}`.slice(0, 128)
  const quoteFingerprint = digest({ catalogIds, grossCents, discountCents, taxTotalCents, input: input.clientRequestId })
  const lineIds = input.items.map((_, index) => {
    const hash = digest({ request: input.clientRequestId, line: index + 1 })
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
  })
  const payload = {
    payload_version: 'order-command-payload-v1', fingerprint_version: 'order-request-fingerprint-v1', command_type: 'order.create',
    tenant_id: input.tenantId, branch_id: input.branchId, authenticated_actor_id: input.actorId,
    customer: { mode: 'existing', customer_id: customers[0].customer_id, expected_record_version: Number(customers[0].record_version), normalized_phone: null, display_phone: null, name: null, email: null, address: null, notes: null, allowed_update_fields: [], conflict_behavior: 'reject' },
    items: input.items.map((entry, index) => { const row = catalog.get(entry.item_id)!; return { line_id: lineIds[index], line_number: index + 1, catalog_item_id: row.id, name_snapshot: row.name, sku_snapshot: row.code, category_snapshot: row.category, item_type_snapshot: row.item_type, quantity: String(entry.quantity), unit_snapshot: 'item', inventory_tracking_mode: row.track_inventory ? 'tracked_product' : row.item_type === 'service' ? 'service' : 'untracked_product', fulfillment_class: 'immediate', line_note: null, modifiers: [] } }),
    pricing: { currency: 'SAR', currency_precision: 2, subtotal: money(subtotalCents / 100), taxable_subtotal: money(taxableTotalCents / 100), total: money((taxableTotalCents + taxTotalCents) / 100), rounding_strategy: 'invoice-half-up-v1', price_version: VERSION, branch_pricing_version: branchPrices.size ? VERSION : null, quote_reference: correlation, quote_version: 'financial-quote-v1', quote_fingerprint: quoteFingerprint, financial_engine_version: 'financial-engine-v2-r1', lines: input.items.map((entry, index) => { const row = catalog.get(entry.item_id)!; const branchPrice = branchPrices.get(entry.item_id); return { line_id: lineIds[index], unit_price: money(grossCents[index] / entry.quantity / 100), pricing_source: branchPrice ? 'branch_override' : 'catalog_default', source_catalog_id: row.id, source_branch_price_id: branchPrice?.id ?? null, source_catalog_version: pgTimestamp(row.updated_at), source_branch_price_version: branchPrice ? pgTimestamp(branchPrice.updated_at) : null, gross_amount: money(grossCents[index] / 100), discount_allocation: money(discountAllocations[index] / 100), taxable_amount: money(taxableCents[index] / 100), vat_amount: money(vatAllocations[index] / 100), net_amount: money(taxableCents[index] / 100) } }) },
    vat: { mode: vatRate > 0 ? 'exclusive' : 'exempt', tax_inclusive: false, setting_id: vat?.id ?? null, rate: String(vatRate), amount: money(taxTotalCents / 100), rule_version: vat ? pgTimestamp(vat.updated_at) : VERSION, effective_at: vat ? pgTimestamp(vat.updated_at) : '2026-01-01T00:00:00.000000Z' },
    discount: discountCents === 0 ? { id: null, source: 'none', name_snapshot: null, type: null, value: null, amount: '0.00', eligibility_version: null, rule_version: null } : { id: null, source: 'manual', name_snapshot: 'POS discount', type: 'fixed', value: money(discountCents / 100), amount: money(discountCents / 100), eligibility_version: null, rule_version: VERSION },
    payment: { method: input.paymentMethod, amount_tendered: money(input.cashReceived), expected_status: input.paymentMethod === 'cod' ? 'pending' : 'paid', cash_received: input.paymentMethod === 'mada' || input.paymentMethod === 'visa' ? null : money(input.cashReceived), remaining_from_customer: money(input.remainingFromCustomer), cash_change: money(input.cashChange), rule_version: VERSION, provider_reference: null },
    fulfillment: { method: 'immediate', branch_id: input.branchId, requested_at: null, address: null, instructions: null },
    order: { note: input.note }, metadata: { source_channel: 'pos', request_reference: input.clientRequestId, offline_draft_id: null, correlation_id: correlation, device_id: null, pos_terminal_id: null, client_version: null },
    versions: { customer_engine: VERSION, financial_engine: 'financial-engine-v2-r1', inventory_engine: VERSION, numbering_engine: VERSION, authorization_contract: VERSION, payload_contract: 'order-command-payload-v1' },
  }
  const canonicalPayload = canonicalJson(payload)
  const canonicalProjection = canonicalJson(stripUndefined(projection(payload)))
  const acquired = await rpc(client, 'acquire_atomic_order_command_result_v1', { p_authenticated_actor_id: input.actorId, p_tenant_id: input.tenantId, p_branch_id: input.branchId, p_idempotency_key: input.clientRequestId, p_correlation_reference: correlation, p_canonical_payload: canonicalPayload, p_fingerprint_projection: canonicalProjection, p_retain_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
  const acquiredResult = String(acquired.result || '')
  if (acquiredResult === 'replay') return { kind: 'success', duplicate: true, snapshot: acquired.responseSnapshot as Record<string, unknown>, message: 'الطلب نُفذ سابقًا وتم استرجاع نتيجته.' }
  if (acquiredResult === 'in_progress') return { kind: 'in_progress', duplicate: false, message: 'جاري معالجة الطلب.' }
  if (acquiredResult === 'fingerprint_conflict') return { kind: 'conflict', duplicate: false, message: 'تعارض في بيانات المحاولة.' }
  if (acquiredResult !== 'created' || typeof acquired.commandId !== 'string') return { kind: 'failed', duplicate: false, message: 'فشل آمن دون إنشاء طلب.' }
  const commandId = acquired.commandId
  const claimed = await rpc(client, 'claim_atomic_order_command_v1', { p: commandId })
  if (claimed.result !== 'claimed' || typeof claimed.claimToken !== 'string') return { kind: claimed.result === 'reconciliation_required' ? 'reconciliation' : 'failed', duplicate: false, message: 'العملية تحتاج مراجعة ولا يجوز إعادة الإرسال.' }
  try {
    const executed = await rpc(client, 'execute_atomic_order_command_v1', { p: commandId, t: claimed.claimToken })
    if (executed.result === 'succeeded') return { kind: 'success', duplicate: false, snapshot: executed, message: 'تم إنشاء الطلب بنجاح.' }
    if (executed.result === 'reconciliation_required') return { kind: 'reconciliation', duplicate: false, message: 'العملية تحتاج مراجعة ولا يجوز إعادة الإرسال.' }
    return { kind: 'failed', duplicate: false, message: 'فشل آمن دون إنشاء طلب.' }
  } catch {
    const replayed = await rpc(client, 'replay_atomic_order_command_v1', { p: commandId })
    if (replayed.result === 'succeeded' || replayed.result === 'replay') return { kind: 'success', duplicate: true, snapshot: replayed.responseSnapshot as Record<string, unknown> || replayed, message: 'الطلب نُفذ سابقًا وتم استرجاع نتيجته.' }
    return { kind: 'reconciliation', duplicate: false, message: 'العملية تحتاج مراجعة ولا يجوز إعادة الإرسال.' }
  }
}
