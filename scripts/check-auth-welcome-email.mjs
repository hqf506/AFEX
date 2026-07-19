import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const email = read('lib/auth/email.ts')
const emailServer = read('lib/email/server.ts')
const createUser = read('app/api/admin/create-user/route.ts')
const onboarding = read('app/api/onboarding/create-tenant/route.ts')
const updatePosUser = read('app/api/admin/update-pos-user/route.ts')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

assert(email.includes("import 'server-only'"), 'Auth email service must remain server-only.')
assert(email.includes('WELCOME_EMAIL_NOTIFICATIONS_ENABLED'), 'Welcome email must have an independent feature flag.')
assert(email.includes("users.leatherfix.local") && email.includes('INTERNAL_EMAIL_DOMAINS'), 'Internal generated addresses must be excluded.')
assert(email.includes("'admin', 'manager', 'employee'") && !email.includes("'cashier'"), 'Only real email-login roles may receive welcome email.')
assert(email.includes('escapeHtml') && email.includes('resolveTrustedAppBaseUrl') && emailServer.includes('AFEX_APP_BASE_URL'), 'Dynamic HTML must be escaped and links must use trusted configuration.')
assert(email.includes("new URL('/login', baseUrl)") && !email.includes("headers().get('host')"), 'Login URL must use the configured server-side base URL.')
assert(email.includes('Idempotency-Key') && email.includes("createHash('sha256')"), 'Welcome delivery must use a deterministic opaque idempotency key.')
assert(email.includes('AbortController') && email.includes("fetch('https://api.resend.com/emails'"), 'Resend delivery must be timeout bounded and server-side.')
assert(!email.includes('password:') && !email.includes('pos_pin') && !email.includes('access_token') && !email.includes('refresh_token'), 'Welcome content must not include credentials.')
assert(createUser.includes('after(async () => {') && createUser.indexOf('await sendWelcomeEmail') > createUser.indexOf('await writeAuditLog'), 'Admin/employee welcome email must be scheduled after completed creation and audit.')
assert(createUser.includes('if (isEmailLoginRole(role))'), 'Cashier creation must not schedule welcome email.')
assert(onboarding.indexOf('await sendWelcomeEmail') > onboarding.indexOf('create_tenant_with_owner RPC succeeded'), 'Onboarding email must be scheduled only after tenant creation succeeds.')
assert(updatePosUser.includes('if (!existingSameIdAuthUser)') && updatePosUser.indexOf('await sendWelcomeEmail') > updatePosUser.indexOf('user.pos_cashier_converted_to_profile'), 'POS conversion must email only when a new Auth account was created and conversion completed.')
assert(!createUser.includes('void sendWelcomeEmail') && !onboarding.includes('void sendWelcomeEmail') && !updatePosUser.includes('void sendWelcomeEmail'), 'Welcome delivery must use managed after(), not floating promises.')

console.log('AFEX Welcome Email checks passed.')
