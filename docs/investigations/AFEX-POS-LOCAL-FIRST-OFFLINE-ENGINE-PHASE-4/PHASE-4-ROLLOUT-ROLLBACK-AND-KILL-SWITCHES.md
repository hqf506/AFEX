# Phase 4 Rollout, Rollback, and Kill Switches

## Independent server-authoritative switches

| Switch | Default | Stops |
| --- | --- | --- |
| `offline.local_reads` | off | Device-bound sensitive cached projection decrypt/display |
| `offline.sensitive_cache_writes` | off | New encrypted sensitive projection writes |
| `offline.outbox_enqueue` | off | Sealing durable local commands |
| `offline.outbox_dispatch` | off | Network dispatch/replay of all commands |
| `offline.command.order_create` | off | `order.create` enqueue/acquisition/execution |
| `offline.command.<type>` | off | Each future command independently |
| `offline.device_authority_issuance` | off | New device/employee authority issuance; it does not claim immediate reachability of a disconnected device |
| `offline.order_pilot` | off | Pilot branch/device population |
| `offline.external_effects.whatsapp` | off | WhatsApp claims/delivery |
| `offline.external_effects.notifications` | off | Notification claims/delivery |
| `offline.official_print_eligibility` | off | Official receipt print enablement |

The client records the last observed switch set for diagnostics. Server acquisition and effect workers enforce current switches independently of UI state. Under selected Mode A, a remote switch cannot immediately terminate already held authority on a disconnected device; it is discovered on trusted reconnect. An authorized local administrative lock or exact purge can stop it earlier.

## Rollout gates

1. Human approval of Phase 4 contracts and decisions.
2. Read-only Production attestation of Core, actor-session, numbering, inventory, ownership, grants, RLS, and effect objects.
3. Independent review of exact SQL drafts produced after attestation.
4. Manual SQL execution in a separately authorized phase/environment.
5. Static and isolated integration qualification of authority functions.
6. Mode A managed-device enrollment with server acquisition/effect switches off and an explicit continuous-Offline risk notice.
7. Read-only encrypted cache pilot.
8. Durable enqueue pilot with dispatch off.
9. Receipt-only synthetic dispatch qualification.
10. Single branch/device `order.create` pilot, external effects initially suppressed.

## Fail-closed rollback

Rollback first stops new device/employee authority issuance, command acquisition, and dispatch. Local enqueue on a disconnected device ends only when it learns the switch on trusted reconnect or an authorized local lock is applied. Rollback preserves encrypted pending commands, immutable receipts, conflict evidence, device audit, and effect ledger; it never routes them through the legacy endpoint.

The current online POS remains authoritative and available. An exact-scope purge may remove one tenant/branch/device namespace after human authorization. Server-received commands and receipts are never destroyed as a rollback shortcut. External workers can be stopped independently without rolling back committed orders.

## Lost or compromised device

Revoke device authority, rotate envelope generation, disable branch Offline switches, preserve server receipts/audit, and require manager review. A disconnected device cannot observe the remote decision; this long-outage exposure is the selected human-approved Mode A residual risk.

## Synchronization visibility during rollout

Every surface shows `Online`, `Offline`, `Syncing`, or `Attention`, exact last-sync date/time and age, command counts for pending/syncing/synced/failed/conflict/blocked, local snapshot marker/time and inventory frontier, and a warning that remote changes may be unknown. “Sync now” is available and automatic synchronization begins on trusted return. Old synchronization age never blocks reads or commands.

## No destructive downgrade

No rollback migrates ciphertext to plaintext, converts a pending offline command into a new online command, changes employee attribution, or releases payment/stock commitments silently. Unreadable local ciphertext is either retained for authorized recovery or explicitly purged.
