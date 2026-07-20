import 'server-only'

import { createHash } from 'node:crypto'
import type { AppRole } from '@/lib/app-roles'
import { getRoleLabel } from '@/lib/app-roles'
import { resolveTrustedAppBaseUrl } from '@/lib/email/server'
import { maskId, safeErrorMessage } from '@/lib/security/redaction'

const INTERNAL_EMAIL_DOMAINS = ['users.leatherfix.local'] as const
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REQUEST_TIMEOUT_MS = 10_000

export type WelcomeEmailInput = {
  accountId: string
  recipient: string
  displayName: string
  role: Extract<AppRole, 'admin' | 'manager' | 'employee'>
  organizationName?: string | null
  branchName?: string | null
}

export type AccountEmailChangeNotificationInput = {
  accountId: string
  displayName: string
  oldEmail: string
  newEmail: string
}

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true'
}

function validMailbox(value: string, allowDisplayName = false) {
  if (!value || /[\r\n]/.test(value)) return false
  const mailbox = allowDisplayName && value.endsWith('>')
    ? value.slice(value.lastIndexOf('<') + 1, -1).trim()
    : value
  return EMAIL_PATTERN.test(mailbox)
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

function resolveConfig(requireWelcomeEnabled = true) {
  if (
    requireWelcomeEnabled &&
    !enabled(process.env.WELCOME_EMAIL_NOTIFICATIONS_ENABLED)
  ) return null

  const apiKey = process.env.RESEND_API_KEY?.trim() || ''
  const from = process.env.SUPPORT_EMAIL_FROM?.trim() || ''
  const replyTo = process.env.SUPPORT_EMAIL_REPLY_TO?.trim() || ''
  if (!apiKey || !validMailbox(from, true) || (replyTo && !validMailbox(replyTo))) {
    throw new Error('Welcome email configuration is invalid')
  }
  return { apiKey, from, replyTo: replyTo || undefined, baseUrl: resolveTrustedAppBaseUrl() }
}

async function sendAuthEmail(input: {
  recipient: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
}) {
  const config = resolveConfig(false)
  if (!config || !validMailbox(input.recipient)) return

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [input.recipient.trim().toLowerCase()],
        subject: input.subject,
        text: input.text,
        html: input.html,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Resend request failed with status ${response.status}`)
  } finally {
    clearTimeout(timeout)
  }
}

function accountEmailChangeContent(input: AccountEmailChangeNotificationInput) {
  const displayName = input.displayName.trim() || 'مستخدم AFEX'
  const newSubject = 'تم تسجيل بريدك الإلكتروني في نظام AFEX'
  const oldSubject = 'تم تغيير البريد الإلكتروني لحسابك في AFEX'
  const newText = `مرحبًا ${displayName},\n\nتم تسجيل هذا البريد الإلكتروني بنجاح كالبريد المرتبط بحسابك في نظام AFEX.\n\nالبريد الإلكتروني الجديد:\n${input.newEmail}\n\nيمكنك الآن استخدام هذا البريد في العمليات المرتبطة بحسابك حسب إعدادات النظام.\n\nفريق AFEX`
  const oldText = `مرحبًا ${displayName},\n\nتم تغيير البريد الإلكتروني المرتبط بحسابك في نظام AFEX.\n\nالبريد الجديد:\n${input.newEmail}\n\nإذا كنت أنت من طلب هذا التغيير، فلا يلزم اتخاذ أي إجراء.\n\nإذا لم تكن أنت من قام بهذا التغيير، يرجى التواصل فورًا مع مسؤول النظام أو فريق الدعم.\n\nفريق AFEX`
  const shell = (subject: string, paragraphs: string[]) =>
    `<div dir="rtl" style="font-family:Arial,sans-serif;background:#030714;color:#e2e8f0;padding:24px"><div style="max-width:640px;margin:auto;border:1px solid #164e63;border-radius:24px;background:#07111f;padding:24px"><p style="color:#67e8f9;font-weight:800">AFEX</p><h1 style="font-size:26px;color:#fff">${escapeHtml(subject)}</h1>${paragraphs.map((paragraph) => `<p style="line-height:1.9">${escapeHtml(paragraph)}</p>`).join('')}<p style="margin-top:24px;color:#67e8f9;font-weight:700">فريق AFEX</p></div></div>`

  return {
    newEmail: {
      subject: newSubject,
      text: newText,
      html: shell(newSubject, [
        `مرحبًا ${displayName}،`,
        'تم تسجيل هذا البريد الإلكتروني بنجاح كالبريد المرتبط بحسابك في نظام AFEX.',
        `البريد الإلكتروني الجديد: ${input.newEmail}`,
        'يمكنك الآن استخدام هذا البريد في العمليات المرتبطة بحسابك حسب إعدادات النظام.',
      ]),
    },
    oldEmail: {
      subject: oldSubject,
      text: oldText,
      html: shell(oldSubject, [
        `مرحبًا ${displayName}،`,
        'تم تغيير البريد الإلكتروني المرتبط بحسابك في نظام AFEX.',
        `البريد الجديد: ${input.newEmail}`,
        'إذا كنت أنت من طلب هذا التغيير، فلا يلزم اتخاذ أي إجراء.',
        'إذا لم تكن أنت من قام بهذا التغيير، يرجى التواصل فورًا مع مسؤول النظام أو فريق الدعم.',
      ]),
    },
  }
}

export async function sendAccountEmailChangeNotifications(
  input: AccountEmailChangeNotificationInput
) {
  const oldEmail = input.oldEmail.trim().toLowerCase()
  const newEmail = input.newEmail.trim().toLowerCase()
  if (
    !input.accountId ||
    oldEmail === newEmail ||
    !validMailbox(oldEmail) ||
    !validMailbox(newEmail)
  ) return

  const content = accountEmailChangeContent({ ...input, oldEmail, newEmail })
  const eventKey = createHash('sha256')
    .update(`${input.accountId}:${oldEmail}:${newEmail}`)
    .digest('hex')

  const results = await Promise.allSettled([
    sendAuthEmail({
      recipient: newEmail,
      ...content.newEmail,
      idempotencyKey: `auth/email-change/new/${eventKey}`,
    }),
    sendAuthEmail({
      recipient: oldEmail,
      ...content.oldEmail,
      idempotencyKey: `auth/email-change/old/${eventKey}`,
    }),
  ])

  results.forEach((result, index) => {
    if (result.status !== 'rejected') return
    const errorCategory = result.reason instanceof DOMException && result.reason.name === 'AbortError'
      ? 'request_timeout'
      : result.reason instanceof TypeError
        ? 'network_or_runtime'
        : 'account_email_change_flow'
    console.error('[auth-email-change] failed', {
      account: maskId(input.accountId),
      recipientType: index === 0 ? 'new' : 'old',
      errorCategory,
    })
  })
}

export function isWelcomeEmailEligible(input: WelcomeEmailInput) {
  const recipient = input.recipient.trim().toLowerCase()
  const domain = recipient.split('@')[1] || ''
  return (
    Boolean(input.accountId) &&
    validMailbox(recipient) &&
    !INTERNAL_EMAIL_DOMAINS.includes(domain as (typeof INTERNAL_EMAIL_DOMAINS)[number]) &&
    ['admin', 'manager', 'employee'].includes(input.role)
  )
}

function welcomeEmailContent(input: WelcomeEmailInput, baseUrl: string) {
  const loginUrl = new URL('/login', baseUrl).toString()
  const organizationName = input.organizationName?.trim() || null
  const branchName = input.branchName?.trim() || null
  const roleLabel = getRoleLabel(input.role)
  const context = organizationName
    ? `تم إنشاء حسابك لدى ${organizationName} على منصة AFEX.`
    : 'تم إنشاء حسابك على منصة AFEX.'
  const rows = [
    ['الاسم', input.displayName.trim() || 'مستخدم AFEX'],
    ...(organizationName ? [['المنشأة', organizationName]] : []),
    ['الدور', roleLabel],
    ...(branchName ? [['الفرع', branchName]] : []),
  ]
  const subject = 'مرحبًا بك في AFEX — حسابك جاهز'
  const text = [
    'AFEX',
    '',
    `مرحبًا ${input.displayName.trim() || 'بك'}،`,
    context,
    'حسابك جاهز الآن، ويمكنك تسجيل الدخول باستخدام بيانات الدخول التي استلمتها من مسؤول النظام.',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `تسجيل الدخول: ${loginUrl}`,
    '',
    'لأمان حسابك، لن نطلب منك كلمة المرور أو رمز PIN عبر البريد الإلكتروني.',
  ].join('\n')
  const htmlRows = rows
    .map(([label, value]) => `<tr><td style="padding:8px;color:#94a3b8">${escapeHtml(label)}</td><td style="padding:8px;font-weight:700;color:#e2e8f0">${escapeHtml(value)}</td></tr>`)
    .join('')
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;background:#030714;color:#e2e8f0;padding:24px"><div style="max-width:640px;margin:auto;border:1px solid #164e63;border-radius:24px;background:#07111f;padding:24px"><p style="color:#67e8f9;font-weight:800">AFEX</p><h1 style="font-size:26px;color:#fff">${escapeHtml(subject)}</h1><p style="line-height:1.9">مرحبًا ${escapeHtml(input.displayName.trim() || 'بك')}،</p><p style="line-height:1.9">${escapeHtml(context)} حسابك جاهز الآن، ويمكنك تسجيل الدخول باستخدام بيانات الدخول التي استلمتها من مسؤول النظام.</p><table style="width:100%;border-collapse:collapse">${htmlRows}</table><a href="${escapeHtml(loginUrl)}" style="display:inline-block;margin-top:24px;border-radius:12px;background:#67e8f9;color:#082f49;padding:12px 20px;text-decoration:none;font-weight:800">تسجيل الدخول إلى AFEX</a><p style="margin-top:24px;padding:14px;border-radius:12px;background:#0f172a;color:#cbd5e1;line-height:1.8">لأمان حسابك، لن نطلب منك كلمة المرور أو رمز PIN عبر البريد الإلكتروني.</p></div></div>`

  return { subject, text, html }
}

export async function sendWelcomeEmail(input: WelcomeEmailInput) {
  if (!isWelcomeEmailEligible(input)) return

  try {
    const config = resolveConfig()
    if (!config) return
    const content = welcomeEmailContent(input, config.baseUrl)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const eventKey = createHash('sha256').update(input.accountId).digest('hex')

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `auth/welcome/${eventKey}`,
        },
        body: JSON.stringify({
          from: config.from,
          to: [input.recipient.trim().toLowerCase()],
          subject: content.subject,
          text: content.text,
          html: content.html,
          ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Resend request failed with status ${response.status}`)
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    const errorCategory = error instanceof DOMException && error.name === 'AbortError'
      ? 'request_timeout'
      : error instanceof TypeError
        ? 'network_or_runtime'
        : 'welcome_email_flow'
    console.error('[auth-email] failed', {
      account: maskId(input.accountId),
      errorCategory,
      error: safeErrorMessage(error, 'Welcome email delivery failed'),
    })
  }
}
