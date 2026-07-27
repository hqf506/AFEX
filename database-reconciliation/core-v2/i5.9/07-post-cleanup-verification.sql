/* AFEX Core V2 Package 7 post-disposal external-attestation contract.
 *
 * CLASSIFICATION: STRICTLY READ-ONLY / PRE-DISPOSAL OUTPUT ONLY
 *
 * A destroyed or reset Clone cannot verify its own destruction. This artifact
 * runs, if retained for chain compatibility, before disposal and emits only
 * the external evidence still required. It never claims post-disposal success.
 * Final confirmation belongs in the durable external evidence repository.
 *
 * 07-verification.sql and 07-final-verification.sql are SUPERSEDED:
 * DO NOT EXECUTE.
 */
WITH requirements(test_name, expected, required_action) AS (
  VALUES
    ('disposable_clone_identifier',
     'exact externally approved single-use Clone identifier',
     'bind the attestation to the exact Clone'),
    ('destruction_reset_method',
     'approved destroy, reset, or recreate method',
     'retain the approved method'),
    ('destruction_reset_owner',
     'approved accountable operator identity',
     'retain operator and reviewer signatures'),
    ('destruction_reset_attestation_identifier',
     'unique durable external attestation identifier',
     'create only after disposal completes'),
    ('evidence_export_sha256_manifest',
     'approved SHA-256 manifest exported before disposal',
     'verify the durable exported evidence'),
    ('post_disposal_target_absence',
     'external control-plane proof that the disposable target no longer exists or was reset',
     'verify outside the destroyed Clone')
)
SELECT
  'package7.post_disposal_external_attestation'::text AS suite_name,
  test_name,
  'EXTERNAL_EVIDENCE_REQUIRED'::text AS result,
  true AS blocking,
  expected,
  'Not provable by SQL executed inside the disposable Clone.'::text AS observed,
  required_action
FROM requirements
UNION ALL
SELECT
  'package7.post_disposal_external_attestation',
  'POST_DISPOSAL_STATUS',
  'EXTERNAL_EVIDENCE_REQUIRED',
  true,
  'externally reviewed destruction/reset attestation',
  'Clone still exists while this query can execute.',
  'Do not claim completion inside this database';
