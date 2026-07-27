# Package 6R Concurrency Test Plan

Status: NOT EXECUTED. Isolated Clone/Staging only.

Run simultaneous context issuance, quote issuance for one context, quote versus
consume/revoke/expiry, configuration-row mutation versus quote derivation,
atomic replay, activation-state updates, deterministic canary decisions and
kill-switch transitions.

Assert deterministic locking, one quote/context, one consumption commit, no
mixed financial configuration, exact replay, no deadlock, no cross-scope
effect, no duplicate financial/order persistence and rollback of failed state
changes. Include competing wrong-tenant, wrong-branch, wrong-actor, wrong-key,
wrong-purpose and stale-version attempts.

Run only after isolated installation in the exact order 06A → 06B → 06.
Restore global, tenant and branch controls to disabled with kill switch enabled
after every test. Retain sanitized timings and state transitions only.
Production, tokens, PINs, credentials, customer data and secrets are prohibited.
