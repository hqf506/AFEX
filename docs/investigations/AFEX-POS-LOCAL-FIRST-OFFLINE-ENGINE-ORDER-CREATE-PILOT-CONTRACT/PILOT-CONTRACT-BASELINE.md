# AFEX Offline Initial Pilot Contract Baseline

- Repository: `C:\Users\NSC-LUA\Desktop\leather-fix-erp-pos-responsive`
- Branch: `codex/pos-responsive-redesign`
- Baseline HEAD: `37331390ec00bee507f88701365bfebb944db675`
- Contract version: `core-v2-offline-order-create.v2`
- Pilot command allowlist: `order.create` only
- SQL/DB/network/Production/provider/business/Git writes: `0`

The initial pilot preserves Core V2 as the sole order, invoice, numbering, inventory, ledger and receipt authority. The package now includes an exact inactive SQL review candidate for the provisioning, bootstrap, acquisition, resolver, receipt, and provenance contracts, but authorizes no execution or activation. It does not enable dispatch, replay, Offline order creation, persistent device-key implementation, interception, external effects or any sensitive/transactional flag.

Offline origin authority and the current sync uploader are distinct. The durable origin uses the exact fifteen-field `afex-offline-origin-authority.v2` reference and binds the verified Online account bootstrap, tenant, branch, managed device, pre-enrolled employee selector, key namespace and all relevant generations. Replay requires a fresh server-verified Auth session, POS actor session and active same-account bootstrap. Expiry of the original Online session alone does not invalidate retained work when no explicit logout occurred.

The employee PIN is never an establishment-account credential or encryption factor. It selects one pre-enrolled employee only. Explicit account logout disables PIN access and keeps pending work encrypted and inaccessible until the same establishment account authenticates Online again; cross-account, cross-tenant and cross-branch recovery are rejected.

The seven non-pilot command shapes remain isolated Shadow Mode contracts. Their database writers are not launch dependencies and are not described as implemented or resolved.

The package is based on the already attested current Core structures, all of which remain `order.create`-only. No broad eight-command Core constraint widening is approved.
