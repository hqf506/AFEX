# AFEX Final Acceptance Phase 1-R4D — Executed Qualification Report

## Safety boundary

- Preview connections/actions: 0.
- Production installation: exactly one successful official `supabase db push` after one fully rolled-back R4C attempt.
- Git writes: 0.
- Database installations: disposable local clones only.
- Qualified and installed R4D SHA-256: `a20cb4fbcf64c6b4c1c05285e49eb473e52192db2040e8ee78ce5feffcf4a521`.

## Database and concurrency matrix

| Gate | Vanilla PostgreSQL 17.6 | Supabase Local PostgreSQL 17.6 |
|---|---:|---:|
| Temporary login initially equals current/session user | PASS | PASS |
| Lawful temporary-login→postgres SET-only edge | PASS | PASS |
| Post-SET current/session split | PASS | PASS |
| Effective postgres non-superuser/CREATEROLE identity | PASS | PASS |
| Clean install and catalog/ACL/RLS assertions | PASS | PASS |
| ACTIVE/EXPIRED/REVOKED restriction | PASS | PASS |
| New Auth session without tombstone | NO_RESTRICTION | NO_RESTRICTION |
| 91-day detailed-evidence cleanup | PASS | PASS |
| Permanent restriction tombstone retained | PASS | PASS |
| Organization profile disabled | DENIED | DENIED |
| Organization profile tenant changed | DENIED | DENIED |
| Organization profile deleted | DENIED | DENIED |
| Concurrent cleanup/issuance | tombstone=1 | tombstone=1 |
| Concurrent ordinary validation | 2/2 PASS | 2/2 PASS |
| Cleanup available to service_role | NO | NO |
| Dangerous runtime memberships | 0 | 0 |
| SET-capable memberships after install | 0 | 0 |
| Unexpected memberships | 0 | 0 |
| Expected creator-administration edges | 2 | 2 |

Each organization-profile writer held an uncommitted mutation for three seconds. Validation started while the lock was held, waited, observed the committed disabled/changed/deleted state, and returned zero authority. For cleanup/issuance contention, cleanup used SKIP LOCKED, issuance completed through the conflict-updating UPSERT, and exactly one non-null tombstone remained.

## Installer negative and rollback matrix

The executable installer harness passed 17/17 cases, including direct Mode A, runner-pre-set Mode B, missing SET, session CREATEROLE, superuser target, target without CREATEROLE, third effective role, Core member mismatch, unexpected grantor, extra SET edge, six failure-injection boundaries, and reinstallation. Every failed installation left roles/schema/relations/functions/temporary edges at `0/0/0/0/0`.

## Application and static validation

- Real Supabase Local Auth organization login: PASS.
- Official PIN route: invalid PIN denied; valid PIN issued one active authority.
- Restricted direct Admin page navigation: DENIED/redirected.
- Preserved R4B focused security tests: 19/19 PASS.
- R4C installer-focused tests: 7/7 PASS.
- TypeScript: PASS.
- Targeted ESLint: 0 errors, 2 pre-existing unused-import warnings.
- Core V2 integration: 37/37 PASS.
- Customer binding: 26/26 PASS.
- Financial, inventory, persistence, application, and acquisition-observability suites: PASS.
- Production build: 115/115 pages.
- Client bundle authority/secret scan: PASS.
- `git diff --check`: PASS.

## Qualification boundary

The local application fixture intentionally omitted Core business tables and providers. No Core checkout, replay, inventory, WhatsApp, Preview, or Production qualification is claimed. Integrated Core checkout/replay remains reserved for Preview after independent SQL approval.
