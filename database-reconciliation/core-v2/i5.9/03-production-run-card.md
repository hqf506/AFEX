# AFEX Core V2 — Package 3R Controlled Production Run Card

Status: external review required  
Execution authority: manual operator only  
Core V2 state: disabled  
Package 3 SQL state: not executed by Codex

## Frozen executable

| Artifact | Lines | Bytes | SHA-256 |
|---|---:|---:|---|
| `database-reconciliation/core-v2/i5.9/03-backfill.sql` | 1010 | 32151 | `58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208` |

Package 3R must be executed section-by-section. The complete file must never be
executed as one selection because Section G uses `CREATE INDEX CONCURRENTLY`
outside a transaction and Sections B, C, and D are independent bounded
transactions.

## Scope

Package 3R is limited to:

- read-only blocker evidence;
- bounded population of `customers.phone_normalized`;
- bounded initialization of `customers.record_version`;
- bounded initialization of `inventory_stock.record_version`;
- conditional creation of `uq_customers_tenant_phone_normalized`;
- read-only progress and index verification;
- optional validation of three Package 2R CHECK constraints.

Package 3R does not reconcile duplicate customers, branch prefixes, historical
snapshots, or invoice/order-number mismatches. It does not activate Core V2.

## A. Preconditions

- [ ] Package 2R completed successfully and its post-run verification passed.
- [ ] Package 2R rollback is no longer expected to be used.
- [ ] Package 3R executable hash matches the frozen hash above.
- [ ] This run card and the post-run verification have external approval.
- [ ] The current Production evidence has been reviewed again.
- [ ] Every invalid non-empty customer phone has an approved disposition.
- [ ] Every customer has a tenant identity.
- [ ] Same-tenant normalized customer duplicate groups equal zero.
- [ ] Existing populated normalization conflicts equal zero.
- [ ] Customer and inventory record versions below one equal zero.
- [ ] Core V2 runtime markers equal zero.
- [ ] Core V2 remains disabled.
- [ ] No Package 4, 5, 6, runtime grant, or activation package has run.
- [ ] No concurrent application release changes customer normalization/version
      behavior during the Package 3 window.
- [ ] Operator understands that the package has independently committed batches
      and no safe automatic data rollback.

STOP if any precondition is false, unavailable, or unreviewed.

## B. Backup verification

Do not record credentials, tokens, database URLs, or secrets.

- [ ] Production project identifier: `________________`
- [ ] Current backup status: `________________`
- [ ] Latest successful backup timestamp in UTC: `________________`
- [ ] Backup reference: `________________`
- [ ] Restoration method: `________________`
- [ ] Restoration operator: `________________`
- [ ] Latest restoration-test evidence: `________________`
- [ ] Accepted limitation if no recent restoration test: `________________`
- [ ] Forward-fix authority: `________________`
- [ ] Full-restoration authority: `________________`

STOP if backup availability, restoration ownership, or accepted recovery limits
are uncertain.

## C. Production identity verification

- [ ] SQL Editor visibly identifies the intended Production project.
- [ ] A second person confirms the organization and project identifier.
- [ ] Operator confirms the environment is not Clone, Staging, or Preview.
- [ ] PostgreSQL version remains compatible with the reviewed package.
- [ ] No credentials are copied into retained evidence.

## D. Maintenance window

- [ ] Change ticket: `________________`
- [ ] Approved start: `________________`
- [ ] Approved end: `________________`
- [ ] Primary operator: `________________`
- [ ] Independent observer: `________________`
- [ ] Application traffic plan: `________________`
- [ ] Monitoring owner: `________________`
- [ ] STOP/forward-fix authority: `________________`

Sections B, C, and D lock at most 1,000 selected rows per execution. Section G
uses concurrent index creation. Section I performs table scans and takes locks
for constraint validation. Estimated duration is not guaranteed.

## E. Hash verification

Run locally without opening a database connection:

```powershell
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/03-backfill.sql
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/03-post-run-verification.sql
Get-FileHash -Algorithm SHA256 database-reconciliation/core-v2/i5.9/03-rollback.sql
```

Record all outputs. STOP on any mismatch with externally approved hashes.

## F. Pre-run evidence

1. Open the exact frozen `03-backfill.sql`.
2. Select and execute only A1 through A9, one result set at a time.
3. Export every result unchanged.
4. Select and execute A10 alone.
5. Require A10 to complete without exception.
6. Record pre-run row counts for `customers`, `inventory_stock`, `orders`,
   `invoices`, `invoice_items`, and `inventory_movements`.
7. Record counts of null `phone_normalized` and null record versions.

Do not continue when A10 raises any blocker.

## G. Manual execution — Section B

1. Select the complete Section B transaction, from its `begin;` through its
   matching `commit;`.
2. Execute once.
3. Record `updated_count`, start/end timestamps, and SQL Editor result.
4. Run Section E.
5. If the normalization candidate count remains non-zero, repeat Section B only
   after confirming the prior transaction committed successfully.
6. Stop when `updated_count = 0`.

Never run overlapping Section B batches from multiple sessions.

## H. Manual execution — Section C

1. Select the complete Section C transaction only.
2. Execute once and record `updated_count`.
3. Run Section E.
4. Repeat Section C sequentially until `updated_count = 0`.

## I. Manual execution — Section D

1. Select the complete Section D transaction only.
2. Execute once and record `updated_count`.
3. Run Section E.
4. Repeat Section D sequentially until `updated_count = 0`.

## J. Progress verification — Section E

Section E must report:

- `customers_requiring_phone_normalization = 0`;
- `customers_requiring_record_version = 0`;
- `inventory_requiring_record_version = 0`;
- `invalid_nonempty_phone_count = 0`;
- `missing_customer_tenant_count = 0`;
- `normalization_conflict_count = 0`;
- `duplicate_canonical_identity_group_count = 0`;
- `invalid_record_version_count = 0`;
- `unexpected_core_v2_marker_count = 0`.

STOP on any non-zero result.

## K. Index readiness and creation

1. Execute Section F alone.
2. If the notice is `SKIP_SECTION_G`, do not run Section G.
3. If the notice is `CREATE_REQUIRED`, execute Section G alone and outside any
   explicit transaction.
4. Never wrap `CREATE INDEX CONCURRENTLY` in `BEGIN`/`COMMIT`.
5. If Section G fails, STOP. Do not drop or retry automatically.
6. Execute Section H alone.
7. Require Section H to complete without exception.

## L. Optional constraint validation

Each subsection I1, I2, and I3 requires separate approval and a low-traffic
window.

For each approved subsection:

1. Execute its gate `DO` block alone.
2. Require the gate to pass.
3. Execute only its matching `ALTER TABLE ... VALIDATE CONSTRAINT`.
4. Record duration, lock observations, and result.
5. Run the post-run verification after each validation.

Cancellation leaves the constraint `NOT VALID`; do not improvise cleanup.

## M. Success criteria

- All Section E counters are zero.
- The canonical customer identity index is present, unique, valid, ready, and
  exactly scoped to `(tenant_id, phone_normalized)` with the approved predicate.
- Every originally non-null normalized/version value remains unchanged.
- Customer, inventory, order, invoice, invoice-item, and movement row counts are
  unchanged.
- `financial_quotes`, `idempotency_commands`, and `atomic_outbox` remain empty.
- No historical snapshot field is populated.
- No customer is merged, deleted, reassigned, or selected as a winner.
- No branch prefix or invoice/order number is changed.
- Core V2 remains disabled.
- The read-only post-run verification produces no `FAIL`.

## N. Failure handling

If a read-only gate fails:

1. STOP.
2. Export the full result/error.
3. Do not begin a mutation section.

If Section B, C, or D fails before its `COMMIT`:

1. STOP.
2. Capture the error and transaction outcome.
3. Confirm rollback of that transaction using read-only counts.
4. Do not rerun until external review.

If failure occurs after one or more batches committed:

1. Preserve completed-batch evidence.
2. Do not clear normalized/version values automatically.
3. Use only a separately reviewed forward fix or full database restoration.

If concurrent index creation fails:

1. STOP.
2. Run A9 and Section H read-only.
3. Preserve `pg_index` validity/readiness evidence.
4. Do not automatically drop or recreate the artifact.

## O. Rollback policy

`03-rollback.sql` is deliberately fail-closed. Package 3R does not record
per-row before-images or an authoritative list of rows changed by each committed
batch. Clearing values based only on their current value could destroy
legitimate concurrent/application writes.

Automatic row-level rollback is prohibited. Recovery choices are:

- transaction rollback before the current batch commits;
- reviewed forward fix using retained exact evidence;
- full database restoration under backup authority.

## P. Evidence collection

Retain:

- all file hashes;
- Package 2R completion evidence;
- backup and project-identity evidence;
- maintenance approvals;
- A1–A10 exports;
- every Section B/C/D `updated_count`;
- Section E results after every batch;
- Section F notice;
- Section G result, when used;
- Section H result;
- each Section I gate and validation result;
- post-run verification export;
- before/after row counts;
- transaction errors and rollback proof;
- final external reviewer decision.

## Q. STOP conditions

STOP immediately if:

- a hash differs;
- Production identity is uncertain;
- backup or restoration authority is missing;
- Package 2R verification is incomplete;
- A10 raises an exception;
- any same-tenant normalized duplicate exists;
- any invalid non-empty phone or missing customer tenant remains;
- any existing normalized value conflicts with canonical derivation;
- any invalid record version exists;
- any unexpected Core V2 marker exists;
- any batch affects more than 1,000 rows;
- a transaction outcome is uncertain;
- row counts change;
- a historical snapshot field changes;
- an invalid/not-ready index artifact exists;
- Section H fails;
- Core V2 is enabled;
- any runtime grant/function/trigger/activation object appears;
- an operator is asked to improvise rollback or remediation.

Final state: **PREPARED FOR EXTERNAL PACKAGE 3 REVIEW; NOT EXECUTED**.

