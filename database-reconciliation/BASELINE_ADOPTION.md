# AFEX ERP/POS
## Production Baseline Adoption

Status: ADOPTED

Baseline schema:

database-reconciliation/baseline/production-baseline.sql

Policy

- Production schema is the canonical schema.
- production-baseline.sql is the canonical schema artifact.
- Historical migrations remain preserved.
- Historical migrations are not modified.
- Historical migrations are not deleted.
- Future schema work starts after the baseline.
- Every future schema change must be introduced as a new migration.
- Historical migrations remain available only for audit and project history.

Notes

- Database reconciliation completed successfully.
- Duplicate migrations documented.
- Superseded definitions documented.
- Security review completed.
- Storage review completed.
- Baseline approved.

Approved by:
Project Database Reconciliation