import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const email = read('lib/support/email.ts')
const tickets = read('app/api/support/tickets/route.ts')
const messages = read('app/api/support/tickets/[id]/messages/route.ts')
const assert = (condition, message) => { if (!condition) throw new Error(message) }

assert(email.includes("import 'server-only'"), 'Support email service must remain server-only.')
assert(email.includes(".eq('role', 'provider_owner')") && email.includes(".eq('is_active', true)"), 'Recipients must be active provider owners.')
assert(email.includes('auth.admin.getUserById') && !email.includes('recipientEmail:'), 'Recipient email must be resolved from trusted Auth data.')
assert(email.includes(".eq('sender_type', 'customer')") && email.includes(".eq('is_internal', false)"), 'Customer reply eligibility must exclude provider and internal messages.')
assert(email.includes('supportEmailPreview') && email.includes('PREVIEW_LIMIT = 240') && email.includes('escapeHtml'), 'Email preview and HTML must be safely bounded and escaped.')
assert(email.includes('Idempotency-Key') && email.includes('support/${input.eventType}/${input.sourceId}/${recipient.userId}'), 'Resend requests must use a stable per-recipient idempotency key.')
assert(email.includes('AFEX_APP_BASE_URL') && !email.includes("headers().get('host')"), 'Ticket links must use a configured origin, not Host headers.')
assert(email.includes("fetch('https://api.resend.com/emails'") && email.includes('AbortController'), 'Resend calls must be server-side and timeout-bounded.')
assert(tickets.includes('after(async () => {') && tickets.includes("await sendSupportEmailNotification({ eventType: 'ticket_created'") && tickets.indexOf('after(async () => {') > tickets.indexOf('if (error || !ticket)'), 'Ticket email must be scheduled only after atomic creation succeeds.')
assert(messages.includes("eventType: 'customer_reply'") && messages.includes("if (!auth.isProvider && ticket.status !== 'closed')"), 'Only eligible non-closed customer replies may schedule email.')
assert(!messages.includes("eventType: 'ticket_reopened'") && !email.includes("'ticket_reopened'"), 'Ticket reopened email is out of scope.')
assert(tickets.indexOf('await sendSupportEmailNotification') > tickets.indexOf('after(async () => {') && messages.indexOf('await sendSupportEmailNotification') > messages.indexOf('after(async () => {'), 'Email delivery may only be awaited inside managed after() callbacks.')
assert(!tickets.includes('void sendSupportEmailNotification') && !messages.includes('void sendSupportEmailNotification'), 'Email delivery must use managed after(), not a floating promise.')
assert(!email.includes('storage_path') && !email.includes('signedUrl') && !email.includes('diagnostic_context'), 'Email content must exclude attachments and diagnostics.')

console.log('Support direct email notification checks passed.')
