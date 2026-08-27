# AFEX POS Offline pre-PIN provisioning v2 — manual SQL runbook

Status: review-only and not executed by Codex. This package adds pre-PIN
provisioning authority; it does not activate Offline in Production and it cannot
acquire an order.

## Exact order

1. Confirm Production Offline remains disabled:
   `AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED` is unset or false.
2. Run `00-READ-ONLY-PREFLIGHT.sql` as the bounded `postgres` installer. Its
   single JSON result must contain `AFEX_PRE_PIN_V2_PREFLIGHT_PASS`.
3. Independently review the entire whole file
   `01-ADD-PRE-PIN-PROVISIONING-V2.sql`; never run a subset or line range.
4. Execute that one additive wave manually. Expected terminal notice:
   `AFEX_PRE_PIN_V2_POST_ATTESTATION_PASS: facades=4 service_role=4 browser=0 order_acquisition_v1_unchanged=true`.
5. Re-run the catalog-only attestation in the final `DO` block under a read-only
   transaction if independent confirmation is required.
6. Deploy the matching application commit to Preview only and enable the global
   flag only there for authenticated human qualification.

## Authority boundary

- Primary Auth/session, tenant and branch are resolved server-side.
- No employee or POS actor is accepted by the v2 pre-PIN facades.
- The four public facades are executable by `service_role` only.
- `PUBLIC`, `anon` and `authenticated` have no table or function access.
- Device identity is stable and the existing one-active-device-per-branch guard
  remains authoritative.
- The v2 bootstrap has no selected employee and no command authority.
- After a valid PIN, the application uses the existing v1 employee enrollment
  and v1 actor-bound bootstrap before any order synchronization.

## Deactivation

Run the complete `90-DEACTIVATE-PRE-PIN-PROVISIONING-V2.sql`. It revokes the
four `service_role` facade grants only. It deliberately retains functions,
tables, key-envelope metadata and immutable evidence. Existing v1 Core V2
order acquisition is not modified by either forward or deactivation file.

## Failure rule

Any preflight, owner, ACL, scope, one-device, idempotency or post-attestation
failure aborts the transaction. Do not repair interactively and do not run a
subset. Keep the application flag disabled until the exact blocker is reviewed.
