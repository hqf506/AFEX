# Phase 3 Human Review Correction

The human source review rejected the initial Phase 3 package for three blocking defects. This correction remains strict shadow mode and does not authorize Phase 4, production persistence or dispatch.

## Corrected source identities

| File | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| `lib/offline/phase1.ts` | `221336520ab7a54f398c8095ddb1dddf9f1c3a0008f74bab80ca9727457fb9f3` | `f9198bd7029a51c517ea37eb44f3c079a3269a199e7f606e248daa95476eccfd` |
| `lib/offline/phase3.ts` | `f174394e30bc0831471599a88d7c036b54594fb8a858b7edfee0bdd8750f4008` | `68f3a8035c95061ec95eab883be403328f6bcaeb54419a15308e9a338cd23cb0` |
| `tests/pos-offline-phase3.test.mjs` | `c01c531a4b3700624e38abcfc463c601f999298e998d9d1034097edbd122a27e` | `d0ce8f05acecfcd13161457b6f8d7f3bf4e4f9f066330155b090c10dbd76e665` |

## Defect 1 — version-aware migration

The initial upgrade validated only Phase 1 store names. The corrected contract uses explicit store/index descriptors including store key path, `autoIncrement`, index key path and uniqueness.

- `oldVersion=0`: creates the complete current schema.
- `oldVersion=1`: requires the complete Phase 1 structure, validates any pre-existing forward stores, then creates missing Phase 2/3 stores.
- `oldVersion=2`: requires complete Phase 1 and corrected Phase 2 structures before Phase 3 creation. A missing/wrong Phase 2 store or index aborts as `OFFLINE_SCHEMA_CORRUPT`; it is never recreated empty.
- Other upgrade origins fail as `OFFLINE_SCHEMA_UNSUPPORTED`.
- Every opened v3 database is structurally validated before its schema metadata is updated or returned.

Chromium tests prove valid v1/v2 preservation, missing Phase 2 fail-closed behavior without empty recreation, wrong Phase 2 index rejection, and missing/wrong Phase 3 structure rejection.

## Defect 2 — semantic dependency policy

Dependencies are now an exact set, not a permissive superset. The preliminary validator loads the complete ancestor closure, verifies namespace and immutable envelope integrity, applies command-type/aggregate policy, and rejects missing/self/cross-scope/cyclic graphs.

Immediately before insertion, the same closure is re-read inside the `commandOutbox` + `commandDependencies` read/write transaction. Local command ID, command type, namespace, aggregate ID, envelope hash, dependency projection hash and dependency IDs must match the preliminary snapshot. A stale/deleted/substituted dependency aborts the transaction before either command or edge is written.

The remaining external-tamper window is after the atomic transaction commits. It cannot produce a partial local write; subsequent duplicate validation, read/planning integrity checks and future dispatch qualification fail closed. Phase 3 has no dispatcher, so no external effect can occur in this window.

## Defect 3 — provider authority

`provider_confirmed` remains in the future domain model but is excluded from `Phase3EmployeePaymentConfirmationStatus`. The local employee enqueue validator accepts only `not_integrated` or `employee_attested` for all eight AFEX payment methods. An external reference never upgrades authority. Tests reject `provider_confirmed` for every method.

## Safety

Authority remains B. Production sensitive persistence, durable outbox enablement, dispatch, replay, interception, Service Worker command handling, provider calls, SQL/DB/Production/business writes and Git writes remain zero. Phase 4 has not started.
