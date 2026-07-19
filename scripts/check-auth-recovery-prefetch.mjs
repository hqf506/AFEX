import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const page = read('app/auth/recovery/recovery-continuation.tsx')
const continuation = read('app/auth/recovery/continue/route.ts')
const validator = read('lib/auth/recovery-confirmation.ts')
const callback = read('app/auth/callback/route.ts')
const complete = read('app/api/auth/recovery/complete/route.ts')
const template = read('docs/auth/reset-password-email-template.html')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

const decodeFragmentOnce = (fragment) => {
  const prefix = 'confirmation='
  if (!fragment.startsWith(prefix)) return null
  const value = fragment.slice(prefix.length)
  return value.startsWith('https://') ? value : decodeURIComponent(value)
}

const syntheticCallback = 'https://www.smart-afex.com/auth/callback?next=/reset-password&state=digest.123.signature'
const confirmationUrl = `https://project.supabase.co/auth/v1/verify?token=synthetic-token-hash&type=recovery&redirect_to=${encodeURIComponent(syntheticCallback)}`
const encodedFragment = `confirmation=${encodeURIComponent(confirmationUrl)}`
const decodedConfirmation = decodeFragmentOnce(encodedFragment)
assert(decodedConfirmation === confirmationUrl, 'Encoded ConfirmationURL must be decoded exactly once without corruption.')
const parsedConfirmation = new URL(decodedConfirmation)
const parsedRedirect = new URL(parsedConfirmation.searchParams.get('redirect_to'))
assert(parsedConfirmation.searchParams.get('token') === 'synthetic-token-hash', 'Token hash must survive the fragment round trip.')
assert(parsedConfirmation.searchParams.get('type') === 'recovery', 'Recovery type must survive the fragment round trip.')
assert(parsedRedirect.origin === 'https://www.smart-afex.com', 'Recovery callback must use the canonical www origin.')
assert(parsedRedirect.pathname === '/auth/callback', 'Complete callback path must survive the fragment round trip.')
assert(parsedRedirect.searchParams.get('next') === '/reset-password', 'Reset destination must survive the fragment round trip.')
assert(parsedRedirect.searchParams.get('state') === 'digest.123.signature', 'Signed state structure must survive the fragment round trip.')
assert(decodeFragmentOnce(`confirmation=${confirmationUrl}`) === confirmationUrl, 'A literal ConfirmationURL must not be decoded or re-encoded.')

assert(page.includes("window.location.hash.slice(1)") && page.includes("window.history.replaceState(null, '', window.location.pathname)"), 'Confirmation URL must stay in the fragment and be removed from browser history.')
assert(page.includes('method="post"') && page.includes('action="/auth/recovery/continue"') && page.includes('type="submit"'), 'Recovery verification must require an explicit form submission.')
assert(!page.includes('window.location.assign') && !page.includes('window.location.replace') && !page.includes('meta http-equiv') && !page.includes('fetch(confirmationUrl'), 'Intermediate page must never request or automatically navigate to the verification provider.')
assert(!page.includes('Supabase') && !page.includes('Auth provider') && !page.includes('backend provider') && !page.includes('verification provider'), 'Customer recovery UI must use AFEX-only wording.')
assert(continuation.includes('validateRecoveryConfirmationUrl') && continuation.includes("token_hash: confirmation.tokenHash") && continuation.includes("type: 'recovery'"), 'Only the validated explicit POST may verify the recovery token hash.')
assert(!continuation.includes('NextResponse.redirect(confirmation.confirmationUrl'), 'Continuation must not depend on a PKCE redirect exchange.')
assert(continuation.includes('hasValidRecoveryCallbackStateSignature(confirmation.state)') && continuation.indexOf('hasValidRecoveryCallbackStateSignature(confirmation.state)') < continuation.indexOf('supabase.auth.verifyOtp'), 'Signed recovery state must be validated before consuming the one-time token.')
assert(continuation.includes('isValidRecoveryCallbackState(confirmation.state, data.user.email)') && continuation.includes('establishRecoveryContext(data.user.id)'), 'Verified user must match the signed request before recovery context is created.')
for (const expected of ["confirmationUrl.protocol !== 'https:'", 'confirmationUrl.origin !== supabaseUrl.origin', "confirmationUrl.pathname !== RECOVERY_VERIFICATION_PATH", "confirmationUrl.searchParams.get('type') !== 'recovery'", 'redirectUrl.origin !== appOrigin', "redirectUrl.pathname !== RECOVERY_CALLBACK_PATH"]) {
  assert(validator.includes(expected), `Missing recovery destination validation: ${expected}`)
}
for (const category of ['RECOVERY_CONFIRMATION_MISSING', 'RECOVERY_CONFIRMATION_INVALID', 'RECOVERY_CONFIRMATION_HOST_INVALID', 'RECOVERY_CONFIRMATION_PATH_INVALID', 'RECOVERY_CONFIRMATION_TYPE_INVALID', 'RECOVERY_REDIRECT_INVALID', 'RECOVERY_STATE_INVALID', 'RECOVERY_TOKEN_VERIFICATION_FAILED', 'RECOVERY_USER_MISMATCH', 'RECOVERY_CONTEXT_FAILED']) {
  assert(`${validator}\n${continuation}`.includes(category), `Missing safe recovery category: ${category}`)
}
assert(!continuation.includes('error.message') && !continuation.includes('confirmationUrl:') && !continuation.includes('request.nextUrl.toString()'), 'Continuation must not log recovery secrets or raw errors.')
assert(template.includes('https://www.smart-afex.com/auth/recovery#confirmation={{ .ConfirmationURL }}'), 'Email CTA must use the canonical AFEX fragment wrapper.')
assert(!template.includes('href="{{ .ConfirmationURL }}"'), 'Email must not link directly to the one-time Supabase URL.')
assert(callback.includes('exchangeCodeForSession(code)') && complete.includes('clearRecoveryContext()'), 'Existing one-time callback and completion protections must remain intact.')

console.log('AFEX prefetch-safe recovery checks passed.')
