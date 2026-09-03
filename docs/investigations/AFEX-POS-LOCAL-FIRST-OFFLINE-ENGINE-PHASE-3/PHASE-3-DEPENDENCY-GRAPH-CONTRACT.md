# Phase 3 Dependency Graph Contract

Dependencies are an exact immutable set of namespace-bound command IDs stored atomically with a new command. IDs are deduplicated and sorted before hashing; missing required IDs and unapproved extra IDs are rejected.

## Required edges

- `order.create` references the exact local `customer.create` command when the customer reference kind is `local`.
- `order.create` requires a `payment.employee_attestation` whose immutable `aggregateId` equals the order's stable local aggregate reference. The attestation cannot be reused for another aggregate.
- `order.status.change` references the exact local `order.create` command when its order reference kind is `local`.
- `audit.event.append` references the exact causal command ID. Its edge remains non-blocking for future business eligibility.
- Commands that have no declared dependencies reject supplied dependency IDs.

Missing, substituted-type, aggregate-mismatched, self and cross-namespace dependencies fail closed. Validation loads the complete ancestor closure and rejects cycles and duplicate command identities. Topological ordering accepts at most 1,000 selected commands.

The preliminary check performs asynchronous envelope-hash validation. The final command/dependency transaction then re-reads the full validated closure and synchronously compares identity, type, namespace, aggregate, envelope hash and dependency projection before either store is written. Deletion or mutation between checks aborts atomically. Post-commit external tampering is detected by subsequent integrity/duplicate/planning checks; because Phase 3 dispatch is disabled it cannot cause an external effect.

Future eligibility is always false in Phase 3; an unsynced blocking dependency is additionally reported, but no dispatcher is invoked.

The graph stores no customer/order/payment content. Exact-scope purge removes edges and commands together and verifies zero residue while preserving unrelated namespaces.
