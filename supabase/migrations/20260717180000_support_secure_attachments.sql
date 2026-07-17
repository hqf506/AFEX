-- Support Center S4.2: private, server-managed attachment metadata and storage bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do nothing;

-- Never silently repurpose an existing bucket with weaker or different settings.
do $$
begin
  if exists (
    select 1
    from storage.buckets
    where storage.buckets.id = 'support-attachments'
      and (
        storage.buckets.public
        or storage.buckets.file_size_limit is distinct from 10485760
        or storage.buckets.allowed_mime_types is distinct from
          array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
      )
  ) then
    raise exception 'Existing support-attachments bucket has incompatible security settings';
  end if;
end;
$$;

create unique index if not exists support_tickets_id_tenant_uidx
  on public.support_tickets (id, tenant_id);
create unique index if not exists support_messages_id_ticket_uidx
  on public.support_messages (id, ticket_id);

create table if not exists public.support_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null,
  message_id uuid null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  uploader_type text not null check (uploader_type in ('customer', 'provider')),
  storage_bucket text not null default 'support-attachments' check (storage_bucket = 'support-attachments'),
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  is_internal boolean not null default false check (is_internal = false),
  created_at timestamptz not null default now(),
  constraint support_attachments_ticket_tenant_fk
    foreign key (ticket_id, tenant_id)
    references public.support_tickets (id, tenant_id)
    on delete cascade,
  constraint support_attachments_message_ticket_fk
    foreign key (message_id, ticket_id)
    references public.support_messages (id, ticket_id)
    on delete cascade
);

create index if not exists support_attachments_ticket_created_idx
  on public.support_attachments (ticket_id, created_at);
create index if not exists support_attachments_message_idx
  on public.support_attachments (message_id)
  where message_id is not null;

alter table public.support_attachments enable row level security;

-- All access is mediated by authenticated Next.js server routes using service_role.
-- No direct browser table or storage-object policy is intentionally created.
revoke all on public.support_attachments from public;
revoke all on public.support_attachments from anon;
revoke all on public.support_attachments from authenticated;
