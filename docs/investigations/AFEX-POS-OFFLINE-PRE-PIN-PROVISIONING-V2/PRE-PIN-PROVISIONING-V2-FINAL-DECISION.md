# AFEX POS Offline pre-PIN provisioning v2 — final implementation decision

Decision: `PRODUCTION_FOUNDATION_INSTALLED_POST_ATTESTED_PREVIEW_RUNTIME_PENDING`

The bounded delivery implements the complete pre-PIN preparation runtime, encrypted
IndexedDB dataset and command outbox, POS-only service-worker boundary, Online and
Offline employee PIN binding, actual local `order.create`, stable pending receipts,
inventory commitment enforcement and bounded authority-revalidated reconnection
synchronization.

The corrected SQL wave is additive and versioned. It does not alter or acquire
an order. It adds one private context helper plus four `service_role`-only
pre-PIN facades, keeps `public CREATE` transaction-bounded, returns only eligible
enrolled employees with honestly classified encrypted Offline PIN-verifier
material, stores immutable idempotent dispositions, covers new FK/lookup indexes,
restores exact installer memberships, and provides owner-aware deactivation.
All canonical SQL SHA-256 calculations now use PostgreSQL 17 native
`pg_catalog.sha256(bytea)` over the unchanged byte inputs; the package has no
dependency on `public.digest` or `extensions.digest` and grants no access to the
`extensions` schema.

## Human Production execution attestation

- Preflight result: `AFEX_PRE_PIN_V2_PREFLIGHT_PASS`.
- Complete forward wave: successful and committed only after its embedded
  post-attestation passed.
- Executed and repository forward-wave SHA-256:
  `f36d18366ecc5d6c0217c8cbe855a1c99415a56cf7ba5a407522eb32f24fde7e`.
- Codex did not execute SQL or connect to the database. The installed Foundation
  must not be rerun or deactivated during Preview qualification.

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

The remaining action is Preview-only application deployment with only
`AFEX_OFFLINE_ORDER_CREATE_PILOT_ENABLED=true`, followed by authenticated human
qualification. No fixed UUID allowlist is permitted. Production application
activation remains prohibited until that human Preview gate passes.

No PostgreSQL parser claim is made because no compatible parser was installed
locally. Codex performed no SQL, database, Docker, or Supabase execution; the
successful human Production execution is recorded separately above.
