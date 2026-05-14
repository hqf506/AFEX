type TenantFilterQuery = {
  eq(column: string, value: string): unknown
}

export function applyTenantFilter<TQuery extends TenantFilterQuery>(
  query: TQuery,
  tenantId: string | null | undefined
): TQuery {
  if (!tenantId) {
    return query
  }

  return query.eq('tenant_id', tenantId) as TQuery
}
