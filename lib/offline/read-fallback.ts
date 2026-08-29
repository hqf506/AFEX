'use client'

export function shouldUseOfflineReadFallback(error: unknown) {
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    error instanceof TypeError ||
    (error instanceof Error &&
      /(?:failed to fetch|fetch failed|network error|network request failed|load failed)/iu.test(
        error.message
      ))
  )
}
