/* AFEX Core V2 Package 7 / package7.activation_canary_legacy_rls
Dedicated disposable Clone only; Production/shared Staging prohibited.
Every activation mutation runs in a subtransaction that is deliberately rolled
back. Package 6 remains frozen. Rate-limit configuration remains read-only.
07-verification.sql and 07-final-verification.sql: DO NOT EXECUTE. */
BEGIN;
DO $guard$
DECLARE c pg_temp.package7_fixture_context%ROWTYPE;
BEGIN
  IF pg_catalog.to_regclass('pg_temp.package7_fixture_context') IS NULL
     OR pg_catalog.to_regclass('pg_temp.package7_before_images') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_CONTEXT_MISSING';
  END IF;
  SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
  IF current_user<>'afex_package7_test_executor'
     OR c.test_executor_login_role<>current_user::name THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='PACKAGE7_TEST_EXECUTOR_REQUIRED';
  END IF;
END;
$guard$;

CREATE TEMP TABLE pg_temp.package7_activation_results(
  suite_name text NOT NULL DEFAULT 'package7.activation_canary_legacy_rls',
  test_name text NOT NULL,
  result text NOT NULL CHECK(result IN('PASS','FAIL')),
  blocking boolean NOT NULL,
  expected text NOT NULL,
  observed text NOT NULL,
  required_action text,
  run_identifier text NOT NULL,
  PRIMARY KEY(run_identifier,test_name)
) ON COMMIT PRESERVE ROWS;

CREATE PROCEDURE pg_temp.package7_activation_put(
  n text,r text,e text,o text,a text DEFAULT NULL
) LANGUAGE plpgsql AS $p$
BEGIN
  INSERT INTO pg_temp.package7_activation_results(
    test_name,result,blocking,expected,observed,required_action,run_identifier
  )
  SELECT n,r,true,e,o,a,package7_run_identifier
  FROM pg_temp.package7_fixture_context;
END;
$p$;

DO $tests$
DECLARE
  c pg_temp.package7_fixture_context%ROWTYPE;
  d record;
  n bigint;
  st text;
  msg text;
BEGIN
  SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;

  SELECT * INTO STRICT d FROM public.is_core_v2_request_enabled_v1(
    c.primary_tenant_id,c.primary_branch_id,
    c.package7_run_identifier||':activation-kill','pos'
  );
  CALL pg_temp.package7_activation_put(
    'kill_switch',
    CASE WHEN NOT d.enabled AND d.decision_reason='KILL_SWITCH_ACTIVE'
         THEN 'PASS' ELSE 'FAIL' END,
    'disabled / KILL_SWITCH_ACTIVE',
    pg_catalog.to_jsonb(d)::text
  );

  BEGIN
    UPDATE public.core_v2_activation_control SET
      kill_switch=false,global_enabled=true,pos_enabled=false,
      admin_orders_enabled=false,quote_issuer_enabled=false,
      outbox_worker_enabled=false,deterministic_canary_percentage=100
    WHERE singleton_id;
    SELECT * INTO STRICT d FROM public.is_core_v2_request_enabled_v1(
      c.primary_tenant_id,c.primary_branch_id,
      c.package7_run_identifier||':feature-disabled','pos'
    );
    IF d.enabled OR d.decision_reason<>'FEATURE_DISABLED' THEN
      RAISE EXCEPTION USING ERRCODE='PZ002',
        MESSAGE='PACKAGE7_FEATURE_GATE_RESULT_INVALID';
    END IF;
    RAISE EXCEPTION USING ERRCODE='PZ999',MESSAGE='PACKAGE7_ROLLBACK';
  EXCEPTION WHEN SQLSTATE 'PZ999' THEN
    CALL pg_temp.package7_activation_put('global_and_feature_gate','PASS',
      'global enabled but feature disabled -> FEATURE_DISABLED',
      'mutation and trigger version increment rolled back');
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS st=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
    CALL pg_temp.package7_activation_put('global_and_feature_gate','FAIL',
      'FEATURE_DISABLED',st||' '||msg);
  END;

  BEGIN
    UPDATE public.core_v2_activation_control SET
      kill_switch=false,global_enabled=true,pos_enabled=true,
      admin_orders_enabled=true,quote_issuer_enabled=true,
      outbox_worker_enabled=true,deterministic_canary_percentage=100
    WHERE singleton_id;
    UPDATE public.core_v2_tenant_activation SET
      enabled=true,canary_eligible=true,pos_enabled=true,
      admin_orders_enabled=true,quote_enabled=true
    WHERE tenant_id=c.primary_tenant_id;
    UPDATE public.core_v2_branch_activation SET
      enabled=true,canary_eligible=true,pos_enabled=true,
      admin_orders_enabled=true,quote_enabled=true
    WHERE tenant_id=c.primary_tenant_id AND branch_id=c.primary_branch_id;

    FOREACH msg IN ARRAY ARRAY['pos','admin_orders','quote','outbox_worker'] LOOP
      SELECT * INTO STRICT d FROM public.is_core_v2_request_enabled_v1(
        c.primary_tenant_id,c.primary_branch_id,
        c.package7_run_identifier||':enabled:'||msg,msg
      );
      IF NOT d.enabled OR d.decision_reason<>'ENABLED'
         OR d.canary_bucket NOT BETWEEN 0 AND 99 THEN
        RAISE EXCEPTION USING ERRCODE='PZ003',
          MESSAGE='PACKAGE7_ENABLED_GATE_RESULT_INVALID';
      END IF;
    END LOOP;

    SELECT * INTO STRICT d FROM public.is_core_v2_request_enabled_v1(
      c.isolation_tenant_id,c.isolation_branch_id,
      c.package7_run_identifier||':isolation','pos'
    );
    IF d.enabled OR d.decision_reason<>'TENANT_NOT_ENABLED' THEN
      RAISE EXCEPTION USING ERRCODE='PZ004',
        MESSAGE='PACKAGE7_ISOLATION_GATE_RESULT_INVALID';
    END IF;
    RAISE EXCEPTION USING ERRCODE='PZ999',MESSAGE='PACKAGE7_ROLLBACK';
  EXCEPTION WHEN SQLSTATE 'PZ999' THEN
    CALL pg_temp.package7_activation_put('tenant_branch_features_canary','PASS',
      'four enabled features at 100% and isolation tenant denied',
      'all activation mutations rolled back');
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS st=RETURNED_SQLSTATE,msg=MESSAGE_TEXT;
    CALL pg_temp.package7_activation_put('tenant_branch_features_canary','FAIL',
      'ENABLED plus TENANT_NOT_ENABLED isolation',st||' '||msg);
  END;

  SELECT pg_catalog.count(*) INTO n
  FROM public.verify_core_v2_activation_readiness_v2(
    c.approved_environment,'core-v2-package7-v1',
    c.primary_tenant_id,c.primary_branch_id
  );
  CALL pg_temp.package7_activation_put(
    'readiness_contract',
    CASE WHEN n>0 THEN 'PASS' ELSE 'FAIL' END,
    'readiness function returns one or more explicit gates',
    'gate_count='||n
  );

  SELECT pg_catalog.count(*) INTO n
  FROM pg_catalog.pg_class cl
  WHERE cl.oid IN(
    'public.inventory_stock'::pg_catalog.regclass,
    'public.inventory_movements'::pg_catalog.regclass,
    'public.orders'::pg_catalog.regclass,
    'public.invoices'::pg_catalog.regclass
  );
  CALL pg_temp.package7_activation_put('legacy_inventory','PASS',
    'four canonical legacy/runtime tables inventoried','count='||n);

  CALL pg_temp.package7_activation_put(
    'rls_contract',
    CASE WHEN NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class cl
      WHERE cl.oid IN(
        'public.core_v2_activation_control'::pg_catalog.regclass,
        'public.core_v2_tenant_activation'::pg_catalog.regclass,
        'public.core_v2_branch_activation'::pg_catalog.regclass
      ) AND NOT cl.relrowsecurity
    ) THEN 'PASS' ELSE 'FAIL' END,
    'RLS enabled on activation tables',
    'catalog state inspected'
  );

  IF EXISTS(
    SELECT 1 FROM public.core_v2_activation_control
    WHERE global_enabled OR NOT kill_switch OR pos_enabled
       OR admin_orders_enabled OR quote_issuer_enabled
       OR outbox_worker_enabled OR deterministic_canary_percentage<>0
  ) OR EXISTS(
    SELECT 1 FROM public.core_v2_tenant_activation
    WHERE tenant_id IN(c.primary_tenant_id,c.isolation_tenant_id)
      AND(enabled OR canary_eligible OR pos_enabled
       OR admin_orders_enabled OR quote_enabled)
  ) OR EXISTS(
    SELECT 1 FROM public.core_v2_branch_activation
    WHERE branch_id IN(
      c.primary_branch_id,c.secondary_branch_id,c.isolation_branch_id
    ) AND(enabled OR canary_eligible OR pos_enabled
       OR admin_orders_enabled OR quote_enabled)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='PACKAGE7_ACTIVATION_NOT_RESTORED';
  END IF;
END;
$tests$;

SELECT * FROM pg_temp.package7_activation_results ORDER BY test_name;
COMMIT;
