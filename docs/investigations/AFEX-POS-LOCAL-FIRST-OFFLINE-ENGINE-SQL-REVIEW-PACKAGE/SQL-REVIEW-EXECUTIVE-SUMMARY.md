# SQL Review Executive Summary — Scope Integrity Correction

## Result

The 26-file Prompt 8 package remains a review artifact and is not an executable migration. Human-review findings exposed unproven composite authority links in the prior relation drafts. Those relation, trigger and index statements have been removed rather than weakened to single-column keys or application/trigger-only validation.

Only file `01` contains candidate mutation statements, and those statements are limited to isolated new roles, new private schemas and ACLs on schemas proven absent immediately before creation. Its historical `public` schema ACL mutation is now a non-executable blocked block. Files `05`–`10` contain no executable statements. Files `00` and `11` are read-only designs; file `12` is manual rollback only. No file is execution-ready or authorized.

## Preserved authority outcomes

- Core V2 remains the sole future order/invoice mutation engine.
- Direct authenticated business-table writes remain zero.
- Mode remains `MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE` with `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY`.
- Connectivity remains `OPPORTUNISTIC_NOT_MANDATORY`; last synchronization age is informational and never blocks operation.
- Profile and inventory browser restrictions remain unchanged.
- The eight payment methods remain distinct: `mada`, `cash`, `visa`, `cod`, `card`, `bank_transfer`, `transfer`, `on_delivery`.
- External-effect semantic identity remains `serverCommandId + effectType + effectVersion`, but no effect relation or replay-safety claim is emitted.
- WhatsApp, printing, notification and audit export dispatch remain absent.
- Prompt 9, Wave 1 and Phase 5 remain blocked.

## Per-SQL-file inventory

Statement totals count top-level SQL statements. Validation `DO` blocks are conservatively counted as mutation-class statements; transaction/timeout/advisory statements are controls.

| File | Total | Mutation | Read-only | Control | Blocked | Classification and outcome |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `00` | 18 | 0 | 16 | 2 | 0 | `READ_ONLY_PREFLIGHT`; catalog evidence only. |
| `01` | 16 | 11 | 1 | 4 | 1 | Two `CANDIDATE_NEW_OBJECT_DDL` blocks for isolated roles/schemas; existing `public` ACL mutation blocked; entire file NOT AUTHORIZED. |
| `02` | 0 | 0 | 0 | 0 | 6 | Existing ACL/default-privilege mutations blocked. |
| `03` | 0 | 0 | 0 | 0 | 4 | Existing RLS mutations blocked. |
| `04` | 0 | 0 | 0 | 0 | 5 | Existing routine mutations blocked. |
| `05` | 0 | 0 | 0 | 0 | 4 | Device and employee relation DDL blocked by CA-001/CA-002. |
| `06` | 0 | 0 | 0 | 0 | 3 | Envelope DDL blocked by CA-002 and subject mapping. |
| `07` | 0 | 0 | 0 | 0 | 3 | Core binding DDL blocked by CA-002/CA-003. |
| `08` | 0 | 0 | 0 | 0 | 6 | Review/payment/snapshot/effect DDL blocked by CA-001 and CA-003–CA-007. |
| `09` | 0 | 0 | 0 | 0 | 3 | Core cancellation/refund integration blocked. |
| `10` | 0 | 0 | 0 | 0 | 3 | All new-relation and legacy indexes/constraints blocked. |
| `11` | 15 | 0 | 13 | 2 | 0 | `READ_ONLY_PREFLIGHT` post-change attestation design. |
| `12` | 14 | 9 | 1 | 4 | 0 | `MANUAL_ROLLBACK_ONLY`; no authorization to run. |

## Composite authority adjudication

No database foreign-key target required by the corrected relation drafts is proven deeply enough for executable DDL. The approved effect identity is policy-level only and its table remains blocked.

| Gap | Required closure | Status |
| --- | --- | --- |
| CA-001 | Exact `(branch_id, tenant_id)` target relation, ordered columns/types, validated unique key, owner and lifecycle | Missing; blocks device and snapshot headers |
| CA-002 | Immutable employee authority key binding id, device, employee, Primary Auth subject, tenant, branch and every acquisition generation | Missing; blocks employee authority, envelopes and bindings |
| CA-003 | Exact Core command identity binding command to tenant/branch, plus any required actor/device columns | Missing; blocks binding, review, payment and effect relations |
| CA-004 | Exact `(snapshot_id, tenant_id, branch_id)` header key or fully proven header-derived-scope redesign | Missing |
| CA-005 | Trusted serialized review compare-and-set writer with scope derivation | Missing |
| CA-006 | Separate employee and provider payment writers, roles, grants and transition contract | Missing |
| CA-007 | Effect claim/complete/fail state machine, provider idempotency and atomic Core intent insertion | Missing |

## Role and ACL correction

The six existing AFEX roles are checked only for attributes established by approved evidence. `rolinherit` is captured but is not asserted for them. The twelve proposed roles still require NOLOGIN, NOSUPERUSER, NOINHERIT, NOCREATEDB, NOCREATEROLE, NOREPLICATION and NOBYPASSRLS, with no unexpected memberships.

`REVOKE CREATE ON SCHEMA public` is absent from executable SQL. Prompt 9 must inventory Supabase, migration, extension, maintenance and application callers before any existing privilege is changed. Wave 1 stops before the first unresolved existing-object mutation.

## Review and execution boundaries

- Reviewable now: static identities, read-only evidence designs, isolated new role/schema design, blocked-gap register, dependency graph, tests, security/lock/rollback reasoning.
- SQL execution now: **NO**.
- Wave 1: **NO**.
- Prompt 9: **NOT STARTED; human approval required before it may begin**.
- Persistent unwrap, dispatch/replay, pilot: **NO**.
- Phase 5: **NO / BLOCKED**.
