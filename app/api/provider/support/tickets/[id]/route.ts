import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { getActiveProviderAgents, resolveProviderAssignment } from '@/lib/support/provider-agents'
import { SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUSES, isOneOf, requireSupportAuth } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider) return jsonWithAuthCookies(auth.response, { success: false, error: 'لا تملك صلاحية الوصول إلى هذه التذكرة.' }, 403)
  const { id } = await params

  try {
    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .select('id, ticket_number, tenant_id, branch_id, created_by, assigned_to, category, priority, status, title, description, source, created_at, updated_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'التذكرة غير موجودة.' }, 404)

    const [tenantResult, branchResult, customerResult, messagesResult, internalNotesResult, eventsResult, attachmentsResult, agents] = await Promise.all([
      supabaseAdmin.from('tenants').select('name').eq('id', ticket.tenant_id).maybeSingle(),
      ticket.branch_id
        ? supabaseAdmin.from('branches').select('name').eq('id', ticket.branch_id).eq('tenant_id', ticket.tenant_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin.from('profiles').select('full_name').eq('id', ticket.created_by).eq('tenant_id', ticket.tenant_id).maybeSingle(),
      supabaseAdmin.from('support_messages').select('sender_type, message, created_at').eq('ticket_id', ticket.id).eq('is_internal', false).order('created_at'),
      supabaseAdmin.from('support_messages').select('sender_id, message, created_at').eq('ticket_id', ticket.id).eq('is_internal', true).order('created_at', { ascending: false }),
      supabaseAdmin.from('support_ticket_events').select('actor_id, event_type, previous_value, new_value, created_at').eq('ticket_id', ticket.id).order('created_at'),
      supabaseAdmin.from('support_attachments').select('id, original_filename, mime_type, size_bytes, created_at').eq('ticket_id', ticket.id).eq('is_internal', false).order('created_at'),
      getActiveProviderAgents(),
    ])
    if (tenantResult.error || branchResult.error || customerResult.error || messagesResult.error || internalNotesResult.error || eventsResult.error || attachmentsResult.error) {
      throw tenantResult.error || branchResult.error || customerResult.error || messagesResult.error || internalNotesResult.error || eventsResult.error || attachmentsResult.error
    }
    const agentNames = new Map(agents.map((agent) => [agent.userId, agent.name]))
    const assignedAgent = agents.find((agent) => agent.userId === ticket.assigned_to)

    return jsonWithAuthCookies(auth.response, {
      success: true,
      ticket: {
        ticket_number: ticket.ticket_number,
        tenant_name: tenantResult.data?.name || 'منشأة عميل',
        branch_name: branchResult.data?.name || null,
        customer_name: customerResult.data?.full_name || 'عميل AFEX',
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        title: ticket.title,
        description: ticket.description,
        source: ticket.source,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        assignment_key: ticket.assigned_to === auth.user.id ? 'me' : assignedAgent?.key || 'unassigned',
        assigned_name: assignedAgent?.name || null,
        assigned_to_me: ticket.assigned_to === auth.user.id,
      },
      messages: messagesResult.data || [],
      internal_notes: (internalNotesResult.data || []).map((note) => ({
        author: agentNames.get(note.sender_id) || 'فريق AFEX',
        note: note.message,
        created_at: note.created_at,
      })),
      attachments: attachmentsResult.data || [],
      events: (eventsResult.data || []).map((event) => {
        const previousAssigned = Boolean(event.previous_value && typeof event.previous_value === 'object' && 'assigned_to' in event.previous_value && event.previous_value.assigned_to)
        const nextAssigned = Boolean(event.new_value && typeof event.new_value === 'object' && 'assigned' in event.new_value && event.new_value.assigned)
        const assignmentLabel = event.event_type === 'assigned_to_changed'
          ? !nextAssigned
            ? 'تم إلغاء إسناد التذكرة'
            : previousAssigned
              ? 'تم تغيير مسؤول التذكرة'
              : 'تم إسناد التذكرة'
          : null
        return {
          event_type: event.event_type,
          label: assignmentLabel,
          actor: event.actor_id ? agentNames.get(event.actor_id) || 'فريق AFEX' : null,
          created_at: event.created_at,
        }
      }),
      agents: agents.map((agent) => ({ key: agent.key, name: agent.name, is_me: agent.userId === auth.user.id })),
    })
  } catch {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل تفاصيل تذكرة الدعم.' }, 500)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider) return jsonWithAuthCookies(auth.response, { success: false, error: 'لا تملك صلاحية الوصول إلى هذه التذكرة.' }, 403)
  const { id } = await params
  const body = await request.json().catch(() => null)
  const { data: ticket } = await supabaseAdmin.from('support_tickets').select('status, priority, category, assigned_to, resolved_at, closed_at').eq('id', id).maybeSingle()
  if (!ticket) return jsonWithAuthCookies(auth.response, { success: false, error: 'التذكرة غير موجودة.' }, 404)

  const changes: Record<string, unknown> = {}
  if (isOneOf(body?.status, SUPPORT_STATUSES) && body.status !== ticket.status) changes.status = body.status
  if (isOneOf(body?.priority, SUPPORT_PRIORITIES) && body.priority !== ticket.priority) changes.priority = body.priority
  if (isOneOf(body?.category, SUPPORT_CATEGORIES) && body.category !== ticket.category) changes.category = body.category
  let assignmentAgents = null
  if (body && Object.hasOwn(body, 'assignment_key')) {
    const assignment = await resolveProviderAssignment(body.assignment_key, auth.user.id)
    if (!assignment) return jsonWithAuthCookies(auth.response, { success: false, error: 'مسؤول التذكرة غير صالح.' }, 400)
    if (assignment.userId !== ticket.assigned_to) changes.assigned_to = assignment.userId
    assignmentAgents = assignment.agents
  }
  if (changes.status === 'resolved') changes.resolved_at = new Date().toISOString()
  else if (changes.status && changes.status !== 'closed') changes.resolved_at = null
  if (changes.status === 'closed') changes.closed_at = new Date().toISOString()
  else if (changes.status) changes.closed_at = null
  if (Object.keys(changes).length === 0) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحديث تذكرة الدعم.' }, 400)

  const { error } = await supabaseAdmin.from('support_tickets').update(changes).eq('id', id)
  if (error) return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحديث تذكرة الدعم.' }, 500)
  const events = Object.entries(changes)
    .filter(([field]) => ['status', 'priority', 'category', 'assigned_to'].includes(field))
    .map(([field, value]) => ({
      ticket_id: id,
      actor_id: auth.user.id,
      event_type: `${field}_changed`,
      previous_value: { [field]: ticket[field as keyof typeof ticket] },
      new_value: field === 'assigned_to'
        ? { assigned: value ? assignmentAgents?.some((agent) => agent.userId === value) : false }
        : { [field]: value },
    }))
  const { error: eventError } = await supabaseAdmin.from('support_ticket_events').insert(events)
  if (eventError) {
    const rollback: Record<string, unknown> = {}
    if (Object.hasOwn(changes, 'status')) {
      rollback.status = ticket.status
      rollback.resolved_at = ticket.resolved_at
      rollback.closed_at = ticket.closed_at
    }
    if (Object.hasOwn(changes, 'priority')) rollback.priority = ticket.priority
    if (Object.hasOwn(changes, 'category')) rollback.category = ticket.category
    if (Object.hasOwn(changes, 'assigned_to')) rollback.assigned_to = ticket.assigned_to
    await supabaseAdmin.from('support_tickets').update(rollback).eq('id', id)
    return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحديث تذكرة الدعم.' }, 500)
  }
  return jsonWithAuthCookies(auth.response, { success: true })
}
