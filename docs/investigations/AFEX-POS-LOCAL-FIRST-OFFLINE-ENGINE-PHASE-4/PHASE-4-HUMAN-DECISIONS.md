# Phase 4 Human Decisions — Account Bootstrap and Employee PIN Selection

## Frozen decisions

| Topic | Human-approved decision |
| --- | --- |
| Mode | `MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE` |
| Initial authority | verified Online establishment-account login is mandatory |
| Connectivity after bootstrap | `OPPORTUNISTIC_NOT_MANDATORY` |
| Authority age | `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY` |
| Employee PIN | selects one pre-enrolled employee only |
| Data encryption | device-bound and independent of employee PIN |
| Restart without explicit logout | Offline reopen allowed; employee PIN required again |
| Explicit account logout | disables Offline PIN/access; same-account Online login required |
| Pending work at logout | retain encrypted and inaccessible; never delete or reassign |
| Pilot roster | maximum 25 active employees per managed branch device |
| Pilot commands | exactly `order.create`; seven deferred commands rejected |
| Mode B | optional later native hardening |
| Modes C/D | rejected |

The old employee-PIN-to-DEK model is superseded. It is not a parallel or fallback authority.

## PIN verifier

`PBKDF2-HMAC-SHA256`, 600000 iterations, unique random 32-byte salt, 32-byte derived verifier, verifier version 1. Memory and parallelism are not applicable to PBKDF2. Plaintext, reversible, unsalted SHA-256, Auth reuse, DEK derivation, and provider use are forbidden.

## Identity rules

Employee selection may change `actualPosEmployeeId`, attribution, permission selection, local lock/switch state, and employee command generation. It may never change primary account, tenant, branch, device, Auth session, bootstrap, namespace, or encryption key. Every queued command remains bound to its original account and employee.

## Logout warning and recovery

Before explicit logout with pending/syncing work, the UI must warn that work will become inaccessible until the same establishment account authenticates Online. Logout immediately blocks PIN entry and Offline order creation. Cross-account, cross-tenant, and cross-branch recovery are forbidden.

## Preserved product contracts

- `localAvailable=max(0,lastConfirmedBranchStock-pendingAndSyncingLocalCommitments)` and both distinct Arabic inventory messages remain exact.
- All eight payment methods remain semantically distinct.
- Last-sync time/age is displayed but never blocks otherwise valid Offline work.
- Device/employee revocation learned at trusted reconnect blocks future Offline authority before synchronization.
- Business callers and all transactional/sensitive flags remain disabled.

## Activation boundary

The SQL candidate creates separate private NOLOGIN provisioning and acquisition roles. It grants no membership or browser execution path. A later trusted-server activation mechanism requires independent review; this task authorizes neither SQL execution nor runtime integration.
