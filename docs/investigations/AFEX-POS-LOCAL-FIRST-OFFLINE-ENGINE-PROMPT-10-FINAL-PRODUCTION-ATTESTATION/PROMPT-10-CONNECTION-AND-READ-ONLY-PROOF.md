# Prompt 10 connection and read-only proof

## Intended Production identity

- Supabase project reference: `fsxmnwucgotwhtlxuknt`
- Project name: `AFEX`
- Region: `ap-south-1`
- Management-plane status: `ACTIVE_HEALTHY`
- PostgreSQL engine: 17; SQL server proof: PostgreSQL 17.6, server version number `170006`
- Database: `postgres`
- Session/current role: `postgres`
- Identity matches the approved historical Production attestation. No host, connection string, password, token, publishable key, or service-role key is recorded in this package.

## Read-only enforcement

Every SQL call `P10-Q001` through `P10-Q011` used a separate:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '8000ms';
SET LOCAL lock_timeout = '1000ms';
SET LOCAL idle_in_transaction_session_timeout = '12000ms';
-- one allowlisted SELECT
ROLLBACK;
```

`P10-Q001` proved `transaction_read_only=true` inside the executed transaction. The server default is `default_transaction_read_only=false`, so the configured role itself is not treated as a safety boundary. The role is not superuser, but it has CREATEROLE, CREATEDB, REPLICATION and BYPASSRLS plus broad inherited memberships. Safety was provided only by the explicit read-only transaction, bounded timeouts, the frozen query allowlist, and rollback.

No application function was invoked. The only non-catalog relations read were `public.branches`, `public.tenants`, and `public.invoices`, and only aggregate counts/classification vocabulary were returned. No raw business row, PII, UUID sample, payment reference, ciphertext, or PIN material was returned.

The single corrective request `P10-Q007R` used the same exact transaction envelope with one SELECT and `ROLLBACK`. It proved `transactionReadOnly=true`, read only `pg_proc`, `pg_namespace`, and `pg_roles`, returned one evidence row containing 36 function identities, and invoked no application function.

## Extensions

Management-plane extension metadata, rather than an out-of-allowlist SQL read of `pg_extension`, proved the installed relevant extensions: `plpgsql 1.0`, `pgcrypto 1.3`, `uuid-ossp 1.1`, `supabase_vault 0.3.1`, and `pg_stat_statements 1.11`. No extension was invoked, installed, upgraded, or configured.

## Safety accounting

- SQL statements executed across the original attestation and correction: 12 read-only transactions, each rolled back. Requests executed after the P10-Q007 correction authorization: exactly 1 (`P10-Q007R`).
- SQL/DB writes: 0.
- Production mutations: 0.
- Locks requested by the investigation: no row, advisory, or explicit lock.
- Application/Core functions executed: 0.
- External effects: 0.

## Allowlist discrepancy

The post-execution audit found that historical `P10-Q007` joined `pg_catalog.pg_language`, which is outside the explicit relation allowlist. That event remains classified as an allowlist failure. The separately authorized `P10-Q007R` removed that join, returned `language_oid` directly from `pg_proc`, matched all 36 prior function identities and security properties, and completed with `ROLLBACK`. No other Production request followed it; the limited authorization expired immediately.
