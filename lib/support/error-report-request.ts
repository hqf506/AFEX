import 'server-only'

import type { NextRequest } from 'next/server'

const trustedErrorReportRequests = new WeakSet<NextRequest>()

export function markTrustedErrorReportRequest(request: NextRequest) {
  trustedErrorReportRequests.add(request)
}

export function isTrustedErrorReportRequest(request: NextRequest) {
  return trustedErrorReportRequests.has(request)
}
