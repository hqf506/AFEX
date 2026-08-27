# Customer compatibility

## Phone lookup

`components/invoice-customer-step.tsx` calls `GET /api/customers`. The route derives tenant identity from `requireApiAuth`, applies branch policy, normalizes supported phone input, and uses the narrow `lookup_customer_phone_identity_v1` path where appropriate. The browser does not call the identity RPC directly.

The migration `supabase/migrations/20260813130000_customer_phone_identity_registry.sql` defines the normalized identity under the composite key `(tenant_id, normalized_phone)`. Lookup returns a bounded customer identity result and respects tenant/branch input. This is static migration evidence; current Production signature/ACL is inherited historical evidence only.

## Creation

`components/pos-add-customer-modal.tsx` posts to `app/api/customers/route.ts`. The route:

- derives tenant and allowed branch server-side;
- rejects or forces branch input according to authority;
- normalizes empty optional fields;
- detects duplicate normalized phone;
- invokes `create_customer_with_phone_identity_v1` from the server;
- hydrates the created customer before returning success;
- maps validation, authorization, conflict, phone conflict, and persistence failures to bounded status codes and safe Arabic messages;
- does not log the submitted phone or payload;
- does not create an order when creation fails.

The UI prevents repeated saves and selects the new customer only after a valid success response.

## Update

The customer update path in `app/admin/customers/page.tsx` is an inline Server Action. It uses the cookie-bound server client, validates the organization user and tenant/role, applies tenant scope and optional record-version compare-and-set, then redirects with bounded result flags. It is not a broad direct browser write. Its authorization still depends on current grants/RLS and must be regression-tested before privilege correction.

`app/api/customers/[customerId]/route.ts` is read-only GET; it returns tenant-scoped customer and activity information.

## Selection and draft persistence

The POS customer step caches bounded lookup/profile responses, uses `AbortController` and request identities to suppress stale search results, and persists only a small selected-customer reference in the sale draft. Selection is retained when navigating to items. The draft customer reference is not itself a database authority; order submission must revalidate customer identity against trusted tenant/branch authority.

## Duplicate and normalized-phone authority

Duplicate ownership is the identity registry's composite tenant/normalized-phone key plus the guarded creation function. UI pre-checks are convenience only. The database-authoritative duplicate outcome must remain a 409-compatible conflict at the route.

## Offline operations

| Operation | Current authority | Offline disposition |
| --- | --- | --- |
| Read previously synchronized customer snapshot | Phase 2/3 local snapshot design only | bounded read may be designed; not database authority |
| Lookup unsynchronized phone identity | online trusted route/RPC | blocked offline |
| Create customer | trusted server route and database identity RPC | blocked offline pending proposal/reconciliation authority |
| Update customer | trusted Server Action with tenant/version guard | blocked offline pending review/CAS identity |
| Bind customer to command | Core validates selected customer | requires immutable Core/offline proposal binding |
| Resolve duplicate after reconnect | database identity registry | future reconciliation required |

No broad offline customer write is authorized. No customer was created or updated by Prompt 9.

## Compatibility verdict

Lookup and creation routing are substantially compatible with the approved trust boundary. SQL must preserve the narrow authenticated lookup function, keep creation server-only at the application layer, and preserve duplicate/response semantics. Customer update, Offline proposals, and Core command binding remain blocked pending trusted contracts.


