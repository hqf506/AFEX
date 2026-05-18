begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

drop function if exists public.verify_pos_pin(text, uuid);
drop function if exists public.verify_pos_pin(text, uuid, uuid);

create or replace function public.verify_pos_pin(
  p_raw_pin text,
  p_tenant_id uuid,
  p_branch_id uuid default null
)
returns table (
  id uuid,
  username text,
  full_name text,
  role text,
  branch_id uuid
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    pp.id,
    pp.username,
    pp.full_name,
    pp.role,
    pp.branch_id
  from public.pos_profiles pp
  where pp.tenant_id = p_tenant_id
    and pp.is_active = true
    and pp.role in ('cashier', 'employee', 'manager', 'admin')
    and pp.pos_pin_hash is not null
    and extensions.crypt(p_raw_pin, pp.pos_pin_hash) = pp.pos_pin_hash
    and (p_branch_id is null or pp.branch_id = p_branch_id)
  order by pp.created_at asc
$$;

revoke all on function public.verify_pos_pin(text, uuid, uuid) from public;
grant execute on function public.verify_pos_pin(text, uuid, uuid) to authenticated;
grant execute on function public.verify_pos_pin(text, uuid, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
