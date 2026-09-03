# Phase 4 External Effects Contract

## Atomic effect authority

The successful Core transaction must insert an effect-ledger record for every authorized downstream effect using a unique semantic identity such as `(server_command_id, effect_type, effect_version)`. Replay reads the existing ledger and receipt; it cannot enqueue another semantic effect.

The ledger state machine is `pending → claimed → delivered | failed_retryable | failed_terminal | suppressed`. Claims have bounded leases. Delivery providers use their own idempotency key where supported, but the AFEX ledger remains the local authority.

## Effect classification

| Effect | Atomic business transaction | External worker | Replay rule |
| --- | --- | --- | --- |
| Inventory mutation | Yes | No | Stored order result; never repeated |
| Invoice generation/numbering | Yes | No | Official identity returned from receipt |
| Audit event | Insert unique server-derived audit row in the transaction | Optional export later | One semantic audit event per command/effect |
| WhatsApp | Insert ledger row only | Send after commit | Unique effect key; delivery retries do not recreate message intent |
| Notification | Insert ledger row only | Deliver after commit | Same ledger semantics |
| Official print eligibility | Persist receipt eligibility | User/device renders from receipt | Reprint does not generate new invoice/effect |
| Provisional local print | Local UI only, if approved | No server worker | Clearly non-official; never dispatched by Service Worker |

## Current-state gap

The active order route schedules WhatsApp and performs employee/inventory/audit follow-up outside the Core result transaction. A historical `atomic_outbox` design exists elsewhere in Core evidence, but current execution integration and Production presence were not proven. These are blockers: a network retry after commit could duplicate or omit non-atomic effects.

## Payload minimization

Effect rows store references and a versioned, minimal canonical payload or payload hash. Provider secrets remain only in trusted server configuration. Logs and receipts exclude credentials and minimize customer PII. WhatsApp content generation occurs server-side from the committed receipt and current approved template.

## Service Worker boundary

A Service Worker may transport an encrypted command only after future approval. It may not call WhatsApp, printing, notifications, Supabase RPCs, or provider endpoints directly. External eligibility derives only from a server receipt.

## Failure handling

Business success does not become business failure solely because an external notification fails. The receipt distinguishes committed business result from each effect state. Failed external effects retry under the server ledger policy, are observable, and never cause order/invoice/stock re-execution.

