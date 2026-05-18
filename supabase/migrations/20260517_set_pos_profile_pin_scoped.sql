begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_pos_profile_pin(
  p_user_id uuid,
  p_tenant_id uuid,
  raw_pin text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if raw_pin is null or raw_pin !~ '^[0-9]{4}$' then
    raise exception 'POS PIN must be exactly 4 digits';
  end if;

  update public.pos_profiles
  set
    pos_pin_hash = crypt(raw_pin, gen_salt('bf')),
    updated_at = now()
  where id = p_user_id
    and tenant_id = p_tenant_id;

  if not found then
    raise exception 'POS profile not found';
  end if;
end;
$$;

revoke all on function public.set_pos_profile_pin(uuid, uuid, text) from public;
grant execute on function public.set_pos_profile_pin(uuid, uuid, text) to service_role;

commit;
