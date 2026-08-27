# Trusted Actor Provenance Closure Baseline

## Repository gate

- Repository: `C:\Users\NSC-LUA\Desktop\leather-fix-erp-pos-responsive`
- Branch: `codex/pos-responsive-redesign`
- Baseline and current HEAD at the start gate: `37331390ec00bee507f88701365bfebb944db675`
- Upstream: ahead 0, behind 0
- Staged paths: 0
- The worktree already contained tracked and untracked Phase 1–4, Application Compatibility, Core bridge, Pilot and SQL Authority work. Those changes were preserved. No cleanup, reset, checkout, staging or history write occurred.
- `runtime-integration/R8N-*`: opened 0, modified 0.

## Reconciliation result

The repository and frozen Production evidence agree on one authority chain:

1. `requireVerifiedAuthContext` verifies the access-token subject, current user and Auth session ID.
2. `resolvePosActorSession` resolves an opaque credential server-side and returns an immutable `EffectivePosActor`, including its database session ID.
3. The online order route currently gives Core V2 the Primary Auth user ID. The POS session ID was previously discarded by `AuthorizationContext`.
4. `actor_sessions` is an online, expiring authority. It is not the durable Offline origin authority.
5. Corrected Phase 4 contracts require verified Online establishment-account bootstrap, managed device, PIN-independent key-envelope authority, and a structured PIN verifier used only for pre-enrolled employee selection without time-based Offline expiry.
6. Existing `atomic_authorization_contexts` remains order.create-only and lacks current Auth/POS session plus Offline origin bindings.

No identity conflict was found. The four finite gaps were therefore closed with one additive v2 model rather than another UUID-equality helper.

## Implemented review boundary

- Server source preserves the verified POS session ID in a branded, frozen, non-serializable `afex-sync-uploader-context.v1`.
- Activation is immutable false and classified `SHADOW_PROVENANCE_NOT_ACTIVE`.
- The Offline origin reference has exactly 15 non-secret immutable fields, including stable bootstrap ID/generation, enrollment ID, and namespace generation.
- Canonical authority binding is upgraded from 21 fields/v1 to 22 fields/v2.
- A versioned immutable companion extends, but does not mutate, historical Core authorization contexts.
- Exact inactive review SQL defines four provisioning waves, device/enrollment/key/snapshot/bootstrap references, a narrow Auth-session helper, one common validator, and the four acquisition contracts.
- Current `/api/orders` Core database call and business behavior are unchanged.

## Safety accounting

SQL/DB/Supabase/Production/Preview/Docker/network/provider/business executions: **0**.  
Sensitive flags enabled: **0/12**.  
Git stage/commit/push/merge/deploy: **0**.
