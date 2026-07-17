import fs from 'node:fs'
import path from 'node:path'

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const listPage = read('app/admin/support/page.tsx')
const detailPage = read('app/admin/support/[id]/page.tsx')
const mappings = read('lib/support/ui.ts')
const contracts = read('lib/support/contracts.ts')
const server = read('lib/support/server.ts')
const shell = read('components/admin-shell-layout.tsx')
const permissions = read('lib/permissions.ts')

assert(shell.includes("label: 'الدعم الفني'") && shell.includes("href: '/admin/support'"), 'Admin navigation must expose support.')
assert(permissions.includes("normalizedPathname.startsWith('/admin/support')"), 'Employee access must include support routes.')
assert(listPage.includes("fetch(`/api/support/tickets?${params}`") && listPage.includes("method: 'POST'"), 'Ticket list and creation must use support APIs.')
assert(listPage.includes('AbortController') && listPage.includes('requestSequence'), 'Ticket list must reject stale responses.')
assert(listPage.includes('PAGE_SIZE') && listPage.includes("params.set('status'") && listPage.includes("params.set('priority'") && listPage.includes("params.set('category'"), 'Ticket list must use server pagination and filters.')
assert(!listPage.includes('tenant_id') && !listPage.includes('created_by') && !listPage.includes('diagnostic_context'), 'Manual creation must not send trusted ownership or diagnostics.')
assert(detailPage.includes('/messages') && detailPage.includes("method: 'POST'"), 'Ticket detail must submit replies through the API.')
assert(detailPage.includes("message.is_internal !== true"), 'Customer UI must defensively hide internal messages.')
assert(!detailPage.includes('previous_value') && !detailPage.includes('new_value'), 'Customer timeline must not render provider-only event payloads.')
assert(detailPage.includes("ticket.status === 'closed'"), 'Closed tickets must disable replies.')
assert(detailPage.includes('navigator.clipboard.writeText') && detailPage.includes('تم نسخ رقم التذكرة'), 'Ticket number copy must provide safe feedback.')
assert(detailPage.includes("event.ctrlKey || event.metaKey") && detailPage.includes('requestSubmit()'), 'Reply form must support Ctrl/Cmd+Enter.')
assert(detailPage.includes('reply.length.toLocaleString') && detailPage.includes('maxLength={5000}'), 'Reply form must show its character limit.')
assert(detailPage.includes("message.sender_type === 'provider'") && detailPage.includes('فريق AFEX'), 'Customer conversation must identify AFEX replies.')
assert(!detailPage.includes('اسم الفرع غير متاح') && !detailPage.includes('الفرع المرتبط بحسابك'), 'Unavailable branch names must remain hidden.')
assert(mappings.includes('supportStatusLabels') && mappings.includes('supportPriorityLabels') && mappings.includes('supportCategoryLabels'), 'Support labels must be shared.')
assert(server.includes("from '@/lib/support/contracts'"), 'Support API must reuse the shared canonical contract.')
for (const value of ['technical_error', 'orders', 'inventory', 'invoices', 'whatsapp', 'printing', 'users_permissions', 'performance', 'feature_request', 'other', 'low', 'normal', 'high', 'critical']) {
  assert(contracts.includes(`'${value}'`), `Canonical support value is missing: ${value}`)
}
assert(listPage.includes("category: 'technical_error'") && !listPage.includes("category: 'technical'"), 'Create-ticket defaults must use a canonical category.')
assert(!listPage.includes('<select'), 'Support UI must use the shared dark select instead of native selects.')
assert(![listPage, detailPage].some((source) => source.includes('supabase')), 'Customer support UI must not access Supabase directly.')

console.log('Support customer UI checks passed.')
