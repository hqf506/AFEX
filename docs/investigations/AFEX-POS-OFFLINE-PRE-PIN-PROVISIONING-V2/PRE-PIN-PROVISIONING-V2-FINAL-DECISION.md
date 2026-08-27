# AFEX POS Offline pre-PIN provisioning v2 — final implementation decision

Decision: `READY_FOR_HUMAN_SQL_REVIEW_AND_MANUAL_EXECUTION`

The bounded delivery implements the complete pre-PIN preparation runtime, encrypted
IndexedDB dataset and command outbox, POS-only service-worker boundary, Online and
Offline employee PIN binding, actual local `order.create`, stable pending receipts,
inventory commitment enforcement and bounded authority-revalidated reconnection
synchronization.

The SQL wave is additive and versioned. It does not alter or acquire an order. It
adds one private context helper plus four `service_role`-only pre-PIN facades,
retains immutable evidence, restores temporary installer memberships inside the
transaction and has an exact non-destructive deactivation mapping.

## Frozen safety outcome

- SQL, database, Supabase, Production and provider executions by Codex: **0**.
- Production deployment and Production Offline activation: **0**.
- `AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED` remains the only operational switch.
- All provider/external-effect and seven non-`order.create` Offline capabilities
  remain unavailable.
- No static customer/account/tenant/branch/device/employee UUID allowlist exists.
- No service-role secret, PIN, provider credential or payment-card secret is stored
  in browser storage or Cache Storage.

## Human gate

The remaining action is exactly the human review and whole-file manual execution
documented in `PRE-PIN-PROVISIONING-V2-MANUAL-RUNBOOK.md`. The application commit
must not be promoted as a usable Production Offline client until the preflight,
forward wave and post-wave attestation have passed under the approved installer.

No PostgreSQL parser or SQL runtime claim is made because construction and
qualification were intentionally Offline and no SQL was executed.
