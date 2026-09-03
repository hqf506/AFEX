# Phase 4 Numbering Contract

## Authority finding

Repository SQL assigns official order and invoice numbers using branch/month server authority and database-side sequencing/triggers. Offline code has neither a serialized view of this state nor authority to reserve a final number. Therefore no final official number may be generated offline.

## Local identity

An offline aggregate receives an immutable local reference such as `LOCAL-<device-suffix>-<monotonic-sequence>` plus a UUID aggregate ID. It is visibly labeled **مرجع محلي مؤقت** and is never formatted to resemble an official AFEX invoice number.

The local reference is stable across restart, retry, employee lock, and sync. It is an idempotency/correlation identifier, not an accounting document number.

## Server issuance

Official order and invoice numbers are allocated only inside the successful Core V2 transaction. The persisted server receipt maps:

`local aggregate ID → server order ID/number → server invoice ID/number`.

The mapping is immutable. Retry returns the same mapping from the stored result snapshot. A numbering failure aborts the transaction and creates no successful receipt or external effect.

## UI and printing

- Before sync: show the local reference and pending/offline state. Never say the official invoice was created.
- Provisional local printing, if later approved, must say **إيصال محلي مؤقت — غير فاتورة رسمية** and contain no official number.
- After a successful receipt: replace the display with the official order/invoice number while retaining the local reference in diagnostics.
- Official printing is enabled only from a server-confirmed receipt and may be reprinted without issuing another number.

## Duplicate prevention

The Core uniqueness/idempotency transaction must cover sequence allocation and number-to-business-object uniqueness. Client retries cannot call numbering separately. External effects consume only the persisted server command/receipt identity.

## Required attestation

Before a pilot, read-only Production evidence must identify current sequence/trigger functions, ownership, grants, transaction locking, uniqueness constraints, branch/month partition semantics, and definitions/MD5. Repository artifacts alone are not Production proof.

