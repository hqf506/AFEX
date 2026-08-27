# Cancellation and refund boundary

`order.cancel` and `payment.refund` are recognized only so the bridge can return explicit blocked outcomes:

- `CANCELLATION_ATOMIC_AUTHORITY_UNAVAILABLE`
- `REFUND_ATOMIC_AUTHORITY_UNAVAILABLE`

They never reach inventory, payment, Core mutation or external-effect execution. No legacy direct write is called. Stock restoration, cancellation and refund remain blocked until separately reviewed exact Core V2 atomic authority exists.
