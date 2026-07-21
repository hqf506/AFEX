export type CustomerListItem = {
  id: string
  name: string
  phone: string
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

export function normalizeCustomerSearchTerm(value: string | null) {
  return (value || '').trim()
}

export function normalizeSaudiCustomerPhone(value: string | null) {
  const phone = normalizeCustomerSearchTerm(value)

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

export function validateSaudiCustomerPhone(
  value: string | null
): CustomerPhoneValidationResult {
  const phone = normalizeCustomerSearchTerm(value)

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
