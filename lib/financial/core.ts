import 'server-only'

import { createHash } from 'node:crypto'
import { canonicalJson } from '@/lib/idempotency/core'

export const FINANCIAL_ENGINE_VERSION = 'financial-engine-v2-r1' as const
export const FINANCIAL_QUOTE_VERSION = 'financial-quote-v1' as const
export const FINANCIAL_ROUNDING_VERSION = 'invoice-half-up-v1' as const
export const FINANCIAL_REQUEST_VERSION = 'financial-request-v1' as const
export const FINANCIAL_MINOR_SCALE = 2
export const FINANCIAL_CALCULATION_SCALE = 6
export const DEFAULT_QUOTE_TTL_MS = 5 * 60 * 1000
export const MAX_QUOTE_ITEMS = 100

const BIGINT_ZERO = BigInt(0)
const BIGINT_ONE = BigInt(1)
const BIGINT_TWO = BigInt(2)
const BIGINT_TEN = BigInt(10)
const CALCULATION_FACTOR =
  BIGINT_TEN ** BigInt(FINANCIAL_CALCULATION_SCALE)
const MONEY_FACTOR = BIGINT_TEN ** BigInt(FINANCIAL_MINOR_SCALE)
const MONEY_ROUNDING_FACTOR =
  BIGINT_TEN **
  BigInt(FINANCIAL_CALCULATION_SCALE - FINANCIAL_MINOR_SCALE)

export type FinancialErrorCode =
  | 'PRICE_NOT_FOUND'
  | 'PRICE_CONFIGURATION_AMBIGUOUS'
  | 'VAT_CONFIGURATION_MISSING'
  | 'VAT_CONFIGURATION_AMBIGUOUS'
  | 'DISCOUNT_NOT_FOUND'
  | 'DISCOUNT_NOT_ELIGIBLE'
  | 'INVALID_QUANTITY'
  | 'QUOTE_STALE'
  | 'QUOTE_FINGERPRINT_CONFLICT'
  | 'FINANCIAL_CONFIGURATION_CHANGED'
  | 'PAYMENT_METHOD_UNSUPPORTED'
  | 'CART_LIMIT_EXCEEDED'

export class FinancialCoreError extends Error {
  constructor(
    readonly code: FinancialErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'FinancialCoreError'
  }
}

export type DecimalValue = {
  readonly scaled: bigint
}

export type MoneyValue = {
  readonly minor: bigint
}

export type FinancialPriceSource = 'branch_override' | 'catalog_default'

export type FinancialRuleVersions = {
  pricing: string
  vat: string
  discount: string
  rounding: typeof FINANCIAL_ROUNDING_VERSION
}

export type FinancialQuoteRequest = {
  requestVersion: typeof FINANCIAL_REQUEST_VERSION
  tenantId: string
  branchId: string
  actor: {
    type: 'user' | 'pos_employee' | 'system' | 'integration'
    id: string | null
  }
  customerId: string | null
  items: Array<{
    line: number
    catalogItemId: string
    quantity: number
  }>
  discountId: string | null
  paymentMethod: string
  amountTendered: string | null
  note: string | null
}

export type FinancialQuoteItem = {
  line: number
  catalogItemId: string
  nameSnapshot: string
  categorySnapshot: string | null
  typeSnapshot: 'product' | 'service'
  quantity: number
  unitPrice: string
  priceSource: FinancialPriceSource
  sourceCatalogUpdatedAt: string
  sourceBranchPriceId: string | null
  sourceBranchPriceUpdatedAt: string | null
  grossLineAmount: string
  discountAmount: string
  taxableLineAmount: string
  costSnapshot: string | null
}

export type FinancialQuote = {
  quoteVersion: typeof FINANCIAL_QUOTE_VERSION
  financialEngineVersion: typeof FINANCIAL_ENGINE_VERSION
  requestFingerprint: string
  quoteFingerprint: string
  tenantId: string
  branchId: string
  currency: 'SAR'
  items: FinancialQuoteItem[]
  subtotal: string
  discount: {
    id: string | null
    name: string | null
    type: 'percentage' | 'fixed' | null
    value: string | null
    amount: string
    updatedAt: string | null
  }
  taxableSubtotal: string
  vat: {
    id: string | null
    rate: string
    amount: string
    updatedAt: string | null
  }
  total: string
  payment: {
    method: string
    cashReceived: string
    remainingFromCustomer: string
    cashChange: string
  }
  ruleVersions: FinancialRuleVersions
  createdAt: string
  expiresAt: string
}

export type FinancialSnapshot = {
  currencyCode: 'SAR'
  subtotal: string
  discountIdSnapshot: string | null
  discountNameSnapshot: string | null
  discountTypeSnapshot: 'percentage' | 'fixed' | null
  discountValueSnapshot: string | null
  discountAmount: string
  taxableSubtotal: string
  vatSettingIdSnapshot: string | null
  vatRateSnapshot: string
  vatAmount: string
  total: string
  paymentMethod: string
  cashReceived: string
  remainingFromCustomer: string
  cashChange: string
  requestFingerprintVersion: typeof FINANCIAL_REQUEST_VERSION
  requestFingerprint: string
  quoteVersion: typeof FINANCIAL_QUOTE_VERSION
  quoteFingerprint: string
  financialEngineVersion: typeof FINANCIAL_ENGINE_VERSION
  ruleVersions: FinancialRuleVersions
  items: FinancialQuoteItem[]
  snapshotVersion: 'financial-snapshot-v1'
  snapshotHash: string
}

function expandExponent(value: string) {
  if (!/[eE]/.test(value)) return value

  const [coefficient, exponentText] = value.toLowerCase().split('e')
  const exponent = Number(exponentText)
  if (!Number.isInteger(exponent)) throw new TypeError('Invalid decimal exponent')

  const negative = coefficient.startsWith('-')
  const unsigned = coefficient.replace(/^[+-]/, '')
  const [whole, fraction = ''] = unsigned.split('.')
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0'
  const decimalIndex = whole.length + exponent
  const expanded =
    decimalIndex <= 0
      ? `0.${'0'.repeat(-decimalIndex)}${digits}`
      : decimalIndex >= digits.length
        ? `${digits}${'0'.repeat(decimalIndex - digits.length)}`
        : `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`

  return negative ? `-${expanded}` : expanded
}

export function decimal(value: string | number | bigint): DecimalValue {
  const source =
    typeof value === 'bigint'
      ? value.toString()
      : expandExponent(String(value).trim())
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(source)
  if (!match) throw new TypeError('Invalid decimal value')

  const sign = match[1] === '-' ? -BIGINT_ONE : BIGINT_ONE
  const whole = BigInt(match[2])
  const fractionSource = match[3] || ''
  const kept = fractionSource.slice(0, FINANCIAL_CALCULATION_SCALE)
  const padded = kept.padEnd(FINANCIAL_CALCULATION_SCALE, '0')
  const discarded = fractionSource.slice(FINANCIAL_CALCULATION_SCALE)
  let scaled = whole * CALCULATION_FACTOR + BigInt(padded || '0')

  if (discarded[0] && discarded[0] >= '5') {
    scaled += BIGINT_ONE
  }

  return { scaled: sign * scaled }
}

export function addDecimal(left: DecimalValue, right: DecimalValue): DecimalValue {
  return { scaled: left.scaled + right.scaled }
}

export function subtractDecimal(
  left: DecimalValue,
  right: DecimalValue
): DecimalValue {
  return { scaled: left.scaled - right.scaled }
}

export function multiplyDecimal(
  left: DecimalValue,
  right: DecimalValue
): DecimalValue {
  const product = left.scaled * right.scaled
  const absolute = product < BIGINT_ZERO ? -product : product
  const rounded =
    (absolute + CALCULATION_FACTOR / BIGINT_TWO) / CALCULATION_FACTOR
  return { scaled: product < BIGINT_ZERO ? -rounded : rounded }
}

export function divideDecimal(
  numerator: DecimalValue,
  denominator: DecimalValue
): DecimalValue {
  if (denominator.scaled === BIGINT_ZERO) {
    throw new RangeError('Division by zero')
  }
  const expanded = numerator.scaled * CALCULATION_FACTOR
  const negative =
    (expanded < BIGINT_ZERO) !== (denominator.scaled < BIGINT_ZERO)
  const absoluteNumerator =
    expanded < BIGINT_ZERO ? -expanded : expanded
  const absoluteDenominator =
    denominator.scaled < BIGINT_ZERO
      ? -denominator.scaled
      : denominator.scaled
  const rounded =
    (absoluteNumerator + absoluteDenominator / BIGINT_TWO) /
    absoluteDenominator
  return { scaled: negative ? -rounded : rounded }
}

export function maxDecimal(left: DecimalValue, right: DecimalValue) {
  return left.scaled >= right.scaled ? left : right
}

export function minDecimal(left: DecimalValue, right: DecimalValue) {
  return left.scaled <= right.scaled ? left : right
}

export function toMoney(value: DecimalValue): MoneyValue {
  const negative = value.scaled < BIGINT_ZERO
  const absolute = negative ? -value.scaled : value.scaled
  const minor =
    (absolute + MONEY_ROUNDING_FACTOR / BIGINT_TWO) /
    MONEY_ROUNDING_FACTOR
  return { minor: negative ? -minor : minor }
}

export function moneyToString(value: MoneyValue) {
  const negative = value.minor < BIGINT_ZERO
  const absolute = negative ? -value.minor : value.minor
  const whole = absolute / MONEY_FACTOR
  const fraction = (absolute % MONEY_FACTOR)
    .toString()
    .padStart(FINANCIAL_MINOR_SCALE, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

export function decimalToMoneyString(value: DecimalValue) {
  return moneyToString(toMoney(value))
}

export function formatCanonicalMoney(value: string | number | bigint) {
  return decimalToMoneyString(decimal(value))
}

export function sha256Financial(value: unknown) {
  return createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')
}

export function fingerprintQuoteRequest(request: FinancialQuoteRequest) {
  return sha256Financial(request)
}

export function fingerprintFinancialQuote(
  quote: Omit<FinancialQuote, 'quoteFingerprint'>
) {
  return sha256Financial(quote)
}

export function buildFinancialSnapshot(quote: FinancialQuote): FinancialSnapshot {
  const withoutHash = {
    currencyCode: quote.currency,
    subtotal: quote.subtotal,
    discountIdSnapshot: quote.discount.id,
    discountNameSnapshot: quote.discount.name,
    discountTypeSnapshot: quote.discount.type,
    discountValueSnapshot: quote.discount.value,
    discountAmount: quote.discount.amount,
    taxableSubtotal: quote.taxableSubtotal,
    vatSettingIdSnapshot: quote.vat.id,
    vatRateSnapshot: quote.vat.rate,
    vatAmount: quote.vat.amount,
    total: quote.total,
    paymentMethod: quote.payment.method,
    cashReceived: quote.payment.cashReceived,
    remainingFromCustomer: quote.payment.remainingFromCustomer,
    cashChange: quote.payment.cashChange,
    requestFingerprintVersion: FINANCIAL_REQUEST_VERSION,
    requestFingerprint: quote.requestFingerprint,
    quoteVersion: quote.quoteVersion,
    quoteFingerprint: quote.quoteFingerprint,
    financialEngineVersion: quote.financialEngineVersion,
    ruleVersions: quote.ruleVersions,
    items: quote.items,
    snapshotVersion: 'financial-snapshot-v1' as const,
  }

  return {
    ...withoutHash,
    snapshotHash: sha256Financial(withoutHash),
  }
}

export function isQuoteExpired(quote: Pick<FinancialQuote, 'expiresAt'>, now = Date.now()) {
  const expiresAt = Date.parse(quote.expiresAt)
  return !Number.isFinite(expiresAt) || expiresAt <= now
}
