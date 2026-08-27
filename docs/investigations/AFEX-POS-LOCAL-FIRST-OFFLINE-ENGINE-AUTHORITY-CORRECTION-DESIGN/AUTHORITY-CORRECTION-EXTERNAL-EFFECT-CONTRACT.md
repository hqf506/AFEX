# Authority Correction External Effect Contract

## Transactional intent

The authoritative business transaction creates at most one semantic intent for each identity:

`serverCommandId + effectType + effectVersion`

Supported classes include WhatsApp, official print eligibility, audit export, notifications and any provider-facing effect. Inventory mutation, numbering and business audit persistence remain inside Core and are not worker effects.

The effect relation records tenant/branch, command, effect type/version, minimal canonical payload or reference/hash, eligibility reason, state, attempt count, claim identity/lease, provider idempotency key, provider-safe result classification, retry schedule and terminal timestamps. Provider secrets stay in trusted server configuration and never enter the ledger, command, receipt, client, Service Worker or evidence.

## State machine

- `pending`: committed eligible intent, never yet claimed.
- `claimed`: one worker owns a bounded lease.
- `succeeded`: provider/renderer result recorded; terminal.
- `failed_retryable`: bounded failure eligible after policy delay.
- `failed_terminal`: invalid request or exhausted policy; operator-visible.
- `ambiguous_provider_result`: delivery outcome unknown; provider lookup/idempotency resolution precedes retry.
- `suppressed`: intentionally not delivered with authorized reason.

Claims use compare-and-set and expire only for dispatcher recovery, not business authority. Worker completion must match the active claim identity/version. Replay reads the existing intent and cannot recreate it.

## Effect-specific rules

WhatsApp payload generation is server-side from committed receipt and current approved template, with minimized PII. Official print eligibility is a receipt flag; reprint renders the same receipt and does not create another invoice. Provisional Offline print, if later human approved, is clearly non-official and never a server effect. Audit export and notifications follow the same unique intent/claim contract.

Business success remains successful when an external effect fails; the receipt exposes effect state separately. Provider retry never re-executes order, invoice, stock, payment attestation or numbering.

## Performance and operations

Dispatcher lookup is indexed by state/next-attempt time and claimed in bounded batches. Commands do not wait for provider calls. Backlog age/count, claim expiry, retry/terminal rates and ambiguous results are monitored by tenant/branch/effect without logging secrets.

Tests cover duplicate replay, two workers, claim timeout, provider idempotency, ambiguous result, redaction, suppressed effect, terminal failure, receipt visibility and zero client/Service Worker provider calls.
