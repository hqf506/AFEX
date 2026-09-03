# Core V2 and Idempotency Assessment

## Deployed and reusable

Core V2 has a durable command ledger, immutable canonical payload row, authorization context, bounded claim lease, audit stream, immutable order/invoice links, line links, retry authorization, diagnostics, and stable response snapshot. The unique command identity is tenant + branch + command type + the hash of the idempotency key. Payload fingerprints distinguish exact duplicate from conflicting intent.

The deployed flow is:

1. acquisition validates a Primary Auth profile, role, tenant, and branch;
2. a unique command/payload pair is reserved;
3. a claim serializes execution with a bounded lease and attempt count;
4. execution locks the command, authority, catalog rows, and inventory rows;
5. business rows, inventory movement, and command links commit atomically;
6. success stores the original server receipt snapshot;
7. replay returns that snapshot without issuing another official number.

The bounded Production aggregate showed 12 commands, 12 successes, 12 claims, 12 business links, 13 line links, 12 stable response snapshots, no diagnostics, and no retry authorizations. This proves the deployed path has been exercised; it is not a load or correctness proof for Offline replay.

## Answers to mandatory questions

| Question | Finding |
| --- | --- |
| Durable command ledger | Yes |
| Immutable payload identity | Yes, one-to-one payload plus SHA-256 fingerprints and canonical text |
| Stable key returns stable result | Yes for exact fingerprint match |
| Retry after ambiguous timeout | Yes through acquisition/replay snapshot, provided the same canonical request and key are reused |
| Concurrent duplicate serialization | Yes through the unique command key, row locks, claim lease, and unique business links |
| Tenant and branch bound | Yes |
| Device bound | No |
| Actual POS employee bound as authority | Partial attribution only; Core actor is Primary Auth profile |
| Receipt recoverable | Yes by command replay/inspection through trusted server code |
| Survives runtime restart | Yes, PostgreSQL durable rows |
| Official numbering once | Yes in the authoritative transaction with branch/month sequence locking and unique indexes |
| Existing function accepts Offline order.create safely | Not yet: transport, device, POS employee generation, payment attestation, and conflict-review authority are missing |
| Exact duplicate versus true conflict | Fingerprint duplicate/conflict is supported; business conflicts do not have a complete human review container |

## Blocking authority gaps

`atomic_authorization_contexts.authenticated_actor_id` is a foreign key to `profiles`. The online route passes `auth.user.id` into Core V2 even when a trusted POS employee session exists. The optional employee source is not a device/credential-generation authority and appeared on only 4 of 12 observed contexts. Replay does not revalidate POS actor revocation, PIN generation, device registration, or an offline authorization envelope.

Core command states are limited to `reserved`, `processing`, `succeeded`, `failed_retryable`, and `failed_final`. There is no durable `conflict`, `review_required`, `approved`, `rejected`, `refund_required`, or resolved business-review record.

## Conclusion

The ledger, fingerprint, claim, atomic persistence, numbering, and stable receipt are reusable foundations. The current public Core entry point must not be treated as an Offline acceptance endpoint until an independently reviewed authority bridge binds device + POS employee generation + branch + payment attestation, and routes genuine conflicts into a review container.
