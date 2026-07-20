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

function resolveConfig() {
  if (!enabled(process.env.WELCOME_EMAIL_NOTIFICATIONS_ENABLED)) return null

  const apiKey = process.env.RESEND_API_KEY?.trim() || ''
  const from = process.env.SUPPORT_EMAIL_FROM?.trim() || ''
  const replyTo = process.env.SUPPORT_EMAIL_REPLY_TO?.trim() || ''
  if (!apiKey || !validMailbox(from, true) || (replyTo && !validMailbox(replyTo))) {
    throw new Error('Welcome email configuration is invalid')
  }
  return { apiKey, from, replyTo: replyTo || undefined, baseUrl: resolveTrustedAppBaseUrl() }
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
