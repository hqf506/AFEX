# W1 independent review runbook

## Authority boundary

The W1 database Foundation was installed by the human owner and the authoritative read-only result is `AFEX_MULTI_DEVICE_W1_POST_ATTESTATION_PASS` with `ready=true`, no failure classifications and zero failed checks. Codex executed no SQL and made no database connection in the application/Preview phase. W1 authorizes only concurrent device onboarding, preparation and device-bound PIN bootstrap. It does not authorize concurrent Offline checkout, W2 inventory conflict changes, providers, external effects or Production deployment.

## Required order

1. Review the official W0 live output and confirm its decision remains `AFEX_MULTI_DEVICE_W0_LIVE_CATALOG_ATTESTATION_PASS`.
2. Compare the preflight's exact function identities, relation metadata, ACL rows, policies, constraints, indexes, triggers and PostgreSQL 17 membership rows directly to that official W0 output. The live employee relation is `offline_employee_authorities`, the live command relation is `offline_command_bindings`, and the current V2 bootstrap state is `active`. For each of the seven protected relations, the exact ordered owner ACL is `DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`; `MAINTAIN` is attested as existing PostgreSQL 17 owner authority and is never granted or revoked by W1. Require exact bidirectional equality for these four live triggers:
   - `offline_device_events.offline_device_events_immutable_guard` → `afex_offline_authority.reject_immutable_offline_evidence_v1()`
   - `offline_pre_pin_bootstrap_events_v2.offline_pre_pin_bootstrap_events_immutable_v2` → `afex_offline_authority.reject_immutable_offline_evidence_v1()`
   - `offline_command_bindings.offline_command_bindings_immutable_guard` → `afex_offline_authority.reject_offline_command_binding_mutation_v1()`
   - `offline_employee_authorities.offline_employee_authorities_capacity_guard` → `afex_offline_authority.enforce_enrollment_capacity_v1()`
   A three-row subset, an extra row, a disabled required trigger, or the historical wrong command-binding function must fail. W1 must contain no trigger creation, alteration, or removal statement.
   Also verify that all three FK attestation boundaries declare `expected_deferrable`, `expected_initially_deferred`, `expected_update_action`, and `expected_delete_action`; the reserved-name forms `...,deferrable,deferred)` are prohibited. Exactly twenty FK rows must be `false,false,'r','r'`. The single `offline_employee_authorities_device_envelope_scope_fk` row must be `true,true,'a','a'`, preserving PostgreSQL `NO ACTION` semantics for its deferrable, initially-deferred identity. A global `confupdtype<>'r'` or `confdeltype<>'r'` assumption is prohibited. The post-attestation must return the same 21 live FK identities and compare actions and deferrability per expected row, with no extra FK.
   At every ACL boundary, verify that `PUBLIC` and `pg_roles.rolname` are converted to `text` at source and that grantee arrays use `ARRAY_AGG(a.grantee::text ORDER BY a.grantee::text)`. The seven source boundaries and three array aggregates must be present; an uncast `ELSE grantee.rolname END AS grantee` or `ARRAY_AGG(a.grantee ORDER BY a.grantee)` is a hard failure because it recreates PostgreSQL `42883` (`name[] = text[]`).
3. Treat `00`, `01`, and `02` as historical installed identities. Do not rerun or change them during application activation. The accepted `02` result is `AFEX_MULTI_DEVICE_W1_POST_ATTESTATION_PASS`, `ready=true`, `failureClassifications=[]`, failed checks `0`.
4. Review the application selector: only exact `VERCEL_ENV=preview` plus exact server-only flag value `true` selects V3; every other state selects V2. Verify all four operations use `prePinFacade`.
5. Verify the GET context sets the selected contract in the short-lived HttpOnly Strict-SameSite attempt cookie and every POST compares it to the active deployment contract before payload parsing, trusted-context resolution or RPC invocation. Missing or mismatched binding must return `OFFLINE_PRE_PIN_ATTEMPT_CONTRACT_MISMATCH`.
6. Commit and push only the manifest-covered W1 application/tests/evidence. Keep unrelated dirty files unstaged.
7. Set `AFEX_OFFLINE_MULTI_DEVICE_ONBOARDING_W1_ENABLED=true` only for Preview, deploy the exact commit, wait for READY, and verify the permanent branch alias maps to it. Production must remain V2 and must not receive the W1 flag.
8. Test the permanent branch origin with two separate real devices. Confirm the existing device remains active, then provision the second device and verify both independently reach their own PIN bootstrap.
9. Do not run Offline checkout as W1 qualification. W2 is separate.

## Application and test source review

Review the complete current files—not hashes alone—at:

- `lib/server/offline/pre-pin-provisioning.ts`
- `tests/pos-offline-multi-device-w1.test.mjs`
- `tests/pos-offline-pre-pin-safe-diagnostics.test.mjs`

They are covered by the W1 manifest with repository-relative paths so an independent reviewer can inspect the full V3 routing, Preview-only feature flag, and safe diagnostic implementation in place.

## Human acceptance

- Existing device, active V2 bootstrap and key envelope retain exact identity.
- Second and third devices prepare without a replacement prompt.
- Repeating the same device request is stable; same `deviceId` with different key material fails closed.
- A logout/restart on one device does not mutate sibling authority.
- No browser role has direct function EXECUTE.
- No provider, business or external effect occurs.

## Emergency action

If W1 ingress must be closed, independently review and execute `90-DEACTIVATE-W1-MULTI-DEVICE-ONBOARDING.sql` as a whole transaction, then set the Preview flag false. The operation preserves data and does not restore the singleton index. See `W1-DEACTIVATION-CONTRACT.md`.
