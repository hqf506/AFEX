# Prompt 10 public CREATE decision

Production effective `CREATE` on schema `public`:

- TRUE: `postgres`, `supabase_admin`, `afex_function_owner`
- FALSE: `PUBLIC`, `anon`, `authenticated`, `service_role`, `authenticator`, all other attested AFEX roles, `supabase_auth_admin`, and `supabase_storage_admin`
- `USAGE` remains broadly reachable.

Classifications:

| Dependency | Decision |
|---|---|
| postgres / migration operator | PROVEN_REQUIRED for historical and future reviewed migrations; continuing external workflow is not fully attested |
| supabase_admin / platform bootstrap | POSSIBLE_EXTERNAL_CALLER; platform operations cannot be excluded |
| afex_function_owner | PROVEN_REQUIRED historically and currently still has CREATE; ongoing need requires migration lifecycle review |
| anon/authenticated/service_role/authenticator | PROVEN_NOT_REQUIRED for repository application DDL and currently have no effective CREATE |
| other AFEX runtime/worker/owner roles | PROVEN_NOT_REQUIRED for current effective CREATE because catalog says false |
| CI/CD, maintenance, extensions, external operator | UNPROVEN or POSSIBLE_EXTERNAL_CALLER |

No revoke is recommended or authorized. Existing repository and Production evidence cannot prove every external workflow unused.

