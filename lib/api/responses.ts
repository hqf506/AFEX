import { NextResponse } from 'next/server'
import { withAuthCookies } from '@/lib/api-auth'
import {
  createSupportReference,
  logSanitizedServerError,
  sanitizeApiErrorBody,
} from '@/lib/api/safe-error'

export function jsonResponse<T extends object>(body: T, status = 200) {
  if (status < 400) return NextResponse.json(body, { status })

  const safeBody = sanitizeApiErrorBody(body as Record<string, unknown>, status)
  if (safeBody.reference) {
    logSanitizedServerError({
      reference: safeBody.reference,
      route: 'shared-json-response',
      action: `http-${status}`,
      error: body,
    })
  }

  return NextResponse.json(safeBody, { status })
}

export function jsonSuccess<T extends object>(body: T, status = 200) {
  return jsonResponse(body, status)
}

export function jsonError<T extends object>(body: T, status: number) {
  return jsonResponse(body, status)
}

export function jsonUnexpectedError(
  error: unknown,
  message = 'حدث خطأ غير متوقع',
  status = 500
) {
  const reference = createSupportReference()
  logSanitizedServerError({
    reference,
    route: 'jsonUnexpectedError',
    action: `http-${status}`,
    error,
  })
  return jsonError({ error: message, reference }, status)
}

export function jsonWithAuthCookies<T extends object>(
  authResponse: NextResponse,
  body: T,
  status = 200
) {
  return withAuthCookies(authResponse, jsonResponse(body, status))
}
