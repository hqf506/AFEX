# Phase 0 Human Decisions

No proposal below is approved by this package. Reviewers must select `APPROVE`, `CHANGE` or `REJECT`, record changes and identify the owner/date.

## D-01 Initial encryption mode

- **Recommended default:** Mode A WebCrypto/IndexedDB for the current PWA, with explicit compromised-runtime limitation; require Mode B if hardware-backed assurance is mandatory.
- **Tradeoff:** fastest compatible path versus weaker protection from XSS/extensions/device compromise.
- **Schedule effect:** Mode B adds approximately 2–3 engineer-weeks plus native qualification.
- **Can implementation begin before approval?** Phase 1 abstractions/tests only; persistent PII enablement cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-02 Pre-PIN sealed ingestion and key authority

- **Recommended default:** Primary Auth may store ciphertext only; decryption requires same-scope Primary Auth plus valid POS actor. Define a separate reviewed server/device unwrap authority.
- **Tradeoff:** preserves requested pre-PIN refresh without granting primary-only plaintext access; requires API/security work.
- **Schedule effect:** may add 1–2 weeks within Phase 1/2 depending on authority design.
- **Can implementation begin before approval?** Local key-manager interface can; pre-PIN refresh cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-03 Lease durations

- **Recommended default:** read 24h absolute; business command 2h absolute; no offline refresh.
- **Tradeoff:** short financial exposure and revocation window versus more frequent reauthentication.
- **Schedule effect:** policy change is small; long leases increase security/testing/reconciliation scope.
- **Can implementation begin before approval?** Lease simulator only; no business enqueue.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-04 First pilot payment methods

- **Recommended default:** cash only. Block Mada/card/COD/refund/standalone capture.
- **Tradeoff:** avoids unproven offline provider settlement; limits operational usefulness.
- **Schedule effect:** card/Mada proof/settlement support is a separate finance/provider phase beyond initial pilot.
- **Can implementation begin before approval?** Outbox shadow can; pilot dispatch cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-05 Financial/count/time limits

- **Recommended default:** SAR 500/order, SAR 2,000 unsynced/device, 10 pending orders, 2h disconnected.
- **Tradeoff:** caps exposure and support load versus branch throughput.
- **Schedule effect:** changed numbers do not materially change coding, but higher limits require finance/security soak and device storage review.
- **Can implementation begin before approval?** Limit engine/tests can; Production pilot cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-06 First command type

- **Recommended default:** `order.create` only after all Core gates. Prohibit status/customer/payment/inventory/provider commands.
- **Tradeoff:** smallest idempotent surface versus partial offline workflow.
- **Schedule effect:** additional commands add Phase 6, approximately 3.5–5 engineer-weeks total depending on selected types.
- **Can implementation begin before approval?** Shadow model yes; dispatch no.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-07 Dataset retention/privacy

- **Recommended default:** customer index 10k/7d; profiles 200/48h; orders/invoices 48h bounded; catalog 30d; receipts 90d after acknowledgement; unresolved evidence until resolved.
- **Tradeoff:** operational continuity versus PII/financial exposure and storage.
- **Schedule effect:** stricter limits are usually neutral; broader/longer retention increases privacy, performance and native-security scope.
- **Can implementation begin before approval?** Synthetic store tests only; PII ingestion cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-08 Product media quota

- **Recommended default:** 2,000 images or 500 MB, unreferenced LRU first.
- **Tradeoff:** richer offline catalog versus storage/battery/network usage.
- **Schedule effect:** larger budgets require more real-device quota profiling.
- **Can implementation begin before approval?** Media-cache simulator can; rollout limit cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-09 Logout purge with unresolved commands

- **Recommended default:** retain by default; permit checked purge only after exact count warning and second destructive confirmation.
- **Tradeoff:** user device-control right versus irreversible loss of unsynced evidence.
- **Schedule effect:** support-only authorization instead would add workflow/API scope.
- **Can implementation begin before approval?** Non-destructive lock/retain path yes; destructive path cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-10 Stale price/VAT/discount/inventory promise

- **Recommended default:** server wins; no silent repricing or oversell. Employee explicitly approves a replacement command after conflict.
- **Tradeoff:** financial correctness versus possible failed/delayed offline sale.
- **Schedule effect:** alternate price guarantees/reservations require larger Core/finance/inventory design.
- **Can implementation begin before approval?** Conflict UI prototype only; pilot cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-11 Core command/receipt retention

- **Recommended default:** maximum offline duration plus at least 30 days reconciliation/support margin; exact DB retention requires Core/operations review.
- **Tradeoff:** stronger replay safety versus database growth/cleanup cost.
- **Schedule effect:** likely migration/index/cleanup/monitoring work in Phase 4.
- **Can implementation begin before approval?** Local outbox shadow yes; server dispatch no.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-12 Delta versus snapshot refresh

- **Recommended default:** atomic complete bounded snapshots until deterministic version/cursor/tombstone APIs exist.
- **Tradeoff:** higher bandwidth versus correctness and deletion closure.
- **Schedule effect:** deterministic delta APIs add backend/API work; snapshot path is the shorter Phase 2 route.
- **Can implementation begin before approval?** Snapshot implementation can after retention/security approval.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-13 Rollout cohort and kill-switch ownership

- **Recommended default:** one managed branch/device cash-only cohort after shadow success; separate enqueue/dispatch/effect switches.
- **Tradeoff:** slower rollout versus bounded blast radius.
- **Schedule effect:** monitoring/runbook ownership is required before Phase 4 Production pilot.
- **Can implementation begin before approval?** Flag interfaces can; Production rollout cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-14 Performance/storage budgets

- **Recommended default:** adopt all `PROPOSED` Phase 0 budgets, then revise only from Phase 1 baselines.
- **Tradeoff:** enforceable UX/device limits versus possible adjustment for older hardware.
- **Schedule effect:** failed budgets may add optimization/device work.
- **Can implementation begin before approval?** Baseline collection design can; acceptance thresholds require approval.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## D-15 Native hardening trigger

- **Recommended default:** require Mode B if Mode A risk is rejected, retention expands, managed-device policy requires hardware-backed keys, or target iOS/Android durability is inadequate.
- **Tradeoff:** strongest mobile key assurance versus native complexity and separate web/native paths.
- **Schedule effect:** +2–3 engineer-weeks plus store/device qualification.
- **Can implementation begin before approval?** Mode A architecture only; native implementation cannot.
- **Reviewer decision:** [ ] APPROVE  [ ] CHANGE  [ ] REJECT
- **Owner/date/changes:** ______________________________

## Approval gate

Phase 1 begins only when D-01, D-02, D-03, D-07, D-09, D-12, D-14 and the responsible risk owners are resolved. Phase 4 additionally requires D-04, D-05, D-06, D-10, D-11 and D-13.

