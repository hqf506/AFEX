import fs from 'node:fs'
import path from 'node:path'

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const listPage = read('app/admin/support/page.tsx')
const detailPage = read('app/admin/support/[id]/page.tsx')
const mappings = read('lib/support/ui.ts')
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
assert(mappings.includes('supportStatusLabels') && mappings.includes('supportPriorityLabels') && mappings.includes('supportCategoryLabels'), 'Support labels must be shared.')
assert(![listPage, detailPage].some((source) => source.includes('supabase')), 'Customer support UI must not access Supabase directly.')

console.log('Support customer UI checks passed.')
