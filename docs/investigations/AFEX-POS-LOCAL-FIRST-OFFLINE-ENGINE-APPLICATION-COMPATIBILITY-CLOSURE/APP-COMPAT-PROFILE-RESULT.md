# Profile presentation result

## Implemented contract

`GET /api/account/profile-presentation` returns an object with exactly:

1. `username`
2. `full_name`
3. `contact_email`
4. `phone`
5. `tenant_name`
6. `branch_name`
7. `ui_capabilities`

It never emits `id`, `tenant_id`, `branch_id`, raw role, scope type, or database-only fields. The frozen capability vocabulary reuses the existing authorization capabilities: `admin:full`, `orders:read`, `orders:write`, `pos:access`, `reports:read`, and `support:access`.

The route rejects every query parameter, maps unauthorized/inactive states to bounded Arabic-safe errors, uses the cookie-backed server client only, performs no service-role access, logs no profile value, and sends `Cache-Control: private, no-store, max-age=0` plus `Vary: Cookie`.

## Shared caller path

`ProfilePresentationProvider` performs one request per immutable presentation authority scope when the migration flag is enabled. The scope binds primary profile, tenant, primary branch, active POS employee, POS employee branch, and an in-memory POS session generation. It deduplicates concurrent same-scope requests, aborts and clears the old scope before loading a replacement, rejects stale completions, stores presentation data only in module memory, and clears memory on logout, unauthenticated transition, account/tenant/branch change, and the trusted POS actor lifecycle event. It never uses `localStorage` or IndexedDB for presentation caching and does not poll POS state.

The internal scope IDs never enter the seven-field response or provider value. The existing POS session storage remains the authority source for the active employee only; it is not a presentation cache.

Presentation-only name rendering was prepared in:

- `app/page.tsx`
- `components/admin-shell-layout.tsx`

Both retain the existing internal auth fallback because `profileCallerMigration` defaults to false. Role, tenant, branch, PIN, POS actor, and page-access decisions remain on the pre-existing authority path.

## Remaining callers

Direct browser profile access remains intentionally available for authority-dependent consumers, including `components/auth-state-provider.tsx`, `hooks/use-page-access.ts`, `app/pos/login/page.tsx`, POS PIN/session flows, and admin report/receipt/inventory consumers requiring internal tenant/branch/role context. They cannot safely migrate to a presentation response. No grant or old path was removed.
