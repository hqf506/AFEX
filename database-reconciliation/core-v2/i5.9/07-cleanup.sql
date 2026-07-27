/* AFEX Core V2 Package 7 disposal handoff.
 *
 * CLASSIFICATION: STRICTLY READ-ONLY / NON-MUTATING STOP ARTIFACT
 * Clone only. Production and shared Staging are prohibited.
 *
 * Row cleanup is superseded. Immutable financial quotes and every other
 * Package 7 runtime row remain intact until the dedicated disposable Clone is
 * destroyed, reset, or recreated externally after evidence export and reviewer
 * authorization. This artifact performs no cleanup and records no evidence.
 *
 * 07-verification.sql and 07-final-verification.sql are SUPERSEDED:
 * DO NOT EXECUTE.
 */
WITH required_external_control(control_name, required_value) AS (
  VALUES
    ('disposable_clone_identifier', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('database_project_reference', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('host_identity', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('baseline_snapshot_identifier', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('non_production_target_attestation', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('provider_disabled_attestation', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('evidence_export_location', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('evidence_export_sha256_manifest', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('destruction_reset_method', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('destruction_reset_owner', 'EXTERNAL_APPROVAL_REQUIRED'),
    ('destruction_authorization', 'EXTERNAL_APPROVAL_REQUIRED')
)
SELECT
  'package7.disposal_handoff'::text AS suite_name,
  control_name AS test_name,
  'EXTERNAL_EVIDENCE_REQUIRED'::text AS result,
  true AS blocking,
  required_value AS expected,
  'PostgreSQL cannot prove or perform the approved external disposal step.'
    AS observed,
  'STOP. Export and review evidence, then destroy/reset the dedicated Clone externally.'
    AS required_action
FROM required_external_control
UNION ALL
SELECT
  'package7.disposal_handoff',
  'ROW_LEVEL_CLEANUP_PROHIBITED',
  'PASS',
  true,
  'no row-level cleanup',
  'This artifact contains no DELETE, UPDATE, INSERT, trigger bypass, or provider invocation.',
  'Preserve immutable rows until external Clone disposal';
