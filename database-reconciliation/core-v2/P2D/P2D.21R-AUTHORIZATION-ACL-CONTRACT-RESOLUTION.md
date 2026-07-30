# P2D.21R Authorization ACL Contract Resolution

Status: STATIC REVIEW COMPLETE — ADDITIONAL READ-ONLY EVIDENCE REQUIRED

Marker: `P2D21R_900_AUTHORIZATION_ACL_CONTRACT_RESOLUTION_COMPLETE`

## Executive verdict

The fourteen direct `authenticated` column ACLs on `public.profiles` are
intentional application privileges, not unexplained P2D.20 residue. All
fourteen are explicitly installed by the reviewed POS credential-hardening
migration and are covered by its exact post-install review queries.

All fourteen are classified **KEEP**. Current authenticated-session paths read
every SELECT column and the account self-service path updates every UPDATE
column. Revoking them without first changing those paths would risk login,
authorization, account, administrative-shell, and POS regressions.

P2D.21D is nevertheless not safe to relax immediately. Repository snapshots
record broad table-level privileges on `profiles`, `tenants`, and `branches`,
and P2D.21Q reported broad effective privileges. P2D.21Q did not attribute
those effective privileges to exact direct table ACLs, role inheritance, or
another source. RLS constrains rows but does not narrow columns or remove
object privileges.

Outcome:

**D. ADDITIONAL_READ_ONLY_PRODUCTION_EVIDENCE_REQUIRED**

## Repository evidence reviewed

### Origin and reviewed intent

- `supabase/migrations/20260713090000_secure_pos_pin_credentials.sql:33-62`
  documents browser self-service and replaces broad `profiles` permissions
  with four UPDATE columns and ten SELECT columns.
- `supabase/manual-review/20260713090000_secure_pos_pin_credentials_review.sql:177-207`
  defines the exact authenticated SELECT allowlist.
- `supabase/manual-review/20260713090000_secure_pos_pin_credentials_review.sql:231-251`
  defines the exact authenticated UPDATE allowlist.
- Git history: commits `7e2e2e9` and `2de5ffe`; blame attributes the final
  explicit ACL contract at migration lines 33-75 to `2de5ffe`.

### Production-derived repository snapshots

- `database-reconciliation/baseline/production-baseline.sql:7395-7500`
  records both broad table ACL statements and the fourteen direct column ACLs.
- `database-reconciliation/evidence/R6/production-public-schema-raw.sql`
  independently records the same table and column ACL material.
- `database-reconciliation/baseline/production-baseline.sql:7687-7742`
  records broad default privileges relevant to future objects.

### P2D contract implementations

- `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql:478-500` installs the eleven
  Core V2 `afex_function_owner` SELECT ACLs.
- `P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql:3295-3364` verifies only
  `afex_function_owner` column ACL rows.
- `P2D.20-POST-INSTALL-ATTESTATION.sql:653-722` repeats that filtered
  verification.
- `P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql:343-363` rejects every
  direct ACL row whose grantee is not `afex_function_owner`.
- `evidence/P2D.21Q-20260730T203634885Z/P2D.21Q.stdout.txt` proves the
  eleven Core V2 rows and fourteen authenticated rows coexist.

### Current runtime dependencies

- `lib/auth.ts:73-77` reads `full_name`, `role`, `is_active`, `branch_id`,
  `tenant_id`, and `tenant_name` through the browser Supabase client.
- `lib/auth.ts:94-100` searches `tenant_name` through the same client.
- `app/page.tsx:268-282` reads `role` through the browser client before
  protected navigation.
- `lib/authorization-context.ts:154-180` creates an authenticated server
  client and reads the profile authorization projection.
- `lib/authorization-context.ts:256-265` reads employee profile identity,
  role, branch, tenant, and activity state.
- `app/admin/layout.tsx:36-51` reads `role` and `is_active` through the
  authenticated server client.
- `app/admin/page.tsx:6-19` reads `role` through the authenticated server
  client.
- `app/api/account/route.ts:140-151` reads the self-service profile projection
  through `auth.supabase`.
- `app/api/account/route.ts:267-329` reads duplicate-email identity and
  updates `full_name`, `phone`, `contact_email`, and `updated_at`.
- `app/account/page.tsx:70-193` consumes the account API for profile display
  and updates.
- Service-role paths such as `app/api/auth/login/route.ts:44-104` and
  administrative mutation routes do not replace the authenticated paths
  listed above.

## Origin trace and per-column decision

Every row below originates at
`supabase/migrations/20260713090000_secure_pos_pin_credentials.sql:39-62`,
was committed in `2de5ffe`, and is asserted by the companion manual review.

| Table | Column | Privilege | Decision | Runtime proof |
|---|---|---:|---|---|
| `profiles` | `branch_id` | SELECT | KEEP | `lib/auth.ts:73-77`; `lib/authorization-context.ts:176-180`; `app/api/account/route.ts:147-151` |
| `profiles` | `contact_email` | SELECT | KEEP | `app/api/account/route.ts:147-151,324-329`; account response at `197-198` |
| `profiles` | `contact_email` | UPDATE | KEEP | `app/api/account/route.ts:267-283,324-329` |
| `profiles` | `full_name` | SELECT | KEEP | `lib/auth.ts:73-77`; `app/api/account/route.ts:147-151` |
| `profiles` | `full_name` | UPDATE | KEEP | `app/api/account/route.ts:267-279,324-329` |
| `profiles` | `id` | SELECT | KEEP | `app/api/account/route.ts:147-151,285-301`; authorization identity binding |
| `profiles` | `is_active` | SELECT | KEEP | `lib/auth.ts:73-77`; `app/admin/layout.tsx:46-51`; `lib/authorization-context.ts:176-180` |
| `profiles` | `phone` | SELECT | KEEP | `app/api/account/route.ts:147-151,324-329` |
| `profiles` | `phone` | UPDATE | KEEP | `app/api/account/route.ts:267-275,324-329` |
| `profiles` | `role` | SELECT | KEEP | `app/page.tsx:277-282`; `app/admin/page.tsx:15-19`; `lib/auth.ts:73-77` |
| `profiles` | `tenant_id` | SELECT | KEEP | `lib/auth.ts:73-77`; `lib/authorization-context.ts:176-180`; account scoping |
| `profiles` | `tenant_name` | SELECT | KEEP | `lib/auth.ts:73-106`; `components/auth-state-provider.tsx:109-127` |
| `profiles` | `updated_at` | UPDATE | KEEP | `app/api/account/route.ts:267-275,324-329` |
| `profiles` | `username` | SELECT | KEEP | `app/api/account/route.ts:147-151,324-329`; account identity response |

No REVOKE decision is justified by repository evidence. No row can be moved
behind an RPC without an application refactor because several consumers use
the browser or authenticated server Supabase client directly.

## Runtime dependency trace

### Authentication and session hydration

`lib/auth.ts` uses the browser client and therefore executes as the Supabase
authenticated database role. It reads the profile identity, authorization
scope, display name, and tenant label. Landing and admin navigation perform
additional authenticated role/activity reads.

### Authorization and POS

`lib/authorization-context.ts` derives actor, tenant, branch, role, activity,
and employee identity using a cookie-bound authenticated server client. POS
and protected server routes depend on that authorization context.

### Account self-service

`app/api/account/route.ts` normally uses the authenticated client returned by
`requireApiAuth`. It reads the current profile, checks contact-email
uniqueness, and updates only `full_name`, `phone`, `contact_email`, and
`updated_at`. The service-role fallback is not proof that the normal
authenticated path can be removed.

## Table-level versus column-level privilege analysis

The intended July hardening contract removes broad browser table privileges
before installing narrow column ACLs. The fourteen rows are therefore
security-significant, not merely decorative.

Repository snapshots at
`database-reconciliation/baseline/production-baseline.sql:7395-7401` also
serialize `GRANT ALL ON TABLE public.profiles` for `anon`, `authenticated`,
and `service_role`. P2D.21Q effective output reports privileges beyond the
fourteen direct column rows across the three authorization-evidence tables.

That evidence means at least one of the following remains possible:

1. broad direct table ACLs still exist;
2. inherited role privileges produce the effective access;
3. the snapshot and current state differ;
4. another grant path not captured by the column-only diagnostic applies.

The fourteen direct rows are redundant wherever a broader effective table
privilege exists, but they remain the intended least-privilege target after
the broader source is resolved.

## RLS interaction analysis

The baseline records RLS enabled on `public.profiles` at
`production-baseline.sql:6453`. Policies include:

- same-tenant/admin SELECT at `6460-6476`;
- self SELECT at `6468` and `6484`;
- self UPDATE at `6492-6500`.

RLS and ACLs are conjunctive:

- ACLs decide whether a SQL operation and column projection is permitted.
- RLS decides which rows a permitted operation may affect or return.

RLS does not make broad SELECT or UPDATE column privileges equivalent to the
reviewed narrow projection. It also does not resolve privileges on `tenants`
or `branches`. FORCE RLS is not shown for `profiles` in the baseline.

## Other-role impact

- P2D.21Q reports no direct authorization-column ACL rows for `PUBLIC`,
  `anon`, `service_role`, or Core V2 roles other than the eleven intended
  `afex_function_owner` rows.
- Its effective-privilege matrix reports broader effective access for browser
  and service roles. Because it did not enumerate direct table ACL grantors or
  role-membership provenance, those results cannot safely be normalized away.
- Core V2 runtime, issuer, and worker roles must retain no direct access to
  these evidence tables.

## Security impact

Keeping the fourteen rows preserves the reviewed application projection and
self-service update surface. Removing them now can break legitimate paths.

Changing P2D.21D to accept the fourteen rows without resolving broader
effective privileges could falsely certify a state wider than the intended
least-privilege contract. That is the controlling security blocker.

## Compatibility impact

- KEEP: no application behavior change.
- Premature REVOKE: login, navigation, authorization-context, account display,
  account update, or POS regression.
- Immediate verifier-only correction: operationally simple but could conceal
  broad legacy table privileges.
- Later exact-set verifier correction: safe only after direct table ACL,
  membership, RLS, and effective privilege provenance is established.

## Final canonical direct-column contract

The machine-readable companion artifact freezes exactly:

- eleven non-grantable `SELECT` rows for `afex_function_owner`;
- ten non-grantable `SELECT` rows for `authenticated`;
- four non-grantable `UPDATE` rows for `authenticated`;
- no other direct column ACL row on `profiles`, `tenants`, or `branches`.

Grantor is recorded as `postgres` for the installed evidence but is not an
authorization property unless a later governance decision freezes grantor
identity. Future drift checks must compare the full tuple, including contract
classification, and separately verify table ACLs and effective privileges.

## Exact recommendation

**Blocked pending additional Production evidence.**

Create a read-only P2D.21S diagnostic that reports:

1. exact direct table ACLs, including grantor and grantee OIDs;
2. exact role memberships and membership options affecting `anon`,
   `authenticated`, `service_role`, and the Core roles;
3. effective table privileges by source where catalog evidence permits;
4. RLS/FORCE RLS flags and exact policy inventory for all three tables;
5. default privileges that could recreate broad access;
6. set differences against the intended narrow table-plus-column contract.

Only after that evidence may a separately reviewed phase choose between a
verifier-only correction and a forward privilege migration.

P2D21R_900_AUTHORIZATION_ACL_CONTRACT_RESOLUTION_COMPLETE
