'use client'

type CacheEntry<T> = {
  data: T | null
  updatedAt: number
  promise: Promise<T> | null
}

type LoadClientResourceOptions = {
  ttlMs?: number
  force?: boolean
  logLabel?: string
  protectedResource?: boolean
}

const PROTECTED_RESOURCE_CACHE_PREFIXES = [
  'admin-branches',
  'admin-categories',
  'admin-system-settings',
  'admin-discounts:',
  'admin-vat:',
  'invoice-catalog:',
] as const

const clientResourceCache = new Map<string, CacheEntry<unknown>>()
let protectedResourcesUnauthorized = false

function isDevelopment() {
  return process.env.NODE_ENV === 'development'
}

function startDevTimer(label?: string) {
  if (!label || !isDevelopment()) return
  console.time(label)
}

function endDevTimer(label?: string) {
  if (!label || !isDevelopment()) return
  console.timeEnd(label)
}

function getCacheEntry<T>(key: string) {
  return clientResourceCache.get(key) as CacheEntry<T> | undefined
}

export function peekClientResource<T>(key: string) {
  return (getCacheEntry<T>(key)?.data ?? null) as T | null
}

export function isClientResourceFresh(key: string, ttlMs = 60_000) {
  const entry = clientResourceCache.get(key)

  if (!entry || entry.data == null) {
    return false
  }

  return Date.now() - entry.updatedAt <= ttlMs
}

export function writeClientResource<T>(key: string, data: T) {
  clientResourceCache.set(key, {
    data,
    updatedAt: Date.now(),
    promise: null,
  })
}

export function clearClientResource(key: string) {
  clientResourceCache.delete(key)
}

export function clearClientResourcesByPrefix(prefix: string) {
  for (const key of clientResourceCache.keys()) {
    if (key.startsWith(prefix)) {
      clientResourceCache.delete(key)
    }
  }
}

export function clearProtectedClientResources() {
  for (const prefix of PROTECTED_RESOURCE_CACHE_PREFIXES) {
    clearClientResourcesByPrefix(prefix)
  }
}

export function markProtectedResourcesUnauthorized() {
  protectedResourcesUnauthorized = true
  clearProtectedClientResources()
}

export function resetProtectedResourceUnauthorized() {
  protectedResourcesUnauthorized = false
}

export function shouldBlockProtectedResourceFetch() {
  return protectedResourcesUnauthorized
}

export function createProtectedResourceAuthError() {
  const error = new Error('PROTECTED_RESOURCE_UNAUTHORIZED')
  error.name = 'ProtectedResourceUnauthorizedError'
  return error
}

export function isProtectedResourceAuthError(error: unknown) {
  return (
    error instanceof Error &&
    error.name === 'ProtectedResourceUnauthorizedError'
  )
}

export async function loadClientResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: LoadClientResourceOptions = {}
) {
  const { ttlMs = 60_000, force = false, logLabel, protectedResource = false } = options
  const currentEntry = getCacheEntry<T>(key)

  if (protectedResource && protectedResourcesUnauthorized) {
    throw createProtectedResourceAuthError()
  }

  if (!force && currentEntry?.data != null && isClientResourceFresh(key, ttlMs)) {
    return currentEntry.data
  }

  if (currentEntry?.promise) {
    return currentEntry.promise
  }

  startDevTimer(logLabel)

  const nextPromise = fetcher()
    .then((data) => {
      clientResourceCache.set(key, {
        data,
        updatedAt: Date.now(),
        promise: null,
      })
      return data
    })
    .catch((error) => {
      const latestEntry = getCacheEntry<T>(key)

      if (latestEntry) {
        clientResourceCache.set(key, {
          data: latestEntry.data,
          updatedAt: latestEntry.updatedAt,
          promise: null,
        })
      } else {
        clientResourceCache.delete(key)
      }

      throw error
    })
    .finally(() => {
      endDevTimer(logLabel)
    })

  clientResourceCache.set(key, {
    data: currentEntry?.data ?? null,
    updatedAt: currentEntry?.updatedAt ?? 0,
    promise: nextPromise,
  })

  return nextPromise
}

export function prefetchClientResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: Omit<LoadClientResourceOptions, 'force'> = {}
) {
  return loadClientResource(key, fetcher, options).catch(() => null)
}
