# Phase 2 Performance Comparison

## Measured local signals

| Signal | Baseline | After | Interpretation |
| --- | ---: | ---: | --- |
| Phase 1 focused suite wall sample | 1,859 ms | 2,084 ms | +12.1%; below the 20% stop threshold, but test-run duration is not a user-flow p95. |
| Phase 2 focused suite | n/a | 2,799 ms for 9 tests | Includes Chromium launch, IndexedDB, WebCrypto and a real Service Worker; not a route p95. |
| Real lock-shell fallback sample | n/a | approximately 257 ms inside the focused test | One loopback sample, not p95 and not authenticated runtime evidence. |
| POS performance/correctness source gate | PASS | PASS | No regression reported by the repository gate. |
| Navigation/perceived-performance source gate | PASS | PASS | No regression reported by the repository gate. |

## Targets that remain proposed and unmeasured

Login-to-PIN, PIN-to-POS, cached route content, warm route switch, IDB query p95, 10k customer/catalog search p95, main-thread long tasks, request count/bytes, CPU, memory and per-namespace storage were not measured in authenticated runtime. Sensitive bootstrap and route reads are disabled by authority classification B, so manufacturing those measurements would be misleading.

## Structural performance controls

- Snapshot staging and reading are capped at 200 records per page.
- Compound IndexedDB indexes avoid full-store reads for namespace/snapshot pages.
- No full dataset is loaded into React.
- No polling or route-specific bootstrap effects were added.
- Sensitive bootstrap concurrency is effectively 0 while disabled; the future maximum remains 4.
- No parallel permanent memory cache was added.
- Media caching is disabled.

No measured p95 regression above 20% exists because no authenticated p95 was claimed. Production-scale performance remains **UNPROVEN**.
