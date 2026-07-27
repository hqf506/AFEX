# AFEX Core V2 — Package 6R Production Run Card

Status: installation review only. Execution is not authorized by this document.  
Core V2: disabled. Runtime tests: NOT EXECUTED.

## Frozen executables

| Order | File | Lines | Bytes | SHA-256 |
|---:|---|---:|---:|---|
| 1 | `06a-activation-foundation.sql` | 1643 | 53063 | `01466f6d61a90bfd56b2c4a40c776c8ce36cd850f9a24f47e89fd6d21e557351` |
| 2 | `06b-authoritative-quote.sql` | 2121 | 69957 | `797e7baff7fc592decc6bf6765c6a6a6970befc1f22d6d86cc5c69fd08ec8cda` |
| 3 | `06-activation.sql` | 859 | 35525 | `f92f0cab092647a02fa98ba970b4c279c059c3154c253ddd973f24c05ed39d76` |

Upstream: Package 2B-S `009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d`;
Package 4T `40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7`;
Package 5R-B `df141eb3ad7c1ff9b9a2ca700a06b4493c524d671b384cf2c4d6a61b0fb569a3`.

## Exact order and boundaries

1. 06A installs disabled activation/control infrastructure only.
2. STOP; retain output and obtain external reviewer acceptance.
3. 06B installs shared validation, authoritative quote, quote-context
   integration and combined readiness only.
4. STOP; retain output and obtain external reviewer acceptance.
5. 06 installs static preparation and privilege closure only.
6. STOP; run the complete post-run verification and obtain external approval.

Installation is separate from verification. Any later activation, canary,
runtime grant, legacy closure or Production runtime test is a new independent
change requiring a different approval.

## Preconditions

- [ ] Production identity independently confirmed by two operators.
- [ ] Backup reference, timestamp, retention and restoration owner recorded.
- [ ] Restoration procedure tested in an isolated environment.
- [ ] Maintenance window, observer and STOP authority recorded.
- [ ] Local SHA-256 evidence matches every frozen executable and dependency.
- [ ] Package 2B-S, 4T and 5R-B evidence accepted.
- [ ] Full `06-pre-run-verification.sql` output retained and accepted.
- [ ] No unapproved dedicated-role membership or privilege exists.
- [ ] Atomic, quote, readiness and activation entry points remain closed.
- [ ] Global, tenant and branch activation is disabled; kill switch is enabled.

## Selecting the pre-run stage

No SQL variable, `SET`, temporary object, dynamic SQL or file edit is used.

1. In the SQL client's read-only selection mode, execute the common portion of
   `06-pre-run-verification.sql` from the beginning through the final
   `pre_trigger_state` statement. Do not select the separately marked
   `STAGE-DEPENDENT DISABLED-STATE SECTION` yet.
2. The single `stage_gate/target_stage` row must be exactly the stage expected
   by the next executable:
   - `BEFORE_06A` before 06A;
   - `BEFORE_06B` before 06B;
   - `BEFORE_06` before 06.
3. For `BEFORE_06B` and `BEFORE_06`, execute the three statements in the
   separately marked disabled-state section. All three must PASS.
4. For `BEFORE_06A`, do not execute that section because its 06A relations are
   intentionally not installed. Their absence must instead be reported as
   stage-appropriate `INSTALL_REQUIRED`.

The selected SQL text is never edited. The client must retain the exact
selection boundaries and output as evidence.

## Pre-run result acceptance

- `PASS`: mandatory for every installed or earlier-stage contract.
- `INSTALL_REQUIRED`: allowed only for objects owned by the current or a later
  executable. It is forbidden for every earlier-stage object.
- `CREATE_REQUIRED`: allowed only for `afex_core_runtime`,
  `afex_core_activation_owner`, and `afex_core_activation_operator`, and only
  before the executable that creates the missing role.
- `REVIEW_REQUIRED`: allowed only for named baseline result sets after a named
  external reviewer accepts and retains every row.
- `EXTERNAL_EVIDENCE_REQUIRED`: allowed only for documented local SHA-256
  evidence retained outside PostgreSQL.
- `FAIL`, a missing expected row, an unexpected category, an unexpected result,
  or a stage mismatch is an immediate STOP.

Missing `anon`, `authenticated`, `service_role`, `afex_core_owner`,
`afex_context_issuer` or `afex_outbox_worker` always fails.

Production version evidence is recorded in
`database-reconciliation/baseline/production-baseline.sql` as PostgreSQL 17.6.
Accordingly, the reviewed membership evidence may use PostgreSQL 17
`pg_auth_members.admin_option`, `inherit_option` and `set_option`. A different
server major version is a STOP requiring a new compatibility review.

## Manual execution controls

- Execute one unchanged file at a time in the exact order above.
- Capture client version, start/end UTC, operator, observer, target identity,
  exit status, notices and errors without secrets.
- Never paste edited fragments or retry a partial statement/transaction.
- After any failure: STOP, preserve the session/output and seek review.
- Do not continue to the next file until its external decision is approved.
- Never call `create_order_atomic_v2`.
- Never grant runtime EXECUTE.
- Never enable a canary or any activation flag.
- Never run runtime tests in Production.
- Never continue when an earlier-stage object remains `INSTALL_REQUIRED`.

## Per-file acceptance

For each executable:

- [ ] Local hash rechecked immediately before execution.
- [ ] Pre-run output contains no FAIL.
- [ ] Only documented INSTALL_REQUIRED/CREATE_REQUIRED rows are accepted.
- [ ] Complete execution output retained.
- [ ] Transaction completed normally; no partial retry occurred.
- [ ] Post-stage disabled-state and privilege-closure results pass.
- [ ] External reviewer decision retained before proceeding.

## Final acceptance

- [ ] Complete post-run verification retained.
- [ ] Mandatory contract rows PASS.
- [ ] ACL/default-ACL/baseline captures accepted by named reviewer.
- [ ] All 15 Package 6 functions have exact signatures and owners.
- [ ] All 16 Package 6 policies and the retained Package 5R-B quote-read policy
      (17 reviewed policies total), 7 control tables and 7 triggers match.
- [ ] Core V2 remains disabled and ungranted.

## Failure and rollback

STOP and do not improvise. `06-rollback.sql` deliberately fails closed because
the authoritative prior owners, ACLs, default ACLs, policies, memberships,
trigger definitions and control values are not embedded. Use only an approved
forward fix or authoritative restoration.

If the deliberate exception leaves the SQL client in a failed transaction,
explicitly issue `ROLLBACK` or close that session before any later operation.

This run card authorizes neither SQL execution nor activation.
