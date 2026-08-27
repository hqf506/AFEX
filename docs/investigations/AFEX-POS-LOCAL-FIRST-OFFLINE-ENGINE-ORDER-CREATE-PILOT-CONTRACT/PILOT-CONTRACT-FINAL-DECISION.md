# Pilot Contract Final Decision

Decision: `ORDER_CREATE_ACCOUNT_BOOTSTRAP_EMPLOYEE_SELECTION_PILOT_CONTRACT_READY_FOR_INDEPENDENT_REVIEW`

Only `order.create` is Pilot eligible, and the database employee relation and permission writer require exactly `ARRAY['order.create']::text[]`. The seven other command types remain Shadow Mode and dispatch-blocked. All twelve transactional/sensitive flags remain immutable false and business caller imports remain zero.

Offline use requires a verified Online establishment-account bootstrap bound to the primary account, tenant, branch, POS actor, managed device, device storage namespace, employee roster, and inventory snapshot. PIN is a PBKDF2 employee selector only and is excluded from account authentication and the data-encryption key hierarchy. Restart without logout requires PIN re-entry but not Internet. Explicit logout disables Offline access and retains pending commands encrypted and inaccessible until same-account Online reauthentication; cross-scope recovery is rejected.

The order envelope binds the complete canonical Core payload, full line economics, fingerprint projection, idempotency, inventory snapshot/frontier, immutable Offline origin, current uploader handoff, and payment attestation. The payment validator accepts exactly mada, cash, visa, cod, card, bank_transfer, transfer, and on_delivery; it requires SAR and exact canonical-total equality, binds local command and idempotency identities, fixes all provider states to unverified/not-claimed, and rejects unknown or sensitive card fields.

Inventory uses exact unique sorted item correspondence and exact requested, pending, and syncing quantities. The resolver returns exactly one typed result per server ordinal for at most 1,000 claims; one malformed or unavailable claim cannot remove another result. Receipt lookup revalidates fresh Auth/POS/origin authority before reading any binding or receipt.

The four acquisition database contracts and 15 trusted provisioning contracts are split into whole-file waves and reachable only through separate exact NOLOGIN roles. No SQL, database, provider, dispatch, business, network, Production, deployment, or Git operation was performed. PostgreSQL-compatible parsing remains an explicit later gate.
