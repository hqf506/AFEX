# CA-002 — Employee/device authority

**Final classification:** `BLOCKED_SQL_DESIGN_REQUIRED` and `BLOCKED_CORE_V2_CHANGE_REQUIRED`.

Production has a safe Online actor chain:

- Primary subject: `auth.users` referenced indirectly by `public.profiles.id`.
- POS employee: `public.pos_profiles(id,tenant_id,branch_id,role,is_active,pos_pin_hash)`.
- Online session: `afex_pos_authority.actor_sessions` binds authenticated subject/session, tenant, branch, actor, role, actor version, credential fingerprint and positive session version.
- Issuance/validation/revocation/cleanup functions exist with narrowed owner grants and fixed `pg_catalog` search paths.

Production does **not** expose an Offline device authority, device identifier, device authority generation, credential/PIN/permission/revocation/package/key-envelope/namespace generations, or an immutable single authority row joining those values. PIN hashes and session tokens were not read.

Consequences:

- Current Online session authority cannot be reused as persistent Offline unwrap authority.
- One managed device per branch and 25 pre-enrolled employees remain design constraints, not database facts.
- Offline employee switching remains disabled until bounded device enrollment, immutable employee authority, generations, revocation lifecycle, envelope metadata, and Core receipt binding are independently reviewed and implemented.

