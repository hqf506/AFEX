# Final decision

Decision: `CORE_V2_OFFLINE_AUTHORITY_BRIDGE_IMPLEMENTED_BEHIND_HARD_DISABLED_FLAGS_READY_FOR_HUMAN_REVIEW`

The server-only bridge now has exact typed and runtime-validated contracts for all eight command payloads, command/aggregate semantics, normalized order items and totals, exact frontier/payment binding, ordered qualification, full-scope idempotency acquisition, authority-bound stable receipts, resolver outputs, local-state mapping, external-effect identities, review CAS and cancellation/refund blocking.

The independent-review blockers are corrected: generic payload qualification is impossible, a receipt cannot be returned before immutable trusted authority binding, and malformed/partial/reordered/duplicated/oversized resolver output fails closed per candidate without throwing from qualification.

The production resolver remains explicitly unavailable. Every persistence, unwrap, ingestion, outbox, dispatch, replay, interception, order creation, payment-provider, external-effect, cancellation and refund flag is immutable false. No route or current business caller imports the module. No server mutation can execute from this phase.

Human review is required before any SQL authority migration design or runtime integration. The SQL authority, trusted snapshot provider, persistent full-scope idempotency acquisition, review persistence and exact cancellation/refund authority remain blocked.

Safety accounting: SQL/DB/Supabase/Production/business writes/dispatch/replay/provider actions/external effects/Git writes/deployment = 0.
