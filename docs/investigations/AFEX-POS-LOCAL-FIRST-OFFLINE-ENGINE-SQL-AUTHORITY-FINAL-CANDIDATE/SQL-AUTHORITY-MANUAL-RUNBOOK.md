# Transactional Owner-Aware Manual Runbook

The Foundation sequence below is the exact 22-wave record reported as successfully executed and attested by the human owner. This document does not authorize a rerun. Never rerun completed Foundation files merely because this repository record was reconciled.

| Order | Node | Whole file | Expected owner context |
|---:|---|---|---|
| 0 | W0 | `00-READ-ONLY-PREFLIGHT.sql` | postgres, READ ONLY, ROLLBACK |
| 1 | W1A | `01A-PRIVATE-ROLES-AND-SCHEMA-FOUNDATION.sql` | postgres → offline owner → postgres |
| 2 | W1B | `01B-PUBLIC-COMPOSITE-SCOPE-CONSTRAINTS.sql` | postgres only |
| 3 | W1C | `01C-CORE-COMPOSITE-SCOPE-CONSTRAINTS.sql` | postgres → core owner → postgres |
| 4 | W1D | `04A-TRUSTED-AUTH-SESSION-BRIDGE.sql` | postgres with bounded offline-owner schema grant; helper remains postgres-owned |
| 5 | W1E | `04B-POS-ACTOR-AUTHORITY-POLICY-BRIDGE.sql` | postgres → POS-session owner → postgres |
| 6 | W1F | `04C-POSTGRES-OWNED-SUPPORT-POLICIES.sql` | postgres only |
| 7 | W2A | `05-OFFLINE-DEVICE-AUTHORITY.sql` | postgres → offline owner → postgres |
| 8 | W2B | `06-OFFLINE-EMPLOYEE-ENROLLMENT-AUTHORITY.sql` | postgres → offline owner → postgres |
| 9 | W2C | `07-PERSISTENT-UNWRAP-METADATA.sql` | postgres → offline owner → postgres |
| 10 | W2D | `09-INVENTORY-SNAPSHOT-AND-FRONTIER-AUTHORITY.sql` | postgres → offline owner → postgres |
| 11 | W2E | `13-INDEXES-CONSTRAINTS-AND-INVARIANTS.sql` | postgres → offline owner → postgres |
| 12 | W2A1 | `05A-TRUSTED-DEVICE-LIFECYCLE-WRITERS.sql` | postgres → offline owner → postgres |
| 13 | W2B1 | `06A-TRUSTED-EMPLOYEE-PIN-SELECTION-WRITERS.sql` | postgres → offline owner → postgres |
| 14 | W2D1 | `09A-TRUSTED-INVENTORY-SNAPSHOT-PUBLISHER.sql` | postgres → offline owner → postgres |
| 15 | W3C | `10A-TRUSTED-OFFLINE-BOOTSTRAP-AUTHORITY.sql` | postgres → offline owner → postgres |
| 16 | W3A | `08A-OFFLINE-COMMAND-BINDING-RELATION.sql` | postgres → offline owner → postgres |
| 17 | W3B | `08B-PROVENANCE-PAYMENT-INVENTORY-VALIDATORS.sql` | postgres → function owner → postgres |
| 18 | W4A | `08C-TOTAL-RESOLVER-AND-INVENTORY-READER.sql` | postgres → function owner → postgres |
| 19 | W4B | `08D-ATOMIC-ORDER-CREATE-ACQUISITION.sql` | postgres → function owner → postgres |
| 20 | W4C | `11-IDEMPOTENCY-RECEIPT-AND-EFFECT-LEDGERS.sql` | postgres → function owner → postgres |
| 21 | W5 | `14-POST-CHANGE-READ-ONLY-ATTESTATION.sql` | postgres, READ ONLY, ROLLBACK |

The comment-only files `02`, `03`, `04`, `08`, `10`, and `12` were never executed. `00Z` is emergency membership cleanup only. `15` is fail-closed reachability shutdown. `15A` is optional empty-only cleanup after `15`. `90-FINAL-MANUAL-PILOT-ACTIVATION.sql` and `90Z-FINAL-EMERGENCY-PILOT-DEACTIVATION.sql` are excluded from the Foundation and are classified `NOT_EXECUTED_REQUIRES_FINAL_HUMAN_APPROVAL`.

For each owner-aware file, the exact successful transition is a transaction-bounded `GRANT ... WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER`, followed by `SET LOCAL ROLE`, `RESET ROLE`, and exact `REVOKE ... GRANTED BY CURRENT_USER` before `COMMIT`. The rejected `GRANT ... SET FALSE` restoration is not part of this record.

Human-reported Foundation status: `FOUNDATION_EXECUTED_AND_ATTESTED_BY_HUMAN` (22/22). Construction-time SQL/DB/network executions: 0.
