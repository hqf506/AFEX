# Test evidence

## Passed

- Corrected Application compatibility tests: `27/27`.
- Phase 1 regression: `10/10`.
- Phase 2 regression: `12/12`.
- Phase 3 regression: `14/14`.
- Customer mobile/profile tests: `26/26`.
- Customer selection binding: `26/26`.
- Auth regression scripts: `6/6` passed (welcome email, forgot password, reset password, email sync, recovery prefetch, and signup OTP).
- Responsive UX source assertions: `151` assertions passed.
- POS UX recovery checks: passed.
- POS performance/correctness: passed.
- Inventory performance/correctness: passed.
- Production error-safety checks: passed.
- TypeScript `npx tsc --noEmit`: passed.
- ESLint on every phase-modified/added source and test file: passed with zero findings.
- `git diff --check`: passed.

The runtime-oriented correction cases cover same-scope deduplication; account, tenant, branch, POS employee, and POS session-generation isolation; stale completion rejection; logout cache clearing; legacy/v2 response isolation; equal-timestamp continuation; tenant/branch/window/filter cursor-scope rejection; assigned-branch spoof rejection; and bounded authenticated query input.

## Unrelated observed discrepancy

An additional combined run included `tests/pos-customer-full-height-layout.test.mjs` and reported `1` failure out of `15` because it expects the historical literal CSS text `.afex-pos-sale-employee small { display: none; }`. This correction changed no CSS, customer component, or that test. The authorized customer mobile/profile suite itself passed `26/26`; the unrelated literal-source assertion was recorded and not silently changed.

## Repository-wide lint

`npm run lint` found zero error in this phase's files but stopped on one pre-existing unrelated `prefer-const` error in `database-reconciliation/core-v2/P2D/A2.4B.3-ISOLATED-DIRECT-EXECUTE-HARNESS.ts:396`, plus 13 unrelated warnings. The prohibited unrelated file was not modified.

## Production build

`npm run build` compiled successfully and completed its TypeScript stage. Static page generation then stopped because `NEXT_PUBLIC_SUPABASE_URL` is absent while prerendering `/admin/settings/invoices/digital`. No fake credential or environment file was created. Classification: `BUILD_DEFERRED_EXTERNAL_REQUIRED_ENV_UNAVAILABLE`.

## Safety scans

- Scoped secret/credential findings: `0`.
- Service-role reference in profile presentation route: `0`.
- Sync/projection transactional call findings: `0`.
- Staged paths: `0`.
- SQL/DB/Production/business calls made by this phase: `0`.
