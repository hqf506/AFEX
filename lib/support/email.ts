import 'server-only'

import { maskId, safeErrorMessage } from '@/lib/security/redaction'
import type { NotificationEventType, SupportCategory, SupportPriority } from '@/lib/support/contracts'
import { supportCategoryLabels, supportPriorityLabels } from '@/lib/support/ui'
import { supabaseAdmin } from '@/lib/supabase/admin'

type SupportEmailEvent = Extract<NotificationEventType, 'ticket_created' | 'customer_reply'>

type SupportEmailInput = {
  eventType: SupportEmailEvent
  ticketId: string
  sourceId: string
}

const MAX_RECIPIENTS = 20
const PREVIEW_LIMIT = 240
const REQUEST_TIMEOUT_MS = 10_000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validMailbox(value: string, allowDisplayName = false) {
  if (!value || /[\r\n]/.test(value)) return false
  const mailbox = allowDisplayName && value.endsWith('>')
    ? value.slice(value.lastIndexOf('<') + 1, -1).trim()
    : value
  return EMAIL_PATTERN.test(mailbox)
}

function enabled(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback
  return value.trim().toLowerCase() === 'true'
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character)
}

export function supportEmailPreview(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LIMIT)
}

function resolveBaseUrl() {
  const configured = process.env.AFEX_APP_BASE_URL?.trim()
  if (!configured) throw new Error('AFEX_APP_BASE_URL is missing')
  const url = new URL(configured)
  if (url.username || url.password || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new Error('AFEX_APP_BASE_URL is invalid')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('AFEX_APP_BASE_URL is invalid')
  return url.origin
}

function resolveConfig(eventType: SupportEmailEvent) {
  const notificationsEnabled = enabled(process.env.SUPPORT_EMAIL_NOTIFICATIONS_ENABLED)
  console.info('[support-email] diagnostics', { notificationsEnabled, eventType })
  if (!notificationsEnabled) {
    console.info('[support-email] early-return', { category: 'notifications_disabled', eventType })
    return null
  }
  const eventEnabled = eventType === 'ticket_created'
    ? enabled(process.env.SUPPORT_EMAIL_NEW_TICKET_ENABLED, true)
    : enabled(process.env.SUPPORT_EMAIL_CUSTOMER_REPLY_ENABLED, true)
  if (!eventEnabled) {
    console.info('[support-email] early-return', { category: 'event_disabled', eventType })
    return null
  }

  const apiKey = process.env.RESEND_API_KEY?.trim() || ''
  const from = process.env.SUPPORT_EMAIL_FROM?.trim() || ''
  const replyTo = process.env.SUPPORT_EMAIL_REPLY_TO?.trim() || ''
  if (!apiKey || !validMailbox(from, true) || (replyTo && !validMailbox(replyTo))) {
    throw new Error('Support email configuration is invalid')
  }
  return { apiKey, from, replyTo: replyTo || undefined, baseUrl: resolveBaseUrl() }
}

function emailContent(input: {
  eventType: SupportEmailEvent
  ticketId: string
  ticketNumber: string
  title: string
  tenantName: string
  priority: SupportPriority
  category: SupportCategory
  occurredAt: string
  preview: string | null
  baseUrl: string
}) {
  const eventLabel = input.eventType === 'ticket_created' ? 'تذكرة دعم جديدة' : 'رد جديد من العميل'
  const subject = `${eventLabel} — ${input.ticketNumber}`
  const ticketUrl = `${input.baseUrl}/developer/support?ticket=${encodeURIComponent(input.ticketId)}`
  const rows = [
    ['رقم التذكرة', input.ticketNumber],
    ['العنوان', input.title],
    ['المنشأة', input.tenantName],
    ['الأولوية', supportPriorityLabels[input.priority]],
    ['التصنيف', supportCategoryLabels[input.category]],
    ['الوقت', new Date(input.occurredAt).toLocaleString('ar-SA')],
  ]
  const text = [
    'AFEX SUPPORT', eventLabel, '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(input.preview ? ['', 'معاينة الرد:', input.preview] : []),
    '', `فتح التذكرة: ${ticketUrl}`,
  ].join('\n')
  const htmlRows = rows.map(([label, value]) => `<tr><td style="padding:8px;color:#94a3b8">${escapeHtml(label)}</td><td style="padding:8px;font-weight:700;color:#e2e8f0">${escapeHtml(value)}</td></tr>`).join('')
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;background:#030714;color:#e2e8f0;padding:24px"><div style="max-width:640px;margin:auto;border:1px solid #164e63;border-radius:24px;background:#07111f;padding:24px"><p style="color:#67e8f9;font-weight:800">AFEX SUPPORT</p><h1 style="font-size:24px;color:#fff">${escapeHtml(eventLabel)}</h1><table style="width:100%;border-collapse:collapse">${htmlRows}</table>${input.preview ? `<div style="margin-top:20px;padding:16px;border-radius:16px;background:#0f172a"><strong>معاينة الرد</strong><p style="line-height:1.8">${escapeHtml(input.preview)}</p></div>` : ''}<a href="${escapeHtml(ticketUrl)}" style="display:inline-block;margin-top:24px;border-radius:12px;background:#67e8f9;color:#082f49;padding:12px 20px;text-decoration:none;font-weight:800">فتح التذكرة في Developer Support</a></div></div>`
  return { subject, text, html }
}

async function activeOwnerRecipients() {
  const { data, error } = await supabaseAdmin.from('platform_admins').select('user_id').eq('role', 'provider_owner').eq('is_active', true).limit(MAX_RECIPIENTS + 1)
  if (error) throw error
  console.info('[support-email] diagnostics', { activeProviderOwners: (data || []).length })
  if ((data || []).length > MAX_RECIPIENTS) throw new Error('Active provider owner recipient limit exceeded')

  const resolved = await Promise.all((data || []).map(async ({ user_id }) => {
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(user_id)
    if (authError) throw authError
    const email = authUser.user?.email?.trim() || ''
    return {
      authUserResolved: Boolean(authUser.user),
      recipient: authUser.user?.email_confirmed_at && EMAIL_PATTERN.test(email) ? { userId: user_id, email } : null,
    }
  }))
  const resolvedAuthUsers = resolved.filter(({ authUserResolved }) => authUserResolved).length
  const recipients = resolved.map(({ recipient }) => recipient).filter((recipient): recipient is { userId: string; email: string } => Boolean(recipient))
  console.info('[support-email] diagnostics', { resolvedAuthUsers, validRecipientEmails: recipients.length })
  return recipients
}

async function sendWithResend(input: {
  apiKey: string
  from: string
  replyTo?: string
  recipient: string
  idempotencyKey: string
  subject: string
  text: string
  html: string
}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    console.info('[support-email] diagnostics', { resendHttpRequestStarted: true })
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({ from: input.from, to: [input.recipient], subject: input.subject, text: input.text, html: input.html, ...(input.replyTo ? { reply_to: input.replyTo } : {}) }),
      signal: controller.signal,
    })
    console.info('[support-email] diagnostics', { resendHttpStatus: response.status })
    if (!response.ok) throw new Error(`Resend request failed with status ${response.status}`)
    const result = await response.json().catch(() => null) as { id?: unknown } | null
    return typeof result?.id === 'string' ? result.id : null
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendSupportEmailNotification(input: SupportEmailInput) {
  console.info('[support-email] diagnostics', { eventTypeReceived: input.eventType, ticket: maskId(input.ticketId) })
  try {
    const config = resolveConfig(input.eventType)
    if (!config) return

    const { data: ticket, error: ticketError } = await supabaseAdmin.from('support_tickets').select('id, ticket_number, tenant_id, category, priority, title, created_at').eq('id', input.ticketId).maybeSingle()
    if (ticketError || !ticket) throw ticketError || new Error('Support ticket was not found')

    let occurredAt = ticket.created_at
    let preview: string | null = null
    if (input.eventType === 'customer_reply') {
      const { data: message, error: messageError } = await supabaseAdmin.from('support_messages').select('message, created_at').eq('id', input.sourceId).eq('ticket_id', ticket.id).eq('sender_type', 'customer').eq('is_internal', false).maybeSingle()
      if (messageError || !message) throw messageError || new Error('Eligible customer reply was not found')
      occurredAt = message.created_at
      preview = supportEmailPreview(message.message)
    }

    const [{ data: tenant, error: tenantError }, recipients] = await Promise.all([
      supabaseAdmin.from('tenants').select('name').eq('id', ticket.tenant_id).maybeSingle(),
      activeOwnerRecipients(),
    ])
    if (tenantError) throw tenantError
    const content = emailContent({
      eventType: input.eventType,
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      title: ticket.title,
      tenantName: tenant?.name?.trim() || 'منشأة عميل',
      priority: ticket.priority as SupportPriority,
      category: ticket.category as SupportCategory,
      occurredAt,
      preview,
      baseUrl: config.baseUrl,
    })

    if (recipients.length === 0) {
      console.info('[support-email] diagnostics', { sendEmailCalled: false })
      console.info('[support-email] early-return', { category: 'no_valid_recipients', eventType: input.eventType })
      return
    }

    await Promise.all(recipients.map(async (recipient) => {
      console.info('[support-email] diagnostics', { sendEmailCalled: true, recipient: maskId(recipient.userId) })
      const providerMessageId = await sendWithResend({
        ...config,
        recipient: recipient.email,
        idempotencyKey: `support/${input.eventType}/${input.sourceId}/${recipient.userId}`,
        ...content,
      })
      console.info('[support-email] sent', { eventType: input.eventType, ticket: maskId(ticket.id), recipient: maskId(recipient.userId), providerMessageId: providerMessageId ? maskId(providerMessageId) : null })
    }))
  } catch (error) {
    const errorCategory = error instanceof DOMException && error.name === 'AbortError'
      ? 'request_timeout'
      : error instanceof TypeError
        ? 'network_or_runtime'
        : 'support_email_flow'
    console.error('[support-email] failed', { eventType: input.eventType, ticket: maskId(input.ticketId), errorCategory, error: safeErrorMessage(error, 'Support email delivery failed') })
  }
}
