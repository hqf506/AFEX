# SQL Authority Executive Summary

Outcome: `FOUNDATION_EXECUTED_AND_ATTESTED_BY_HUMAN`; final Pilot Activation remains `NOT_EXECUTED_REQUIRES_FINAL_HUMAN_APPROVAL`.

The corrected package freezes `order.create` only. A verified Online establishment login must first establish account, tenant, branch, POS actor, and managed-device authority. The employee PIN is then only a structured local selector for a pre-enrolled employee; it cannot log into Supabase, create scope, establish device authority, or derive/wrap/unwrap the business-data DEK. Device-bound encryption remains independent.

Restart without explicit logout preserves the account-bound Offline bootstrap but requires PIN re-entry. Explicit logout disables Offline PIN, employee switching, reads, and order creation; pending commands remain encrypted, inaccessible, and bound to the original scope until the same establishment account authenticates Online. Cross-account, cross-tenant, and cross-branch recovery fail closed.

The human owner reports the Production Foundation complete and attested at 22/22 whole-file waves. Every owner-specific mutation starts from `postgres`, creates an exact transaction-bounded membership with `ADMIN=false, INHERIT=false, SET=true GRANTED BY CURRENT_USER`, uses `SET LOCAL ROLE`, resets the role, and revokes that membership `GRANTED BY CURRENT_USER` before commit. Existing Core and POS owners are preserved. The private Auth-session helper is the sole bounded postgres-owned Offline function and does not mutate the `auth` schema or grant access to `auth.sessions`.

Composite keys prevent account/tenant/branch/device-generation/enrollment/key/snapshot/Core drift. Payment accepts exactly eight distinct approved methods with no provider-success claim or sensitive card data. Inventory compares the exact unique ordered catalog set, requested quantities, snapshot/frontier, and durable pending/syncing commitments. Receipt access performs fresh authority resolution before any binding or receipt lookup.

Four acquisition contracts and 15 provisioning contracts are exposed to two separate NOLOGIN roles. Internal validators and trigger helpers remain private. Browser and service roles receive zero direct private-function or table authority in the Foundation. The final, unexecuted Activation defines one private context helper and twelve service-role-only bounded facades and is excluded from the Foundation DAG. Every forward statement has an explicit retain/revoke/drop/conditional-cleanup disposition.

This reconciliation does not authorize Activation or deployment. No PostgreSQL-compatible parser was already installed, so no parser PASS is claimed and no dependency was installed. Construction-time SQL/DB/network/Production execution is zero.
