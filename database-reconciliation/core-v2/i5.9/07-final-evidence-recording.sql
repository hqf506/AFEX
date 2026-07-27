/* AFEX Core V2 Package 7 final evidence handoff.
 *
 * CLASSIFICATION: STRICTLY READ-ONLY / NO EVIDENCE RECORDING
 *
 * The sole final aggregate evidence must not be recorded only inside a Clone
 * that will be destroyed. Suite evidence and pre-disposal database results are
 * exported first. Final aggregate evidence is created in the separately
 * approved durable evidence repository only after external destruction/reset
 * attestation review.
 *
 * 07-verification.sql and 07-final-verification.sql are SUPERSEDED:
 * DO NOT EXECUTE.
 */
WITH requirements(test_name, expected) AS (
  VALUES
    ('database_pre_disposal_final_gate',
     'DATABASE_PRE_DISPOSAL_FINAL_GATE_PASS'),
    ('evidence_export_manifest',
     'approved external SHA-256 manifest'),
    ('external_disposal_authorization',
     'approved before destruction/reset'),
    ('external_destruction_attestation',
     'approved after destruction/reset'),
    ('durable_evidence_repository',
     'separate reviewed repository that survives Clone disposal'),
    ('operator_observer_separation',
     'distinct approved operator and observer')
)
SELECT
  'package7.final_external_evidence'::text AS suite_name,
  test_name,
  'EXTERNAL_EVIDENCE_REQUIRED'::text AS result,
  true AS blocking,
  expected,
  'Final aggregate evidence is intentionally not written inside this Clone.'
    AS observed,
  'Complete and review this requirement in the durable external evidence repository.'
    AS required_action
FROM requirements
UNION ALL
SELECT
  'package7.final_external_evidence',
  'PACKAGE7_FINAL_STATUS',
  'EXTERNAL_EVIDENCE_REQUIRED',
  true,
  'post-disposal external aggregate approval',
  'No in-Clone final PASS is permitted.',
  'STOP until external destruction/reset and evidence review are complete';
