# CA-001 — Branch/tenant authority

**Final classification:** `PARTIALLY_PROVEN` with `BLOCKED_SQL_DESIGN_REQUIRED`.

Production proves `public.branches.id uuid NOT NULL` as the sole primary key and `tenant_id uuid NULLABLE`. No unique constraint exists on ordered `(id, tenant_id)`; the only relation constraint is `branches_pkey PRIMARY KEY(id)`.

Safe aggregate proof:

- rows: 13
- null tenant rows: 0
- orphan tenant rows: 0
- duplicate `(id,tenant_id)` groups: 0
- maximum duplicate copies: 0

Therefore a validated ordered composite target could be added without data cleanup under the current snapshot, but this attestation does not authorize it. A full validation scan would be small today, yet any future migration still requires independent lock-window review. The column order `(id, tenant_id)` is appropriate for dependent objects whose leading lookup is branch identity; target Offline relations whose dominant scope is tenant-first may separately index `(tenant_id, id)`.

Future candidate FKs include Offline device authority, employee authority, snapshot header, review/payment/effect scope, and Core bridge rows. They must reference a reviewed composite unique target and cannot rely on two independent foreign keys as proof of pairing.

Evidence labels: catalog structure `PRODUCTION_CATALOG_PROOF`; row counts `SAFE_AGGREGATE_PROOF`; migration/lock recommendation `INFERENCE`.

