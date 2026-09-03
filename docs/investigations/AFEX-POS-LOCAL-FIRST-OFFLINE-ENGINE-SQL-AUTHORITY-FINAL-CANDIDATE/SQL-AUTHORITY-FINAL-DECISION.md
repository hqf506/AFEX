# SQL Authority Final Decision

Decision: `FOUNDATION_EXECUTED_AND_ATTESTED_BY_HUMAN`

The review-only candidate now matches the human-attested PostgreSQL 17 production installer identity: database `postgres`, `CURRENT_USER=postgres`, `SESSION_USER=postgres`, `server_version_num=170006`, database owner `postgres`, and database `CREATE/CONNECT=true` for `postgres`.

Every mixed-owner mutation is separated. `01A` creates the exact NOLOGIN Offline identities and private schema, `01B` changes only postgres-owned public relations, and `01C` changes only Core-owner relations. POS actor-session policy/ACL mutation is isolated under `afex_pos_session_owner`; postgres-owned public support policy/ACL mutation is isolated separately. Existing Core/POS objects are never transferred.

Every owner-aware whole-file wave begins as postgres, creates one transaction-bounded membership using `ADMIN=false, INHERIT=false, SET=true GRANTED BY CURRENT_USER`, uses `SET LOCAL ROLE`, resets to postgres, and revokes that exact membership `GRANTED BY CURRENT_USER` before commit. The rejected `GRANT ... SET FALSE` restoration is absent. `00Z` is exact-role emergency membership cleanup only and is excluded from the normal sequence.

The Auth-session helper is the sole postgres-owned privileged Offline routine. It is created in private `afex_offline_authority`, not `auth`; reads only `auth.sessions.id/user_id`; returns boolean; is `STABLE`, `STRICT`, `SECURITY DEFINER`, and fixed to `search_path=pg_catalog`; uses no dynamic SQL; changes no Auth owner, ACL, relation or row; has body MD5 `cc67bd0f9c1828a833b868c48f1f65fb` and 153 UTF-8 body bytes; and is executable only by the exact AFEX owners that need it.

Foundation runtime roles remain NOLOGIN with no browser membership and no direct private-table authority. The separately classified file `90-FINAL-MANUAL-PILOT-ACTIVATION.sql` is not in the Foundation DAG. It defines one private context helper and twelve bounded trusted-server facades, gives `service_role` exact facade EXECUTE only, and restores temporary schema/membership authority before commit. It changes no feature flag and is paired with `90Z-FINAL-EMERGENCY-PILOT-DEACTIVATION.sql`. Both remain `NOT_EXECUTED_REQUIRES_FINAL_HUMAN_APPROVAL`.

Safe shutdown is split honestly: `15` revokes all runtime execution and support ACL/policies while retaining evidence; `15A` refuses nonzero evidence and only then removes empty package objects in reverse owner-aware order with `RESTRICT`. Membership restoration is mandatory in every path and never optional rollback.

All twelve sensitive/transactional flags remain false, the actual POS checkout path imports only the disabled Pilot disposition, Admin/Dashboard imports remain zero, seven deferred commands remain Shadow Mode, and Core V2 remains the sole business authority. This artifact authorizes neither SQL execution nor runtime activation. Final Activation and controlled qualification still require explicit human approval.

Construction safety: SQL/DB/Supabase CLI/Docker/network/Production/business/Git writes executed = 0.
