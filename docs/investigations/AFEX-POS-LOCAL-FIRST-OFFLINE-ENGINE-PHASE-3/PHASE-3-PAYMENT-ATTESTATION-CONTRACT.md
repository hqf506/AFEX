# Phase 3 Payment Employee Attestation Contract

The command is an immutable employee acknowledgement that an external payment event was observed. It is not bank/provider proof and cannot initiate or repeat a charge.

Required fields:

- `paymentMethod`
- `amount`
- `currency` (`SAR`)
- `employeeConfirmedExternalPayment` (`true`)
- `employeeConfirmedAtLocal`
- optional bounded sanitized `externalReference`
- employee-originated `paymentProviderConfirmationStatus`: `not_integrated | employee_attested`
- `paymentReplayPolicy`: `never_charge_or_invoke_provider`
- `reconciliationStatus`: `not_required | pending | matched | discrepancy`

Representable methods are the four active POS UI values (`mada`, `cash`, `visa`, `cod`), persistence aliases (`card`, `transfer`, `on_delivery`) and explicit `bank_transfer`. The future acceptance rule requires the attestation command as an `order.create` dependency. Corrections require a separate future command; the sealed attestation cannot be edited.

`provider_confirmed` remains a reserved future domain state for trusted server/provider reconciliation authority. It is excluded from the employee command type and rejected by the local enqueue validator for every payment method. An `externalReference` is employee-supplied bounded text and never implies provider confirmation.

Card number/PAN, CVV/CVC, PIN, track data, provider token and terminal secret keys are recursively rejected. External reference is limited to 64 characters and the allowlist `[A-Za-z0-9._:/-]`. Phase 3 invokes no payment provider and its future replay policy forbids doing so.
