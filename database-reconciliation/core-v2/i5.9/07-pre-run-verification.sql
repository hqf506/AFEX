/*
AFEX Core V2 - Package 7.1 pre-run verification

FRESH DEDICATED DISPOSABLE CLONE ONLY.
PRODUCTION AND SHARED STAGING EXECUTION ARE PROHIBITED.
STRICTLY READ-ONLY: this artifact performs catalog and bounded metadata reads.
It executes no runtime test, changes no activation state, records no PASS
evidence, and creates no fixture or temporary object.

The stale drafts 07-verification.sql and 07-final-verification.sql are excluded
from the Package 7 execution chain and must be marked SUPERSEDED / DO NOT
EXECUTE or archived before an operator run.

PostgreSQL cannot prove repository hashes, deployment target, provider delivery
closure, an external run identifier, fixture UUIDs, Clone freshness, or
operator approval. Those controls intentionally remain blocking external
evidence requirements.

Approved external dependency hashes:
  Package 2B-S 009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d
  Package 4T   40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7
  Package 5R-B df141eb3ad7c1ff9b9a2ca700a06b4493c524d671b384cf2c4d6a61b0fb569a3
  Package 6A   01466f6d61a90bfd56b2c4a40c776c8ce36cd850f9a24f47e89fd6d21e557351
  Package 6B   797e7baff7fc592decc6bf6765c6a6a6970befc1f22d6d86cc5c69fd08ec8cda
  Package 6    f92f0cab092647a02fa98ba970b4c279c059c3154c253ddd973f24c05ed39d76

Every emitted row has this public result shape:
  category text, check_name text, result text, blocking boolean,
  observed text, required_action text

Allowed result values:
  PASS, FAIL, REVIEW_REQUIRED, EXTERNAL_EVIDENCE_REQUIRED, INSTALL_REQUIRED
*/

with
expected_functions(signature, owner_name, security_definer) as (
  values
    ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
     'afex_core_owner', true),
    ('public.derive_atomic_financial_snapshot_v2(uuid,uuid,jsonb)',
     'afex_core_owner', true),
    ('public.build_atomic_request_fingerprint_v2(jsonb,jsonb)',
     'afex_core_owner', false),
    ('public.issue_atomic_authorization_context_v1(uuid,text,text)',
     'afex_context_issuer', true),
    ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)',
     'afex_context_issuer', true),
    ('public.revoke_atomic_authorization_context_v1(uuid,text)',
     'afex_context_issuer', true),
    ('public.consume_atomic_authorization_context_v1(text,text,uuid)',
     'afex_core_owner', true),
    ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)',
     'afex_core_owner', true),
    ('public.validate_atomic_authorization_context_for_quote_v1(text)',
     'afex_core_owner', true),
    ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)',
     'afex_core_owner', true),
    ('public.verify_authoritative_quote_hash_v1(jsonb,text)',
     'afex_core_owner', false),
    ('public.is_core_v2_request_enabled_v1(uuid,uuid,text,text)',
     'afex_core_activation_owner', true),
    ('public.check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)',
     'afex_context_issuer', true),
    ('public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)',
     'afex_core_activation_owner', true),
    ('public.claim_atomic_outbox_events_v1(text,integer,integer)',
     'afex_outbox_worker', true),
    ('public.complete_atomic_outbox_event_v1(uuid,text)',
     'afex_outbox_worker', true),
    ('public.fail_atomic_outbox_event_v1(uuid,text,text,text,text)',
     'afex_outbox_worker', true),
    ('public.record_core_v2_verification_evidence_v1(text,text,uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,uuid,text,text,uuid)',
     'afex_core_activation_operator', true),
    ('public.register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)',
     'afex_core_activation_operator', true),
    ('public.deactivate_core_v2_v1(uuid,text,text,bigint)',
     'afex_core_activation_operator', true)
),
expected_function_names(proname) as (
  select split_part(split_part(signature, '.', 2), '(', 1)
  from expected_functions
),
expected_tables(table_name, owner_name, require_rls, require_force_rls) as (
  values
    ('atomic_authorization_contexts','afex_core_owner',true,false),
    ('financial_quotes','afex_core_owner',true,false),
    ('idempotency_commands','afex_core_owner',true,false),
    ('atomic_outbox','afex_core_owner',true,false),
    ('core_v2_activation_control','afex_core_activation_owner',true,true),
    ('core_v2_tenant_activation','afex_core_activation_owner',true,true),
    ('core_v2_branch_activation','afex_core_activation_owner',true,true),
    ('core_v2_verification_evidence','afex_core_activation_owner',true,true),
    ('core_v2_managed_identities','afex_core_activation_owner',true,true),
    ('core_v2_issuer_rate_limit_config','afex_core_activation_owner',true,true),
    ('core_v2_issuer_rate_limit_windows','afex_core_activation_owner',true,true),
    ('orders',null,false,false),
    ('invoices',null,false,false),
    ('invoice_items',null,false,false),
    ('inventory_stock',null,false,false),
    ('inventory_movements',null,false,false),
    ('order_number_sequences',null,false,false),
    ('audit_logs',null,false,false)
),
dedicated_roles(role_name) as (
  values
    ('afex_core_owner'),
    ('afex_context_issuer'),
    ('afex_outbox_worker'),
    ('afex_core_activation_owner'),
    ('afex_core_activation_operator'),
    ('afex_core_runtime')
),
supabase_roles(role_name) as (
  values ('anon'),('authenticated'),('service_role')
),
protected_roles(role_name) as (
  values
    ('PUBLIC'),('anon'),('authenticated'),('service_role'),
    ('afex_core_runtime'),('afex_outbox_worker'),
    ('afex_context_issuer'),('afex_core_activation_operator')
),
protected_functions(signature) as (
  values
    ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
    ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)'),
    ('public.issue_atomic_authorization_context_v1(uuid,text,text)'),
    ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
    ('public.revoke_atomic_authorization_context_v1(uuid,text)'),
    ('public.consume_atomic_authorization_context_v1(text,text,uuid)'),
    ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
    ('public.validate_atomic_authorization_context_for_quote_v1(text)'),
    ('public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)')
),
package7_executor_functions(signature) as (
  values
    ('public.issue_atomic_authorization_context_v1(uuid,text,text)'),
    ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
    ('public.validate_atomic_authorization_context_for_quote_v1(text)'),
    ('public.consume_atomic_authorization_context_v1(text,text,uuid)'),
    ('public.revoke_atomic_authorization_context_v1(uuid,text)'),
    ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)'),
    ('public.verify_authoritative_quote_hash_v1(jsonb,text)'),
    ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
    ('public.build_atomic_request_fingerprint_v2(jsonb,jsonb)'),
    ('public.check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)'),
    ('public.is_core_v2_request_enabled_v1(uuid,uuid,text,text)'),
    ('public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'),
    ('public.claim_atomic_outbox_events_v1(text,integer,integer)'),
    ('public.complete_atomic_outbox_event_v1(uuid,text)'),
    ('public.fail_atomic_outbox_event_v1(uuid,text,text,text,text)'),
    ('public.record_core_v2_verification_evidence_v1(text,text,uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,uuid,text,text,uuid)')
),
expected_policies(table_name, policy_name) as (
  values
    ('atomic_authorization_contexts','context_issuer_insert_v1'),
    ('atomic_authorization_contexts','context_issuer_revoke_v1'),
    ('atomic_authorization_contexts','context_issuer_read_v1'),
    ('atomic_authorization_contexts','context_core_consume_v1'),
    ('financial_quotes','financial_quotes_core_read_v1'),
    ('financial_quotes','financial_quotes_core_insert_v1'),
    ('idempotency_commands','idempotency_core_v1'),
    ('atomic_outbox','outbox_core_v1'),
    ('core_v2_activation_control','core_v2_activation_owner_control_read'),
    ('core_v2_tenant_activation','core_v2_activation_owner_tenants_read'),
    ('core_v2_branch_activation','core_v2_activation_owner_branches_read'),
    ('core_v2_verification_evidence','core_v2_activation_owner_evidence_read'),
    ('core_v2_managed_identities','core_v2_activation_owner_identities_read'),
    ('core_v2_issuer_rate_limit_config','core_v2_activation_owner_rate_config_read'),
    ('core_v2_issuer_rate_limit_windows','core_v2_activation_owner_rate_windows_read'),
    ('core_v2_activation_control','core_v2_activation_operator_control'),
    ('core_v2_tenant_activation','core_v2_activation_operator_tenants'),
    ('core_v2_branch_activation','core_v2_activation_operator_branches'),
    ('core_v2_verification_evidence','core_v2_activation_operator_evidence'),
    ('core_v2_managed_identities','core_v2_activation_operator_identities'),
    ('core_v2_issuer_rate_limit_config','core_v2_activation_operator_rate_config'),
    ('core_v2_issuer_rate_limit_config','core_v2_context_issuer_rate_config_read'),
    ('core_v2_issuer_rate_limit_windows','core_v2_context_issuer_rate_windows')
),
expected_triggers(table_name, trigger_name) as (
  values
    ('core_v2_verification_evidence','trg_core_v2_verification_evidence_immutable'),
    ('core_v2_activation_control','trg_touch_core_v2_activation_control'),
    ('core_v2_tenant_activation','trg_touch_core_v2_tenant_activation'),
    ('core_v2_branch_activation','trg_touch_core_v2_branch_activation'),
    ('core_v2_managed_identities','trg_touch_core_v2_managed_identities'),
    ('core_v2_issuer_rate_limit_config','trg_touch_core_v2_rate_limit_config'),
    ('financial_quotes','trg_financial_quotes_immutable_v1')
),
checks(
  category, check_name, result, blocking, observed, required_action,
  database_verifiable
) as (
  /* A/B. Server and environment compatibility. */
  select
    'server_environment','postgresql_version_number','REVIEW_REQUIRED',true,
    current_setting('server_version_num'),
    'Retain this bounded server-version evidence with the run.',false
  union all
  select
    'server_environment','postgresql_major_version',
    case
      when current_setting('server_version_num')::integer / 10000 = 17
        then 'PASS' else 'FAIL'
    end,
    true,
    (current_setting('server_version_num')::integer / 10000)::text,
    'Package 7 supports PostgreSQL major version 17 only.',true
  union all
  select
    'server_environment','current_database','REVIEW_REQUIRED',true,
    current_database(),
    'Compare with separately approved Clone/Staging identity evidence.',false
  union all
  select
    'server_environment','current_user','REVIEW_REQUIRED',true,
    current_user,
    'Review the database identity without treating it as environment proof.',false
  union all
  select
    'server_environment','current_schema','REVIEW_REQUIRED',false,
    coalesce(current_schema,'<null>'),
    'Expected object references are explicitly schema-qualified.',false
  union all
  select
    'server_environment','transaction_read_only','REVIEW_REQUIRED',false,
    current_setting('transaction_read_only'),
    'Informational only; this artifact itself contains read-only SQL.',false
  union all
  select
    'server_environment','default_transaction_read_only','REVIEW_REQUIRED',false,
    current_setting('default_transaction_read_only'),
    'Informational only; Clone runtime tests may require writes.',false
  union all
  select
    'server_environment','pgcrypto_extension',
    case when exists (
      select 1
      from pg_extension e
      join pg_namespace n on n.oid=e.extnamespace
      where e.extname='pgcrypto' and n.nspname='extensions'
    ) then 'PASS' else 'FAIL' end,
    true,
    coalesce((
      select e.extversion || '@' || n.nspname
      from pg_extension e
      join pg_namespace n on n.oid=e.extnamespace
      where e.extname='pgcrypto'
      order by n.nspname
      limit 1
    ),'<missing>'),
    'pgcrypto must exist in schema extensions.',true
  union all
  select
    'external_attestation','clone_or_staging_target',
    'EXTERNAL_EVIDENCE_REQUIRED',true,'not provable inside PostgreSQL',
    'Retain signed proof that the target is Clone/Staging and not Production.',
    false
  union all
  select
    'external_attestation','provider_delivery_disabled',
    'EXTERNAL_EVIDENCE_REQUIRED',true,'not provable by this query',
    'Retain external proof that all provider delivery is disabled.',false
  union all
  select
    'external_attestation','dependency_file_hashes',
    'EXTERNAL_EVIDENCE_REQUIRED',true,
    'six approved SHA-256 values are documented in the header',
    'Independently hash and approve every dependency file before execution.',
    false

  /* C. Exact final dependency object contracts. */
  union all
  select
    'function_contract',e.signature,
    case
      when p.oid is null then 'FAIL'
      when pg_get_userbyid(p.proowner)<>e.owner_name then 'FAIL'
      when p.prosecdef<>e.security_definer then 'FAIL'
      when not coalesce(
        p.proconfig = array['search_path=pg_catalog']::text[],
        false
      ) then 'FAIL'
      else 'PASS'
    end,
    true,
    case when to_regprocedure(e.signature) is null then '<missing>'
      else format(
        'owner=%s security_definer=%s path=%s',
        pg_get_userbyid(p.proowner),
        p.prosecdef,
        coalesce(array_to_string(p.proconfig,','),'<unset>')
      )
    end,
    format(
      'Require exact signature, owner=%s, security_definer=%s and safe path.',
      e.owner_name,e.security_definer
    ),
    true
  from expected_functions e
  left join pg_proc p on p.oid=to_regprocedure(e.signature)
  union all
  select
    'function_contract','unexpected_overloads',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    true,
    count(*)::text,
    'Remove or separately review every overload not in the frozen contract.',
    true
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (select proname from expected_function_names)
    and not exists (
      select 1 from expected_functions e
      where to_regprocedure(e.signature)=p.oid
    )
  union all
  select
    'table_contract',e.table_name,
    case
      when c.oid is null then 'FAIL'
      when e.owner_name is not null
       and pg_get_userbyid(c.relowner)<>e.owner_name then 'FAIL'
      when e.require_rls and not c.relrowsecurity then 'FAIL'
      when e.require_force_rls and not c.relforcerowsecurity then 'FAIL'
      else 'PASS'
    end,
    true,
    case when c.oid is null then '<missing>'
      else format(
        'owner=%s rls=%s force_rls=%s',
        pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity
      )
    end,
    'Require the exact final table contract.',true
  from expected_tables e
  left join pg_class c
    on c.relnamespace='public'::regnamespace
   and c.relname=e.table_name and c.relkind='r'
  union all
  select
    'quote_linkage',required.object_name,
    case when required.present then 'PASS' else 'FAIL' end,
    true,
    required.present::text,
    'Require exact Package 6B authorization-context linkage.',true
  from (
    select
      'fk_financial_quotes_authorization_context'::text object_name,
      exists (
        select 1 from pg_constraint
        where conrelid='public.financial_quotes'::regclass
          and conname='fk_financial_quotes_authorization_context'
          and contype='f'
      ) present
    union all
    select
      'uq_financial_quotes_authorization_context',
      exists (
        select 1
        from pg_class c
        join pg_index i on i.indexrelid=c.oid
        where c.relnamespace='public'::regnamespace
          and c.relname='uq_financial_quotes_authorization_context'
          and i.indisunique and i.indisvalid and i.indisready
      )
  ) required

  /* D. Dedicated and Supabase roles. */
  union all
  select
    'role_contract',e.role_name,
    case
      when r.oid is null then 'FAIL'
      when r.rolcanlogin or r.rolsuper or r.rolcreatedb
        or r.rolcreaterole or r.rolinherit or r.rolreplication
        or r.rolbypassrls then 'FAIL'
      else 'PASS'
    end,
    true,
    case when r.oid is null then '<missing>'
      else format(
        'login=%s super=%s createdb=%s createrole=%s inherit=%s replication=%s bypassrls=%s',
        r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,
        r.rolinherit,r.rolreplication,r.rolbypassrls
      )
    end,
    'Require exact dedicated NOLOGIN least-privilege attributes.',true
  from dedicated_roles e
  left join pg_roles r on r.rolname=e.role_name
  union all
  select
    'role_contract',e.role_name,
    case when r.oid is null then 'FAIL' else 'PASS' end,
    true,
    case when r.oid is null then '<missing>' else 'present' end,
    'Required Supabase role must exist.',true
  from supabase_roles e
  left join pg_roles r on r.rolname=e.role_name

  /* E. Managed LOGIN identity preconditions. */
  union all
  select
    'managed_identity','approved_environment',
    'EXTERNAL_EVIDENCE_REQUIRED',true,'not supplied to this read-only artifact',
    'Approve one exact environment before interpreting active identity rows.',
    false
  union all
  select
    'managed_identity',
    'active_' || required.identity_kind || '_inventory',
    case
      when count(i.identity_id)>1 then 'FAIL'
      else 'REVIEW_REQUIRED'
    end,
    true,
    format(
      'environment=%s count=%s',
      coalesce(i.environment,'<none>'),
      count(i.identity_id)
    ),
    'After environment approval, require exactly one active identity of this kind.',
    false
  from (values ('runtime'),('outbox_worker')) required(identity_kind)
  left join public.core_v2_managed_identities i
    on i.identity_kind=required.identity_kind and i.active
  group by required.identity_kind,i.environment
  union all
  select
    'managed_identity',
    format('%s:%s',i.environment,i.identity_kind),
    case
      when r.oid is null then 'FAIL'
      when not r.rolcanlogin or r.rolsuper or r.rolcreatedb
        or r.rolcreaterole or r.rolinherit or r.rolreplication
        or r.rolbypassrls then 'FAIL'
      when (select count(*) from pg_auth_members m where m.member=r.oid)<>1
        then 'FAIL'
      when not exists (
        select 1
        from pg_auth_members m
        join pg_roles granted_role on granted_role.oid=m.roleid
        where m.member=r.oid
          and granted_role.rolname=i.expected_membership_role::text
          and not m.admin_option
          and not m.inherit_option
          and m.set_option
      ) then 'FAIL'
      else 'REVIEW_REQUIRED'
    end,
    true,
    format(
      'role=%s exists=%s login=%s safe_attributes=%s memberships=%s expected_role=%s exact_options=%s',
      i.database_role_name,
      r.oid is not null,
      coalesce(r.rolcanlogin,false),
      coalesce(
        r.rolcanlogin and not r.rolsuper and not r.rolcreatedb
        and not r.rolcreaterole and not r.rolinherit
        and not r.rolreplication and not r.rolbypassrls,
        false
      ),
      coalesce((select count(*) from pg_auth_members m where m.member=r.oid),0),
      i.expected_membership_role,
      coalesce(exists (
        select 1
        from pg_auth_members m
        join pg_roles granted_role on granted_role.oid=m.roleid
        where m.member=r.oid
          and granted_role.rolname=i.expected_membership_role::text
          and not m.admin_option
          and not m.inherit_option
          and m.set_option
      ),false)
    ),
    'Approve the environment and retain exact LOGIN/membership evidence; use explicit SET ROLE only.',
    true
  from public.core_v2_managed_identities i
  left join pg_roles r on r.rolname=i.database_role_name
  where i.active and i.identity_kind in ('runtime','outbox_worker')

  /* F. Disabled activation state. */
  union all
  select
    'activation_state','singleton_exact_disabled',
    case when count(*)=1
      and bool_and(
        not global_enabled and kill_switch
        and not pos_enabled and not admin_orders_enabled
        and not quote_issuer_enabled and not outbox_worker_enabled
        and deterministic_canary_percentage=0
      ) then 'PASS' else 'FAIL' end,
    true,
    format(
      'rows=%s exact_disabled=%s',
      count(*),
      coalesce(bool_and(
        not global_enabled and kill_switch
        and not pos_enabled and not admin_orders_enabled
        and not quote_issuer_enabled and not outbox_worker_enabled
        and deterministic_canary_percentage=0
      ),false)
    ),
    'Require exactly one fail-closed activation singleton.',true
  from public.core_v2_activation_control
  union all
  select
    'activation_state','enabled_tenant_rows',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    true,count(*)::text,
    'No tenant activation feature may be enabled.',true
  from public.core_v2_tenant_activation
  where enabled or canary_eligible or pos_enabled
     or admin_orders_enabled or quote_enabled
  union all
  select
    'activation_state','enabled_branch_rows',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    true,count(*)::text,
    'No branch activation feature may be enabled.',true
  from public.core_v2_branch_activation
  where enabled or canary_eligible or pos_enabled
     or admin_orders_enabled or quote_enabled

  /* G. Effective privilege closure. */
  union all
  select
    'execute_closure',r.role_name || ':' || f.signature,
    case
      when to_regprocedure(f.signature) is null then 'FAIL'
      when r.role_name<>'PUBLIC'
       and not exists (select 1 from pg_roles where rolname=r.role_name)
        then 'FAIL'
      when r.role_name=pg_get_userbyid(p.proowner)
        then 'PASS'
      when has_function_privilege(r.role_name,f.signature,'EXECUTE') then 'FAIL'
      else 'PASS'
    end,
    true,
    case when to_regprocedure(f.signature) is null then '<function missing>'
      when r.role_name<>'PUBLIC'
       and not exists (select 1 from pg_roles where rolname=r.role_name)
        then '<role missing>'
      when r.role_name=pg_get_userbyid(p.proowner)
        then 'owner implicit execution; not an ACL grant'
      else has_function_privilege(r.role_name,f.signature,'EXECUTE')::text
    end,
    'Protected function must remain ungranted to this non-owner role.',true
  from protected_roles r
  cross join protected_functions f
  left join pg_proc p on p.oid=to_regprocedure(f.signature)
  union all
  select
    'table_closure',required.check_name,
    case when required.allowed then 'PASS' else 'FAIL' end,
    true,required.allowed::text,
    required.action,true
  from (
    select
      'runtime_business_tables'::text check_name,
      case when not exists (
        select 1 from pg_roles where rolname='afex_core_runtime'
      ) then false else not exists (
        select 1
        from (values
          ('orders'),('invoices'),('invoice_items'),('inventory_stock'),
          ('inventory_movements'),('order_number_sequences'),('audit_logs'),
          ('financial_quotes'),('idempotency_commands'),('atomic_outbox'),
          ('atomic_authorization_contexts'),('core_v2_activation_control'),
          ('core_v2_tenant_activation'),('core_v2_branch_activation'),
          ('core_v2_verification_evidence'),('core_v2_managed_identities'),
          ('core_v2_issuer_rate_limit_config'),
          ('core_v2_issuer_rate_limit_windows')
        ) t(table_name)
        where has_any_column_privilege(
          'afex_core_runtime',
          format('public.%I',t.table_name),
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
        or has_table_privilege(
          'afex_core_runtime',
          format('public.%I',t.table_name),
          'DELETE'
        )
      ) end allowed,
      'Runtime must have no direct business/Core mutation privilege.'::text action
    union all
    select
      'worker_business_tables',
      case when not exists (
        select 1 from pg_roles where rolname='afex_outbox_worker'
      ) then false else not exists (
        select 1
        from (values
          ('orders'),('invoices'),('invoice_items'),('inventory_stock'),
          ('inventory_movements'),('idempotency_commands'),
          ('atomic_authorization_contexts'),('financial_quotes'),
          ('atomic_outbox'),('core_v2_activation_control'),
          ('core_v2_tenant_activation'),('core_v2_branch_activation'),
          ('core_v2_verification_evidence'),('core_v2_managed_identities'),
          ('core_v2_issuer_rate_limit_config'),
          ('core_v2_issuer_rate_limit_windows')
        ) t(table_name)
        where has_any_column_privilege(
          'afex_outbox_worker',
          format('public.%I',t.table_name),
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
        or has_table_privilege(
          'afex_outbox_worker',
          format('public.%I',t.table_name),
          'DELETE'
        )
      ) end,
      'Worker must have no direct business/Core table privilege.'
    union all
    select
      'runtime_public_schema',
      case when not exists (
        select 1 from pg_roles where rolname='afex_core_runtime'
      ) then false else
        has_schema_privilege('afex_core_runtime','public','USAGE')
        and not has_schema_privilege('afex_core_runtime','public','CREATE')
      end,
      'Runtime requires USAGE and must not have CREATE on public.'
  ) required

  /* H. Policies, owners, RLS, triggers and default ACLs. */
  union all
  select
    'policy_contract',e.table_name || ':' || e.policy_name,
    case when count(p.policyname)=1 then 'PASS' else 'FAIL' end,
    true,count(p.policyname)::text,
    'Expected reviewed policy must exist exactly once.',true
  from expected_policies e
  left join pg_policies p
    on p.schemaname='public'
   and p.tablename=e.table_name
   and p.policyname=e.policy_name
  group by e.table_name,e.policy_name
  union all
  select
    'policy_contract','unexpected_package6_policy',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    true,count(*)::text,
    'Unexpected policy in the reviewed Package 6 surface is blocking.',true
  from pg_policies p
  where p.schemaname='public'
    and p.tablename in (
      'atomic_authorization_contexts','financial_quotes',
      'idempotency_commands','atomic_outbox',
      'core_v2_activation_control','core_v2_tenant_activation',
      'core_v2_branch_activation','core_v2_verification_evidence',
      'core_v2_managed_identities','core_v2_issuer_rate_limit_config',
      'core_v2_issuer_rate_limit_windows'
    )
    and not exists (
      select 1 from expected_policies e
      where e.table_name=p.tablename and e.policy_name=p.policyname
    )
  union all
  select
    'trigger_contract',e.table_name || ':' || e.trigger_name,
    case
      when count(t.oid)=1 and bool_and(t.tgenabled<>'D') then 'PASS'
      else 'FAIL'
    end,
    true,
    format('count=%s enabled=%s',count(t.oid),coalesce(bool_and(t.tgenabled<>'D'),false)),
    'Expected immutable/touch trigger must exist and be enabled.',true
  from expected_triggers e
  left join pg_class c
    on c.relnamespace='public'::regnamespace and c.relname=e.table_name
  left join pg_trigger t
    on t.tgrelid=c.oid and t.tgname=e.trigger_name and not t.tgisinternal
  group by e.table_name,e.trigger_name
  union all
  select
    'default_acl','activation_owner_operator_public_closure',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    true,count(*)::text,
    'PUBLIC must receive no default privilege from activation owner/operator.',
    true
  from pg_default_acl d
  join pg_roles owner_role on owner_role.oid=d.defaclrole
  cross join lateral aclexplode(
    coalesce(d.defaclacl,acldefault(d.defaclobjtype,d.defaclrole))
  ) x
  where owner_role.rolname in (
      'afex_core_activation_owner','afex_core_activation_operator'
    )
    and x.grantee=0

  /* I. Legacy/conflict inventory: never auto-classified as closed. */
  union all
  select
    'legacy_inventory','create_invoice_with_items_functions',
    'REVIEW_REQUIRED',true,
    count(*)::text,
    'Review every legacy signature and effective grant; do not claim closure.',
    false
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname like 'create_invoice_with_items%'
  union all
  select
    'legacy_inventory','direct_mutation_policies',
    'REVIEW_REQUIRED',true,
    count(*)::text,
    'Review write policies on customers/orders/invoices/invoice_items.',
    false
  from pg_policies
  where schemaname='public'
    and tablename in ('customers','orders','invoices','invoice_items')
    and cmd in ('INSERT','UPDATE','DELETE','ALL')
  union all
  select
    'legacy_inventory','conflicting_triggers',
    'REVIEW_REQUIRED',true,
    count(*)::text,
    'Review inventory, numbering, invoice propagation and branch-default triggers.',
    false
  from pg_trigger t
  join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal
    and (
      t.tgname ilike '%inventory%'
      or t.tgname ilike '%number%'
      or t.tgname ilike '%branch%'
      or t.tgname ilike '%invoice%'
    )
  union all
  select
    'legacy_inventory','customer_engine_direct_write_paths',
    'REVIEW_REQUIRED',true,
    count(*)::text,
    'Review customer write functions and effective grants before cutover.',
    false
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and (
      p.proname ilike '%customer%'
      or pg_get_function_identity_arguments(p.oid) ilike '%customer%'
    )

  /* J. Clone-only Package 7 execution identity. The identity is provisioned
     externally on the disposable Clone and is never a Package 6 runtime role. */
  union all
  select
    'execution_identity','package7_executor_attributes',
    case when count(*)=1
      and bool_and(rolcanlogin and not rolsuper and not rolcreatedb
        and not rolcreaterole and not rolinherit and not rolreplication
        and not rolbypassrls)
      then 'PASS' else 'FAIL' end,
    true,
    format('count=%s exact_safe_attributes=%s',count(*),
      coalesce(bool_and(rolcanlogin and not rolsuper and not rolcreatedb
        and not rolcreaterole and not rolinherit and not rolreplication
        and not rolbypassrls),false)),
    'Provision exactly one restricted Clone-only LOGIN named afex_package7_test_executor.',
    true
  from pg_roles where rolname='afex_package7_test_executor'
  union all
  select
    'execution_identity','package7_executor_no_memberships',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    true,count(*)::text,
    'The Clone executor must have no inherited role membership.',
    true
  from pg_auth_members am
  join pg_roles member_role on member_role.oid=am.member
  where member_role.rolname='afex_package7_test_executor'
  union all
  select
    'execution_identity','package7_executor_required_entrypoints',
    case when count(*)=16
      and bool_and(to_regprocedure(signature) is not null)
      and bool_and(has_function_privilege(
        'afex_package7_test_executor',signature,'EXECUTE'))
    then 'PASS' else 'FAIL' end,
    true,
    format('required=%s executable=%s',count(*),
      count(*) filter(where to_regprocedure(signature) is not null
        and has_function_privilege(
          'afex_package7_test_executor',signature,'EXECUTE'))),
    'Provision only the 16 reviewed Package 7 direct test entry points on the disposable Clone.',
    true
  from package7_executor_functions
  union all
  select
    'execution_identity','package7_executor_session',
    case when session_user='afex_package7_test_executor'
       and current_user=session_user then 'PASS' else 'FAIL' end,
    true,
    format('session_user=%I current_user=%I',session_user,current_user),
    'Run every executable Package 7 SQL artifact directly as the reviewed Clone-only LOGIN.',
    true

  /* K/L. Repository exclusions and externally approved run manifest. */
  union all
  select
    'stale_package7','07-verification.sql_excluded',
    'EXTERNAL_EVIDENCE_REQUIRED',true,'repository state is external',
    'Exclude and mark SUPERSEDED / DO NOT EXECUTE or archive.',false
  union all
  select
    'stale_package7','07-final-verification.sql_excluded',
    'EXTERNAL_EVIDENCE_REQUIRED',true,'repository state is external',
    'Exclude and mark SUPERSEDED / DO NOT EXECUTE or archive.',false
  union all
  select
    'stale_package7','operator_execution_list',
    'EXTERNAL_EVIDENCE_REQUIRED',true,'not visible to PostgreSQL',
    'Retain an approved list containing only final Package 7 artifacts.',false
  union all
  select
    'run_manifest',item.check_name,
    'EXTERNAL_EVIDENCE_REQUIRED',true,'not hardcoded or supplied',
    item.action,false
  from (values
    ('approved_run_identifier','Approve a unique Package 7 run identifier.'),
    ('exact_fixture_uuid_manifest','Approve every exact fixture UUID.'),
    ('test_tenant_uuid','Approve one isolated test tenant UUID.'),
    ('second_isolation_tenant_uuid','Approve a second isolated tenant UUID.'),
    ('two_test_branch_uuids','Approve at least two isolated branch UUIDs.'),
    ('operator_observer_identity','Approve operator and observer identities.'),
    ('external_orchestration','Approve the multi-session orchestration mechanism.'),
    ('before_image_artifact','Approve location and SHA-256 of before-images.'),
    ('disposable_clone_identifier','Approve the exact single-use Clone identifier.'),
    ('database_project_reference','Approve the database project/reference identifier.'),
    ('host_identity','Approve the exact Clone host identity.'),
    ('baseline_snapshot_identifier','Approve the source snapshot or backup identifier.'),
    ('baseline_schema_hash','Approve the baseline schema SHA-256.'),
    ('clone_single_use','Confirm this Clone and run identifier have never been used.'),
    ('no_unrelated_workload','Confirm no unrelated user or workload can access the Clone.'),
    ('provider_disabled_attestation','Approve external provider-disablement evidence.'),
    ('evidence_export_plan','Approve durable export location and SHA-256 process.'),
    ('destruction_reset_plan','Approve external destruction/reset/recreate method.'),
    ('destruction_reset_owner','Approve the accountable disposal operator.'),
    ('post_disposal_attestation_plan','Approve the external attestation identifier and review path.')
  ) item(check_name,action)

  /* L. Prior evidence state; summaries are intentionally not selected. */
  union all
  select
    'prior_state','package7_evidence_inventory',
    case when count(*)=0 then 'EXTERNAL_EVIDENCE_REQUIRED'
      else 'REVIEW_REQUIRED'
    end,
    true,
    format(
      'rows=%s active_unsuperseded=%s',
      count(*),
      count(*) filter (
        where not exists (
          select 1
          from public.core_v2_verification_evidence superseding
          where superseding.supersedes_evidence_id=e.evidence_id
        )
      )
    ),
    'Reject Clone reuse and reconcile identifiers without exposing summaries.',
    false
  from public.core_v2_verification_evidence e
  where e.test_suite_identifier like 'package-7%'
     or e.package_version like 'package-7%'
     or e.package_version like 'core-v2-i5.9-package-7%'
  union all
  select
    'prior_state','approved_run_identifier_reuse',
    'EXTERNAL_EVIDENCE_REQUIRED',true,'approved identifier not supplied',
    'Compare the approved identifier with bounded evidence before fixture setup.',
    false
  union all
  select
    'prior_state','residual_fixture_namespace',
    'EXTERNAL_EVIDENCE_REQUIRED',true,'no approved fixture namespace supplied',
    'Retain external proof that the Clone is fresh and single-use.',false

  /* M. Before-image readiness: objects exist, retention remains external. */
  union all
  select
    'before_image','required_objects_exist',
    case when count(*)=6 then 'PASS' else 'FAIL' end,
    true,count(*)::text,
    'Activation, rate-limit, inventory and numbering objects must exist.',
    true
  from pg_class c
  where c.relnamespace='public'::regnamespace
    and c.relkind='r'
    and c.relname in (
      'core_v2_activation_control','core_v2_tenant_activation',
      'core_v2_branch_activation','core_v2_issuer_rate_limit_config',
      'inventory_stock','order_number_sequences'
    )
  union all
  select
    'before_image',item.check_name,
    'EXTERNAL_EVIDENCE_REQUIRED',true,'not retained by this read-only SQL',
    item.action,false
  from (values
    ('activation_singleton','Retain exact activation-singleton before-image.'),
    ('tenant_activation','Retain exact test-tenant activation before-image.'),
    ('branch_activation','Retain exact test-branch activation before-images.'),
    ('issuer_rate_limit','Retain exact rate-limit configuration before-image.'),
    ('policies_acls_triggers','Retain exact policy, ACL and trigger definitions.'),
    ('inventory_numbering','Retain exact fixture inventory/numbering baseline.')
  ) item(check_name,action)
),
final_rows(
  category, check_name, result, blocking, observed, required_action,
  database_verifiable
) as (
  select
    'final_gate','DATABASE_STATIC_GATE_PASS',
    case when (
      select coalesce(bool_and(result='PASS'),false)
      from checks
      where database_verifiable and blocking
    ) then 'PASS' else 'FAIL' end,
    true,
    format(
      'database_failures=%s',
      (select count(*) from checks
       where database_verifiable and blocking
         and result is distinct from 'PASS')
    ),
    'This certifies database-verifiable static checks only; it is not runtime PASS.',
    true
  union all
  select
    'final_gate','PACKAGE7_RUN_AUTHORIZATION_REQUIRED',
    'EXTERNAL_EVIDENCE_REQUIRED',true,
    format(
      'external_or_review_blockers=%s',
      (select count(*) from checks
       where blocking
         and result in ('FAIL','INSTALL_REQUIRED','REVIEW_REQUIRED',
                        'EXTERNAL_EVIDENCE_REQUIRED'))
    ),
    'Resolve every external/operator/review blocker before fixture setup.',
    false
)
select
  category::text,
  check_name::text,
  result::text,
  blocking::boolean,
  observed::text,
  required_action::text
from (
  select * from checks
  union all
  select * from final_rows
) output_rows
order by
  case category
    when 'server_environment' then 10
    when 'external_attestation' then 20
    when 'function_contract' then 30
    when 'table_contract' then 40
    when 'quote_linkage' then 50
    when 'role_contract' then 60
    when 'managed_identity' then 70
    when 'activation_state' then 80
    when 'execute_closure' then 90
    when 'table_closure' then 100
    when 'policy_contract' then 110
    when 'trigger_contract' then 120
    when 'default_acl' then 130
    when 'legacy_inventory' then 140
    when 'stale_package7' then 150
    when 'run_manifest' then 160
    when 'prior_state' then 170
    when 'before_image' then 180
    when 'final_gate' then 999
    else 900
  end,
  check_name;
