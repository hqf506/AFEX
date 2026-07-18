'use client'

import { SupportErrorFallback } from '@/components/support-error-fallback'
import './globals.css'

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <SupportErrorFallback error={error} retry={unstable_retry} />
      </body>
    </html>
  )
}
