# AFEX POS Local-First Offline Engine — Phase 1 Baseline

Date: 2026-08-25
Repository HEAD before implementation: `37331390ec00bee507f88701365bfebb944db675`

## Safe pre-change observations

| Signal | Baseline result | Evidence boundary |
| --- | --- | --- |
| Login to interactive PIN | UNPROVEN | No authenticated non-Production runtime was available. |
| PIN to usable POS | UNPROVEN | No credentials or runtime session were requested. |
| POS navigation timings | UNPROVEN | No authenticated runtime measurement. |
| Request count / duplicate requests | UNPROVEN | No network session was opened. |
| Browser storage estimate / persistence | UNPROVEN | Requires a running browser origin. |
| Main-thread long tasks / memory | UNPROVEN | Requires an authenticated browser trace. |
| Catalog/customer/order payload count and bytes | UNPROVEN | No API or database access was performed. |
| Draft count and bytes | UNPROVEN | Values were not read or printed. |

## Static storage discovery

The pre-change application contained sensitive draft-capable browser keys including `invoice_customer`, `invoice_sale_items`, `invoice_sale_checkout`, and `leather_fix_pos_offline_drafts`. Values and byte sizes were deliberately not read. Existing theme/shell values are outside the encrypted business-data boundary.

The legacy `lib/pos-offline-draft.ts` path could write a plaintext command payload and dispatch it to `/api/orders`. Phase 1 gates both new writes and dispatch off. It remains only as a recovery reader until a verified encrypted migration can run.

## Baseline automated gates

- POS UX source contract: PASS.
- Customer selection binding: 26/26 PASS.
- Responsive UX: 151 assertions PASS.
- Tracked and staged worktree state before implementation: clean.
- Approved Phase 0/investigation documentation and user-owned `runtime-integration/R8N-*` paths were untracked and excluded from mutation.

No token, phone, customer name, note, payload, or secret was captured.
