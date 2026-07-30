# P2D.21R Forward Decision

## Outcome

**D. ADDITIONAL_READ_ONLY_PRODUCTION_EVIDENCE_REQUIRED**

## Basis

The fourteen `authenticated` column ACL rows are intentional and required:

- their exact origin is the reviewed migration
  `supabase/migrations/20260713090000_secure_pos_pin_credentials.sql:33-62`;
- their exact allowlists are frozen by the companion review at
  `supabase/manual-review/20260713090000_secure_pos_pin_credentials_review.sql:177-251`;
- active authenticated-session code still consumes every SELECT or UPDATE
  capability.

P2D.21D is inconsistent because it rejects these intentional rows. A
verifier-only correction is still premature because repository snapshots and
P2D.21Q effective results indicate broader table-level privileges. The
column-only diagnostic cannot prove their direct ACL source, grantor,
inheritance path, or interaction with the complete RLS inventory.

## Minimum next read-only diagnostic

The next artifact must inspect only `public.profiles`, `public.tenants`, and
`public.branches` and report:

1. every direct table ACL with owner, grantor, grantee, privilege, and
   grantability;
2. every direct column ACL as a cross-check;
3. role memberships and PostgreSQL 17 membership options for every relevant
   browser, service, and Core role;
4. effective table and column privileges for `PUBLIC`, `anon`,
   `authenticated`, `service_role`, and all Core roles;
5. RLS and FORCE RLS flags;
6. exact policy names, roles, commands, permissiveness, USING, and WITH CHECK;
7. applicable default privileges;
8. deterministic differences against the intended narrow contract.

The diagnostic must be read-only, fail closed, and end in `ROLLBACK`.

## Deferred decision

After that evidence:

- choose **A** only if broad effective access is explained and consistent with
  the reviewed legacy contract, then make P2D.21D compare the exact canonical
  25-row direct-column set;
- choose **B** if unexpected direct table grants or inheritance must be
  removed through an externally reviewed forward migration;
- choose **C** if removing broad access requires authenticated application
  paths to move behind server/RPC boundaries.

No executable forward SQL is authorized by P2D.21R.

P2D21R_900_AUTHORIZATION_ACL_CONTRACT_RESOLUTION_COMPLETE
