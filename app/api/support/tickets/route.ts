import { after, NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import packageMetadata from '@/package.json'
import { withAuthCookies } from '@/lib/api-auth'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { isTrustedErrorReportRequest } from '@/lib/support/error-report-request'
import { sanitizeDiagnostics } from '@/lib/support/sanitize-diagnostics'
import { sendSupportEmailNotification } from '@/lib/support/email'
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  isOneOf,
  positiveInteger,
  requireSupportAuth,
  text,
} from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const TICKET_SELECT = 'id, ticket_number, category, priority, status, title, source, last_message_at, resolved_at, closed_at, created_at, updated_at'

function developmentSupportError(
  authResponse: NextResponse,
  error: string,
  details: unknown,
  status: number
) {
  if (process.env.NODE_ENV !== 'development') {
    return jsonWithAuthCookies(authResponse, { success: false, error }, status)
  }

  return withAuthCookies(
    authResponse,
    NextResponse.json({ success: false, error, details }, { status })
  )
}

function errorReportPage(request: NextRequest) {
  try {
    const referer = request.headers.get('referer')
    return referer ? new URL(referer).pathname.slice(0, 300) || '/' : '/'
  } catch {
    return '/'
  }
}

function safeClientPlatform(userAgent: string) {
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /Chrome\//.test(userAgent) ? 'Chrome'
      : /Firefox\//.test(userAgent) ? 'Firefox'
        : /Safari\//.test(userAgent) ? 'Safari'
          : 'Unknown browser'
  const operatingSystem = /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent) ? 'iOS/iPadOS'
      : /Windows/.test(userAgent) ? 'Windows'
        : /Mac OS X/.test(userAgent) ? 'macOS'
          : /Linux/.test(userAgent) ? 'Linux'
            : 'Unknown OS'
  const deviceType = /iPad|Tablet/.test(userAgent) ? 'tablet'
    : /Mobile|Android|iPhone|iPod/.test(userAgent) ? 'mobile'
      : 'desktop'
  return { browser, operatingSystem, deviceType }
}

export async function GET(request: NextRequest) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider && !auth.profile.tenant_id) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل تذاكر الدعم.' }, 403)
  }

  const params = request.nextUrl.searchParams
  const page = positiveInteger(params.get('page'), 1, 100000)
  const pageSize = positiveInteger(params.get('pageSize'), 25, 100)
  const status = params.get('status')
  const priority = params.get('priority')
  const category = params.get('category')
  const search = text(params.get('search'), 100).replace(/[,()%_]/g, ' ')
  const from = (page - 1) * pageSize

  let query = supabaseAdmin.from('support_tickets').select(TICKET_SELECT, { count: 'exact' }).order('created_at', { ascending: false })
  if (!auth.isProvider) query = query.eq('tenant_id', auth.profile.tenant_id as string)
  if (isOneOf(status, SUPPORT_STATUSES)) query = query.eq('status', status)
  if (isOneOf(priority, SUPPORT_PRIORITIES)) query = query.eq('priority', priority)
  if (isOneOf(category, SUPPORT_CATEGORIES)) query = query.eq('category', category)
  if (search) query = query.or(`ticket_number.ilike.%${search}%,title.ilike.%${search}%`)

  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل تذاكر الدعم.' }, 500)
  return jsonWithAuthCookies(auth.response, { success: true, tickets: data || [], total: count || 0, page, pageSize })
}

export async function POST(request: NextRequest) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (auth.isProvider || !auth.profile.tenant_id) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إنشاء تذكرة الدعم.' }, 403)
  }
  const body = await request.json().catch(() => null)
  const isErrorReport = isTrustedErrorReportRequest(request) && body?.source === 'error_report'
  const reportComment = text(body?.comment, 1000)
  const pagePath = errorReportPage(request)
  const feature = text(body?.feature, 100).match(/^[a-zA-Z0-9._/-]+$/)?.[0] || 'error-boundary'
  const errorCode = text(body?.error_code, 100).match(/^[a-zA-Z0-9._/-]+$/)?.[0] || 'unknown'
  const httpStatus = Number.isInteger(body?.http_status) && body.http_status >= 400 && body.http_status <= 599 ? String(body.http_status) : 'unknown'
  const errorFingerprint = `ERR-${createHash('sha256').update(`${pagePath}|${feature}|${errorCode}|${httpStatus}`).digest('hex').slice(0, 16).toUpperCase()}`
  const errorReference = errorFingerprint
  const userAgent = request.headers.get('user-agent')?.slice(0, 500) || ''
  const platform = safeClientPlatform(userAgent)
  const timestamp = new Date().toISOString()
  let generatedDiagnostics: Record<string, string> | null = null
  let generatedDescription = ''
  if (isErrorReport) {
    const tenantId = auth.profile.tenant_id
    const [tenantResult, branchResult] = await Promise.all([
      supabaseAdmin.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
      auth.profile.branch_id
        ? supabaseAdmin.from('branches').select('name').eq('id', auth.profile.branch_id).eq('tenant_id', tenantId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const tenantName = tenantResult.data?.name?.trim() || 'غير متوفر'
    const branchName = branchResult.data?.name?.trim() || 'غير متوفر'
    const authenticatedUser = auth.profile.full_name?.trim() || auth.profile.username?.trim() || 'مستخدم مصادق عليه'
    generatedDiagnostics = sanitizeDiagnostics({
      page_path: pagePath,
      route: pagePath,
      feature,
      timestamp,
      app_version: packageMetadata.version,
      browser: platform.browser,
      operating_system: platform.operatingSystem,
      device_type: platform.deviceType,
      role: auth.profile.role,
      tenant: tenantName,
      branch: branchName,
      authenticated_user: authenticatedUser,
      error_reference: errorReference,
      error_fingerprint: errorFingerprint,
      error_code: errorCode,
      http_status: httpStatus,
    })
    generatedDescription = [
      'وصف المستخدم:',
      reportComment || 'لم يضف المستخدم وصفًا.',
      '',
      'السياق التقني الآمن:',
      `الصفحة: ${pagePath}`,
      `الميزة: ${feature}`,
      `رمز الخطأ: ${errorCode}`,
      `حالة HTTP: ${httpStatus}`,
      `الوقت: ${timestamp}`,
      `المتصفح: ${platform.browser}`,
      `نظام التشغيل: ${platform.operatingSystem}`,
      `نوع الجهاز: ${platform.deviceType}`,
      `إصدار التطبيق: ${packageMetadata.version}`,
      `المنشأة: ${tenantName}`,
      `الفرع: ${branchName}`,
      `المستخدم: ${authenticatedUser}`,
      `بصمة الخطأ: ${errorFingerprint}`,
    ].join('\n')
  }
  const category = isErrorReport ? 'technical_error' : body?.category
  const priority = isErrorReport ? 'normal' : body?.priority || 'normal'
  const title = isErrorReport ? 'بلاغ عطل تلقائي' : text(body?.title, 180)
  const description = isErrorReport ? generatedDescription : text(body?.description, 5000)
  const source = isErrorReport ? 'error_report' : 'manual'
  const invalidFields = [
    ...(!body ? ['body'] : []),
    ...(!isOneOf(category, SUPPORT_CATEGORIES) ? ['category'] : []),
    ...(!isOneOf(priority, SUPPORT_PRIORITIES) ? ['priority'] : []),
    ...(!title ? ['title'] : []),
    ...(!description ? ['description'] : []),
  ]
  if (invalidFields.length > 0) {
    return developmentSupportError(
      auth.response,
      'تعذر إنشاء تذكرة الدعم.',
      {
        validation: 'invalid_request',
        invalidFields,
        allowedCategories: SUPPORT_CATEGORIES,
        allowedPriorities: SUPPORT_PRIORITIES,
      },
      400
    )
  }
  const diagnostics = generatedDiagnostics || sanitizeDiagnostics(body?.diagnostic_context)
  if (isErrorReport) {
    const duplicateSince = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const [duplicateResult, rateResult] = await Promise.all([
      supabaseAdmin
        .from('support_tickets')
        .select('id, ticket_number')
        .eq('created_by', auth.user.id)
        .eq('tenant_id', auth.profile.tenant_id)
        .eq('source', 'error_report')
        .eq('page_path', pagePath)
        .eq('error_reference', errorReference)
        .gte('created_at', duplicateSince)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', auth.user.id)
        .eq('tenant_id', auth.profile.tenant_id)
        .eq('source', 'error_report')
        .gte('created_at', duplicateSince),
    ])
    if (duplicateResult.error || rateResult.error) {
      return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إرسال بلاغ الدعم.' }, 500)
    }
    const previousReport = duplicateResult.data
    if (previousReport) {
      return jsonWithAuthCookies(auth.response, {
        success: true,
        ticket: previousReport,
        error_reference: errorReference,
        reused: true,
      })
    }
    if ((rateResult.count || 0) >= 5) {
      return jsonWithAuthCookies(auth.response, { success: false, error: 'تم إرسال عدة بلاغات مؤخرًا. حاول مرة أخرى لاحقًا.' }, 429)
    }
  }
  const { data, error } = await supabaseAdmin.rpc('create_support_ticket_atomic', {
    p_tenant_id: auth.profile.tenant_id,
    p_branch_id: auth.profile.branch_id,
    p_created_by: auth.user.id,
    p_category: category,
    p_priority: priority,
    p_title: title,
    p_description: description,
    p_source: source,
    p_page_path: text(diagnostics.page_path, 300) || null,
    p_error_reference: text(diagnostics.error_reference, 100) || null,
    p_error_code: text(diagnostics.error_code, 100) || null,
    p_safe_error_message: text(diagnostics.safe_message, 500) || null,
    p_diagnostic_context: diagnostics,
  })
  const ticket = Array.isArray(data) ? data[0] : data
  if (error || !ticket) {
    if (isErrorReport) {
      return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إرسال بلاغ الدعم.' }, 500)
    }
    return developmentSupportError(
      auth.response,
      'تعذر إنشاء تذكرة الدعم.',
      {
        validation: 'atomic_ticket_creation_failed',
        code: error?.code || null,
        message: error?.message || 'RPC returned no ticket',
        details: error?.details || null,
        hint: error?.hint || null,
      },
      500
    )
  }
  after(async () => {
    await sendSupportEmailNotification({ eventType: 'ticket_created', ticketId: ticket.id, sourceId: ticket.id })
  })
  return jsonWithAuthCookies(auth.response, {
    success: true,
    ticket: { id: ticket.id, ticket_number: ticket.ticket_number },
    ...(isErrorReport ? { error_reference: errorReference, reused: false } : {}),
  }, 201)
}
