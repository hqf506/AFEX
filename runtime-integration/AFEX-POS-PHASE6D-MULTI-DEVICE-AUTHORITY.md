# AFEX POS Phase 6D — Multi-device authority qualification

Verdict: `ALREADY_SUPPORTED_AND_QUALIFIED`.

- Supabase Auth issues an independent session identifier per authenticated device session; the application accepts that identifier only from the server-verified `getClaims()`/`getUser()` boundary.
- `auth_session_locks` is keyed by `(authenticated_subject_id, authenticated_session_id)`, and active actor-session uniqueness is scoped to that same pair. Device A therefore cannot replace Device B's POS actor state.
- Ordinary end-POS calls `revoke_pos_actor_session_v1`, whose mutation predicate includes token hash, authenticated subject, and authenticated session ID. It ends only the current device authority.
- Administrative actor-wide revocation is a separate RPC with an authenticated administrator predicate. Actor disable, deletion, PIN, role, branch, tenant, and security-reset reasons revoke all active sessions for that actor.
- A missing/tampered cookie cannot restore organization authority for a session that has a permanent authority tombstone. Cookies are HttpOnly/SameSite=Strict and no JWT, PIN, or actor token is stored in localStorage.
- No SQL, constraint, RPC, Core V2, checkout identity, or financial behavior change is required by Phase 6D.
