# Phase 0 Retention and Quota Policy

All values below are **PROPOSED pending human privacy/security/product approval**. “Age” uses last-confirmed server time where available, not a trusted device wall clock.

## Dataset defaults

| Dataset | Proposed record/size limit | Proposed time limit | Freshness/stale behavior | Eviction |
|---|---:|---:|---|---|
| catalog/categories | current + previous complete version; 10,000 items | 30 days maximum | stale label after 24h; business enqueue also constrained by 2h command lease | old complete version after safe replacement |
| branch prices/settings/VAT/discount | one current + one previous signed version | 7 days | stale after 2h for financial use; may remain reference-only | old version after no draft/command reference |
| product images | 2,000 images or 500 MB, whichever first | 30 days since last reference | placeholder when absent; no business authority | first: unreferenced LRU, then non-visible old-version media |
| customer search index | 10,000 customers | 7 days | stale label after 24h | oldest non-selected/non-draft customer |
| customer profile/activity | 200 recent customers | 48 hours | display `as of` server timestamp | oldest non-referenced profile/activity |
| active orders | 500 orders | until terminal + 48 hours | status labelled with last-confirmed time | terminal oldest first after window |
| recent orders | 1,000 orders | strict server 48-hour window | no local extension from device clock | expires by server-time anchor |
| confirmed invoices | 500 invoices | 48 hours in initial phase | confirmed snapshot only | oldest after window and no command/receipt reference |
| status history | 5,000 events | with retained parent, max 48 hours initially | append cursor or full refresh; no invented delta | with parent after retention |
| sale drafts | 50 drafts | 7 days or explicit success/cancel/purge | local revision; warn at 24h | never automatic while active; user review |
| pending commands | pilot maximum 10 pending `order.create` | until terminal resolution; no age auto-delete | immutable status and attempt evidence | never automatic |
| terminal receipts | linked to command; no arbitrary record cap | 90 days after acknowledgement (proposed) | immutable server receipt hash | policy purge only |
| unresolved conflicts/manual holds | no arbitrary cap | until resolved + 90 days (proposed) | locked evidence | never automatic |

## Quota thresholds

- Request persistent origin storage as best effort; never assume it is granted.
- At **70% usage**, show a warning and run safe pruning: unreferenced media, old complete dataset versions, expired customer activity, expired confirmed history.
- At **90% usage** or first quota-write failure, preserve drafts, pending commands, unresolved receipts/conflicts and wrapped keys; block new offline financial commands.
- Pending commands, active drafts and unresolved receipts/conflicts are never automatically evicted.
- Cache/media eviction must commit reference counts transactionally and cannot remove a resource referenced by a pending command.

## Read behavior after lease expiry

- Proposed read lease: 24 hours absolute.
- Proposed business-command lease: 2 hours absolute.
- After command lease expiry but before read lease expiry: cached views remain read-only with prominent `as of`/stale status; no new business command.
- After read lease expiry or uncertain time: retain ciphertext but lock operational plaintext until online reauthorization.
- A server revocation epoch observed on reconnection locks affected namespaces before refresh/sync.

## Riyadh time boundaries

- The server remains authority for current time and 48-hour cutoffs.
- Cache manifests store `serverNow`, `receivedAtMonotonic` and timezone policy `Asia/Riyadh`.
- Crossing Riyadh midnight offline does not fabricate a new “today” authoritative dataset; the UI labels cached data with the last server business date.
- A device clock rollback/uncertainty blocks new financial commands.
- Month boundary never triggers local order/invoice numbering. Pending commands retain a local reference; the database allocates the official number at execution time in the authoritative month.

## Refresh model and API limitations

The current APIs provide bounded pages/full snapshots but do not expose a deterministic version authority for every dataset. Phase 2 must not claim delta sync from timestamps alone.

Future API work requiring separate review may include:

- signed/hashed bootstrap manifest with dataset versions and server time;
- deterministic pagination cursor and deletion tombstones;
- catalog/price/settings version identifiers;
- customer/order/invoice delta cursors with scope and retention guarantees;
- response size/count/hash evidence.

Until those exist, refresh uses complete bounded snapshots with atomic version swap. Partial refresh never replaces the last complete version.

## Privacy and purge

- Customer/invoice retention must be approved by the privacy owner.
- Logs/metrics contain counts, sizes, versions and safe classifications only; no phone, customer name, notes, payment details or command payload.
- Checked logout purges only the exact namespace after successful authoritative logout and the pending-command warning contract.

## Acceptance criteria

- synthetic quota tests at 69%, 70%, 89%, 90% and write failure;
- current complete dataset remains readable after interrupted refresh;
- non-evictable stores remain byte-identical through pruning;
- server-time midnight/month boundary matrix;
- no record from another namespace is enumerated or evicted;
- all freshness labels derive from stored server confirmation evidence.

