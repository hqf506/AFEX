create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('provider_owner', 'provider_support')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence if not exists public.support_ticket_number_seq;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid null references public.branches(id) on delete set null,
  created_by uuid not null references auth.users(id),
  category text not null check (category in ('technical_error','orders','inventory','invoices','whatsapp','printing','users_permissions','performance','feature_request','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'new' check (status in ('new','investigating','waiting_customer','resolved','closed')),
  title text not null,
  description text not null,
  source text not null default 'manual' check (source in ('manual','error_report','system')),
  page_path text null,
  error_reference text null,
  error_code text null,
  safe_error_message text null,
  diagnostic_context jsonb not null default '{}'::jsonb,
  assigned_to uuid null references public.platform_admins(user_id) on delete set null,
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  sender_type text not null check (sender_type in ('customer','provider','system')),
  message text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_id uuid null references auth.users(id),
  event_type text not null,
  previous_value jsonb null,
  new_value jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_tenant_created_idx
  on public.support_tickets (tenant_id, created_at desc);
create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_priority_created_idx
  on public.support_tickets (priority, created_at desc);
create index if not exists support_messages_ticket_created_idx
  on public.support_messages (ticket_id, created_at);
create index if not exists support_ticket_events_ticket_created_idx
  on public.support_ticket_events (ticket_id, created_at);

create or replace function public.is_active_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.platform_admins
    where public.platform_admins.user_id = auth.uid()
      and public.platform_admins.is_active
  );
$$;

revoke all on function public.is_active_platform_admin() from public;
revoke all on function public.is_active_platform_admin() from anon;
grant execute on function public.is_active_platform_admin() to authenticated;
grant execute on function public.is_active_platform_admin() to service_role;

create or replace function public.current_profile_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.profiles.tenant_id
  from public.profiles
  where public.profiles.id = auth.uid()
    and public.profiles.is_active
  limit 1;
$$;

revoke all on function public.current_profile_tenant_id() from public;
revoke all on function public.current_profile_tenant_id() from anon;
grant execute on function public.current_profile_tenant_id() to authenticated;
grant execute on function public.current_profile_tenant_id() to service_role;

create or replace function public.touch_support_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_support_updated_at() from public;
revoke all on function public.touch_support_updated_at() from anon;
revoke all on function public.touch_support_updated_at() from authenticated;

drop trigger if exists support_tickets_touch on public.support_tickets;
create trigger support_tickets_touch
before update on public.support_tickets
for each row execute function public.touch_support_updated_at();

drop trigger if exists support_messages_touch on public.support_messages;
create trigger support_messages_touch
before update on public.support_messages
for each row execute function public.touch_support_updated_at();

drop trigger if exists platform_admins_touch on public.platform_admins;
create trigger platform_admins_touch
before update on public.platform_admins
for each row execute function public.touch_support_updated_at();

alter table public.platform_admins enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_ticket_events enable row level security;

drop policy if exists platform_admins_self_select on public.platform_admins;
create policy platform_admins_self_select
on public.platform_admins
for select
to authenticated
using (
  public.platform_admins.user_id = auth.uid()
  and public.platform_admins.is_active
);

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select
on public.support_tickets
for select
to authenticated
using (
  public.is_active_platform_admin()
  or public.support_tickets.tenant_id = public.current_profile_tenant_id()
);

drop policy if exists support_tickets_customer_insert on public.support_tickets;

drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select
on public.support_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_tickets
    where public.support_tickets.id = public.support_messages.ticket_id
      and (
        public.is_active_platform_admin()
        or (
          public.support_tickets.tenant_id = public.current_profile_tenant_id()
          and not public.support_messages.is_internal
        )
      )
  )
);

drop policy if exists support_messages_customer_insert on public.support_messages;

drop policy if exists support_events_select on public.support_ticket_events;
create policy support_events_select
on public.support_ticket_events
for select
to authenticated
using (public.is_active_platform_admin());

revoke all on public.platform_admins from anon;
revoke all on public.support_tickets from anon;
revoke all on public.support_messages from anon;
revoke all on public.support_ticket_events from anon;
revoke all on sequence public.support_ticket_number_seq from anon;

revoke insert, update, delete, truncate, references, trigger
  on public.platform_admins
  from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.support_tickets
  from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.support_messages
  from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.support_ticket_events
  from authenticated;
revoke all on sequence public.support_ticket_number_seq from authenticated;

grant select on public.platform_admins to authenticated;
grant select on public.support_tickets to authenticated;
grant select on public.support_messages to authenticated;
grant select on public.support_ticket_events to authenticated;

create or replace function public.create_support_ticket_atomic(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_created_by uuid,
  p_category text,
  p_priority text,
  p_title text,
  p_description text,
  p_source text,
  p_page_path text,
  p_error_reference text,
  p_error_code text,
  p_safe_error_message text,
  p_diagnostic_context jsonb
)
returns table(id uuid, ticket_number text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ticket public.support_tickets;
  v_ticket_sequence_number bigint;
  v_ticket_number text;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := trim(coalesce(p_description, ''));
  v_diagnostic_context jsonb := coalesce(p_diagnostic_context, '{}'::jsonb);
begin
  if p_tenant_id is null or not exists (
    select 1
    from public.tenants
    where public.tenants.id = p_tenant_id
  ) then
    raise exception using errcode = '22023', message = 'Invalid support tenant';
  end if;

  if p_created_by is null or not exists (
    select 1
    from public.profiles
    where public.profiles.id = p_created_by
      and public.profiles.tenant_id = p_tenant_id
      and public.profiles.is_active
  ) then
    raise exception using errcode = '42501', message = 'Invalid support ticket creator';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches
    where public.branches.id = p_branch_id
      and public.branches.tenant_id = p_tenant_id
      and public.branches.deleted_at is null
  ) then
    raise exception using errcode = '22023', message = 'Invalid support branch';
  end if;

  if v_title = '' or char_length(v_title) > 180 then
    raise exception using errcode = '22023', message = 'Invalid support title';
  end if;

  if v_description = '' or char_length(v_description) > 5000 then
    raise exception using errcode = '22023', message = 'Invalid support description';
  end if;

  if octet_length(v_diagnostic_context::text) > 8192 then
    raise exception using errcode = '22023', message = 'Support diagnostics are too large';
  end if;

  if p_category is null or p_category not in (
    'technical_error',
    'orders',
    'inventory',
    'invoices',
    'whatsapp',
    'printing',
    'users_permissions',
    'performance',
    'feature_request',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'Invalid support category';
  end if;

  if p_priority is null or p_priority not in (
    'low',
    'normal',
    'high',
    'critical'
  ) then
    raise exception using errcode = '22023', message = 'Invalid support priority';
  end if;

  if p_source is null or p_source not in (
    'manual',
    'error_report',
    'system'
  ) then
    raise exception using errcode = '22023', message = 'Invalid support source';
  end if;

  if p_page_path is not null and char_length(p_page_path) > 300 then
    raise exception using errcode = '22023', message = 'Invalid support page path';
  end if;

  if p_error_reference is not null and char_length(p_error_reference) > 100 then
    raise exception using errcode = '22023', message = 'Invalid support error reference';
  end if;

  if p_error_code is not null and char_length(p_error_code) > 100 then
    raise exception using errcode = '22023', message = 'Invalid support error code';
  end if;

  if p_safe_error_message is not null and char_length(p_safe_error_message) > 500 then
    raise exception using errcode = '22023', message = 'Invalid safe support message';
  end if;

  v_ticket_sequence_number := nextval('public.support_ticket_number_seq');
  v_ticket_number :=
    'SUP-'
    || to_char(now(), 'YYYYMM')
    || '-'
    || lpad(v_ticket_sequence_number::text, 6, '0');

  insert into public.support_tickets (
    ticket_number,
    tenant_id,
    branch_id,
    created_by,
    category,
    priority,
    title,
    description,
    source,
    page_path,
    error_reference,
    error_code,
    safe_error_message,
    diagnostic_context
  )
  values (
    v_ticket_number,
    p_tenant_id,
    p_branch_id,
    p_created_by,
    p_category,
    p_priority,
    v_title,
    v_description,
    p_source,
    nullif(trim(coalesce(p_page_path, '')), ''),
    nullif(trim(coalesce(p_error_reference, '')), ''),
    nullif(trim(coalesce(p_error_code, '')), ''),
    nullif(trim(coalesce(p_safe_error_message, '')), ''),
    v_diagnostic_context
  )
  returning * into v_ticket;

  insert into public.support_messages (
    ticket_id,
    sender_id,
    sender_type,
    message,
    is_internal
  )
  values (
    v_ticket.id,
    p_created_by,
    'customer',
    v_description,
    false
  );

  insert into public.support_ticket_events (
    ticket_id,
    actor_id,
    event_type,
    previous_value,
    new_value
  )
  values (
    v_ticket.id,
    p_created_by,
    'ticket_created',
    null,
    jsonb_build_object(
      'status',
      'new',
      'priority',
      p_priority,
      'category',
      p_category
    )
  );

  return query
  select v_ticket.id, v_ticket.ticket_number;
end;
$$;

revoke all on function public.create_support_ticket_atomic(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public;
revoke all on function public.create_support_ticket_atomic(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from anon;
revoke all on function public.create_support_ticket_atomic(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from authenticated;
grant execute on function public.create_support_ticket_atomic(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;
