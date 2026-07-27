# Package 6R Runtime Test Plan

Status: NOT EXECUTED. Isolated Clone/Staging only; Production prohibited.

Install in the exact sequence 06A → 06B → 06. Verify 06A creates only disabled
activation/control defaults, 06B adds quote/context integration, and 06 adds
only static closure. No test may enable Production activation or grants.

Test trusted context issuance, rate limiting, authoritative quote issuance,
quote immutability, exact financial parity, atomic consumption, failed
transaction rollback, fresh-context committed replay, cross-tenant/branch
denial, worker isolation, wrong-role execution and browser/service closure.
Manipulated client prices, totals, VAT, discounts, purpose, version or key hash
must fail. No duplicate order, invoice, quote, inventory, audit or outbox
persistence is allowed.

Verify RLS/FORCE RLS, kill-switch dominance, global/tenant/branch gates and
deterministic canary decisions using isolated fixtures that are restored to
the fully disabled state before the test ends.

Evidence may retain hashes, sanitized IDs, correlation IDs and structured
errors only. Raw tokens, PINs, credentials, customer data and secrets are
prohibited. STOP on Production connectivity, leakage, partial state or any
permission broadening.
