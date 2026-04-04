begin;

create or replace function public.resolve_insert_branch_id(
  requested_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_branch_id uuid;
  profile_role text;
begin
  if requested_branch_id is not null then
    return requested_branch_id;
  end if;

  select p.role, p.branch_id
  into profile_role, resolved_branch_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if resolved_branch_id is not null then
    return resolved_branch_id;
  end if;

  if profile_role is distinct from 'admin' then
    raise exception 'Branch-scoped writes require a valid branch_id on the authenticated profile'
      using errcode = '23514';
  end if;

  select b.id
  into resolved_branch_id
  from public.branches b
  where b.code = 'main'
  limit 1;

  return resolved_branch_id;
end;
$$;

commit;
