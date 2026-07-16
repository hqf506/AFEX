const SAFE_TIMING_NAMES = new Set([
  'auth',
  'scope',
  'settings',
  'branches',
  'orders',
  'invoices',
  'items',
  'catalog',
  'customers',
  'categories',
  'overrides',
  'stock',
  'profiles',
  'audit',
  'rpc',
  'aggregate',
  'map',
  'sort',
  'pagination',
  'serialize',
  'total',
])

type TimingEntry = { name: string; duration: number }

export type ServerTiming = ReturnType<typeof createServerTiming>

export function isServerTimingEnabled() {
  return (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.NODE_ENV === 'development'
  )
}

export function createServerTiming() {
  const enabled = isServerTimingEnabled()
  const startedAt = performance.now()
  const entries: TimingEntry[] = []

  function record(name: string, duration: number) {
    if (!enabled || !SAFE_TIMING_NAMES.has(name)) return
    entries.push({
      name,
      duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    })
  }

  return {
    enabled,
    async measure<T>(name: string, operation: () => PromiseLike<T>): Promise<T> {
      if (!enabled || !SAFE_TIMING_NAMES.has(name)) return operation()
      const entryStartedAt = performance.now()
      try {
        return await operation()
      } finally {
        record(name, performance.now() - entryStartedAt)
      }
    },
    measureSync<T>(name: string, operation: () => T): T {
      if (!enabled || !SAFE_TIMING_NAMES.has(name)) return operation()
      const entryStartedAt = performance.now()
      try {
        return operation()
      } finally {
        record(name, performance.now() - entryStartedAt)
      }
    },
    finish<T extends Response>(response: T): T {
      if (!enabled) return response
      try {
        record('total', performance.now() - startedAt)
        response.headers.set(
          'Server-Timing',
          entries
            .map(({ name, duration }) => `${name};dur=${duration.toFixed(1)}`)
            .join(', ')
        )
      } catch {
        // Instrumentation must never change the route response.
      }
      return response
    },
  }
}

export function isSafeServerTimingName(name: string) {
  return SAFE_TIMING_NAMES.has(name)
}
