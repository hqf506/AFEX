# Authority Correction Human Decisions

## Locked inherited decisions

- `selectedMode = MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE`
- `timeExpiryPolicy = NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY`
- `connectivityPolicy = OPPORTUNISTIC_NOT_MANDATORY`
- `revocationDiscovery = ON_TRUSTED_RECONNECT_OR_AUTHORIZED_LOCAL_LOCK`
- `residualRiskAcceptance = HUMAN_APPROVED`
- one managed active Offline device per `(tenant, branch)`;
- maximum 25 pre-enrolled employee packages for the first pilot;
- no recovery escrow initially;
- synchronization age is visible and never an authority cutoff;
- all eight payment representations remain distinct;
- Phase 5 remains blocked.

## Architecture decisions selected here

1. Core V2 becomes the only order/invoice mutation engine; legacy invoice creation and cancellation restoration retire.
2. Direct authenticated business-table writes are zero.
3. Only catalog/branch-price/VAT reads remain directly scoped. `profiles`, `inventory_movements`, and `inventory_movements_view` have zero browser object privilege and are read through trusted server routes.
4. Customer phone lookup remains a narrow authenticated RPC; customer creation is server-only.
5. Every sensitive owner function loses PUBLIC/anon/general-authenticated execution; trigger helpers are trigger-only.
6. New device, Offline authority, review and effect domains use distinct NOLOGIN owners/runtime roles.
7. A dedicated business review container is selected instead of overloading technical Core reconciliation.
8. Core acquisition stores Primary Auth audit subject and actual POS employee/device/generations atomically.
9. External effects use one transactional intent per command/type/version and trusted workers only.
10. Official print eligibility derives from a server receipt; provisional local output is not official.
11. Replacement/lost-device and manager-recovery actions require two distinct authorized human approvals during the first pilot.
12. First-pilot command type, if later approved, is only `order.create`.
13. Profiles use model C: the existing trusted authorization/account route boundary performs one full lookup through an exact server-only database gateway, never through the user-bound authenticated client, and returns only `username`, `full_name`, `contact_email`, `phone`, `tenant_name`, `branch_name`, and the enumerated `ui_capabilities`; raw tenant/branch/role/status/credential/security/internal authority fields are not browser-readable and self-service writes remain denied.
14. Inventory movement history uses model D: the existing trusted Next.js route is the sole browser entry point; browser roles have no base/view privilege, the route applies server-derived tenant and authorized-branch predicates, page size is at most 50, UTC windows are at most 366 days with a 30-day default, and ordering is `created_at DESC, id DESC`.
15. RLS is accepted only as row authorization. Neither selected projection relies on RLS for column secrecy, and the server-only use of the security-invoker inventory view has explicit trusted-gateway underlying reachability rather than authenticated base privileges.

## Human/operational selections still required before implementation or pilot

These do not leave the architecture ambiguous; they bind named operations and rollout values:

- approve this package before any separate SQL design or Prompt 8;
- approve the caller-by-caller compatibility inventory proving that every direct profile and inventory movement read has moved to the selected trusted route before Wave 1 revokes any ACL;
- name the exact owner teams and human identities for device enrollment, dual-control replacement/loss, employee enrollment/removal, review, finance and rollback;
- select the pilot tenant/branch/device and roster below the fixed cap;
- approve data/evidence retention durations and customer lookup projection fields; the profile presentation allowlist is fixed by decision 13 and may expand only through a new security review;
- approve managed browser/OS/disk/profile controls and incident procedure;
- approve WhatsApp/notification template versions and effect retry/terminal thresholds;
- approve legal wording for receipt-derived official print and any non-official local preview;
- approve performance budgets, maintenance windows, monitoring thresholds and evidence retention;
- issue separate approvals for reviewed SQL, Preview qualification and Production/pilot activation.

No item above authorizes SQL, implementation, deployment, Production access, persistent unwrap, outbox, replay or Phase 5.
