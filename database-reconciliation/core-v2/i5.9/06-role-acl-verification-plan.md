# Package 6R Role and ACL Verification Plan

Status: NOT EXECUTED. Isolated Clone/Staging before external review.

Verify exact NOLOGIN/NOINHERIT/NOBYPASSRLS role attributes, every membership
into dedicated roles, function owners, SECURITY DEFINER/search_path,
schema/table/default ACLs, RLS/FORCE RLS, every policy expression and the full
effective EXECUTE matrix.

Verify all 15 Package 6 functions, 16 Package 6 policies plus the retained
Package 5R-B quote-read policy, 7 control tables and 7 triggers.
Check PUBLIC, anon, authenticated, service_role, runtime, activation owner,
activation operator, context issuer, outbox worker and core owner explicitly.

Atomic entry, quote issuer, shared/wrapper validators, readiness functions and
activation functions remain closed. Worker and issuer retain only reviewed
capabilities. Any unexpected owner, grant, policy, membership, overload,
trigger, schema privilege, default ACL or table privilege is a STOP.
