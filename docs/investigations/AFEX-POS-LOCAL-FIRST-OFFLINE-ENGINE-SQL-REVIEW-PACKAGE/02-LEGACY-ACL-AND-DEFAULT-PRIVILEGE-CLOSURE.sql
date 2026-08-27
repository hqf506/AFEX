/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: 1
purpose: Close frozen broad legacy ACL/default-privilege reachability and re-grant only approved exact reads and routine signatures.
execution status: NOT AUTHORIZED
prerequisites: Prompt 9 compatibility gate PASS; exact fresh preflight MATCH; independent human SQL approval; qualified trusted routes deployed.
expected owner/operator: postgres/supabase_admin default-privilege owners and a reviewed migration operator.
transaction behavior: One transaction after the compatibility gate is externally proven.
lock risk: Short relation/function ACL catalog locks; application authorization can change immediately at COMMIT.
retry behavior: Never retry after a missing caller, signature, ACL, or response-shape result.
rollback reference: SQL-REVIEW-ROLLBACK-CONTRACT.md; rollback disables callers and uses qualified trusted routes, never broad grants.
required evidence before execution: All ten SQL-REVIEW-COMPATIBILITY-GATE.json checks PASS and fresh exact ACL/signature inventory.
*/

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / Prompt 9 caller compatibility
-- This file is reviewable but not executable. The current package intentionally
-- contains no DCL statements because Prompt 9 has not proved every affected
-- browser/server caller, the exact trusted profile gateway, and response parity.
-- Exact frozen revocation inventory follows for independent review.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / exact legacy relation set
-- Relations whose PUBLIC/anon/authenticated/service_role broad ACL must be closed:
-- public.profiles, public.pos_profiles, public.tenants, public.branches,
-- public.customers, public.catalog_items, public.branch_catalog_items,
-- public.orders, public.invoices, public.invoice_items,
-- public.order_status_logs, public.order_number_sequences, public.vat_settings,
-- public.audit_logs, public.branch_whatsapp_configs, public.inventory_stock,
-- public.inventory_movements, public.inventory_movements_view.
-- Exact retained authenticated relation grants after compatibility:
-- SELECT on public.catalog_items, public.branch_catalog_items, public.vat_settings.
-- Exact denied browser surfaces include public.profiles,
-- public.inventory_movements and public.inventory_movements_view.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / exact sequence set
-- Revoke SELECT, UPDATE and USAGE from PUBLIC, anon, authenticated and
-- service_role on public.invoice_number_seq and public.order_number_seq.
-- Allocation remains function-only through Core numbering authority.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / exact retained routine execution
-- The only authenticated routine retained is:
-- public.lookup_customer_phone_identity_v1(uuid,text,uuid)
-- Trusted server-only routine signatures include:
-- public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)
-- public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)
-- public.claim_atomic_order_command_v1(uuid)
-- public.execute_atomic_order_command_v1(uuid,uuid)
-- public.replay_atomic_order_command_v1(uuid)
-- public.inspect_atomic_order_reconciliation_v1(uuid)
-- public.issue_pos_actor_session_v1(text,uuid,uuid,text,uuid)
-- public.validate_pos_actor_session_v1(text,uuid,uuid)
-- public.revoke_pos_actor_session_v1(text,uuid,uuid,text)
-- public.revoke_pos_actor_sessions_for_actor_v1(uuid,uuid,uuid,text)
-- public.pos_actor_session_state_v1(uuid,uuid)
-- Bounded role-only routines remain:
-- public.place_atomic_order_manual_hold_v1(uuid,bytea)
-- public.authorize_atomic_order_retry_v1(uuid,uuid,bytea)
-- public.resolve_atomic_order_reconciliation_hold_v1(uuid,uuid,bytea,boolean)
-- public.mark_atomic_order_reconciliation_required_v1(uuid,uuid,bytea)
-- public.cleanup_pos_actor_sessions_v1(integer)

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / exact legacy routine closure
-- PUBLIC/anon/authenticated/direct service_role execution must be removed from:
-- public.verify_pos_pin_for_actor(text,uuid,uuid)
-- public.set_pos_pin(text,uuid)
-- public.hash_pos_pin(text)
-- public.create_invoice_with_items_safe(text,text,text,text,numeric,numeric,text,jsonb,text,uuid,uuid,uuid)
-- public.create_invoice_with_items(text,text,text,text,numeric,numeric,text,json)
-- public.create_invoice_with_items(text,text,text,text,numeric,numeric,text,jsonb)
-- public.create_invoice_with_items(jsonb,jsonb)
-- public.adjust_inventory_stock(uuid,uuid,uuid,numeric,text,text,uuid)
-- public.restore_inventory_for_cancelled_invoice(uuid,uuid)
-- public.next_branch_monthly_order_number(uuid,uuid,timestamp with time zone)
-- Function retirement remains blocked until dependency closure is freshly proved.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / default privileges
-- Future reviewed DCL must revoke automatic relation, sequence and function
-- privileges for PUBLIC, anon, authenticated and service_role under the exact
-- public-schema creator identities postgres and supabase_admin. Execution is
-- blocked until Prompt 9 and a fresh pg_default_acl identity capture pass.
