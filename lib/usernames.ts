export const INTERNAL_USERS_EMAIL_DOMAIN = 'users.leatherfix.local'

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

export function usernameToInternalEmail(username: string) {
  return `${normalizeUsername(username)}@${INTERNAL_USERS_EMAIL_DOMAIN}`
}
