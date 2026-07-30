\set ON_ERROR_STOP on

-- AFEX Core V2 P2D.22 - Superseding Authorization Attestation
-- Read-only. Production P2D.20 is already installed and is not rerun.
-- Reuse the canonical P2D.22 exact-set verifier without duplicating its lists.

\ir P2D.22-FINAL-VERIFICATION-AUTHORIZATION-CONTRACT.sql

SELECT 'P2D22A_900_AUTHORIZATION_ATTESTATION_OK' AS marker;
