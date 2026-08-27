# Phase 3 Performance and Dormancy Evidence

## Dormant production path

| Metric | Before Phase 3 | After Phase 3 |
| --- | ---: | ---: |
| Phase 3 startup IndexedDB scans | 0 | 0 |
| Phase 3 network requests | 0 | 0 |
| Phase 3 business writes | 0 | 0 |
| command polling loops | 0 | 0 |
| Service Worker command dispatches | 0 | 0 |
| current checkout interception | 0 | 0 |

No route imports Phase 3, so the dormant foundation adds no online checkout work. Source gates found no `fetch`, timer, Service Worker registration or current route integration in `phase3.ts`.

## Future budgets

- Enqueue transaction p95 target: 75 ms.
- Authorized counter query p95 target: 25 ms.
- Dependency ordering p95 targets: 5 ms at 10, 20 ms at 100, 150 ms at 1,000 commands.
- Maximum canonical payload: 65,536 bytes.
- Maximum unresolved commands: 5,000; warning at 4,000; hard stop at 5,000.
- Quota warning/hard stop: Phase 1 storage ratio policy remains 70%/90%; command-count hard stop rejects before payload encryption/persistence.

Indexed state counts use `IDBIndex.count`; oldest pending uses one indexed cursor. Full-outbox `getAll` is not used. Dependency ordering reads only an explicit bounded command-ID set.

## Synthetic Chromium observation

The real Chromium contract test measured only the pure local topological algorithm on this workstation:

| Commands | Ordered | Observed duration |
| ---: | ---: | ---: |
| 10 | 10 | 0.20 ms |
| 100 | 100 | 0.00 ms |
| 1,000 | 1,000 | 0.80 ms |

These are synthetic workstation observations, not p95 samples and not real-device claims. Enqueue/counter p95 and real-device metrics remain **UNPROVEN** until production authority and a separately approved enabled pilot exist.
