import type { NextResponse } from 'next/server'

type TimingEntry = { name: string; duration: number }

export type ReportServerTiming = ReturnType<typeof createReportServerTiming>

export function createReportServerTiming() {
  const enabled = process.env.VERCEL_ENV === 'preview'
  const startedAt = performance.now()
  const entries: TimingEntry[] = []

  return {
    async measure<T>(name: string, operation: () => PromiseLike<T>): Promise<T> {
      if (!enabled) return operation()
      const entryStartedAt = performance.now()
      try {
        return await operation()
      } finally {
        entries.push({ name, duration: performance.now() - entryStartedAt })
      }
    },
    finish<T extends NextResponse>(response: T): T {
      if (!enabled) return response
      const total = performance.now() - startedAt
      response.headers.set(
        'Server-Timing',
        [...entries, { name: 'total', duration: total }]
          .map(({ name, duration }) => `${name};dur=${duration.toFixed(1)}`)
          .join(', ')
      )
      return response
    },
  }
}
