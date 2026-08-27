# Authority Correction Cancellation and Refund Contract

## Selected authority

The drifted `restore_inventory_for_cancelled_invoice` path is replaced by a versioned Core cancellation command. The trusted cancellation route validates current Primary Auth audit subject, actual POS/admin employee, tenant, branch, original receipt, permission, device/generation where applicable and an explicit reason. Offline refund execution is not authorized.

The original order/invoice/payment command and receipt remain immutable. Cancellation/refund produces its own command, actor/device context, idempotency identity, causation link, receipt and effect intents.

## Preconditions

The server locks the original command/business link, order/invoice, payment/reconciliation record and affected stock rows in deterministic order. It validates tenant/branch consistency, current status, prior cancellation/refund, delivered/terminal state, payment method/state, inventory mutation summary and existing effect intents.

Allowed outcomes are idempotent existing cancellation receipt, newly authorized cancellation, review-required refund/cancellation, or terminal conflict. Duplicate requests with the same identity return the same receipt; different payload/reason under the same identity is a fingerprint conflict.

## Inventory and payment

Stock restoration derives only from the original committed inventory summary and can occur once. It does not trust request item quantities. Resulting stock remains nonnegative and records a causally linked movement.

Employee-attested payment is never silently reversed. Cash or unverified Offline payment cancellation records correction/refund-required state under approved policy. Provider-confirmed payments require a separately trusted refund integration and effect; client replay never contacts the provider. Refund result is a new immutable authority event.

## Local cancellation

A sealed command may be cancelled entirely locally only if it was never acquired, has no server/effect receipt and no uncancelled dependent command. The cancellation is durable, releases local commitments deterministically and remains auditable after restart. If acquisition state is unknown, receipt lookup is mandatory and local release is blocked.

After server acquisition, all cancellation/refund behavior is server-authoritative. A revoked employee/device cannot rebind the original command; an authorized reviewer may create a new causally linked resolution.

## Effects and rollback

Successful cancellation atomically records audit and any notification/refund/print-invalidation intents using unique effect identities. It does not resend original effects. Failure of a notification does not roll back the cancellation.

Rollout initially permits Online trusted cancellation only. Kill switches stop new cancellation commands and dispatcher claims while preserving existing command/review/effect evidence. Rollback never restores broad function execution or the drifted legacy body.

## Qualification

Tests cover legal/illegal statuses, concurrent duplicate cancellation, partial prior effects, paid/unpaid/all eight methods, stock restoration once, original line tampering, wrong tenant/branch/actor/device, acquired versus never-acquired local cancellation, refund-required review, deterministic lock order and repository/Production catalog parity.
