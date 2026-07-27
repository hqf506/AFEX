# Package 6R Activation Test Plan

Status: NOT EXECUTED. Isolated Clone/Staging only; Production prohibited.

Test disabled seed, kill switch, global gate, tenant gate, branch gate, feature
gate, deterministic canary stability, null-branch behavior, evidence
requirements, optimistic record version, deactivation, in-flight transaction
behavior and cache invalidation.

Begin from an isolated 06A → 06B → 06 installation. Test wrong-role execution,
invalid environment, missing evidence, stale record version, tenant/branch
scope mismatch and simultaneous state changes. Disable and kill switch must
dominate every other state; deterministic canary results must be stable without
enabling a Production canary.

Every transition requires a named operator fixture and retained sanitized
evidence. Failed transitions roll back, and all fixture state must be restored
to global/tenant/branch disabled before completion. No global activation,
Production canary, runtime grant or legacy-path closure is authorized.
