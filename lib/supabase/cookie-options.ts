export function getSupabaseCookieOptions() {
  return {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}
