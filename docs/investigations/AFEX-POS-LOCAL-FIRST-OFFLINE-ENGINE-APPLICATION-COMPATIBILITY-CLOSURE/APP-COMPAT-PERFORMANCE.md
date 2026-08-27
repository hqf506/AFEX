# Performance result

- The provider's functional test issued one fetch for two concurrent consumers in the same authority scope (`1` request, not `2`). Distinct account, tenant, branch, POS employee, or POS generation scopes never reuse that response.
- There is no request on render and no interval. Fetching occurs only after authenticated authority-scope hydration when its flag is enabled.
- Inventory v2 retains a maximum of three bounded queries: one page query and two parallel enrichment queries. It removes the legacy exact-count requirement on its cursor path and introduces no N+1 loop.
- Current inventory UI cancels the prior request before starting the next and ignores stale completions.
- Local inventory projection uses one pass for filtering/deduplication and one pass over relevant unique commitments: O(n) time and O(n) bounded metadata space.

Synthetic local projection measurements from the final focused run:

| Input commitments | Duration (ms) |
| ---: | ---: |
| 10 | 0.0710 |
| 100 | 0.0343 |
| 1,000 | 0.1859 |
| 10,000 | 1.9188 |

These are local synthetic measurements only. No Production p95, server latency, network condition, or real-device claim is made.
