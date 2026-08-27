# Prompt 10 performance and lock assessment

All evidence is catalog-only or safe aggregate proof; no EXPLAIN ANALYZE, load test, row lock or DDL was run.

- **CA-001 composite uniqueness:** 13 branches, zero duplicate/null/orphan counts. A future validated unique constraint is currently a small scan, but still takes DDL locks; independent SQL review must select direct validation versus staged validation. `PRODUCTION_CATALOG_PROOF + SAFE_AGGREGATE_PROOF`.
- **Core command ledger:** bounded relation sizes are small in the current catalog and indexes cover scoped idempotency, tenant/branch history, lease recovery, response retention and terminal lookup. Contention remains concentrated on acquisition/claim/execute state rows. `PRODUCTION_CATALOG_PROOF`; concurrency result `REQUIRES_RUNTIME_TEST`.
- **Inventory:** `inventory_stock` has the exact unique/index `(tenant_id,branch_id,catalog_item_id)`; movements have tenant/branch/item/time indexes. Snapshot generation cost is proportional to branch catalog size and needs bounded pagination/hashing. `PRODUCTION_CATALOG_PROOF + INFERENCE`.
- **RLS predicates:** policy catalog is exact, but planner behavior and hostile-role performance require runtime tests. `REQUIRES_RUNTIME_TEST`.
- **Review CAS/device enrollment/effect claim:** target objects do not exist, so contention/index estimates remain design inference. Device enrollment should serialize by branch/device key; review by command/review; effects by semantic identity and lease expiry. `INFERENCE`.
- **Foreign keys:** future composite FKs require referenced composite uniqueness first. Use staged NOT VALID/validation only after independent lock review; this prompt does not prescribe executable syntax. `INFERENCE`.
- **Redundant indexes:** current invoices/orders contain similarly shaped monthly unique indexes; they may be redundant, but usage and external caller evidence were not collected. No removal is recommended. `PRODUCTION_CATALOG_PROOF + REQUIRES_RUNTIME_TEST`.
- **Long transactions:** all Prompt 10 transactions were bounded and rolled back. Future snapshot export, backfill and constraint validation must be chunked/bounded and independently qualified.

