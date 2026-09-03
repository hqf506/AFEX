# Authority Correction Offline Employee Contract

## Immutable authority package

Each enrolled employee package binds:

- Primary Auth audit-subject reference at issuance;
- POS employee, tenant and branch;
- registered device and device authority generation;
- employee credential generation, PIN generation, permission generation and employee revocation generation;
- package, key-envelope and namespace generations;
- explicit dataset and command-type allowlists;
- issuer identity, algorithm versions, canonical package hash and lifecycle status.

Issuance and audit timestamps are evidence only. There is no expiry, maximum age, sliding window, periodic check-in or stale-sync denial. Validity ends only through learned trusted change/revocation, governed local removal/lock, exact purge, integrity/binding/schema/key failure or account/tenant/branch/device mismatch.

## Enrollment

Enrollment is Online only and requires current Primary Auth, target employee PIN verification, target employee active state, tenant/branch membership, exact role/permissions, authorized enroller, active device challenge proof and current generations. The first-pilot hard maximum is 25 active packages per device. A package over the cap or outside the exact branch/device namespace is rejected.

Packages for multiple employees unwrap the same branch namespace DEK but have independent employee/PIN/permission/revocation generations. Adding or removing an employee does not redownload shared branch data or rewrite another employee's commands.

## PIN and switching

Local PIN success proves only the exact signed package plus device-key possession and protected state. Primary Auth, cached profile, session storage or request employee ID cannot replace it. The client never stores plaintext/reversible PIN, raw server hash, reusable verifier or persisted PIN-derived key.

Five failures lock one employee package. Ten failures across employees in the observed 30-minute attempt-control window lock the namespace. Delays are 1/2/4/8/16/30 seconds. These are operational protections, not authority-expiry clocks. Counters, device aggregate and lock state are authenticated and survive restart. Corrupt/rolled-back state locks; it never falls back to plaintext.

Employee switch destroys outgoing in-memory plaintext, DEK and active read/command handles before evaluating the incoming package. Incoming failure leaves the device locked. Sealed commands retain the original employee and generations and can never be rebound to the incoming employee or Primary Auth subject.

## Permissions and invalidation

Read-only employees receive only dataset projections. Command-capable employees receive enumerated command types; the first pilot candidate is `order.create` only after later approval. PIN rotation, credential reset, permission/role change, branch transfer, deactivation or removal increments the corresponding generation. Trusted reconnect sees the mismatch before synchronization/acquisition and locks or quarantines affected authority.

Remote change may remain unknown for an arbitrarily long outage. That is explicitly accepted for Mode A. Server acquisition still evaluates current authority and may reject/review an old command without changing its actor.

## Audit and privacy

Issuance, removal, lock, failed proof, trusted reconnect, generation mismatch and package rotation append immutable, non-secret evidence with operator/reason. Logs contain opaque IDs and classifications, never PIN, verifier, keys, unredacted payload or customer PII.

## Acceptance

Tests cover all enrolled employees after restart/reboot, employee switching, no time cutoff, clock changes, cap enforcement, wrong branch/device/account, each generation mismatch, revoked employee, package rollback/corruption, concurrent enrollment/removal, command immutability and exact-scope purge.
