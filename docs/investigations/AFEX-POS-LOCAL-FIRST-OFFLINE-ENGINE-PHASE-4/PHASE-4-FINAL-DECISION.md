# Phase 4 Authority Correction — Final Decision

## Decision

The active design is the human-approved verified-account-bootstrap model. The prior PIN-derived/persistent-DEK-unwrap interpretation is superseded.

1. Online establishment-account login is mandatory before any Offline bootstrap.
2. Offline continuity may persist without time expiry after bootstrap until an event-driven invalidator is known.
3. PIN only selects a pre-enrolled POS employee and never authenticates the account or unwraps business data.
4. Device-bound encryption is independent of the PIN; its precise client representation remains a later disabled implementation contract.
5. Restart without explicit logout requires PIN re-entry but not Internet.
6. Explicit account logout disables Offline PIN/access and requires same-account Online login before recovery.
7. Pending/syncing commands survive logout encrypted and inaccessible, and can never be reassigned.
8. Initial roster is capped at 25 and the database command allowlist is exactly `order.create`.
9. Synchronization requires fresh Online Auth/POS actor and database authority validation.

## Completed review candidate

The SQL authority package now contains whole-file inactive waves for:

- device register/activate/replace/revoke/lost/local-lock/read;
- employee enroll/PIN-verifier replacement/permission replacement/revoke/remove/local-lock/read;
- immutable complete inventory snapshot publication with canonical hashes and replay conflict handling;
- verified Online account/bootstrap publication, employee roster, explicit logout, same-account recovery, and current-authority read.

It also separates NOLOGIN provisioning and acquisition roles; removes employee columns from the device storage-envelope hierarchy; binds commands to bootstrap/account/employee/device/namespace; and enforces an exact `ARRAY['order.create']::text[]` allowlist.

## Non-authorization statement

This package is review-only. It does not execute SQL, connect to a database, enable a role, create a caller, change business routes, start dispatch/replay/interception, call a provider, enable a sensitive flag, or access Production. Phase 5 and runtime activation remain blocked pending independent review and explicit authorization.

## Review status

`AFEX_OFFLINE_ACCOUNT_BOOTSTRAP_EMPLOYEE_PIN_SELECTION_AND_PROVISIONING_AUTHORITY_READY_FOR_INDEPENDENT_REVIEW`
