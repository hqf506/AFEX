begin;

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists contact_email text,
  add column if not exists phone text,
  add column if not exists pos_pin_hash text;

create or replace function public.set_pos_pin(user_id uuid, raw_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if raw_pin is null or raw_pin !~ '^[0-9]{4}$' then
    raise exception 'POS PIN must be exactly 4 digits';
  end if;

  update public.profiles
  set
    pos_pin_hash = crypt(raw_pin, gen_salt('bf')),
    updated_at = now()
  where id = user_id;

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.set_pos_pin(uuid, text) from public;
grant execute on function public.set_pos_pin(uuid, text) to service_role;

commit;
