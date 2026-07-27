# AFEX Core V2 — Package 4T Financial Consistency Test

Status: NOT EXECUTED  
Environment: isolated Clone/Staging only  
Production execution: prohibited

## Objective

Prove that the committed invoice and invoice items reproduce the authoritative
quote exactly without consulting mutable configuration after commit.

## Test matrix

1. Catalog fallback price.
2. Branch override price.
3. VAT enabled and disabled.
4. Eligible percentage discount.
5. Eligible fixed discount.
6. No discount.
7. Multiple quantities and mixed lines.
8. Rounding boundary values.
9. Invalid quantity and unknown price.
10. Expired quote.
11. Altered quote payload or hash.
12. Configuration changed after quote issuance.
13. Same-key committed replay after mutable configuration changes.

## Assertions

- Request fingerprint matches the authoritative command.
- Quote hash verification passes only for the original payload.
- Derived financial snapshot equals quote snapshot byte-for-byte as JSONB.
- Derived snapshot hash equals the quoted lowercase SHA-256.
- Unit price source and source versions are preserved.
- Gross, discount allocation, taxable amount, VAT, line total, subtotal, total,
  payment snapshot, cost, and profit reconcile.
- Invoice total equals order total and sum of invoice lines.
- Currency and all engine/rule/snapshot versions are persisted.
- Committed replay returns the original immutable result.
- Stale or altered evidence fails before inventory, numbering, or persistence.

## Historical replay check

After mutating only isolated fixture catalog/VAT/discount configuration, rebuild
the committed response solely from order, invoice, invoice-item, idempotency,
and snapshot evidence.

Expected: the committed financial response is unchanged and requires no lookup
of the newly mutated configuration.

## Evidence

Retain sanitized requests, quote and snapshot hashes, source/version fields,
line calculations, totals, structured errors, and before/after row counts.

## STOP conditions

- Any tolerance-based rather than exact parity.
- Missing snapshot evidence.
- Recalculation from mutable data is needed for committed replay.
- Order/invoice/line totals disagree.
- A failed quote check reaches inventory or persistence.

