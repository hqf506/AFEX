import 'server-only'

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

export const EMAIL_CHANGE_COOKIE_NAME = 'afex-email-change'
export const EMAIL_CHANGE_MAX_AGE_SECONDS = 60 * 60

type EmailChangeState = {
  userId: string
  oldEmail: string
  newEmail: string
  expiresAt: number
}
function stateKey() {
  const secret = process.env.AUTH_RECOVERY_STATE_SECRET?.trim() || ''
  if (secret.length < 32) {
    throw new Error('AUTH_RECOVERY_STATE_SECRET must contain at least 32 characters')
  }
  return createHash('sha256').update(`afex-email-change:${secret}`).digest()
}

export function sealEmailChangeState(
  userId: string,
  oldEmail: string,
  newEmail: string
) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', stateKey(), iv)
  const payload = JSON.stringify({
    userId,
    oldEmail: oldEmail.trim().toLowerCase(),
    newEmail: newEmail.trim().toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + EMAIL_CHANGE_MAX_AGE_SECONDS,
  } satisfies EmailChangeState)
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])

  return [iv, encrypted, cipher.getAuthTag()]
    .map((part) => part.toString('base64url'))
    .join('.')
}

export function readEmailChangeState(
  value: string | undefined,
  userId: string,
  newEmail: string
) {
  if (!value) return null

  try {
    const [ivValue, encryptedValue, tagValue, ...extra] = value.split('.')
    if (!ivValue || !encryptedValue || !tagValue || extra.length > 0) return null

    const decipher = createDecipheriv(
      'aes-256-gcm',
      stateKey(),
      Buffer.from(ivValue, 'base64url')
    )
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
    const state = JSON.parse(decrypted) as EmailChangeState

    if (
      state.userId !== userId ||
      state.newEmail !== newEmail.trim().toLowerCase() ||
      state.expiresAt <= Math.floor(Date.now() / 1000) ||
      !state.oldEmail ||
      state.oldEmail === state.newEmail
    ) {
      return null
    }

    return state
  } catch {
    return null
  }
}
