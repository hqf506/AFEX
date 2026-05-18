begin;

update public.branches
set order_number_prefix = null
where tenant_id is not null;

with ranked_branches as (
  select
    b.id,
    b.tenant_id,
    lpad(
      row_number() over (
        partition by b.tenant_id
        order by b.created_at asc nulls last, b.id asc
      )::text,
      2,
      '0'
    ) as next_prefix
  from public.branches as b
  where b.tenant_id is not null
)
update public.branches as b
set order_number_prefix = ranked_branches.next_prefix,
    updated_at = now()
from ranked_branches
where b.id = ranked_branches.id
  and b.tenant_id = ranked_branches.tenant_id;

create unique index if not exists idx_branches_tenant_order_number_prefix
  on public.branches (tenant_id, order_number_prefix)
  where order_number_prefix is not null;

commit;
