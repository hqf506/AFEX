# Payment attestation

The eight methods remain distinct:

`mada`, `cash`, `visa`, `cod`, `card`, `bank_transfer`, `transfer`, `on_delivery`.

The employee may attest only that the external/manual step was completed according to store procedure. The exact contract requires all provider, settlement, bank, card-authorization and refund-completion claims to be `not_claimed`, and `paymentProviderActionRequested` to be `false`.

For `order.create`, the attestation is bound to the payment command UUID, order aggregate identity, selected method, exact normalized order total and `SAR`. For `payment.employee_attestation`, it is bound to that local command and its payload. Missing, mismatched or irrelevant attestations reject; command types outside these two cannot carry one.

Card numbers, CVV/CVC, payment PINs, provider tokens, passwords, secrets and authorization data are rejected recursively from payloads. The module has no provider client and makes no network call.
