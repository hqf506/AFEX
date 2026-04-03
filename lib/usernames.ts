export function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

export function usernameToInternalEmail(username: string) {
  return `${normalizeUsername(username)}@users.leatherfix.local`
}
