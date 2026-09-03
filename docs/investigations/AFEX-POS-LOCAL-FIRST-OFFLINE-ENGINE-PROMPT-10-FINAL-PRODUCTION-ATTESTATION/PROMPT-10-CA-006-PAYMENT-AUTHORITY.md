# CA-006 — Payment authority

**Final classification:** `BLOCKED_CORE_V2_CHANGE_REQUIRED` and `BLOCKED_SQL_DESIGN_REQUIRED`.

Production `invoices.payment_method text NOT NULL` has a check permitting exactly:

`cash, card, transfer, mada, visa, on_delivery`

Aggregate-only stored vocabulary/counts were: card 148, cash 59, mada 57, on_delivery 7, transfer 9, visa 4. No payment references or invoice rows were returned.

Required eight methods remain distinct:

- present in current constraint: mada, cash, visa, card, transfer, on_delivery
- not accepted by the current constraint: cod, bank_transfer

Absence of stored `cod`/ `bank_transfer` rows does not permit alias merging. Current schema has no separated `attestation_state` and `provider_state`, no bounded employee/provider writers, and no provider reconciliation/refund authority. Any employee Offline submission must begin exactly:

- `attestation_state = employee_attested`
- `provider_state = unverified`

The local engine must never charge or invoke a provider. Eight-method support requires a versioned Core input/receipt change plus independently reviewed database authority and reconciliation semantics.

