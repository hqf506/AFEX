# SQL Review Rollback Contract — Scope Integrity Correction

## Non-negotiable rule

Rollback never restores broad authenticated writes, PUBLIC execution, anon business access, role-only policies, legacy invoice mutation, direct service-role base authority or mutable actor attribution. It never deletes immutable evidence.

## Corrected package state

- Files `05`–`10` contain no executable mutations, so they create nothing to roll back.
- File `01` contains candidate statements only for isolated new roles and schemas proven absent before creation. Its historical `public` schema ACL mutation is blocked and absent.
- File `12` remains `MANUAL_ROLLBACK_ONLY`; it is not permission to run.

| Scope | Future safe response after separate approval | Forbidden response |
| --- | --- | --- |
| New role/schema foundation | Stop before dependents; remove only independently verified empty new objects | Alter an existing role, assert unproven NOINHERIT, or broaden historical ACLs |
| Existing ACL/RLS/functions | Disable the affected feature and retain a qualified trusted route | Restore broad grants/policies/functions |
| Device/employee/envelope/Core binding | No current object exists; keep feature disabled until corrected composite authority is approved | Introduce weak single-column keys or trigger/application-only scope validation |
| Review/payment/snapshot/effects | No current object exists; keep writers/workers disabled | Dispatch effects, merge payment methods, or rewrite actor/scope identity |
| Cancellation/refund | Keep route disabled and preserve existing Core evidence | Call legacy restoration or perform Offline provider refund |

Application feature flags, worker shutdown and governed local ciphertext purge are not SQL state and must be proven independently. No rollback action is authorized by this document.
