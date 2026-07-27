# Package 6R Financial Consistency Test

Status: NOT EXECUTED. Isolated Clone/Staging only.

Cover catalog fallback, branch override, VAT, discounts, rounding boundaries,
mixed lines, quote expiry, stale configuration, altered payload/hash,
manipulated client totals and immutable committed replay. Include wrong actor,
tenant, branch, authorization context, purpose, version and idempotency-key
hash.

Assert exact quote/derived JSONB and SHA-256 parity; complete immutable invoice
and item snapshots; order/invoice/line total equality; correct source/rule
versions; rejection before inventory/numbering/persistence on drift; and no
duplicate financial or order persistence under retries and concurrent
submission. Validate the 06B immutability trigger and context-binding
constraint/index without modifying Production.

Production data and sensitive evidence are prohibited. Raw tokens, PINs,
credentials, customer data and secrets must never be retained.
