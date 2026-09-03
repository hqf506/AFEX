# Production Connection and Identity

## Target proof

- Safe project reference: `fsxmnwucgotwhtlxuknt`
- Project: `AFEX`
- Region: `ap-south-1`
- Health: `ACTIVE_HEALTHY`
- PostgreSQL: `17.6` (`17.6.1.141` platform build)
- Database: `postgres`
- Access path: Supabase Management API mediated catalog query execution; not a browser Data API call and not a direct connection string.

The target was triangulated from the authenticated Supabase project inventory, the project detail response, and repository/Vercel application metadata. No endpoint, token, password, key, cookie, or JWT was copied into evidence.

## Session identity

- `current_user`: `postgres`
- `session_user`: `postgres`
- `current_role`: `postgres`
- Transaction mode during every successful catalog query: read only
- Server default read-only mode: off
- Search path: `"$user", public, extensions`

The principal can connect, create databases, create roles, replicate, and bypass RLS, but is not a superuser. That capability was established from role metadata only; it was never exercised. Because the credential is write-capable, the per-query explicit read-only transaction was the mandatory fail-closed boundary.

## Relevant roles

| Role | Login | Inherit | Elevated property | Intended observed use |
| --- | --- | --- | --- | --- |
| `anon` | no | yes | none | public API role |
| `authenticated` | no | yes | none | signed-in API role |
| `authenticator` | yes | no | role switch gateway | PostgREST gateway |
| `service_role` | no | yes | bypass RLS | trusted server client |
| `postgres` | yes | yes | create role/database, replication, bypass RLS | attestation principal |
| `afex_core_owner` | no | no | none | Core tables owner |
| `afex_function_owner` | no | no | none | Core/customer function owner |
| `afex_pos_session_owner` | no | no | none | POS authority schema owner |
| `afex_pos_session_maintenance` | no | no | none | session cleanup only |
| `afex_core_runtime` | no | no | none | internal Core acquisition |
| `afex_reconciliation_authority` | no | no | none | bounded reconciliation functions |
| `supabase_admin` | no | yes | superuser | platform bootstrap/admin |
| `supabase_auth_admin` | yes | yes | create role | Auth schema owner/runtime |

## Default privilege finding

Public-schema default privileges established broad table/sequence access for `anon`, `authenticated`, and `service_role` on objects created by historical owners. Auth-schema defaults remained restricted. This broad baseline makes RLS and function execute ACL correctness security-critical; table ACL alone is not an isolation boundary.
