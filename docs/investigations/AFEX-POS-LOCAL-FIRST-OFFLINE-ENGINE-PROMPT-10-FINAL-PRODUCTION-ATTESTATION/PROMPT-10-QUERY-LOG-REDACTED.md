# Prompt 10 redacted query log

All timestamps are UTC. `rows` counts result rows returned by the tool, not scanned business rows.

| ID | Class | Objects/read | Purpose | Start | End | Success | Rows | Business rows accessed | Read-only proof | Redaction |
|---|---|---|---|---|---|---:|---:|---|---|---|
| P10-M001 | CATALOG_ONLY | Supabase project metadata | Definitive non-secret Production identity | 2026-08-26T09:35:42.856Z | 2026-08-26T09:35:43.892Z | YES | 1 project identity | NO | management-plane metadata read | host/credentials omitted |
| P10-M002 | CATALOG_ONLY | extension metadata | Installed extension names/versions | 2026-08-26T09:27:46.791Z | 2026-08-26T09:27:49.751Z | YES | 1 extension list | NO | management-plane metadata read | names/versions only |
| P10-Q001 | CATALOG_ONLY | server/session settings | Database/version/role/read-only proof | 2026-08-26T09:28:16.934Z | 2026-08-26T09:28:18.952Z | YES | 1 | NO | transaction_read_only=true | connection details omitted |
| P10-Q002 | CATALOG_ONLY | pg_roles, pg_auth_members | Role topology | 2026-08-26T09:28:18.952Z | 2026-08-26T09:28:22.136Z | YES | 1 | NO | explicit READ ONLY + ROLLBACK | catalog only |
| P10-Q003 | CATALOG_ONLY | pg_namespace, pg_default_acl, pg_roles | Schema owners/ACL/default ACL | 2026-08-26T09:28:22.136Z | 2026-08-26T09:28:23.924Z | YES | 1 | NO | explicit READ ONLY + ROLLBACK | catalog only |
| P10-Q004 | CATALOG_ONLY | pg_class, pg_namespace, pg_roles | Relevant relations/RLS flags/size estimates | 2026-08-26T09:29:02.878Z | 2026-08-26T09:29:04.889Z | YES | 1 | NO | explicit READ ONLY + ROLLBACK | catalog only |
| P10-Q005 | CATALOG_ONLY | pg_attribute, pg_attrdef, pg_constraint, pg_index, pg_trigger, pg_proc | Structure/keys/indexes/triggers | 2026-08-26T09:30:13.182Z | 2026-08-26T09:30:15.838Z | YES | 1 | NO | explicit READ ONLY + ROLLBACK | definitions only |
| P10-Q006 | CATALOG_ONLY | pg_policy, pg_class, pg_namespace | RLS expressions | 2026-08-26T09:31:24.372Z | 2026-08-26T09:31:26.309Z | YES | 1 | NO | explicit READ ONLY + ROLLBACK | policy metadata only |
| P10-Q007 | CATALOG_ONLY / ALLOWLIST_GATE_FAIL | pg_proc, pg_namespace, pg_roles, **pg_language (not allowlisted)** | Function signature/owner/ACL/properties/body MD5 | 2026-08-26T09:31:26.311Z | 2026-08-26T09:31:28.399Z | SQL succeeded; Prompt gate failed | 1 | NO | explicit READ ONLY + ROLLBACK | no function body returned or executed |
| P10-Q008 | CATALOG_ONLY | pg_depend, pg_proc, pg_class, pg_namespace | Declared dependency edges | 2026-08-26T09:31:28.400Z | 2026-08-26T09:31:33.824Z | YES | 1 | NO | explicit READ ONLY + ROLLBACK | catalog only |
| P10-Q009 | PRIVILEGE_ONLY | pg_roles/namespaces/classes/procs + has_*_privilege | Effective ACL reachability | 2026-08-26T09:32:38.365Z | 2026-08-26T09:32:40.295Z | YES | 1 | NO | explicit READ ONLY + ROLLBACK | booleans only |
| P10-Q010 | AGGREGATE_INTEGRITY_ONLY | public.branches, public.tenants | Null/duplicate/orphan counts | 2026-08-26T09:32:40.298Z | 2026-08-26T09:32:42.336Z | YES | 1 | YES, aggregate only | explicit READ ONLY + ROLLBACK | counts only; no IDs |
| P10-Q011 | AGGREGATE_INTEGRITY_ONLY | public.invoices.payment_method | Stored payment vocabulary counts | 2026-08-26T09:32:42.336Z | 2026-08-26T09:32:45.719Z | YES | 1 | YES, aggregate only | explicit READ ONLY + ROLLBACK | category/count only |
| P10-Q007R | CATALOG_ONLY | pg_proc, pg_namespace, pg_roles | Allowlisted function signature/owner/ACL/properties/body identity correction | 2026-08-26T10:17:15.847Z | 2026-08-26T10:17:18.073Z | YES | 1 (36 functions) | NO | transaction_read_only=true + ROLLBACK | catalog only; body MD5/length, no body text; authorization expired |

A preliminary non-SQL project-list lookup was used solely to gate the target before the frozen SQL plan; `P10-M001` repeated and definitively logged that identity. No unplanned SQL was executed.

Final audit result: historical `P10-Q007` remains an allowlist failure because of `pg_language`. The single separately authorized `P10-Q007R` request corrected the evidence using only `pg_proc`, `pg_namespace`, and `pg_roles`; it returned 36/36 matching identities and security properties, proved `transaction_read_only=true`, and completed with `ROLLBACK`. No other request was made under the correction authorization, which has expired.
