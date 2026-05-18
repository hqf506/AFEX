begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.hash_pos_pin(raw_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if raw_pin is null or raw_pin !~ '^[0-9]{4}$' then
    raise exception 'POS PIN must be exactly 4 digits';
  end if;

  return crypt(raw_pin, gen_salt('bf'));
end;
$$;

revoke all on function public.hash_pos_pin(text) from public;
grant execute on function public.hash_pos_pin(text) to service_role;

commit;
