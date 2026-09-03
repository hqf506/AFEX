# W1 deactivation and recovery contract

`90-DEACTIVATE-W1-MULTI-DEVICE-ONBOARDING.sql` is an emergency ingress deactivation, not a rollback of enrolled devices.

It revokes `service_role` EXECUTE from the four W1 public V3 facades. It does not drop private functions, indexes, devices, envelopes, active V2 bootstraps, employee authorities, command bindings, receipts, events or evidence. It does not recreate `offline_devices_one_active_branch_uidx`: after W1 activation, multiple active devices can be legitimate and a singleton index could not be restored safely.

The SQL snapshots W1 data identities and PostgreSQL 17 membership rows, uses owner-aware transaction-local `SET` authority only when necessary, removes only the installer-created grant, and fails before `COMMIT` unless data and membership snapshots remain exact.

Recovery is forward-only: independently review the current catalog, re-grant only the four V3 facade EXECUTE privileges as `afex_function_owner`, then enable `AFEX_OFFLINE_MULTI_DEVICE_ONBOARDING_W1_ENABLED=true` only in Preview. Existing devices remain usable under their already-issued authority; no revoked key is revived.

Application rollback is setting the Preview flag false. That restores V2 caller routing and does not mutate database data. It is unsuitable for onboarding a new sibling device while the legacy singleton semantics are desired, but it safely closes W1 ingress.
