# AFEX POS Offline pre-PIN provisioning v2 — manual SQL runbook

Status: Production Foundation installed and post-attested by the human owner;
not executed by Codex. The installed forward-wave identity is
`f36d18366ecc5d6c0217c8cbe855a1c99415a56cf7ba5a407522eb32f24fde7e`.
This package adds pre-PIN provisioning authority; it does not activate Offline
in Production and it cannot acquire an order.

## Human execution record

- PostgreSQL 17.6 preflight: `AFEX_PRE_PIN_V2_PREFLIGHT_PASS`.
- Complete forward wave: successful; PostgreSQL committed only after the
  embedded post-attestation passed.
- The executed SQL and repository SQL are byte-identical. The sole correction
  after review was the proven comment wording: `Fresh authority is mandatory
  before returning stored disposition; it cannot revive`.
- Do not rerun the Foundation and do not run the deactivation wave for Preview
  activation or qualification.

## Exact order

1. Confirm Production Offline remains disabled:
   `AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED` is unset or false.
2. Historical completed gate: `00-READ-ONLY-PREFLIGHT.sql` ran as the bounded
   `postgres` installer. Its
   single JSON result must contain `AFEX_PRE_PIN_V2_PREFLIGHT_PASS`. The
   `sha256_identity_and_execute_exact` diagnostic must be `true`; otherwise the
   exact failure classification is
   `AFEX_PRE_PIN_V2_PREFLIGHT_SHA256_IDENTITY_AND_EXECUTE_EXACT`.
3. Historical completed gate: the entire whole file
   `01-ADD-PRE-PIN-PROVISIONING-V2.sql` was reviewed and executed without a
   subset or line range.
4. Historical completed gate: the terminal notice began with
   `AFEX_PRE_PIN_V2_POST_ATTESTATION_PASS:` and every emitted diagnostic boolean
   must be `true`; any false diagnostic aborts before `COMMIT`.
5. Do not rerun the installed Foundation. Preserve its successful human
   preflight and embedded post-attestation evidence.
6. Deploy the matching application commit to Preview only and enable the global
   flag only there for authenticated human qualification.

## Authority boundary

- Primary Auth/session, tenant and branch are resolved server-side.
- No employee or POS actor is accepted by the v2 pre-PIN facades.
- The four public facades are executable by `service_role` only.
- The context helper is private, owned by `afex_offline_authority_owner`, and
  executable only by `afex_function_owner`.
- `PUBLIC`, `anon` and `authenticated` have no table or function access.
- `afex_function_owner` receives `public CREATE` only while creating the four
  facades; the forward wave proves that it is false again before commit.
- Canonical SHA-256 identities use PostgreSQL 17 native
  `pg_catalog.sha256(bytea)`. The wave neither depends on `pgcrypto` schema
  access nor changes the `extensions` schema, extension ownership, or ACLs.
- Device identity is stable and the existing one-active-device-per-branch guard
  remains authoritative.
- The employee roster contains only active, unlocked, non-revoked device
  enrollments with exact `order.create` authority and an approved Offline
  PBKDF2 verifier; no Online operational PIN hash is returned.
- An idempotent bootstrap replay first revalidates current authority and then
  returns the immutable disposition stored for the original operation.
- The v2 bootstrap has no selected employee and no command authority.
- After a valid PIN, the application uses the existing v1 employee enrollment
  and v1 actor-bound bootstrap before any order synchronization.

## Deactivation

Do not run `90-DEACTIVATE-PRE-PIN-PROVISIONING-V2.sql` during Preview
qualification. It remains an independently reviewed emergency deactivation
control. When separately authorized, it temporarily
sets the proven facade owner, revokes the four `service_role` facade grants,
restores the exact baseline membership, and proves that restoration before
commit. It deliberately retains functions,
tables, key-envelope metadata and immutable evidence. Existing v1 Core V2
order acquisition is not modified by either forward or deactivation file.

## Failure rule

Any preflight, owner, ACL, scope, one-device, idempotency or post-attestation
failure aborts the transaction. Do not repair interactively and do not run a
subset. Keep the Production application flag disabled. Preview activation is
limited to the exact reviewed application commit and authenticated human
qualification described above.
