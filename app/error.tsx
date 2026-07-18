'use client'

import { SupportErrorFallback } from '@/components/support-error-fallback'

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <SupportErrorFallback error={error} retry={unstable_retry} />
}
