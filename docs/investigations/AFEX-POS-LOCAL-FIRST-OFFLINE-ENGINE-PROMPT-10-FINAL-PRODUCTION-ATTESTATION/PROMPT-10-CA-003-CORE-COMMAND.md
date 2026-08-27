# CA-003 — Core command authority

**Final classification:** `BLOCKED_CORE_V2_CHANGE_REQUIRED`.

Production proves a mature current Core ledger: authorization contexts, immutable payloads, commands, claims, retry authorizations, business links, line links, audit and diagnostics. `atomic_order_commands` has the unique scope `(tenant_id,branch_id,command_type,idempotency_key_hash)`, state checks, lease/retry bounds, stable response snapshot/version columns, and tenant/branch indexes. Core relations are owned by `afex_core_owner`, forced RLS is enabled, and writer authority is narrowed through `afex_function_owner`/Core roles.

The authorization context can record `employee_source` and optional `employee_source_id`, but the command has no immutable actual employee column, no device identity, and none of the approved authority-generation fields. The live `orders.created_by_employee_id` field is nullable and is a business-row patch point, not atomic command authority. Receipt replay is structurally stable for the current command version, but evolving its request/response identity requires a versioned Core contract.

Function identities/body MD5s were attested without execution by allowlisted correction query `P10-Q007R`; all 36 identities and authority properties matched the historical evidence, with language names replaced by `pg_proc.language_oid`. `pg_depend` exposed only catalog namespace/language edges for PL/pgSQL; static body dependency review remains required.
