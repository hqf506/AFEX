# Test evidence

## Focused

- `node --test tests/pos-offline-core-v2-authority-bridge.test.mjs`
- Result: `30/30 PASS`

Coverage includes exact envelope and all eight payload shapes; cross-command, empty, duplicate and monetarily inconsistent payload rejection; command/aggregate mapping; exact order/frontier item set; payment identity; all eight payment methods; full acquisition scope; legitimate authority-bound receipt replay; cross-actor/tenant/branch/employee/device/generation/command conflicts; receipt identity mismatch; exact resolver/snapshot parsing; undefined, malformed, duplicated, oversized, reordered, thrown and count-mismatched resolver results; per-candidate isolation; fixed stage order; receipt-only sync; review CAS; effect identities; cancellation/refund blocks; immutable flags; one resolver batch call and synthetic performance.

## Inherited regressions

- Phase 1, Phase 2, Phase 3 and Application Compatibility combined result: `63/63 PASS`.

## Static gates

- TypeScript `npx tsc --noEmit`: PASS
- Scoped ESLint on the two new implementation/test files: PASS, zero warnings
- `git diff --check`: PASS
- Secret scan: PASS, zero credential or secret-value findings
- Prohibited-path scan: PASS, zero SQL, migration, package, lock or R8N changes

Build was not required and was not attempted. No environment or credential file was created.
