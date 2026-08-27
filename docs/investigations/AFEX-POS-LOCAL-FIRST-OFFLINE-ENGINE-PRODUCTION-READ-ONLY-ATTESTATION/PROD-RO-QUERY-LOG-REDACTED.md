# Redacted Read-Only Query Log

No literal credential, endpoint, row identity, phone, email, PIN, payment detail, or business payload is recorded. Every database query category below used an explicit read-only transaction and rollback.

| ID | Category | Purpose | Output retained | Result |
| --- | --- | --- | --- | --- |
| Q01 | Project inventory/detail API | prove AFEX Production target, region, health, version | safe project ref and metadata | PASS |
| Q02 | Migration history API | identify deployed migration versions/names | three version/name pairs | PASS |
| Q03 | session/database/role catalog | prove database, principal, read-only transaction, search path, capabilities | non-secret identity/capability metadata | PASS |
| Q04 | role catalog | classify application/platform roles | role flags only | PASS |
| Q05 | schema/relation catalog | inventory relevant objects, owners, RLS/force-RLS | names and structural flags | PASS |
| Q06 | bounded Core aggregates | validate deployed ledger usage without row contents | counts and state counts only | PASS |
| Q07 | ACL and policy catalog | inspect raw/effective privileges and policy expressions | ACLs, policy names/roles/predicates | PASS |
| Q08 | function catalog | inspect signatures, result, owner, security mode, configuration, execute roles | MD5 of deployed definitions and metadata | PASS |
| Q09 | trigger/constraint/index catalog | inspect atomicity, numbering, inventory, payment, POS session structure | definitions without row data | PASS |
| Q10 | capability-name catalog | search for device/review/effect/refund/cancel concepts | object names only | PASS |
| Q11 | bounded payment aggregate | compare constraint and observed canonical vocabulary | method/count aggregate only | PASS |
| Q12 | statistics and lock catalog | assess size, scans, dead tuples, active relation locks | aggregate statistics only | PASS; targeted locks 0 |
| Q13 | Supabase security advisors | identify RLS/function exposure findings | categories, counts, remediation links | PASS |
| Q14 | Supabase performance advisors | identify index/RLS evaluation findings | categories, counts, remediation links | PASS |
| Q15 | capability probe with absent device column | prove no assumed device field | SQLSTATE 42703 only; no rows | EXPECTED ABSENCE |
| Q16 | first performance aggregation draft | catalog-only attempt | SQLSTATE 42803 only; corrected without mutation | SAFE QUERY ERROR |
| Q17 | first command-state aggregate draft | catalog mismatch probe | SQLSTATE 42703 only; corrected to deployed `execution_status` | SAFE QUERY ERROR |

Forbidden operations executed: 0. Write locks intentionally requested: 0. Business tables scanned for row content: 0. Full function bodies retained in evidence: 0. Provider calls: 0.
