# Tenant and Branch Isolation

## Trusted identity chain

Online requests derive the Primary Auth subject server-side, load `profiles`, and establish tenant plus system/assigned branch scope in `lib/authorization-context.ts:161-364`. POS routes additionally validate the HttpOnly actor session and replace the effective POS presentation actor only after tenant/branch validation. The PIN endpoint verifies that a requested branch belongs to the authenticated tenant before issuing an actor session (`app/api/pos/identify-employee-by-pin/route.ts:197-403`).

The trusted chain is therefore:

`Primary Auth session → active profile → tenant → allowed branch → validated POS actor session → route-specific server checks`.

This chain is proven for online route execution. It does not make a cached browser actor or request-body employee identifier authoritative.

## Direct Data API contradiction

For each of `customers`, `orders`, `invoices`, and `invoice_items`, Production contains broad and tenant-scoped permissive policy pairs. Example for SELECT:

`(auth.role() = 'authenticated') OR (tenant_id = current_profile_tenant_id())`.

For INSERT the effective check is the same OR composition, and for UPDATE both USING and WITH CHECK have the same defect. The broad predicate is true for any authenticated API request, so it defeats tenant isolation. `order_status_logs` is broader: its authenticated policies contain no tenant condition and no companion scoped policy.

This applies to direct authenticated Data API access. Server routes using `service_role` bypass RLS and must enforce tenant/branch scope in their own predicates; the application generally does so, but this is a separate control plane and cannot compensate for the exposed direct-client surface.

## Branch isolation

- Application list/detail queries apply tenant and assigned-branch filters.
- POS status transitions use compare-and-set with tenant, branch, current status, and the trusted POS actor branch.
- Customer identity is tenant-wide by product contract; branch is historical attribution, not customer identity scope. The Core helper deliberately passes `p_branch_id = null` for tenant-wide lookup.
- Catalog/VAT evidence is recomputed server-side for the selected tenant/branch before Core acquisition.
- Core objects bind tenant and branch immutably, but the actor is still the Primary Auth profile.

## Offline consequence

Mode A may use a signed local branch package only after a trusted server issues device/employee generations and allowlists. During a complete outage, remote changes can remain unknown indefinitely by approved product policy. This accepted availability risk does not permit the client to broaden tenant, branch, role, catalog, stock, price, payment, or command authority.

At reconnect/acquisition, the server must compare the immutable command tenant, branch, device generation, employee credential/PIN/permission generations, and catalog/inventory frontiers to current trusted records. Any mismatch is terminal/quarantine or review; it must never fall back to the current Primary Auth user or currently selected employee.

## Conclusion

The online server route chain is scoped and usable. The direct authenticated database surface is contradicted for key business tables. No Offline acceptance or pilot may rely on existing RLS as an isolation boundary until a separate correction removes the permissive bypass, closes raw ACLs/definer reachability, and a new Production catalog capture proves the effective result.
