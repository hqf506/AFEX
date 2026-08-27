# Phase 0 Performance Budget

Every value in this document is **PROPOSED** until Phase 1 records pre-change runtime baselines on representative devices. Budgets are acceptance targets, not claims about current performance.

## User-visible budgets

| Metric | PROPOSED target | Measurement |
|---|---:|---|
| Primary login success to interactive PIN screen | p95 <= 1.5 s warm, <= 2.5 s cold | authenticated navigation markers; excludes user credential entry |
| Valid PIN response to usable warm POS home | p95 <= 1.0 s | actor confirmation to first interactive cached home |
| Cached route first meaningful content | p95 <= 800 ms | route request to stable primary content |
| Offline route switch after shell warm | p95 <= 300 ms | click to route content |
| Unlock failure/expired lease feedback | p95 <= 500 ms after local validation | interaction to safe locked state |
| Command enqueue local acknowledgement | p95 <= 150 ms | click to durable IndexedDB transaction commit; not server success |

## Local database and main-thread budgets

| Metric | PROPOSED target |
|---|---:|
| IndexedDB single-record read p95 | <= 25 ms |
| IndexedDB indexed query/batch page p95 | <= 75 ms |
| Draft write transaction p95 | <= 50 ms |
| Command + event enqueue transaction p95 | <= 100 ms |
| 1,000-record decode/filter worker operation p95 | <= 200 ms |
| Main-thread long task | <= 50 ms target; zero tasks >100 ms during normal navigation |
| UI frame during scroll/search | p95 <= 16.7 ms on reference tablet; no sustained jank |

Crypto, migration, indexing and large JSON work belongs in a worker/chunked path. The UI may show progress; it may not block with a false success state.

## Bootstrap/network budgets

- Maximum concurrent bootstrap API requests: **4**.
- Duplicate simultaneous requests for the same namespace/dataset/version: **0**.
- Atomic snapshot swap: only after expected page/count/hash closure; partial snapshots remain invisible.
- Proposed bounded bootstrap page: <= 1 MB compressed and <= 1,000 records, subject to real API/device measurement.
- Retry obeys server `Retry-After`; no tight polling.
- On metered/low-power conditions, defer nonessential media and full reconciliation while preserving command receipt lookup.

## Synthetic scale budgets

At 10,000 synthetic catalog/customer records:

- normalized customer name/phone search p95 <= 100 ms in worker/IndexedDB index;
- catalog category/text filter p95 <= 100 ms;
- first 50 rendered results p95 <= 150 ms after query;
- no full 10k DOM render;
- query cancellation/stale result overwrite findings: 0.

No real customer PII is used in performance tests.

## Memory and storage budgets

| Platform | PROPOSED active JS/DOM working-set guardrail |
|---|---:|
| mobile browser/PWA | <= 150 MB |
| tablet/iPad/WebView | <= 250 MB |
| desktop browser | <= 300 MB |

- Structured encrypted data target: <= 100 MB per namespace in initial rollout.
- Product media target: <= 500 MB or 2,000 images per approved device, whichever occurs first.
- Never load all image bytes or all customer/order records into memory.
- Quota warning/hard stop: 70%/90% as frozen in retention policy.

## Sync budgets

- Proposed batch: maximum **10 commands or 512 KB encrypted/canonical payload**, whichever occurs first.
- Per aggregate: FIFO; unrelated aggregates may run with maximum **2** in-flight server commands after server claim support.
- Initial retry delays: 5 s, 15 s, 45 s, 2 min, 5 min, then capped exponential backoff to 30 min with 20% jitter.
- Authentication, conflict, fingerprint, schema, quota and authority failures do not use blind automatic retry.
- Immediate receipt lookup on ambiguous timeout uses the same command ID and one bounded request; later retries follow backoff.
- Background battery policy: no continuous polling; sync on foreground/resume, authenticated online preflight, explicit user action and supported background opportunity.

## Reconciliation frequency

- Receipt lookup for non-terminal dispatched commands: on authenticated reconnect and foreground.
- Bounded command reconciliation: after any ambiguous timeout and at POS startup.
- Full bounded dataset reconciliation: on first online return after >=15 minutes disconnected, then no more than once per 24 hours unless server manifest changes or user explicitly refreshes.
- Current APIs do not prove deterministic delta authority for every dataset; complete bounded snapshots remain the safe fallback.

## Qualification matrix

Required before enabling each phase:

- Chromium mobile/desktop and WebKit/Safari;
- 14-phone viewport regression matrix already used by POS QA;
- tablet portrait/landscape: 768x1024 through 1366x1024;
- desktop 1366x768, 1440x1024 and representative larger display;
- iOS Safari installed PWA and normal tab;
- Android Chrome and installed PWA;
- Capacitor iOS/Android if the capability is exposed there;
- rotation portrait -> landscape -> portrait without reload;
- cold/warm start, offline start, reconnect, low storage, low memory, killed tab/worker and application upgrade.

## Phase 1 mandatory baseline

Before behavior changes, record on local/Preview non-production environments:

- current login-to-PIN and PIN-to-POS timings;
- catalog/customer/order payload counts and bytes;
- current route request concurrency/duplicates;
- main-thread long tasks and memory;
- current localStorage draft sizes;
- target-device storage estimates;
- iOS/Android eviction behavior.

Baseline artifacts must be redacted and remain outside tracked source unless separately authorized.

## Stop gates

- any data corruption/loss;
- pending-command eviction;
- cross-namespace result;
- p95 budget exceeded by >20% without approved exception;
- main-thread >100 ms recurring task;
- duplicate command dispatch/effect;
- device thermal/battery/network regression beyond approved baseline.

