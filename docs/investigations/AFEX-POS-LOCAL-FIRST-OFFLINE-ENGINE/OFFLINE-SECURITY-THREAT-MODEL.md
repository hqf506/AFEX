# Offline Security Threat Model

## Assets

- customer PII and activity;
- order/invoice/payment snapshots;
- sale drafts and notes;
- catalog prices, branch overrides and inventory estimates;
- effective employee identity and command provenance;
- command payloads, receipts, conflicts and audit evidence;
- cache encryption keys and actor-unlock artifacts.

## Trust boundaries

1. verified Supabase primary session;
2. server-validated POS actor session/PIN authority;
3. browser page and web worker origin;
4. local persistent storage;
5. service worker lifecycle;
6. native WebView and OS secure storage;
7. server APIs/Core V2/database;
8. external providers such as WhatsApp/printing/payment.

## Threat register

| Threat | Existing exposure | Required control | Residual limitation |
|---|---|---|---|
| prior tenant data visible after login | unscoped plaintext localStorage drafts | opaque namespace, POS unlock, wrapped DEK, exact tenant/branch checks | compromised same-origin runtime can attack unlocked data |
| primary auth reads POS cache before PIN | no durable cache boundary exists | sealed pre-PIN ingestion; actor-bound unwrap | pure PWA provides app-layer, not hardware-grade isolation |
| stolen disk/browser profile | plaintext PII/financial drafts | AES-GCM per namespace; wrapped key; no plaintext logs | unlocked live session remains exposed |
| XSS | can access all web storage and invoke fetch | strict CSP, no unsafe script, Trusted Types evaluation, minimal DOM data, short unlock, code review | XSS during unlock can read data; encryption is not a cure |
| malicious extension/device administrator | can inspect runtime | native secure hardware and managed-device controls for stronger assurance | cannot be fully mitigated by web code |
| service worker cache leak | current worker deletes caches; future broad rules risky | never cache authenticated JSON generically; namespace/version media only | browser cache implementation risk |
| cross-tab duplicate sync | current module boolean per tab | IndexedDB compare-and-set lease, BroadcastChannel, server claim/idempotency | crashed lease waits for expiry |
| payload tampering under same key | localStorage payload mutable | immutable encrypted payload hash; server fingerprint conflict | local corruption may block work and require recovery |
| employee spoofing | client carries employee ID; server currently revalidates actor | signed actor lease; server effective actor authoritative; log both subjects | offline revocation cannot be known instantly |
| branch/tenant spoofing | browser payload can contain IDs in some routes but server filters | ignore client scope as authority; signed namespace manifest; RLS/explicit filters | service-role route bug remains server risk |
| replay duplicates order/inventory | legacy key and Core V2 partially protect | stable typed command ID, Core claim/replay, durable receipt | commands lacking server ledger remain blocked |
| duplicate WhatsApp/provider effect | post-commit direct delivery ambiguity | server transactional event outbox and provider idempotency/reconciliation | provider may not support exact idempotency |
| stale price/tax/discount | draft stores snapshot | versioned quote and server conflict; explicit re-confirmation | sale cannot be guaranteed at offline price without policy |
| oversell inventory | cached inventory is stale | server atomic validation; optional bounded reservation authority | true disconnected reservation needs additional business model |
| local official numbering collision | DB sequence unavailable offline | local reference only; official number server-side | customer cannot receive official tax invoice until sync |
| storage quota eviction | browser may evict origin | persistent storage request, monitor quota, non-evictable outbox policy, native option | browser may still clear site data |
| local DB corruption/migration failure | no current schema system | checksums, restartable migrations, quarantine, encrypted support export | device loss before sync can lose commands without native backup |
| logout purge overreach | no scoped purge today | exact namespace tombstone/purge/verification after logout | browser “clear site data” remains global user action |
| logs leak PII/secrets | current console warnings may include Error objects | stable safe classifications/correlation IDs; redaction; no payload/phone | third-party browser tooling outside app control |

## Security invariants

- No service-role, provider credential, PIN, Supabase refresh token copy or raw actor token is stored in the offline database.
- PIN is never retained, hashed locally for future verification, or used directly as an encryption key.
- Encryption keys are versioned and scoped; changing tenant/branch/device never reuses a DEK.
- Local cached authority cannot grant more than the last signed server authority and expires absolutely.
- Commands are immutable after enqueue. Correction creates a new linked command.
- Server validates every command as if the local cache were hostile.
- RLS and explicit tenant/branch filters remain mandatory on online reads/writes.
- Failed decryption, signature, schema or namespace validation locks the cache; it never falls back to plaintext.

## PIN and brute force

Existing online PIN verification has server rate limiting and authoritative employee checks. Offline PIN verification would create a brute-force oracle and cannot safely reproduce current server authority. The recommended model is an online-issued actor-unlock lease activated during an already authenticated employee session, not an offline copy of PIN verifier material. If the device starts fully offline with no valid lease, POS data remains locked.

## Revocation and bounded exposure

No disconnected client can observe immediate server revocation. The product must approve:

- maximum offline actor lease duration;
- maximum offline order value/count;
- allowed payment methods offline;
- datasets readable after lease expiry;
- behavior after device clock rollback;
- managed-device loss/revocation response.

Use server time anchors plus monotonic elapsed time where available. Wall-clock rollback or uncertain time blocks new financial commands.

## Required security testing

- tenant/branch/account namespace confusion and cache swapping;
- actor cookie invalid/revoked/expired and local lease signature tamper;
- PIN material/credentials/PII secret scans;
- XSS/CSP and service-worker message-origin review;
- encrypted record copy between stores/namespaces;
- device time rollback/advance and lease expiry;
- multi-tab and killed-worker command claims;
- logout retain/purge zero-residue matrix;
- site-data eviction and partial local migration;
- server service-role route review for explicit scope filters;
- provider duplicate and reconciliation simulation.

## Risk acceptance required

Human security/product owners must choose between:

1. PWA application-layer cache lock with documented compromised-device limitation; or
2. native secure-store/device registration for stronger persistent separation.

The implementation must not describe option 1 as equivalent to hardware-backed protection.

