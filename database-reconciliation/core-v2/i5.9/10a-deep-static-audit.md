# AFEX Core V2 — Package 10-A Deep Static Audit

## Audit boundary

This is a static, source-to-source audit only. No SQL was executed, no database
was contacted, and no runtime or clean-install result is claimed.

Audited artifacts:

- `01-read-only-preflight.sql` (1R)
- `02-schema-foundation.sql` (2R)
- `02b-existing-table-indexes.sql` (2B)
- `03-backfill.sql` (3R)
- `10-clean-install-runtime.sql` (Package 10)
- approved immutable sources 2B-S, 4T, 5R-B, 6-Sync, 6A-B, 6B and 7-Sync

## 1. Hash precheck

| Artifact | SHA-256 | Result |
|---|---|---|
| 1R | `8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a` | MATCH |
| 2R | `01348e1f7c3eae61b1478b56e1e1c9e87c52e480beb33b582bff3e5f49a5551b` | MATCH |
| 2B | `c69d3280e64a4742bffac5827b8171307e663eb81c1cf9617aed9ee694ac59c6` | MATCH |
| 2B-S | `009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d` | MATCH |
| 3R | `58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208` | MATCH |
| 4T | `40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7` | MATCH |
| 5R-B | `eb5ad92396a57022f35cd7a58f6c6f85e7ea735c3306f40040c084e82ecb13b7` | MATCH |
| 6-Sync | `06b7c27a249b07d0fc58c8e22dd046376a85fb7e507a050a9d33f10e1c8205e3` | MATCH |
| 6A-B | `30875dfdff59eda1aec4254d6ce1e610e09bfdf857506f682f9e8c8bae3f3a08` | MATCH |
| 6B | `46c0db2c04a2f48dd1519f72a8f627ca2ceae3ad0ad6af21a7897bc2bc3914ff` | MATCH |
| 7-Sync | `d7c19fac7b822efc93c89a30b5af43e67e37bd5a9d40027968ec0525530a652a` | MATCH |
| Package 10 | `fb05a583a9c827746650b73dc651c93dfa456700b99b5fc774e470b5604be68a` | MATCH |

No unexpected artifact was modified.

## 2. Package 1R audit

### Statement and behavior review

- The active statements are metadata/catalog `SELECT` queries and CTEs.
- No `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, `UPDATE`, `DELETE`,
  `MERGE`, `COPY FROM`, `CALL`, mutating `DO`, role operation, grant, revoke,
  evidence insertion, activation statement, temporary object, advisory lock or
  explicit row lock exists.
- Function calls are catalog/introspection operations such as `pg_get_*`,
  `format_type`, ACL expansion and deterministic expressions. No application
  mutator or user-defined business function is invoked.
- It inspects session/environment identity, schema objects, functions,
  triggers, policies and ACL metadata.
- Tenant-scoped duplicate and consistency findings remain separated.
- It can perform full scans and aggregate scans over baseline tables; this is an
  operational performance consideration, not a state mutation.
- It may expose customer/order/inventory identifiers to the privileged reviewer,
  but does not select secrets, credentials or authentication rows.
- It assumes the reconciled Production baseline object names and PostgreSQL 17
  catalogs.

Decision: **APPROVED FOR EXTERNAL HASH ATTESTATION**.

## 3. Package 2R audit

### Active object inventory

- Creates three empty tables: `financial_quotes`, `idempotency_commands`,
  `atomic_outbox`.
- Adds nullable Core V2 columns to `customers`, `orders`, `invoices`,
  `invoice_items`, `inventory_stock`, `inventory_movements`, and `audit_logs`.
- Adds canonical CHECK constraints. Existing-table constraints are `NOT VALID`.
- Adds 17 foreign keys; existing-table foreign keys are `NOT VALID`, all use
  `NO ACTION`.
- Adds `uq_atomic_outbox_event_id`.
- Creates 13 indexes on the three new tables.
- Uses one explicit `BEGIN` and one `COMMIT`.
- Contains no business DML, trigger, policy, function, role, grant, activation,
  destructive drop or cascade.

### Baseline assumptions

It requires the baseline tables and referenced columns for tenants, branches,
customers, orders, invoices, invoice items, inventory stock/movements and audit
logs, plus `gen_random_uuid()`/pgcrypto availability.

### Safety findings

- Column, table, default, primary-key, CHECK and FK definitions are verified
  before accepting existing objects.
- Nullable additions and `NOT VALID` constraints reduce rewrite/scan risk, but
  still acquire brief `ACCESS EXCLUSIVE` locks.
- New-table FK creation and unique/index creation are safe only while the new
  tables remain empty as designed.
- No destructive behavior or silent data overwrite was found.

### Blocking defect 2R-01

The `verify_new_table_indexes` block checks table, uniqueness, key columns and
predicate, but does **not** verify `pg_index.indisvalid` or
`pg_index.indisready`. Subsequent `CREATE INDEX IF NOT EXISTS` can silently
accept an invalid or unfinished index bearing the expected name. This violates
the required partial-run/rerun fail-closed contract.

### Secondary hardening gap 2R-02

The named-index check does not detect an equivalent index under another name.
On a clean new table this is normally absent, but the package explicitly
supports inspection of pre-existing objects and therefore cannot prove that it
will avoid redundant indexes in a partial/manual recovery state.

Decision: **REQUIRES AMENDMENT**.

## 4. Package 2B audit

### Concurrent index inventory

| Index | Table | Keys | Predicate |
|---|---|---|---|
| `idx_customers_tenant_phone_normalized` | customers | tenant_id, phone_normalized | phone_normalized IS NOT NULL |
| `idx_orders_idempotency_command` | orders | idempotency_command_id | idempotency_command_id IS NOT NULL |
| `idx_orders_correlation` | orders | correlation_id | correlation_id IS NOT NULL |
| `idx_invoices_financial_quote` | invoices | financial_quote_id | financial_quote_id IS NOT NULL |
| `idx_invoices_request_fingerprint` | invoices | tenant_id, request_fingerprint | request_fingerprint IS NOT NULL |
| `idx_invoices_quote_fingerprint` | invoices | tenant_id, quote_fingerprint | quote_fingerprint IS NOT NULL |
| `idx_inventory_movements_order` | inventory_movements | order_id | order_id IS NOT NULL |
| `idx_inventory_movements_invoice` | inventory_movements | invoice_id | invoice_id IS NOT NULL |
| `idx_inventory_movements_invoice_item` | inventory_movements | invoice_item_id | invoice_item_id IS NOT NULL |
| `idx_inventory_movements_correlation` | inventory_movements | tenant_id, correlation_id, created_at | correlation_id IS NOT NULL |
| `idx_audit_logs_order` | audit_logs | order_id | order_id IS NOT NULL |
| `idx_audit_logs_invoice` | audit_logs | invoice_id | invoice_id IS NOT NULL |
| `idx_audit_logs_customer` | audit_logs | customer_id | customer_id IS NOT NULL |
| `idx_audit_logs_correlation` | audit_logs | tenant_id, correlation_id, created_at | correlation_id IS NOT NULL |

All 14 builds are outside explicit transactions. No DML, grant, function,
trigger, policy or activation exists. Tenant-leading keys are present where
queries are tenant-scoped; direct globally unique FK identifiers reasonably do
not add a redundant tenant prefix.

### Blocking defect 2B-01

The precheck does not read or verify `indisvalid` and `indisready`. An invalid
artifact from a failed concurrent build can pass the named-definition test, and
`CREATE INDEX CONCURRENTLY IF NOT EXISTS` then emits a notice instead of
repairing or failing safely.

### Blocking defect 2B-02

The package checks only the expected index name. It does not search all indexes
on each table for an equivalent key/predicate definition under a different
name, so it cannot rule out redundant index creation.

### Operational risk

Concurrent builds avoid long write blocking but can consume substantial I/O,
CPU, temporary storage and time on large Production tables. Each statement has
an independent partial-run state; the package needs explicit invalid-index
detection and operator STOP/remediation guidance.

Decision: **REQUIRES AMENDMENT**.

## 5. Package 3R audit

### Active mutations

1. Bounded `customers` update:
   - at most 1,000 locked rows;
   - only rows where `phone_normalized IS NULL`;
   - derives the canonical Saudi phone without overwriting `phone`;
   - supports Western, Arabic-Indic and Eastern Arabic-Indic digits;
   - no cross-tenant merge, delete or reassignment.
2. Bounded `customers` version update:
   - at most 1,000 rows;
   - only `record_version IS NULL`;
   - writes the initial value `1`.
3. Bounded `inventory_stock` version update:
   - at most 1,000 rows;
   - only `record_version IS NULL`;
   - writes the initial value `1`.
4. Standalone unique concurrent index:
   - `(tenant_id, phone_normalized)`;
   - partial predicate `phone_normalized IS NOT NULL`.
5. Three constraint validations:
   - customer normalized phone;
   - customer record version;
   - inventory record version.

There are no inserts, deletes, merges, financial snapshot recomputations,
sequence changes, order/invoice mutations, customer merges or fixture writes.

### Gates and rerun behavior

- Preflight blocks missing tenant identity, invalid phones, normalization
  conflicts, same-tenant canonical duplicates, invalid versions and unexpected
  Core V2 markers.
- Batches use `FOR UPDATE SKIP LOCKED`, deterministic ID ordering, a 1,000-row
  limit and null-only predicates.
- Re-execution is idempotent for completed rows.
- The concurrent unique-index section has explicit readiness and
  `indisvalid`/`indisready` verification and requires manual skipping when the
  exact index already exists.
- Constraint validation scans can be expensive and require approved
  low-traffic execution windows.
- Rollback is not automatic. Derived null-only writes are reconstructable, but
  reverting them would be a separately reviewed data change.

Package 3R is structurally required for the baseline-to-clean-install path, but
its row mutations are conditional: empty/test databases update zero rows;
legacy baseline databases require repeated bounded batches until postchecks
reach zero.

Decision: **APPROVED FOR EXTERNAL HASH ATTESTATION**.

## 6. Package 10 manifest verification

Parsed rows and actual destination objects:

| Type | Manifest | Destination |
|---|---:|---:|
| Roles | 6 | 6 |
| Tables | 7 | 7 |
| Indexes | 5 | 5 |
| Functions | 39 | 39 |
| Triggers | 7 | 7 |
| Policies | 23 | 23 |
| **Total** | **87** | **87** |

All 87 source files exist, all claimed starting lines point to the named
objects, every destination object has one row, and no Package 7 object was
copied.

### Blocking manifest defect 10-01

Each object row records one starting line (for example `|249|`) rather than the
required complete source line range. Most definitions span multiple lines.
Consequently, transformation traceability is incomplete even though the
starting-line/object association is correct. All 87 object rows require exact
`start-end` ranges. The global transformation rows do not repair the missing
per-object ranges.

No untraceable source package was found, but the manifest does not yet satisfy
the frozen traceability contract.

## 7. Function signature and normalized-body audit

Independent extraction found exactly 39 source functions and 39 composed
functions. There are no omitted or introduced overloads.

The normalized comparison preserves tokens, identifiers, literals, operators,
SQLSTATEs, exception order, permission filters, tenant/branch filters,
financial/inventory operations, idempotency, quote validation, audit/outbox
behavior and activation checks. It ignores only `OR REPLACE` and insignificant
statement whitespace.

| Function | Source normalized SHA-256 | Composed normalized SHA-256 | Result |
|---|---|---|---|
| acquire_idempotency_command_v2 | `ab37e77b76c093333a3fe7c8a8d4f2345351b439839124ba0e1f4511d1ab85e1` | same | MATCH |
| allocate_branch_monthly_number_v2 | `f13ed00b824274fb2eca064197c2e6908aaabefbc088b77c59abbeb4ec276ca2` | same | MATCH |
| apply_inventory_mutations_v2 | `fdaff565572f76b4f3d35fd6a666247c63c94d809502adc9a1841d5a2ebc6ae3` | same | MATCH |
| assert_atomic_legacy_triggers_safe_v2 | `c34b5d04224dcdcd6a7eea5bbc3eb4f8c2bb0cef6ded745ffcd00c798fed5560` | same | MATCH |
| atomic_semantic_event_uuid_v1 | `6423ee0f31167e5bd096aaa42c004ba6f662ac8e364e4f24a6b0feb83d946d94` | same | MATCH |
| build_atomic_order_response_v1 | `de3c54052d8670303af83ec5750a4a04986e46ff461b8973f3a5ff23a23d49b7` | same | MATCH |
| build_atomic_request_fingerprint_v2 | `7f3c630872d60bfde6313c9d94f204a823058cc45b3f31dc95aece1308593076` | same | MATCH |
| build_inventory_movement_evidence_v2 | `a749c29cacb10c666dd413f2dee67719c24e8694de1d15836043ab786eede8c7` | same | MATCH |
| check_and_record_core_v2_issuer_rate_limit_v1 | `f5022c70b5f05a346ba8910af7a0d6516c849ba753a0c5cbf523f2e141fd4c4f` | same | MATCH |
| claim_atomic_outbox_events_v1 | `7e3787dc80a8b779004a5922fb97bef6fdd3e757e9e5f034e432c463cf24c522` | same | MATCH |
| complete_atomic_outbox_event_v1 | `b621fb7d84bf8b542d30866f7f73c9992693da306458d704b19ad57acc46ab0b` | same | MATCH |
| consume_atomic_authorization_context_v1 | `41ab9d77fab873ce98fcf58a8f6fb48a8c8c1495d8b906b4a16f4c7b02fd821d` | same | MATCH |
| create_order_atomic_v2 | `e2b9514090536721988b7711e032b52e6ccbb23e1e3b98d4e6fd65b3ed453ef1` | same | MATCH |
| deactivate_core_v2_v1 | `50d0433e7b25015d0b3ca1fc4e0b219719229b5c1b7c42d778e354a050709f71` | same | MATCH |
| derive_atomic_financial_snapshot_v2 | `9d6dc2546d9abd8221cd7797d233f099096e326c6597931e189a1dd9a74bb0c2` | same | MATCH |
| enqueue_atomic_outbox_v2 | `e751cb1cd4855f3174fe20f5b51c42e44c70091f56be6ae8a7c7ce369ba9c235` | same | MATCH |
| fail_atomic_outbox_event_v1 | `a7b8a62c12a8d74c73a778dc4790e1204e804397bb4368df52627b506d0ef78d` | same | MATCH |
| is_core_v2_request_enabled_v1 | `6628eadba2c4b2b618827fab9d63931017ebe643dab757af85f2759141ca2231` | same | MATCH |
| issue_atomic_authorization_context_v1 | `e4a8d79bcd1d3615deec6a17565e81bb85a9807f4c44ac86cf54f1cd3896a9e7` | same | MATCH |
| issue_authoritative_financial_quote_v1 | `fa814b248f126eadf0780396ac7bdd1fc4bdccf1a8a496b4c7ad823e8932f88d` | same | MATCH |
| issue_pos_atomic_authorization_context_v1 | `682934fb1741c0475edfde7533ae6121526f4bfd7f106100a6665a76f28e8122` | same | MATCH |
| lock_and_validate_inventory_v2 | `686c122a15085a1e3476cb71029bd89c71060d48fab73f710f9bfb6180c029a6` | same | MATCH |
| normalize_authoritative_quote_request_v1 | `816e27e01ea57d9d0843f6ffd9363cc249bbc567c4cd47c98a011e08218ec87d` | same | MATCH |
| normalize_customer_phone_v2 | `4bd0eb32138c37b4cec49e49fefa71215d740f62917e8d2d2b4e273086cb6ba4` | same | MATCH |
| record_core_v2_verification_evidence_v1 | `3234db91646c5e0fe5934e72a44f5baccb3785d724662fa6ba7bf9c615e9c3d3` | same | MATCH |
| register_core_v2_managed_identity_v1 | `c91bd3b960f40d10744cf69527ddf4d6ffd67d9b5504860c6ca1b89ae532a747` | same | MATCH |
| reject_core_v2_immutable_change_v1 | `b3094234b354f0f4e7d2390ae6a60c01c7b1f7bd096f045eee5f38906ca1b510` | same | MATCH |
| reject_financial_quote_mutation_v1 | `bfca91ddf2e17e53756a7d43f8b4309fc21af6cc82a293cc7ca9f12f7a216d58` | same | MATCH |
| resolve_atomic_authorization_v2 | `ec24e39264196ea2fbd6504b11ed4d57a7c5ad6e25eba599641750206d2a6b0c` | same | MATCH |
| resolve_customer_identity_result_v2 | `220561b0cf73c4415cf59b269e222d09c7aa50efd26f950c7d275236891753b5` | same | MATCH |
| resolve_customer_identity_v2 | `38493486c0ef24a30c958e9ae827fc3dba0b572e30f7f9e1ac1689e35f754c37` | same | MATCH |
| resolve_inventory_requirements_v2 | `28e8b74c18711fdef9515b14c06e402c4057917c9d334f7c6e9bc1ad7bf7e4da` | same | MATCH |
| revoke_atomic_authorization_context_v1 | `ad023206eb9f2f28d0dd4904d012198542c93670c13a01da8454d365b462cd86` | same | MATCH |
| touch_core_v2_control_row_v1 | `1592f889b66807d7a4c9e5ac823fb12ebc9e7ab40ce78079737b5821bfc26c05` | same | MATCH |
| validate_atomic_authorization_context_for_quote_v1 | `1abcc0bd146c1942507cf8034420d6a074466b91183bdf5cfbd6e136071ab935` | same | MATCH |
| validate_atomic_authorization_context_internal_v1 | `09907e89f85d04093009f84ea3192c84d2ceeb5d06978f40465179629d1fb386` | same | MATCH |
| verify_authoritative_quote_hash_v1 | `b1a745b4d6704b5d2b388df14a54e81881889da46915a43e445f69f7467e9231` | same | MATCH |
| verify_core_v2_activation_readiness_v1 | `d36d8eb1a3ce7f1943905bb744a17341314f0b1e44c15aead049cfc97a6e364d` | same | MATCH |
| verify_core_v2_activation_readiness_v2 | `c66ab3e88ad561ca2d80e2b2aaffd2c139aad8777d3613226fbcf44e750f7ec6` | same | MATCH |

Complete function contracts—arguments, defaults, returns, language, volatility,
strictness, parallel setting, security mode and `search_path`—also match 39/39.

## 8. Tables, constraints and indexes in Package 10

The seven tables and five indexes match their 6A-B source definitions under
token/definition comparison:

- activation control, tenant activation and branch activation preserve disabled
  defaults and tenant/branch FKs;
- verification evidence preserves immutable evidence columns;
- managed identities preserve identity/provider checks;
- rate-limit configuration/windows preserve bounded counters and scope;
- all five indexes preserve keys, uniqueness and predicates;
- no Package 2B index is duplicated in Package 10;
- no concurrent index exists in Package 10.

No source table constraint was found omitted or added. This object-level match
does not cure the missing prerequisite verification described in Section 13.

## 9. Role, owner and ACL audit

Exactly six roles are created. All specify `NOLOGIN`, `NOSUPERUSER`,
`NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION` and `NOBYPASSRLS`.
No password, credential, membership or application login is created.

Active grants:

- `USAGE` on `public` and `extensions` to `afex_core_owner`;
- `EXECUTE` on `extensions.digest(text,text)` to `afex_core_owner`;
- enumerated internal table access to `afex_core_owner`;
- `INSERT` on `financial_quotes` to `afex_core_owner`.

These match approved internal-owner source intent and do not enable a runtime,
issuer, quote, worker or operator entry point.

Active revokes close schema creation, function execution, table access and
default privileges against PUBLIC, anon, authenticated, service_role and
managed operational identities. Final owners match the approved source owner
declarations. Owner-inherent privileges are not misclassified as grants.

No operational `EXECUTE` grant was found.

## 10. RLS and policy audit

- Exactly 23 policies exist and all are manifest-listed.
- Policy definitions, command types, roles, `USING` and `WITH CHECK`
  expressions match 5R-B, 6A-B and 6B.
- RLS/FORCE RLS closure matches the source security sections.
- No PUBLIC policy or new service-role bypass exists.
- Tenant/branch/context restrictions are not weaker than their approved
  sources.

Result: exact policy-level match.

## 11. Trigger audit

Exactly seven triggers were found:

- verification evidence immutability;
- activation-control timestamp touch;
- tenant-activation timestamp touch;
- branch-activation timestamp touch;
- managed-identity timestamp touch;
- rate-limit-config timestamp touch;
- financial-quote immutability.

Their timing, event, row level, functions and source definitions match. Trigger
functions precede trigger creation. No legacy trigger is dropped and no
business trigger is fired by installation DDL. Configuration singleton inserts
occur before touch triggers are created.

## 12. Independent dependency and topology audit

The runtime object graph is acyclic at creation time:

- prerequisite baseline/foundation relations precede runtime composition;
- roles precede owner and policy references;
- Package 10 metadata tables precede functions that query them;
- helper/validator functions precede quote/atomic consumers where PostgreSQL
  resolves dependencies at creation;
- trigger functions precede triggers;
- functions and roles precede owner/ACL statements;
- tables and roles precede RLS policies.

PL/pgSQL runtime-only calls do not execute during installation.

### Blocking boundary defect 10-02

Package 10 declares 2B mandatory, but Phase A does not verify any of the 14
Package 2B index names or exact definitions. Therefore Package 10 can continue
when its declared 2B prerequisite has not run or is incomplete. It also does not
check `indisvalid/indisready` for those indexes.

The instruction for a separate foundation boundary requires fail-closed proof
that the exact prerequisite objects exist. This defect makes the boundary
claim false even though those indexes are not creation-time dependencies of the
39 function definitions.

### Additional preflight coverage gap 10-03

Phase A checks relation presence and a small set of critical
constraints/indexes, but does not independently attest the complete 2R/2B/2B-S/
3R object contracts or their source hashes. A wrong-but-present prerequisite
can pass portions of the preflight. At minimum, all objects explicitly declared
mandatory by the Package 10 boundary need exact object-level checks or a
separately reviewed dependency-attestation mechanism.

## 13. Transaction/manual-section audit

- Four `BEGIN` and four matching `COMMIT` statements.
- No `CREATE INDEX CONCURRENTLY`.
- No transaction-incompatible database-level command.
- STOP comments separate the preflight and mutating sections.
- Package 10 is intentionally not silently rerunnable.
- Role/object collision checks prevent blind overwrite.
- Later-section failure does not roll back already committed earlier sections;
  the header and STOP model correctly describe this as partial installation.

Potential partial states are: roles only; roles plus metadata; functions
installed; security/policies installed. The operator must stop after any error
and must not auto-continue or run blind repair.

Transaction structure itself passes static review.

## 14. Activation and business-DML audit

Top-level active DML consists of exactly:

1. one singleton insert into `core_v2_activation_control`, with
   `global_enabled=false`, `kill_switch=true`,
   `deterministic_canary_percentage=0`, and all surface/worker flags false;
2. one rate-limit configuration insert containing security metadata only.

There is no ordinary business-data mutation, fixture data, evidence record,
tenant activation, branch activation, managed-identity registration or
function invocation that activates Core V2.

The DML visible inside copied function bodies is not executed during
installation.

Required counts:

- business data mutations: 0
- fixture mutations: 0
- evidence records: 0
- enabled activation rows: 0

Final state assertions remain fail-closed. No operational identity receives
`EXECUTE`.

## 15. Reconstruction fingerprint result

Independent reconstruction produced:

- expected composed objects: 87;
- actual composed objects: 87;
- identity/definition matches: 87;
- missing objects: 0;
- extra objects: 0;
- function semantic matches: 39/39;
- changed approved function bodies: 0.

Owner and ACL intent matches the approved sources. The reconstruction confirms
object content, but manifest ranges and foundation-precondition coverage remain
separate blocking documentation/control defects.

## 16. PostgreSQL 17 static compatibility

Static review found no unsupported PostgreSQL 17 syntax in function attributes,
policies, triggers, role options, default privileges, JSONB operators, digest
usage, exception blocks, advisory locks or row-lock syntax.

The Package 10 ACL postflight correctly uses PostgreSQL internal
`'f'::"char"` with `acldefault`, and `aclexplode` distinguishes explicit/default
ACLs from owner-inherent privileges.

Dollar-quote delimiters and explicit transaction boundaries are balanced.
This is a static compatibility result only; no PostgreSQL parser/server or
runtime execution was used.

## 17. Decisions

| Artifact | Decision |
|---|---|
| Package 1R | FOUNDATION PACKAGE APPROVED FOR EXTERNAL HASH ATTESTATION |
| Package 2R | FOUNDATION PACKAGE REQUIRES REMEDIATION |
| Package 2B | FOUNDATION PACKAGE REQUIRES REMEDIATION |
| Package 3R | FOUNDATION PACKAGE APPROVED FOR EXTERNAL HASH ATTESTATION |
| Package 10 | PACKAGE 10 DEEP STATIC AUDIT FAILED — REMEDIATION REQUIRED |

## 18. Minimal remediation scope

1. Amend 2R named-index verification to require `indisvalid=true` and
   `indisready=true`; define fail-closed handling for equivalent indexes under
   other names.
2. Amend 2B to reject invalid/not-ready indexes and inventory equivalent
   definitions under other names before every concurrent build.
3. Amend Package 10 Phase A so every mandatory 2B prerequisite index is
   verified by exact table, keys, predicate, uniqueness, validity and readiness;
   extend exact prerequisite checks to the declared foundation boundary.
4. Replace every Package 10 manifest start-line field with the complete exact
   source line range for that object.
5. Recompute all amended hashes and repeat Package 10-A.

Package 7 synchronization must not begin until these amendments are externally
reviewed and the repeated deep static audit passes.

## Final decision

**PACKAGE 10 DEEP STATIC AUDIT FAILED — REMEDIATION REQUIRED**

No conclusion is made about SQL execution, clean-install success, runtime tests,
activation readiness or Production readiness.
