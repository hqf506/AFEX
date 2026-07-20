import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const route = read('app/api/admin/update-pos-user/route.ts')
const login = read('app/api/auth/login/route.ts')
const forgotPassword = read('app/api/auth/reset-password/route.ts')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

assert(route.includes("requireApiAuth(request, ['admin'])") && route.includes(".eq('tenant_id', tenantId)"), 'Email updates must remain admin-authorized and tenant-scoped.')
assert(route.includes('getUserById(userId)') && route.includes('auth.admin.updateUserById(userId'), 'The trusted profile ID must select the Auth user updated server-side.')
assert(route.includes('email: contactEmail') && route.includes('contact_email: contactEmail'), 'Auth and profile emails must receive the same normalized value.')
assert(route.includes('email: previousAuthEmail') && route.includes('AUTH_EMAIL_ROLLBACK_FAILED'), 'Profile failure must trigger categorized Auth email compensation.')
assert(route.includes('MAX_EMAIL_LENGTH = 254') && route.includes('isInternalGeneratedEmail(contactEmail)'), 'Updated emails must be bounded and reject generated internal addresses.')
assert(route.includes("if (!isEmailLoginRole(role))") && route.includes("role === 'cashier'"), 'Cashier accounts must remain outside the email-login update path.')
assert(!route.includes('sendWelcomeEmail({\n          accountId: userId'), 'An existing profile email edit must not trigger a Welcome Email.')
assert(!route.includes('old_contact_email') && !route.includes('new_contact_email'), 'Full old/new email values must not be logged or written to audit metadata.')
assert(login.includes(".eq('contact_email', identifier)") && login.includes('getUserById(profile.id)'), 'Login must continue resolving both profile and Auth email consistently.')
assert(forgotPassword.includes('resetPasswordForEmail(email'), 'Forgot Password must continue targeting the submitted Auth email.')

console.log('AFEX Auth/profile email synchronization checks passed.')
