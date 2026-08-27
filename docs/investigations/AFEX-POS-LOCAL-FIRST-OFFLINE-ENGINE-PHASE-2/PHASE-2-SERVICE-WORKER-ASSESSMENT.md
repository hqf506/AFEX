# Phase 2 Service Worker Assessment

## Before

`public/sw.js` called `skipWaiting()` during install, deleted every cache during activation and had no fetch handler. No production registration path existed. The development reset removed all registrations and all cache namespaces. This could destroy caches owned by unrelated applications or incompatible rollback paths.

## Implemented safe shell

- Owner prefix: `afex-pos-shell-`.
- Current cache: `afex-pos-shell-v1`.
- Compatible retained cache: `afex-pos-shell-v0`.
- Install asset: `/pos/offline-shell.html` only.
- Static runtime cache eligibility: same-origin `/_next/static/` GET only.
- Navigation fallback: same-origin `/pos*` GET only.
- `/api/*`: never intercepted or cached.
- Cross-origin requests: never intercepted.
- Non-GET requests: never intercepted.
- Install does not call `skipWaiting()`.
- Activation requires `AFEX_ACTIVATE_SHELL_V1` after the IndexedDB initialization/migration gate succeeds.
- Activation removes only obsolete AFEX shell caches and claims clients.
- Shell registration flag defaults false.
- Registration failure leaves the online POS available.
- When the flag is false, the client unregisters only same-origin `/sw.js` at exact scope `/pos/` and deletes only `afex-pos-shell-` caches.
- The worker accepts `AFEX_DISABLE_SHELL_V1`, disables its fetch handler before cleanup and acknowledges neutralization.
- Cleanup is complete only after zero owned registration/cache residue and controller acknowledgement; partial failures are classified and retried without blocking online POS.

## Functional evidence

A real Chromium Service Worker test seeded a compatible AFEX cache, an obsolete AFEX cache and an unrelated cache. After registration and activation:

- current and compatible AFEX caches remained;
- obsolete AFEX cache was removed;
- unrelated cache remained;
- a same-origin static asset was cached;
- authenticated API JSON was absent from every cache;
- a real server disconnect caused `/pos/network-unavailable` to render the cached Arabic lock shell with HTTP 200.

A second real Chromium test exercised the false-flag kill switch after activation and cache population. It proved the AFEX worker and caches were removed, no AFEX cache was recreated, a fresh POS page was uncontrolled, and an unrelated worker/cache remained intact.

## Development reset

Development cleanup now unregisters only `/sw.js` and deletes only caches beginning `afex-pos-`. It remains development-only.

## Capacitor

The Capacitor configuration points at a remote URL. Native remote-WebView cold-offline startup, native storage persistence and WebView Service Worker behavior were not executed and are **UNPROVEN**. This phase makes no native offline claim.
