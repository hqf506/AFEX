# Connection and synchronization status result

`PosOfflineSyncStatus` is integrated into the POS shell behind the disabled `NEXT_PUBLIC_AFEX_OFFLINE_SYNC_STATUS_UI` flag.

When enabled, it uses:

- browser `online` and `offline` events;
- one initial bounded read;
- one revalidation when a hidden tab becomes visible;
- `getActiveOfflineNamespace()` and Phase 3 authorized metadata counters only.

It exposes Online, Offline, Syncing, and Attention states, pending count, combined failed/conflict/blocked count, and an honest “not locally available” last-success value when no canonical receipt timestamp exists. Synchronization age is informational only and never blocks Offline access.

It contains no interval, command payload read, fetch, dispatcher, replay, business write, or manual sync action. If local authority is locked, it fails closed to connectivity-only display rather than opening encrypted data.
