import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const settings = read('app/admin/settings/page.tsx')
const account = read('app/api/account/route.ts')
const emailChange = read('app/api/account/email-change/route.ts')
const emailChangeState = read('lib/auth/email-change-state.ts')
const authEmail = read('lib/auth/email.ts')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

assert(
  settings.includes('startAccountEditing') &&
    settings.includes('saveAccountDetails') &&
    settings.includes('cancelAccountEditing'),
  'Settings must provide inline account edit, save, and cancel actions.'
)
assert(
  emailChange.includes('data.user.email') &&
    emailChange.includes('sendAccountEmailChangeNotifications') &&
    emailChange.includes('after(async () =>') &&
    emailChange.indexOf('.update({ contact_email: email') <
      emailChange.indexOf('scheduleEmailChangeNotifications({'),
  'AFEX email-change notifications must be scheduled only after confirmed Auth email and profile synchronization.'
)
assert(
  emailChangeState.includes("createCipheriv('aes-256-gcm'") &&
    emailChangeState.includes("httpOnly") === false &&
    emailChange.includes('httpOnly: true') &&
    emailChange.includes("const oldEmail = auth.user.email?.trim().toLowerCase()") &&
    !emailChange.includes('body?.oldEmail'),
  'The trusted old email must be retained in encrypted server-issued HttpOnly state, never accepted from the browser.'
)
assert(
  authEmail.includes('auth/email-change/new/') &&
    authEmail.includes('auth/email-change/old/') &&
    authEmail.includes('Promise.allSettled') &&
    authEmail.includes('escapeHtml'),
  'Both post-verification emails must use safe branded content, isolated delivery, and deterministic idempotency keys.'
)
assert(
  !settings.includes('href="/account"') &&
    settings.includes("fetch('/api/account/email-change'") &&
    settings.includes('pendingAccountEmail'),
  'Settings must keep account editing inline and expose the verified email-change state.'
)
assert(
  emailChange.includes('auth.supabase.auth.updateUser({ email })') &&
    emailChange.includes("type: 'email_change'") &&
    emailChange.includes('data.user.id !== auth.user.id'),
  'Email changes must use the authenticated Supabase flow and bind verification to the current user.'
)
assert(
  emailChange.includes("data.user.email?.trim().toLowerCase() !== email") &&
    emailChange.includes(".update({ contact_email: email") &&
    emailChange.includes("export async function PUT(request: NextRequest)"),
  'Profile email synchronization must happen only after Auth confirms the requested email.'
)
assert(
  account.includes('contactEmail !== authenticatedEmail') &&
    account.includes('يجب تأكيد البريد الإلكتروني الجديد قبل حفظه'),
  'The shared account API must reject an unconfirmed profile email.'
)
assert(
  !emailChange.includes('updateUserById') &&
    !emailChange.includes('service_role') &&
    !emailChange.includes('console.'),
  'Email-change routes must not force Auth updates, expose service-role architecture, or log sensitive flow data.'
)

console.log('Inline account editing and verified email-change checks passed.')
