export type CustomerListItem = {
  id: string
  name: string
  phone: string
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
