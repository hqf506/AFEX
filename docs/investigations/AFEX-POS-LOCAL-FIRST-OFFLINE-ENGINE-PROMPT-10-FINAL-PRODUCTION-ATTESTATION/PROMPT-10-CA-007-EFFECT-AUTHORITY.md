# CA-007 — Effect authority

**Final classification:** `BLOCKED_CORE_V2_CHANGE_REQUIRED` and `BLOCKED_SQL_DESIGN_REQUIRED`.

The bounded catalog found branch WhatsApp configuration and support-notification read state, but no atomic effect-intent ledger bound to a Core command. No relation proves semantic uniqueness, lease/versioned claim, provider idempotency, receipt hash, ambiguous-result state, suppression, terminal state, or concurrency-safe retries.

The future immutable identity remains:

`serverCommandId + effectType + effectVersion`

Intent insertion must be atomic with the Core business commit. Claim/complete/fail operations require compare-and-set and bounded lease recovery. Local employee printing is not replayed as an external effect unless a later approved contract explicitly requires it.

No WhatsApp, print, notification, webhook, Edge Function, provider function, or application function was called.

