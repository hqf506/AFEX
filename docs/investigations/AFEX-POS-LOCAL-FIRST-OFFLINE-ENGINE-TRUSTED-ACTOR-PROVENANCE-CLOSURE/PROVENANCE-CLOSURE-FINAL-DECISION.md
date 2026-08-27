# Trusted Actor Provenance Closure — Final Decision

## Decision

`TRUSTED_ACCOUNT_BOOTSTRAP_AND_EMPLOYEE_SELECTION_PROVENANCE_READY_FOR_INDEPENDENT_REVIEW`

This is review-only. It authorizes no SQL, runtime activation, replay, dispatch, deployment, or Production contact.

Authority is a three-layer conjunction: (1) the trusted server verifies the JWT and resolves the current POS actor session, (2) the database revalidates the current Auth-session reference, active profile and POS actor-session scope, and (3) the database resolves the active verified-account bootstrap plus immutable Offline device, device generation, employee enrollment, command generation, PIN-independent key envelope, tenant, branch, inventory, Core context, and Core command facts. Database row lookup is not JWT verification. Browser JSON, caller-supplied UUIDs, `auth.uid()` alone, employee PIN, or service-role transport cannot substitute for any layer.

The immutable origin account may outlive its original web session if there was no explicit logout, but every upload, resolver result, inventory read, and receipt lookup requires a fresh authorized uploader and active same-account bootstrap. Restart requires PIN re-entry to select the employee but not Internet. Explicit logout disables Offline access and makes retained commands encrypted and inaccessible until same-account Online recovery; cross-account/tenant/branch recovery is rejected. Device, bootstrap, enrollment, key, namespace, permission, command, or session drift fails closed.

The total resolver emits one typed output per server ordinal for at most 1,000 claims, including malformed and unavailable claims, without exposing keys or credentials. The acquisition path validates exact payment, inventory, payload, fingerprint, idempotency, and Offline/Core semantic equality before invoking existing Core V2 in the same transaction.

The four public acquisition contracts and 15 trusted provisioning contracts use distinct exact NOLOGIN roles. Private helpers remain internal; PUBLIC, anon, authenticated, service_role, and the opposite runtime role receive no cross-surface privilege. Whole-file wave order and exact disablement dispositions are recorded in the corrected SQL package.

Focused tests and Offline static gates pass. PostgreSQL-compatible parsing is unavailable and no PostgreSQL parser PASS is claimed. SQL/DB/Supabase/Production/Preview/Docker/network/provider/business executions: 0. Git stage/commit/push/merge/deployment: 0.
