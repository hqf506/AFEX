/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: 2
purpose: Replace overlapping permissive browser policies with one scoped read policy per approved direct operation and no browser writes.
execution status: NOT AUTHORIZED
prerequisites: Wave 1 proof; Prompt 9 compatibility; fresh exact policy identity and helper-body evidence.
expected owner/operator: Owners of each exact relation under independently reviewed migration authority.
transaction behavior: Intended as one bounded policy-catalog transaction after all blocked identities are resolved.
lock risk: ShareRowExclusiveLock-equivalent policy catalog changes; authorization changes at COMMIT.
retry behavior: Stop on any missing/unexpected policy or helper identity.
rollback reference: SQL-REVIEW-ROLLBACK-CONTRACT.md; disable direct reads and use qualified routes, never restore broad role-only policies.
required evidence before execution: Exact pg_policy inventory, exact current_profile_tenant_id body hash, active-branch helper identity, and VAT-current semantics.
*/

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / known unsafe policy inventory
-- Frozen evidence proves the following policy names and broad/scoped OR bypass:
-- customers: "authenticated can view customers", "authenticated can insert customers",
-- "authenticated can update customers", customers_select_same_tenant,
-- customers_insert_same_tenant, customers_update_same_tenant.
-- orders: "authenticated can view orders", "authenticated can insert orders",
-- "authenticated can update orders", orders_select_same_tenant,
-- orders_insert_same_tenant, orders_update_same_tenant.
-- invoices: corresponding view/insert/update broad names and
-- invoices_select_same_tenant, invoices_insert_same_tenant, invoices_update_same_tenant.
-- invoice_items: corresponding view/insert/update broad names and
-- invoice_items_select_same_tenant, invoice_items_insert_same_tenant,
-- invoice_items_update_same_tenant.
-- order_status_logs: "authenticated can view status logs" and
-- "authenticated can insert status logs".

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / sensitive-table policy closure
-- Frozen profile policy names are profiles_select_admin_override,
-- profiles_select_own, profiles_select_same_tenant, profiles_select_self,
-- profiles_update_own and profiles_update_self.
-- Frozen POS profile policy names are pos_profiles_select_same_tenant_system_user,
-- pos_session_owner_pos_profiles_read, pos_session_owner_pos_profiles_row_lock
-- and pos_session_owner_pos_profiles_write_guard.
-- A fresh policy capture is required because the evidence does not enumerate
-- every current policy on every affected table. Unsafe executable DROP POLICY
-- statements are therefore intentionally excluded.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / retained direct read policies
-- Approved end state is one authenticated SELECT policy for each of:
-- public.catalog_items: current database tenant and is_active=true.
-- public.branch_catalog_items: current database tenant and an active authorized branch.
-- public.vat_settings: current database tenant and the authoritative current setting.
-- The exact active-branch helper does not exist in frozen evidence. The current
-- Production relation exposes is_active, while the approved target text uses
-- current-setting semantics. The helper body and VAT-current rule must be
-- frozen before any executable CREATE POLICY statement is safe.

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / defense-in-depth RLS owner behavior
-- FORCE RLS cannot be selected safely for legacy business relations until the
-- exact owner-function policies and owner transition order are re-attested.
-- RLS is row authorization only and is never used as column secrecy here.
