# Service Worker, PWA and Capacitor Assessment

## Current state

### Web manifest

`app/manifest.ts` declares a standalone AFEX POS application with `/pos` scope/start URL and portrait orientation. This provides install metadata only; it does not create an offline application.

### Service worker

`public/sw.js`:

- calls `skipWaiting()` during install;
- deletes every Cache Storage entry during activation;
- claims clients;
- has an intentionally no-op fetch handler.

No tracked production registration path was found. `components/dev-cache-reset.tsx` unregisters workers and deletes caches for development recovery. Consequently:

- no application shell is precached;
- no offline navigation fallback exists;
- no API or media caching policy exists;
- no background sync owns the current draft queue.

### Capacitor

`capacitor.config.ts` points iOS/Android shells at a remote application URL. The repository has native wrappers, but no inspected offline database, network, filesystem or secure-key plugin contract. A network outage therefore still depends on whatever the WebView previously loaded.

## Recommended roles

### Page/client runtime

- renders decrypted data only after POS unlock;
- writes drafts/commands transactionally to IndexedDB;
- displays connectivity and command counts;
- may request sync but cannot assume it owns the lease.

### Dedicated/shared worker

- recommended location for cryptographic operations and IndexedDB access isolation within the origin;
- arbitrates local transactions and schema versions;
- terminates on lock/logout;
- is not a hardware security boundary.

### Service worker

- precaches a versioned minimal application shell;
- serves an explicit offline navigation fallback;
- caches only approved immutable/static assets and catalog media;
- wakes opportunistically to request outbox synchronization;
- uses the same IndexedDB claim protocol as pages;
- never stores plaintext PII/commands in Cache Storage;
- never marks a command synced based on fetch completion without validated response.

## Fetch policy

| Request class | Strategy | Offline response |
|---|---|---|
| hashed JS/CSS/fonts/icons | precache/cache-first by build version | serve exact cached build |
| POS navigation shell | network-first with version-compatible offline shell | render lock/offline state |
| catalog images | stale-while-revalidate with validated size/type/version | cached image or placeholder |
| authenticated API JSON | application dataset layer, not generic SW cache | encrypted IndexedDB snapshot after unlock |
| mutation APIs | network only through sync engine | enqueue typed command only when approved |
| PDF/WhatsApp/provider | network/server only | unavailable or explicit confirmed-snapshot print policy |

## Upgrade safety

A new service worker must not immediately take control if it cannot read the existing local schema or if the application rollback cannot preserve pending commands. Deployment sequence:

1. install new worker without destructive cache deletion;
2. validate application/local-schema compatibility;
3. migrate non-evictable stores with restart checkpoints;
4. activate and broadcast build/schema version;
5. reload only at a safe UI boundary; never during a local command transaction;
6. retain the prior shell until rollback window closes.

## Background synchronization limits

- Browser Background Sync is an optimization, not a guarantee.
- iOS/WebKit may suspend the PWA and omit background sync.
- Automatic sync must also run at authenticated POS startup, foreground/resume, online events and explicit user action.
- Native apps may later use OS background tasks, but the same server idempotency and local lease rules remain mandatory.

## Connectivity model

`navigator.onLine` is advisory only. Define:

- `offline`: no successful authenticated health/command request;
- `degraded`: transport works but auth/dataset/command service is unavailable;
- `online`: authenticated sync preflight succeeded;
- `syncing`: lease held with one or more commands dispatched;
- `blocked`: authority/schema/time/quota prerequisite failed.

The UI must show last confirmed server time/data version and command counts. It must not display “synced” from a browser network flag.

## PWA acceptance gates

- cold offline start renders a version-compatible lock shell;
- primary-only state cannot decrypt data;
- actor-unlocked offline routes load within budget from IndexedDB;
- no authenticated API response is discoverable in Cache Storage;
- service-worker update during pending commands preserves them;
- page and service worker cannot both dispatch one command;
- 14 mobile, tablet portrait/landscape, installed PWA, iOS Safari, Android Chrome/WebView and Capacitor tests;
- cache size/quota and media fallback tests;
- no broken asset, navigation loop, stale cross-tenant shell state or duplicate external effect.

## Implementation choice

Do not add Workbox as part of the investigation. During implementation, choose either a small explicit worker or Workbox after proving compatibility with Next.js 16 build output and the repository's local Next documentation. The worker remains subordinate to the application data/authority design.

