# Prompt 10 baseline

## Repository gate

- Repository: `C:/Users/NSC-LUA/Desktop/leather-fix-erp-pos-responsive`
- Branch: `codex/pos-responsive-redesign`
- HEAD: `37331390ec00bee507f88701365bfebb944db675`
- Upstream ahead/behind: `0/0`
- Staged paths: `0`
- Inherited tracked application diff identity: `f2cc98137dc505b495da608ec5ba38d3c0293670` (approved inherited identity)
- Tracked changes: 12 inherited Phase 1–3 paths; no unexpected tracked path was found.
- R8N entries: counted from `git status` only (`29`); no R8N path was opened, inspected, hashed, copied, renamed, or modified.

## Inherited package identities

- Prompt 8 manifest SHA-256: `ea950deece0dfc98632a34113e6b2b4915eb5065bbf1920b8a3f8fa9bdc70724` — MATCH.
- Prompt 9 manifest SHA-256: `2a3a6517581c6ce0c1c735f2ecc9ca7789aaf5d5e195fc3a6d5d072c332b62e6` — MATCH.
- All pre-existing Local-First investigation manifest files were inventoried before Prompt 10; identities are preserved in the final package.

## Production identity gate

- Non-secret project identity: Supabase project reference `fsxmnwucgotwhtlxuknt`, name `AFEX`, region `ap-south-1`, status `ACTIVE_HEALTHY`.
- Project identity matches the approved historical Production attestation and is unique among the accessible projects.
- Database engine classification reported by the management plane: PostgreSQL 17.
- Credential values, connection strings, tokens, passwords, publishable keys, and service-role keys were not requested, read, copied, or recorded.
- Access path: Supabase management-plane catalog query execution using the already configured authorized connection.

## Safety state

- SQL/DB writes: `0`
- Production mutations: `0`
- Application/Core/package changes: `0`
- Git writes: `0`
- External business effects: `0`
- Phase 5 started: `NO`

## Final validation gate before manifest creation

- Required pre-manifest artifacts: `22/22` present.
- JSON artifacts: `7/7` parsed successfully.
- Historical Local-First manifests: `11/11` verified with `0` hash/byte/line mismatch across all `194` referenced files.
- Prompt 8 files modified: `0`.
- Prompt 9 files modified: `0`.
- Secret-pattern findings: `0`.
- PII-pattern findings: `0`.
- `git diff --check`: PASS.
- Branch/HEAD after evidence construction: unchanged.
- Staged paths after evidence construction: `0`.
- Application/Core/package/R8N files modified by Prompt 10: `0`.

## Fail-closed acceptance blocker

- Historical event `P10-Q007` directly joined `pg_catalog.pg_language` to label routine languages. It remains recorded as an allowlist failure and is not retroactively reclassified.
- The human-authorized replacement `P10-Q007R` was the only new Production request. It read only `pg_proc`, `pg_namespace`, and `pg_roles`, returned `language_oid` from `pg_proc`, and completed inside an explicit `READ ONLY` transaction ending in `ROLLBACK`.
- `P10-Q007R` returned 36 functions with `transactionReadOnly=true`. All 36 identities matched by `schema_name + proname + identity_arguments`; owner, ACL, SECURITY DEFINER, configuration, volatility, parallel-safety, body MD5, and body length had zero differences from the historical result.
- The only evidence-shape difference is the removal of unallowlisted language names and their replacement with catalog `language_oid` values. The narrow allowlist blocker is therefore corrected without changing any substantive authority conclusion.
