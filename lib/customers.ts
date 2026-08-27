export type CustomerListItem = {
  id: string
  name: string
  phone: string
}

export type SelectedCustomerProfile = {
  id: string
  recordVersion: number | null
  customerNumber: string | null
  name: string
  phone: string
  email: string | null
  city: string | null
  address: string | null
  notes: string | null
  createdAt: string | null
  visitCount: number | null
  totalSpending: number | null
  lastOrderNumber: string | null
  lastOrderAt: string | null
}

export type CustomerProfileBaseSource = {
  id?: unknown
  record_version?: unknown
  customer_code?: unknown
  name?: unknown
  phone?: unknown
  display_phone?: unknown
  email?: unknown
  city?: unknown
  address?: unknown
  notes?: unknown
  created_at?: unknown
}

export type CustomerProfileActivitySource = {
  visitCount: number | null
  totalSpending: number | null
  lastOrderNumber: string | null
  lastOrderAt: string | null
}

function optionalCustomerProfileText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function buildSelectedCustomerProfile(
  customer: CustomerProfileBaseSource,
  activity: CustomerProfileActivitySource
): SelectedCustomerProfile | null {
  const id = optionalCustomerProfileText(customer.id)
  const name = optionalCustomerProfileText(customer.name)
  const phone =
    optionalCustomerProfileText(customer.display_phone) ||
    optionalCustomerProfileText(customer.phone)

  if (!id || !name || !phone) return null

  return {
    id,
    recordVersion:
      typeof customer.record_version === 'number' &&
      Number.isSafeInteger(customer.record_version) &&
      customer.record_version >= 1
        ? customer.record_version
        : null,
    customerNumber: optionalCustomerProfileText(customer.customer_code),
    name,
    phone,
    email: optionalCustomerProfileText(customer.email),
    city: optionalCustomerProfileText(customer.city),
    address: optionalCustomerProfileText(customer.address),
    notes: optionalCustomerProfileText(customer.notes),
    createdAt: optionalCustomerProfileText(customer.created_at),
    visitCount:
      typeof activity.visitCount === 'number' &&
      Number.isSafeInteger(activity.visitCount) &&
      activity.visitCount >= 0
        ? activity.visitCount
        : null,
    totalSpending:
      typeof activity.totalSpending === 'number' &&
      Number.isFinite(activity.totalSpending) &&
      activity.totalSpending >= 0
        ? activity.totalSpending
        : null,
    lastOrderNumber: optionalCustomerProfileText(activity.lastOrderNumber),
    lastOrderAt: optionalCustomerProfileText(activity.lastOrderAt),
  }
}

export function isSelectedCustomerProfile(
  value: unknown
): value is SelectedCustomerProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<SelectedCustomerProfile>
  const optionalStrings = [
    profile.customerNumber,
    profile.email,
    profile.city,
    profile.address,
    profile.notes,
    profile.createdAt,
    profile.lastOrderNumber,
    profile.lastOrderAt,
  ]

  return (
    typeof profile.id === 'string' &&
    Boolean(profile.id) &&
    (profile.recordVersion === null ||
      (typeof profile.recordVersion === 'number' &&
        Number.isSafeInteger(profile.recordVersion) &&
        profile.recordVersion >= 1)) &&
    typeof profile.name === 'string' &&
    Boolean(profile.name) &&
    typeof profile.phone === 'string' &&
    Boolean(profile.phone) &&
    optionalStrings.every((item) => item === null || typeof item === 'string') &&
    (profile.visitCount === null ||
      (typeof profile.visitCount === 'number' && profile.visitCount >= 0)) &&
    (profile.totalSpending === null ||
      (typeof profile.totalSpending === 'number' && profile.totalSpending >= 0))
  )
}

export function isCurrentCustomerProfileResponse(
  requestId: number,
  currentRequestId: number
) {
  return requestId === currentRequestId
}

export const CUSTOMER_PHONE_ERRORS = {
  required: 'أدخل رقم جوال العميل.',
  unsupportedCharacters:
    'رقم الجوال يحتوي على أحرف أو رموز غير مسموحة. استخدم أرقامًا فقط، ويمكن استخدام +966 في البداية.',
  incorrectLength:
    'عدد أرقام الجوال غير صحيح. استخدم 05XXXXXXXX أو +9665XXXXXXXX.',
  invalidPrefix:
    'رقم الجوال غير صالح. يجب أن يبدأ بـ 05 أو 5 أو +9665.',
  placeholder:
    'رقم الجوال غير صالح. أدخل رقم جوال حقيقيًا بدلًا من الأرقام التجريبية.',
  duplicate:
    'يوجد عميل مسجل مسبقًا بهذا الرقم. ابحث عنه واختره بدل إنشاء عميل جديد.',
} as const

export type CustomerPhoneValidationResult =
  | {
      valid: true
      code: 'CUSTOMER_PHONE_VALID'
      message: null
      normalizedPhone: string
    }
  | {
      valid: false
      code:
        | 'CUSTOMER_PHONE_REQUIRED'
        | 'CUSTOMER_PHONE_UNSUPPORTED_CHARACTERS'
        | 'CUSTOMER_PHONE_INVALID_LENGTH'
        | 'CUSTOMER_PHONE_INVALID_PREFIX'
        | 'CUSTOMER_PHONE_INVALID_PLACEHOLDER'
      message: string
      normalizedPhone: null
    }

export type CustomerIdentity = {
  phone: string
  phoneNormalized: string
}

export type CustomerEngineErrorCode =
  | Exclude<
      CustomerPhoneValidationResult['code'],
      'CUSTOMER_PHONE_VALID'
    >
  | 'CUSTOMER_PHONE_CONFLICT'
  | 'CUSTOMER_PHONE_LOOKUP_FAILED'
  | 'CUSTOMER_VERSION_CONFLICT'
  | 'CUSTOMER_PERSISTENCE_FAILED'

export type CustomerCreateFailureCode =
  | 'CUSTOMER_PHONE_CONFLICT'
  | 'CUSTOMER_CONFLICT'
  | 'CUSTOMER_AUTHORIZATION_FAILED'
  | 'CUSTOMER_VALIDATION_FAILED'
  | 'CUSTOMER_PERSISTENCE_FAILED'
  | 'CUSTOMER_NETWORK_FAILED'

export const CUSTOMER_CREATE_FAILURE_MESSAGES: Record<
  CustomerCreateFailureCode,
  string
> = {
  CUSTOMER_PHONE_CONFLICT: CUSTOMER_PHONE_ERRORS.duplicate,
  CUSTOMER_CONFLICT: 'يوجد تعارض في بيانات العميل. راجع البيانات ثم حاول مرة أخرى.',
  CUSTOMER_AUTHORIZATION_FAILED: 'لا تملك صلاحية إنشاء عميل ضمن نطاق نقطة البيع الحالية.',
  CUSTOMER_VALIDATION_FAILED: 'بيانات العميل غير مكتملة أو غير صالحة. راجع الحقول المطلوبة.',
  CUSTOMER_PERSISTENCE_FAILED:
    'تعذر حفظ بيانات العميل حاليًا. لم يتم إنشاء الطلب بعد. حاول مرة أخرى.',
  CUSTOMER_NETWORK_FAILED:
    'تعذر الاتصال لحفظ بيانات العميل. لم يتم إنشاء الطلب بعد. تحقق من الاتصال ثم حاول مرة أخرى.',
}

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const EASTERN_ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export function normalizeCustomerPhoneDigits(value: string | null) {
  return normalizeCustomerSearchTerm(value).replace(
    /[٠-٩۰-۹]/g,
    (digit) => {
      const arabicIndicIndex = ARABIC_INDIC_DIGITS.indexOf(digit)

      if (arabicIndicIndex >= 0) {
        return `${arabicIndicIndex}`
      }

      return `${EASTERN_ARABIC_INDIC_DIGITS.indexOf(digit)}`
    }
  )
}

export function normalizeCustomerSearchTerm(value: string | null) {
  return (value || '').trim()
}

export function normalizeSaudiCustomerPhone(value: string | null) {
  const phone = normalizeCustomerPhoneDigits(value)

  if (!phone || !/^[+]?[0-9\s().-]+$/.test(phone)) {
    return null
  }

  const digits = phone.replace(/[^0-9]/g, '')

  if (/^05[0-9]{8}$/.test(digits)) {
    return `966${digits.slice(1)}`
  }

  if (/^5[0-9]{8}$/.test(digits)) {
    return `966${digits}`
  }

  return /^9665[0-9]{8}$/.test(digits) ? digits : null
}

export function getCustomerPhoneSearchInput(value: string | null) {
  const displayValue = normalizeCustomerPhoneDigits(value)
  const digits = displayValue.replace(/[^0-9]/g, '')

  return {
    displayValue,
    digits,
    normalizedPhone: normalizeSaudiCustomerPhone(displayValue),
  }
}

export function resolveCustomerCreateFailure(input: {
  httpStatus?: number
  code?: unknown
}) {
  const code = typeof input.code === 'string' ? input.code : ''
  const knownCode = code as CustomerCreateFailureCode

  if (knownCode in CUSTOMER_CREATE_FAILURE_MESSAGES) {
    return {
      code: knownCode,
      message: CUSTOMER_CREATE_FAILURE_MESSAGES[knownCode],
      phoneField: knownCode === 'CUSTOMER_PHONE_CONFLICT',
    }
  }

  if (input.httpStatus === 401 || input.httpStatus === 403) {
    return {
      code: 'CUSTOMER_AUTHORIZATION_FAILED' as const,
      message: CUSTOMER_CREATE_FAILURE_MESSAGES.CUSTOMER_AUTHORIZATION_FAILED,
      phoneField: false,
    }
  }

  if (input.httpStatus === 400 || input.httpStatus === 422) {
    return {
      code: 'CUSTOMER_VALIDATION_FAILED' as const,
      message: CUSTOMER_CREATE_FAILURE_MESSAGES.CUSTOMER_VALIDATION_FAILED,
      phoneField: false,
    }
  }

  return {
    code: 'CUSTOMER_PERSISTENCE_FAILED' as const,
    message: CUSTOMER_CREATE_FAILURE_MESSAGES.CUSTOMER_PERSISTENCE_FAILED,
    phoneField: false,
  }
}

export function resolveCustomerCreateResponse<TCustomer>(input: {
  httpStatus: number
  payload: unknown
}) {
  const payload =
    input.payload && typeof input.payload === 'object'
      ? (input.payload as { success?: unknown; customer?: TCustomer; code?: unknown })
      : null

  if (input.httpStatus >= 200 && input.httpStatus < 300 && payload?.success === true && payload.customer) {
    return { ok: true as const, customer: payload.customer }
  }

  return {
    ok: false as const,
    failure: resolveCustomerCreateFailure({
      httpStatus: input.httpStatus,
      code: payload?.code,
    }),
  }
}

export function isCurrentCustomerSearchResponse(
  requestId: number,
  currentRequestId: number
) {
  return requestId === currentRequestId
}

export function validateSaudiCustomerPhone(
  value: string | null
): CustomerPhoneValidationResult {
  const phone = normalizeCustomerPhoneDigits(value)

  if (!phone) {
    return {
      valid: false,
      code: 'CUSTOMER_PHONE_REQUIRED',
      message: CUSTOMER_PHONE_ERRORS.required,
      normalizedPhone: null,
    }
  }

  if (!/^[+]?[0-9\s().-]+$/.test(phone)) {
    return {
      valid: false,
      code: 'CUSTOMER_PHONE_UNSUPPORTED_CHARACTERS',
      message: CUSTOMER_PHONE_ERRORS.unsupportedCharacters,
      normalizedPhone: null,
    }
  }

  const digits = phone.replace(/[^0-9]/g, '')

  if (/^0+$/.test(digits) || /^(?:05|5|9665)0{8}$/.test(digits)) {
    return {
      valid: false,
      code: 'CUSTOMER_PHONE_INVALID_PLACEHOLDER',
      message: CUSTOMER_PHONE_ERRORS.placeholder,
      normalizedPhone: null,
    }
  }

  const hasRecognizedPrefix =
    digits.startsWith('05') ||
    digits.startsWith('5') ||
    digits.startsWith('9665')
  const hasExpectedLength = [9, 10, 12].includes(digits.length)

  if (
    (digits.startsWith('05') && digits.length !== 10) ||
    (digits.startsWith('5') && digits.length !== 9) ||
    (digits.startsWith('9665') && digits.length !== 12) ||
    (!hasRecognizedPrefix && !hasExpectedLength)
  ) {
    return {
      valid: false,
      code: 'CUSTOMER_PHONE_INVALID_LENGTH',
      message: CUSTOMER_PHONE_ERRORS.incorrectLength,
      normalizedPhone: null,
    }
  }

  const normalizedPhone = normalizeSaudiCustomerPhone(phone)

  if (!normalizedPhone) {
    return {
      valid: false,
      code: 'CUSTOMER_PHONE_INVALID_PREFIX',
      message: CUSTOMER_PHONE_ERRORS.invalidPrefix,
      normalizedPhone: null,
    }
  }

  return {
    valid: true,
    code: 'CUSTOMER_PHONE_VALID',
    message: null,
    normalizedPhone,
  }
}

export function prepareCustomerIdentity(
  value: string | null
):
  | { ok: true; identity: CustomerIdentity }
  | {
      ok: false
      code: Exclude<
        CustomerPhoneValidationResult['code'],
        'CUSTOMER_PHONE_VALID'
      >
      message: string
    } {
  const validation = validateSaudiCustomerPhone(value)

  if (!validation.valid) {
    return {
      ok: false,
      code: validation.code,
      message: validation.message,
    }
  }

  return {
    ok: true,
    identity: {
      phone: normalizeCustomerPhoneDigits(value),
      phoneNormalized: validation.normalizedPhone,
    },
  }
}

export function isMissingCustomerIdentityColumnError(
  error: {
    code?: string | null
    message?: string | null
    details?: string | null
  } | null,
  column: 'normalized_phone' | 'record_version'
) {
  if (!error || !['42703', 'PGRST204'].includes(error.code || '')) {
    return false
  }

  return `${error.message || ''} ${error.details || ''}`
    .toLowerCase()
    .includes(column)
}

export function buildSaudiPhoneCandidatePattern(normalizedPhone: string) {
  const nationalNumber = normalizedPhone.slice(3)
  return `%${nationalNumber.split('').join('%')}%`
}

export function buildCustomerSearchFilter(search: string) {
  const normalizedSearch = normalizeCustomerSearchTerm(search).replace(/,/g, ' ')

  if (!normalizedSearch) {
    return null
  }

  return `name.ilike.%${normalizedSearch}%,phone.ilike.%${normalizedSearch}%`
}
