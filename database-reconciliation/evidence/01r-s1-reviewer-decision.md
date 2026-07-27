# AFEX Enterprise Platform Core V2 — Package 1R-S2

## Production Output External Classification and Reviewer Decision

Review date: 2026-07-25  
Repository branch: `master`  
Authoritative evidence: `database-reconciliation/evidence/01r-s1-production-output.csv`  
Read-only report SQL: `database-reconciliation/core-v2/i5.9/01s-supabase-production-report.sql`

This document classifies the captured Production metadata only. It does not state that Production is secure, approve Package 2R execution, approve Package 5, or approve Core V2 activation.

## A. Input integrity

| CSV section_name | object_schema | object_name | attribute_name | attribute_value | Original status/severity | Reviewed classification | Rationale | Owning future package |
|---|---|---|---|---|---|---|---|---|
| REPORT_METADATA | n/a | authoritative_output | path | `database-reconciliation/evidence/01r-s1-production-output.csv` | INFO/INFO | PASS | The authoritative file exists at the corrected path and is readable. | Package 1R-S2 |
| REPORT_METADATA | n/a | CSV | header | `section_order,section_name,item_order,object_schema,object_name,object_type,attribute_name,attribute_value,status,severity,notes` | INFO/INFO | PASS | Header matches the frozen contract exactly. | Package 1R-S2 |
| REPORT_METADATA | n/a | CSV | physical_line_count | `14652` | INFO/INFO | PASS | File is non-empty. Embedded newlines in quoted CSV fields explain why 9,263 parsed records occupy 14,652 physical lines. | Package 1R-S2 |
| REPORT_METADATA | n/a | CSV | parsed_record_count | `9263` | INFO/INFO | PASS | PowerShell `Import-Csv` parsed all records without error. | Package 1R-S2 |
| REPORT_METADATA | n/a | CSV | byte_count | `1319369` | INFO/INFO | PASS | Size recorded before review. | Package 1R-S2 |
| REPORT_METADATA | n/a | CSV | sha256 | `0a68aea6a1209229be83f237fd944c3b3a0265a4539b333726f5458475e0c9be` | INFO/INFO | PASS | Hash recorded before review; CSV was not modified. | Package 1R-S2 |
| REPORT_METADATA | n/a | report | section_count | `66` | INFO/INFO | PASS | All expected structural, security, readiness, collision, blocking-summary, and decision sections are present. | Package 1R-S2 |
| FINAL_BLOCKING_SUMMARY | n/a | final summary | row presence | `11 metrics` | mixed | PASS | Blocking summary exists and is parseable. | Package 1R-S2 |
| FINAL_PREFLIGHT_DECISION | n/a | FINAL_PREFLIGHT_DECISION | total_blocking_issue_count | `133` | BLOCKED/CRITICAL | REVIEWED/RECLASSIFIED | The generic total includes Supabase platform ACLs/roles and AFEX legacy ACLs. It is not used without object-level classification. | Package 1R-S2 |
| REPORT_METADATA | n/a | report SQL | sha256 | `f71a463ea96ec7dd26563ecc7c4a32cc325bd53ddc5414fadcafdcbf0a56f029` | INFO/INFO | PASS | Actual SQL hash exactly matches the expected hash. | Package 1R-S2 |

CSV completeness result: **PASS**.

Section inventory (66):

`ACTIVATION_CONFIGURATION_OBJECTS`, `BACKFILL_CANDIDATE_COUNTS`, `CHECK_CONSTRAINTS`, `COLUMN_DEFAULTS`, `COLUMN_NULLABILITY`, `COLUMNS_AND_TYPES`, `CURRENT_SCHEMA`, `DATA_READINESS_COUNTS`, `DATABASE_IDENTITY`, `DEFAULT_PRIVILEGES`, `DUPLICATE_OVERLOAD_SUMMARY`, `EXISTING_CORE_V2_FUNCTIONS`, `EXISTING_CORE_V2_POLICIES`, `EXISTING_CORE_V2_ROLES`, `EXISTING_CORE_V2_TABLES`, `EXISTING_CORE_V2_TRIGGERS`, `EXTENSIONS_AND_VERSIONS`, `FINAL_BLOCKING_SUMMARY`, `FINAL_PREFLIGHT_DECISION`, `FOREIGN_KEYS`, `FUNCTION_ACLS`, `FUNCTION_LANGUAGES`, `FUNCTION_OWNERS`, `FUNCTION_PARALLEL_SAFETY`, `FUNCTION_SEARCH_PATH_CONFIG`, `FUNCTION_SECURITY_MODE`, `FUNCTION_VOLATILITY`, `FUNCTIONS_AND_SIGNATURES`, `GENERATED_AND_IDENTITY_COLUMNS`, `INDEX_ACCESS_METHODS`, `INDEX_DEFINITIONS`, `INDEX_PREDICATES`, `INDEX_READINESS`, `INDEX_UNIQUENESS`, `INDEX_VALIDITY`, `INVALID_NOT_READY_INDEX_SUMMARY`, `LEGACY_MUTATION_PATHS`, `OBJECT_OWNERS`, `POLICY_COMMAND_AND_ROLES`, `POLICY_USING_CLAUSES`, `POLICY_WITH_CHECK_CLAUSES`, `PRIMARY_KEYS`, `PUBLIC_EXPOSURE_SUMMARY`, `READ_ONLY_SESSION_STATE`, `REPORT_METADATA`, `RLS_POLICIES`, `ROLE_MEMBERSHIPS`, `ROLES_AND_ATTRIBUTES`, `SCHEMA_ACLS`, `SCHEMAS`, `SEQUENCE_ACLS`, `SERVER_ADDRESS_AND_PORT`, `SERVER_VERSION`, `SERVICE_ROLE_EXPOSURE_SUMMARY`, `SESSION_USER_AND_CURRENT_USER`, `STORAGE_CONFIGURATION_METADATA`, `TABLE_ACLS`, `TABLES`, `TABLES_WITH_FORCE_RLS`, `TABLES_WITH_RLS_ENABLED`, `TRIGGER_DEFINITIONS`, `TRIGGER_FUNCTION_LINKAGE`, `TRIGGERS`, `UNEXPECTED_OVERLOADS`, `UNIQUE_CONSTRAINTS`, `UNSAFE_ROLE_ATTRIBUTE_SUMMARY`.

## Original status and severity totals

| Status | Count |
|---|---:|
| BLOCKED | 138 |
| EMPTY | 7 |
| INFO | 5,063 |
| PASS | 1,214 |
| PRESENT | 187 |
| REVIEW | 2,649 |
| WARNING | 5 |
| **Total** | **9,263** |

| Severity | Count |
|---|---:|
| CRITICAL | 143 |
| HIGH | 88 |
| INFO | 6,289 |
| LOW | 2 |
| MEDIUM | 2,741 |
| **Total** | **9,263** |

## Reviewed classification totals

These totals describe review findings, not raw CSV records; one reviewed finding may consolidate repeated ACL rows for one object family.

| Reviewed classification | Count | Meaning |
|---|---:|---|
| INPUT PASS | 10 | Integrity/completeness gates passed. |
| PLATFORM EXPECTED | 5 | Supabase/PostgreSQL-managed role, extension, auth, storage, and realtime families consistent with managed-platform operation. |
| PLATFORM MANUAL REVIEW | 3 | Platform-owned ACL/role posture should remain recorded and be compared with Supabase documentation/support; no local mutation is recommended. |
| AFEX CRITICAL | 4 | Legacy callable mutation/privileged function families require mandatory security remediation before activation. |
| AFEX REVIEW | 5 | Read helpers, trigger functions, table/RLS policy semantics, overloads, and nullable tenant columns require contract review. |
| DATA REVIEW | 7 | Non-zero readiness/backfill findings requiring later controlled packages. |
| PACKAGE 2R BLOCKER | 0 | No collision or immediate validation conflict was demonstrated. |
| PACKAGE 2R OPERATOR GATE | 3 | External review, backup/restore evidence, and explicit manual approval remain required before execution. |

## B. Platform-managed false-positive/expected findings

| CSV section_name | object_schema | object_name | attribute_name | attribute_value | Original status/severity | Reviewed classification | Rationale | Owning future package |
|---|---|---|---|---|---|---|---|---|
| ROLES_AND_ATTRIBUTES | role | `dashboard_user` | attributes | `CREATEDB, CREATEROLE, REPLICATION` | BLOCKED/CRITICAL | PLATFORM EXPECTED | Supabase dashboard role; not an AFEX application role or Package 2R collision. Do not alter locally. | Supabase platform |
| ROLES_AND_ATTRIBUTES | role | `supabase_etl_admin` | attributes | `BYPASSRLS, REPLICATION` | BLOCKED/CRITICAL | PLATFORM EXPECTED | Managed ETL role. Elevated attributes are platform-owned. | Supabase platform |
| ROLES_AND_ATTRIBUTES | role | `supabase_read_only_user` | attributes | `BYPASSRLS` | BLOCKED/CRITICAL | PLATFORM EXPECTED | Managed read-only tooling role; generic scanner intentionally overclassifies BYPASSRLS. | Supabase platform |
| ROLES_AND_ATTRIBUTES | role | `supabase_replication_admin` | attributes | `REPLICATION` | BLOCKED/CRITICAL | PLATFORM EXPECTED | Required managed replication role. | Supabase platform |
| FUNCTION_ACLS / TABLE_ACLS | auth, storage, realtime, extensions, graphql_public | managed function/table families | PUBLIC | EXECUTE/SELECT | BLOCKED/CRITICAL | PLATFORM EXPECTED WITH REVIEW | 91 of 127 blocked function ACL rows are outside `public`; two blocked table ACLs are `extensions.pg_stat_statements*`. These are managed-platform objects, not AFEX Package 2R objects. | Supabase platform |

## C. Platform-managed findings requiring manual review

| CSV section_name | object_schema | object_name | attribute_name | attribute_value | Original status/severity | Reviewed classification | Rationale | Owning future package |
|---|---|---|---|---|---|---|---|---|
| FUNCTION_ACLS | auth/storage/realtime/graphql_public | managed routines | PUBLIC/anon/authenticated | EXECUTE | BLOCKED or REVIEW | PLATFORM MANUAL REVIEW | Expected defaults are plausible, but the capture alone cannot prove that every ACL matches the current hosted Supabase release. Compare only through a separate Supabase-managed review; do not remediate in AFEX SQL. | Supabase platform review |
| TABLE_ACLS | extensions | `pg_stat_statements`, `pg_stat_statements_info` | PUBLIC | SELECT | BLOCKED/CRITICAL | PLATFORM MANUAL REVIEW | Extension-owned monitoring views; verify against platform baseline, not Package 2R. | Supabase platform review |
| READ_ONLY_SESSION_STATE | pg_catalog | transaction/session state | transaction_read_only | `off` | review/info | PLATFORM MANUAL REVIEW | Normal for SQL Editor metadata capture and not evidence that this report performed writes. | Operator evidence |

## D. AFEX public-schema critical findings

All functions below are owned by `postgres`. ACLs list effective grantees captured in `FUNCTION_ACLS`. “Blocks 2R” is **No** because Package 2R adds no runtime function or grant and Core V2 remains disabled; remediation is nevertheless mandatory before activation.

| Function identity | Security/search_path | Effective EXECUTE grantees | Intended class | Reviewed classification | Blocks 2R | Owning future package |
|---|---|---|---|---|---|---|
| `adjust_inventory_stock(uuid,uuid,uuid,numeric,text,text,uuid)` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | authorized inventory mutation | CRITICAL: browser/PUBLIC exposure | No | Package 5 / security |
| `create_invoice_with_items_safe(text,text,text,text,numeric,numeric,text,jsonb,text,uuid,uuid,uuid)` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | legacy invoice/order mutation | CRITICAL: browser/PUBLIC exposure | No | Package 5 / legacy cutoff |
| `create_invoice_with_items(jsonb,jsonb)` | INVOKER; default | PUBLIC, anon, authenticated, postgres, service_role | legacy invoice mutation | CRITICAL: callable mutation path | No | Package 5 / legacy cutoff |
| `create_invoice_with_items(text,text,text,text,numeric,numeric,text,json)` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | legacy invoice mutation | CRITICAL: browser/PUBLIC exposure | No | Package 5 / legacy cutoff |
| `create_invoice_with_items(text,text,text,text,numeric,numeric,text,jsonb)` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | legacy invoice mutation | CRITICAL: browser/PUBLIC exposure | No | Package 5 / legacy cutoff |
| `create_tenant_with_owner(text,uuid,text,text,text,text,text,text,numeric,boolean)` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | provider-controlled tenant creation | CRITICAL: privileged lifecycle exposure | No | Package 5 / security |
| `create_tenant_with_owner(text,uuid,text,text,text,text,text)` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | legacy tenant creation | CRITICAL: privileged lifecycle exposure | No | Package 5 / security |
| `ensure_branch_order_number_prefix(uuid)` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | controlled numbering mutation | CRITICAL: PUBLIC/anon mutation exposure | No | Package 5 / numbering security |
| `ensure_inventory_stock_for_catalog_item(uuid,uuid)` | DEFINER; default | PUBLIC, anon, authenticated, postgres, service_role | internal inventory mutation | CRITICAL: exposure plus unsafe default search path | No | Package 5 / security |
| `hash_pos_pin(text)` | DEFINER; `public, extensions` | PUBLIC, anon, authenticated, postgres, service_role | internal credential helper | CRITICAL: credential helper callable by PUBLIC/anon | No | Package 5 / POS security |
| `next_branch_monthly_order_number(uuid,uuid,timestamptz)` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | internal number allocation | CRITICAL: number allocation callable by PUBLIC/anon | No | Package 5 / numbering security |
| `purge_expired_deleted_branches()` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | scheduled destructive maintenance | CRITICAL: privileged maintenance exposure | No | Package 5 / worker grants |
| `restore_inventory_for_cancelled_invoice(uuid,uuid)` | DEFINER; `public` | PUBLIC, anon, authenticated, postgres, service_role | authorized inventory restoration | CRITICAL: browser/PUBLIC exposure | No | Package 5 / security |
| `set_pos_pin(text,uuid)` | DEFINER; `public, extensions` | PUBLIC, anon, authenticated, postgres, service_role | authorized PIN mutation | CRITICAL: credential mutation exposure | No | Package 5 / POS security |
| `update_inventory_low_stock_threshold(uuid,uuid,uuid,numeric)` | DEFINER; default | PUBLIC, anon, authenticated, postgres, service_role | authorized inventory configuration | CRITICAL: exposure plus unsafe default search path | No | Package 5 / security |

The CSV also shows `create_support_ticket_atomic(...)`, `get_provider_support_operational_dashboard(...)`, `get_eligible_developer_support_notification_events(...)`, and `verify_pos_pin_for_actor(...)` without `PUBLIC` grants. Their role grants and DEFINER validation remain review items, but they are materially narrower than the functions above.

## E. AFEX public-schema review findings

| CSV section_name | object_schema | object_name | attribute_name | attribute_value | Original status/severity | Reviewed classification | Rationale | Owning future package |
|---|---|---|---|---|---|---|---|---|
| FUNCTION_ACLS | public | `afex_can_pos(text)`, `afex_is_employee(text)`, `afex_is_full_admin(text)`, `current_user_role()`, `is_admin()`, `validate_password_policy(text)` | PUBLIC | EXECUTE | BLOCKED/CRITICAL | AFEX REVIEW | INVOKER/read-validation helpers are not equivalent to DEFINER mutation functions, but PUBLIC/anon necessity must be explicitly proven. | Package 5 |
| FUNCTION_ACLS | public | `current_profile_role()` | PUBLIC | EXECUTE | BLOCKED/CRITICAL | AFEX REVIEW-HIGH | DEFINER role helper exposes authorization-derived data; verify claims/profile isolation and revoke unnecessary callers. | Package 5 |
| FUNCTION_ACLS | public | trigger functions (`deduct_inventory_on_invoice_item_insert`, `set_*`, `rls_auto_enable`) | PUBLIC | EXECUTE | BLOCKED/CRITICAL | AFEX REVIEW-HIGH | Trigger use does not make direct EXECUTE safe. Direct caller grants should be removed unless proven necessary. | Package 5 |
| FUNCTION_ACLS | public | `generate_invoice_number()`, `generate_order_number()` | PUBLIC | EXECUTE | BLOCKED/CRITICAL | AFEX REVIEW-HIGH | INVOKER numbering helpers still require callable-contract review and sequence privilege review. | Package 5 |
| FUNCTION_SEARCH_PATH_CONFIG | public | four DEFINER functions | proconfig | `DEFAULT` | WARNING/HIGH | AFEX REVIEW-HIGH | `deduct_inventory_on_invoice_item_insert`, `ensure_inventory_stock_for_catalog_item`, `get_branch_inventory`, and `update_inventory_low_stock_threshold` lack a pinned safe search path. | Package 5 |
| UNEXPECTED_OVERLOADS | public | `create_invoice_with_items`, `create_tenant_with_owner` | overload_count | `3`, `2` | REVIEW/HIGH | AFEX REVIEW-HIGH | Known legacy overloads, not future-contract collisions; each signature needs explicit retirement/security mapping. | Package 5 / activation |
| TABLES_WITH_RLS_ENABLED / RLS_POLICIES | public | 31 base tables | RLS/policies | enabled / 66 policies | INFO/REVIEW | AFEX REVIEW | RLS presence is confirmed but policy predicates must be validated; RLS alone is not a security conclusion. | Package 5 |
| COLUMN_NULLABILITY | public | 14 tenant-owned tables | tenant_id | NULLABLE | INFO/INFO | AFEX REVIEW-HIGH | Actual readiness counts show no missing tenant on customers/orders/invoices/items, but schema nullability remains a future enforcement issue. | Package 3 / gated enforcement |
| TABLE_ACLS | public | public application tables | anon/authenticated/service_role | multiple privileges | REVIEW/MEDIUM | AFEX REVIEW-HIGH | Broad effective grants require policy-by-policy review, especially financial and inventory write paths. Package 2R adds no such grants. | Package 5 |

## F. Data-integrity findings

| CSV section_name | object_schema | object_name | attribute_name | attribute_value | Original status/severity | Reviewed classification | Rationale | Owning future package |
|---|---|---|---|---:|---|---|---|---|
| DATA_READINESS_COUNTS | public | `branch_prefix_missing_or_invalid` | count | 5 | REVIEW/HIGH | DATA REVIEW | Must be resolved before strict numbering enforcement; Package 2R does not backfill or validate this rule. | Package 3 / activation gate |
| DATA_READINESS_COUNTS | public | `customer_normalized_identity_duplicate_groups` | count | 2 | REVIEW/HIGH | DATA REVIEW | Same-tenant normalized duplicates prevent later identity uniqueness, but do not block nullable column creation. No automatic merge/delete is allowed. | Customer remediation + Package 3 |
| DATA_READINESS_COUNTS | public | `customers_phone_normalized_candidates` | count | 10 | REVIEW/HIGH | EXPECTED BACKFILL | All 10 customer rows are candidates because the foundation values are not populated yet. | Package 3 |
| DATA_READINESS_COUNTS | public | `customers_record_version_candidates` | count | 10 | REVIEW/HIGH | EXPECTED BACKFILL | Version initialization is deferred and does not block Package 2R. | Package 3 |
| DATA_READINESS_COUNTS | public | `inventory_record_version_candidates` | count | 4 | REVIEW/HIGH | EXPECTED BACKFILL | Version initialization is deferred. | Package 3 |
| DATA_READINESS_COUNTS | public | `invoice_items_missing_core_snapshot_evidence` | count | 321 | REVIEW/HIGH | LEGACY DATA REVIEW | Expected legacy snapshot gaps; Package 2R foundation must keep new columns nullable. | Package 3 / financial verification |
| DATA_READINESS_COUNTS | public | `invoices_missing_core_snapshot_evidence` | count | 216 | REVIEW/HIGH | LEGACY DATA REVIEW | Expected legacy rows, not corruption by itself. | Package 3 / financial verification |
| DATA_READINESS_COUNTS | public | `orders_missing_core_snapshot_evidence` | count | 216 | REVIEW/HIGH | LEGACY DATA REVIEW | Expected legacy rows, not corruption by itself. | Package 3 / financial verification |
| DATA_READINESS_COUNTS | public | `invoice_order_number_mismatches` | count | 148 | REVIEW/HIGH | DATA REVIEW | Historical numbering relationship requires reconciliation before a strict equality assertion; Package 2R does not enforce equality. | Package 3 / activation verification |
| DATA_READINESS_COUNTS | public | `low_stock_count` | count | 1 | REVIEW/MEDIUM | INFO | Operational stock state, not data corruption. | Inventory operations |
| DATA_READINESS_COUNTS | public | missing tenant/orphan/duplicate number/negative stock/null stock/sequence errors | count | 0 | INFO/INFO | PASS | No captured blocker in these categories. | Package 1R-S2 |
| INVALID_NOT_READY_INDEX_SUMMARY | n/a | `invalid_index_count`, `not_ready_index_count` | count | 0 / 0 | PASS/CRITICAL | PASS | No invalid or unfinished indexes detected. | Package 1R-S2 |

## G. Package 2R collision/compatibility matrix

| CSV section_name | object_schema | object_name | attribute_name | attribute_value | Original status/severity | Reviewed classification | Rationale | Owning future package |
|---|---|---|---|---|---|---|---|---|
| EXISTING_CORE_V2_TABLES | n/a | future Core V2 table set | result_count | 0 | EMPTY/INFO | COMPATIBLE | No existing `financial_quotes`, `idempotency_commands`, or `atomic_outbox` collision. | Package 2R |
| EXISTING_CORE_V2_FUNCTIONS | n/a | future Core V2 functions | result_count | 0 | EMPTY/INFO | COMPATIBLE | Package 2R creates no runtime functions; no future-function collision found. | Package 2R |
| EXISTING_CORE_V2_TRIGGERS | n/a | future Core V2 triggers | result_count | 0 | EMPTY/INFO | COMPATIBLE | No future-trigger collision found. | Package 2R |
| EXISTING_CORE_V2_POLICIES | n/a | future Core V2 policies | result_count | 0 | EMPTY/INFO | COMPATIBLE | No future-policy collision found. | Package 2R |
| EXISTING_CORE_V2_ROLES | n/a | future Core V2 roles | result_count | 0 | EMPTY/INFO | COMPATIBLE | No future-role collision found. | Package 2R |
| ACTIVATION_CONFIGURATION_OBJECTS | n/a | activation objects | result_count | 0 | EMPTY/INFO | COMPATIBLE | Core V2 is not activated and no activation collision exists. | Package 6 |
| FINAL_BLOCKING_SUMMARY | n/a | `unexpected_core_v2_object_count` | count | 0 | PASS/HIGH | COMPATIBLE | Confirms no unexpected future-contract object. | Package 2R |
| FINAL_BLOCKING_SUMMARY | n/a | `unexpected_overload_count` | count | 0 | PASS/HIGH | COMPATIBLE | Known legacy overloads do not match blocked future-contract overload criteria. | Package 2R |
| FINAL_BLOCKING_SUMMARY | n/a | `missing_baseline_dependency_count` | count | 0 | PASS/CRITICAL | COMPATIBLE | Required baseline dependencies were found. | Package 2R |
| INVALID_NOT_READY_INDEX_SUMMARY | n/a | index readiness | count | 0 | PASS/CRITICAL | COMPATIBLE | No existing invalid/not-ready index condition shown. | Package 2R |
| DATA_READINESS_COUNTS | public | nullable/backfill candidates | multiple counts | non-zero | REVIEW/HIGH | COMPATIBLE WITH DEFERRED WORK | Package 2R adds nullable foundation columns and NOT VALID constraints where documented; it does not backfill or immediately enforce future data. | Package 3 |
| PUBLIC_EXPOSURE_SUMMARY | n/a | `public_exposure_count` | count | 129 | BLOCKED/CRITICAL | LEGACY RISK, NOT 2R COLLISION | Package 2R adds no runtime grant and does not widen the legacy exposure. Mandatory Package 5 remediation remains a hard activation gate. | Package 5 |

Package 2R structural compatibility result: **PASS FOR CONTROLLED RUN-CARD REVIEW ONLY**.

## H. Deferred mandatory remediation map

| CSV section_name | object_schema | object_name | attribute_name | attribute_value | Original status/severity | Reviewed classification | Rationale | Owning future package |
|---|---|---|---|---|---|---|---|---|
| FUNCTION_ACLS | public | privileged/mutating DEFINER functions | PUBLIC/anon | EXECUTE | BLOCKED/CRITICAL | MANDATORY BEFORE ACTIVATION | Revoke unintended callers and establish exact server/trigger/browser contracts. | Package 5 |
| FUNCTION_SEARCH_PATH_CONFIG | public | four DEFINER functions | proconfig | DEFAULT | WARNING/HIGH | MANDATORY BEFORE ACTIVATION | Pin safe search paths and re-review definitions. | Package 5 |
| TABLE_ACLS / RLS_POLICIES | public | financial, customer, inventory tables | grants/predicates | captured ACL/policy text | REVIEW/MEDIUM | MANDATORY BEFORE ACTIVATION | Prove deny-by-default tenant/branch isolation and remove excess grants. | Package 5 |
| DATA_READINESS_COUNTS | public | normalized customer identity | duplicate groups | 2 | REVIEW/HIGH | MANDATORY BEFORE IDENTITY ENFORCEMENT | Manual evidence-led resolution; never cross-tenant merge or automatic delete. | Customer remediation / Package 3 |
| DATA_READINESS_COUNTS | public | branch prefixes | missing_or_invalid | 5 | REVIEW/HIGH | MANDATORY BEFORE NUMBERING ENFORCEMENT | Resolve business-approved prefixes before activation. | Package 3 / activation |
| DATA_READINESS_COUNTS | public | legacy financial snapshots | missing evidence | 216 orders, 216 invoices, 321 items | REVIEW/HIGH | MANDATORY BEFORE SNAPSHOT ENFORCEMENT | Controlled backfill/evidence policy is required; nullable foundation remains compatible. | Package 3 / verification |
| DATA_READINESS_COUNTS | public | invoice/order number relationship | mismatch count | 148 | REVIEW/HIGH | MANDATORY BEFORE EQUALITY ENFORCEMENT | Reconcile whether mismatches are valid legacy history or remediation candidates. | Package 3 / verification |
| UNEXPECTED_OVERLOADS | public | legacy overloads | overload_count | 3 and 2 | REVIEW/HIGH | MANDATORY BEFORE LEGACY CUTOFF | Freeze callers, exact signatures, and retirement order. | Package 5 / Package 6 |

## I. Exact Package 2R execution blockers

| CSV section_name | object_schema | object_name | attribute_name | attribute_value | Original status/severity | Reviewed classification | Rationale | Owning future package |
|---|---|---|---|---|---|---|---|---|
| Package 2R operator gate | n/a | external package review | approval | not supplied in this evidence | n/a | EXECUTION GATE | This decision authorizes preparing a controlled run card only, not executing Package 2R. | External reviewer/operator |
| Package 2R operator gate | n/a | backup and restore evidence | state | not evidenced by CSV | n/a | EXECUTION GATE | A current verified backup/restore path and rollback authority must exist immediately before any Production execution. | Package 12 / operator |
| Package 2R operator gate | n/a | transaction/lock window | state | not scheduled | n/a | EXECUTION GATE | Package must run in its reviewed explicit transaction under an approved maintenance/run-card window. | Package 2R operator |

No schema/data blocker intrinsic to the reviewed Package 2R foundation was demonstrated. The three rows above block **execution now**, but do not block preparing Package 2R for controlled external review.

## J. Exact non-blocking legacy risks

| CSV section_name | object_schema | object_name | attribute_name | attribute_value | Original status/severity | Reviewed classification | Rationale | Owning future package |
|---|---|---|---|---|---|---|---|---|
| FUNCTION_ACLS | public | 36 AFEX functions | PUBLIC | EXECUTE | BLOCKED/CRITICAL | NON-BLOCKING TO 2R; SECURITY BLOCKER TO ACTIVATION | Existing exposure is not widened by nullable tables/columns with no runtime grants. | Package 5 |
| SERVICE_ROLE_EXPOSURE_SUMMARY | mixed | service-role effective grants | count | 370 | REVIEW/MEDIUM | NON-BLOCKING TO 2R | Service-role access is expected in part; exact least-privilege mapping remains mandatory. | Package 5 |
| COLUMN_NULLABILITY | public | tenant-owned legacy tables | tenant_id | NULLABLE | INFO/INFO | NON-BLOCKING TO 2R | Captured critical row sets have zero missing tenant IDs; later NOT NULL/FK gates remain separate. | Package 3 / enforcement |
| LEGACY_MUTATION_PATHS | public | nine customer/invoice/order triggers | legacy_table | customers/invoice_items/invoices/orders | REVIEW/HIGH | NON-BLOCKING TO 2R | Package 2R neither removes nor activates these paths; coexistence and cutoff are later gates. | Package 5 / Package 6 |
| UNEXPECTED_OVERLOADS | extensions/realtime | managed overload families | overload_count | 2–3 | REVIEW/HIGH | PLATFORM/NON-BLOCKING | Expected extension/platform overloads and unrelated to Package 2R names. | Supabase platform |
| DATA_READINESS_COUNTS | public | `low_stock_count` | count | 1 | REVIEW/MEDIUM | OPERATIONAL INFO | Low stock is a business state, not corruption. | Inventory operations |

## Public table and isolation conclusion

- The report captures 32 `public` table-like objects; 31 base tables have RLS enabled. The one unmatched object is `inventory_movements_view`, a view, so the count does not demonstrate a base table with RLS disabled.
- Sixty-six public policies are present. This is evidence of policy existence, not proof of correct tenant/branch isolation.
- `anon`, `authenticated`, and `service_role` table privileges are extensive. Exact policy predicates and write grants remain a mandatory Package 5 review.
- Zero missing tenant IDs were reported for customers, orders, invoices, and invoice items; zero orphans were reported for the reviewed order/invoice chains.
- Package 2R adds no runtime grants, does not activate Core V2, and does not change existing application behavior.

## Final decision

**PACKAGE 1R OUTPUT APPROVED — CONTINUE TO CONTROLLED PACKAGE 2R REVIEW**

Basis:

1. The corrected authoritative CSV is complete, parseable, and hash-recorded.
2. The report SQL hash matches the frozen expected value.
3. No Core V2 table, function, trigger, policy, role, or activation-object collision was detected.
4. No invalid/not-ready indexes or missing baseline dependencies were detected.
5. The non-zero readiness findings are compatible with Package 2R's nullable, additive, non-activating design and are assigned to later controlled packages.
6. Genuine AFEX legacy security risks remain mandatory Package 5/activation blockers, but Package 2R does not widen them.
7. Core V2 remains disabled.
8. This approval authorizes only preparation of the controlled Package 2R run card for external review. It does not authorize SQL execution.

## Confirmations

- SQL was not executed.
- No database connection was made.
- The Production CSV was not modified.
- No SQL file was modified.
- Only this reviewer-decision Markdown file was created at the corrected evidence path.
- No application file was modified.
- No migration was created or applied.
- No commit was created.
- No push was performed.

READY FOR EXTERNAL PACKAGE 1R OUTPUT REVIEW
