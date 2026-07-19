import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const RECOVERY_COOKIE_NAME = 'afex-password-recovery'
const RECOVERY_MAX_AGE_SECONDS = 10 * 60
const CALLBACK_STATE_MAX_AGE_SECONDS = 30 * 60

function recoverySecret() {
  const secret = process.env.AUTH_RECOVERY_STATE_SECRET?.trim() || ''
  if (secret.length < 32) {
    throw new Error('AUTH_RECOVERY_STATE_SECRET must contain at least 32 characters')
  }
  return secret
}

function sign(payload: string) {
  return createHmac('sha256', recoverySecret()).update(payload).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function emailDigest(email: string) {
  return createHmac('sha256', recoverySecret())
    .update(email.trim().toLowerCase())
    .digest('base64url')
}

export function createRecoveryCallbackState(email: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + CALLBACK_STATE_MAX_AGE_SECONDS
  const payload = `${emailDigest(email)}.${expiresAt}`
  return `${payload}.${sign(payload)}`
}

function parseValidCallbackState(value: string) {
  try {
    const [storedEmailDigest, expiresAtValue, signature, ...extra] = value.split('.')
    if (!storedEmailDigest || !expiresAtValue || !signature || extra.length > 0) return null
    const expiresAt = Number(expiresAtValue)
    if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null
    const payload = `${storedEmailDigest}.${expiresAtValue}`
    if (!safeEqual(signature, sign(payload))) return null
    return { storedEmailDigest }
  } catch {
    return null
  }
}

export function hasValidRecoveryCallbackStateSignature(value: string) {
  return Boolean(parseValidCallbackState(value))
}

export function isValidRecoveryCallbackState(value: string, email: string) {
  const parsed = parseValidCallbackState(value)
  return Boolean(parsed && safeEqual(parsed.storedEmailDigest, emailDigest(email)))
}

export async function establishRecoveryContext(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + RECOVERY_MAX_AGE_SECONDS
  const payload = `${userId}.${expiresAt}`
  const cookieStore = await cookies()
  cookieStore.set(RECOVERY_COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: RECOVERY_MAX_AGE_SECONDS,
  })
}

export async function hasValidRecoveryContext(userId: string) {
  try {
    const value = (await cookies()).get(RECOVERY_COOKIE_NAME)?.value || ''
    const [storedUserId, expiresAtValue, signature, ...extra] = value.split('.')
    if (!storedUserId || !expiresAtValue || !signature || extra.length > 0) return false

    const expiresAt = Number(expiresAtValue)
    if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      return false
    }

    const payload = `${storedUserId}.${expiresAtValue}`
    return storedUserId === userId && safeEqual(signature, sign(payload))
  } catch {
    return false
  }
}

export async function clearRecoveryContext() {
  const cookieStore = await cookies()
  cookieStore.set(RECOVERY_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
