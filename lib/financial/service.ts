import 'server-only'

import {
  coreV2FinancialQuotesEnabled,
  coreV2FinancialShadowEnabled,
} from '@/lib/core-v2-flags'
import {
  DEFAULT_QUOTE_TTL_MS,
  FINANCIAL_ENGINE_VERSION,
  FINANCIAL_QUOTE_VERSION,
  FINANCIAL_REQUEST_VERSION,
  FINANCIAL_ROUNDING_VERSION,
  MAX_QUOTE_ITEMS,
  FinancialCoreError,
  addDecimal,
  buildFinancialSnapshot,
  decimal,
  decimalToMoneyString,
  divideDecimal,
  fingerprintFinancialQuote,
  fingerprintQuoteRequest,
  formatCanonicalMoney,
  isQuoteExpired,
  maxDecimal,
  minDecimal,
  multiplyDecimal,
  subtractDecimal,
  type FinancialPriceSource,
  type FinancialQuote,
  type FinancialQuoteItem,
  type FinancialQuoteRequest,
  type FinancialRuleVersions,
  type FinancialSnapshot,
} from '@/lib/financial/core'

export type FinancialCatalogRecord = {
  id: string
  tenantId: string
  name: string
  category: string | null
  itemType: 'product' | 'service'
  defaultPrice: string | number | null
  costPrice: string | number | null
  isActive: boolean
  deletedAt: string | null
  updatedAt: string
}

export type FinancialBranchPriceRecord = {
  id: string
  tenantId: string
  branchId: string
  catalogItemId: string
  price: string | number | null
  isActive: boolean
  updatedAt: string
}

export type FinancialVatRecord = {
  id: string
  tenantId: string
  branchId: string | null
  rate: string | number
  isActive: boolean
  updatedAt: string
}

export type FinancialDiscountRecord = {
  id: string
  tenantId: string
  branchId: string | null
  name: string
  type: 'percentage' | 'fixed'
  value: string | number
  isActive: boolean
  deletedAt: string | null
  updatedAt: string
}

export type FinancialConfiguration = {
  catalog: FinancialCatalogRecord[]
  branchPrices: FinancialBranchPriceRecord[]
  vat: FinancialVatRecord[]
  discounts: FinancialDiscountRecord[]
  ruleVersions: Omit<FinancialRuleVersions, 'rounding'>
}

export type FutureFinancialQuoteAdapter = {
  resolve(request: FinancialQuoteRequest): Promise<FinancialQuote | null>
}

export type LegacyFinancialQuoteInput = {
  request: FinancialQuoteRequest
  configuration: FinancialConfiguration
  requestFingerprint?: string
  now?: Date
  ttlMs?: number
}

export type FinancialShadowDifference = {
  field:
    | 'price_source'
    | 'unit_price'
    | 'subtotal'
    | 'discount'
    | 'taxable_subtotal'
    | 'vat'
    | 'total'
  line?: number
  legacy: string
  shadow: string
}

export type FinancialQuoteResolution =
  | {
      source: 'core-v2'
      quote: FinancialQuote
      snapshot: FinancialSnapshot
    }
  | {
      source: 'legacy'
      quote: FinancialQuote
      snapshot: FinancialSnapshot
      shadowDifferences: FinancialShadowDifference[]
    }

const ZERO = decimal('0')
const ONE_HUNDRED = decimal('100')
const SUPPORTED_PAYMENT_METHODS = new Set([
  'cash',
  'card',
  'transfer',
  'mada',
  'visa',
  'cod',
  'on_delivery',
])

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().normalize('NFC')
  return normalized || null
}

export function buildFinancialQuoteRequest(input: {
  tenantId: string
  branchId: string
  actor: FinancialQuoteRequest['actor']
  customerId?: string | null
  items: Array<{ catalogItemId: string; quantity: number }>
  discountId?: string | null
  paymentMethod: string
  amountTendered?: string | number | null
  note?: string | null
}): FinancialQuoteRequest {
  if (input.items.length === 0 || input.items.length > MAX_QUOTE_ITEMS) {
    throw new FinancialCoreError(
      'CART_LIMIT_EXCEEDED',
      'Financial quote cart size is outside the supported range'
    )
  }

  const items = input.items.map((item, index) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new FinancialCoreError(
        'INVALID_QUANTITY',
        'Financial quote quantity must be a positive integer'
      )
    }

    return {
      line: index + 1,
      catalogItemId: item.catalogItemId.trim(),
      quantity: item.quantity,
    }
  })

  return {
    requestVersion: FINANCIAL_REQUEST_VERSION,
    tenantId: input.tenantId,
    branchId: input.branchId,
    actor: input.actor,
    customerId: input.customerId || null,
    items,
    discountId: input.discountId || null,
    paymentMethod: input.paymentMethod.trim().toLowerCase(),
    amountTendered:
      input.amountTendered === null || input.amountTendered === undefined
        ? null
        : formatCanonicalMoney(input.amountTendered),
    note: normalizeOptionalText(input.note),
  }
}

function resolvePrice(
  request: FinancialQuoteRequest,
  configuration: FinancialConfiguration,
  catalogItemId: string
) {
  const catalog = configuration.catalog.filter(
    (item) =>
      item.id === catalogItemId &&
      item.tenantId === request.tenantId &&
      item.isActive &&
      !item.deletedAt
  )
  if (catalog.length !== 1) {
    throw new FinancialCoreError(
      catalog.length > 1
        ? 'PRICE_CONFIGURATION_AMBIGUOUS'
        : 'PRICE_NOT_FOUND',
      'Authoritative catalog price could not be resolved'
    )
  }

  const overrides = configuration.branchPrices.filter(
    (item) =>
      item.catalogItemId === catalogItemId &&
      item.tenantId === request.tenantId &&
      item.branchId === request.branchId &&
      item.isActive
  )
  if (overrides.length > 1) {
    throw new FinancialCoreError(
      'PRICE_CONFIGURATION_AMBIGUOUS',
      'Multiple active branch prices were found'
    )
  }

  const source: FinancialPriceSource = overrides[0]
    ? 'branch_override'
    : 'catalog_default'
  const rawPrice = overrides[0]?.price ?? catalog[0].defaultPrice
  if (rawPrice === null || rawPrice === undefined) {
    throw new FinancialCoreError(
      'PRICE_NOT_FOUND',
      'Authoritative price is missing'
    )
  }

  const price = decimal(rawPrice)
  if (price.scaled < BigInt(0)) {
    throw new FinancialCoreError(
      'PRICE_NOT_FOUND',
      'Authoritative price is invalid'
    )
  }

  return { catalog: catalog[0], override: overrides[0] || null, price, source }
}

function resolveVat(
  request: FinancialQuoteRequest,
  configuration: FinancialConfiguration
) {
  const candidates = configuration.vat.filter(
    (row) => row.tenantId === request.tenantId && row.isActive
  )
  const branchRows = candidates.filter(
    (row) => row.branchId === request.branchId
  )
  const tenantRows = candidates.filter((row) => row.branchId === null)
  const effective = branchRows.length > 0 ? branchRows : tenantRows

  if (effective.length === 0) {
    throw new FinancialCoreError(
      'VAT_CONFIGURATION_MISSING',
      'Effective VAT configuration is missing'
    )
  }
  if (effective.length > 1) {
    throw new FinancialCoreError(
      'VAT_CONFIGURATION_AMBIGUOUS',
      'Effective VAT configuration is ambiguous'
    )
  }

  const rate = decimal(effective[0].rate)
  if (rate.scaled < BigInt(0) || rate.scaled > ONE_HUNDRED.scaled) {
    throw new FinancialCoreError(
      'VAT_CONFIGURATION_AMBIGUOUS',
      'Effective VAT rate is invalid'
    )
  }

  return { record: effective[0], rate }
}

function resolveDiscount(
  request: FinancialQuoteRequest,
  configuration: FinancialConfiguration,
  subtotal: ReturnType<typeof decimal>
) {
  if (!request.discountId) {
    return { record: null, amount: ZERO }
  }

  const candidates = configuration.discounts.filter(
    (row) =>
      row.id === request.discountId &&
      row.tenantId === request.tenantId &&
      (row.branchId === null || row.branchId === request.branchId) &&
      row.isActive &&
      !row.deletedAt
  )
  if (candidates.length === 0) {
    throw new FinancialCoreError(
      'DISCOUNT_NOT_FOUND',
      'Requested discount was not found'
    )
  }
  if (candidates.length > 1) {
    throw new FinancialCoreError(
      'DISCOUNT_NOT_ELIGIBLE',
      'Requested discount is ambiguous'
    )
  }

  const record = candidates[0]
  const value = decimal(record.value)
  if (
    value.scaled < BigInt(0) ||
    (record.type === 'percentage' && value.scaled > ONE_HUNDRED.scaled)
  ) {
    throw new FinancialCoreError(
      'DISCOUNT_NOT_ELIGIBLE',
      'Requested discount configuration is invalid'
    )
  }

  const amount =
    record.type === 'percentage'
      ? divideDecimal(multiplyDecimal(subtotal, value), ONE_HUNDRED)
      : minDecimal(subtotal, value)

  return { record, amount }
}

function resolvePayment(
  method: string,
  amountTendered: string | null,
  total: ReturnType<typeof decimal>
) {
  if (!SUPPORTED_PAYMENT_METHODS.has(method)) {
    throw new FinancialCoreError(
      'PAYMENT_METHOD_UNSUPPORTED',
      'Payment method is unsupported'
    )
  }

  const tendered = amountTendered ? maxDecimal(decimal(amountTendered), ZERO) : ZERO
  const isCard = method === 'card' || method === 'mada' || method === 'visa'
  const isDelivery = method === 'cod' || method === 'on_delivery'
  const cashReceived = isCard
    ? total
    : method === 'transfer'
      ? ZERO
      : isDelivery
        ? minDecimal(tendered, total)
        : tendered
  const remaining =
    method === 'cash' || isDelivery || method === 'transfer'
      ? maxDecimal(subtractDecimal(total, cashReceived), ZERO)
      : ZERO
  const change =
    method === 'cash'
      ? maxDecimal(subtractDecimal(cashReceived, total), ZERO)
      : ZERO

  return {
    method,
    cashReceived: decimalToMoneyString(cashReceived),
    remainingFromCustomer: decimalToMoneyString(remaining),
    cashChange: decimalToMoneyString(change),
  }
}

function allocateDiscount(
  items: Array<FinancialQuoteItem & { grossDecimal: ReturnType<typeof decimal> }>,
  subtotal: ReturnType<typeof decimal>,
  discount: ReturnType<typeof decimal>
) {
  let allocated = ZERO

  return items.map((item, index) => {
    const isLast = index === items.length - 1
    const share =
      subtotal.scaled === BigInt(0)
        ? ZERO
        : isLast
          ? subtractDecimal(discount, allocated)
          : decimal(
              decimalToMoneyString(
                divideDecimal(
                  multiplyDecimal(discount, item.grossDecimal),
                  subtotal
                )
              )
            )
    allocated = addDecimal(allocated, share)
    const taxable = maxDecimal(subtractDecimal(item.grossDecimal, share), ZERO)

    const { grossDecimal: _grossDecimal, ...publicItem } = item
    void _grossDecimal
    return {
      ...publicItem,
      discountAmount: decimalToMoneyString(share),
      taxableLineAmount: decimalToMoneyString(taxable),
    }
  })
}

export function calculateLegacyCompatibleQuote({
  request,
  configuration,
  requestFingerprint: trustedRequestFingerprint,
  now = new Date(),
  ttlMs = DEFAULT_QUOTE_TTL_MS,
}: LegacyFinancialQuoteInput): FinancialQuote {
  const requestFingerprint =
    trustedRequestFingerprint || fingerprintQuoteRequest(request)
  const provisionalItems = request.items.map((intent) => {
    const resolved = resolvePrice(
      request,
      configuration,
      intent.catalogItemId
    )
    const quantity = decimal(intent.quantity)
    const gross = multiplyDecimal(resolved.price, quantity)

    return {
      line: intent.line,
      catalogItemId: resolved.catalog.id,
      nameSnapshot: resolved.catalog.name,
      categorySnapshot: resolved.catalog.category,
      typeSnapshot: resolved.catalog.itemType,
      quantity: intent.quantity,
      unitPrice: decimalToMoneyString(resolved.price),
      priceSource: resolved.source,
      sourceCatalogUpdatedAt: resolved.catalog.updatedAt,
      sourceBranchPriceId: resolved.override?.id || null,
      sourceBranchPriceUpdatedAt: resolved.override?.updatedAt || null,
      grossLineAmount: decimalToMoneyString(gross),
      discountAmount: '0.00',
      taxableLineAmount: decimalToMoneyString(gross),
      costSnapshot:
        resolved.catalog.costPrice === null
          ? null
          : formatCanonicalMoney(resolved.catalog.costPrice),
      grossDecimal: gross,
    }
  })
  const subtotal = provisionalItems.reduce(
    (sum, item) => addDecimal(sum, item.grossDecimal),
    ZERO
  )
  const discount = resolveDiscount(request, configuration, subtotal)
  const taxableSubtotal = maxDecimal(
    subtractDecimal(subtotal, discount.amount),
    ZERO
  )
  const vat = resolveVat(request, configuration)
  const vatAmount = divideDecimal(
    multiplyDecimal(taxableSubtotal, vat.rate),
    ONE_HUNDRED
  )
  const total = addDecimal(taxableSubtotal, vatAmount)
  const items = allocateDiscount(
    provisionalItems,
    subtotal,
    discount.amount
  )
  const ruleVersions: FinancialRuleVersions = {
    ...configuration.ruleVersions,
    rounding: FINANCIAL_ROUNDING_VERSION,
  }
  const createdAt = now.toISOString()
  const quoteWithoutFingerprint: Omit<FinancialQuote, 'quoteFingerprint'> = {
    quoteVersion: FINANCIAL_QUOTE_VERSION,
    financialEngineVersion: FINANCIAL_ENGINE_VERSION,
    requestFingerprint,
    tenantId: request.tenantId,
    branchId: request.branchId,
    currency: 'SAR',
    items,
    subtotal: decimalToMoneyString(subtotal),
    discount: {
      id: discount.record?.id || null,
      name: discount.record?.name || null,
      type: discount.record?.type || null,
      value:
        discount.record === null
          ? null
          : decimalToMoneyString(decimal(discount.record.value)),
      amount: decimalToMoneyString(discount.amount),
      updatedAt: discount.record?.updatedAt || null,
    },
    taxableSubtotal: decimalToMoneyString(taxableSubtotal),
    vat: {
      id: vat.record.id,
      rate: decimalToMoneyString(vat.rate),
      amount: decimalToMoneyString(vatAmount),
      updatedAt: vat.record.updatedAt,
    },
    total: decimalToMoneyString(total),
    payment: resolvePayment(
      request.paymentMethod,
      request.amountTendered,
      total
    ),
    ruleVersions,
    createdAt,
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  }

  return {
    ...quoteWithoutFingerprint,
    quoteFingerprint: fingerprintFinancialQuote(quoteWithoutFingerprint),
  }
}

export function compareFinancialQuotes(
  legacy: FinancialQuote,
  shadow: FinancialQuote
) {
  const differences: FinancialShadowDifference[] = []
  const compare = (
    field: FinancialShadowDifference['field'],
    legacyValue: string,
    shadowValue: string,
    line?: number
  ) => {
    if (legacyValue !== shadowValue) {
      differences.push({
        field,
        line,
        legacy: legacyValue,
        shadow: shadowValue,
      })
    }
  }

  compare('subtotal', legacy.subtotal, shadow.subtotal)
  compare('discount', legacy.discount.amount, shadow.discount.amount)
  compare(
    'taxable_subtotal',
    legacy.taxableSubtotal,
    shadow.taxableSubtotal
  )
  compare('vat', legacy.vat.amount, shadow.vat.amount)
  compare('total', legacy.total, shadow.total)

  legacy.items.forEach((item, index) => {
    const other = shadow.items[index]
    if (!other) {
      compare('unit_price', item.unitPrice, 'missing', item.line)
      return
    }
    compare('price_source', item.priceSource, other.priceSource, item.line)
    compare('unit_price', item.unitPrice, other.unitPrice, item.line)
  })

  return differences
}

export function assertQuoteFresh(
  quote: FinancialQuote,
  currentQuote: FinancialQuote,
  now = Date.now()
) {
  if (isQuoteExpired(quote, now)) {
    throw new FinancialCoreError('QUOTE_STALE', 'Financial quote has expired')
  }
  if (quote.requestFingerprint !== currentQuote.requestFingerprint) {
    throw new FinancialCoreError(
      'QUOTE_FINGERPRINT_CONFLICT',
      'Financial request fingerprint does not match'
    )
  }
  if (quote.quoteFingerprint !== currentQuote.quoteFingerprint) {
    throw new FinancialCoreError(
      'FINANCIAL_CONFIGURATION_CHANGED',
      'Authoritative financial configuration changed'
    )
  }
}

export function createFinancialQuoteService(input: {
  futureAdapter?: FutureFinancialQuoteAdapter
  futureReadsEnabled?: boolean
  shadowEnabled?: boolean
}) {
  const futureReadsEnabled =
    coreV2FinancialQuotesEnabled(input.futureReadsEnabled)
  const shadowEnabled =
    coreV2FinancialShadowEnabled(input.shadowEnabled)

  return {
    async resolve(
      legacyInput: LegacyFinancialQuoteInput
    ): Promise<FinancialQuoteResolution> {
      const legacyQuote = calculateLegacyCompatibleQuote(legacyInput)

      if (!futureReadsEnabled || !input.futureAdapter) {
        return {
          source: 'legacy',
          quote: legacyQuote,
          snapshot: buildFinancialSnapshot(legacyQuote),
          shadowDifferences: [],
        }
      }

      const futureQuote = await input.futureAdapter.resolve(legacyInput.request)
      if (!futureQuote) {
        return {
          source: 'legacy',
          quote: legacyQuote,
          snapshot: buildFinancialSnapshot(legacyQuote),
          shadowDifferences: [],
        }
      }

      if (shadowEnabled) {
        return {
          source: 'legacy',
          quote: legacyQuote,
          snapshot: buildFinancialSnapshot(legacyQuote),
          shadowDifferences: compareFinancialQuotes(
            legacyQuote,
            futureQuote
          ),
        }
      }

      return {
        source: 'core-v2',
        quote: futureQuote,
        snapshot: buildFinancialSnapshot(futureQuote),
      }
    },
    assertFresh: assertQuoteFresh,
  }
}

export function redactFinancialQuoteForLog(quote: FinancialQuote) {
  return {
    requestFingerprint: quote.requestFingerprint.slice(0, 12),
    quoteFingerprint: quote.quoteFingerprint.slice(0, 12),
    tenant: 'redacted',
    branch: 'redacted',
    itemCount: quote.items.length,
    engineVersion: quote.financialEngineVersion,
    quoteVersion: quote.quoteVersion,
  }
}
