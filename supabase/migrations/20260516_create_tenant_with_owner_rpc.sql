begin;

create extension if not exists pgcrypto;

create or replace function public.create_tenant_with_owner(
  p_tenant_name text,
  p_owner_user_id uuid,
  p_owner_username text,
  p_owner_full_name text default null,
  p_owner_contact_email text default null,
  p_owner_phone text default null,
  p_default_branch_name text default 'Main Branch'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_branch_id uuid := gen_random_uuid();
  v_branch_code text;
  v_tenant_name text := nullif(trim(coalesce(p_tenant_name, '')), '');
  v_owner_username text := lower(nullif(trim(coalesce(p_owner_username, '')), ''));
  v_owner_full_name text := nullif(trim(coalesce(p_owner_full_name, '')), '');
  v_owner_contact_email text := lower(nullif(trim(coalesce(p_owner_contact_email, '')), ''));
  v_owner_phone text := nullif(trim(coalesce(p_owner_phone, '')), '');
  v_default_branch_name text := nullif(trim(coalesce(p_default_branch_name, '')), '');
begin
  if v_tenant_name is null then
    raise exception 'Tenant name is required'
      using errcode = '23502';
  end if;

  if p_owner_user_id is null then
    raise exception 'Owner user id is required'
      using errcode = '23502';
  end if;

  if v_owner_username is null then
    raise exception 'Owner username is required'
      using errcode = '23502';
  end if;

  insert into public.tenants (name)
  values (v_tenant_name)
  returning id into v_tenant_id;

  v_branch_code := 'branch-' || left(replace(v_branch_id::text, '-', ''), 8);

  insert into public.branches (
    id,
    code,
    name,
    is_active,
    tenant_id,
    order_number_prefix
  )
  values (
    v_branch_id,
    v_branch_code,
    coalesce(v_default_branch_name, 'Main Branch'),
    true,
    v_tenant_id,
    '01'
  );

  insert into public.profiles (
    id,
    username,
    full_name,
    contact_email,
    phone,
    role,
    is_active,
    tenant_id,
    branch_id
  )
  values (
    p_owner_user_id,
    v_owner_username,
    coalesce(v_owner_full_name, v_owner_username),
    v_owner_contact_email,
    v_owner_phone,
    'admin',
    true,
    v_tenant_id,
    v_branch_id
  )
  on conflict (id) do update
  set
    username = excluded.username,
    full_name = excluded.full_name,
    contact_email = excluded.contact_email,
    phone = excluded.phone,
    role = excluded.role,
    is_active = excluded.is_active,
    tenant_id = excluded.tenant_id,
    branch_id = excluded.branch_id;

  return jsonb_build_object(
    'tenantId', v_tenant_id,
    'tenant_id', v_tenant_id,
    'ownerId', p_owner_user_id,
    'owner_id', p_owner_user_id,
    'userId', p_owner_user_id,
    'branchId', v_branch_id,
    'branch_id', v_branch_id,
    'orderNumberPrefix', '01',
    'order_number_prefix', '01'
  );
end;
$$;

revoke all on function public.create_tenant_with_owner(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.create_tenant_with_owner(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text
) to service_role;

commit;
