# Performance evidence

Synthetic Node.js workstation measurements from the focused test run:

| Commands | Duration (ms) | Authority resolver batch calls |
|---:|---:|---:|
| 10 | 3.4511 | 1 |
| 100 | 6.6778 | 1 |
| 1,000 | 61.8351 | 1 |

These are deterministic synthetic qualification measurements from a passing 30-test run, not Production p95 values. The batch is capped at 1,000 commands, dependencies at 64 per command, command payloads at 64 KiB (generic canonicalization remains capped at 256 KiB), order/frontier items at 200, depth at 32 and nodes at 10,000.

Payload canonical serialization occurs once per parsed candidate. Authority resolution is one batch call, not N+1. There is no polling, timer, UI payload scan or network request.
