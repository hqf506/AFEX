# Final Decision

## Decision

`AFEX_POS_LOCAL_FIRST_OFFLINE_ENGINE_PRODUCTION_READ_ONLY_ATTESTATION_COMPLETE_READY_FOR_HUMAN_REVIEW`

This decision completes a read-only authority attestation. It does not approve Phase 5, a migration, a Core change, Production deployment, Offline order replay, or an operational pilot.

## 1. Already deployed and reusable

Core V2 provides a durable immutable command/payload ledger, fingerprint conflict detection, serialized claims, atomic order/invoice/inventory persistence, unique official numbering, stable server receipts, and exact replay. The online POS actor subsystem provides tenant/branch/PIN-bound session issuance, validation, expiry, revocation, and credential fingerprinting. Customer phone identity helpers are tenant/branch aware.

## 2. Implementable without database changes

Client presentation and local-only mechanics can proceed only behind disabled flags: progress UI, connection/sync status, local stock projection, zero-stock blocking, transport scheduling, and redacted diagnostics. They cannot be connected to Production command acceptance yet.

## 3. Requires separately reviewed database authority

Device registration/generation, offline employee authority, payment attestation, review container, external-effect ledger, eight-method canonical mapping, cancellation parity, and Production RLS/execute-ACL hardening require independent migration design and review. This phase created no executable database artifact.

## 4. Requires Core V2 completion first

Core acquisition must bind the actual POS employee and registered device generation, enforce revocation during replay, validate the offline envelope, route business conflicts without weakening exact duplicates, and write effect intents atomically.

## 5. Unsafe for Offline use

The broad legacy RLS/function surface, client-attribution fallback, missing device binding, missing review/effect containers, incomplete payment vocabulary, and drifted cancellation function are unsafe foundations for Offline Production acceptance. The one-device assumption does not remove concurrent server stock mutation.

## 6. Phase 5

Phase 5 may not begin. Human authority and security decisions plus separately reviewed database/Core work remain mandatory.

## 7. Smallest safe sequence

1. human approval of this attestation and Offline PIN mode;
2. urgent scoped review of Production RLS and SECURITY DEFINER execute ACLs;
3. independent device/review/payment/effect migration design;
4. Core V2 actor/device/replay/effect bridge and isolated qualification;
5. Phase 5 client synchronization behind kill switches;
6. Preview qualification and one-branch managed-device pilot.

## 8. Estimate

A realistic estimate is 10–14 senior engineer-weeks plus database/security review, or roughly 8–12 calendar weeks with two engineers before a controlled pilot. This is not a schedule commitment; the ACL/RLS review and PIN mode decision are critical-path risks.

## 9. Human decisions

Humans must select Mode A or B, approve the security remediation plan, choose the review-container model, approve payment aliases/attestation/refund policy, approve effect delivery semantics, and approve pilot/retention/kill-switch ownership.

## Safety

Production reads: catalog and bounded aggregates only. Production writes: 0. Business effects: 0. SQL/migration drafts: 0. Application source changes: 0. Git writes: 0. Deployments: 0. Phase 5 work: 0.
