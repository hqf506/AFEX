/* SUPERSEDED
DO NOT EXECUTE
AFEX Core V2 I5.9 - Package 7-Sync
Final Verification Plan, Executable Test Harness, Certification Evidence
Contract and Activation Gate Proof

STATIC GENERATION STATE
-----------------------
STATIC_PACKAGE_VALID is established only by external static review.
RUNTIME_TESTS_NOT_EXECUTED is the state of this generated artifact.
RUNTIME_TESTS_PASSED may be recorded only after every blocking manifest test
has run successfully in the exact approved environment and scope.

Creating or reviewing this file never means Package 7 PASS, activation-ready,
production-ready, or Core V2 enabled. This file never records PASS evidence.

APPROVED DEPENDENCY HASHES - EXTERNAL OPERATOR ATTESTATION REQUIRED
------------------------------------------------------------------
Package 1R:
  8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a
Package 2R:
  92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92
Package 2B:
  7b712bd7cb61603ef0afd5c96e4dcf533debb57adbaab577650f297a486b588b
Package 2B-S:
  009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d
Package 3R:
  58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208
Package 10:
  07ea287c303452a94f7075b57ef254552f1247efebbfa13502cc681d8674e647

Package 10 immutable source attestations:
Package 4T:
  40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7
Package 5R-B:
  eb5ad92396a57022f35cd7a58f6c6f85e7ea735c3306f40040c084e82ecb13b7
Package 6-Sync:
  06b7c27a249b07d0fc58c8e22dd046376a85fb7e507a050a9d33f10e1c8205e3
Package 6A-B:
  30875dfdff59eda1aec4254d6ce1e610e09bfdf857506f682f9e8c8bae3f3a08
Package 6B:
  46c0db2c04a2f48dd1519f72a8f627ca2ceae3ad0ad6af21a7897bc2bc3914ff

PostgreSQL cannot verify repository hashes. Hash attestation is an external,
signed operator responsibility and must be attached to the test run.
Final clean-install runtime dependency chain:
Package 1R -> Package 2R -> Package 2B -> Package 2B-S -> Package 3R ->
Package 10 -> Package 7-Sync.
Package 10 is mandatory for clean install. Its immutable source attestations
are provenance inputs and are not additional clean-install execution steps.
The resulting Package 7-Sync SHA-256 must be externally attested before any
runtime execution. Static synchronization is not runtime certification.

UNRESOLVED RUNTIME PREREQUISITES
--------------------------------
Approved isolated environment and fixtures; exact test tenant/branch UUIDs;
a second isolated tenant; trusted operator identity; managed runtime, worker
and operator identities; approved gateway/rate-limit execution method;
provider delivery disabled; exact rollback/cleanup plan; multi-session
operators; external artifact-hash attestation; application adoption; legacy
closure; conflicting-trigger closure; Customer Engine cutover; and separately
reviewed exact execution grants. None is resolved by this static file update.
*/

-- ===========================================================================
-- A. EXACT FINAL OBJECT PREFLIGHT (CATALOG READS ONLY)
-- ===========================================================================

do $preflight$
declare
  v_missing text;
  v_unexpected text;
  v_bad_metadata text;
begin
  with expected(signature,owner_name,security_definer,volatility,parallel_mode,
                required_search_path) as (values
    ('create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('consume_atomic_authorization_context_v1(text,text,uuid)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('validate_atomic_authorization_context_internal_v1(text,text,text,uuid)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('validate_atomic_authorization_context_for_quote_v1(text)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('issue_atomic_authorization_context_v1(uuid,text,text)',
      'afex_context_issuer',true,'v','u','search_path=pg_catalog'),
    ('issue_pos_atomic_authorization_context_v1(text,uuid,text,text)',
      'afex_context_issuer',true,'v','u','search_path=pg_catalog'),
    ('revoke_atomic_authorization_context_v1(uuid,text)',
      'afex_context_issuer',true,'v','u','search_path=pg_catalog'),
    ('issue_authoritative_financial_quote_v1(text,jsonb,text)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('verify_authoritative_quote_hash_v1(jsonb,text)',
      'afex_core_owner',false,'i','s','search_path=pg_catalog'),
    ('verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)',
      'afex_core_activation_owner',true,'s','s','search_path=pg_catalog'),
    ('check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)',
      'afex_context_issuer',true,'v','u','search_path=pg_catalog'),
    ('record_core_v2_verification_evidence_v1(text,text,uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,uuid,text,text,uuid)',
      'afex_core_activation_operator',true,'v','u','search_path=pg_catalog'),
    ('register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)',
      'afex_core_activation_operator',true,'v','u','search_path=pg_catalog'),
    ('deactivate_core_v2_v1(uuid,text,text,bigint)',
      'afex_core_activation_operator',true,'v','u','search_path=pg_catalog'),
    ('is_core_v2_request_enabled_v1(uuid,uuid,text,text)',
      'afex_core_activation_owner',true,'s','s','search_path=pg_catalog'),
    ('claim_atomic_outbox_events_v1(text,integer,integer)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('complete_atomic_outbox_event_v1(uuid,text)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('fail_atomic_outbox_event_v1(uuid,text,text,text,text)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog')
  )
  select string_agg(signature,', ' order by signature)
  into v_missing
  from expected
  where to_regprocedure('public.'||signature) is null;

  if v_missing is not null then
    raise exception using errcode='55000',
      message='PACKAGE7_REQUIRED_SIGNATURE_MISSING',detail=v_missing;
  end if;

  with expected(proname,identity_args) as (values
    ('create_order_atomic_v2','jsonb, jsonb, jsonb, jsonb'),
    ('consume_atomic_authorization_context_v1','text, text, uuid'),
    ('validate_atomic_authorization_context_internal_v1','text, text, text, uuid'),
    ('validate_atomic_authorization_context_for_quote_v1','text'),
    ('issue_atomic_authorization_context_v1','uuid, text, text'),
    ('issue_pos_atomic_authorization_context_v1','text, uuid, text, text'),
    ('revoke_atomic_authorization_context_v1','uuid, text'),
    ('issue_authoritative_financial_quote_v1','text, jsonb, text'),
    ('verify_authoritative_quote_hash_v1','jsonb, text'),
    ('verify_core_v2_activation_readiness_v2','text, text, uuid, uuid'),
    ('check_and_record_core_v2_issuer_rate_limit_v1',
      'text, uuid, uuid, uuid, text, boolean'),
    ('record_core_v2_verification_evidence_v1',
      'text, text, uuid, uuid, text, text, text, text, timestamp with time zone, timestamp with time zone, uuid, text, text, uuid'),
    ('register_core_v2_managed_identity_v1',
      'name, text, text, text, text, name, text, uuid, text'),
    ('deactivate_core_v2_v1','uuid, text, text, bigint'),
    ('is_core_v2_request_enabled_v1','uuid, uuid, text, text'),
    ('claim_atomic_outbox_events_v1','text, integer, integer'),
    ('complete_atomic_outbox_event_v1','uuid, text'),
    ('fail_atomic_outbox_event_v1','uuid, text, text, text, text')
  ),
  actual as (
    select p.proname,pg_get_function_identity_arguments(p.oid) identity_args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (select proname from expected)
  )
  select string_agg(format('%I(%s)',a.proname,a.identity_args),', '
                    order by a.proname,a.identity_args)
  into v_unexpected
  from actual a
  left join expected e
    on e.proname=a.proname and e.identity_args=a.identity_args
  where e.proname is null;

  if v_unexpected is not null then
    raise exception using errcode='55000',
      message='PACKAGE7_UNEXPECTED_OVERLOAD',detail=v_unexpected;
  end if;

  with expected(signature,owner_name,security_definer,volatility,parallel_mode,
                required_search_path) as (values
    ('create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('consume_atomic_authorization_context_v1(text,text,uuid)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('validate_atomic_authorization_context_internal_v1(text,text,text,uuid)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('validate_atomic_authorization_context_for_quote_v1(text)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('issue_atomic_authorization_context_v1(uuid,text,text)',
      'afex_context_issuer',true,'v','u','search_path=pg_catalog'),
    ('issue_pos_atomic_authorization_context_v1(text,uuid,text,text)',
      'afex_context_issuer',true,'v','u','search_path=pg_catalog'),
    ('revoke_atomic_authorization_context_v1(uuid,text)',
      'afex_context_issuer',true,'v','u','search_path=pg_catalog'),
    ('issue_authoritative_financial_quote_v1(text,jsonb,text)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('verify_authoritative_quote_hash_v1(jsonb,text)',
      'afex_core_owner',false,'i','s','search_path=pg_catalog'),
    ('verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)',
      'afex_core_activation_owner',true,'s','s','search_path=pg_catalog'),
    ('check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)',
      'afex_context_issuer',true,'v','u','search_path=pg_catalog'),
    ('record_core_v2_verification_evidence_v1(text,text,uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,uuid,text,text,uuid)',
      'afex_core_activation_operator',true,'v','u','search_path=pg_catalog'),
    ('register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)',
      'afex_core_activation_operator',true,'v','u','search_path=pg_catalog'),
    ('deactivate_core_v2_v1(uuid,text,text,bigint)',
      'afex_core_activation_operator',true,'v','u','search_path=pg_catalog'),
    ('is_core_v2_request_enabled_v1(uuid,uuid,text,text)',
      'afex_core_activation_owner',true,'s','s','search_path=pg_catalog'),
    ('claim_atomic_outbox_events_v1(text,integer,integer)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('complete_atomic_outbox_event_v1(uuid,text)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog'),
    ('fail_atomic_outbox_event_v1(uuid,text,text,text,text)',
      'afex_core_owner',true,'v','u','search_path=pg_catalog')
  )
  select string_agg(e.signature,', ' order by e.signature)
  into v_bad_metadata
  from expected e
  join pg_proc p on p.oid=to_regprocedure('public.'||e.signature)
  where p.proowner::regrole::text<>e.owner_name
     or p.prosecdef<>e.security_definer
     or p.provolatile<>e.volatility::"char"
     or p.proparallel<>e.parallel_mode::"char"
     or not coalesce(p.proconfig,'{}'::text[])
       @> array[e.required_search_path];

  if v_bad_metadata is not null then
    raise exception using errcode='55000',
      message='PACKAGE7_FUNCTION_METADATA_DRIFT',detail=v_bad_metadata;
  end if;
end;
$preflight$;

-- ===========================================================================
-- B. READ-ONLY ROLE, MEMBERSHIP, ACL AND DEFAULT-ACL DIAGNOSTICS
-- ===========================================================================

select
  r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,
  r.rolinherit,r.rolreplication,r.rolbypassrls
from pg_roles r
where r.rolname in (
  'afex_core_owner','afex_context_issuer','afex_outbox_worker',
  'afex_core_runtime','afex_core_activation_owner',
  'afex_core_activation_operator','PUBLIC','anon','authenticated',
  'service_role'
)
order by r.rolname;

select
  member_role.rolname member_role,
  granted_role.rolname granted_role,
  m.admin_option
from pg_auth_members m
join pg_roles member_role on member_role.oid=m.member
join pg_roles granted_role on granted_role.oid=m.roleid
where member_role.rolname in (
  'anon','authenticated','service_role','afex_core_runtime',
  'afex_outbox_worker','afex_context_issuer',
  'afex_core_activation_operator'
)
   or granted_role.rolname in (
     'afex_core_owner','afex_core_runtime','afex_outbox_worker',
     'afex_context_issuer','afex_core_activation_owner',
     'afex_core_activation_operator'
   )
order by member_role,granted_role;

with protected(signature) as (values
  ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
  ('public.consume_atomic_authorization_context_v1(text,text,uuid)'),
  ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
  ('public.validate_atomic_authorization_context_for_quote_v1(text)'),
  ('public.issue_atomic_authorization_context_v1(uuid,text,text)'),
  ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
  ('public.revoke_atomic_authorization_context_v1(uuid,text)'),
  ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)'),
  ('public.verify_authoritative_quote_hash_v1(jsonb,text)'),
  ('public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'),
  ('public.check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)'),
  ('public.record_core_v2_verification_evidence_v1(text,text,uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,uuid,text,text,uuid)'),
  ('public.register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)'),
  ('public.deactivate_core_v2_v1(uuid,text,text,bigint)'),
  ('public.is_core_v2_request_enabled_v1(uuid,uuid,text,text)'),
  ('public.claim_atomic_outbox_events_v1(text,integer,integer)'),
  ('public.complete_atomic_outbox_event_v1(uuid,text)'),
  ('public.fail_atomic_outbox_event_v1(uuid,text,text,text,text)')
),
roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_outbox_worker'),
  ('afex_core_activation_operator')
)
select role_name,signature,
  case when role_name='PUBLIC' then exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl,acldefault('f'::"char",p.proowner))
    ) acl
    where p.oid=to_regprocedure(signature)
      and acl.grantee=0
      and acl.privilege_type='EXECUTE'
  ) else has_function_privilege(role_name,signature,'EXECUTE') end can_execute
from roles cross join protected
order by role_name,signature;

select
  d.defaclrole::regrole grantor,
  coalesce(n.nspname,'*') schema_name,
  d.defaclobjtype,d.defaclacl
from pg_default_acl d
left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' or n.nspname is null
order by grantor::text,schema_name,d.defaclobjtype;

select
  g.grantee,g.table_name,g.privilege_type,g.is_grantable
from information_schema.role_table_grants g
where g.table_schema='public'
  and g.grantee in (
    'PUBLIC','anon','authenticated','service_role','afex_core_runtime',
    'afex_outbox_worker','afex_core_activation_operator'
  )
  and g.table_name in (
    'atomic_authorization_contexts','financial_quotes',
    'idempotency_commands','atomic_outbox','core_v2_activation_control',
    'core_v2_tenant_activation','core_v2_branch_activation',
    'core_v2_verification_evidence','core_v2_managed_identities',
    'core_v2_issuer_rate_limit_config','core_v2_issuer_rate_limit_windows',
    'customers','orders','invoices','invoice_items','inventory_stock',
    'inventory_movements','order_number_sequences','audit_logs'
  )
order by g.grantee,g.table_name,g.privilege_type;

-- ===========================================================================
-- C. FAIL-CLOSED EXECUTION CONFIGURATION
-- Operators must replace every placeholder in a reviewed working copy.
-- ===========================================================================

begin;

create temporary table afex_p7_run_config(
  test_run_id uuid primary key,
  environment text not null check (environment in (
    'isolated_local','staging','isolated_test_tenant',
    'production_read_only_verification'
  )),
  package_version text not null,
  artifact_hash text not null check (artifact_hash ~ '^[0-9a-f]{64}$'),
  operator_id uuid not null,
  change_ticket text not null check (length(btrim(change_ticket))>=8),
  test_tenant_id uuid,
  test_branch_a_id uuid,
  test_branch_b_id uuid,
  isolated_tenant_id uuid,
  isolated_branch_id uuid,
  allow_mutating_tests boolean not null default false,
  rollback_strategy text not null,
  provider_delivery_disabled boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  check (
    environment<>'production_read_only_verification'
    or allow_mutating_tests=false
  ),
  check (
    not allow_mutating_tests
    or (
      environment in ('isolated_local','staging','isolated_test_tenant')
      and test_tenant_id is not null
      and test_branch_a_id is not null
      and test_branch_b_id is not null
      and isolated_tenant_id is not null
      and isolated_branch_id is not null
      and test_tenant_id<>isolated_tenant_id
      and provider_delivery_disabled
    )
  )
) on commit drop;

/*
Operator setup template - intentionally commented and non-executable:

insert into afex_p7_run_config(
  test_run_id,environment,package_version,artifact_hash,operator_id,
  change_ticket,test_tenant_id,test_branch_a_id,test_branch_b_id,
  isolated_tenant_id,isolated_branch_id,allow_mutating_tests,
  rollback_strategy,provider_delivery_disabled
) values (
  '<TEST_RUN_UUID>'::uuid,
  '<isolated_local|staging|isolated_test_tenant|production_read_only_verification>',
  'core-v2-i5.9',
  '<SHA256_OF_THIS_EXACT_FILE>',
  '<OPERATOR_UUID>'::uuid,
  '<CHANGE_TICKET>',
  '<TEST_TENANT_UUID>'::uuid,
  '<TEST_BRANCH_A_UUID>'::uuid,
  '<TEST_BRANCH_B_UUID>'::uuid,
  '<SECOND_TENANT_UUID>'::uuid,
  '<SECOND_TENANT_BRANCH_UUID>'::uuid,
  false,
  '<EXACT_ROLLBACK_AND_CLEANUP_PLAN>',
  true
);
*/

create temporary table afex_p7_fixtures(
  fixture_key text primary key,
  fixture_category text not null,
  object_id uuid,
  tenant_id uuid,
  branch_id uuid,
  expected_value jsonb not null default '{}'::jsonb,
  cleanup_method text not null,
  persistent_isolated_evidence boolean not null default false,
  verified boolean not null default false,
  notes text
) on commit drop;

/*
Required fixtures, supplied and reviewed externally; never inserted here:
- TEST_TENANT; TEST_BRANCH_A; TEST_BRANCH_B; SECOND_ISOLATED_TENANT;
  SECOND_TENANT_BRANCH.
- ACTIVE_OWNER, ACTIVE_ADMIN, ACTIVE_MANAGER, ACTIVE_EMPLOYEE,
  ACTIVE_CASHIER, DISABLED_PROFILE.
- ACTIVE_POS_PROFILE_A, ACTIVE_POS_PROFILE_B, DISABLED_POS_PROFILE.
- ITEM_DEFAULT_PRICE, ITEM_BRANCH_OVERRIDE, ITEM_UNAVAILABLE, ITEM_INACTIVE,
  ITEM_ARCHIVED_IF_SUPPORTED.
- STOCK_SUFFICIENT, STOCK_EXACT_BOUNDARY, STOCK_INSUFFICIENT.
- DISCOUNT_PERCENT, DISCOUNT_FIXED, DISCOUNT_INACTIVE, DISCOUNT_EXPIRED,
  DISCOUNT_SCOPE_INELIGIBLE.
- VAT_ZERO, VAT_FIVE, VAT_TEN, VAT_FIFTEEN, VAT_BRANCH_OVERRIDE,
  VAT_TENANT_FALLBACK.
- CLEAN_MONTHLY_SEQUENCE and NO_EXISTING_IDEMPOTENCY_COLLISIONS.

Every fixture records only test UUIDs and expected non-sensitive values. No
real customer PII, raw PIN, JWT, context token, token hash, credential, secret,
or unrestricted payload is permitted. Temporary fixtures are removed by the
reviewed transaction rollback or exact UUID cleanup. Persistent isolated-test
evidence is append-only and may exist only in the approved isolated scope.
*/

-- ===========================================================================
-- D. CANONICAL TEST MANIFEST AND NORMALIZED RESULT CONTRACT
-- ===========================================================================

create temporary table afex_p7_manifest(
  test_id text primary key,
  suite_id text not null,
  category text not null,
  description text not null,
  environment_requirement text not null,
  tenant_branch_requirement text not null,
  setup_requirement text not null,
  action text not null,
  expected_result text not null,
  expected_stable_error text,
  expected_rows_changed text not null,
  rollback_requirement text not null,
  concurrency_requirement text not null,
  evidence_category text not null,
  blocking_severity text not null check (blocking_severity in ('BLOCKING','NON_BLOCKING'))
) on commit drop;

create temporary table afex_p7_results(
  test_id text primary key references afex_p7_manifest(test_id),
  suite_id text not null,
  passed boolean,
  blocking boolean not null,
  actual_result text not null default 'NOT_EXECUTED',
  expected_result text not null,
  stable_error text,
  rows_changed bigint,
  transaction_rolled_back boolean,
  evidence_category text not null,
  notes text,
  executed_at timestamptz
) on commit drop;

insert into afex_p7_manifest values
-- External dependency attestation. PostgreSQL cannot establish these hashes.
('DEP-001','dependency-hash-package-1r','supply_chain','Package 1R exact hash attested','all','global','signed external artifact evidence','compare external SHA-256','8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a',null,'0','none','none','dependency_attestation','BLOCKING'),
('DEP-002','dependency-hash-package-2r','supply_chain','Package 2R exact hash attested','all','global','signed external artifact evidence','compare external SHA-256','92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92',null,'0','none','none','dependency_attestation','BLOCKING'),
('DEP-003','dependency-hash-package-2b','supply_chain','Package 2B exact hash attested','all','global','signed external artifact evidence','compare external SHA-256','7b712bd7cb61603ef0afd5c96e4dcf533debb57adbaab577650f297a486b588b',null,'0','none','none','dependency_attestation','BLOCKING'),
('DEP-004','dependency-hash-package-2b-s','supply_chain','Package 2B-S exact hash attested','all','global','signed external artifact evidence','compare external SHA-256','009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d',null,'0','none','none','dependency_attestation','BLOCKING'),
('DEP-005','dependency-hash-package-3r','supply_chain','Package 3R exact hash attested','all','global','signed external artifact evidence','compare external SHA-256','58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208',null,'0','none','none','dependency_attestation','BLOCKING'),
('DEP-006','dependency-hash-package-10','supply_chain','Package 10 exact hash attested and mandatory for clean install','all','global','signed external artifact evidence','compare external SHA-256','07ea287c303452a94f7075b57ef254552f1247efebbfa13502cc681d8674e647',null,'0','none','none','dependency_attestation','BLOCKING'),
('DEP-007','DEPENDENCY','readiness','canonical clean-install prerequisite chain is exact and complete','all','global','all six dependency hashes externally attested','inspect controlled readiness dependency gate','Package 1R -> Package 2R -> Package 2B -> Package 2B-S -> Package 3R -> Package 10 -> Package 7-Sync; obsolete source-package execution chains rejected',null,'0','none','none','dependency_attestation','BLOCKING'),
-- Privilege and role isolation.
('PRIV-001','PRIVILEGE_ROLE','security','PUBLIC protected EXECUTE absent','all','global','final packages applied','inspect effective ACL','all protected calls denied',null,'0','none','none','role_privilege_isolation','BLOCKING'),
('PRIV-002','PRIVILEGE_ROLE','security','browser and service roles protected EXECUTE absent','all','global','final packages applied','inspect effective ACL','all protected calls denied',null,'0','none','none','role_privilege_isolation','BLOCKING'),
('PRIV-003','PRIVILEGE_ROLE','security','runtime direct table and helper access absent','all','global','runtime role exists','inspect table/function privileges','no direct access',null,'0','none','none','role_privilege_isolation','BLOCKING'),
('PRIV-004','PRIVILEGE_ROLE','security','worker limited to three worker functions','all','global','worker role exists','compare effective ACL','exact worker contract',null,'0','none','none','role_privilege_isolation','BLOCKING'),
('PRIV-005','PRIVILEGE_ROLE','security','activation operator limited to approved paths','all','global','activation roles exist','inspect ACL and memberships','exact operator contract',null,'0','none','none','role_privilege_isolation','BLOCKING'),
('PRIV-006','PRIVILEGE_ROLE','security','dedicated roles hardened','all','global','roles exist','inspect pg_roles','NOLOGIN NOINHERIT NOBYPASSRLS',null,'0','none','none','role_privilege_isolation','BLOCKING'),
('PRIV-007','PRIVILEGE_ROLE','security','prohibited membership and SET ROLE paths absent','all','global','roles exist','inspect pg_auth_members and pg_has_role','no prohibited path',null,'0','none','none','role_privilege_isolation','BLOCKING'),
('PRIV-008','PRIVILEGE_ROLE','security','internal writes and default PUBLIC execution closed','all','global','final security applied','inspect tables/default ACL','closed',null,'0','none','none','role_privilege_isolation','BLOCKING'),
-- Authorization context lifecycle.
('CTX-001','CONTEXT','authorization','authenticated issuance and TTL','non-production isolated','test tenant/branch A','active authenticated fixture','issue context via controlled session','raw token once; TTL <= 5 minutes',null,'1 context','rollback','none','authorization_context','BLOCKING'),
('CTX-002','CONTEXT','authorization','POS issuance and TTL','non-production isolated','test tenant/branch A','active POS fixture','issue POS context via controlled session','raw token once; TTL <= 5 minutes',null,'1 context','rollback','none','authorization_context','BLOCKING'),
('CTX-003','CONTEXT','authorization','only token hash stored','non-production isolated','test tenant/branch A','issued context','inspect sanitized state','raw token absent; hash present',null,'0','rollback','none','authorization_context','BLOCKING'),
('CTX-004','CONTEXT','authorization','non-consuming quote validation','non-production isolated','same context scope','issued context','validate quote mode twice','state remains issued',null,'0','rollback','none','authorization_context','BLOCKING'),
('CTX-005','CONTEXT','authorization','consuming order validation','non-production isolated','same context scope','issued context','consume once','state consumed once',null,'1 context','rollback','none','authorization_context','BLOCKING'),
('CTX-006','CONTEXT','authorization','revoke issued context','non-production isolated','same actor/scope','issued context','revoke','state revoked',null,'1 context','rollback','none','authorization_context','BLOCKING'),
('CTX-007','CONTEXT','authorization','cannot revoke consumed context','non-production isolated','same scope','consumed context','revoke','rejected','CONTEXT_NOT_ISSUED','0','rollback','none','authorization_context','BLOCKING'),
('CTX-008','CONTEXT','authorization','expired context rejected','non-production isolated','same scope','expired context fixture','validate','stable rejection','CONTEXT_EXPIRED','0','rollback','none','authorization_context','BLOCKING'),
('CTX-009','CONTEXT','authorization','token hash submitted as raw token rejected','non-production isolated','same scope','issued context','submit stored hash','not found','CONTEXT_NOT_FOUND','0','rollback','none','authorization_context','BLOCKING'),
('CTX-010','CONTEXT','authorization','idempotency hash mismatch rejected','non-production isolated','same scope','issued context','consume with wrong key hash','rejected','CONTEXT_BINDING_INVALID','0','rollback','none','authorization_context','BLOCKING'),
('CTX-011','CONTEXT','authorization','purpose mismatch rejected','non-production isolated','same scope','controlled malformed fixture','validate','rejected','CONTEXT_PURPOSE_INVALID','0','rollback','none','authorization_context','BLOCKING'),
('CTX-012','CONTEXT','authorization','profile role or active state revalidated','non-production isolated','same tenant','issued authenticated context','disable/change role then validate','rejected','CONTEXT_BINDING_INVALID','0','rollback','none','authorization_context','BLOCKING'),
('CTX-013','CONTEXT','authorization','employee branch revalidated','non-production isolated','branches A/B','employee context','move employee branch then validate','rejected','CONTEXT_BINDING_INVALID','0','rollback','none','authorization_context','BLOCKING'),
('CTX-014','CONTEXT','authorization','POS active and branch state revalidated','non-production isolated','branches A/B','POS context','disable/move POS profile','rejected','CONTEXT_BINDING_INVALID','0','rollback','none','authorization_context','BLOCKING'),
('CTX-015','CONTEXT','authorization','two consumers serialize','non-production isolated','same context','issued context','run concurrency plan C1','one winner one stable loser','CONTEXT_ALREADY_CONSUMED','1 context','rollback','two sessions','authorization_context','BLOCKING'),
('CTX-016','CONTEXT','authorization','post-consumption failure rolls state back','non-production isolated','same context','forced later-stage failure','invoke atomic transaction','context remains issued',null,'0 committed','transaction rollback','none','authorization_context','BLOCKING'),
('CTX-017','CONTEXT','authorization','revoked context rejected','non-production isolated','same scope','revoked context fixture','validate','stable rejection','CONTEXT_REVOKED','0','rollback','none','authorization_context','BLOCKING'),
('CTX-018','CONTEXT','authorization','consumed context rejected','non-production isolated','same scope','consumed context fixture','validate','stable rejection','CONTEXT_ALREADY_CONSUMED','0','rollback','none','authorization_context','BLOCKING'),
('CTX-019','CONTEXT','authorization','unknown context token rejected','non-production isolated','same scope','unknown random token','validate','stable rejection','CONTEXT_NOT_FOUND','0','rollback','none','authorization_context','BLOCKING'),
('CTX-020','CONTEXT','authorization','context version mismatch rejected','non-production isolated','same scope','controlled version fixture','validate','stable rejection','CONTEXT_VERSION_INVALID','0','rollback','none','authorization_context','BLOCKING'),
-- Issuer rate limits.
('RATE-001','ISSUER_RATE','security','authenticated issuance limit','non-production isolated','tenant/branch A','controlled actor session','exhaust configured window','stable denial and retry-after','ISSUER_RATE_LIMITED','bounded counter','rollback','none','issuer_rate_limit','BLOCKING'),
('RATE-002','ISSUER_RATE','security','POS failures retained after success','non-production isolated','tenant/branch A','controlled POS session','fail then succeed then fail','abuse history retained',null,'bounded counter','rollback','none','issuer_rate_limit','BLOCKING'),
('RATE-003','ISSUER_RATE','security','window rollover and scope separation','non-production isolated','two users/two branches','rate fixtures','advance isolated clock/window','new window; counters isolated',null,'bounded counters','rollback','none','issuer_rate_limit','BLOCKING'),
('RATE-004','ISSUER_RATE','security','sensitive material never stored','all','global','rate rows exist','inspect schema/values safely','no PIN JWT token IP',null,'0','none','none','issuer_rate_limit','BLOCKING'),
('RATE-005','ISSUER_RATE','security','direct issuer unavailable before gateway','all','global','no runtime issuer grant','effective privilege check','denied',null,'0','none','none','issuer_rate_limit','BLOCKING'),
('RATE-006','ISSUER_RATE','concurrency','concurrent increments bounded','non-production isolated','same scope hash','two sessions','run concurrency plan C2','limit not exceeded','ISSUER_RATE_LIMITED','bounded counter','rollback','two sessions','issuer_rate_limit','BLOCKING'),
-- Authoritative quote and financial parity.
('QUOTE-001','QUOTE','financial','single/multiple/duplicate item exact calculation','non-production isolated','tenant/branch A','priced items','issue three quotes','exact numeric and deterministic aggregation',null,'one quote per context','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-002','QUOTE','financial','default and branch override precedence','non-production isolated','branches A/B','price fixtures','issue scoped quotes','correct tagged source and exact price',null,'one quote per context','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-003','QUOTE','financial','unavailable inactive and cross-tenant items rejected','non-production isolated','two tenants','item fixtures','issue invalid quote','stable rejection','QUOTE_PRICE_UNAVAILABLE','0','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-004','QUOTE','financial','invalid quantity rejected','non-production isolated','tenant/branch A','boundary intent','issue invalid quote','stable rejection','QUOTE_QUANTITY_INVALID','0','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-005','QUOTE','financial','percentage and fixed discounts exact','non-production isolated','tenant/branch A','discount fixtures','issue quotes','exact discount; cap at subtotal',null,'one quote per context','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-006','QUOTE','financial','inactive expired ineligible discount rejected','non-production isolated','tenant/branch A','discount fixtures','issue quote','stable rejection','QUOTE_DISCOUNT_INVALID','0','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-007','QUOTE','financial','VAT 0 5 10 15 and precedence','non-production isolated','branches A/B','VAT fixtures','issue quotes','exact numeric VAT and source',null,'one quote per context','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-008','QUOTE','financial','rounding and fingerprint equivalence','non-production isolated','tenant/branch A','rounding fixtures','issue equivalent intents','exact decimal and same fingerprint',null,'one quote per context','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-009','QUOTE','financial','payload hash integrity enforced','non-production isolated','tenant/branch A','quote fixture','verify valid and corrupt hash','valid then stable mismatch','QUOTE_HASH_MISMATCH','0','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-010','QUOTE','financial','one quote per context concurrency','non-production isolated','same context','two sessions','run concurrency plan C3','same intent one quote; different conflicts','QUOTE_FINGERPRINT_MISMATCH','1 quote','rollback','two sessions','authoritative_quote','BLOCKING'),
('QUOTE-011','QUOTE','security','quote immutable and direct insert closed','non-production isolated','same quote','quote and role fixtures','attempt update/delete/direct insert','all denied',null,'0','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-012','QUOTE','security','caller financial evidence rejected','non-production isolated','tenant/branch A','intent with caller totals','issue quote','all forbidden keys rejected','QUOTE_REQUEST_INVALID','0','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-013','QUOTE','financial','maximum item count enforced','non-production isolated','tenant/branch A','over-limit intent','issue quote','stable rejection','QUOTE_TOO_MANY_ITEMS','0','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-014','QUOTE','financial','expired quote rejected by atomic path','non-production isolated','tenant/branch A','expired quote fixture','execute','stable rejection','QUOTE_EXPIRED','0','rollback','none','authoritative_quote','BLOCKING'),
('QUOTE-015','QUOTE','financial','expired context rejected by quote path','non-production isolated','tenant/branch A','expired context fixture','issue quote','stable rejection','CONTEXT_EXPIRED','0','rollback','none','authoritative_quote','BLOCKING'),
('FIN-001','FINANCIAL_PARITY','financial','line and aggregate snapshot equality','non-production isolated','tenant/branch A','valid quote/context','atomic execution','every line and aggregate exact',null,'one atomic aggregate','rollback','none','financial_parity','BLOCKING'),
('FIN-002','FINANCIAL_PARITY','financial','stored and derived hash equality','non-production isolated','tenant/branch A','valid quote/context','compare exact payload hashes','exact equality',null,'0','rollback','none','financial_parity','BLOCKING'),
('FIN-003','FINANCIAL_PARITY','financial','catalog/override/availability drift rolls back','non-production isolated','tenant/branch A','quote then mutate config','atomic execution','stable drift; no partial writes','QUOTE_FINANCIAL_SNAPSHOT_DRIFT','0 committed','rollback config and transaction','none','financial_drift','BLOCKING'),
('FIN-004','FINANCIAL_PARITY','financial','discount/VAT/version drift rolls back','non-production isolated','tenant/branch A','quote then mutate config','atomic execution','stable drift; no partial writes','QUOTE_FINANCIAL_SNAPSHOT_DRIFT','0 committed','rollback config and transaction','none','financial_drift','BLOCKING'),
('FIN-005','FINANCIAL_PARITY','financial','inactive/deleted item drift rolls back','non-production isolated','tenant/branch A','quote then deactivate item','atomic execution','stable drift; no partial writes','QUOTE_FINANCIAL_SNAPSHOT_DRIFT','0 committed','rollback config and transaction','none','financial_drift','BLOCKING'),
('FIN-006','FINANCIAL_PARITY','financial','corrupt quote payload or stored hash rejected','non-production isolated','tenant/branch A','controlled corrupt fixture','atomic execution','stable rejection; zero partial evidence','QUOTE_HASH_MISMATCH','0','rollback','none','financial_drift','BLOCKING'),
('FIN-007','FINANCIAL_PARITY','financial','drift after idempotency lease rolls back','non-production isolated','tenant/branch A','two sessions','run concurrency plan C9','no lease commit or partial write','QUOTE_FINANCIAL_SNAPSHOT_DRIFT','0 committed','rollback','two sessions','financial_drift','BLOCKING'),
('FIN-008','FINANCIAL_PARITY','financial','quote from another branch rejected','non-production isolated','branches A/B','cross-branch quote','atomic execution','stable rejection; zero partial evidence','QUOTE_SCOPE_INVALID','0','rollback','none','financial_drift','BLOCKING'),
('FIN-009','FINANCIAL_PARITY','financial','quote linked to another context rejected','non-production isolated','tenant/branch A','mismatched link fixture','atomic execution','stable rejection; zero partial evidence','QUOTE_CONTEXT_INVALID','0','rollback','none','financial_drift','BLOCKING'),
-- Idempotency, inventory, numbering and persistence.
('IDEM-001','IDEMPOTENCY','idempotency','first command commits and canonical replay exact','non-production isolated','tenant/branch A','valid atomic fixtures','execute then replay','same response and response hash',null,'one aggregate','cleanup exact UUIDs','none','idempotency_replay','BLOCKING'),
('IDEM-002','IDEMPOTENCY','idempotency','same key different fingerprint conflicts','non-production isolated','tenant/branch A','committed command','retry changed intent','stable conflict','IDEMPOTENCY_FINGERPRINT_CONFLICT','0','cleanup exact UUIDs','none','idempotency_replay','BLOCKING'),
('IDEM-003','IDEMPOTENCY','idempotency','committed timeout replay precedes mutable checks','non-production isolated','tenant/branch A','committed command then config change','retry fresh context same key','exact replay; no financial/inventory/numbering',null,'0 new','restore config; cleanup','none','idempotency_replay','BLOCKING'),
('IDEM-004','IDEMPOTENCY','idempotency','failed transaction leaves no committed response','non-production isolated','tenant/branch A','forced failure','execute','no committed hash or aggregate',null,'0 committed','rollback','none','idempotency_replay','BLOCKING'),
('IDEM-005','IDEMPOTENCY','concurrency','identical commands serialize','non-production isolated','tenant/branch A','two contexts same key','run concurrency plan C4','one commit one exact replay',null,'one aggregate','cleanup exact UUIDs','two sessions','idempotency_replay','BLOCKING'),
('IDEM-006','IDEMPOTENCY','concurrency','same key different fingerprints serialize','non-production isolated','tenant/branch A','two contexts same key','run concurrency plan C5','one winner one conflict','IDEMPOTENCY_FINGERPRINT_CONFLICT','one aggregate','cleanup exact UUIDs','two sessions','idempotency_replay','BLOCKING'),
('INV-001','INVENTORY','inventory','sufficient and exact-boundary stock succeeds','non-production isolated','tenant/branch A','stock fixtures','execute orders','exact stock/movement evidence',null,'bounded exact rows','rollback/cleanup','none','inventory_consistency','BLOCKING'),
('INV-002','INVENTORY','inventory','insufficient stock fails atomically','non-production isolated','tenant/branch A','insufficient fixture','execute','stable error; no mutation','INSUFFICIENT_STOCK','0','rollback','none','inventory_consistency','BLOCKING'),
('INV-003','INVENTORY','inventory','duplicate items aggregate and lock deterministically','non-production isolated','tenant/branch A','duplicate intent','execute','one requirement per item',null,'bounded exact rows','rollback','none','inventory_consistency','BLOCKING'),
('INV-004','INVENTORY','concurrency','parallel orders cannot oversell','non-production isolated','tenant/branch A','boundary stock','run concurrency plan C6','one winner; stock nonnegative','INSUFFICIENT_STOCK','bounded exact rows','rollback/cleanup','two sessions','inventory_consistency','BLOCKING'),
('INV-005','INVENTORY','inventory','later failure and replay do not mutate stock','non-production isolated','tenant/branch A','forced failure and committed replay','execute scenarios','stock unchanged',null,'0 new','rollback','none','inventory_consistency','BLOCKING'),
('NUM-001','NUMBERING','numbering','tenant branch prefix and month exact','non-production isolated','two tenants/branches','clean sequence fixtures','allocate in atomic calls','correct scoped number',null,'one sequence increment','rollback/cleanup','none','numbering','BLOCKING'),
('NUM-002','NUMBERING','concurrency','parallel allocation unique','non-production isolated','tenant/branch A','clean sequence','run concurrency plan C7','unique monotonic allocations',null,'two unique numbers','cleanup exact UUIDs','two sessions','numbering','BLOCKING'),
('NUM-003','NUMBERING','numbering','rollback and replay allocate no permanent extra number','non-production isolated','tenant/branch A','forced failure and committed command','execute scenarios','no gap from rollback; no replay allocation',null,'0 extra','rollback/cleanup','none','numbering','BLOCKING'),
('NUM-004','NUMBERING','numbering','legacy trigger safety assertion','isolated only','tenant/branch A','captured trigger state','test approved disabled/enabled states','expected classification',null,'0','restore exact trigger state','none','legacy_closure','BLOCKING'),
('PERSIST-001','PERSISTENCE','persistence','successful aggregate completeness','non-production isolated','tenant/branch A','valid atomic fixtures','execute once','one order/invoice; exact items/movements/audit/outbox/idempotency',null,'exact manifest counts','cleanup exact UUIDs','none','atomic_persistence','BLOCKING'),
('PERSIST-002','PERSISTENCE','persistence','scope correlation numbers and snapshot match','non-production isolated','tenant/branch A','successful aggregate','compare persisted evidence','all identities and hashes equal',null,'0','cleanup exact UUIDs','none','atomic_persistence','BLOCKING'),
('PERSIST-003','PERSISTENCE','security','no secrets or sensitive auth evidence persisted','non-production isolated','test aggregate only','successful and failed calls','inspect bounded columns','no token/hash/PIN/JWT/session',null,'0','cleanup exact UUIDs','none','atomic_persistence','BLOCKING'),
('PERSIST-004','PERSISTENCE','persistence','every failure has zero partial evidence','non-production isolated','test scope','all forced failures','count exact target UUIDs','zero partial rows',null,'0','rollback','none','atomic_persistence','BLOCKING'),
-- Worker, isolation, activation and readiness.
('WORK-001','OUTBOX_WORKER','outbox','bounded eligible SKIP LOCKED claim','non-production isolated','test tenant events','test outbox fixtures','claim bounded batch','eligible unique leases only',null,'bounded claimed rows','rollback','two workers optional','outbox_worker','BLOCKING'),
('WORK-002','OUTBOX_WORKER','outbox','attempt and next-attempt lifecycle exact','non-production isolated','test events','claimed events','fail/reclaim','exact increment/backoff/eligibility',null,'one event','rollback','none','outbox_worker','BLOCKING'),
('WORK-003','OUTBOX_WORKER','outbox','complete/fail require matching live lease','non-production isolated','test events','claimed event','use wrong/expired owner','stable conflict','OUTBOX_LEASE_CONFLICT','0','rollback','none','outbox_worker','BLOCKING'),
('WORK-004','OUTBOX_WORKER','outbox','dead-letter threshold and immutable payload','non-production isolated','test events','retry fixture','repeat failures and attempt mutation','deterministic threshold; mutation denied',null,'one event lifecycle','rollback','none','outbox_worker','BLOCKING'),
('WORK-005','OUTBOX_WORKER','concurrency','two workers cannot own same lease','non-production isolated','test events','two sessions','run concurrency plan C8','disjoint claims',null,'bounded disjoint rows','rollback','two sessions','outbox_worker','BLOCKING'),
('WORK-006','OUTBOX_WORKER','security','worker isolated from business and Core calls','all','global','worker role','effective privilege checks','only three worker calls',null,'0','none','none','outbox_worker','BLOCKING'),
('SCOPE-001','MULTITENANT','isolation','cross-tenant customer denied','non-production isolated','two tenants','cross-scope customer fixture','execute','stable denial; zero row changes','CUSTOMER_SCOPE_INVALID','0','rollback','none','tenant_branch_isolation','BLOCKING'),
('SCOPE-002','MULTITENANT','isolation','cross-branch POS actor denied','non-production isolated','branches A/B','POS actor fixture','issue wrong branch','stable denial; zero row changes','POS_SCOPE_INVALID','0','rollback','none','tenant_branch_isolation','BLOCKING'),
('SCOPE-003','MULTITENANT','isolation','owner/admin branch contract exact','non-production isolated','branches A/B','owner/admin fixtures','issue/execute allowed and forbidden cases','approved role contract only',null,'bounded exact rows','rollback','none','tenant_branch_isolation','BLOCKING'),
('SCOPE-004','MULTITENANT','isolation','quote/context/order/idempotency scope exact','non-production isolated','two tenants/branches','mixed-scope fixtures','attempt mixed linkage','denied; zero row changes','QUOTE_SCOPE_INVALID','0','rollback','none','tenant_branch_isolation','BLOCKING'),
('SCOPE-005','MULTITENANT','isolation','outbox contract does not leak business scope','non-production isolated','two tenants','worker test events','claim via contract','only bounded event contract',null,'bounded rows','rollback','none','tenant_branch_isolation','BLOCKING'),
('SCOPE-006','MULTITENANT','isolation','cross-tenant catalog item denied','non-production isolated','two tenants','cross-scope item fixture','issue quote','stable denial; zero row changes','QUOTE_ITEM_NOT_FOUND','0','rollback','none','tenant_branch_isolation','BLOCKING'),
('SCOPE-007','MULTITENANT','isolation','cross-tenant discount denied','non-production isolated','two tenants','cross-scope discount fixture','issue quote','stable denial; zero row changes','QUOTE_DISCOUNT_INVALID','0','rollback','none','tenant_branch_isolation','BLOCKING'),
('SCOPE-008','MULTITENANT','isolation','employee cannot request another branch','non-production isolated','branches A/B','employee fixture','issue wrong branch','stable denial; zero row changes','CONTEXT_SCOPE_INVALID','0','rollback','none','tenant_branch_isolation','BLOCKING'),
('CANARY-001','CANARY','activation','secure defaults','all','global','6A-A applied','read activation metadata','disabled kill-switch on zero canary all features off',null,'0','none','none','activation_gates','BLOCKING'),
('CANARY-002','CANARY','activation','browser flags ignored and deterministic routing stable','non-production isolated','test tenant/branch','routing fixtures','repeat same identity and altered browser input','same server decision',null,'0','rollback metadata','none','activation_gates','BLOCKING'),
('CANARY-003','CANARY','activation','allowlist precedence and kill switch','non-production isolated','two tenants/branches','controlled metadata transaction','evaluate combinations','kill switch always denies',null,'temporary metadata only','transaction rollback','none','activation_gates','BLOCKING'),
('CANARY-004','CANARY','activation','evidence alone never enables flags','non-production isolated','test tenant/branch','controlled evidence fixture','evaluate route','disabled until explicit operator change',null,'0','rollback','none','activation_gates','BLOCKING'),
('IDENT-001','MANAGED_IDENTITY','security','runtime worker operator metadata and memberships exact','approved environment','global','managed identities registered externally','compare metadata to pg_auth_members','one non-conflicting expected role each',null,'0','none','none','managed_identity','BLOCKING'),
('IDENT-002','MANAGED_IDENTITY','security','browser/service identities rejected and no credentials stored','all','global','identity metadata','inspect bounded metadata','rejected kinds; labels only',null,'0','none','none','managed_identity','BLOCKING'),
('IDENT-003','MANAGED_IDENTITY','security','inactive or missing managed identities block readiness','all','global','readiness call','call readiness V2','blocking gate false',null,'0','none','none','managed_identity','BLOCKING'),
('LEGACY-001','LEGACY','coexistence','legacy available while Core disabled','approved isolated or read-only ACL','test scope','legacy ACL captured','inspect/call only if isolated','legacy path remains; Core unavailable',null,'0 or isolated rows','rollback','none','legacy_closure','BLOCKING'),
('LEGACY-002','LEGACY','coexistence','legacy and Core cannot mutate same command','isolated only','test tenant/branch','dual-path fixture','controlled competing calls','single mutation authority',null,'one aggregate maximum','cleanup','two sessions','legacy_closure','BLOCKING'),
('LEGACY-003','LEGACY','coexistence','conflicting triggers classified and closure inactive','all','global','triggers present','inspect catalog','blockers visible; no automatic closure',null,'0','none','none','legacy_closure','BLOCKING'),
('LEGACY-004','LEGACY','coexistence','isolated simulated cutover and exact restoration','isolated_local only','test tenant/database','captured ACL/policies/triggers','apply separately reviewed simulation','legacy denied Core succeeds restoration exact',null,'isolated only','restore captured state','none','legacy_closure','BLOCKING'),
('KILL-001','DEACTIVATION','activation','kill switch prevents routing and issuance stoppable','non-production isolated','test tenant/branch','controlled activation metadata','enable isolated then deactivate','new routing denied',null,'temporary metadata','rollback','none','deactivation','BLOCKING'),
('KILL-002','DEACTIVATION','activation','worker pause preserves events and in-flight atomicity','non-production isolated','test events','controlled transactions','pause claims during in-flight work','commit or rollback atomic; evidence retained',null,'bounded rows','restore flags/rollback','two sessions','deactivation','BLOCKING'),
('KILL-003','DEACTIVATION','activation','deactivation requires operator ticket/version and cache invalidation','non-production isolated','global/test scope','operator fixture','call controlled deactivation','audited versioned change; cache purge required',null,'one control update/evidence','rollback','none','deactivation','BLOCKING'),
('READY-001','READINESS_V2','readiness','pre-evidence readiness fails closed','all','requested scope','final packages applied','call readiness V2','at least one blocking gate false',null,'0','none','none','readiness_v2','BLOCKING'),
('READY-002','READINESS_V2','readiness','environment package scope final dependency and supersession exact','approved isolated execution','test scope','Package 1R, 2R, 2B, 2B-S, 3R and Package 10 evidence externally recorded','call variants','wrong dependency hash, missing mandatory Package 10, wrong Package 7-Sync hash/version, environment/scope mismatch and obsolete execution-order evidence rejected',null,'0','none','none','readiness_v2','BLOCKING'),
('READY-003','READINESS_V2','readiness','only executed blocking suites can pass','approved isolated execution','test scope','all manifest results available','reconcile gates to results','no skipped blocked inconclusive test counts',null,'0','none','none','readiness_v2','BLOCKING'),
('READY-004','READINESS_V2','readiness','legacy and trigger closure remain blocking','all','requested scope','closure incomplete','call readiness V2','closure gates false',null,'0','none','none','readiness_v2','BLOCKING'),
('READY-005','READINESS_V2','readiness','global activation remains separately unavailable','all','global','readiness evidence only','inspect route/control','not enabled',null,'0','none','none','readiness_v2','BLOCKING'),
-- Exact readiness-V2 evidence identifiers.
('EVID-001','financial_snapshot_parity','readiness','exact line and aggregate parity evidence suite','approved isolated execution','test scope','FIN-001 and FIN-002 passed','record bounded suite result externally','PASS only after exact parity',null,'0','none','none','financial_snapshot_parity','BLOCKING'),
('EVID-002','financial_drift_rollback','readiness','all drift variants rollback evidence suite','approved isolated execution','test scope','FIN-003 through FIN-009 passed','record bounded suite result externally','PASS only after rollback proof',null,'0','none','none','financial_drift_rollback','BLOCKING'),
('EVID-003','committed_replay_after_configuration_change','readiness','committed replay ordering evidence suite','approved isolated execution','test scope','IDEM-003 passed','record bounded suite result externally','PASS only after exact replay proof',null,'0','none','none','committed_replay_after_configuration_change','BLOCKING'),
('EVID-004','financial_quote_authority','readiness','authoritative quote calculation evidence suite','approved isolated execution','test scope','QUOTE calculation tests passed','record bounded suite result externally','PASS only after exact calculations',null,'0','none','none','financial_quote_authority','BLOCKING'),
('EVID-005','quote_hash_integrity','readiness','quote hash integrity evidence suite','approved isolated execution','test scope','QUOTE-009 and FIN-002 passed','record bounded suite result externally','PASS only after exact hashes',null,'0','none','none','quote_hash_integrity','BLOCKING'),
('EVID-006','quote_immutability','readiness','quote immutability evidence suite','approved isolated execution','test scope','QUOTE-011 passed','record bounded suite result externally','PASS only after mutation denial',null,'0','none','none','quote_immutability','BLOCKING'),
('EVID-007','context_quote_linkage','readiness','one-context one-quote linkage evidence suite','approved isolated execution','test scope','QUOTE-010 and FIN-009 passed','record bounded suite result externally','PASS only after linkage proof',null,'0','none','none','context_quote_linkage','BLOCKING'),
('EVID-008','shared_context_validation','readiness','shared consuming/non-consuming validation suite','approved isolated execution','test scope','CTX lifecycle tests passed','record bounded suite result externally','PASS only after both modes',null,'0','none','none','shared_context_validation','BLOCKING'),
('EVID-009','quote_concurrency','readiness','quote concurrency evidence suite','approved isolated execution','test scope','C3 executed and QUOTE-010 passed','record bounded suite result externally','PASS only after multi-session evidence',null,'0','none','two sessions','quote_concurrency','BLOCKING'),
('EVID-010','quote_privilege_isolation','readiness','quote privilege isolation evidence suite','all','global','PRIV and QUOTE-011 passed','record bounded suite result externally','PASS only after effective ACL proof',null,'0','none','none','quote_privilege_isolation','BLOCKING'),
('EVID-011','legacy-mutation-closure','readiness','legacy closure evidence suite','approved isolated cutover','test scope','LEGACY-004 passed','record bounded suite result externally','PASS only after closure and restoration proof',null,'0','none','none','legacy_mutation_closure','BLOCKING'),
('EVID-012','conflicting-trigger-closure','readiness','conflicting trigger closure evidence suite','approved isolated cutover','test scope','NUM-004 and LEGACY-003 passed','record bounded suite result externally','PASS only after trigger proof',null,'0','none','none','conflicting_trigger_closure','BLOCKING'),
('EVID-013','package-7-full-gate','readiness','aggregate Package 7 gate','approved exact environment','exact certified scope','every blocking manifest row passed','record aggregate result externally','PASS only after all blocking tests',null,'0','none','all required sessions complete','package7_full_gate','BLOCKING');

insert into afex_p7_results(
  test_id,suite_id,passed,blocking,actual_result,expected_result,
  evidence_category,notes
)
select
  test_id,suite_id,null,(blocking_severity='BLOCKING'),'NOT_EXECUTED',
  expected_result,evidence_category,
  'Static manifest registration only; runtime evidence absent.'
from afex_p7_manifest;

-- Manifest completeness and readiness-category coverage.
select suite_id,count(*) test_count,
  count(*) filter (where blocking_severity='BLOCKING') blocking_count,
  count(*) filter (where concurrency_requirement<>'none') concurrency_count
from afex_p7_manifest
group by suite_id
order by suite_id;

select evidence_category,count(*) test_count
from afex_p7_manifest
group by evidence_category
order by evidence_category;

-- Normalized result output. At static generation every row is NOT_EXECUTED.
select
  r.test_id,r.suite_id,r.passed,r.blocking,r.actual_result,
  r.expected_result,r.stable_error,r.rows_changed,
  r.transaction_rolled_back,r.evidence_category,r.notes
from afex_p7_results r
order by r.suite_id,r.test_id;

-- ===========================================================================
-- E. READ-ONLY FIXTURE, SAFE-DEFAULT AND READINESS DIAGNOSTICS
-- ===========================================================================

select
  global_enabled,kill_switch,canary_percentage,pos_enabled,
  admin_orders_enabled,quote_issuer_enabled,worker_enabled,
  activation_version,record_version
from public.core_v2_activation_control;

select *
from public.verify_core_v2_activation_readiness_v2(
  'production','core-v2-i5.9',null,null
);

-- Dependency-constant diagnostic only; never used as sole security proof.
-- Package 6A-B synchronizes readiness V2 to the final Package 6-Sync hash.
select
  position(
    '06b7c27a249b07d0fc58c8e22dd046376a85fb7e507a050a9d33f10e1c8205e3'
    in pg_get_functiondef(
      'public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'
        ::regprocedure
    )
  )>0 as final_package6_sync_hash_expected,
  to_regprocedure(
    'public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'
  ) is not null as package6a_b_readiness_contract_present;

select
  evidence_category,result,count(*) evidence_rows,
  min(started_at) first_started_at,max(completed_at) last_completed_at
from public.core_v2_verification_evidence
group by evidence_category,result
order by evidence_category,result;

select
  identity_kind,purpose,environment,database_role_name,
  expected_membership_role,is_active,secret_reference_label is not null
    as has_secret_reference_label
from public.core_v2_managed_identities
order by environment,identity_kind,database_role_name;

select
  t.tgrelid::regclass::text table_name,t.tgname,t.tgenabled,
  p.oid::regprocedure::text trigger_function,
  pg_get_triggerdef(t.oid,true) trigger_definition
from pg_trigger t
join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal
  and t.tgname in (
    'trg_zzzz_set_order_number_branch_monthly',
    'trg_deduct_inventory_on_invoice_item_insert'
  )
order by table_name,t.tgname;

-- ===========================================================================
-- F. EXECUTION PROTOCOL FOR EVERY MUTATING TEST
-- ===========================================================================

/*
Each runtime test is executed separately:

1. Verify afex_p7_run_config and every required fixture.
2. Reject production_read_only_verification for any mutating test.
3. Verify global_enabled=false, kill_switch=true and canary_percentage=0
   before fixture setup. A separately reviewed isolated canary plan may alter
   only its exact test scope inside the test transaction.
4. Capture exact before-counts and before-values for target UUIDs only.
5. BEGIN; SET LOCAL statement_timeout and lock_timeout to reviewed bounds.
6. Execute setup/action/assertions without provider delivery.
7. Write normalized output to the session-local results table.
8. ROLLBACK for rollback-only tests, then independently verify no changes.
9. For commit/replay tests in an isolated scope, clean up only exact fixture
   UUIDs using separately reviewed cleanup SQL and verify zero remnants.
10. Never print tokens, hashes, PINs, JWTs, PII, secrets or full payloads.

Any missing fixture, identity, expected error, rollback proof, concurrency
session, or exact row-count assertion yields BLOCKED/FAIL, never PASS.
*/

-- ===========================================================================
-- G. MULTI-SESSION CONCURRENCY PLAN (RUN MANUALLY; NEVER CLAIMED STATICALLY)
-- ===========================================================================

/*
C1 SAME CONTEXT CONSUMED TWICE
Session A: BEGIN ISOLATION LEVEL READ COMMITTED; consume valid context; hold
           transaction at operator checkpoint before COMMIT.
Session B: BEGIN ISOLATION LEVEL READ COMMITTED; consume the same context;
           expect wait on context row.
Release A: COMMIT for success fixture, or ROLLBACK for rollback fixture.
Expected: after A COMMIT, B receives AUTHORIZATION_CONTEXT_ALREADY_CONSUMED.
          after A ROLLBACK, B may consume successfully.
Verify: exactly one consumed transition; no token/hash output. Cleanup: exact
fixture context and dependent isolated data.

C2 CONCURRENT RATE-LIMIT INCREMENTS
Sessions A/B: READ COMMITTED, same issuer/scope/window, synchronized calls to
check_and_record_core_v2_issuer_rate_limit_v1.
Expected: row-level serialization; allowed count never exceeds configured
limit; loser receives stable retry-after evidence.
Verify bounded counter; ROLLBACK/clean exact isolated window row.

C3 SAME CONTEXT QUOTED TWICE / QUOTE VS CONSUMPTION
Session A: READ COMMITTED; issue quote for intent A; pause before commit.
Session B: issue same intent and expect wait; after A commits return the same
immutable quote. Repeat with intent B and expect QUOTE_FINGERPRINT_CONFLICT.
Variant: B consumes context for order while quote issuance is blocked.
Expected winner/loser follows lock order; never two quotes; context/quote link
remains exact. Cleanup exact quote/context UUIDs.

C4 TWO IDENTICAL ATOMIC COMMANDS
Sessions A/B: READ COMMITTED; separate fresh contexts, same canonical
idempotency key and fingerprint; synchronized create_order_atomic_v2 calls.
Expected: one committed aggregate and one exact canonical replay. Verify equal
response hash, one number, one inventory mutation set, one outbox event set.
Cleanup exact aggregate UUIDs.

C5 SAME KEY, DIFFERENT FINGERPRINTS
Sessions A/B: READ COMMITTED; fresh contexts, same key, different canonical
intent. Expected one winner; loser receives IDEMPOTENCY_FINGERPRINT_CONFLICT.
Verify one aggregate and no loser-side mutations. Cleanup exact UUIDs.

C6 PARALLEL INVENTORY DEPLETION
Sessions A/B: READ COMMITTED; distinct keys target stock that satisfies only
one order. Pause A after deterministic stock locks; B waits.
Expected A wins; B receives INSUFFICIENT_STOCK; quantity never negative.
Verify exact movements and before/after stock. Cleanup/restore isolated stock.

C7 PARALLEL NUMBER ALLOCATION
Sessions A/B: READ COMMITTED; same tenant/branch/month with distinct commands.
Expected sequence row serialization and unique numbers. Failure variant rolls
back allocation with no permanent increment; replay variant allocates none.
Verify sequence and persisted suffix. Cleanup exact aggregates.

C8 TWO OUTBOX WORKERS / LEASE RECOVERY
Sessions A/B: READ COMMITTED; different high-entropy lease owners claim the
same eligible test pool concurrently.
Expected disjoint SKIP LOCKED result sets. Hold A past isolated lease expiry;
B may recover only after next eligibility. Wrong owner complete/fail is denied.
Verify attempts/backoff/dead-letter and immutable payload. Cleanup test events.

C9 CONFIGURATION UPDATE DURING QUOTE/ORDER DERIVATION
Session A: issue quote and begin atomic order; pause after idempotency acquire
at the documented lock checkpoint.
Session B: update one isolated price/discount/VAT/version fixture and COMMIT.
Release A. Expected FINANCIAL_CONFIGURATION_CHANGED and full rollback:
context issued, idempotency uncommitted, no order/invoice/items, no inventory
movement, no permanent number, no success audit/outbox.
Restore exact configuration fixture.

All sessions must record transaction isolation, timestamps, backend PID,
test-run UUID and sanitized result. A blocked session without deterministic
release/timeout is FAIL. SQL in one session cannot certify these races.

COMMENTED SESSION COMMAND TEMPLATES
-----------------------------------
Substitute only approved isolated fixture values. Run each SESSION block in a
different connection. The operator checkpoint means do not COMMIT/ROLLBACK
until the paired session is confirmed waiting through pg_stat_activity using
only its recorded backend PID.

C1 SESSION A
-- begin isolation level read committed;
-- set local lock_timeout='10s';
-- select * from public.consume_atomic_authorization_context_v1(
--   '<RAW_CONTEXT_TOKEN>','<64_HEX_KEY_HASH>','<CORRELATION_UUID>'::uuid
-- );
-- -- CHECKPOINT C1-A; then commit or rollback as selected by the variant.
C1 SESSION B
-- begin isolation level read committed;
-- set local lock_timeout='10s';
-- select * from public.consume_atomic_authorization_context_v1(
--   '<SAME_RAW_CONTEXT_TOKEN>','<SAME_64_HEX_KEY_HASH>',
--   '<SECOND_CORRELATION_UUID>'::uuid
-- );
-- rollback;

C2 SESSIONS A AND B (start simultaneously)
-- begin isolation level read committed;
-- select * from public.check_and_record_core_v2_issuer_rate_limit_v1(
--   '<authenticated|pos>','<USER_UUID>'::uuid,'<TENANT_UUID>'::uuid,
--   '<BRANCH_UUID>'::uuid,'<64_HEX_SUBJECT_SCOPE_HASH>',false
-- );
-- -- Hold A before commit; B must wait on the same scoped window row.
-- rollback;

C3 SESSION A
-- begin isolation level read committed;
-- select public.issue_authoritative_financial_quote_v1(
--   '<RAW_CONTEXT_TOKEN>','<CANONICAL_BUSINESS_INTENT>'::jsonb,
--   '<TEST_RUN_TRACE_A>'
-- );
-- -- CHECKPOINT C3-A before commit.
C3 SESSION B
-- begin isolation level read committed;
-- select public.issue_authoritative_financial_quote_v1(
--   '<SAME_RAW_CONTEXT_TOKEN>','<SAME_OR_DIFFERENT_INTENT>'::jsonb,
--   '<TEST_RUN_TRACE_B>'
-- );
-- rollback;

C4/C5 SESSIONS A AND B
-- begin isolation level read committed;
-- set local lock_timeout='15s';
-- select public.create_order_atomic_v2(
--   '<SECURITY_ENVELOPE_WITH_FRESH_CONTEXT>'::jsonb,
--   '<COMMAND_WITH_SAME_KEY>'::jsonb,
--   '<EXACT_QUOTE_EVIDENCE>'::jsonb,
--   '<OUTBOX_EVENTS>'::jsonb
-- );
-- -- C4 uses the same fingerprint; C5 uses different fingerprints.
-- -- Hold A at the idempotency-row checkpoint; start B; then commit A.
-- rollback;

C6 SESSIONS A AND B
-- begin isolation level read committed;
-- select public.create_order_atomic_v2(
--   '<SECURITY_ENVELOPE>'::jsonb,
--   '<COMMAND_DEPLETING_SAME_BOUNDARY_STOCK>'::jsonb,
--   '<EXACT_QUOTE_EVIDENCE>'::jsonb,
--   '[]'::jsonb
-- );
-- -- Hold A after deterministic inventory locks; start B; then commit A.
-- rollback;

C7 SESSIONS A AND B
-- begin isolation level read committed;
-- select public.create_order_atomic_v2(
--   '<SECURITY_ENVELOPE>'::jsonb,
--   '<DISTINCT_COMMAND_SAME_TENANT_BRANCH_MONTH>'::jsonb,
--   '<EXACT_QUOTE_EVIDENCE>'::jsonb,
--   '[]'::jsonb
-- );
-- -- Hold A after sequence-row lock; start B; then commit or rollback A.
-- rollback;

C8 SESSION A
-- begin isolation level read committed;
-- select * from public.claim_atomic_outbox_events_v1(
--   '<LEASE_OWNER_A_MIN_16_CHARS>',25,60
-- );
-- -- CHECKPOINT C8-A before commit.
C8 SESSION B
-- begin isolation level read committed;
-- select * from public.claim_atomic_outbox_events_v1(
--   '<LEASE_OWNER_B_MIN_16_CHARS>',25,60
-- );
-- rollback;

C9 SESSION A
-- begin isolation level read committed;
-- select public.create_order_atomic_v2(
--   '<SECURITY_ENVELOPE>'::jsonb,'<COMMAND>'::jsonb,
--   '<PRE_CHANGE_EXACT_QUOTE_EVIDENCE>'::jsonb,'[]'::jsonb
-- );
-- -- CHECKPOINT C9-A after idempotency acquire and before financial parity.
C9 SESSION B
-- begin isolation level read committed;
-- -- Apply exactly one separately reviewed isolated fixture configuration
-- -- change by exact UUID, commit B, then release A. Never use production.
-- commit;

After every pair, run exact UUID-scoped verification queries for context,
quote, idempotency, order, invoice, item, stock, movement, sequence, audit and
outbox rows, then apply the specified rollback/cleanup. Never invoke internal
helpers directly merely to manufacture a lock checkpoint.
*/

-- ===========================================================================
-- H. EXACT POST-TEST ASSERTION CONTRACT
-- ===========================================================================

/*
For each successful atomic fixture assert exact UUID-scoped counts:
- orders=1; invoices=1; invoice_items=expected manifest count;
- inventory_movements=expected tracked-item count;
- inventory_stock deltas equal movement evidence and remain nonnegative;
- audit_logs=expected atomic audit count;
- atomic_outbox=expected event count;
- idempotency_commands=1 committed row with exact response hash;
- order/invoice number, correlation ID, tenant, branch and actor match;
- financial snapshot payload and hash exactly match the quote at every line.

For every failed fixture assert all aggregate/dependent counts are zero,
context consumption rolled back, idempotency is not committed, stock and
sequence values equal before-values, and no success audit/outbox exists.

Cross-tenant and cross-branch tests must assert zero target and foreign-scope
row changes. Queries must filter by exact test UUIDs and never enumerate
unrelated tenant rows.
*/

-- ===========================================================================
-- I. CONTROLLED EVIDENCE RECORDING RUNBOOK - COMMENTED, NEVER AUTOMATIC
-- ===========================================================================

/*
Only after every blocking manifest row has passed with retained artifacts:

-- select public.record_core_v2_verification_evidence_v1(
  'core-v2-i5.9',
  '<EXACT_ENVIRONMENT>',
  '<TEST_TENANT_UUID>'::uuid,
  '<TEST_BRANCH_UUID_OR_NULL>'::uuid,
  '<EXACT_SUITE_IDENTIFIER>',
  '<TEST_RUN_UUID>',
  '<SHA256_OF_EXECUTED_ARTIFACT>',
  '<PASS_OR_FAIL>',
  '<STARTED_AT>'::timestamptz,
  '<COMPLETED_AT>'::timestamptz,
  '<OPERATOR_UUID>'::uuid,
  '<CHANGE_TICKET>',
  '<BOUNDED_SANITIZED_SUMMARY>',
  '<SUPERSEDED_EVIDENCE_UUID_OR_NULL>'::uuid
);

Rules:
- Record blocking FAIL evidence when a blocking test fails.
- BLOCKED, SKIPPED, INCONCLUSIVE and NOT_EXECUTED are never PASS.
- Evidence is append-only; supersession never overwrites.
- Aggregate PASS requires every blocking manifest test to pass.
- Staging evidence never satisfies production.
- Direct evidence-table INSERT is prohibited.
- This package never invokes the recording function automatically.
*/

-- ===========================================================================
-- J. STATIC CERTIFICATION OUTPUT
-- ===========================================================================

select
  'STATIC_PACKAGE_VALID' certification_state,
  'External static review must confirm this value' qualification
union all
select
  'RUNTIME_TESTS_NOT_EXECUTED',
  'Every runtime result remains NOT_EXECUTED until separately run'
union all
select
  'RUNTIME_TESTS_PASSED',
  'PROHIBITED without complete external runtime evidence';

select
  count(*) manifest_tests,
  count(*) filter (where blocking_severity='BLOCKING') blocking_tests,
  count(*) filter (where concurrency_requirement<>'none') concurrency_tests,
  count(distinct suite_id) suites,
  count(distinct evidence_category) evidence_categories
from afex_p7_manifest;

select
  count(*) filter (where passed is true) passed,
  count(*) filter (where passed is false) failed,
  count(*) filter (where passed is null) not_executed,
  bool_and(passed is true) runtime_tests_passed
from afex_p7_results;

-- The transaction contains only session-local harness metadata and diagnostics.
-- ROLLBACK guarantees no session-local setup survives this review execution.
rollback;

/*
FINAL STATIC STATE
------------------
Expected Codex-phase decision:
PACKAGE 7 TEST HARNESS APPROVED FOR EXTERNAL REVIEW

Runtime state:
NOT EXECUTED

This statement is not Package 7 runtime PASS, activation approval, production
approval, evidence insertion or authority to enable any Core V2 feature.
*/
