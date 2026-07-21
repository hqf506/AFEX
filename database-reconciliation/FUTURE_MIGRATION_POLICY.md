# Future Migration Policy

1. Never edit historical migrations.

2. Never reorder historical migrations.

3. Never delete historical migrations.

4. Never squash historical migrations.

5. New database work always starts from the production baseline.

6. Every schema change must be implemented as a new migration.

7. Production baseline is the reference during reviews.

8. Migration filenames remain chronological.

9. Security review required for:
- SECURITY DEFINER
- RLS
- Policies
- Grants
- Storage
- Auth

10. Database reconciliation reports remain archived.