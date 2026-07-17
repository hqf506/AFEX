-- Support Center S4.1A: provider-only operational metrics calculated from public messages.
-- This migration stores no mutable operational state and performs no data rewrite.

create index if not exists support_messages_public_ticket_sender_created_idx
  on public.support_messages (ticket_id, sender_type, created_at)
  where is_internal = false;

create or replace function public.get_provider_support_operational_dashboard(
  p_provider_user_id uuid,
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_status text default null,
  p_priority text default null,
  p_category text default null,
  p_organization text default null,
  p_assignment text default 'all',
  p_operational_filter text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_provider_user_id uuid := p_provider_user_id;
  v_now timestamptz := statement_timestamp();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_organization text := nullif(trim(coalesce(p_organization, '')), '');
  v_assignment text := coalesce(nullif(trim(p_assignment), ''), 'all');
  v_operational_filter text := coalesce(nullif(trim(p_operational_filter), ''), 'all');
  v_result jsonb;
begin
  -- Provider APIs use the server-only service-role client. p_provider_user_id must
  -- come from the server-verified session, never from browser input, and is verified
  -- again here. The RPC never accepts a tenant identifier.
  if v_provider_user_id is null or not exists (
    select 1
    from public.platform_admins
    where public.platform_admins.user_id = v_provider_user_id
      and public.platform_admins.is_active
  ) then
    raise exception using errcode = '42501', message = 'Active provider access required';
  end if;

  if p_status is not null and p_status not in ('new', 'investigating', 'waiting_customer', 'resolved', 'closed') then
    raise exception using errcode = '22023', message = 'Invalid support status filter';
  end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception using errcode = '22023', message = 'Invalid support priority filter';
  end if;
  if p_category is not null and p_category not in (
    'technical_error', 'orders', 'inventory', 'invoices', 'whatsapp',
    'printing', 'users_permissions', 'performance', 'feature_request', 'other'
  ) then
    raise exception using errcode = '22023', message = 'Invalid support category filter';
  end if;
  if v_assignment not in ('all', 'me', 'unassigned', 'assigned') then
    raise exception using errcode = '22023', message = 'Invalid support assignment filter';
  end if;
  if v_operational_filter not in (
    'all', 'awaiting_first_response', 'needs_follow_up', 'attention', 'overdue', 'waiting_customer'
  ) then
    raise exception using errcode = '22023', message = 'Invalid support operational filter';
  end if;

  with
  public_message_metrics as (
    select
      support_messages.ticket_id,
      min(support_messages.created_at) filter (where support_messages.sender_type = 'provider') as first_provider_reply_at,
      max(support_messages.created_at) filter (where support_messages.sender_type = 'customer') as last_customer_message_at,
      max(support_messages.created_at) filter (where support_messages.sender_type = 'provider') as last_provider_reply_at,
      max(support_messages.created_at) as last_public_message_at,
      (array_agg(
        support_messages.sender_type
        order by support_messages.created_at desc, support_messages.id desc
      ))[1] as last_public_sender_type,
      (array_agg(
        support_messages.sender_type
        order by support_messages.created_at desc, support_messages.id desc
      ) filter (where support_messages.sender_type in ('customer', 'provider')))[1] as last_conversation_sender_type,
      count(*)::bigint as public_message_count
    from public.support_messages
    where support_messages.is_internal = false
    group by support_messages.ticket_id
  ),
  metric_rows as (
    select
      support_tickets.id,
      support_tickets.ticket_number,
      support_tickets.category,
      support_tickets.priority,
      support_tickets.status,
      support_tickets.title,
      support_tickets.assigned_to,
      support_tickets.created_at,
      support_tickets.updated_at,
      support_tickets.resolved_at,
      support_tickets.closed_at,
      tenants.name as organization_name,
      public_message_metrics.first_provider_reply_at,
      public_message_metrics.last_customer_message_at,
      public_message_metrics.last_provider_reply_at,
      public_message_metrics.last_public_message_at,
      public_message_metrics.last_public_sender_type,
      public_message_metrics.last_conversation_sender_type,
      coalesce(public_message_metrics.public_message_count, 0)::bigint as public_message_count,
      case support_tickets.priority
        when 'critical' then 30
        when 'high' then 120
        when 'normal' then 480
        when 'low' then 1440
      end::integer as first_response_threshold_minutes,
      case support_tickets.priority
        when 'critical' then 60
        when 'high' then 240
        when 'normal' then 1440
        when 'low' then 2880
      end::integer as follow_up_threshold_minutes
    from public.support_tickets
    join public.tenants on public.tenants.id = support_tickets.tenant_id
    left join public_message_metrics on public_message_metrics.ticket_id = support_tickets.id
  ),
  timed_rows as (
    select
      metric_rows.*,
      greatest(0, floor(extract(epoch from (v_now - metric_rows.created_at)) / 60))::bigint as age_minutes,
      case
        when metric_rows.first_provider_reply_at is null then null
        else greatest(0, floor(extract(epoch from (metric_rows.first_provider_reply_at - metric_rows.created_at)) / 60))::bigint
      end as first_response_minutes,
      case
        when metric_rows.status in ('resolved', 'closed') then null
        when metric_rows.first_provider_reply_at is null then
          greatest(0, floor(extract(epoch from (v_now - metric_rows.created_at)) / 60))::bigint
        when metric_rows.last_conversation_sender_type = 'customer' and metric_rows.last_customer_message_at is not null then
          greatest(0, floor(extract(epoch from (v_now - metric_rows.last_customer_message_at)) / 60))::bigint
        when metric_rows.last_conversation_sender_type = 'provider' and metric_rows.last_provider_reply_at is not null then
          greatest(0, floor(extract(epoch from (v_now - metric_rows.last_provider_reply_at)) / 60))::bigint
        else null
      end as waiting_minutes,
      case
        when metric_rows.status in ('resolved', 'closed') then null
        when metric_rows.first_provider_reply_at is null then
          metric_rows.created_at + make_interval(mins => metric_rows.first_response_threshold_minutes)
        when metric_rows.last_conversation_sender_type = 'customer' and metric_rows.last_customer_message_at is not null then
          metric_rows.last_customer_message_at + make_interval(mins => metric_rows.follow_up_threshold_minutes)
        else null
      end as operational_deadline_at,
      -- Operational defaults have one contractual threshold. A 75% warning band
      -- provides the distinct attention state; reaching 100% is overdue.
      case
        when metric_rows.status = 'closed' then 'closed'
        when metric_rows.status = 'resolved' then 'resolved'
        when metric_rows.first_provider_reply_at is null
          and v_now >= metric_rows.created_at + make_interval(mins => metric_rows.first_response_threshold_minutes)
          then 'overdue'
        when metric_rows.first_provider_reply_at is null
          and v_now >= metric_rows.created_at + make_interval(mins => ceil(metric_rows.first_response_threshold_minutes * 0.75)::integer)
          then 'attention'
        when metric_rows.first_provider_reply_at is null then 'awaiting_first_response'
        when metric_rows.last_conversation_sender_type = 'provider' then 'waiting_customer'
        when metric_rows.last_conversation_sender_type = 'customer'
          and metric_rows.last_customer_message_at is not null
          and v_now >= metric_rows.last_customer_message_at + make_interval(mins => metric_rows.follow_up_threshold_minutes)
          then 'overdue'
        when metric_rows.last_conversation_sender_type = 'customer'
          and metric_rows.last_customer_message_at is not null
          and v_now >= metric_rows.last_customer_message_at + make_interval(mins => ceil(metric_rows.follow_up_threshold_minutes * 0.75)::integer)
          then 'attention'
        else 'within_time'
      end as operational_state
    from metric_rows
  ),
  base_filtered_rows as (
    select timed_rows.*
    from timed_rows
    where (p_status is null or timed_rows.status = p_status)
      and (p_priority is null or timed_rows.priority = p_priority)
      and (p_category is null or timed_rows.category = p_category)
      and (
        v_search is null
        or position(lower(v_search) in lower(timed_rows.ticket_number)) > 0
        or position(lower(v_search) in lower(timed_rows.title)) > 0
      )
      and (
        v_organization is null
        or lower(coalesce(timed_rows.organization_name, '')) = lower(v_organization)
      )
      and (
        v_assignment = 'all'
        or (v_assignment = 'me' and timed_rows.assigned_to = v_provider_user_id)
        or (v_assignment = 'unassigned' and timed_rows.assigned_to is null)
        or (v_assignment = 'assigned' and timed_rows.assigned_to is not null)
      )
  ),
  operational_filtered_rows as (
    select base_filtered_rows.*
    from base_filtered_rows
    where (
        v_operational_filter = 'all'
        or (v_operational_filter = 'awaiting_first_response' and base_filtered_rows.operational_state = 'awaiting_first_response')
        or (
          v_operational_filter = 'needs_follow_up'
          and base_filtered_rows.status not in ('resolved', 'closed')
          and base_filtered_rows.first_provider_reply_at is not null
          and base_filtered_rows.last_conversation_sender_type = 'customer'
        )
        or (v_operational_filter = 'attention' and base_filtered_rows.operational_state = 'attention')
        or (v_operational_filter = 'overdue' and base_filtered_rows.operational_state = 'overdue')
        or (v_operational_filter = 'waiting_customer' and base_filtered_rows.operational_state = 'waiting_customer')
      )
  ),
  paged_rows as (
    select operational_filtered_rows.*
    from operational_filtered_rows
    order by coalesce(operational_filtered_rows.last_public_message_at, operational_filtered_rows.created_at) desc, operational_filtered_rows.id desc
    limit v_page_size
    offset (v_page - 1) * v_page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', paged_rows.id,
          'ticket_number', paged_rows.ticket_number,
          'category', paged_rows.category,
          'priority', paged_rows.priority,
          'status', paged_rows.status,
          'title', paged_rows.title,
          'organization_name', coalesce(paged_rows.organization_name, 'منشأة عميل'),
          'is_assigned', paged_rows.assigned_to is not null,
          'assigned_to_me', paged_rows.assigned_to = v_provider_user_id,
          'created_at', paged_rows.created_at,
          'updated_at', paged_rows.updated_at,
          'first_provider_reply_at', paged_rows.first_provider_reply_at,
          'last_customer_message_at', paged_rows.last_customer_message_at,
          'last_provider_reply_at', paged_rows.last_provider_reply_at,
          'last_public_message_at', paged_rows.last_public_message_at,
          'last_public_sender_type', paged_rows.last_public_sender_type,
          'public_message_count', paged_rows.public_message_count,
          'age_minutes', paged_rows.age_minutes,
          'first_response_minutes', paged_rows.first_response_minutes,
          'waiting_minutes', paged_rows.waiting_minutes,
          'operational_deadline_at', paged_rows.operational_deadline_at,
          'first_response_threshold_minutes', paged_rows.first_response_threshold_minutes,
          'follow_up_threshold_minutes', paged_rows.follow_up_threshold_minutes,
          'operational_state', paged_rows.operational_state,
          'is_overdue', paged_rows.operational_state = 'overdue',
          'is_attention_required', paged_rows.operational_state in ('attention', 'overdue')
        )
        order by coalesce(paged_rows.last_public_message_at, paged_rows.created_at) desc, paged_rows.id desc
      )
      from paged_rows
    ), '[]'::jsonb),
    'pagination', jsonb_build_object(
      'page', v_page,
      'page_size', v_page_size,
      'total', (select count(*) from operational_filtered_rows)
    ),
    'summary', (
      select jsonb_build_object(
        'total_active', count(*) filter (where base_filtered_rows.status in ('new', 'investigating', 'waiting_customer')),
        'new', count(*) filter (where base_filtered_rows.status = 'new'),
        'investigating', count(*) filter (where base_filtered_rows.status = 'investigating'),
        'waiting_customer', count(*) filter (where base_filtered_rows.status = 'waiting_customer'),
        'resolved', count(*) filter (where base_filtered_rows.status = 'resolved'),
        'closed', count(*) filter (where base_filtered_rows.status = 'closed'),
        'critical', count(*) filter (where base_filtered_rows.priority = 'critical'),
        'assigned_to_me', count(*) filter (where base_filtered_rows.assigned_to = v_provider_user_id),
        'unassigned', count(*) filter (where base_filtered_rows.assigned_to is null),
        'awaiting_first_response', count(*) filter (where base_filtered_rows.operational_state = 'awaiting_first_response'),
        'attention', count(*) filter (where base_filtered_rows.operational_state = 'attention'),
        'overdue', count(*) filter (where base_filtered_rows.operational_state = 'overdue'),
        'operational_waiting_customer', count(*) filter (where base_filtered_rows.operational_state = 'waiting_customer')
      )
      from base_filtered_rows
    ),
    'calculated_at', v_now
  )
  into v_result;

  return v_result;
end;
$$;

comment on function public.get_provider_support_operational_dashboard(
  uuid, integer, integer, text, text, text, text, text, text, text
) is 'Service-role-only Support Center operational metrics. The server-supplied provider identity is reverified, public messages alone drive timing, standard filters shape summaries, and the operational filter applies only to items and pagination totals.';

revoke all on function public.get_provider_support_operational_dashboard(
  uuid, integer, integer, text, text, text, text, text, text, text
) from public;
revoke all on function public.get_provider_support_operational_dashboard(
  uuid, integer, integer, text, text, text, text, text, text, text
) from anon;
revoke all on function public.get_provider_support_operational_dashboard(
  uuid, integer, integer, text, text, text, text, text, text, text
) from authenticated;
grant execute on function public.get_provider_support_operational_dashboard(
  uuid, integer, integer, text, text, text, text, text, text, text
) to service_role;
