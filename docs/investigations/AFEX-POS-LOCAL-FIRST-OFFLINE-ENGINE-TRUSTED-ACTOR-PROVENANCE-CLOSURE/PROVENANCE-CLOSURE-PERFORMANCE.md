# Performance and Lock Budget

No database or query-plan execution occurred. The following budgets are design gates for later isolated qualification:

- Resolver input is bounded to 1–1,000 claims and is resolved in one database call.
- Resolver validation uses `jsonb_array_elements` plus equality joins; it does not issue one network/database round trip per command.
- Inventory frontier is bounded to 200 unique catalog IDs and uses one set-based join.
- Equality scope columns precede status/time columns in every authority index.
- Current uploader Auth/POS checks happen once per batch, not once per line item.
- Acquisition takes deterministic key-share locks in this order: POS session, device, enrollment, key envelope; it then delegates to the existing Core lock order and inserts one companion.
- Receipt lookup resolves authority once, then joins commands and companions set-wise.
- There is no global sequence or hot counter in the Offline provenance layer.
- Current `/api/orders` performs zero additional database calls because activation remains false.

Later acceptance budgets: 1,000-claim resolver under the separately approved statement timeout; no sequential scans on authority primary/equality paths; no lock-order inversion; no missing/duplicate positional output; and no unbounded payload or item expansion.

Residual risks requiring independent review are the platform `auth.sessions` column preflight, PostgreSQL 17 role-creation membership attestation, Unicode canonicalizer parity and Offline-to-Core semantic mapper parity.
