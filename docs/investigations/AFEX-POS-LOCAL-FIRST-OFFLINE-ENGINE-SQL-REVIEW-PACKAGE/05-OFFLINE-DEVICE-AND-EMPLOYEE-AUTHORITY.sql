/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: 4-blocked
purpose: Record the exact composite authority prerequisites for device and employee authority without emitting unsafe DDL.
execution status: NOT AUTHORIZED
prerequisites: Proven branch/tenant composite authority; proven immutable employee-authority composite identity; trusted lifecycle resolver.
expected owner/operator: No operator; this file contains no executable statement.
transaction behavior: None; all blocks are evidence requirements.
lock risk: None while blocked.
retry behavior: Produce a new reviewed draft only after every composite target identity is frozen.
rollback reference: No mutation exists to roll back.
required evidence before execution: Exact relation names, column order/types, unique constraints, owners, lifecycle semantics and hostile mismatch tests.
*/

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / device tenant-branch authority
-- offline_devices cannot be created with independent tenant_id and branch_id
-- foreign keys. A future draft requires one proven composite foreign-key target
-- binding (branch_id, tenant_id), including exact target relation, column order,
-- data types, validated uniqueness, owner, delete/update behavior and branch
-- lifecycle. The approved evidence does not freeze that identity.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / dependent device relations
-- offline_device_events and every device-scoped relation depend on the blocked
-- device identity. No device event, one-active-device index or lifecycle trigger
-- is emitted until tenant A plus branch B is database-rejected by the parent key.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / employee-authority composite identity
-- A future offline_employee_authorities relation must expose one immutable,
-- validated unique identity covering at minimum id, device_id, employee_id,
-- primary_auth_subject_id, tenant_id, branch_id and the credential, PIN,
-- permission, revocation, package, key-envelope, namespace and device authority
-- generations used by dependent rows. Exact column order, data types and
-- lifecycle semantics are not frozen. A reference to employee_authority_id alone
-- is explicitly insufficient.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / roster and lifecycle routines
-- The one-device identity, serialized 25-package cap, append-only event guard,
-- enrollment, activation, replacement, loss, removal and generation-revalidation
-- routines depend on the two composite identities above and a trusted operator
-- resolver. They are not emitted as trigger-only or application-only workarounds.
-- Mode remains MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE with no time-based expiry;
-- synchronization age remains informational and never grants or revokes authority.
