import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

const migration = read('supabase/migrations/20260716150000_support_center_foundation.sql')
const listRoute = read('app/api/support/tickets/route.ts')
const detailRoute = read('app/api/support/tickets/[id]/route.ts')
const messagesRoute = read('app/api/support/tickets/[id]/messages/route.ts')
const providerRoute = read('app/api/provider/support/tickets/[id]/route.ts')
const summaryRoute = read('app/api/provider/support/summary/route.ts')
const sanitizerSource = read('lib/support/sanitize-diagnostics.ts')
const errorFallback = read('components/support-error-fallback.tsx')
const appError = read('app/error.tsx')
const globalError = read('app/global-error.tsx')

assert(migration.includes('public.support_tickets.tenant_id = public.current_profile_tenant_id()'), 'Tenant RLS must isolate tickets.')
assert(migration.includes('public.is_active_platform_admin()'), 'Provider must have independent access.')
assert(migration.includes('drop policy if exists support_messages_customer_insert') && !migration.includes('create policy support_messages_customer_insert'), 'Authenticated customers must not insert messages directly.')
assert(migration.includes('drop policy if exists support_tickets_customer_insert') && !migration.includes('create policy support_tickets_customer_insert'), 'Authenticated customers must not insert tickets directly.')
assert(migration.includes("nextval('public.support_ticket_number_seq')"), 'Ticket numbers must use a concurrency-safe sequence.')
assert(!migration.toLowerCase().includes('count(*) + 1'), 'Ticket numbers must not use count + 1.')
assert(!migration.includes('function public.next_support_ticket_number'), 'Ticket number generation must not be exposed as a separate function.')
assert(
  migration.indexOf("nextval('public.support_ticket_number_seq')") >
    migration.indexOf('function public.create_support_ticket_atomic'),
  'Ticket numbers must be generated inside the atomic creation function.'
)
assert(migration.includes('create_support_ticket_atomic') && migration.includes("'ticket_created'"), 'Ticket creation must include its first message and event atomically.')
assert(
  migration.includes('public.profiles.id = p_created_by') &&
    migration.includes('public.profiles.tenant_id = p_tenant_id') &&
    migration.includes('public.profiles.is_active'),
  'The RPC must validate the active creator profile and tenant.'
)
assert(
  migration.includes('public.branches.id = p_branch_id') &&
    migration.includes('public.branches.tenant_id = p_tenant_id') &&
    migration.includes('public.branches.deleted_at is null'),
  'The RPC must validate branch ownership and deletion state.'
)
assert(listRoute.includes("{ count: 'exact' }") && listRoute.includes('.range('), 'Ticket pagination must be exact.')
assert(listRoute.includes(".eq('status'") && listRoute.includes(".eq('priority'") && listRoute.includes(".eq('category'"), 'Ticket filters must be supported.')
assert(appError.includes('SupportErrorFallback') && globalError.includes('SupportErrorFallback'), 'App and root errors must share the Support reporting fallback.')
assert(errorFallback.includes("fetch('/api/support/tickets'") && errorFallback.includes("source: 'error_report'"), 'Crash reports must reuse the Support ticket API.')
assert(errorFallback.includes('maxLength={1000}') && errorFallback.includes("comment.trim().slice(0, 1000)"), 'Crash comments must remain optional and bounded.')
assert(!errorFallback.includes('error.stack') && !errorFallback.includes('error.message'), 'Crash reports must not send stack traces or raw error messages.')
assert(listRoute.includes("createHash('sha256')") && listRoute.includes(".eq('error_reference', errorReference)") && listRoute.includes('10 * 60 * 1000'), 'Error references and ten-minute duplicate protection must be server-controlled.')
assert(listRoute.includes(".eq('created_by', auth.user.id)") && listRoute.includes(".eq('tenant_id', auth.profile.tenant_id)"), 'Duplicate lookup must preserve user and tenant isolation.')
assert(listRoute.includes("title = isErrorReport ? 'بلاغ عطل تلقائي'") && listRoute.includes("category = isErrorReport ? 'technical_error'"), 'Automatic ticket fields must be generated server-side.')
assert(providerRoute.includes("event_type: `${field}_changed`"), 'Provider updates must record an event per changed field.')
assert(providerRoute.includes('if (!auth.isProvider)'), 'Customer must not use provider patch.')
assert(providerRoute.includes("supabaseAdmin.from('support_tickets').update(changes)"), 'Provider patch must use the service-role server client.')
assert(
  !migration.includes('create policy support_tickets_provider_update'),
  'Provider patch must not add an unnecessary UPDATE RLS policy.'
)
assert(summaryRoute.includes('if (!auth.isProvider)'), 'Customer must not use provider summary.')
assert(providerRoute.includes("changes.resolved_at") && providerRoute.includes("changes.closed_at"), 'Resolved and closed timestamps must be maintained.')
assert(detailRoute.includes(".eq('is_internal', false)"), 'Customers must not see internal messages.')
assert(!detailRoute.match(/diagnostic_context,\s*assigned_to/), 'Customer ticket responses must not expose assignment.')
assert(detailRoute.includes('(assigned_to_changed,internal_note_added)'), 'Customer timelines must exclude provider collaboration events.')
assert(!detailRoute.includes('created_by, category') && !detailRoute.includes('diagnostic_context'), 'Customer ticket details must not expose creator IDs or diagnostics.')
assert(messagesRoute.includes('auth.isProvider && body?.is_internal === true'), 'Only providers may request internal notes.')
assert(![listRoute, detailRoute, messagesRoute, providerRoute, summaryRoute].some((source) => source.includes("select('*')")), 'Support APIs must not use select(*).')
assert(!listRoute.includes('body?.tenant_id') && !listRoute.includes('body?.created_by'), 'Ticket ownership must come from the session.')
assert(
  listRoute.includes('p_tenant_id: auth.profile.tenant_id') &&
    listRoute.includes('p_created_by: auth.user.id') &&
    listRoute.includes('p_branch_id: auth.profile.branch_id'),
  'The ticket route must pass tenant, creator, and allowed branch scope from authenticated session data.'
)

const compiled = ts.transpileModule(sanitizerSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const moduleValue = { exports: {} }
vm.runInNewContext(compiled, {
  exports: moduleValue.exports,
  module: moduleValue,
  Buffer,
  JSON,
  Object,
  Set,
  String,
})
const { sanitizeDiagnostics } = moduleValue.exports
const sanitized = sanitizeDiagnostics({
  page_path: '/admin/orders',
  environment: 'preview',
  safe_message: 'Safe',
  token: 'secret-token',
  access_token: 'secret',
  refresh_token: 'secret',
  cookie: 'session',
  authorization: 'bearer',
  password: 'password',
  phone: '0500000000',
  email: 'test@example.com',
  stack: 'raw stack',
  request_body: { secret: true },
})
assert(sanitized.page_path === '/admin/orders', 'Allowed diagnostic keys must remain.')
for (const forbidden of ['token', 'access_token', 'refresh_token', 'cookie', 'authorization', 'password', 'phone', 'email', 'stack', 'request_body']) {
  assert(!(forbidden in sanitized), `Diagnostic sanitizer leaked ${forbidden}.`)
}
assert(Buffer.byteLength(JSON.stringify(sanitizeDiagnostics(Object.fromEntries(
  Array.from({ length: 100 }, (_, index) => [`key_${index}`, 'x'.repeat(1000)])
))), 'utf8') <= 8192, 'Sanitized diagnostics must remain size-bounded.')

const clientSources = [
  ...fs.readdirSync(path.join(process.cwd(), 'app'), { recursive: true })
    .filter((file) => typeof file === 'string' && /\.(ts|tsx|js|jsx)$/.test(file))
    .map((file) => read(path.join('app', file))),
  ...fs.readdirSync(path.join(process.cwd(), 'components'), { recursive: true })
    .filter((file) => typeof file === 'string' && /\.(ts|tsx|js|jsx)$/.test(file))
    .map((file) => read(path.join('components', file))),
]
assert(
  !clientSources.some(
    (source) =>
      /^['"]use client['"]/m.test(source) &&
      source.includes('SUPABASE_SERVICE_ROLE_KEY')
  ),
  'Service role must not appear in client code.'
)

console.log('Support center security and contract checks passed.')
