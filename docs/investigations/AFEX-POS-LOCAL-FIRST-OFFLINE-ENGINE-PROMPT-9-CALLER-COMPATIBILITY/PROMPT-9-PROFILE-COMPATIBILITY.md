# Profile compatibility

## Required target

The approved presentation boundary is one trusted Next.js server route. Its JSON object must contain exactly these seven keys and no database-only fields:

1. `username`
2. `full_name`
3. `contact_email`
4. `phone`
5. `tenant_name`
6. `branch_name`
7. `ui_capabilities`

Tenant, branch, role, and capability authority must be derived server-side. RLS is row filtering, not a column-hiding mechanism, and therefore cannot substitute for an exact serializer.

## Current path

`components/auth-state-provider.tsx` calls `lib/auth.ts`. That shared client code constructs a browser Supabase client through `lib/supabase/client.ts` and directly reads:

- `profiles` at `lib/auth.ts:73`: `full_name, role, is_active, branch_id, tenant_id, tenant_name`.
- `profiles` again at `lib/auth.ts:95` for a tenant-name fallback.
- `tenants` at `lib/auth.ts:111` with a broad select.

`lib/auth.ts` exposes internal authorization data in `CurrentUserProfile`: identity, email, role, active state, tenant ID/name, branch ID, and scope type. This is incompatible with the seven-field presentation target.

Other browser/profile callers recorded in the caller inventory include `app/page.tsx`, `app/admin/receipts/page.tsx`, and their related `pos_profiles`/branch lookups. The full path set is machine-readable in `PROMPT-9-CALLER-INVENTORY.json`.

## Existing server facilities

`lib/authorization-context.ts` is server-only and already selects trusted authorization inputs from `profiles`, derives branch access and capability decisions, and fails closed for invalid organization/POS authority. It is a viable authority source, not the final presentation serializer.

`app/api/account/route.ts` is not the approved replacement:

- GET returns an `account` wrapper.
- It includes `id`.
- It lacks `ui_capabilities`.
- The same route also supports account mutation, increasing the contract surface.

No repository route currently implements the exact seven-key object.

## Migration impact

| Caller class | Current dependency | Required migration | Break if removed first |
| --- | --- | --- | --- |
| Auth state provider | role, tenant/branch IDs, active/scope fields | split presentation data from server-side authorization; consume seven fields only for display | all pages using `useAuthState` lose access decisions/context |
| `hooks/use-page-access.ts` | role, branch ID, tenant ID, scope type | move access decision to server-derived `ui_capabilities` or a separate trusted authorization contract | page access may deny or over-admit |
| POS shell/login/PIN | role, branch, tenant, employee context | preserve POS actor/session authority separately; use presentation route only for labels | POS navigation and PIN qualification break |
| Admin inventory/reports/receipts | tenant/branch IDs and role | move database queries to trusted routes and use capability tokens for UI | browser cannot safely reproduce tenant scope |
| Account/settings UI | account route object including ID | keep account mutation/read contract separate from profile presentation | form binding breaks if silently swapped |

The exact seven-field response must **not** be expanded to carry internal IDs merely to avoid migration work. Callers that need internal scope must receive trusted server authorization or move their data access behind trusted routes.

## Compatibility verdict

- Direct browser `profiles`/profile-view reads prohibited by target: **confirmed present**.
- Exact trusted seven-field route: **absent**.
- Current response parity: **not compatible**.
- Required work class: `BLOCKED_REPOSITORY_GAP`.
- SQL may not remove current profile reachability until the trusted replacement is implemented, deployed, negatively tested, and every direct caller is migrated.


