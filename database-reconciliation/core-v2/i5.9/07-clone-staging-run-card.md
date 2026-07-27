# AFEX Core V2 Package 7 — Disposable Clone Run Card

Runtime state: **NOT EXECUTED**. Core V2 remains disabled.

Only a fresh, dedicated, single-use disposable Clone is permitted. Production
and shared Staging are prohibited. No row-level cleanup is performed.

`07-verification.sql` and `07-final-verification.sql` are superseded and must
never execute.

## Required external run contract

- Disposable Clone identifier
- Database project/reference and host identity
- Baseline snapshot/backup identifier and schema hash
- Package 7 run identifier and 16-artifact SHA-256 manifest
- Exact deterministic fixture UUID manifest
- Distinct operator and observer identities
- Provider-disabled attestation reference
- Non-Production target attestation reference
- Evidence export location and SHA-256 manifest process
- Destruction/reset/recreate method and accountable owner
- Post-disposal attestation identifier
- Change ticket

PostgreSQL cannot prove these facts. Missing approval is a STOP.

## Artifact order

1. `07-pre-run-verification.sql`
2. `07a-fixture-setup.sql`
3. `07b-security-and-identity-tests.sql`
4. `07c-authorization-tests.sql`
5. `07d-financial-quote-tests.sql`
6. `07e-atomic-order-and-replay-tests.sql`
7. `07f-concurrency-and-outbox-runbook.md`
8. `07g-activation-canary-legacy-and-rls-tests.sql`
9. `07-pre-cleanup-verification.sql` — pre-disposal database gate
10. `07-suite-evidence-recording.sql`
11. `07-final-gate-verification.sql`
12. `07-final-evidence-recording.sql` — evidence export contract
13. `07-cleanup.sql` — non-mutating disposal handoff
14. `07-post-cleanup-verification.sql` — destruction-attestation requirements
15. `07-security-review.md`
16. This run card

Every source hash requires external approval before execution.

## Exact workflow

1. Provision a fresh dedicated Clone from the approved baseline.
2. Verify project/reference, host, snapshot and all dependency hashes.
3. Externally disable email, WhatsApp, SMS, webhooks and delivery workers.
4. Approve the run, Clone, identities and deterministic UUID manifest.
5. Provision the single Clone-only `afex_package7_test_executor` LOGIN with
   reviewed restricted attributes, direct test ACLs and Clone-only RLS
   policies. It must have no role memberships.
6. Run preflight directly as that LOGIN; every database blocker must PASS.
7. Run fixture setup and retain the control session.
8. Run security, authorization, quote and atomic suites.
9. Run the multi-session concurrency/outbox plan.
10. Run activation tests and restore globally disabled state with kill switch on.
11. Run pre-disposal verification and retain its authoritative outputs.
12. Record suite evidence from those outputs.
13. Run the final database gate.
14. Export and hash every database and operator artifact.
15. Execute the non-mutating disposal handoff.
16. Destroy the disposable Clone externally.
17. Retain and review control-plane destruction attestation.
18. Perform final review in the durable external evidence repository.
19. Mark the run complete only after all external gates pass.

## STOP conditions

STOP on:

- Production ambiguity or shared workload;
- reused Clone/run/fixture UUID;
- baseline or artifact hash mismatch;
- stale Package 7 artifact inclusion;
- provider enablement;
- role, ACL, RLS, trigger or function drift;
- Core V2 enabled or kill switch disabled;
- lost control session before evidence export;
- unexpected SQLSTATE, deadlock, timeout or unknown commit;
- missing owned UUID, unexpected descendant or unrelated mutation;
- delivered provider event;
- any FAIL, REVIEW_REQUIRED or NOT_RUN;
- missing export hash, reviewer authorization or destruction plan.

On failure, preserve sanitized evidence, quarantine the disposable Clone and
dispose it externally after review. Never attempt row-level quote cleanup.

## Final evidence rule

Individual suite evidence is recorded and exported before disposal. The sole
aggregate final result must survive Clone destruction, so it is retained only
in the approved durable external evidence repository after destruction/reset
attestation. No in-Clone artifact may claim post-disposal success.
