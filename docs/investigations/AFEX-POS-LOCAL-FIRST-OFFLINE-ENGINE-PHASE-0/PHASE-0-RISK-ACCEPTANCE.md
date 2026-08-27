# Phase 0 Risk Acceptance

## Status

`NO_RISK_ACCEPTED_BY_CODEX`

This document presents decisions for accountable human owners. Blank approval fields are intentional.

## Required acceptances before Phase 1 PII enablement

### RA-01 PWA runtime limitation

- Risk: Mode A cannot protect unlocked plaintext from XSS, malicious extensions or a compromised device/runtime.
- Proposed mitigation: CSP/Trusted Types review, pinned dependencies, worker-scoped key use, short leases, minimal plaintext lifetime, encryption at rest and optional Mode B trigger.
- Residual severity: High.
- Required owner: Security.
- Decision: [ ] ACCEPT  [ ] REQUIRE MODE B  [ ] REJECT
- Owner/date/conditions: ______________________________

### RA-02 Offline revocation window

- Risk: a disconnected client cannot observe immediate employee/device revocation.
- Proposed mitigation: 2h command lease, 24h read lease, absolute expiry, revocation epoch at reconnect, value/count limits.
- Residual severity: High.
- Required owners: Security + Operations.
- Decision: [ ] ACCEPT  [ ] CHANGE LIMITS  [ ] REJECT
- Owner/date/conditions: ______________________________

### RA-03 Browser/OS storage eviction

- Risk: site data can be removed by user/OS despite persistence requests.
- Proposed mitigation: quota guards, no auto-eviction of evidence, block at 90%, Mode B/native storage trigger.
- Residual severity: High for unsynced commands.
- Required owners: Product + Operations + Security.
- Decision: [ ] ACCEPT FOR READ CACHE ONLY  [ ] ACCEPT PILOT  [ ] REQUIRE NATIVE  [ ] REJECT
- Owner/date/conditions: ______________________________

### RA-04 Customer/financial retention

- Risk: local PII and confirmed financial snapshots increase breach/privacy impact.
- Proposed mitigation: encrypted exact namespace, POS unlock, bounded 7d/48h defaults, scoped purge and no PII logs.
- Residual severity: High.
- Required owners: Privacy + Security + Product.
- Decision: [ ] ACCEPT  [ ] CHANGE LIMITS  [ ] REJECT
- Owner/date/conditions: ______________________________

### RA-05 Legacy plaintext migration

- Risk: historical localStorage drafts lack authoritative namespace evidence.
- Proposed mitigation: verified binding or quarantine; remove plaintext only after encrypted verification; no fallback writes.
- Residual severity: Medium/High.
- Required owners: Security + Product.
- Decision: [ ] ACCEPT QUARANTINE POLICY  [ ] REQUIRE PURGE  [ ] REJECT
- Owner/date/conditions: ______________________________

## Required acceptances before Phase 4 business pilot

### RA-06 Cash-only offline sale exposure

- Risk: price/inventory/authority may change while disconnected; physical cash may be collected before official invoice exists.
- Proposed mitigation: SAR 500/order, SAR 2,000/device, 10 orders, 2h lease, explicit pending/local-reference UX and server conflict resolution.
- Residual severity: High.
- Required owners: Finance + Operations + Product + Security.
- Decision: [ ] ACCEPT  [ ] CHANGE LIMITS  [ ] REJECT
- Owner/date/conditions: ______________________________

### RA-07 Mada/card/provider prohibition

- Risk: application cannot prove offline terminal/provider settlement.
- Proposed mitigation: block Mada/card/COD/refund/capture in first pilot; separate finance/provider contract later.
- Residual severity if enforced: Low for first pilot.
- Required owners: Finance + Product.
- Decision: [ ] APPROVE PROHIBITION  [ ] REQUIRE SEPARATE DESIGN  [ ] REJECT PILOT
- Owner/date/conditions: ______________________________

### RA-08 Server replay/effect authority

- Risk: duplicate business/provider effects or unknown outcome without complete Core receipt/outbox retention.
- Proposed mitigation: close every Core prerequisite, unique effects, receipt lookup, reconciliation/manual hold and retention beyond offline duration.
- Residual severity before closure: Critical; pilot prohibited.
- Required owners: Core/Backend + Database Authority + Security + Operations.
- Decision: [ ] APPROVE AFTER EVIDENCE  [ ] CHANGE  [ ] REJECT
- Owner/date/conditions: ______________________________

### RA-09 Effective employee attribution

- Risk: Core command records primary subject instead of the true POS employee.
- Proposed mitigation: separately trusted primary/effective actor/device lease claims and command/business/audit linkage.
- Residual severity before closure: Critical; pilot prohibited.
- Required owners: Auth + Core + Audit/Compliance.
- Decision: [ ] APPROVE AFTER EVIDENCE  [ ] CHANGE  [ ] REJECT
- Owner/date/conditions: ______________________________

### RA-10 Purge of unresolved commands

- Risk: user-selected purge permanently removes unsynced actions that never became server business records.
- Proposed mitigation: retain by default, exact count warning, second destructive confirmation, no silent upload, non-sensitive purge receipt.
- Residual severity: High and user-driven.
- Required owners: Product + Legal/Privacy + Operations.
- Decision: [ ] ALLOW WITH SECOND CONFIRMATION  [ ] REQUIRE SUPPORT AUTHORIZATION  [ ] PROHIBIT
- Owner/date/conditions: ______________________________

## Zero-tolerance conditions

The following are not risk-acceptable within this program:

- cross-account/tenant/branch disclosure;
- plaintext PIN/key/token/service-role/provider credential storage;
- browser employee ID used as authority;
- device-generated official number;
- silent Last Write Wins for orders/finance/inventory/customer identity;
- pending command/evidence auto-eviction;
- duplicate business or external effect;
- claim of server success without durable terminal receipt;
- rollback to new plaintext PII/financial writes.

## Approval gate

Phase 1 may begin only after RA-01 through RA-05 have owner decisions. Phase 4 may begin only after RA-06 through RA-10 and all Core prerequisite evidence are approved. Any `REJECT` triggers contract revision; it is not silently overridden.

