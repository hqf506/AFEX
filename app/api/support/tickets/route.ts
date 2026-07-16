import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { sanitizeDiagnostics } from '@/lib/support/sanitize-diagnostics'
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

const TICKET_SELECT = 'id, ticket_number, tenant_id, branch_id, category, priority, status, title, source, assigned_to, last_message_at, resolved_at, closed_at, created_at, updated_at'

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
  const category = body?.category
  const priority = body?.priority || 'normal'
  const title = text(body?.title, 180)
  const description = text(body?.description, 5000)
  const source = ['manual', 'error_report', 'system'].includes(body?.source) ? body.source : 'manual'
  if (!isOneOf(category, SUPPORT_CATEGORIES) || !isOneOf(priority, SUPPORT_PRIORITIES) || !title || !description) {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إنشاء تذكرة الدعم.' }, 400)
  }
  const diagnostics = sanitizeDiagnostics(body?.diagnostic_context)
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
  if (error || !ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر إنشاء تذكرة الدعم.' }, 500)
  return jsonWithAuthCookies(auth.response, { success: true, ticket: { id: ticket.id, ticket_number: ticket.ticket_number } }, 201)
}
