# External Effects Assessment

## Current paths

Core V2's private persistence function does not call WhatsApp, a payment provider, printing, or another network effect. This is a safe reusable boundary.

The online order route performs best-effort audit and financial snapshot work after the business result, then schedules invoice PDF WhatsApp delivery in a framework background callback. An exact Core duplicate returns the stored receipt before that post-processing block, which suppresses the duplicate route effect for that exact replay.

The POS order-status route derives the POS employee from trusted server context, performs a compare-and-set transition, and only attempts WhatsApp after a persisted transition. An already-applied status is classified as idempotent. Audit and WhatsApp remain separate from the status transaction.

Printing and invoice preview are client/user actions. They have no durable server effect identity.

## Gaps

No durable external-effect ledger, unique effect key, claim lease, delivery attempt state, or provider receipt was found for order creation or status notification. If the provider accepts a message and the runtime fails before audit records success, a later independent retry can duplicate the effect. `audit_logs` is best-effort and cannot serve as the claim/commit ledger.

No payment-provider invocation is inside Core V2, which means Offline replay can remain provider-free if the future bridge preserves that boundary. The existing success page and direct WhatsApp routes must not be called from replay.

## Required contract

After server acceptance, the server should create a uniquely keyed effect intent inside the authoritative transaction. A dispatcher should claim, execute once under a bounded provider idempotency identity where available, record outcome, and make retries stateful. Printing should remain explicitly user-driven and never be emitted by replay.

External effects are therefore suppressible by design but are not yet durably exactly-once.
