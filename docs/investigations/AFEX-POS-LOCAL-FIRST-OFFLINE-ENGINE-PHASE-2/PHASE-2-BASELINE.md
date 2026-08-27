# Phase 2 Baseline

Date: 2026-08-25
Repository HEAD: `37331390ec00bee507f88701365bfebb944db675`
Branch: `codex/pos-responsive-redesign`
Upstream at starting gate: `0/0`

## Approved dirty-tree boundary

- 10 tracked Phase 1 application changes, 0 staged changes.
- 4 Phase 1 application paths and 46 approved investigation/evidence files were untracked.
- 1,062 user-owned `runtime-integration/R8N-*` files were classified and excluded.
- Unexpected tracked or untracked paths: 0.
- Phase 1 manifest identity: `34599e8acc1c1776ddd662af24594e26b98d6cef35c17aee56b16c26c81cea4` — PASS, 13/13 covered.
- Package/lockfile, SQL/migrations, Core V2 and R8N tracked changes: 0.

## Pre-change shell and storage observations

- IndexedDB was database version 1 with the five Phase 1 stores.
- `public/sw.js` activated immediately, deleted every Cache Storage entry and had no fetch strategy.
- No production Service Worker registration existed.
- development cache reset unregistered every Service Worker and deleted every cache.
- manifest start URL and scope were `/pos`.
- Capacitor uses a remote URL; cold-offline WebView behavior was not proved.
- `persistentUnwrapAuthority=false`, so no safe persistent business dataset bootstrap existed.

## Pre-change identities

| File | SHA-256 | Bytes |
| --- | --- | ---: |
| `lib/offline/phase1.ts` | `55867e81c718176b017ef78ddcb1f6eeb18fc16467161f5b0a708a6d4599e8f5` | 59,630 |
| `public/sw.js` | `ca1f594fddcd4e19a2c8619913a4b9ad69b1de67a02de850e39938b7c733725a` | 466 |
| `components/dev-cache-reset.tsx` | `05a5ae24ded86ad2ebf8ebdaf98a9a8fdb30ccad4286a924b1f86b975a2c9508` | 910 |
| `components/pos-shell-layout.tsx` | `40e9e03266432cf5dd712c440e175083513653422be9129442acc0e835be28fa` | 9,610 |
| `tests/pos-offline-phase1.test.mjs` | `69df779c21bc798709c8f988cecf744cd1b39003b051a9d1dbcbc643d9cb5a83` | approved Phase 1 |

## Baseline gates

- POS performance source gate: PASS.
- Navigation performance source gate: PASS.
- Phase 1 focused runtime: 10/10 PASS, 1,859 ms baseline sample.
- Authenticated route timings, request bytes, CPU, memory and database payloads: UNPROVEN because no authenticated non-Production runtime was used.

No token, customer data, phone, invoice, payload, key or secret was captured.
