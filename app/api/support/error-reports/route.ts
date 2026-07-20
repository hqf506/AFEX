import { NextRequest, NextResponse } from 'next/server'
import { POST as createSupportTicket } from '@/app/api/support/tickets/route'
import { markTrustedErrorReportRequest } from '@/lib/support/error-report-request'

const ALLOWED_KEYS = new Set(['comment', 'feature', 'error_code', 'http_status'])
const SAFE_IDENTIFIER = /^[a-zA-Z0-9._/-]{1,100}$/

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: 'بيانات بلاغ الدعم غير صالحة.' }, { status: 400 })
  }
  if (Object.keys(body).some((key) => !ALLOWED_KEYS.has(key))) {
    return NextResponse.json({ success: false, error: 'يحتوي البلاغ على بيانات غير مسموحة.' }, { status: 400 })
  }

  const comment = body.comment === undefined ? '' : body.comment
  const feature = body.feature === undefined ? 'error-boundary' : body.feature
  const errorCode = body.error_code === undefined ? '' : body.error_code
  const httpStatus = body.http_status === undefined || body.http_status === null ? null : body.http_status
  if (
    typeof comment !== 'string' || comment.trim().length > 1000 ||
    typeof feature !== 'string' || !SAFE_IDENTIFIER.test(feature) ||
    typeof errorCode !== 'string' || (errorCode !== '' && !SAFE_IDENTIFIER.test(errorCode)) ||
    (httpStatus !== null && (!Number.isInteger(httpStatus) || httpStatus < 400 || httpStatus > 599))
  ) {
    return NextResponse.json({ success: false, error: 'بيانات بلاغ الدعم غير صالحة.' }, { status: 400 })
  }

  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  const supportRequest = new NextRequest(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: 'error_report',
      comment: comment.trim(),
      feature,
      error_code: errorCode,
      http_status: httpStatus,
    }),
  })
  markTrustedErrorReportRequest(supportRequest)
  return createSupportTicket(supportRequest)
}
