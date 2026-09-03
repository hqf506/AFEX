# Idempotency and receipts

The typed acquisition classifier distinguishes:

- first acquisition candidate;
- duplicate in progress;
- stable completed receipt replay;
- stable rejected receipt;
- true idempotency conflict;
- retryable infrastructure failure.

The exact acquisition parser requires server command, authenticated user, tenant, branch, POS employee, device, all three generations, command type, idempotency key, canonical payload hash, state and receipt. Unknown/missing fields reject.

The same idempotency key and canonical payload hash preserve one server command identity and one immutable receipt only within that complete immutable scope. Cross-actor, tenant, branch, employee, device, generation or command identity is a hard conflict. A different payload hash for the same key is also a hard conflict.

A receipt is valid only when its server command ID, idempotency key, canonical payload hash and disposition match the exact acquisition record. Unknown receipt fields and inconsistent terminal dispositions are rejected. A matching receipt is returned only after the acquisition scope and current trusted server authority both pass; an unavailable resolver never exposes it.

`synced` requires a verified completed receipt. HTTP 2xx, network completion, timeout, abort or an unknown response cannot produce `synced`.

Guarantee: **at-least-once transport with idempotent server acquisition and stable receipt replay**.
