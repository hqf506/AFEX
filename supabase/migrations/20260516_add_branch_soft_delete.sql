begin;

alter table public.branches
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

create index if not exists idx_branches_tenant_deleted_at
  on public.branches (tenant_id, deleted_at);

create or replace function public.purge_expired_deleted_branches()
returns table (
  tenant_id uuid,
  branch_id uuid,
  branch_name text,
  deleted_at timestamptz,
  purged_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
  v_purged_at timestamptz;
begin
  for v_branch in
    select b.id, b.tenant_id, b.name, b.deleted_at
    from public.branches as b
    where b.deleted_at is not null
      and b.deleted_at < now() - interval '30 days'
    order by b.deleted_at asc, b.id asc
  loop
    perform pg_advisory_xact_lock(
      hashtext('afex_purge_deleted_branch'),
      hashtext(v_branch.tenant_id::text || ':' || v_branch.id::text)
    );

    if not exists (
      select 1
      from public.branches as b
      where b.id = v_branch.id
        and b.tenant_id = v_branch.tenant_id
        and b.deleted_at is not null
        and b.deleted_at < now() - interval '30 days'
    ) then
      continue;
    end if;

    v_purged_at := now();

    update public.profiles as p
    set branch_id = null
    where p.tenant_id = v_branch.tenant_id
      and p.branch_id = v_branch.id;

    delete from public.invoice_items as ii
    where ii.tenant_id = v_branch.tenant_id
      and ii.invoice_id in (
        select i.id
        from public.invoices as i
        where i.tenant_id = v_branch.tenant_id
          and i.branch_id = v_branch.id
      );

    delete from public.invoices as i
    where i.tenant_id = v_branch.tenant_id
      and i.branch_id = v_branch.id;

    delete from public.orders as o
    where o.tenant_id = v_branch.tenant_id
      and o.branch_id = v_branch.id;

    delete from public.customers as c
    where c.tenant_id = v_branch.tenant_id
      and c.branch_id = v_branch.id;

    delete from public.discounts as d
    where d.branch_id = v_branch.id;

    delete from public.vat_settings as vs
    where vs.branch_id = v_branch.id;

    delete from public.branch_whatsapp_configs as bwc
    where bwc.branch_id = v_branch.id;

    delete from public.branch_catalog_items as bci
    where bci.branch_id = v_branch.id;

    delete from public.order_number_sequences as ons
    where ons.tenant_id = v_branch.tenant_id
      and ons.branch_id = v_branch.id;

    delete from public.branches as b
    where b.tenant_id = v_branch.tenant_id
      and b.id = v_branch.id;

    tenant_id := v_branch.tenant_id;
    branch_id := v_branch.id;
    branch_name := v_branch.name;
    deleted_at := v_branch.deleted_at;
    purged_at := v_purged_at;
    return next;
  end loop;
end;
$$;

revoke all on function public.purge_expired_deleted_branches() from public;
grant execute on function public.purge_expired_deleted_branches() to service_role;

commit;
