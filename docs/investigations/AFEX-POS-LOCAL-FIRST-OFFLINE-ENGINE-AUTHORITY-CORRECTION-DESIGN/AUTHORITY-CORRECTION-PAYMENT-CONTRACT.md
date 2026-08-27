# Authority Correction Payment Contract

## Canonical vocabulary

The command and receipt preserve all eight representations without silent collapse:

| Method | Canonical representation | Alias policy |
| --- | --- | --- |
| `mada` | Mada network | distinct |
| `cash` | cash | distinct |
| `visa` | Visa-labelled card flow | distinct until human-approved mapping |
| `cod` | cash-on-delivery legacy label | distinct |
| `card` | generic card | distinct |
| `bank_transfer` | bank transfer | distinct |
| `transfer` | legacy/general transfer | distinct |
| `on_delivery` | payment on delivery | distinct |

`cod` and `on_delivery`, and `bank_transfer` and `transfer`, remain separately recorded. Any future alias mapping must be versioned, human approved and preserve the originally selected value in the receipt.

## Employee attestation

Offline confirmation creates immutable `employee_attested` evidence bound to command, tenant, branch, POS employee, device, package and all relevant generations. It is never `provider_confirmed`.

Minimum fields are method, amount, ISO currency, attestation kind/version, attesting employee/device authority projection, local confirmation and clock-anomaly metadata, cash received/change where applicable, optional sanitized external reference, canonical attestation hash, provider state, reconciliation state and correction/refund causation.

Cash requires received amount not below total and deterministic nonnegative change. Non-cash methods reject cash fields unless explicitly zero/absent. Optional references are length/character bounded. Card number, CVV, payment PIN, track data, provider token, terminal secret, credentials and unrestricted sensitive free text are forbidden.

## Server validation and state

Acquisition validates exact method allowlist, amount/currency equality with authoritative totals, method-specific fields, employee permission and every command/actor/device generation. Browser claims of provider success are rejected. Initial provider state is `unverified` unless a separately trusted server integration supplies verifiable evidence.

Reconciliation states distinguish pending review, employee-attested accepted, provider-unverified, reconciled, correction-required, refund-required, refunded and terminal discrepancy. These states do not rewrite the attestation.

## Replay, correction and refund

Replay returns the stored attestation and never invokes a terminal, card/bank provider, WhatsApp or print effect. Same command/fingerprint cannot create a second attestation. Correction and refund are separately authorized, causally linked commands/events; they never edit the original amount, method, actor or evidence hash.

The receipt states exactly what is known: original method, employee-attested status, amount/cash breakdown, attesting employee, provider state and reconciliation state. It never implies settlement or provider confirmation that was not observed by trusted server authority.

## Tests and performance

Each of the eight methods receives positive, missing-field, extra-secret, amount mismatch, wrong employee/device, replay and correction tests. Payment validation adds no provider network request and uses the already loaded command/authority context. Indexes support command identity and unresolved reconciliation state; payment detail is not a global hot join.
