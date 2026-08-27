# Risk and rollback

## Remaining risks

1. The old direct browser profile authority path remains until each internal authority consumer has a trusted replacement. Removing it now would break role/tenant/branch/PIN behavior.
2. The dedicated inventory v2 route has static and pure contract qualification only because database access is prohibited. It remains disabled until an approved non-Production integration qualification confirms the view contract; the legacy route is unaffected by that flag.
3. The sync UI cannot truthfully report a last successful server synchronization time until a canonical local receipt timestamp exists. It displays unavailable rather than inferring success.
4. Local inventory enforcement remains blocked by the absent trusted branch snapshot/frontier and disabled persistent unwrap/Production outbox authority.
5. The full build needs the externally supplied `NEXT_PUBLIC_SUPABASE_URL`; compilation and TypeScript passed, but static generation could not finish locally.

## Rollback

- Leave all three rollout flags unset/false to retain current runtime behavior.
- Remove the provider wrapper and its two presentation fallbacks to remove the dormant caller migration.
- Remove the dedicated v2 route and contract to retain the untouched page-number inventory path.
- Remove the dormant sync component from the POS shell.
- Remove the pure projection module additions; no persisted data or server state requires migration.

Rollback requires no SQL, data cleanup, command replay, or external-effect compensation because none was enabled.
