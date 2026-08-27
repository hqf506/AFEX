# SQL Review Lock and Performance Assessment — Scope Integrity Correction

Nothing is authorized for execution. Suggested future lock budgets remain design guidance only and require fresh target evidence.

| File / domain | Current draft lock exposure | Future risk if evidence closes | Required proof |
| --- | --- | --- | --- |
| `00` | Read-only design only | Catalog ACCESS SHARE | Target identity and bounded catalog capture |
| `01` | Candidate new role/schema statements only; historical public ACL block absent | Role/new-schema catalog locks | Proposed schema absence, role identity/membership and independent approval |
| `02`–`04` | None; all existing-object mutations blocked | High authorization and plan invalidation impact | Prompt 9 callers, effective ACL/RLS, bodies, overloads and dependency closure |
| `05` | None; device/employee DDL removed | Device activation serialization and roster contention | CA-001/CA-002 plus 2-device and 25/26 races |
| `06` | None; envelope DDL removed | Generation/hash uniqueness and envelope row size | CA-002, subject mapping and canonical vectors |
| `07` | None; binding DDL removed | Acquisition/idempotency/receipt contention | CA-002/CA-003 and Core transaction graph |
| `08` | None; review/payment/snapshot/effect DDL removed | Review CAS, provider reconciliation, snapshot volume and effect claims | CA-001 and CA-003–CA-007 with measured load |
| `09` | None | Cancellation, stock, payment and effect lock graph | Exact Core cancellation identity and deadlock suite |
| `10` | None; all index statements removed | Future concurrent scans and brief catalog locks | Corrected table shapes, duplicate counts, sizes, write rates and query plans |
| `11` | Read-only design only | Catalog reads and invariant counts | Future corrected object manifest |
| `12` | Manual rollback only | Short ACL catalog locks and availability impact | Exact deployed runtime reachability and workers/routes stopped |

## Required future performance evidence

Prompt 9 or a separately authorized read-only phase must establish current callers and response parity. A later SQL review must additionally establish exact composite keys, relation cardinalities, duplicate counts, row sizes, query plans, expected/burst concurrency, lock order, invalid-index behavior and stop budgets. No Production cardinality, lock wait, TPS or latency measurement occurred here.

Mode A remains continuous Offline. Time and last synchronization age are not performance shortcuts and never revoke authority.
