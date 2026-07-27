/* AFEX Core V2 Package 7 strictly read-only final database gate.
 * Run after authoritative suite evidence recording and before evidence export.
 * It consumes retained Package 7 outputs; it trusts no operator booleans.
 */
WITH required(suite) AS (
  VALUES
    ('package7.security_identity'),
    ('package7.authorization_context'),
    ('package7.financial_quote'),
    ('package7.atomic_order_replay'),
    ('package7.concurrency_outbox'),
    ('package7.activation_canary_legacy_rls'),
    ('package7.pre_disposal')
),
c AS (SELECT * FROM pg_temp.package7_fixture_context),
d AS (SELECT * FROM pg_temp.package7_pre_disposal_contract),
counts AS (
  SELECT r.suite,count(e.*) active_count,
    bool_and(e.result='PASS') FILTER (WHERE e.evidence_id IS NOT NULL) pass
  FROM required r CROSS JOIN c
  LEFT JOIN public.core_v2_verification_evidence e
    ON e.package_version='core-v2-package7-v1'
   AND e.environment=c.approved_environment
   AND e.test_run_identifier=c.package7_run_identifier
   AND e.test_suite_identifier=r.suite
   AND NOT EXISTS(
     SELECT 1 FROM public.core_v2_verification_evidence superseding
     WHERE superseding.supersedes_evidence_id=e.evidence_id
   )
  GROUP BY r.suite
),
digest AS (
  SELECT encode(extensions.digest(coalesce(string_agg(
    concat_ws('|',m.object_type,m.object_id::text,
      coalesce(m.parent_object_id::text,''),coalesce(m.tenant_id::text,''),
      coalesce(m.branch_id::text,''),coalesce(m.correlation_id::text,''),
      coalesce(m.idempotency_key_hash,''),
      coalesce(m.request_fingerprint,'')),
    E'\n' ORDER BY m.object_type,m.object_id),''),'sha256'),'hex') value
  FROM pg_temp.package7_runtime_ownership m
),
rows(test_name,result,blocking,expected,observed,required_action) AS (
  SELECT 'authoritative_pre_disposal_contract',
    CASE WHEN count(*)=1
      AND bool_and(d.database_gate_result='PASS')
      AND bool_and(d.run_identifier=c.package7_run_identifier)
      AND bool_and(d.clone_identifier=c.disposable_clone_identifier)
      AND bool_and(d.tenant_id=c.primary_tenant_id)
      AND bool_and(d.operator_profile_id=c.operator_profile_id)
      AND bool_and(d.observer_profile_id=c.observer_profile_id)
      AND bool_and(d.ownership_manifest_sha256=digest.value)
    THEN 'PASS' ELSE 'FAIL' END,true,
    'one exact authoritative pre-disposal contract with internally recomputed ownership digest',
    jsonb_build_object('rows',count(*),'digest_match',
      coalesce(bool_and(d.ownership_manifest_sha256=digest.value),false))::text,
    'rerun pre-disposal verification in the retained control session'
  FROM d CROSS JOIN c CROSS JOIN digest
  UNION ALL
  SELECT 'suite_evidence',
    CASE WHEN bool_and(active_count=1 AND pass) THEN 'PASS' ELSE 'FAIL' END,
    true,'each required suite exactly one active PASS',
    jsonb_agg(to_jsonb(counts) ORDER BY suite)::text,
    'repair duplicate, missing, or failed suite evidence'
  FROM counts
  UNION ALL
  SELECT 'clone_execution_identity',
    CASE WHEN current_user=c.test_executor_login_role::text
      AND current_user='afex_package7_test_executor'
      AND EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname=current_user
        AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb
        AND NOT r.rolcreaterole AND NOT r.rolinherit
        AND NOT r.rolreplication AND NOT r.rolbypassrls)
    THEN 'PASS' ELSE 'FAIL' END,true,
    'approved restricted Clone-only executor',
    format('current_user=%I',current_user),
    'STOP on identity drift'
  FROM c
  UNION ALL
  SELECT 'no_existing_final_aggregate',
    CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,true,
    'zero active in-Clone final aggregate evidence',count(*)::text,
    'final aggregate belongs in durable post-destruction evidence'
  FROM public.core_v2_verification_evidence e CROSS JOIN c
  WHERE e.package_version='core-v2-package7-v1'
    AND e.environment=c.approved_environment
    AND e.test_run_identifier=c.package7_run_identifier
    AND e.test_suite_identifier='package7.final.aggregate'
    AND NOT EXISTS(
      SELECT 1 FROM public.core_v2_verification_evidence superseding
      WHERE superseding.supersedes_evidence_id=e.evidence_id
    )
)
SELECT 'package7.final_gate' suite_name,rows.*,c.package7_run_identifier
FROM rows CROSS JOIN c
UNION ALL
SELECT 'package7.final_gate','DATABASE_PRE_DISPOSAL_FINAL_GATE_PASS',
 CASE WHEN bool_and(result='PASS') THEN 'PASS' ELSE 'FAIL' END,
 true,'every database-verifiable blocker exactly PASS','strict equality',
 'resolve every FAIL',c.package7_run_identifier
FROM rows CROSS JOIN c GROUP BY c.package7_run_identifier
UNION ALL
SELECT 'package7.final_gate','EVIDENCE_EXPORT_AND_DISPOSAL_REQUIRED',
 'EXTERNAL_EVIDENCE_REQUIRED',true,
 'export, disposal handoff, Clone destruction, then destruction attestation',
 'PostgreSQL cannot attest destruction of its own target.',
 'complete the external sequence exactly',c.package7_run_identifier
FROM c;
