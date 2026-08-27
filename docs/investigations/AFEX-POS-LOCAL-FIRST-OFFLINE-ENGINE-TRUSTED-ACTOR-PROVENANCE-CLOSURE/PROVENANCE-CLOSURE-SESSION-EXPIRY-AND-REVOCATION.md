# Session Expiry and Revocation Contract

| Case | Decision | Reason |
|---|---|---|
| Original Online Auth session expires during outage without explicit logout | Retained Offline bootstrap remains locally eligible | The verified account-bound bootstrap, device, enrollment, key namespace and command binding are durable; age alone never expires them. |
| Application restarts without explicit logout | Require employee PIN again, not Internet | The retained account/device bootstrap reopens; the PIN only reselects a roster employee and cannot change scope. |
| Explicit establishment logout | Disable PIN, Offline order creation and switching | Pending commands remain encrypted and inaccessible; PIN alone cannot restore the account bootstrap. |
| Same establishment account authenticates Online after logout | Allow bounded recovery after fresh server/database validation | The stable bootstrap ID is reactivated at a higher generation; retained origin is not reassigned. |
| Different account, tenant or branch requests recovery | Reject | Cross-scope recovery is forbidden and pending commands remain inaccessible. |
| Current uploader has no valid verified Auth session | Reject before resolver/acquisition/frontier/receipt | A currently unauthenticated caller cannot sync. |
| Current uploader Auth session ID does not resolve to its subject | Reject | Caller-supplied equality is not authority. |
| Current POS actor session is absent, expired or revoked | Reject | The server and database must both bind the current uploader to an active POS session. |
| Current uploader session changes | Allow only after fresh verification | The replacement session must resolve to the same origin account, tenant, branch and actual employee through a valid POS actor session and active same-account bootstrap; origin is never rewritten. |
| Origin device is revoked, lost, purged or replaced | Reject | Device status and exact generation are checked on every database contract. |
| Employee enrollment is revoked, removed or replaced | Reject | Exact enrollment and command generations plus command allowlist are checked. |
| Key envelope is revoked, purged, replaced or generation-mismatched | Reject | Exact key ID/version and all correspondence fields are checked. |
| Bootstrap/account is revoked during synchronization | Reject future Offline authority | Active bootstrap status is mandatory; device and employee revocation remain additional independent gates. |
| Stable receipt after origin revocation | Do not return receipt | Fresh authority validation precedes every receipt response. |
| Stable receipt after valid uploader replacement | Return only with exact retained origin and immutable hashes | The current uploader and historical origin are distinct evidence. |
| Last synchronization age grows | Do not expire solely by age | `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY` remains unchanged. |

The database stores the current uploader session references in the immutable companion for audit, but does not add them to the durable Offline origin. The old web session can therefore expire without destroying a valid retained sale, while the later uploader is still required to prove fresh authority.
