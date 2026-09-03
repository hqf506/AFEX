export function mergeInvoiceLedgerPage<T extends { id: string }>(current: T[], incoming: T[], page: number) {
  if (page === 1) return incoming
  const unique = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) unique.set(item.id, item)
  return [...unique.values()]
}

export function selectInvoiceLedgerCollection<T>(normalizedQuery: string, authoritative: T[], searchResults: T[] | null) {
  return normalizedQuery ? searchResults ?? [] : authoritative
}

export function isLatestInvoiceLedgerRequest(currentRequestId: number, requestId: number, aborted: boolean) {
  return currentRequestId === requestId && !aborted
}
