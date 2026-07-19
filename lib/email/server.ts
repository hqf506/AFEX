import 'server-only'

export function resolveTrustedAppBaseUrl() {
  const configured = process.env.AFEX_APP_BASE_URL?.trim()
  if (!configured) throw new Error('AFEX_APP_BASE_URL is missing')

  const url = new URL(configured)
  if (
    url.username ||
    url.password ||
    !['http:', 'https:'].includes(url.protocol) ||
    (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
  ) {
    throw new Error('AFEX_APP_BASE_URL is invalid')
  }

  return url.origin
}
