export type PosPaymentMethod =
  | 'mada'
  | 'cash'
  | 'visa'
  | 'cod'
  | 'card'
  | 'bank_transfer'
  | 'transfer'
  | 'on_delivery'

export type EnabledPosPaymentMethod = Extract<
  PosPaymentMethod,
  'mada' | 'cash' | 'visa' | 'cod'
>

export type PosPaymentMethodOption = Readonly<{
  id: EnabledPosPaymentMethod
  label: string
  enabled: true
  displayOrder: number
}>

export const POS_PAYMENT_CONFIGURATION_CONTRACT_VERSION =
  'afex-pos-payment-configuration.v2' as const
export const POS_PAYMENT_CONFIGURATION_SOURCE =
  'afex-pos-canonical-payment-authority.v1' as const

export type PosPaymentConfiguration = Readonly<{
  contractVersion: typeof POS_PAYMENT_CONFIGURATION_CONTRACT_VERSION
  source: typeof POS_PAYMENT_CONFIGURATION_SOURCE
  methods: readonly PosPaymentMethodOption[]
}>

export const PAYMENT_METHODS = Object.freeze([
  Object.freeze({ id: 'mada', label: 'مدى', enabled: true, displayOrder: 1 }),
  Object.freeze({ id: 'cash', label: 'نقدي', enabled: true, displayOrder: 2 }),
  Object.freeze({ id: 'visa', label: 'فيزا', enabled: true, displayOrder: 3 }),
  Object.freeze({
    id: 'cod',
    label: 'الدفع عند الاستلام',
    enabled: true,
    displayOrder: 4,
  }),
] as const satisfies readonly PosPaymentMethodOption[])

const PAYMENT_CONFIGURATION = Object.freeze({
  contractVersion: POS_PAYMENT_CONFIGURATION_CONTRACT_VERSION,
  source: POS_PAYMENT_CONFIGURATION_SOURCE,
  methods: PAYMENT_METHODS,
}) satisfies PosPaymentConfiguration

const HISTORICAL_PAYMENT_METHOD_LABELS: Readonly<Record<PosPaymentMethod, string>> =
  Object.freeze({
    mada: 'مدى',
    cash: 'نقدي',
    visa: 'فيزا',
    cod: 'الدفع عند الاستلام',
    card: 'بطاقة',
    bank_transfer: 'تحويل بنكي',
    transfer: 'تحويل',
    on_delivery: 'عند الاستلام',
  })

const LEGACY_PAYMENT_METHODS_V1 = Object.freeze([
  Object.freeze({ id: 'mada', label: 'مدى' }),
  Object.freeze({ id: 'cash', label: 'نقدي' }),
  Object.freeze({ id: 'visa', label: 'فيزا' }),
  Object.freeze({ id: 'cod', label: 'الدفع عند الاستلام' }),
  Object.freeze({ id: 'card', label: 'بطاقة' }),
  Object.freeze({ id: 'bank_transfer', label: 'تحويل بنكي' }),
  Object.freeze({ id: 'transfer', label: 'تحويل' }),
  Object.freeze({ id: 'on_delivery', label: 'عند الاستلام' }),
] as const)

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function canonicalPaymentMethodIdentity(
  value: unknown
): EnabledPosPaymentMethod | null {
  if (value === 'mada' || value === 'cash' || value === 'visa' || value === 'cod') {
    return value
  }
  if (value === 'on_delivery') return 'cod'
  return null
}

export function getCanonicalPosPaymentConfiguration(): PosPaymentConfiguration {
  return PAYMENT_CONFIGURATION
}

export function parsePosPaymentConfiguration(
  value: unknown
): PosPaymentConfiguration | null {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(',') !==
      'contractVersion,methods,source' ||
    value.contractVersion !== POS_PAYMENT_CONFIGURATION_CONTRACT_VERSION ||
    value.source !== POS_PAYMENT_CONFIGURATION_SOURCE ||
    !Array.isArray(value.methods) ||
    value.methods.length !== PAYMENT_METHODS.length
  ) {
    return null
  }

  const seen = new Set<EnabledPosPaymentMethod>()
  for (const [index, expected] of PAYMENT_METHODS.entries()) {
    const candidate = value.methods[index]
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).sort().join(',') !==
        'displayOrder,enabled,id,label' ||
      candidate.id !== expected.id ||
      candidate.label !== expected.label ||
      candidate.enabled !== true ||
      candidate.displayOrder !== expected.displayOrder ||
      seen.has(expected.id)
    ) {
      return null
    }
    seen.add(expected.id)
  }

  return PAYMENT_CONFIGURATION
}

export function migrateLegacyPosPaymentConfiguration(
  value: unknown
): PosPaymentConfiguration | null {
  if (!Array.isArray(value) || value.length !== LEGACY_PAYMENT_METHODS_V1.length) {
    return null
  }

  const canonicalIds = new Set<EnabledPosPaymentMethod>()
  for (const [index, expected] of LEGACY_PAYMENT_METHODS_V1.entries()) {
    const candidate = value[index]
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).sort().join(',') !== 'id,label' ||
      candidate.id !== expected.id ||
      candidate.label !== expected.label
    ) {
      return null
    }
    const canonicalId = canonicalPaymentMethodIdentity(candidate.id)
    if (canonicalId) canonicalIds.add(canonicalId)
  }

  return canonicalIds.size === PAYMENT_METHODS.length &&
    PAYMENT_METHODS.every((method) => canonicalIds.has(method.id))
    ? PAYMENT_CONFIGURATION
    : null
}

export function normalizeUiPaymentMethod(method?: string): PosPaymentMethod {
  const value = String(method || '')
    .trim()
    .toLowerCase()

  if (value === 'cash') return 'cash'
  if (value === 'visa') return 'visa'
  if (value === 'cod') return 'cod'
  if (value === 'on_delivery') return 'on_delivery'
  if (value === 'card') return 'card'
  if (value === 'bank_transfer') return 'bank_transfer'
  if (value === 'transfer') return 'transfer'
  if (value === 'mada') return 'mada'

  return 'mada'
}

export function getPaymentMethodLabel(method?: string) {
  const normalizedMethod = normalizeUiPaymentMethod(method)
  return HISTORICAL_PAYMENT_METHOD_LABELS[normalizedMethod] ?? 'مدى'
}

export function isReceivedAmountEditable(method?: string) {
  const normalizedMethod = normalizeUiPaymentMethod(method)
  return normalizedMethod === 'cash'
}

export function toApiPaymentMethod(
  method: PosPaymentMethod
): 'cash' | 'card' {
  const normalizedMethod = normalizeUiPaymentMethod(method)

  if (
    normalizedMethod === 'mada' ||
    normalizedMethod === 'visa' ||
    normalizedMethod === 'card' ||
    normalizedMethod === 'bank_transfer' ||
    normalizedMethod === 'transfer'
  ) {
    return 'card'
  }

  return 'cash'
}
