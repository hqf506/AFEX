# Phase 4 Payment Attestation Server Contract

## Supported representation

The immutable command schema must represent all current AFEX options:

`mada`, `cash`, `visa`, `cod`, `card`, `bank_transfer`, `transfer`, and `on_delivery`.

The current Core V2 execution path was found to support only `cash`, `mada`, `visa`, and `cod`; this is a blocker for a full offline pilot.

## Employee attestation

Offline approval records an employee statement that payment was received or verified externally according to branch procedure. It is not provider confirmation and it never charges a card or contacts a payment provider.

Minimum immutable fields:

- `paymentMethod` from the allowlist;
- `attestationKind = employee_attested`;
- POS employee actor ID and event-governed authority generation/package references;
- registered device, tenant, and branch;
- server-independent local confirmation timestamp plus client clock metadata;
- amount/currency and cash received/change fields when applicable;
- optional sanitized external reference with length/character restrictions;
- `providerConfirmation = unverified` unless a future trusted server integration supplies it;
- reconciliation state and server acknowledgement timestamp;
- payload/attestation hash bound to the command fingerprint.

## Validation

The server validates amount equality/ranges, method-specific required fields, currency, actor permission, employee/device/branch/command binding, canonicalization, and optional reference format. Browser-provided `provider_confirmed` is rejected. Replay never invokes a terminal, bank, card provider, or WhatsApp.

Forbidden fields include card number, CVV, PIN, track data, provider token, terminal secret, credentials, or unrestricted free-text containing sensitive payment data.

## Corrections

The acknowledgement is immutable after acquisition. A correction is a separately authorized future command linked by causation to the original receipt, never an update to the original command payload. Refund/cancellation authority is not implied by order creation.

## Receipt

The server receipt returns method, employee-attested state, attesting employee, accepted amount/cash breakdown, reconciliation state, and provider state (`unverified` unless trusted evidence exists). It must not imply settlement beyond the authority actually observed.
