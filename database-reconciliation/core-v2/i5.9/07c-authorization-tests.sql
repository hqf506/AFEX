/* AFEX Core V2 Package 7 / package7.authorization_context
Disposable Clone runtime suite. Production/shared Staging and provider delivery
are prohibited; provider disablement is externally attested.
Run after 07a in the same database session. Raw tokens and PINs are never
stored, selected, logged, or written to the result table. */
BEGIN;

DO $guard$
DECLARE c pg_temp.package7_fixture_context%ROWTYPE;
BEGIN
  IF pg_catalog.to_regclass('pg_temp.package7_fixture_context') IS NULL
     OR pg_catalog.to_regclass('pg_temp.package7_before_images') IS NULL
     OR pg_catalog.to_regclass('pg_temp.package7_created_rows') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_CONTEXT_MISSING';
  END IF;
  IF pg_catalog.to_regclass('pg_temp.package7_authorization_results') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_STALE_RESULTS_PRESENT';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_temp.package7_fixture_context)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_CONTEXT_ROW_COUNT_INVALID';
  END IF;
  SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
  IF current_user <> 'afex_package7_test_executor'
     OR c.test_executor_login_role <> current_user::name THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='PACKAGE7_TEST_EXECUTOR_REQUIRED';
  END IF;
  IF c.package7_run_identifier IS NULL OR pg_catalog.btrim(c.package7_run_identifier)=''
     OR pg_catalog.length(c.package7_run_identifier)>90
     OR c.approved_environment NOT IN('development','staging')
     OR c.before_image_retention_identifier IS NULL
     OR pg_catalog.btrim(c.before_image_retention_identifier)=''
     OR c.setup_transaction_id IS NULL
     OR c.primary_tenant_id IS NULL OR c.isolation_tenant_id IS NULL
     OR c.primary_branch_id IS NULL OR c.secondary_branch_id IS NULL
     OR c.isolation_branch_id IS NULL OR c.primary_customer_id IS NULL
     OR c.isolation_customer_id IS NULL OR c.tracked_item_id IS NULL
     OR c.service_item_id IS NULL OR c.isolation_item_id IS NULL
     OR c.primary_branch_item_id IS NULL OR c.secondary_branch_item_id IS NULL
     OR c.isolation_branch_item_id IS NULL OR c.primary_vat_id IS NULL
     OR c.isolation_vat_id IS NULL OR c.primary_discount_id IS NULL
     OR c.primary_inventory_id IS NULL OR c.secondary_inventory_id IS NULL
     OR c.isolation_inventory_id IS NULL OR c.operator_profile_id IS NULL
     OR c.observer_profile_id IS NULL OR c.primary_actor_profile_id IS NULL
     OR c.isolation_actor_profile_id IS NULL
     OR c.managed_runtime_identity_id IS NULL
     OR c.managed_outbox_identity_id IS NULL OR c.sequence_month IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_CONTEXT_INVALID';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_temp.package7_before_images)<>29
     OR (SELECT pg_catalog.count(*) FROM pg_temp.package7_created_rows)<>26 THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_MANIFEST_COUNT_INVALID';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.package7_before_images
            WHERE object_name='public.core_v2_issuer_rate_limit_config')
     OR EXISTS(SELECT 1 FROM pg_temp.package7_created_rows
               WHERE object_name='public.core_v2_issuer_rate_limit_config') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_RATE_LIMIT_OWNERSHIP_FORBIDDEN';
  END IF;
END $guard$;

CREATE TEMP TABLE pg_temp.package7_authorization_results(
 suite_name text NOT NULL DEFAULT 'package7.authorization_context',
 test_name text NOT NULL,result text NOT NULL CHECK(result IN('PASS','FAIL','NOT_RUN')),
 blocking boolean NOT NULL,expected text NOT NULL,observed text NOT NULL,
 required_action text,run_identifier text NOT NULL,
 PRIMARY KEY(run_identifier,test_name)
) ON COMMIT PRESERVE ROWS;
CREATE PROCEDURE pg_temp.package7_authorization_put(
 n text,r text,e text,o text,a text DEFAULT NULL,b boolean DEFAULT true)
LANGUAGE plpgsql AS $p$
BEGIN
 INSERT INTO pg_temp.package7_authorization_results
 (test_name,result,blocking,expected,observed,required_action,run_identifier)
 SELECT n,r,b,e,o,a,package7_run_identifier FROM pg_temp.package7_fixture_context;
END $p$;

DO $tests$
DECLARE
 c pg_temp.package7_fixture_context%ROWTYPE;
 v_token text; v_id uuid; v_exp timestamptz; v_hash text;
 v_corr uuid; v_row record; v_state text; v_sqlstate text; v_message text;
 v_request text; v_pos_pin text:=pg_catalog.current_setting('afex.package7_pos_pin',true);
BEGIN
 SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
 IF auth.uid() IS DISTINCT FROM c.primary_actor_profile_id THEN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='PACKAGE7_AUTHENTICATED_ACTOR_SESSION_REQUIRED';
 END IF;

 v_hash:=pg_catalog.encode(extensions.digest(c.package7_run_identifier||':auth:base','sha256'),'hex');
 v_request:='package7:'||c.package7_run_identifier||':auth-base';
 SELECT context_id,context_token,expires_at INTO STRICT v_id,v_token,v_exp
 FROM public.issue_atomic_authorization_context_v1(c.primary_branch_id,v_hash,v_request);
 SELECT * INTO STRICT v_row FROM public.atomic_authorization_contexts WHERE context_id=v_id;
 CALL pg_temp.package7_authorization_put('authenticated_issuance',
  CASE WHEN v_row.state='issued' AND v_exp>pg_catalog.clock_timestamp() THEN 'PASS' ELSE 'FAIL' END,
  'one issued unexpired context','context_id='||v_id||';state='||v_row.state);
 CALL pg_temp.package7_authorization_put('tenant_branch_actor_purpose_binding',
  CASE WHEN v_row.tenant_id=c.primary_tenant_id AND v_row.branch_id=c.primary_branch_id
   AND v_row.authenticated_user_id=c.primary_actor_profile_id
   AND v_row.purpose='create_order_atomic_v2'
   AND v_row.idempotency_key_hash=v_hash
   AND v_row.authorization_source='authenticated_user_jwt' THEN 'PASS' ELSE 'FAIL' END,
  'exact tenant/branch/actor/purpose/key binding',
  pg_catalog.jsonb_build_object('context_id',v_id,'tenant_ok',v_row.tenant_id=c.primary_tenant_id,
   'branch_ok',v_row.branch_id=c.primary_branch_id,'actor_ok',
   v_row.authenticated_user_id=c.primary_actor_profile_id,'purpose',v_row.purpose)::text);
 SELECT * INTO STRICT v_row FROM public.validate_atomic_authorization_context_for_quote_v1(v_token);
 CALL pg_temp.package7_authorization_put('quote_purpose_validation',
  CASE WHEN v_row.authorization_context_id=v_id AND v_row.tenant_id=c.primary_tenant_id
   AND v_row.branch_id=c.primary_branch_id THEN 'PASS' ELSE 'FAIL' END,
  'non-consuming quote validation succeeds','context_id='||v_id);
 CALL pg_temp.package7_authorization_put('output_redaction',
  CASE WHEN pg_catalog.position(v_token IN
    (SELECT pg_catalog.string_agg(observed||pg_catalog.coalesce(required_action,''),'')
     FROM pg_temp.package7_authorization_results))=0 THEN 'PASS' ELSE 'FAIL' END,
  'raw token absent from retained results','token_retained=false');

 /* Wrong idempotency binding: only the expected operation is trapped. */
 BEGIN
  v_corr:=pg_catalog.gen_random_uuid();
  PERFORM * FROM public.consume_atomic_authorization_context_v1(
   v_token,pg_catalog.repeat('f',64),v_corr);
  CALL pg_temp.package7_authorization_put('wrong_binding','FAIL','28000 CONTEXT_BINDING_INVALID','unexpected success');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_sqlstate=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  CALL pg_temp.package7_authorization_put('wrong_binding',CASE WHEN v_sqlstate='28000' AND v_message='CONTEXT_BINDING_INVALID'
   THEN 'PASS' ELSE 'FAIL' END,'28000 CONTEXT_BINDING_INVALID',v_sqlstate||' '||v_message);
 END;
 SELECT state INTO v_state FROM public.atomic_authorization_contexts WHERE context_id=v_id;
 IF v_state<>'issued' THEN
  UPDATE pg_temp.package7_authorization_results SET result='FAIL',
   observed=observed||';context state='||v_state WHERE test_name='wrong_binding';
 END IF;

 /* Consume exactly once, then prove replay rejection. */
 v_corr:=pg_catalog.gen_random_uuid();
 SELECT * INTO STRICT v_row FROM public.consume_atomic_authorization_context_v1(v_token,v_hash,v_corr);
 SELECT state INTO v_state FROM public.atomic_authorization_contexts WHERE context_id=v_id;
 CALL pg_temp.package7_authorization_put('consume_once',CASE WHEN v_state='consumed' AND v_row.correlation_id=v_corr
  THEN 'PASS' ELSE 'FAIL' END,'one committed consumption','context_id='||v_id||';state='||v_state);
 BEGIN
  PERFORM * FROM public.consume_atomic_authorization_context_v1(v_token,v_hash,pg_catalog.gen_random_uuid());
  CALL pg_temp.package7_authorization_put('replay_denial','FAIL','28000 CONTEXT_ALREADY_CONSUMED','unexpected success');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_sqlstate=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  CALL pg_temp.package7_authorization_put('replay_denial',CASE WHEN v_sqlstate='28000' AND v_message='CONTEXT_ALREADY_CONSUMED'
   THEN 'PASS' ELSE 'FAIL' END,'28000 CONTEXT_ALREADY_CONSUMED',v_sqlstate||' '||v_message);
 END;

 /* Revocation and post-revocation rejection. */
 v_hash:=pg_catalog.encode(extensions.digest(c.package7_run_identifier||':auth:revoke','sha256'),'hex');
 SELECT context_id,context_token INTO STRICT v_id,v_token
 FROM public.issue_atomic_authorization_context_v1(c.primary_branch_id,v_hash,
  'package7:'||c.package7_run_identifier||':auth-revoke');
 PERFORM public.revoke_atomic_authorization_context_v1(v_id,'PACKAGE7_TEST');
 BEGIN
  PERFORM * FROM public.validate_atomic_authorization_context_for_quote_v1(v_token);
  CALL pg_temp.package7_authorization_put('revocation','FAIL','28000 CONTEXT_REVOKED','unexpected success');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_sqlstate=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  CALL pg_temp.package7_authorization_put('revocation',CASE WHEN v_sqlstate='28000' AND v_message='CONTEXT_REVOKED'
   THEN 'PASS' ELSE 'FAIL' END,'28000 CONTEXT_REVOKED',v_sqlstate||' '||v_message);
 END;

 /* Scope failures are issued through the actual public issuer. */
 BEGIN
  PERFORM * FROM public.issue_atomic_authorization_context_v1(
   c.isolation_branch_id,pg_catalog.repeat('a',64),'p7-wrong-tenant');
  CALL pg_temp.package7_authorization_put('wrong_tenant_branch','FAIL','42501 CONTEXT_SCOPE_INVALID','unexpected success');
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_sqlstate=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  CALL pg_temp.package7_authorization_put('wrong_tenant_branch',CASE WHEN v_sqlstate='42501' AND v_message='CONTEXT_SCOPE_INVALID'
   THEN 'PASS' ELSE 'FAIL' END,'42501 CONTEXT_SCOPE_INVALID',v_sqlstate||' '||v_message);
 END;

 /* Purpose/actor/expiry are exercised against fixture-owned rows in rollback
 subtransactions so the retained source row remains unchanged. */
 FOREACH v_state IN ARRAY ARRAY['purpose','actor','expiry'] LOOP
  v_hash:=pg_catalog.encode(extensions.digest(c.package7_run_identifier||':auth:'||v_state,'sha256'),'hex');
  SELECT context_id,context_token INTO STRICT v_id,v_token
  FROM public.issue_atomic_authorization_context_v1(c.primary_branch_id,v_hash,
   'package7:'||c.package7_run_identifier||':auth-'||v_state);
  BEGIN
   IF v_state='purpose' THEN
    UPDATE public.atomic_authorization_contexts SET purpose='wrong_purpose' WHERE context_id=v_id;
   ELSIF v_state='actor' THEN
    UPDATE public.atomic_authorization_contexts SET authenticated_user_id=c.isolation_actor_profile_id
     WHERE context_id=v_id;
   ELSE
    UPDATE public.atomic_authorization_contexts SET expires_at=pg_catalog.clock_timestamp()-interval '1 second'
     WHERE context_id=v_id;
   END IF;
   BEGIN
    PERFORM * FROM public.validate_atomic_authorization_context_for_quote_v1(v_token);
    RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='PACKAGE7_UNEXPECTED_SUCCESS';
   EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
    IF NOT (v_sqlstate='28000' AND v_message=CASE v_state
      WHEN 'purpose' THEN 'CONTEXT_PURPOSE_INVALID'
      WHEN 'actor' THEN 'CONTEXT_BINDING_INVALID' ELSE 'CONTEXT_EXPIRED' END) THEN
     RAISE EXCEPTION USING ERRCODE='PZ002',MESSAGE='PACKAGE7_WRONG_NEGATIVE_RESULT',
      DETAIL=v_sqlstate||' '||v_message;
    END IF;
   END;
   RAISE EXCEPTION USING ERRCODE='PZ999',MESSAGE='PACKAGE7_ROLLBACK_EXPECTED_MUTATION';
  EXCEPTION WHEN SQLSTATE 'PZ999' THEN
   CALL pg_temp.package7_authorization_put('wrong_'||v_state,'PASS',
    '28000 stable context error','expected error observed; mutation rolled back');
  WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS v_sqlstate=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
   CALL pg_temp.package7_authorization_put('wrong_'||v_state,'FAIL','28000 stable context error',v_sqlstate||' '||v_message);
  END;
 END LOOP;

 /* POS is the only optional test: no PIN is persisted or emitted. */
 IF v_pos_pin IS NULL OR v_pos_pin !~ '^[0-9]{4}$' THEN
  CALL pg_temp.package7_authorization_put('pos_pin_issuance','NOT_RUN','approved session-local afex.package7_pos_pin',
   'approved PIN material not supplied','supply only in isolated session',false);
 ELSE
  v_hash:=pg_catalog.encode(extensions.digest(c.package7_run_identifier||':auth:pos','sha256'),'hex');
  BEGIN
   SELECT context_id,context_token INTO STRICT v_id,v_token
   FROM public.issue_pos_atomic_authorization_context_v1(v_pos_pin,c.primary_branch_id,v_hash,
    'package7:'||c.package7_run_identifier||':auth-pos');
   SELECT * INTO STRICT v_row FROM public.atomic_authorization_contexts WHERE context_id=v_id;
   CALL pg_temp.package7_authorization_put('pos_pin_issuance',CASE WHEN v_row.authorization_source='pos_pin_server'
    AND v_row.tenant_id=c.primary_tenant_id AND v_row.branch_id=c.primary_branch_id
    THEN 'PASS' ELSE 'FAIL' END,'POS context exact scope','context_id='||v_id);
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS v_sqlstate=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
   CALL pg_temp.package7_authorization_put('pos_pin_issuance','FAIL','successful approved POS issuance',
    v_sqlstate||' '||v_message,'verify approved fixture PIN',false);
  END;
 END IF;

 CALL pg_temp.package7_authorization_put('disabled_activation',
  CASE WHEN NOT EXISTS(SELECT 1 FROM public.core_v2_activation_control
   WHERE global_enabled OR deterministic_canary_percentage<>0
      OR pos_enabled OR admin_orders_enabled OR quote_issuer_enabled
      OR outbox_worker_enabled OR NOT kill_switch) THEN 'PASS' ELSE 'FAIL' END,
  'global disabled and kill switch on','database state checked');
 CALL pg_temp.package7_authorization_put('rate_limit_configuration_read_only',
  CASE WHEN NOT EXISTS(SELECT 1 FROM pg_temp.package7_created_rows
   WHERE object_name='public.core_v2_issuer_rate_limit_config') THEN 'PASS' ELSE 'FAIL' END,
  'no fixture ownership or mutation','read-only configuration');
END $tests$;

SELECT * FROM pg_temp.package7_authorization_results ORDER BY test_name;
COMMIT;
