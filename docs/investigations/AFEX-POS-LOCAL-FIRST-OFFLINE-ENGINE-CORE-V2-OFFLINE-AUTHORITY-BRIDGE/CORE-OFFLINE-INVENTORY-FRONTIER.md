# Inventory frontier

The trusted frontier contract binds tenant, branch, snapshot UUID, server-confirmed timestamp, frontier version, catalog item UUID and non-negative confirmed stock.

An inventory-affecting `order.create` candidate must carry a compatible frontier reference whose unique, canonically sorted catalog item set exactly equals the normalized order item set. Missing or invented item identities reject before qualification. The trusted resolver must return the same tenant, branch, snapshot and frontier version, and every referenced catalog item must be present. Missing authority fails closed with `TRUSTED_INVENTORY_FRONTIER_UNAVAILABLE`.

Trusted frontier results are exact runtime-parsed, capped at 200 items, sorted deterministically and reject duplicate item identities, malformed fields or negative/non-integer stock.

The bridge does not ingest snapshots, persist frontiers, query Production or invent a snapshot provider. The existing local projection may consume a snapshot only after this compatibility check exists in a future approved caller path. No negative confirmed stock is accepted.
