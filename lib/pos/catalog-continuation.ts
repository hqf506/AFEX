export function mergeUniqueCatalogItems<T>(
  currentItems: T[],
  incomingItems: T[],
  getIdentity: (item: T) => string
) {
  const merged = [...currentItems]
  const knownIdentities = new Set(
    currentItems.map(getIdentity).filter((identity) => identity.length > 0)
  )

  for (const item of incomingItems) {
    const identity = getIdentity(item)
    if (!identity || knownIdentities.has(identity)) continue
    knownIdentities.add(identity)
    merged.push(item)
  }

  return merged
}

export function shouldContinueCatalogLoading(options: {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
  threshold?: number
}) {
  const threshold = options.threshold ?? 240
  return options.scrollTop + options.clientHeight >= options.scrollHeight - threshold
}

export function isCatalogScrollContainerUnderfilled(options: {
  clientHeight: number
  scrollHeight: number
}) {
  return options.clientHeight > 0 && options.scrollHeight <= options.clientHeight + 1
}

export function isCurrentCatalogGeneration(
  responseGeneration: number,
  activeGeneration: number
) {
  return responseGeneration === activeGeneration
}

export function canAutofillCatalog(options: {
  clientHeight: number
  scrollHeight: number
  iteration: number
  maximumIterations?: number
}) {
  return (
    options.iteration < (options.maximumIterations ?? 6) &&
    isCatalogScrollContainerUnderfilled(options)
  )
}
