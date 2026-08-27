# Prompt 10 final decision

## Required answers

1. **Ten-prompt investigation/design program complete?** YES for evidence/design review: the historical allowlist failure remains recorded, and the separately authorized exact `P10-Q007R` correction supplies compliant function evidence. This does not authorize implementation, SQL, deployment, or Phase 5.
2. **Offline engine fully implemented?** NO.
3. **Already implemented in application source?** Phase 1 encrypted namespace/storage and restart recovery; Phase 2 safe static shell and authority-gated encrypted repository subset; Phase 3 shadow command/outbox foundation. Phase 4 is approved design only.
4. **What remains disabled?** Persistent unwrap, sensitive cache ingestion/reads, Production outbox persistence, dispatch/replay/interception, Offline `order.create`, payment/provider actions and all authority-dependent feature flags.
5. **Application-only work that may begin?** Exact seven-field trusted profile route and caller migration, inventory-history contract completion, synchronization UI and local inventory projection, all behind disabled flags.
6. **Requires Core V2 first?** Actual employee/device/generation binding, stable Offline acquisition/receipt, payment attestation, frontier/cancel/refund authority and atomic effect intent.
7. **Requires independent SQL/migration review?** Roles/private schemas, ACL/RLS closure, device/employee authority, unwrap metadata, Core bridge, review/payment/inventory/effect objects, constraints/indexes, rollback and post-change attestation.
8. **Remaining Production risks?** Broad historical relation/function ACLs, 34/36 relevant functions as SECURITY DEFINER, legacy browser EXECUTE reachability, nullable branch tenant structure, external/platform caller uncertainty, runtime/concurrency/rollback unproven.
9. **Any Prompt 8 SQL executable now?** NO; 0/13.
10. **Wave 1 authorized?** NO.
11. **Phase 5 implementation authorized?** NO.
12. **Offline `order.create` pilot authorized?** NO.
13. **All eight payment methods preserved?** YES in the required design contract; NO as current database/Core compatibility. `cod` and `bank_transfer` are not accepted by the current invoice check.
14. **Continuous Offline Mode A preserved?** YES: `MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE`.
15. **Last synchronization age informational only?** YES; it never creates time-based expiry or makes connectivity mandatory.
16. **Realistic remaining duration?** 14–20 senior-engineer weeks / 10–14 elapsed weeks with two senior engineers and independent review.
17. **Next single safe phase?** `APPLICATION_COMPATIBILITY_CLOSURE_BEHIND_DISABLED_FLAGS`.

## CA closure

- CA-001: PARTIALLY_PROVEN; composite target absent.
- CA-002: BLOCKED_SQL_DESIGN_REQUIRED + BLOCKED_CORE_V2_CHANGE_REQUIRED.
- CA-003: BLOCKED_CORE_V2_CHANGE_REQUIRED.
- CA-004: BLOCKED_SQL_DESIGN_REQUIRED.
- CA-005: BLOCKED_SQL_DESIGN_REQUIRED.
- CA-006: BLOCKED_CORE_V2_CHANGE_REQUIRED + BLOCKED_SQL_DESIGN_REQUIRED.
- CA-007: BLOCKED_CORE_V2_CHANGE_REQUIRED + BLOCKED_SQL_DESIGN_REQUIRED.

## Authorization

`PROMPT_10_PRODUCTION_ATTESTATION_COMPLETE_READY_FOR_HUMAN_REVIEW`

Historical `P10-Q007` remains a narrow, non-mutating allowlist failure because it read `pg_catalog.pg_language`. The single human-authorized replacement `P10-Q007R` read only `pg_proc`, `pg_namespace`, and `pg_roles`; returned 36 functions; proved `transactionReadOnly=true`; and completed with `ROLLBACK`. Matching by schema, name, and identity arguments produced 36/36 matches with zero differences in identity, owner, ACL, SECURITY DEFINER, configuration, volatility, parallel-safety, body MD5, or body length. The only evidence-shape change is replacing unallowlisted language names with `pg_proc.language_oid`.

Exactly one Production request was executed under the correction authorization, and that authorization expired immediately after rollback. No SQL draft was patched or authorized, and no application/Core/Prompt 8/Prompt 9/R8N/deployment/Git/business action occurred.
