const SAFE_TIMING_NAMES = new Set([
  'auth',
  'profile',
  'platform_admin',
  'tenant',
  'owner',
  'organizations',
  'scope',
  'settings',
  'branches',
  'vat',
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
  'summary_query',
  'auth_session',
  'profile_tenant',
  'feature_orders',
  'feature_pos',
  'branch_validation',
  'idempotency_lookup',
  'employee_resolution',
  'catalog_validation',
  'branch_catalog_fallback',
  'atomic_rpc',
  'payment_snapshot',
  'employee_patch',
  'invoice_items_lookup',
  'inventory_actor_patch',
  'audit_write',
  'response_serialization',
  'tickets',
  'total',
])

type TimingEntry = { name: string; duration: number }

export type ServerTiming = ReturnType<typeof createServerTiming>

export function isServerTimingEnabled() {
  return (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'development' ||
    process.env.AFEX_SERVER_TIMING_ENABLED === 'true'
  )
}

export function createServerTiming(debugLabel = '') {
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
    finish<T extends Response>(response: T): Response {
      if (!enabled) return response

      record('total', performance.now() - startedAt)
      const headerValue = entries
        .map(({ name, duration }) => `${name};dur=${duration.toFixed(1)}`)
        .join(', ')
      const headers = new Headers(response.headers)
      headers.set('Server-Timing', headerValue)

      if (
        debugLabel &&
        process.env.AFEX_SERVER_TIMING_LOGS === 'true'
      ) {
        console.info(`[server-timing:${debugLabel}] ${headerValue}`)
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    },
  }
}

export function isSafeServerTimingName(name: string) {
  return SAFE_TIMING_NAMES.has(name)
}
