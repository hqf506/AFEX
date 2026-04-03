import { NextResponse } from 'next/server'
import { withAuthCookies } from '@/lib/api-auth'

export function jsonResponse<T extends object>(body: T, status = 200) {
  return NextResponse.json(body, { status })
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
  return jsonError(
    {
      error: message,
      details: error instanceof Error ? error.message : 'Unknown error',
    },
    status
  )
}

export function jsonWithAuthCookies<T extends object>(
  authResponse: NextResponse,
  body: T,
  status = 200
) {
  return withAuthCookies(authResponse, jsonResponse(body, status))
}
