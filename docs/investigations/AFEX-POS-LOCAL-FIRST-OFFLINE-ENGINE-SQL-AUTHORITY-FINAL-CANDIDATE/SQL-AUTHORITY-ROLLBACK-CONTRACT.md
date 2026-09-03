# Owner-Aware Disablement and Rollback Contract

`15-SAFE-DISABLEMENT-AND-ROLLBACK.sql` is the primary emergency shutdown. It starts as postgres, temporarily enters only the exact function/offline/POS owners, revokes acquisition and provisioning EXECUTE, removes bounded POS/public policies and column grants, revokes helper EXECUTE, revokes every transaction-bounded installer membership `GRANTED BY CURRENT_USER`, and retains all evidence rows and objects.

`15A-EMPTY-OBJECT-OWNER-AWARE-CLEANUP.sql` is separate and optional. It aborts unless the exact 11 data-bearing relations contain zero total rows. It then removes exact functions, relations, triggers, schema and the four split composite constraints in reverse owner-aware order with `RESTRICT`; it never uses `CASCADE`. The Auth helper exact DROP identity is `afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)` and executes as its owner `postgres` only after all dependants are gone.

`90Z-FINAL-EMERGENCY-PILOT-DEACTIVATION.sql` revokes `service_role` from the twelve exact Pilot facades if `90-FINAL-MANUAL-PILOT-ACTIVATION.sql` is later approved and executed. Neither file is part of Foundation installation. Facade objects may remain inert after emergency revoke; cleanup or redesign requires another explicit review.

`00Z-RESTORE-INSTALLER-MEMBERSHIP-OPTIONS.sql` is operational membership cleanup, not object rollback. It revokes only the five exact postgres→AFEX owner membership rows `GRANTED BY CURRENT_USER`, refuses unsafe role identities, and changes no object, ACL, policy, row or feature.

Split-wave mapping:

- `01A`: roles retained; private schema removed only by zero-row `15A`.
- `01B`: postgres-owned public constraints and exact REFERENCES grants are reversed only after dependent Offline objects are gone.
- `01C`: Core constraints/grants are reversed under bounded `afex_core_owner`; existing Core ownership is unchanged.
- `04A`: helper EXECUTE revoked by `15`; exact helper dropped by `15A`; Auth schema/ACL/data remain unchanged.
- `04B`: POS policies/grants removed under bounded `afex_pos_session_owner`; actor_sessions ownership remains unchanged.
- `04C`: postgres-owned public support policies/grants removed as postgres.
- Owner-aware new objects: runtime reachability removed by `15`; retained if evidence exists; empty-only object removal by `15A`.
- Temporary membership changes: restored inside every source transaction before COMMIT and independently recoverable by `00Z` only.

No committed business truth is described as reversible. No execution is authorized by this contract.
