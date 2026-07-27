/* AFEX Core V2 Package 7 authoritative suite evidence recording.
 * Dedicated disposable Clone only. Run after 07-pre-cleanup-verification.sql.
 * Operator-entered booleans and ownership digests are prohibited.
 */
BEGIN;
DO $guard$
DECLARE
  c pg_temp.package7_fixture_context%ROWTYPE;
  operator_row public.profiles%ROWTYPE;
  observer_row public.profiles%ROWTYPE;
BEGIN
  IF pg_catalog.to_regclass('pg_temp.package7_fixture_context') IS NULL
     OR pg_catalog.to_regclass('pg_temp.package7_runtime_ownership') IS NULL
     OR pg_catalog.to_regclass('pg_temp.package7_pre_disposal_results') IS NULL
     OR pg_catalog.to_regclass('pg_temp.package7_pre_disposal_contract') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='PACKAGE7_AUTHORITATIVE_OUTPUTS_MISSING';
  END IF;
  SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
  SELECT * INTO STRICT operator_row FROM public.profiles
   WHERE id=c.operator_profile_id;
  SELECT * INTO STRICT observer_row FROM public.profiles
   WHERE id=c.observer_profile_id;
  IF current_user<>c.test_executor_login_role::text
     OR operator_row.id=observer_row.id
     OR NOT operator_row.is_active OR NOT observer_row.is_active
     OR operator_row.tenant_id<>c.primary_tenant_id
     OR observer_row.tenant_id<>c.primary_tenant_id
     OR operator_row.role NOT IN ('owner','admin')
  THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='PACKAGE7_EVIDENCE_IDENTITY_CONTRACT_FAILED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.package7_pre_disposal_results
    WHERE blocking AND result<>'PASS'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_temp.package7_pre_disposal_contract
    WHERE run_identifier=c.package7_run_identifier
      AND clone_identifier=c.disposable_clone_identifier
      AND tenant_id=c.primary_tenant_id
      AND database_gate_result='PASS'
      AND ownership_manifest_sha256~'^[0-9a-f]{64}$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='PACKAGE7_PRE_DISPOSAL_GATE_NOT_AUTHORITATIVE_PASS';
  END IF;
END;
$guard$;

CREATE TEMP TABLE pg_temp.package7_suite_evidence_parameters(
  suite_identifier text PRIMARY KEY,
  source_sha256 text NOT NULL,
  suite_result text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  result_summary text NOT NULL,
  change_ticket text NOT NULL,
  evidence_export_plan_reference text NOT NULL
) ON COMMIT PRESERVE ROWS;

INSERT INTO pg_temp.package7_suite_evidence_parameters VALUES
 ('package7.security_identity','REPLACE_WITH_64_HEX_SHA256','NOT_RUN','-infinity','-infinity','REPLACE_WITH_APPROVED_SUMMARY','REPLACE_TICKET','REPLACE_WITH_EXPORT_PLAN'),
 ('package7.authorization_context','REPLACE_WITH_64_HEX_SHA256','NOT_RUN','-infinity','-infinity','REPLACE_WITH_APPROVED_SUMMARY','REPLACE_TICKET','REPLACE_WITH_EXPORT_PLAN'),
 ('package7.financial_quote','REPLACE_WITH_64_HEX_SHA256','NOT_RUN','-infinity','-infinity','REPLACE_WITH_APPROVED_SUMMARY','REPLACE_TICKET','REPLACE_WITH_EXPORT_PLAN'),
 ('package7.atomic_order_replay','REPLACE_WITH_64_HEX_SHA256','NOT_RUN','-infinity','-infinity','REPLACE_WITH_APPROVED_SUMMARY','REPLACE_TICKET','REPLACE_WITH_EXPORT_PLAN'),
 ('package7.concurrency_outbox','REPLACE_WITH_64_HEX_SHA256','NOT_RUN','-infinity','-infinity','REPLACE_WITH_APPROVED_SUMMARY','REPLACE_TICKET','REPLACE_WITH_EXPORT_PLAN'),
 ('package7.activation_canary_legacy_rls','REPLACE_WITH_64_HEX_SHA256','NOT_RUN','-infinity','-infinity','REPLACE_WITH_APPROVED_SUMMARY','REPLACE_TICKET','REPLACE_WITH_EXPORT_PLAN'),
 ('package7.pre_disposal','REPLACE_WITH_64_HEX_SHA256','NOT_RUN','-infinity','-infinity','REPLACE_WITH_APPROVED_SUMMARY','REPLACE_TICKET','REPLACE_WITH_EXPORT_PLAN');

DO $validate$
DECLARE c pg_temp.package7_fixture_context%ROWTYPE;
BEGIN
  SELECT * INTO STRICT c FROM pg_temp.package7_fixture_context;
  IF (SELECT count(*) FROM pg_temp.package7_suite_evidence_parameters)<>7
     OR EXISTS(
       SELECT 1 FROM pg_temp.package7_suite_evidence_parameters
       WHERE suite_result<>'PASS' OR source_sha256!~'^[0-9a-f]{64}$'
          OR completed_at<started_at OR change_ticket<>c.approved_change_ticket
          OR result_summary LIKE 'REPLACE_%'
          OR evidence_export_plan_reference LIKE 'REPLACE_%'
     )
     OR EXISTS(
       SELECT 1
       FROM pg_temp.package7_suite_evidence_parameters p
       JOIN public.core_v2_verification_evidence e
         ON e.package_version='core-v2-package7-v1'
        AND e.environment=c.approved_environment
        AND e.test_run_identifier=c.package7_run_identifier
        AND e.test_suite_identifier=p.suite_identifier
       WHERE NOT EXISTS(
         SELECT 1 FROM public.core_v2_verification_evidence superseding
         WHERE superseding.supersedes_evidence_id=e.evidence_id
       )
     )
  THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='PACKAGE7_SUITE_EVIDENCE_CONTRACT_FAILED';
  END IF;
END;
$validate$;

SELECT p.suite_identifier,
 public.record_core_v2_verification_evidence_v1(
   'core-v2-package7-v1',c.approved_environment,c.primary_tenant_id,NULL,
   p.suite_identifier,c.package7_run_identifier,p.source_sha256,'PASS',
   p.started_at,p.completed_at,c.operator_profile_id,p.change_ticket,
   p.result_summary||'; observer='||c.observer_profile_id::text||
   '; clone='||c.disposable_clone_identifier||
   '; baseline='||c.baseline_snapshot_identifier||
   '; ownership_manifest_sha256='||d.ownership_manifest_sha256||
   '; export_plan='||p.evidence_export_plan_reference,
   NULL
 ) AS evidence_id
FROM pg_temp.package7_suite_evidence_parameters p
CROSS JOIN pg_temp.package7_fixture_context c
CROSS JOIN pg_temp.package7_pre_disposal_contract d
ORDER BY p.suite_identifier;
COMMIT;
