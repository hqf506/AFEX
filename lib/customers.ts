export type CustomerListItem = {
  id: string
  name: string
  phone: string
}

export function normalizeCustomerSearchTerm(value: string | null) {
  return (value || '').trim()
}

export function buildCustomerSearchFilter(search: string) {
  const normalizedSearch = normalizeCustomerSearchTerm(search).replace(/,/g, ' ')

  if (!normalizedSearch) {
    return null
  }

  return `name.ilike.%${normalizedSearch}%,phone.ilike.%${normalizedSearch}%`
}
