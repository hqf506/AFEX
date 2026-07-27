# Package 6R Authorization and Quote Replay Test

Status: NOT EXECUTED. Isolated Clone/Staging only.

Cover wrong actor, tenant, branch, context token, idempotency-key binding,
purpose, context version and key hash; expiry; revocation; single-use
consumption; simultaneous quote/consume; same-context same-intent quote replay;
same-context different-intent rejection; stale quote rejection; rollback after
consumption; and immutable committed order replay with a fresh context.

Committed replay must preserve immutable order/invoice response without
reusing authorization or creating a duplicate quote/order. Verify the 06B
wrapper uses the shared validator and that quote-context identity never crosses
tenant or branch boundaries.

Raw tokens, hashes usable as credentials, PINs, JWTs, customer data and secrets
must not be retained.
