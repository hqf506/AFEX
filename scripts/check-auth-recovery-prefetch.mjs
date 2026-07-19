import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const page = read('app/auth/recovery/recovery-continuation.tsx')
const continuation = read('app/auth/recovery/continue/route.ts')
const validator = read('lib/auth/recovery-confirmation.ts')
const callback = read('app/auth/callback/route.ts')
const complete = read('app/api/auth/recovery/complete/route.ts')
const template = read('docs/auth/reset-password-email-template.html')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

assert(page.includes("window.location.hash.slice(1)") && page.includes("window.history.replaceState(null, '', window.location.pathname)"), 'Confirmation URL must stay in the fragment and be removed from browser history.')
assert(page.includes('method="post"') && page.includes('action="/auth/recovery/continue"') && page.includes('type="submit"'), 'Supabase verification must require an explicit form submission.')
assert(!page.includes('window.location.assign') && !page.includes('window.location.replace') && !page.includes('meta http-equiv') && !page.includes('fetch(confirmationUrl'), 'Intermediate page must never request or automatically navigate to Supabase.')
assert(continuation.includes('validateRecoveryConfirmationUrl') && continuation.includes('NextResponse.redirect(confirmationUrl, 303)'), 'Only the validated POST continuation may navigate to Supabase.')
for (const expected of ["confirmationUrl.protocol !== 'https:'", 'confirmationUrl.origin !== supabaseUrl.origin', "confirmationUrl.pathname !== RECOVERY_VERIFICATION_PATH", "confirmationUrl.searchParams.get('type') !== 'recovery'", 'redirectUrl.origin !== appOrigin', "redirectUrl.pathname !== RECOVERY_CALLBACK_PATH"]) {
  assert(validator.includes(expected), `Missing recovery destination validation: ${expected}`)
}
assert(template.includes('https://www.smart-afex.com/auth/recovery#confirmation={{ .ConfirmationURL }}'), 'Email CTA must use the canonical AFEX fragment wrapper.')
assert(!template.includes('href="{{ .ConfirmationURL }}"'), 'Email must not link directly to the one-time Supabase URL.')
assert(callback.includes('exchangeCodeForSession(code)') && complete.includes('clearRecoveryContext()'), 'Existing one-time callback and completion protections must remain intact.')

console.log('AFEX prefetch-safe recovery checks passed.')
