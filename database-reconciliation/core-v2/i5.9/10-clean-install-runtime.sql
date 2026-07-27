/* AFEX Core V2 — Package 10: Deterministic Clean-Install Runtime Composition
BOUNDARY: runtime cluster only. Packages 1R, 2R, 2B, 2B-S and 3R are mandatory
separate prerequisites. No CREATE INDEX CONCURRENTLY is duplicated here.
Run manually in an isolated validated baseline database with no Core V2 runtime
objects. Execute one transaction at a time and STOP after every COMMIT.
Not silently rerunnable: collisions and partial state fail closed.
No credentials, fixtures, evidence, provider delivery, cutover, activation or
operational EXECUTE grants. Core V2 remains disabled and kill_switch=true.
Approved final function bodies are copied without semantic change. CREATE OR
REPLACE becomes CREATE for first installation. Runtime/issuer/worker/operator
grants are deferred. A privileged human operator is required; no LOGIN or role
membership is created. SQL was not executed during composition. */
/* SOURCE HASH ATTESTATION
2B-S|009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d
4T|40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7
5R-B|eb5ad92396a57022f35cd7a58f6c6f85e7ea735c3306f40040c084e82ecb13b7
6-Sync|06b7c27a249b07d0fc58c8e22dd046376a85fb7e507a050a9d33f10e1c8205e3
6A-B|30875dfdff59eda1aec4254d6ce1e610e09bfdf857506f682f9e8c8bae3f3a08
6B|46c0db2c04a2f48dd1519f72a8f627ca2ceae3ad0ad6af21a7897bc2bc3914ff
1R|8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a
2R-R|92855a4ebf87c9f0c32a18367555e3051d608820fa77ffa6d59b68abc47b0e92
2B-R|7b712bd7cb61603ef0afd5c96e4dcf533debb57adbaab577650f297a486b588b
3R|58156d78b3b6dfab381bdc42b4f9faf75ff096acce986e2bca4d7300faf52208
FOUNDATION|source hashes matched; amended 2R-R/2B-R EXTERNAL APPROVAL PENDING */
/* MACHINE-READABLE EXTRACTION MANIFEST
OBJECT|05-security.sql|249-250|afex_core_owner|ROLE|PHASE-B|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|253-254|afex_context_issuer|ROLE|PHASE-B|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|257-258|afex_outbox_worker|ROLE|PHASE-B|ORDER-ONLY|semantic_change=false
OBJECT|06-activation.sql|224-226|afex_core_runtime|ROLE|PHASE-B|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|214-216|afex_core_activation_owner|ROLE|PHASE-B|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|222-224|afex_core_activation_operator|ROLE|PHASE-B|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|289-359|public.core_v2_activation_control|TABLE|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|361-411|public.core_v2_tenant_activation|TABLE|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|413-470|public.core_v2_branch_activation|TABLE|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|472-473|idx_core_v2_tenant_activation_enabled|INDEX|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|474-475|idx_core_v2_branch_activation_enabled|INDEX|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|512-571|public.core_v2_verification_evidence|TABLE|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|573-582|idx_core_v2_evidence_readiness|INDEX|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|588-654|public.core_v2_managed_identities|TABLE|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|656-659|idx_core_v2_managed_identity_active|INDEX|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|665-684|public.core_v2_issuer_rate_limit_config|TABLE|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|686-734|public.core_v2_issuer_rate_limit_windows|TABLE|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|736-737|idx_core_v2_issuer_rate_limit_expiry|INDEX|PHASE-C|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|185-365|public.resolve_atomic_authorization_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|367-398|public.normalize_customer_phone_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|400-614|public.resolve_customer_identity_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|616-646|public.resolve_customer_identity_result_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|656-684|public.build_atomic_request_fingerprint_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|686-839|public.acquire_idempotency_command_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|846-885|public.build_atomic_order_response_v1|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|887-965|public.allocate_branch_monthly_number_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|972-1017|public.assert_atomic_legacy_triggers_safe_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|1019-1180|public.resolve_inventory_requirements_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|1182-1375|public.lock_and_validate_inventory_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|1377-1415|public.build_inventory_movement_evidence_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|1417-1577|public.apply_inventory_mutations_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|1579-1596|public.atomic_semantic_event_uuid_v1|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|1598-1819|public.enqueue_atomic_outbox_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|1831-2273|public.derive_atomic_financial_snapshot_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|04-atomic-core.sql|2275-3053|public.create_order_atomic_v2|FUNCTION|PHASE-D-H|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|516-597|public.issue_atomic_authorization_context_v1|FUNCTION|PHASE-E|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|599-698|public.issue_pos_atomic_authorization_context_v1|FUNCTION|PHASE-E|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|700-741|public.revoke_atomic_authorization_context_v1|FUNCTION|PHASE-E|ORDER-ONLY|semantic_change=false
OBJECT|06b-authoritative-quote.sql|172-379|public.validate_atomic_authorization_context_internal_v1|FUNCTION|PHASE-E|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|744-786|public.consume_atomic_authorization_context_v1|FUNCTION|PHASE-E|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|792-842|public.claim_atomic_outbox_events_v1|FUNCTION|PHASE-E|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|844-871|public.complete_atomic_outbox_event_v1|FUNCTION|PHASE-E|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|873-927|public.fail_atomic_outbox_event_v1|FUNCTION|PHASE-E|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|754-767|public.reject_core_v2_immutable_change_v1|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|769-771|trg_core_v2_verification_evidence_immutable|TRIGGER|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|773-786|public.touch_core_v2_control_row_v1|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|788-790|trg_touch_core_v2_activation_control|TRIGGER|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|791-793|trg_touch_core_v2_tenant_activation|TRIGGER|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|794-796|trg_touch_core_v2_branch_activation|TRIGGER|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|797-799|trg_touch_core_v2_managed_identities|TRIGGER|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|800-802|trg_touch_core_v2_rate_limit_config|TRIGGER|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|808-936|public.is_core_v2_request_enabled_v1|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|943-1063|public.check_and_record_core_v2_issuer_rate_limit_v1|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1069-1110|public.validate_atomic_authorization_context_for_quote_v1|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1124-1202|public.record_core_v2_verification_evidence_v1|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1204-1327|public.register_core_v2_managed_identity_v1|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1329-1413|public.deactivate_core_v2_v1|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1426-1898|public.verify_core_v2_activation_readiness_v2|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|06b-authoritative-quote.sql|385-621|public.normalize_authoritative_quote_request_v1|FUNCTION|PHASE-G|ORDER-ONLY|semantic_change=false
OBJECT|06b-authoritative-quote.sql|627-646|public.verify_authoritative_quote_hash_v1|FUNCTION|PHASE-G|ORDER-ONLY|semantic_change=false
OBJECT|06b-authoritative-quote.sql|648-661|public.reject_financial_quote_mutation_v1|FUNCTION|PHASE-G|ORDER-ONLY|semantic_change=false
OBJECT|06b-authoritative-quote.sql|663-665|trg_financial_quotes_immutable_v1|TRIGGER|PHASE-G|ORDER-ONLY|semantic_change=false
OBJECT|06b-authoritative-quote.sql|671-1065|public.issue_authoritative_financial_quote_v1|FUNCTION|PHASE-G|ORDER-ONLY|semantic_change=false
OBJECT|06-activation.sql|292-430|public.verify_core_v2_activation_readiness_v1|FUNCTION|PHASE-I|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|453-460|context_issuer_insert_v1|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|464-468|context_issuer_revoke_v1|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|472-475|context_issuer_read_v1|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|479-482|context_core_consume_v1|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|486-488|financial_quotes_core_read_v1|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|491-494|idempotency_core_v1|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|05-security.sql|497-500|outbox_core_v1|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06b-authoritative-quote.sql|1092-1099|financial_quotes_core_insert_v1|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1935-1938|core_v2_activation_owner_control_read|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1939-1942|core_v2_activation_owner_tenants_read|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1943-1946|core_v2_activation_owner_branches_read|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1947-1950|core_v2_activation_owner_evidence_read|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1951-1954|core_v2_activation_owner_identities_read|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1955-1958|core_v2_activation_owner_rate_config_read|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1959-1962|core_v2_activation_owner_rate_windows_read|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1964-1967|core_v2_activation_operator_control|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1968-1971|core_v2_activation_operator_tenants|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1972-1975|core_v2_activation_operator_branches|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1976-1979|core_v2_activation_operator_evidence|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1980-1983|core_v2_activation_operator_identities|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1984-1987|core_v2_activation_operator_rate_config|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1989-1992|core_v2_context_issuer_rate_config_read|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
OBJECT|06a-activation-foundation.sql|1993-1996|core_v2_context_issuer_rate_windows|POLICY|PHASE-J-K|ORDER-ONLY|semantic_change=false
TRANSFORM|4T:50-173,5R-B:39-235,6-Sync:51-210,6A-B:37-198,6B:44-163|PREFLIGHT-REMOVED|replacement=PHASE-A/M|semantic_change=false
TRANSFORM|5R-B:502-509,961-965;6A-B:2009-2025|OWNER/GRANT-DEFERRED|operational grants later review|semantic_change=false
TRANSFORM|CREATE OR REPLACE FUNCTION|CREATE FUNCTION|ORDER-ONLY|body and contract unchanged|semantic_change=false
*/
/* FUNCTION CONTRACT AND NORMALIZED-BODY HASH COMPARISON
FUNCTION_PARITY|public.acquire_idempotency_command_v2|source=04-atomic-core.sql|body_sha256=ab37e77b76c093333a3fe7c8a8d4f2345351b439839124ba0e1f4511d1ab85e1|composed_body_sha256=ab37e77b76c093333a3fe7c8a8d4f2345351b439839124ba0e1f4511d1ab85e1|contract_sha256=4fd651788a8e76aee4385e252bc7b2fafca8eaab2ad812afd61ac5896c6c9ee6|composed_contract_sha256=4fd651788a8e76aee4385e252bc7b2fafca8eaab2ad812afd61ac5896c6c9ee6|match=true
FUNCTION_PARITY|public.allocate_branch_monthly_number_v2|source=04-atomic-core.sql|body_sha256=f13ed00b824274fb2eca064197c2e6908aaabefbc088b77c59abbeb4ec276ca2|composed_body_sha256=f13ed00b824274fb2eca064197c2e6908aaabefbc088b77c59abbeb4ec276ca2|contract_sha256=cbc8d950598a74b9faf1ebf5007d79e18e3e23d8af4035c694b5a9433ea75c6f|composed_contract_sha256=cbc8d950598a74b9faf1ebf5007d79e18e3e23d8af4035c694b5a9433ea75c6f|match=true
FUNCTION_PARITY|public.apply_inventory_mutations_v2|source=04-atomic-core.sql|body_sha256=fdaff565572f76b4f3d35fd6a666247c63c94d809502adc9a1841d5a2ebc6ae3|composed_body_sha256=fdaff565572f76b4f3d35fd6a666247c63c94d809502adc9a1841d5a2ebc6ae3|contract_sha256=074bb33298013bfddb07a3015774e82e61d509856ffcea1ead7d2f7082550074|composed_contract_sha256=074bb33298013bfddb07a3015774e82e61d509856ffcea1ead7d2f7082550074|match=true
FUNCTION_PARITY|public.assert_atomic_legacy_triggers_safe_v2|source=04-atomic-core.sql|body_sha256=c34b5d04224dcdcd6a7eea5bbc3eb4f8c2bb0cef6ded745ffcd00c798fed5560|composed_body_sha256=c34b5d04224dcdcd6a7eea5bbc3eb4f8c2bb0cef6ded745ffcd00c798fed5560|contract_sha256=718ce514fa5e958c95b9376ff9ae56f919936683fdcc9c28a408c54d0b44f119|composed_contract_sha256=718ce514fa5e958c95b9376ff9ae56f919936683fdcc9c28a408c54d0b44f119|match=true
FUNCTION_PARITY|public.atomic_semantic_event_uuid_v1|source=04-atomic-core.sql|body_sha256=6423ee0f31167e5bd096aaa42c004ba6f662ac8e364e4f24a6b0feb83d946d94|composed_body_sha256=6423ee0f31167e5bd096aaa42c004ba6f662ac8e364e4f24a6b0feb83d946d94|contract_sha256=60e922068b9a27a0fcf7fea417458dc3fb548a3e07c0b9b198a05445579beea9|composed_contract_sha256=60e922068b9a27a0fcf7fea417458dc3fb548a3e07c0b9b198a05445579beea9|match=true
FUNCTION_PARITY|public.build_atomic_order_response_v1|source=04-atomic-core.sql|body_sha256=de3c54052d8670303af83ec5750a4a04986e46ff461b8973f3a5ff23a23d49b7|composed_body_sha256=de3c54052d8670303af83ec5750a4a04986e46ff461b8973f3a5ff23a23d49b7|contract_sha256=7e07c0d7fd50a65a8840abdce4646041b0b62747ba631216bc12e1ae87aa732b|composed_contract_sha256=7e07c0d7fd50a65a8840abdce4646041b0b62747ba631216bc12e1ae87aa732b|match=true
FUNCTION_PARITY|public.build_atomic_request_fingerprint_v2|source=04-atomic-core.sql|body_sha256=7f3c630872d60bfde6313c9d94f204a823058cc45b3f31dc95aece1308593076|composed_body_sha256=7f3c630872d60bfde6313c9d94f204a823058cc45b3f31dc95aece1308593076|contract_sha256=d40ad5638925c27112a97678b43936087f129107ac0ba92d3986a0cc2d9a5688|composed_contract_sha256=d40ad5638925c27112a97678b43936087f129107ac0ba92d3986a0cc2d9a5688|match=true
FUNCTION_PARITY|public.build_inventory_movement_evidence_v2|source=04-atomic-core.sql|body_sha256=a749c29cacb10c666dd413f2dee67719c24e8694de1d15836043ab786eede8c7|composed_body_sha256=a749c29cacb10c666dd413f2dee67719c24e8694de1d15836043ab786eede8c7|contract_sha256=ba3d78760ca82669dacf64d51107cdc03da817af8b0559c3727fd03723546fd4|composed_contract_sha256=ba3d78760ca82669dacf64d51107cdc03da817af8b0559c3727fd03723546fd4|match=true
FUNCTION_PARITY|public.check_and_record_core_v2_issuer_rate_limit_v1|source=06a-activation-foundation.sql|body_sha256=f5022c70b5f05a346ba8910af7a0d6516c849ba753a0c5cbf523f2e141fd4c4f|composed_body_sha256=f5022c70b5f05a346ba8910af7a0d6516c849ba753a0c5cbf523f2e141fd4c4f|contract_sha256=6deff74cd5cad7d7623b604dd0b9fcf34792e50493bda683af85e5c00359147e|composed_contract_sha256=6deff74cd5cad7d7623b604dd0b9fcf34792e50493bda683af85e5c00359147e|match=true
FUNCTION_PARITY|public.claim_atomic_outbox_events_v1|source=05-security.sql|body_sha256=7e3787dc80a8b779004a5922fb97bef6fdd3e757e9e5f034e432c463cf24c522|composed_body_sha256=7e3787dc80a8b779004a5922fb97bef6fdd3e757e9e5f034e432c463cf24c522|contract_sha256=e9b65bead39db6983169e707d11240b30bb3546b0dcec5ff3a835a974dea5159|composed_contract_sha256=e9b65bead39db6983169e707d11240b30bb3546b0dcec5ff3a835a974dea5159|match=true
FUNCTION_PARITY|public.complete_atomic_outbox_event_v1|source=05-security.sql|body_sha256=b621fb7d84bf8b542d30866f7f73c9992693da306458d704b19ad57acc46ab0b|composed_body_sha256=b621fb7d84bf8b542d30866f7f73c9992693da306458d704b19ad57acc46ab0b|contract_sha256=712b85cf00647c06cb0a061dd7b4127b9040d4c61d1b410a12b73c2bdc0a7c7c|composed_contract_sha256=712b85cf00647c06cb0a061dd7b4127b9040d4c61d1b410a12b73c2bdc0a7c7c|match=true
FUNCTION_PARITY|public.consume_atomic_authorization_context_v1|source=05-security.sql|body_sha256=41ab9d77fab873ce98fcf58a8f6fb48a8c8c1495d8b906b4a16f4c7b02fd821d|composed_body_sha256=41ab9d77fab873ce98fcf58a8f6fb48a8c8c1495d8b906b4a16f4c7b02fd821d|contract_sha256=e097d6d0ce57442c5d09299b3401977384d77bead542be6a7e5e1c598ff21519|composed_contract_sha256=e097d6d0ce57442c5d09299b3401977384d77bead542be6a7e5e1c598ff21519|match=true
FUNCTION_PARITY|public.create_order_atomic_v2|source=04-atomic-core.sql|body_sha256=e2b9514090536721988b7711e032b52e6ccbb23e1e3b98d4e6fd65b3ed453ef1|composed_body_sha256=e2b9514090536721988b7711e032b52e6ccbb23e1e3b98d4e6fd65b3ed453ef1|contract_sha256=353970fc5b409291e5a5612cd8864af963541d2d4b7dc0944a9302c22755487a|composed_contract_sha256=353970fc5b409291e5a5612cd8864af963541d2d4b7dc0944a9302c22755487a|match=true
FUNCTION_PARITY|public.deactivate_core_v2_v1|source=06a-activation-foundation.sql|body_sha256=50d0433e7b25015d0b3ca1fc4e0b219719229b5c1b7c42d778e354a050709f71|composed_body_sha256=50d0433e7b25015d0b3ca1fc4e0b219719229b5c1b7c42d778e354a050709f71|contract_sha256=9374fcdf78acbf354244e63196529e2c101ffa53d940be47d228b96ce116c94d|composed_contract_sha256=9374fcdf78acbf354244e63196529e2c101ffa53d940be47d228b96ce116c94d|match=true
FUNCTION_PARITY|public.derive_atomic_financial_snapshot_v2|source=04-atomic-core.sql|body_sha256=9d6dc2546d9abd8221cd7797d233f099096e326c6597931e189a1dd9a74bb0c2|composed_body_sha256=9d6dc2546d9abd8221cd7797d233f099096e326c6597931e189a1dd9a74bb0c2|contract_sha256=961de95e48a907777a1cd9111b8906780884c379c6460e351bdf690f37a864b9|composed_contract_sha256=961de95e48a907777a1cd9111b8906780884c379c6460e351bdf690f37a864b9|match=true
FUNCTION_PARITY|public.enqueue_atomic_outbox_v2|source=04-atomic-core.sql|body_sha256=e751cb1cd4855f3174fe20f5b51c42e44c70091f56be6ae8a7c7ce369ba9c235|composed_body_sha256=e751cb1cd4855f3174fe20f5b51c42e44c70091f56be6ae8a7c7ce369ba9c235|contract_sha256=3e9958d7c56e95fc3a4916e0bcbb22525367e7b792b58a05701f91c3cd8eb6ee|composed_contract_sha256=3e9958d7c56e95fc3a4916e0bcbb22525367e7b792b58a05701f91c3cd8eb6ee|match=true
FUNCTION_PARITY|public.fail_atomic_outbox_event_v1|source=05-security.sql|body_sha256=a7b8a62c12a8d74c73a778dc4790e1204e804397bb4368df52627b506d0ef78d|composed_body_sha256=a7b8a62c12a8d74c73a778dc4790e1204e804397bb4368df52627b506d0ef78d|contract_sha256=ad4efc9e145f3b14e016a71c711226a0de227349f4c5365a153d56755e4fdb5d|composed_contract_sha256=ad4efc9e145f3b14e016a71c711226a0de227349f4c5365a153d56755e4fdb5d|match=true
FUNCTION_PARITY|public.is_core_v2_request_enabled_v1|source=06a-activation-foundation.sql|body_sha256=6628eadba2c4b2b618827fab9d63931017ebe643dab757af85f2759141ca2231|composed_body_sha256=6628eadba2c4b2b618827fab9d63931017ebe643dab757af85f2759141ca2231|contract_sha256=e53a8124e13a70225bf694b71f0ca345490e95a9ea44e013ba9e0f88b5586cba|composed_contract_sha256=e53a8124e13a70225bf694b71f0ca345490e95a9ea44e013ba9e0f88b5586cba|match=true
FUNCTION_PARITY|public.issue_atomic_authorization_context_v1|source=05-security.sql|body_sha256=e4a8d79bcd1d3615deec6a17565e81bb85a9807f4c44ac86cf54f1cd3896a9e7|composed_body_sha256=e4a8d79bcd1d3615deec6a17565e81bb85a9807f4c44ac86cf54f1cd3896a9e7|contract_sha256=98eaea0a839867081dd3453dc6729a3f7ec1b40f11cd5ce12c12f18a2f55cafa|composed_contract_sha256=98eaea0a839867081dd3453dc6729a3f7ec1b40f11cd5ce12c12f18a2f55cafa|match=true
FUNCTION_PARITY|public.issue_authoritative_financial_quote_v1|source=06b-authoritative-quote.sql|body_sha256=fa814b248f126eadf0780396ac7bdd1fc4bdccf1a8a496b4c7ad823e8932f88d|composed_body_sha256=fa814b248f126eadf0780396ac7bdd1fc4bdccf1a8a496b4c7ad823e8932f88d|contract_sha256=272a16aabab983e50ba8ad0f4584c339a029472518b3dd6d1b6342f30c4bdeba|composed_contract_sha256=272a16aabab983e50ba8ad0f4584c339a029472518b3dd6d1b6342f30c4bdeba|match=true
FUNCTION_PARITY|public.issue_pos_atomic_authorization_context_v1|source=05-security.sql|body_sha256=682934fb1741c0475edfde7533ae6121526f4bfd7f106100a6665a76f28e8122|composed_body_sha256=682934fb1741c0475edfde7533ae6121526f4bfd7f106100a6665a76f28e8122|contract_sha256=9796c66c29a019d82faa2a72e2102ef8c75ebbad9ada76d45514202c1d09ff5d|composed_contract_sha256=9796c66c29a019d82faa2a72e2102ef8c75ebbad9ada76d45514202c1d09ff5d|match=true
FUNCTION_PARITY|public.lock_and_validate_inventory_v2|source=04-atomic-core.sql|body_sha256=686c122a15085a1e3476cb71029bd89c71060d48fab73f710f9bfb6180c029a6|composed_body_sha256=686c122a15085a1e3476cb71029bd89c71060d48fab73f710f9bfb6180c029a6|contract_sha256=62220285817400a7ff6aa985ffb88c085617809c2d4ab5022d2cc40b7d2dcb0d|composed_contract_sha256=62220285817400a7ff6aa985ffb88c085617809c2d4ab5022d2cc40b7d2dcb0d|match=true
FUNCTION_PARITY|public.normalize_authoritative_quote_request_v1|source=06b-authoritative-quote.sql|body_sha256=816e27e01ea57d9d0843f6ffd9363cc249bbc567c4cd47c98a011e08218ec87d|composed_body_sha256=816e27e01ea57d9d0843f6ffd9363cc249bbc567c4cd47c98a011e08218ec87d|contract_sha256=0ffc7a29492e7f523752993baaa7599fe317a85079f186cb7d2b58fdb47681e2|composed_contract_sha256=0ffc7a29492e7f523752993baaa7599fe317a85079f186cb7d2b58fdb47681e2|match=true
FUNCTION_PARITY|public.normalize_customer_phone_v2|source=04-atomic-core.sql|body_sha256=4bd0eb32138c37b4cec49e49fefa71215d740f62917e8d2d2b4e273086cb6ba4|composed_body_sha256=4bd0eb32138c37b4cec49e49fefa71215d740f62917e8d2d2b4e273086cb6ba4|contract_sha256=8ec9a7f43fcea921543624d2c11b4c4e03e7669d92f156fee57d9deb8e7e6dee|composed_contract_sha256=8ec9a7f43fcea921543624d2c11b4c4e03e7669d92f156fee57d9deb8e7e6dee|match=true
FUNCTION_PARITY|public.record_core_v2_verification_evidence_v1|source=06a-activation-foundation.sql|body_sha256=3234db91646c5e0fe5934e72a44f5baccb3785d724662fa6ba7bf9c615e9c3d3|composed_body_sha256=3234db91646c5e0fe5934e72a44f5baccb3785d724662fa6ba7bf9c615e9c3d3|contract_sha256=89f5a58b613356a6785fb5a218c0689423faa513365ae9568dcf9282783de455|composed_contract_sha256=89f5a58b613356a6785fb5a218c0689423faa513365ae9568dcf9282783de455|match=true
FUNCTION_PARITY|public.register_core_v2_managed_identity_v1|source=06a-activation-foundation.sql|body_sha256=c91bd3b960f40d10744cf69527ddf4d6ffd67d9b5504860c6ca1b89ae532a747|composed_body_sha256=c91bd3b960f40d10744cf69527ddf4d6ffd67d9b5504860c6ca1b89ae532a747|contract_sha256=7f18d896b532bf8f195006fea3f50679787d219fa8341853eec57a487338b1fe|composed_contract_sha256=7f18d896b532bf8f195006fea3f50679787d219fa8341853eec57a487338b1fe|match=true
FUNCTION_PARITY|public.reject_core_v2_immutable_change_v1|source=06a-activation-foundation.sql|body_sha256=b3094234b354f0f4e7d2390ae6a60c01c7b1f7bd096f045eee5f38906ca1b510|composed_body_sha256=b3094234b354f0f4e7d2390ae6a60c01c7b1f7bd096f045eee5f38906ca1b510|contract_sha256=8996f845ce5374c6e5882a223de39c6c9116a39086a993b6ec4fa2d652cb47fa|composed_contract_sha256=8996f845ce5374c6e5882a223de39c6c9116a39086a993b6ec4fa2d652cb47fa|match=true
FUNCTION_PARITY|public.reject_financial_quote_mutation_v1|source=06b-authoritative-quote.sql|body_sha256=bfca91ddf2e17e53756a7d43f8b4309fc21af6cc82a293cc7ca9f12f7a216d58|composed_body_sha256=bfca91ddf2e17e53756a7d43f8b4309fc21af6cc82a293cc7ca9f12f7a216d58|contract_sha256=8996f845ce5374c6e5882a223de39c6c9116a39086a993b6ec4fa2d652cb47fa|composed_contract_sha256=8996f845ce5374c6e5882a223de39c6c9116a39086a993b6ec4fa2d652cb47fa|match=true
FUNCTION_PARITY|public.resolve_atomic_authorization_v2|source=04-atomic-core.sql|body_sha256=ec24e39264196ea2fbd6504b11ed4d57a7c5ad6e25eba599641750206d2a6b0c|composed_body_sha256=ec24e39264196ea2fbd6504b11ed4d57a7c5ad6e25eba599641750206d2a6b0c|contract_sha256=13c6b982e6439217ae00f7d1f81c7cb9084dcf92d06021981e364b03b16d5a9f|composed_contract_sha256=13c6b982e6439217ae00f7d1f81c7cb9084dcf92d06021981e364b03b16d5a9f|match=true
FUNCTION_PARITY|public.resolve_customer_identity_result_v2|source=04-atomic-core.sql|body_sha256=220561b0cf73c4415cf59b269e222d09c7aa50efd26f950c7d275236891753b5|composed_body_sha256=220561b0cf73c4415cf59b269e222d09c7aa50efd26f950c7d275236891753b5|contract_sha256=6ad5b9e79e8c21998cbf6b7790fdb7b8a202c44fc19c390fe5ab28a65a77da01|composed_contract_sha256=6ad5b9e79e8c21998cbf6b7790fdb7b8a202c44fc19c390fe5ab28a65a77da01|match=true
FUNCTION_PARITY|public.resolve_customer_identity_v2|source=04-atomic-core.sql|body_sha256=38493486c0ef24a30c958e9ae827fc3dba0b572e30f7f9e1ac1689e35f754c37|composed_body_sha256=38493486c0ef24a30c958e9ae827fc3dba0b572e30f7f9e1ac1689e35f754c37|contract_sha256=bcf1c4a6e1bd32f5b8fd37eb5f98cf8dcdf76b82ca09ed678321b3d1d72039ed|composed_contract_sha256=bcf1c4a6e1bd32f5b8fd37eb5f98cf8dcdf76b82ca09ed678321b3d1d72039ed|match=true
FUNCTION_PARITY|public.resolve_inventory_requirements_v2|source=04-atomic-core.sql|body_sha256=28e8b74c18711fdef9515b14c06e402c4057917c9d334f7c6e9bc1ad7bf7e4da|composed_body_sha256=28e8b74c18711fdef9515b14c06e402c4057917c9d334f7c6e9bc1ad7bf7e4da|contract_sha256=0c96c7dc31bb5084b8dc58f26ef6b1271893f04ab424d5e1cfc9997940864ecf|composed_contract_sha256=0c96c7dc31bb5084b8dc58f26ef6b1271893f04ab424d5e1cfc9997940864ecf|match=true
FUNCTION_PARITY|public.revoke_atomic_authorization_context_v1|source=05-security.sql|body_sha256=ad023206eb9f2f28d0dd4904d012198542c93670c13a01da8454d365b462cd86|composed_body_sha256=ad023206eb9f2f28d0dd4904d012198542c93670c13a01da8454d365b462cd86|contract_sha256=ea76ae2a41c1ef3868d584d019a8a4d928c3b993cd38847301760b85840063a0|composed_contract_sha256=ea76ae2a41c1ef3868d584d019a8a4d928c3b993cd38847301760b85840063a0|match=true
FUNCTION_PARITY|public.touch_core_v2_control_row_v1|source=06a-activation-foundation.sql|body_sha256=1592f889b66807d7a4c9e5ac823fb12ebc9e7ab40ce78079737b5821bfc26c05|composed_body_sha256=1592f889b66807d7a4c9e5ac823fb12ebc9e7ab40ce78079737b5821bfc26c05|contract_sha256=8996f845ce5374c6e5882a223de39c6c9116a39086a993b6ec4fa2d652cb47fa|composed_contract_sha256=8996f845ce5374c6e5882a223de39c6c9116a39086a993b6ec4fa2d652cb47fa|match=true
FUNCTION_PARITY|public.validate_atomic_authorization_context_for_quote_v1|source=06a-activation-foundation.sql|body_sha256=1abcc0bd146c1942507cf8034420d6a074466b91183bdf5cfbd6e136071ab935|composed_body_sha256=1abcc0bd146c1942507cf8034420d6a074466b91183bdf5cfbd6e136071ab935|contract_sha256=1e78eb5fea5195f4d974b7dbcbaeb6c1b072ff19a3244010c61a3b9d38ae5c5c|composed_contract_sha256=1e78eb5fea5195f4d974b7dbcbaeb6c1b072ff19a3244010c61a3b9d38ae5c5c|match=true
FUNCTION_PARITY|public.validate_atomic_authorization_context_internal_v1|source=06b-authoritative-quote.sql|body_sha256=09907e89f85d04093009f84ea3192c84d2ceeb5d06978f40465179629d1fb386|composed_body_sha256=09907e89f85d04093009f84ea3192c84d2ceeb5d06978f40465179629d1fb386|contract_sha256=3ca264f224490d73c3897308955374d60fe430fa996a48a08f0899621fe8c04b|composed_contract_sha256=3ca264f224490d73c3897308955374d60fe430fa996a48a08f0899621fe8c04b|match=true
FUNCTION_PARITY|public.verify_authoritative_quote_hash_v1|source=06b-authoritative-quote.sql|body_sha256=b1a745b4d6704b5d2b388df14a54e81881889da46915a43e445f69f7467e9231|composed_body_sha256=b1a745b4d6704b5d2b388df14a54e81881889da46915a43e445f69f7467e9231|contract_sha256=09f489edf20e70e7cbde355f4a8e222fd288601b2c2fadb08f4dcd98c2a77031|composed_contract_sha256=09f489edf20e70e7cbde355f4a8e222fd288601b2c2fadb08f4dcd98c2a77031|match=true
FUNCTION_PARITY|public.verify_core_v2_activation_readiness_v1|source=06-activation.sql|body_sha256=d36d8eb1a3ce7f1943905bb744a17341314f0b1e44c15aead049cfc97a6e364d|composed_body_sha256=d36d8eb1a3ce7f1943905bb744a17341314f0b1e44c15aead049cfc97a6e364d|contract_sha256=209f5d86b5dc40848a6b4ecf04812173ea3e3b2d4b23017d1c1720a3a0b15c0d|composed_contract_sha256=209f5d86b5dc40848a6b4ecf04812173ea3e3b2d4b23017d1c1720a3a0b15c0d|match=true
FUNCTION_PARITY|public.verify_core_v2_activation_readiness_v2|source=06a-activation-foundation.sql|body_sha256=c66ab3e88ad561ca2d80e2b2aaffd2c139aad8777d3613226fbcf44e750f7ec6|composed_body_sha256=c66ab3e88ad561ca2d80e2b2aaffd2c139aad8777d3613226fbcf44e750f7ec6|contract_sha256=12931fa66f26da7e7d83df546c6ada66732c7a34918609034e148fa62ad34ec8|composed_contract_sha256=12931fa66f26da7e7d83df546c6ada66732c7a34918609034e148fa62ad34ec8|match=true
*/
-- PHASE A: READ-ONLY FOUNDATION AND COLLISION PREFLIGHT.
do $p10a$ declare missing text;role_name text;begin
 if to_regprocedure('extensions.digest(text,text)')is null or to_regprocedure('extensions.gen_random_bytes(integer)')is null then raise exception using errcode='55000',message='P10_PGCRYPTO_MISSING';end if;
 with q(n)as(values('public.financial_quotes'),('public.idempotency_commands'),('public.atomic_outbox'),('public.atomic_authorization_contexts'),('public.customers'),('public.orders'),('public.invoices'),('public.invoice_items'),('public.inventory_stock'),('public.inventory_movements'),('public.order_number_sequences'),('public.audit_logs'),('public.profiles'),('public.pos_profiles'),('public.tenants'),('public.branches'),('public.catalog_items'),('public.branch_catalog_items'),('public.discounts'),('public.vat_settings'))select string_agg(n,',')into missing from q where to_regclass(n)is null;if missing is not null then raise exception using errcode='55000',message='P10_FOUNDATION_MISSING',detail=missing;end if;
 if to_regclass('public.uq_financial_quotes_authorization_context')is null or to_regclass('public.uq_customers_tenant_phone_normalized')is null or not exists(select 1 from pg_constraint where conrelid='public.financial_quotes'::regclass and conname='fk_financial_quotes_authorization_context')then raise exception using errcode='55000',message='P10_FOUNDATION_CONTRACT_MISSING';end if;
 foreach role_name in array array['afex_core_owner','afex_context_issuer','afex_outbox_worker','afex_core_runtime','afex_core_activation_owner','afex_core_activation_operator']loop if exists(select 1 from pg_roles where rolname=role_name)then raise exception using errcode='55000',message='P10_ROLE_COLLISION',detail=role_name;end if;end loop;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relname like'core_v2_%')or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and(p.proname like'%atomic%'or p.proname like'%authoritative%'or p.proname like'%core_v2%'or p.proname like'%outbox%'))then raise exception using errcode='55000',message='P10_CORE_OBJECT_COLLISION';end if;
end;$p10a$;
do $p10_foundation_contract$
declare
  r record;
  v_type text;
  v_not_null boolean;
  v_default text;
  v_constraint_missing text;
begin
  /* Contract-sensitive columns consumed by the composed runtime. */
  for r in
    select *
    from (values
      ('customers','phone_normalized','text',false),
      ('customers','record_version','bigint',false),
      ('orders','idempotency_command_id','uuid',false),
      ('orders','correlation_id','text',false),
      ('orders','source_channel','text',false),
      ('orders','atomic_engine_version','text',false),
      ('orders','financial_engine_version','text',false),
      ('orders','customer_name_snapshot','text',false),
      ('orders','customer_phone_snapshot','text',false),
      ('orders','customer_record_version_snapshot','bigint',false),
      ('invoices','currency_code','text',false),
      ('invoices','discount_id_snapshot','uuid',false),
      ('invoices','discount_name_snapshot','text',false),
      ('invoices','discount_type_snapshot','text',false),
      ('invoices','discount_value_snapshot','numeric(10,4)',false),
      ('invoices','discount_amount','numeric(18,2)',false),
      ('invoices','taxable_subtotal','numeric(18,2)',false),
      ('invoices','vat_setting_id_snapshot','uuid',false),
      ('invoices','vat_rate_snapshot','numeric(10,4)',false),
      ('invoices','vat_amount','numeric(18,2)',false),
      ('invoices','payment_rule_version','text',false),
      ('invoices','request_fingerprint','text',false),
      ('invoices','request_fingerprint_version','text',false),
      ('invoices','quote_fingerprint','text',false),
      ('invoices','quote_version','text',false),
      ('invoices','financial_engine_version','text',false),
      ('invoices','pricing_rule_version','text',false),
      ('invoices','vat_rule_version','text',false),
      ('invoices','discount_rule_version','text',false),
      ('invoices','rounding_version','text',false),
      ('invoices','financial_snapshot_version','text',false),
      ('invoices','financial_snapshot_hash','text',false),
      ('invoices','financial_snapshot_complete','boolean',false),
      ('invoices','financial_completeness_reasons','jsonb',false),
      ('invoices','customer_name_snapshot','text',false),
      ('invoices','customer_phone_snapshot','text',false),
      ('invoices','customer_email_snapshot','text',false),
      ('invoices','customer_record_version_snapshot','bigint',false),
      ('invoices','correlation_id','text',false),
      ('invoices','financial_record_classification','text',false),
      ('invoices','atomic_engine_version','text',false),
      ('invoices','financial_quote_id','uuid',false),
      ('invoices','payment_snapshot','jsonb',false),
      ('invoice_items','line_number','integer',false),
      ('invoice_items','gross_amount','numeric(18,2)',false),
      ('invoice_items','discount_allocation','numeric(18,2)',false),
      ('invoice_items','taxable_amount','numeric(18,2)',false),
      ('invoice_items','price_source','text',false),
      ('invoice_items','source_branch_price_id','uuid',false),
      ('invoice_items','source_catalog_updated_at','timestamp with time zone',false),
      ('invoice_items','source_branch_price_updated_at','timestamp with time zone',false),
      ('invoice_items','cost_snapshot','numeric(18,2)',false),
      ('invoice_items','profit_snapshot','numeric(18,2)',false),
      ('invoice_items','cost_snapshot_status','text',false),
      ('invoice_items','cost_snapshot_version','text',false),
      ('invoice_items','inventory_tracking_mode','text',false),
      ('invoice_items','inventory_movement_correlation_id','text',false),
      ('invoice_items','pricing_snapshot','jsonb',false),
      ('invoice_items','inventory_snapshot_version','text',false),
      ('inventory_stock','record_version','bigint',false),
      ('inventory_movements','movement_reason','text',false),
      ('inventory_movements','quantity_before','numeric(30,6)',false),
      ('inventory_movements','quantity_after','numeric(30,6)',false),
      ('inventory_movements','stock_version_before','bigint',false),
      ('inventory_movements','stock_version_after','bigint',false),
      ('inventory_movements','order_id','uuid',false),
      ('inventory_movements','invoice_id','uuid',false),
      ('inventory_movements','invoice_item_id','uuid',false),
      ('inventory_movements','correlation_id','text',false),
      ('inventory_movements','inventory_engine_version','text',false),
      ('inventory_movements','inventory_snapshot_version','text',false),
      ('inventory_movements','inventory_snapshot_hash','text',false),
      ('audit_logs','actor_role','text',false),
      ('audit_logs','employee_id','uuid',false),
      ('audit_logs','order_id','uuid',false),
      ('audit_logs','invoice_id','uuid',false),
      ('audit_logs','customer_id','uuid',false),
      ('audit_logs','request_fingerprint','text',false),
      ('audit_logs','quote_fingerprint','text',false),
      ('audit_logs','event_type','text',false),
      ('audit_logs','before_snapshot','jsonb',false),
      ('audit_logs','after_snapshot','jsonb',false),
      ('audit_logs','correlation_id','text',false),
      ('audit_logs','audit_schema_version','text',false),
      ('financial_quotes','id','uuid',true),
      ('financial_quotes','tenant_id','uuid',true),
      ('financial_quotes','branch_id','uuid',true),
      ('financial_quotes','customer_id','uuid',false),
      ('financial_quotes','correlation_id','text',true),
      ('financial_quotes','request_fingerprint','text',true),
      ('financial_quotes','request_fingerprint_version','text',true),
      ('financial_quotes','quote_fingerprint','text',true),
      ('financial_quotes','quote_version','text',true),
      ('financial_quotes','financial_engine_version','text',true),
      ('financial_quotes','pricing_rule_version','text',true),
      ('financial_quotes','vat_rule_version','text',true),
      ('financial_quotes','discount_rule_version','text',true),
      ('financial_quotes','rounding_version','text',true),
      ('financial_quotes','quote_snapshot_version','text',true),
      ('financial_quotes','quote_classification','text',true),
      ('financial_quotes','created_by_actor_type','text',true),
      ('financial_quotes','created_by_actor_id','uuid',false),
      ('financial_quotes','quote_payload','jsonb',true),
      ('financial_quotes','quote_hash','text',true),
      ('financial_quotes','created_at','timestamp with time zone',true),
      ('financial_quotes','expires_at','timestamp with time zone',true),
      ('idempotency_commands','id','uuid',true),
      ('idempotency_commands','tenant_id','uuid',true),
      ('idempotency_commands','branch_id','uuid',true),
      ('idempotency_commands','command_type','text',true),
      ('idempotency_commands','key_hash','text',true),
      ('idempotency_commands','request_fingerprint','text',true),
      ('idempotency_commands','fingerprint_version','text',true),
      ('idempotency_commands','engine_version','text',true),
      ('idempotency_commands','actor_type','text',true),
      ('idempotency_commands','actor_id','uuid',false),
      ('idempotency_commands','correlation_id','text',true),
      ('idempotency_commands','state','text',true),
      ('idempotency_commands','lease_owner','text',false),
      ('idempotency_commands','lease_expires_at','timestamp with time zone',false),
      ('idempotency_commands','retry_count','integer',true),
      ('idempotency_commands','order_id','uuid',false),
      ('idempotency_commands','invoice_id','uuid',false),
      ('idempotency_commands','response_version','text',false),
      ('idempotency_commands','response_hash','text',false),
      ('idempotency_commands','last_error_code','text',false),
      ('idempotency_commands','started_at','timestamp with time zone',true),
      ('idempotency_commands','committed_at','timestamp with time zone',false),
      ('idempotency_commands','failed_at','timestamp with time zone',false),
      ('idempotency_commands','recovery_started_at','timestamp with time zone',false),
      ('idempotency_commands','recovery_completed_at','timestamp with time zone',false),
      ('idempotency_commands','expires_at','timestamp with time zone',false),
      ('idempotency_commands','updated_at','timestamp with time zone',true),
      ('atomic_outbox','id','uuid',true),
      ('atomic_outbox','event_id','uuid',true),
      ('atomic_outbox','correlation_id','text',true),
      ('atomic_outbox','aggregate_id','uuid',false),
      ('atomic_outbox','aggregate_type','text',true),
      ('atomic_outbox','tenant_id','uuid',true),
      ('atomic_outbox','branch_id','uuid',true),
      ('atomic_outbox','event_type','text',true),
      ('atomic_outbox','payload_version','text',true),
      ('atomic_outbox','payload','jsonb',true),
      ('atomic_outbox','payload_hash','text',true),
      ('atomic_outbox','lease_owner','text',false),
      ('atomic_outbox','attempt_count','integer',true),
      ('atomic_outbox','retry_count','integer',true),
      ('atomic_outbox','execution_status','text',true),
      ('atomic_outbox','next_attempt_at','timestamp with time zone',true),
      ('atomic_outbox','lease_expires_at','timestamp with time zone',false),
      ('atomic_outbox','last_error_code','text',false),
      ('atomic_outbox','last_error_classification','text',false),
      ('atomic_outbox','last_error_message','text',false),
      ('atomic_outbox','created_at','timestamp with time zone',true),
      ('atomic_outbox','delivered_at','timestamp with time zone',false),
      ('atomic_outbox','updated_at','timestamp with time zone',true),
      ('atomic_authorization_contexts','context_id','uuid',true),
      ('atomic_authorization_contexts','context_secret_hash','text',true),
      ('atomic_authorization_contexts','context_nonce','uuid',true),
      ('atomic_authorization_contexts','authenticated_user_id','uuid',true),
      ('atomic_authorization_contexts','tenant_id','uuid',true),
      ('atomic_authorization_contexts','branch_id','uuid',true),
      ('atomic_authorization_contexts','profile_employee_id','uuid',false),
      ('atomic_authorization_contexts','pos_profile_id','uuid',false),
      ('atomic_authorization_contexts','pos_verified_at','timestamp with time zone',false),
      ('atomic_authorization_contexts','pos_verification_version','text',false),
      ('atomic_authorization_contexts','employee_id','uuid',false),
      ('atomic_authorization_contexts','actor_role','text',true),
      ('atomic_authorization_contexts','authorization_source','text',true),
      ('atomic_authorization_contexts','purpose','text',true),
      ('atomic_authorization_contexts','idempotency_key_hash','text',true),
      ('atomic_authorization_contexts','context_version','text',true),
      ('atomic_authorization_contexts','issued_by_service','text',true),
      ('atomic_authorization_contexts','issuer_version','text',true),
      ('atomic_authorization_contexts','state','text',true),
      ('atomic_authorization_contexts','issued_at','timestamp with time zone',true),
      ('atomic_authorization_contexts','expires_at','timestamp with time zone',true),
      ('atomic_authorization_contexts','used_at','timestamp with time zone',false),
      ('atomic_authorization_contexts','revoked_at','timestamp with time zone',false),
      ('financial_quotes','authorization_context_id','uuid',false),
      ('financial_quotes','issuer_context_version','text',false)
    ) expected(table_name,column_name,type_name,not_null)
  loop
    select format_type(a.atttypid,a.atttypmod),a.attnotnull,
           pg_get_expr(d.adbin,d.adrelid)
    into v_type,v_not_null,v_default
    from pg_attribute a
    left join pg_attrdef d
      on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=format('public.%I',r.table_name)::regclass
      and a.attname=r.column_name
      and a.attnum>0 and not a.attisdropped;

    if not found or v_type<>r.type_name or v_not_null<>r.not_null then
      raise exception using
        errcode='55000',
        message='P10_FOUNDATION_COLUMN_CONTRACT_MISMATCH',
        detail=format(
          'public.%I.%I expected type=%s not_null=%s; found type=%s not_null=%s',
          r.table_name,r.column_name,r.type_name,r.not_null,
          coalesce(v_type,'MISSING'),v_not_null
        );
    end if;

    if r.table_name in ('customers','orders','invoices','invoice_items',
      'inventory_stock','inventory_movements','audit_logs')
      and v_default is not null
    then
      raise exception using
        errcode='55000',
        message='P10_FOUNDATION_LEGACY_COLUMN_DEFAULT_MISMATCH',
        detail=format('public.%I.%I unexpected default %s',
          r.table_name,r.column_name,v_default);
    end if;
  end loop;

  for r in
    select *
    from (values
      ('financial_quotes','id','gen_random_uuid()'),
      ('financial_quotes','created_at','now()'),
      ('idempotency_commands','id','gen_random_uuid()'),
      ('idempotency_commands','retry_count','0'),
      ('idempotency_commands','started_at','now()'),
      ('idempotency_commands','updated_at','now()'),
      ('atomic_outbox','id','gen_random_uuid()'),
      ('atomic_outbox','attempt_count','0'),
      ('atomic_outbox','retry_count','0'),
      ('atomic_outbox','execution_status','''pending_commit''::text'),
      ('atomic_outbox','next_attempt_at','now()'),
      ('atomic_outbox','created_at','now()'),
      ('atomic_outbox','updated_at','now()')
    ) expected(table_name,column_name,default_expression)
  loop
    select pg_get_expr(d.adbin,d.adrelid)
    into v_default
    from pg_attribute a
    join pg_attrdef d
      on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=format('public.%I',r.table_name)::regclass
      and a.attname=r.column_name
      and a.attnum>0 and not a.attisdropped;

    if not found or regexp_replace(lower(v_default),'[[:space:]()]','','g')
      <>regexp_replace(lower(r.default_expression),'[[:space:]()]','','g')
    then
      raise exception using
        errcode='55000',
        message='P10_FOUNDATION_DEFAULT_CONTRACT_MISMATCH',
        detail=format(
          'public.%I.%I expected default=%s found=%s',
          r.table_name,r.column_name,r.default_expression,
          coalesce(v_default,'MISSING')
        );
    end if;
  end loop;

  with expected(table_name,constraint_name,constraint_type) as (values
    ('financial_quotes','ck_financial_quotes_request_fingerprint','c'),
    ('financial_quotes','ck_financial_quotes_quote_fingerprint','c'),
    ('financial_quotes','ck_financial_quotes_quote_hash','c'),
    ('financial_quotes','ck_financial_quotes_correlation_id','c'),
    ('financial_quotes','ck_financial_quotes_versions_nonempty','c'),
    ('financial_quotes','ck_financial_quotes_payload_object','c'),
    ('financial_quotes','ck_financial_quotes_expiry','c'),
    ('financial_quotes','ck_financial_quotes_classification','c'),
    ('financial_quotes','ck_financial_quotes_actor_type','c'),
    ('idempotency_commands','ck_idempotency_commands_key_hash','c'),
    ('idempotency_commands','ck_idempotency_commands_request_fingerprint','c'),
    ('idempotency_commands','ck_idempotency_commands_response_hash','c'),
    ('idempotency_commands','ck_idempotency_commands_state','c'),
    ('idempotency_commands','ck_idempotency_commands_actor_type','c'),
    ('idempotency_commands','ck_idempotency_commands_retry_count','c'),
    ('idempotency_commands','ck_idempotency_commands_correlation_id','c'),
    ('idempotency_commands','ck_idempotency_commands_nonempty_identity','c'),
    ('idempotency_commands','ck_idempotency_commands_started_state','c'),
    ('idempotency_commands','ck_idempotency_commands_committed_state','c'),
    ('idempotency_commands','ck_idempotency_commands_failed_state','c'),
    ('idempotency_commands','ck_idempotency_commands_expired_state','c'),
    ('idempotency_commands','ck_idempotency_commands_recovery_order','c'),
    ('atomic_outbox','ck_atomic_outbox_event_type','c'),
    ('atomic_outbox','ck_atomic_outbox_aggregate_type','c'),
    ('atomic_outbox','ck_atomic_outbox_execution_status','c'),
    ('atomic_outbox','ck_atomic_outbox_payload_object','c'),
    ('atomic_outbox','ck_atomic_outbox_payload_hash','c'),
    ('atomic_outbox','ck_atomic_outbox_counts','c'),
    ('atomic_outbox','ck_atomic_outbox_correlation_id','c'),
    ('atomic_outbox','ck_atomic_outbox_payload_version','c'),
    ('atomic_outbox','ck_atomic_outbox_bounded_text','c'),
    ('atomic_outbox','ck_atomic_outbox_processing_lease','c'),
    ('atomic_outbox','ck_atomic_outbox_nonprocessing_lease','c'),
    ('atomic_outbox','ck_atomic_outbox_delivered_at','c'),
    ('atomic_outbox','ck_atomic_outbox_terminal_lease','c'),
    ('atomic_outbox','ck_atomic_outbox_next_attempt','c'),
    ('customers','ck_customers_phone_normalized','c'),
    ('customers','ck_customers_record_version','c'),
    ('orders','ck_orders_correlation_id','c'),
    ('orders','ck_orders_customer_record_version_snapshot','c'),
    ('orders','ck_orders_engine_versions','c'),
    ('orders','ck_orders_core_v2_complete','c'),
    ('invoices','ck_invoices_currency_code','c'),
    ('invoices','ck_invoices_financial_nonnegative','c'),
    ('invoices','ck_invoices_vat_rate','c'),
    ('invoices','ck_invoices_request_fingerprint','c'),
    ('invoices','ck_invoices_quote_fingerprint','c'),
    ('invoices','ck_invoices_financial_snapshot_hash','c'),
    ('invoices','ck_invoices_completeness_reasons','c'),
    ('invoices','ck_invoices_customer_record_version_snapshot','c'),
    ('invoices','ck_invoices_correlation_id','c'),
    ('invoices','ck_invoices_payment_snapshot','c'),
    ('invoices','ck_invoices_engine_versions','c'),
    ('invoices','ck_invoices_core_v2_complete','c'),
    ('invoice_items','ck_invoice_items_line_number','c'),
    ('invoice_items','ck_invoice_items_financial_nonnegative','c'),
    ('invoice_items','ck_invoice_items_discount_allocation','c'),
    ('invoice_items','ck_invoice_items_taxable_amount','c'),
    ('invoice_items','ck_invoice_items_price_source','c'),
    ('invoice_items','ck_invoice_items_cost_status','c'),
    ('invoice_items','ck_invoice_items_tracking_mode','c'),
    ('invoice_items','ck_invoice_items_correlation_id','c'),
    ('inventory_stock','ck_inventory_stock_record_version','c'),
    ('inventory_movements','ck_inventory_movements_quantities','c'),
    ('inventory_movements','ck_inventory_movements_versions','c'),
    ('inventory_movements','ck_inventory_movements_snapshot_hash','c'),
    ('inventory_movements','ck_inventory_movements_correlation_id','c'),
    ('inventory_movements','ck_inventory_movements_engine_version','c'),
    ('inventory_movements','ck_inventory_movements_core_v2_complete','c'),
    ('audit_logs','ck_audit_logs_request_fingerprint','c'),
    ('audit_logs','ck_audit_logs_quote_fingerprint','c'),
    ('audit_logs','ck_audit_logs_correlation_id','c'),
    ('audit_logs','ck_audit_logs_snapshots','c'),
    ('audit_logs','ck_audit_logs_schema_version','c'),
    ('financial_quotes','fk_financial_quotes_tenants','f'),
    ('financial_quotes','fk_financial_quotes_branches','f'),
    ('financial_quotes','fk_financial_quotes_customers','f'),
    ('idempotency_commands','fk_idempotency_commands_tenants','f'),
    ('idempotency_commands','fk_idempotency_commands_branches','f'),
    ('idempotency_commands','fk_idempotency_commands_orders','f'),
    ('idempotency_commands','fk_idempotency_commands_invoices','f'),
    ('atomic_outbox','fk_atomic_outbox_tenants','f'),
    ('atomic_outbox','fk_atomic_outbox_branches','f'),
    ('orders','fk_orders_idempotency_commands','f'),
    ('invoices','fk_invoices_financial_quotes','f'),
    ('inventory_movements','fk_inventory_movements_orders','f'),
    ('inventory_movements','fk_inventory_movements_invoices','f'),
    ('inventory_movements','fk_inventory_movements_invoice_items','f'),
    ('audit_logs','fk_audit_logs_orders','f'),
    ('audit_logs','fk_audit_logs_invoices','f'),
    ('audit_logs','fk_audit_logs_customers','f'),
    ('financial_quotes','financial_quotes_pkey','p'),
    ('idempotency_commands','idempotency_commands_pkey','p'),
    ('atomic_outbox','atomic_outbox_pkey','p'),
    ('atomic_outbox','uq_atomic_outbox_event_id','u'),
    ('atomic_authorization_contexts','pk_atomic_authorization_contexts','p'),
    ('atomic_authorization_contexts','uq_atomic_authorization_contexts_secret_hash','u'),
    ('atomic_authorization_contexts','uq_atomic_authorization_contexts_nonce','u'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_secret_hash','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_idempotency_hash','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_version','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_purpose','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_state','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_ttl','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_timestamps','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_state_evidence','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_revocation_evidence','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_actor_role','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_actor_identity','c'),
    ('atomic_authorization_contexts','ck_atomic_authorization_contexts_issuer','c'),
    ('atomic_authorization_contexts','fk_atomic_authorization_contexts_tenant','f'),
    ('atomic_authorization_contexts','fk_atomic_authorization_contexts_branch_scope','f'),
    ('atomic_authorization_contexts','fk_atomic_authorization_contexts_authenticated_user_scope','f'),
    ('atomic_authorization_contexts','fk_atomic_authorization_contexts_profile_employee_scope','f'),
    ('atomic_authorization_contexts','fk_atomic_authorization_contexts_pos_employee_scope','f'),
    ('atomic_authorization_contexts','fk_atomic_authorization_contexts_revoked_by_user','f'),
    ('financial_quotes','fk_financial_quotes_authorization_context','f'),
    ('financial_quotes','ck_financial_quotes_issuer_context_version','c')
  )
  select string_agg(
    format('public.%I.%I(%s)',e.table_name,e.constraint_name,e.constraint_type),
    ', ' order by e.table_name,e.constraint_name
  )
  into v_constraint_missing
  from expected e
  left join pg_constraint c
    on c.conrelid=format('public.%I',e.table_name)::regclass
   and c.conname=e.constraint_name
   and c.contype=e.constraint_type::"char"
  where c.oid is null;

  if v_constraint_missing is not null then
    raise exception using
      errcode='55000',
      message='P10_FOUNDATION_CONSTRAINT_MISSING',
      detail=v_constraint_missing;
  end if;

  if not exists (
    select 1
    from pg_attribute a
    where a.attrelid='public.atomic_authorization_contexts'::regclass
      and a.attname='employee_id'
      and a.attgenerated='s'
      and a.attnum>0 and not a.attisdropped
  ) or exists (
    select 1
    from pg_attribute a
    where a.attrelid='public.atomic_authorization_contexts'::regclass
      and a.attnum>0 and not a.attisdropped
      and a.attname<>'employee_id'
      and a.attgenerated<>''
  ) then
    raise exception using
      errcode='55000',
      message='P10_SECURITY_FOUNDATION_GENERATED_COLUMN_MISMATCH';
  end if;

  if not exists (
    select 1
    from pg_class c
    where c.oid='public.atomic_authorization_contexts'::regclass
      and c.relrowsecurity
  ) then
    raise exception using
      errcode='55000',
      message='P10_SECURITY_FOUNDATION_RLS_MISSING';
  end if;
end;
$p10_foundation_contract$;

do $p10_foundation_indexes$
declare
  r record;
  v_exact boolean;
  v_equivalent_names text;
begin
  for r in
    select *
    from (values
      ('uq_financial_quotes_scope','financial_quotes',true,array['tenant_id','branch_id','quote_fingerprint','quote_version','financial_engine_version']::text[],null::text,false),
      ('idx_financial_quotes_request_fingerprint','financial_quotes',false,array['tenant_id','branch_id','request_fingerprint']::text[],null,false),
      ('idx_financial_quotes_expiry','financial_quotes',false,array['expires_at']::text[],null,false),
      ('idx_financial_quotes_customer','financial_quotes',false,array['customer_id']::text[],null,false),
      ('uq_idempotency_commands_scope_key','idempotency_commands',true,array['tenant_id','branch_id','command_type','key_hash']::text[],null,false),
      ('idx_idempotency_commands_recovery_lease','idempotency_commands',false,array['state','lease_expires_at','recovery_started_at']::text[],'state = any (array[''started''::text, ''failed_retryable''::text])',false),
      ('idx_idempotency_commands_retention','idempotency_commands',false,array['state','committed_at','failed_at','expires_at']::text[],null,false),
      ('idx_idempotency_commands_order','idempotency_commands',false,array['order_id']::text[],null,false),
      ('idx_idempotency_commands_invoice','idempotency_commands',false,array['invoice_id']::text[],null,false),
      ('idx_atomic_outbox_claim_ready','atomic_outbox',false,array['execution_status','next_attempt_at','created_at']::text[],'execution_status = any (array[''pending_commit''::text, ''retryable''::text])',false),
      ('idx_atomic_outbox_processing_lease','atomic_outbox',false,array['execution_status','lease_expires_at','created_at']::text[],'execution_status = ''processing''::text',false),
      ('idx_atomic_outbox_aggregate','atomic_outbox',false,array['tenant_id','aggregate_type','aggregate_id','created_at']::text[],null,false),
      ('idx_atomic_outbox_correlation','atomic_outbox',false,array['correlation_id','created_at']::text[],null,false),
      ('idx_customers_tenant_phone_normalized','customers',false,array['tenant_id','phone_normalized']::text[],'phone_normalized is not null',false),
      ('idx_orders_idempotency_command','orders',false,array['idempotency_command_id']::text[],'idempotency_command_id is not null',false),
      ('idx_orders_correlation','orders',false,array['correlation_id']::text[],'correlation_id is not null',false),
      ('idx_invoices_financial_quote','invoices',false,array['financial_quote_id']::text[],'financial_quote_id is not null',false),
      ('idx_invoices_request_fingerprint','invoices',false,array['tenant_id','request_fingerprint']::text[],'request_fingerprint is not null',false),
      ('idx_invoices_quote_fingerprint','invoices',false,array['tenant_id','quote_fingerprint']::text[],'quote_fingerprint is not null',false),
      ('idx_inventory_movements_order','inventory_movements',false,array['order_id']::text[],'order_id is not null',false),
      ('idx_inventory_movements_invoice','inventory_movements',false,array['invoice_id']::text[],'invoice_id is not null',false),
      ('idx_inventory_movements_invoice_item','inventory_movements',false,array['invoice_item_id']::text[],'invoice_item_id is not null',false),
      ('idx_inventory_movements_correlation','inventory_movements',false,array['tenant_id','correlation_id','created_at']::text[],'correlation_id is not null',false),
      ('idx_audit_logs_order','audit_logs',false,array['order_id']::text[],'order_id is not null',false),
      ('idx_audit_logs_invoice','audit_logs',false,array['invoice_id']::text[],'invoice_id is not null',false),
      ('idx_audit_logs_customer','audit_logs',false,array['customer_id']::text[],'customer_id is not null',false),
      ('idx_audit_logs_correlation','audit_logs',false,array['tenant_id','correlation_id','created_at']::text[],'correlation_id is not null',false),
      ('uq_customers_tenant_phone_normalized','customers',true,array['tenant_id','phone_normalized']::text[],'phone_normalized is not null',false),
      ('idx_atomic_authorization_contexts_state_expiry','atomic_authorization_contexts',false,array['state','expires_at']::text[],null,false),
      ('idx_atomic_authorization_contexts_actor_history','atomic_authorization_contexts',false,array['tenant_id','authenticated_user_id','issued_at']::text[],null,true),
      ('idx_atomic_authorization_contexts_scope_history','atomic_authorization_contexts',false,array['tenant_id','branch_id','issued_at']::text[],null,true),
      ('uq_financial_quotes_authorization_context','financial_quotes',true,array['authorization_context_id']::text[],'authorization_context_id is not null',false)
    ) expected(index_name,table_name,is_unique,key_columns,predicate,last_key_desc)
  loop
    select
      i.indrelid=format('public.%I',r.table_name)::regclass
      and i.indisunique=r.is_unique
      and i.indisvalid and i.indisready
      and am.amname='btree'
      and i.indnkeyatts=cardinality(r.key_columns)
      and i.indnatts=i.indnkeyatts
      and i.indexprs is null
      and array(
        select a.attname
        from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
        join pg_attribute a
          on a.attrelid=i.indrelid and a.attnum=k.attnum
        where k.attnum>0 and k.ord<=i.indnkeyatts
        order by k.ord
      )=r.key_columns
      and not exists (
        select 1
        from unnest(i.indoption::smallint[]) with ordinality o(bits,ord)
        where o.ord<=i.indnkeyatts
          and (
            (o.ord<i.indnkeyatts and o.bits<>0)
            or
            (o.ord=i.indnkeyatts and
              o.bits<>case when r.last_key_desc then 3 else 0 end)
          )
      )
      and not exists (
        select 1
        from unnest(i.indclass::oid[]) with ordinality oc(opclass_oid,ord)
        join pg_opclass opc on opc.oid=oc.opclass_oid
        where oc.ord<=i.indnkeyatts and not opc.opcdefault
      )
      and not exists (
        select 1
        from unnest(i.indkey::smallint[],i.indcollation::oid[])
          with ordinality k(attnum,collation_oid,ord)
        join pg_attribute a
          on a.attrelid=i.indrelid and a.attnum=k.attnum
        where k.ord<=i.indnkeyatts
          and k.collation_oid<>a.attcollation
      )
      and coalesce(
        regexp_replace(replace(lower(pg_get_expr(i.indpred,i.indrelid)),'::text',''),
          '[[:space:]()]','','g'),''
      )=coalesce(
        regexp_replace(replace(lower(r.predicate),'::text',''),
          '[[:space:]()]','','g'),''
      )
    into v_exact
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_am am on am.oid=c.relam
    where n.nspname='public' and c.relname=r.index_name;

    if not found or not coalesce(v_exact,false) then
      raise exception using
        errcode='55000',
        message='P10_FOUNDATION_INDEX_CONTRACT_MISMATCH',
        detail=format(
          '%s on public.%I is missing, invalid, not ready, or differs',
          r.index_name,r.table_name
        );
    end if;

    select string_agg(
      format('%I(valid=%s,ready=%s)',c.relname,i.indisvalid,i.indisready),
      ', ' order by c.relname
    )
    into v_equivalent_names
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    join pg_class t on t.oid=i.indrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_am am on am.oid=c.relam
    where n.nspname='public'
      and t.relname=r.table_name
      and c.relname<>r.index_name
      and i.indisunique=r.is_unique
      and am.amname='btree'
      and i.indnkeyatts=cardinality(r.key_columns)
      and i.indnatts=i.indnkeyatts
      and i.indexprs is null
      and array(
        select a.attname
        from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
        join pg_attribute a
          on a.attrelid=i.indrelid and a.attnum=k.attnum
        where k.attnum>0 and k.ord<=i.indnkeyatts
        order by k.ord
      )=r.key_columns
      and not exists (
        select 1
        from unnest(i.indoption::smallint[]) with ordinality o(bits,ord)
        where o.ord<=i.indnkeyatts
          and (
            (o.ord<i.indnkeyatts and o.bits<>0)
            or
            (o.ord=i.indnkeyatts and
              o.bits<>case when r.last_key_desc then 3 else 0 end)
          )
      )
      and not exists (
        select 1
        from unnest(i.indclass::oid[]) with ordinality oc(opclass_oid,ord)
        join pg_opclass opc on opc.oid=oc.opclass_oid
        where oc.ord<=i.indnkeyatts and not opc.opcdefault
      )
      and not exists (
        select 1
        from unnest(i.indkey::smallint[],i.indcollation::oid[])
          with ordinality k(attnum,collation_oid,ord)
        join pg_attribute a
          on a.attrelid=i.indrelid and a.attnum=k.attnum
        where k.ord<=i.indnkeyatts
          and k.collation_oid<>a.attcollation
      )
      and coalesce(
        regexp_replace(replace(lower(pg_get_expr(i.indpred,i.indrelid)),'::text',''),
          '[[:space:]()]','','g'),''
      )=coalesce(
        regexp_replace(replace(lower(r.predicate),'::text',''),
          '[[:space:]()]','','g'),''
      );

    if v_equivalent_names is not null then
      raise exception using
        errcode='55000',
        message='P10_FOUNDATION_EQUIVALENT_INDEX_NAME_CONFLICT',
        detail=format('%s alternate(s): %s',
          r.index_name,v_equivalent_names);
    end if;
  end loop;
end;
$p10_foundation_indexes$;

do $p10_backfill_readiness$
declare
  v_blockers bigint;
begin
  with normalized as (
    select c.id,c.tenant_id,c.phone,c.phone_normalized,
      case
        when x.compact_phone~'^05[0-9]{8}$'
          then '966'||substring(x.compact_phone from 2)
        when x.compact_phone~'^5[0-9]{8}$'
          then '966'||x.compact_phone
        when x.compact_phone~'^\+9665[0-9]{8}$'
          then substring(x.compact_phone from 2)
        when x.compact_phone~'^9665[0-9]{8}$'
          then x.compact_phone
        else null
      end derived_phone_normalized
    from public.customers c
    cross join lateral (
      select regexp_replace(
        translate(coalesce(c.phone,''),
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),
        '[\s\-\(\)]','','g'
      ) compact_phone
    )x
  ), duplicate_groups as (
    select tenant_id,derived_phone_normalized
    from normalized
    where tenant_id is not null and derived_phone_normalized is not null
    group by tenant_id,derived_phone_normalized
    having count(*)>1
  )
  select
    count(*) filter(where tenant_id is null)
    +count(*) filter(
      where nullif(btrim(coalesce(phone,'')),'') is not null
        and derived_phone_normalized is null
    )
    +count(*) filter(
      where phone_normalized is distinct from derived_phone_normalized
    )
    +(select count(*) from duplicate_groups)
    +(select count(*) from public.customers
      where record_version is null or record_version<1)
    +(select count(*) from public.inventory_stock
      where record_version is null or record_version<1)
  into v_blockers
  from normalized;

  if v_blockers<>0 then
    raise exception using
      errcode='55000',
      message='P10_PACKAGE_3R_READINESS_INCOMPLETE',
      detail=format('blocker_count=%s',v_blockers);
  end if;
end;
$p10_backfill_readiness$;
-- STOP A: review before Phase B.
begin;
-- PHASE B: NOLOGIN ROLES.
do $roles$
declare
  v_role text;
  v_row pg_roles%rowtype;
begin
  if not exists (select 1 from pg_roles where rolname='afex_core_owner') then
    create role afex_core_owner nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='afex_context_issuer') then
    create role afex_context_issuer nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='afex_outbox_worker') then
    create role afex_outbox_worker nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;

  foreach v_role in array array[
    'afex_core_owner','afex_context_issuer','afex_outbox_worker'
  ]
  loop
    select * into strict v_row from pg_roles where rolname=v_role;
    if v_row.rolcanlogin or v_row.rolsuper or v_row.rolcreatedb
       or v_row.rolcreaterole or v_row.rolinherit or v_row.rolreplication
       or v_row.rolbypassrls then
      raise exception using errcode='55000',
        message='DEDICATED_ROLE_UNSAFE',
        detail=v_role;
    end if;
  end loop;

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles member_role on member_role.oid=m.member
    join pg_roles granted_role on granted_role.oid=m.roleid
    where member_role.rolname in (
      'anon','authenticated','service_role',
      'afex_core_owner','afex_context_issuer','afex_outbox_worker'
    )
      and granted_role.rolname in (
        'afex_core_owner','afex_context_issuer','afex_outbox_worker'
      )
  ) then
    raise exception using errcode='55000',
      message='DEDICATED_ROLE_MEMBERSHIP_UNSAFE';
  end if;
end;
$roles$;
do $runtime_role$
declare
  v_role pg_roles%rowtype;
begin
  if not exists (select 1 from pg_roles where rolname='afex_core_runtime') then
    create role afex_core_runtime
      nologin nosuperuser nocreatedb nocreaterole noinherit
      noreplication nobypassrls;
  end if;

  select * into strict v_role
  from pg_roles where rolname='afex_core_runtime';
  if v_role.rolcanlogin or v_role.rolsuper or v_role.rolcreatedb
     or v_role.rolcreaterole or v_role.rolinherit or v_role.rolreplication
     or v_role.rolbypassrls then
    raise exception using errcode='55000',
      message='AFEX_CORE_RUNTIME_ROLE_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles member_role on member_role.oid=m.member
    join pg_roles granted_role on granted_role.oid=m.roleid
    where (
      member_role.rolname='afex_core_runtime'
      and granted_role.rolname in (
        'afex_core_owner','afex_context_issuer','afex_outbox_worker',
        'afex_core_activation_owner','afex_core_activation_operator'
      )
    ) or (
      granted_role.rolname='afex_core_runtime'
      and member_role.rolname in (
        'anon','authenticated','service_role','afex_outbox_worker',
        'afex_core_activation_owner','afex_core_activation_operator'
      )
    )
  ) then
    raise exception using errcode='55000',
      message='AFEX_CORE_RUNTIME_MEMBERSHIP_UNSAFE';
  end if;
end;
$runtime_role$;
do $package6a_roles$
declare
  v_name text;
  v_role pg_roles%rowtype;
begin
  if not exists (
    select 1 from pg_roles where rolname = 'afex_core_activation_owner'
  ) then
    create role afex_core_activation_owner
      nologin nosuperuser nocreatedb nocreaterole noinherit
      noreplication nobypassrls;
  end if;

  if not exists (
    select 1 from pg_roles where rolname = 'afex_core_activation_operator'
  ) then
    create role afex_core_activation_operator
      nologin nosuperuser nocreatedb nocreaterole noinherit
      noreplication nobypassrls;
  end if;

  foreach v_name in array array[
    'afex_core_activation_owner',
    'afex_core_activation_operator'
  ]
  loop
    select * into strict v_role from pg_roles where rolname = v_name;
    if v_role.rolcanlogin
       or v_role.rolsuper
       or v_role.rolcreatedb
       or v_role.rolcreaterole
       or v_role.rolinherit
       or v_role.rolreplication
       or v_role.rolbypassrls then
      raise exception using
        errcode = '55000',
        message = 'PACKAGE6A_ROLE_UNSAFE',
        detail = v_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles member_role on member_role.oid = m.member
    join pg_roles granted_role on granted_role.oid = m.roleid
    where (
      granted_role.rolname in (
        'afex_core_activation_owner',
        'afex_core_activation_operator'
      )
      and member_role.rolname in (
        'anon','authenticated','service_role','afex_core_runtime',
        'afex_outbox_worker','afex_context_issuer'
      )
    )
    or (
      member_role.rolname in (
        'afex_core_activation_owner',
        'afex_core_activation_operator'
      )
      and granted_role.rolname in (
        'afex_core_owner','afex_context_issuer','afex_core_runtime',
        'afex_outbox_worker'
      )
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6A_ROLE_MEMBERSHIP_UNSAFE';
  end if;
end;
$package6a_roles$;
commit;
-- STOP B: verify safe attributes and zero memberships.
begin;
-- PHASE C: FAIL-CLOSED METADATA TABLES.
create table public.core_v2_activation_control (
  singleton_id boolean
    primary key
    default true
    constraint ck_core_v2_activation_control_singleton check (singleton_id),
  global_enabled boolean not null default false,
  kill_switch boolean not null default true,
  pos_enabled boolean not null default false,
  admin_orders_enabled boolean not null default false,
  quote_issuer_enabled boolean not null default false,
  outbox_worker_enabled boolean not null default false,
  deterministic_canary_percentage integer not null default 0,
  canary_algorithm_version text not null default 'sha256-mod100-v1',
  canary_seed text not null default 'UNCONFIGURED',
  activation_version text not null default 'core-v2-i5.9-disabled',
  environment text not null default 'production',
  current_change_ticket text,
  activated_at timestamptz,
  activated_by uuid,
  deactivated_at timestamptz not null default clock_timestamp(),
  deactivated_by uuid,
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint ck_core_v2_activation_control_percentage
    check (deterministic_canary_percentage between 0 and 100),
  constraint ck_core_v2_activation_control_algorithm
    check (canary_algorithm_version = 'sha256-mod100-v1'),
  constraint ck_core_v2_activation_control_environment
    check (environment in ('development','staging','production')),
  constraint ck_core_v2_activation_control_seed
    check (length(canary_seed) between 8 and 128),
  constraint ck_core_v2_activation_control_version
    check (
      length(btrim(activation_version)) between 1 and 128
      and record_version > 0
    ),
  constraint ck_core_v2_activation_control_ticket
    check (
      current_change_ticket is null
      or length(btrim(current_change_ticket)) between 3 and 128
    ),
  constraint ck_core_v2_activation_control_global_safety
    check (not global_enabled or not kill_switch),
  constraint ck_core_v2_activation_control_disabled_consistency
    check (
      global_enabled
      or (
        not pos_enabled
        and not admin_orders_enabled
        and not quote_issuer_enabled
        and not outbox_worker_enabled
        and deterministic_canary_percentage = 0
      )
    ),
  constraint ck_core_v2_activation_control_activation_evidence
    check (
      (
        global_enabled
        and activated_at is not null
        and activated_by is not null
        and current_change_ticket is not null
      )
      or not global_enabled
    ),
  constraint fk_core_v2_activation_control_activated_by
    foreign key (activated_by) references public.profiles(id)
    on update no action on delete no action,
  constraint fk_core_v2_activation_control_deactivated_by
    foreign key (deactivated_by) references public.profiles(id)
    on update no action on delete no action
);

create table public.core_v2_tenant_activation (
  tenant_id uuid primary key,
  enabled boolean not null default false,
  canary_eligible boolean not null default false,
  pos_enabled boolean not null default false,
  admin_orders_enabled boolean not null default false,
  quote_enabled boolean not null default false,
  activation_version text not null,
  change_ticket text not null,
  approved_by uuid not null,
  approved_at timestamptz not null,
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint ck_core_v2_tenant_activation_text
    check (
      length(btrim(activation_version)) between 1 and 128
      and length(btrim(change_ticket)) between 3 and 128
      and record_version > 0
    ),
  constraint ck_core_v2_tenant_activation_features
    check (
      enabled
      or (
        not canary_eligible
        and not pos_enabled
        and not admin_orders_enabled
        and not quote_enabled
      )
    ),
  constraint ck_core_v2_tenant_activation_disabled
    check (
      (enabled and disabled_at is null and disabled_reason is null)
      or
      (
        not enabled
        and disabled_at is not null
        and disabled_reason is not null
        and length(btrim(disabled_reason)) between 3 and 500
      )
    ),
  constraint fk_core_v2_tenant_activation_tenant
    foreign key (tenant_id) references public.tenants(id)
    on update no action on delete no action,
  constraint fk_core_v2_tenant_activation_approved_by
    foreign key (tenant_id, approved_by)
    references public.profiles(tenant_id, id)
    on update no action on delete no action
);

create table public.core_v2_branch_activation (
  tenant_id uuid not null,
  branch_id uuid not null,
  enabled boolean not null default false,
  canary_eligible boolean not null default false,
  pos_enabled boolean not null default false,
  admin_orders_enabled boolean not null default false,
  quote_enabled boolean not null default false,
  activation_version text not null,
  change_ticket text not null,
  approved_by uuid not null,
  approved_at timestamptz not null,
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint pk_core_v2_branch_activation primary key (tenant_id, branch_id),
  constraint ck_core_v2_branch_activation_text
    check (
      length(btrim(activation_version)) between 1 and 128
      and length(btrim(change_ticket)) between 3 and 128
      and record_version > 0
    ),
  constraint ck_core_v2_branch_activation_features
    check (
      enabled
      or (
        not canary_eligible
        and not pos_enabled
        and not admin_orders_enabled
        and not quote_enabled
      )
    ),
  constraint ck_core_v2_branch_activation_disabled
    check (
      (enabled and disabled_at is null and disabled_reason is null)
      or
      (
        not enabled
        and disabled_at is not null
        and disabled_reason is not null
        and length(btrim(disabled_reason)) between 3 and 500
      )
    ),
  constraint fk_core_v2_branch_activation_tenant_activation
    foreign key (tenant_id)
    references public.core_v2_tenant_activation(tenant_id)
    on update no action on delete no action,
  constraint fk_core_v2_branch_activation_branch_scope
    foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id)
    on update no action on delete no action,
  constraint fk_core_v2_branch_activation_approved_by
    foreign key (tenant_id, approved_by)
    references public.profiles(tenant_id, id)
    on update no action on delete no action
);

create index idx_core_v2_tenant_activation_enabled
  on public.core_v2_tenant_activation (enabled, tenant_id);
create index idx_core_v2_branch_activation_enabled
  on public.core_v2_branch_activation (enabled, tenant_id, branch_id);

-- The only seed is explicitly disabled and fail-closed.
insert into public.core_v2_activation_control (
  singleton_id,
  global_enabled,
  kill_switch,
  pos_enabled,
  admin_orders_enabled,
  quote_issuer_enabled,
  outbox_worker_enabled,
  deterministic_canary_percentage,
  canary_algorithm_version,
  canary_seed,
  activation_version,
  environment,
  current_change_ticket
) values (
  true,
  false,
  true,
  false,
  false,
  false,
  false,
  0,
  'sha256-mod100-v1',
  'UNCONFIGURED',
  'core-v2-i5.9-disabled',
  'production',
  null
);

-- ===========================================================================
-- D. IMMUTABLE PACKAGE 7 EVIDENCE
-- ===========================================================================

create table public.core_v2_verification_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  package_version text not null,
  environment text not null,
  tenant_id uuid,
  branch_id uuid,
  test_suite_identifier text not null,
  test_run_identifier text not null,
  artifact_hash text not null,
  result text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null,
  change_ticket text not null,
  result_summary text not null,
  supersedes_evidence_id uuid,
  constraint uq_core_v2_verification_evidence_run
    unique (
      package_version,
      environment,
      test_suite_identifier,
      test_run_identifier
    ),
  constraint ck_core_v2_verification_evidence_environment
    check (environment in ('development','staging','production')),
  constraint ck_core_v2_verification_evidence_result
    check (result in ('PASS','FAIL')),
  constraint ck_core_v2_verification_evidence_hash
    check (artifact_hash ~ '^[0-9a-f]{64}$'),
  constraint ck_core_v2_verification_evidence_text
    check (
      length(btrim(package_version)) between 1 and 128
      and length(btrim(test_suite_identifier)) between 1 and 128
      and length(btrim(test_run_identifier)) between 1 and 128
      and length(btrim(change_ticket)) between 3 and 128
      and length(btrim(result_summary)) between 1 and 1000
    ),
  constraint ck_core_v2_verification_evidence_time
    check (
      completed_at >= started_at
      and recorded_at >= started_at
    ),
  constraint ck_core_v2_verification_evidence_scope
    check (branch_id is null or tenant_id is not null),
  constraint fk_core_v2_verification_evidence_tenant
    foreign key (tenant_id) references public.tenants(id)
    on update no action on delete no action,
  constraint fk_core_v2_verification_evidence_branch_scope
    foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id)
    on update no action on delete no action,
  constraint fk_core_v2_verification_evidence_recorded_by
    foreign key (recorded_by) references public.profiles(id)
    on update no action on delete no action,
  constraint fk_core_v2_verification_evidence_supersedes
    foreign key (supersedes_evidence_id)
    references public.core_v2_verification_evidence(evidence_id)
    on update no action on delete no action
);

create index idx_core_v2_evidence_readiness
  on public.core_v2_verification_evidence (
    package_version,
    environment,
    test_suite_identifier,
    result,
    tenant_id,
    branch_id,
    completed_at desc
  );

-- ===========================================================================
-- E. MANAGED IDENTITY REGISTRATION METADATA (NO CREDENTIALS)
-- ===========================================================================

create table public.core_v2_managed_identities (
  identity_id uuid primary key default gen_random_uuid(),
  database_role_name name not null,
  identity_kind text not null,
  purpose text not null,
  active boolean not null default false,
  owner_team text not null,
  environment text not null,
  approved_at timestamptz,
  approved_by uuid,
  approval_change_ticket text,
  last_verified_at timestamptz,
  expected_membership_role name not null,
  secret_reference_label text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint uq_core_v2_managed_identity
    unique (environment, database_role_name),
  constraint ck_core_v2_managed_identity_kind
    check (identity_kind in ('runtime','outbox_worker','operator')),
  constraint ck_core_v2_managed_identity_environment
    check (environment in ('development','staging','production')),
  constraint ck_core_v2_managed_identity_role_exclusions
    check (
      database_role_name::text not in (
        'PUBLIC','anon','authenticated','service_role',
        'afex_core_owner','afex_context_issuer','afex_core_runtime',
        'afex_outbox_worker','afex_core_activation_owner',
        'afex_core_activation_operator'
      )
    ),
  constraint ck_core_v2_managed_identity_expected_membership
    check (
      (identity_kind = 'runtime'
        and expected_membership_role = 'afex_core_runtime'::name)
      or
      (identity_kind = 'outbox_worker'
        and expected_membership_role = 'afex_outbox_worker'::name)
      or
      (identity_kind = 'operator'
        and expected_membership_role = 'afex_core_activation_operator'::name)
    ),
  constraint ck_core_v2_managed_identity_text
    check (
      length(btrim(purpose)) between 3 and 500
      and length(btrim(owner_team)) between 2 and 128
      and length(btrim(secret_reference_label)) between 3 and 256
      and secret_reference_label !~* '(password|token|secret)\\s*='
      and record_version > 0
    ),
  constraint ck_core_v2_managed_identity_approval
    check (
      (
        active
        and approved_at is not null
        and approved_by is not null
        and approval_change_ticket is not null
        and length(btrim(approval_change_ticket)) between 3 and 128
        and last_verified_at is not null
      )
      or not active
    ),
  constraint fk_core_v2_managed_identity_approved_by
    foreign key (approved_by) references public.profiles(id)
    on update no action on delete no action
);

create index idx_core_v2_managed_identity_active
  on public.core_v2_managed_identities (
    environment, identity_kind, active
  );

-- ===========================================================================
-- F. ISSUER RATE-LIMIT CONFIGURATION AND WINDOW EVIDENCE
-- ===========================================================================

create table public.core_v2_issuer_rate_limit_config (
  issuer_kind text primary key,
  enabled boolean not null default true,
  window_seconds integer not null,
  maximum_attempts integer not null,
  retention_seconds integer not null,
  configuration_version text not null,
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint ck_core_v2_issuer_rate_limit_kind
    check (issuer_kind in ('authenticated_context','pos_pin_context')),
  constraint ck_core_v2_issuer_rate_limit_bounds
    check (
      window_seconds between 10 and 3600
      and maximum_attempts between 1 and 100
      and retention_seconds between window_seconds and 2592000
      and record_version > 0
      and length(btrim(configuration_version)) between 1 and 128
    )
);

create table public.core_v2_issuer_rate_limit_windows (
  issuer_kind text not null,
  authenticated_user_id uuid not null,
  tenant_id uuid not null,
  branch_id uuid not null,
  subject_scope_hash text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0,
  successful_attempt_count integer not null default 0,
  failed_attempt_count integer not null default 0,
  last_attempt_at timestamptz not null,
  expires_at timestamptz not null,
  constraint pk_core_v2_issuer_rate_limit_windows primary key (
    issuer_kind,
    authenticated_user_id,
    tenant_id,
    branch_id,
    subject_scope_hash,
    window_started_at
  ),
  constraint ck_core_v2_issuer_rate_limit_window_kind
    check (issuer_kind in ('authenticated_context','pos_pin_context')),
  constraint ck_core_v2_issuer_rate_limit_scope_hash
    check (subject_scope_hash ~ '^[0-9a-f]{64}$'),
  constraint ck_core_v2_issuer_rate_limit_counts
    check (
      attempt_count > 0
      and successful_attempt_count >= 0
      and failed_attempt_count >= 0
      and successful_attempt_count + failed_attempt_count = attempt_count
    ),
  constraint ck_core_v2_issuer_rate_limit_times
    check (
      last_attempt_at >= window_started_at
      and expires_at > window_started_at
    ),
  constraint fk_core_v2_issuer_rate_limit_config
    foreign key (issuer_kind)
    references public.core_v2_issuer_rate_limit_config(issuer_kind)
    on update no action on delete no action,
  constraint fk_core_v2_issuer_rate_limit_profile_scope
    foreign key (tenant_id, authenticated_user_id)
    references public.profiles(tenant_id, id)
    on update no action on delete no action,
  constraint fk_core_v2_issuer_rate_limit_branch_scope
    foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id)
    on update no action on delete no action
);

create index idx_core_v2_issuer_rate_limit_expiry
  on public.core_v2_issuer_rate_limit_windows (expires_at);

insert into public.core_v2_issuer_rate_limit_config (
  issuer_kind,
  enabled,
  window_seconds,
  maximum_attempts,
  retention_seconds,
  configuration_version
) values
  ('authenticated_context', true, 300, 30, 604800, 'issuer-rate-limit-v1'),
  ('pos_pin_context', true, 300, 10, 604800, 'issuer-rate-limit-v1');
commit;
-- STOP C: verify disabled seed/configuration-only rows.
begin;
-- PHASES D-I: FINAL FUNCTION BODIES; DO NOT INVOKE.
create function public.resolve_atomic_authorization_v2(
  p_claimed_authorization jsonb,
  p_command jsonb
)
returns table (
  actor_user_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text,
  employee_id uuid,
  authorization_source text,
  authorization_context_id uuid,
  correlation_id uuid
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_auth_user_id uuid;
  v_profile public.profiles%rowtype;
  v_requested_branch_id uuid;
  v_claimed_employee_id uuid;
  v_claimed_correlation_id uuid;
  v_unknown_key text;
begin
  if p_claimed_authorization is null
     or jsonb_typeof(p_claimed_authorization) <> 'object' then
    raise exception using errcode = '22023', message = 'AUTH_CONTEXT_REQUIRED';
  end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;

  select k.key into v_unknown_key
  from jsonb_object_keys(p_claimed_authorization) as k(key)
  where k.key <> all(array[
    'user_id','tenant_id','branch_id','employee_id','role','correlation_id'
  ])
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023', message = 'AUTH_CONTEXT_INVALID';
  end if;

  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception using errcode = '28000',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id = v_auth_user_id
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'TENANT_NOT_AUTHORIZED';
  end if;
  if not v_profile.is_active then
    raise exception using errcode = '42501', message = 'ACTOR_NOT_ACTIVE';
  end if;
  if v_profile.tenant_id is null then
    raise exception using errcode = '42501', message = 'TENANT_NOT_AUTHORIZED';
  end if;
  if not exists (
    select 1 from public.tenants t where t.id = v_profile.tenant_id
  ) then
    raise exception using errcode = '42501', message = 'TENANT_NOT_ACTIVE';
  end if;
  if v_profile.role <> all(array[
    'owner','admin','manager','employee','cashier'
  ]) then
    raise exception using errcode = '42501', message = 'ORDER_CREATE_FORBIDDEN';
  end if;

  if coalesce(p_command->>'branch_id','') !~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023', message = 'AUTH_CONTEXT_INVALID';
  end if;
  v_requested_branch_id := (p_command->>'branch_id')::uuid;

  if not exists (
    select 1
    from public.branches b
    where b.id = v_requested_branch_id
      and b.tenant_id = v_profile.tenant_id
  ) then
    raise exception using errcode = '42501', message = 'BRANCH_NOT_AUTHORIZED';
  end if;
  if not exists (
    select 1
    from public.branches b
    where b.id = v_requested_branch_id
      and b.tenant_id = v_profile.tenant_id
      and b.is_active
  ) then
    raise exception using errcode = '42501', message = 'BRANCH_NOT_ACTIVE';
  end if;
  if v_profile.role = any(array['employee','cashier'])
     and v_profile.branch_id is distinct from v_requested_branch_id then
    raise exception using errcode = '42501', message = 'BRANCH_NOT_AUTHORIZED';
  end if;

  if nullif(p_claimed_authorization->>'user_id','') is not null then
    if (p_claimed_authorization->>'user_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or (p_claimed_authorization->>'user_id')::uuid <> v_auth_user_id then
      raise exception using errcode = '42501', message = 'AUTH_CONTEXT_MISMATCH';
    end if;
  end if;
  if nullif(p_claimed_authorization->>'tenant_id','') is not null then
    if (p_claimed_authorization->>'tenant_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or (p_claimed_authorization->>'tenant_id')::uuid <> v_profile.tenant_id then
      raise exception using errcode = '42501', message = 'AUTH_CONTEXT_MISMATCH';
    end if;
  end if;
  if nullif(p_claimed_authorization->>'branch_id','') is not null then
    if (p_claimed_authorization->>'branch_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or (p_claimed_authorization->>'branch_id')::uuid
          <> v_requested_branch_id then
      raise exception using errcode = '42501', message = 'AUTH_CONTEXT_MISMATCH';
    end if;
  end if;
  if nullif(p_claimed_authorization->>'role','') is not null
     and p_claimed_authorization->>'role' <> v_profile.role then
    raise exception using errcode = '42501', message = 'AUTH_CONTEXT_MISMATCH';
  end if;

  /*
  No database-backed POS session currently binds a pos_profiles row to
  auth.uid(). Only an authenticated employee/cashier profile may be represented
  as the employee, and only by its own authenticated profile ID.
  */
  if nullif(p_claimed_authorization->>'employee_id','') is not null then
    if (p_claimed_authorization->>'employee_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'AUTH_CONTEXT_INVALID';
    end if;
    v_claimed_employee_id := (p_claimed_authorization->>'employee_id')::uuid;
    if v_profile.role <> all(array['employee','cashier'])
       or v_claimed_employee_id <> v_auth_user_id then
      raise exception using errcode = '42501',
        message = 'EMPLOYEE_NOT_AUTHORIZED';
    end if;
  elsif v_profile.role = any(array['employee','cashier']) then
    v_claimed_employee_id := v_auth_user_id;
  end if;

  if nullif(p_command->>'correlation_id','') is not null then
    if (p_command->>'correlation_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'CORRELATION_ID_INVALID';
    end if;
  end if;

  if nullif(p_claimed_authorization->>'correlation_id','') is not null
     and (p_claimed_authorization->>'correlation_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023',
      message = 'CORRELATION_ID_INVALID';
  end if;
  /*
  Claimed correlation values are transition-only input and never establish
  committed evidence identity. PostgreSQL owns the transaction correlation ID.
  */
  v_claimed_correlation_id := pg_catalog.gen_random_uuid();

  return query select
    v_auth_user_id,
    v_profile.tenant_id,
    v_requested_branch_id,
    v_profile.role,
    v_claimed_employee_id,
    'auth.uid+profiles+branches'::text,
    null::uuid,
    v_claimed_correlation_id;
end;
$function$;
create function public.normalize_customer_phone_v2(p_phone text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
declare
  v_phone text;
begin
  v_phone := translate(
    btrim(p_phone),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    '01234567890123456789'
  );
  if v_phone !~ '^[+0-9 ()-]+$' then
    return null;
  end if;
  v_phone := regexp_replace(v_phone, '[ ()-]', '', 'g');
  if v_phone ~ '^05[0-9]{8}$' then
    return '966' || substr(v_phone, 2);
  elsif v_phone ~ '^5[0-9]{8}$' then
    return '966' || v_phone;
  elsif v_phone ~ '^\+9665[0-9]{8}$' then
    return substr(v_phone, 2);
  elsif v_phone ~ '^9665[0-9]{8}$' then
    return v_phone;
  end if;
  return null;
end;
$function$;
create function public.resolve_customer_identity_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_actor_user_id uuid,
  p_customer jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_customer_id uuid;
  v_requested_id uuid;
  v_phone text;
  v_phone_normalized text;
  v_name text;
  v_email text;
  v_notes text;
  v_intent text;
  v_expected_version bigint;
  v_match_ids uuid[];
  v_constraint_name text;
begin
  if p_tenant_id is null or p_branch_id is null then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_SCOPE_INVALID';
  end if;
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_customer) as k(key)
    where k.key <> all(array[
      'intent','id','record_version','name','phone','email','notes'
    ])
  ) then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_COMMAND_INVALID';
  end if;

  v_intent := nullif(btrim(p_customer->>'intent'),'');
  if v_intent is null or v_intent = 'no_customer'
     or v_intent <> all(array[
       'reuse_existing','create_new','update_existing'
     ]) then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_INTENT_INVALID';
  end if;

  if nullif(p_customer->>'id','') is not null then
    if (p_customer->>'id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023',
        message = 'CUSTOMER_COMMAND_INVALID';
    end if;
    v_requested_id := (p_customer->>'id')::uuid;
  end if;
  v_phone := nullif(btrim(p_customer->>'phone'), '');
  v_phone_normalized := public.normalize_customer_phone_v2(v_phone);
  v_name := nullif(btrim(p_customer->>'name'), '');
  v_email := nullif(btrim(p_customer->>'email'),'');
  v_notes := nullif(btrim(p_customer->>'notes'),'');
  if nullif(p_customer->>'record_version','') is not null then
    if (p_customer->>'record_version') !~ '^[1-9][0-9]{0,18}$' then
      raise exception using errcode = '22023',
        message = 'CUSTOMER_COMMAND_INVALID';
    end if;
    v_expected_version := (p_customer->>'record_version')::bigint;
  end if;

  if v_phone_normalized is null then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_PHONE_INVALID';
  end if;
  if v_name is not null and length(v_name) > 200
     or v_phone is not null and length(v_phone) > 32
     or v_email is not null and length(v_email) > 320
     or v_notes is not null and length(v_notes) > 2000 then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_COMMAND_INVALID';
  end if;

  select array_agg(c.id order by c.id)
    into v_match_ids
  from public.customers c
  where c.tenant_id = p_tenant_id
    and c.phone_normalized = v_phone_normalized;
  if coalesce(array_length(v_match_ids,1),0) > 1 then
    raise exception using errcode = '23505',
      message = 'CUSTOMER_DUPLICATE_IDENTITY';
  end if;
  v_customer_id := v_match_ids[1];

  if v_intent = 'reuse_existing' then
    if v_customer_id is null then
      raise exception using errcode = 'P0002',
        message = 'CUSTOMER_NOT_FOUND';
    end if;
    if v_requested_id is not null and v_requested_id <> v_customer_id then
      raise exception using errcode = '23505',
        message = 'CUSTOMER_IDENTITY_CONFLICT';
    end if;
    select c.id into v_customer_id
    from public.customers c
    where c.id = v_customer_id
      and c.tenant_id = p_tenant_id
      and (v_expected_version is null or c.record_version = v_expected_version)
    for update;
    if not found then
      raise exception using errcode = '40001',
        message = 'CUSTOMER_VERSION_CONFLICT';
    end if;
    return v_customer_id;
  end if;

  if v_intent = 'update_existing' then
    if v_requested_id is null or v_expected_version is null then
      raise exception using errcode = '22023',
        message = 'CUSTOMER_COMMAND_INVALID';
    end if;
    select c.id into v_customer_id
    from public.customers c
    where c.id = v_requested_id
      and c.tenant_id = p_tenant_id
      and c.record_version = v_expected_version
    for update;
    if not found then
      raise exception using errcode = '40001',
        message = 'CUSTOMER_VERSION_CONFLICT';
    end if;
    if exists (
      select 1
      from public.customers c
      where c.tenant_id = p_tenant_id
        and c.phone_normalized = v_phone_normalized
        and c.id <> v_requested_id
    ) then
      raise exception using errcode = '23505',
        message = 'CUSTOMER_IDENTITY_CONFLICT';
    end if;
    if v_name is null then
      raise exception using errcode = '22023',
        message = 'CUSTOMER_NAME_REQUIRED';
    end if;
    begin
      update public.customers
      set name = v_name,
          phone = v_phone,
          phone_normalized = v_phone_normalized,
          email = v_email,
          notes = v_notes,
          record_version = record_version + 1
      where id = v_requested_id
        and tenant_id = p_tenant_id
        and record_version = v_expected_version
      returning id into v_customer_id;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint_name = constraint_name;
        if v_constraint_name = any(array[
          'uq_customers_tenant_phone_normalized','customers_phone_key'
        ]) then
          raise exception using errcode = '23505',
            message = 'CUSTOMER_IDENTITY_CONFLICT';
        end if;
        raise;
    end;
    if not found then
      raise exception using errcode = '40001',
        message = 'CUSTOMER_VERSION_CONFLICT';
    end if;
    return v_customer_id;
  end if;

  if v_requested_id is not null or v_expected_version is not null then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_COMMAND_INVALID';
  end if;
  if v_customer_id is not null then
    raise exception using errcode = '23505',
      message = 'CUSTOMER_IDENTITY_CONFLICT';
  end if;
  if v_name is null then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_NAME_REQUIRED';
  end if;

  begin
    insert into public.customers (
      name, phone, phone_normalized, notes, email, created_by,
      branch_id, tenant_id, record_version
    )
    values (
      v_name, v_phone, v_phone_normalized, v_notes, v_email, p_actor_user_id,
      p_branch_id, p_tenant_id, 1
    )
    returning id into v_customer_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = any(array[
        'uq_customers_tenant_phone_normalized','customers_phone_key'
      ]) then
        raise exception using errcode = '23505',
          message = 'CUSTOMER_IDENTITY_CONFLICT';
      end if;
      raise;
  end;
  return v_customer_id;
end;
$function$;
create function public.resolve_customer_identity_result_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_actor_user_id uuid,
  p_customer_intent jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_customer_id uuid;
  v_intent text;
begin
  if p_customer_intent is null
     or jsonb_typeof(p_customer_intent) <> 'object' then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_COMMAND_INVALID';
  end if;
  v_intent := p_customer_intent->>'intent';
  v_customer_id := public.resolve_customer_identity_v2(
    p_tenant_id,p_branch_id,p_actor_user_id,p_customer_intent
  );
  return jsonb_build_object(
    'customer_id',v_customer_id,
    'customer_was_created',v_intent = 'create_new',
    'customer_was_updated',v_intent = 'update_existing'
  );
end;
$function$;

/*
The request fingerprint is database-authoritative. The caller's fingerprint
field remains accepted for transition compatibility but never establishes
idempotency identity. PostgreSQL jsonb text serialization is deliberately an
internal-only contract: object keys are canonicalized by jsonb, array order is
preserved, numerics use PostgreSQL jsonb representation and JSON null remains
JSON null. Quote creation must use this same database helper/contract.
*/
create function public.build_atomic_request_fingerprint_v2(
  p_command jsonb,
  p_financial_intent jsonb
)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $function$
  select encode(
    extensions.digest(
      jsonb_build_object(
        'fingerprint_version','atomic-request-fingerprint-v2',
        'command_type',p_command->>'command_type',
        'branch_id',p_command->>'branch_id',
        'customer',p_command->'customer',
        'note',case
          when nullif(btrim(p_command->>'note'),'') is null then null
          else btrim(p_command->>'note')
        end,
        'financial_intent',p_financial_intent
      )::text,
      'sha256'
    ),
    'hex'
  );
$function$;
create function public.acquire_idempotency_command_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_command_type text,
  p_key_hash text,
  p_request_fingerprint text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_engine_version text,
  p_correlation_id uuid
)
returns public.idempotency_commands
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_command public.idempotency_commands%rowtype;
  v_inserted_id uuid;
  v_new_lease_owner uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_actor_type text :=
    case when p_actor_employee_id is null then 'user' else 'pos_employee' end;
  v_actor_id uuid := coalesce(p_actor_employee_id,p_actor_user_id);
begin
  if p_tenant_id is null or p_branch_id is null or p_actor_user_id is null
     or p_correlation_id is null or p_command_type <> 'create_order'
     or p_engine_version <> 'atomic-order-v2-r1' then
    raise exception using errcode = '22023',
      message = 'AUTH_CONTEXT_INVALID';
  end if;
  if p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'IDEMPOTENCY_KEY_INVALID';
  end if;
  if p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'REQUEST_FINGERPRINT_INVALID';
  end if;

  insert into public.idempotency_commands (
    tenant_id, branch_id, command_type, key_hash,
    request_fingerprint, fingerprint_version, state, engine_version,
    actor_type, actor_id, correlation_id, lease_owner, lease_expires_at
  )
  values (
    p_tenant_id, p_branch_id, p_command_type, p_key_hash,
    p_request_fingerprint, 'atomic-request-fingerprint-v2',
    'started', p_engine_version,
    v_actor_type, v_actor_id, p_correlation_id::text,
    v_new_lease_owner::text, v_now + interval '5 minutes'
  )
  on conflict (tenant_id, branch_id, command_type, key_hash)
  do nothing
  returning id into v_inserted_id;

  select * into v_command
  from public.idempotency_commands
  where tenant_id = p_tenant_id
    and branch_id = p_branch_id
    and command_type = p_command_type
    and key_hash = p_key_hash
  for update;

  if not found then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_LEASE_CONFLICT';
  end if;
  if v_command.request_fingerprint <> p_request_fingerprint then
    raise exception using errcode = '23505',
      message = 'IDEMPOTENCY_FINGERPRINT_CONFLICT';
  end if;
  if v_command.engine_version <> p_engine_version then
    raise exception using errcode = '23505',
      message = 'IDEMPOTENCY_ENGINE_CONFLICT';
  end if;
  if v_command.actor_id is distinct from v_actor_id
     or v_command.actor_type is distinct from v_actor_type then
    raise exception using errcode = '42501',
      message = 'IDEMPOTENCY_ACTOR_CONFLICT';
  end if;

  if v_command.state = 'committed' then
    return v_command;
  end if;
  if v_inserted_id is not null then
    return v_command;
  end if;
  if v_command.state = 'failed_terminal' then
    raise exception using errcode = 'P0001',
      message = 'IDEMPOTENCY_TERMINAL_FAILURE';
  end if;
  if v_command.state = 'started'
     and v_command.lease_expires_at > v_now then
    raise exception using errcode = '55P03',
      message = 'IDEMPOTENCY_IN_PROGRESS';
  end if;
  if v_command.state = 'started'
     and (v_command.order_id is not null or v_command.invoice_id is not null) then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_RECOVERY_FORBIDDEN';
  end if;
  if v_command.state <> all(array[
    'started','failed_retryable','expired'
  ]) then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_RECOVERY_FORBIDDEN';
  end if;

  /*
  Release 1 uses Model A: acquisition and sale share one transaction. A later
  failure rolls back this lease transition. Retry/recovery fields only govern
  pre-existing non-committed rows; PostgreSQL autonomous transactions are not
  implied.
  */
  if v_command.state = 'started'
     and v_command.lease_expires_at <= v_now then
    update public.idempotency_commands
    set state = 'expired',
        expires_at = v_now,
        lease_owner = null,
        lease_expires_at = null,
        updated_at = v_now
    where id = v_command.id
      and state = 'started'
      and lease_expires_at <= v_now;
    if not found then
      raise exception using errcode = '40001',
        message = 'IDEMPOTENCY_LEASE_CONFLICT';
    end if;
    v_command.state := 'expired';
  end if;

  update public.idempotency_commands
  set state = 'started',
      correlation_id = p_correlation_id::text,
      lease_owner = v_new_lease_owner::text,
      lease_expires_at = v_now + interval '5 minutes',
      retry_count = retry_count + 1,
      recovery_started_at = v_now,
      recovery_completed_at = null,
      updated_at = v_now,
      failed_at = null,
      last_error_code = null
  where id = v_command.id
    and state <> 'committed'
  returning * into v_command;
  if not found then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_LEASE_CONFLICT';
  end if;
  return v_command;
end;
$function$;

/*
The same immutable response builder is used for first success and replay.
It reads only committed order/invoice columns and excludes mutable status,
customer/catalog lookups, timestamps and outbox delivery state.
*/
create function public.build_atomic_order_response_v1(
  p_order_id uuid,
  p_invoice_id uuid
)
returns jsonb
language plpgsql
stable
parallel safe
security definer
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'order_id',o.id,
    'order_number',o.order_number,
    'invoice_id',i.id,
    'invoice_number',i.invoice_number,
    'customer_id',o.customer_id,
    'total',i.total,
    'currency',i.currency_code,
    'response_version','atomic-order-response-v1'
  )
  into v_result
  from public.orders o
  join public.invoices i
    on i.id = p_invoice_id
   and i.order_id = o.id
   and i.tenant_id = o.tenant_id
   and i.branch_id = o.branch_id
  where o.id = p_order_id;

  if v_result is null then
    raise exception using errcode = 'P0001',
      message = 'IDEMPOTENCY_REPLAY_INVALID';
  end if;
  return v_result;
end;
$function$;
create function public.allocate_branch_monthly_number_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_period_start date
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_prefix text;
  v_stored integer;
  v_next integer;
begin
  if p_tenant_id is null or p_branch_id is null or p_period_start is null
     or p_period_start <> date_trunc('month',p_period_start)::date then
    raise exception using errcode = '22023',
      message = 'NUMBER_SCOPE_INVALID';
  end if;
  select b.order_number_prefix into v_prefix
  from public.branches b
  where b.id = p_branch_id
    and b.tenant_id = p_tenant_id
    and b.is_active
  for share;
  if not found then
    raise exception using errcode = '42501',
      message = 'NUMBER_SCOPE_INVALID';
  end if;
  if v_prefix is null or v_prefix !~ '^[0-9]{2}$' then
    raise exception using errcode = '22023',
      message = 'NUMBER_PREFIX_INVALID';
  end if;

  /*
  last_sequence means the last value already allocated. The first monthly row
  starts at zero; after the explicit row lock, the first allocation becomes 1.
  The primary key makes concurrent first-row insertion safe.
  */
  insert into public.order_number_sequences (
    tenant_id, branch_id, sequence_month, last_sequence
  )
  values (p_tenant_id, p_branch_id, p_period_start, 0)
  on conflict (tenant_id, branch_id, sequence_month) do nothing;

  select s.last_sequence into v_stored
  from public.order_number_sequences s
  where s.tenant_id = p_tenant_id
    and s.branch_id = p_branch_id
    and s.sequence_month = p_period_start
  for update;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'NUMBER_ALLOCATION_FAILED';
  end if;
  if v_stored < 0 or v_stored = 2147483647 then
    raise exception using errcode = '22003',
      message = 'NUMBER_SEQUENCE_INVALID';
  end if;

  update public.order_number_sequences
  set last_sequence = v_stored + 1,
      updated_at = clock_timestamp()
  where tenant_id = p_tenant_id
    and branch_id = p_branch_id
    and sequence_month = p_period_start
    and last_sequence = v_stored
  returning last_sequence into v_next;
  if not found or v_next <> v_stored + 1 then
    raise exception using errcode = 'P0001',
      message = 'NUMBER_ALLOCATION_FAILED';
  end if;
  return v_prefix || '-' || case
    when length(v_next::text) >= 4 then v_next::text
    else lpad(v_next::text, 4, '0')
  end;
end;
$function$;

/*
Package 6 activation must disable the two legacy triggers that independently
allocate numbers or deduct stock. Package 4 fails closed while either trigger
is enabled; it never silently runs both engines.
*/
create function public.assert_atomic_legacy_triggers_safe_v2()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_inventory_trigger_source text;
  v_number_trigger_source text;
begin
  select lower(p.prosrc) into v_inventory_trigger_source
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.invoice_items'::regclass
    and t.tgname = 'trg_deduct_inventory_on_invoice_item_insert'
    and not t.tgisinternal
    and t.tgenabled <> 'D';
  if found and (
    v_inventory_trigger_source not like
      '%v_engine = ''atomic-order-v2-r1''%'
    or v_inventory_trigger_source not like
      '%if v_engine = ''atomic-order-v2-r1'' then%return new;%'
  ) then
    raise exception using errcode = '55000',
      message = 'INVENTORY_DOUBLE_DEDUCTION_RISK';
  end if;

  select lower(p.prosrc) into v_number_trigger_source
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.orders'::regclass
    and t.tgname = 'trg_zzzz_set_order_number_branch_monthly'
    and not t.tgisinternal
    and t.tgenabled <> 'D';
  if found and (
    v_number_trigger_source not like
      '%new.atomic_engine_version = ''atomic-order-v2-r1''%'
    or v_number_trigger_source not like
      '%if new.atomic_engine_version = ''atomic-order-v2-r1'' then%return new;%'
  ) then
    raise exception using errcode = '55000',
      message = 'NUMBER_ALLOCATION_FAILED';
  end if;
end;
$function$;
create function public.resolve_inventory_requirements_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_input_count integer;
  v_distinct_count integer;
  v_invalid_catalog_id uuid;
  v_total_tracked bigint;
  v_requirements jsonb;
begin
  if p_tenant_id is null or p_branch_id is null
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) > 100 then
    raise exception using errcode = '22023', message = 'INVENTORY_ITEMS_INVALID';
  end if;

  /*
  This input is the database-derived financial item set, not browser JSON.
  Validate every cast boundary anyway so direct helper calls fail cleanly.
  */
  if exists (
    select 1
    from jsonb_array_elements(p_items) i(value)
    where jsonb_typeof(i.value) <> 'object'
       or coalesce(i.value->>'catalog_item_id','') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(i.value->>'quantity','') !~ '^[1-9][0-9]{0,4}$'
       or coalesce(i.value->>'line_number','') !~ '^[1-9][0-9]{0,2}$'
       or jsonb_typeof(coalesce(
            i.value->'source_line_numbers','[]'::jsonb
          )) <> 'array'
  ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) i(value)
    where (i.value->>'quantity')::numeric > 10000
       or (i.value->>'line_number')::integer > 100
  ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_QUANTITY_INVALID';
  end if;

  select count(*),count(distinct (i.value->>'catalog_item_id')::uuid)
  into v_input_count,v_distinct_count
  from jsonb_array_elements(p_items) i(value);
  if v_input_count <> v_distinct_count then
    raise exception using errcode = '22023',
      message = 'INVENTORY_ITEMS_INVALID';
  end if;

  /*
  Re-resolve classification from authoritative catalog rows and prove it agrees
  with the financial snapshot. No caller-provided tracking flag is consumed.
  */
  with input_items as (
    select (i.value->>'catalog_item_id')::uuid as catalog_item_id
    from jsonb_array_elements(p_items) i(value)
  )
  select x.catalog_item_id into v_invalid_catalog_id
  from input_items x
  join public.catalog_items c on c.id = x.catalog_item_id
  where c.tenant_id is distinct from p_tenant_id
  order by x.catalog_item_id
  limit 1;
  if v_invalid_catalog_id is not null then
    raise exception using errcode = '42501',
      message = 'INVENTORY_SCOPE_INVALID';
  end if;

  v_invalid_catalog_id := null;
  with input_items as (
    select
      (i.value->>'catalog_item_id')::uuid as catalog_item_id,
      (i.value->>'quantity')::integer as required_quantity,
      (i.value->>'line_number')::integer as line_number,
      i.value->'source_line_numbers' as source_line_numbers,
      i.value->>'inventory_tracking_mode' as snapshot_tracking_mode
    from jsonb_array_elements(p_items) i(value)
  )
  select x.catalog_item_id into v_invalid_catalog_id
  from input_items x
  left join public.catalog_items c on c.id = x.catalog_item_id
  where c.id is null
     or c.tenant_id is distinct from p_tenant_id
     or c.is_active is not true
     or c.deleted_at is not null
     or c.item_type is null
     or c.track_inventory is null
     or (c.is_composite and not c.track_inventory)
     or c.item_type <> all(array['product','service'])
     or x.snapshot_tracking_mode is distinct from case
       when c.item_type = 'service' then 'service'
       when c.track_inventory then 'tracked_product'
       else 'untracked_product'
     end
  order by x.catalog_item_id
  limit 1;
  if v_invalid_catalog_id is not null then
    raise exception using errcode = '22023',
      message = 'INVENTORY_CLASSIFICATION_INVALID';
  end if;

  with input_items as (
    select
      (i.value->>'catalog_item_id')::uuid as catalog_item_id,
      (i.value->>'quantity')::integer as required_quantity,
      (i.value->>'line_number')::integer as line_number,
      i.value->'source_line_numbers' as source_line_numbers
    from jsonb_array_elements(p_items) i(value)
  ),
  authoritative as (
    select
      x.*,c.item_type,c.track_inventory,
      case
        when c.item_type = 'service' then 'service'
        when c.track_inventory then 'tracked_product'
        else 'untracked_product'
      end as tracking_mode
    from input_items x
    join public.catalog_items c
      on c.id = x.catalog_item_id and c.tenant_id = p_tenant_id
  )
  select
    coalesce(sum(required_quantity) filter (
      where tracking_mode = 'tracked_product'
    ),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'tenant_id',p_tenant_id,
      'branch_id',p_branch_id,
      'catalog_item_id',catalog_item_id,
      'total_required_quantity',required_quantity,
      'tracking_mode',tracking_mode,
      'representative_line_number',line_number,
      'source_line_numbers',source_line_numbers
    ) order by catalog_item_id) filter (
      where tracking_mode = 'tracked_product'
    ),'[]'::jsonb)
  into v_total_tracked,v_requirements
  from authoritative;

  if v_total_tracked > 100000 then
    raise exception using errcode = '22023',
      message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  return jsonb_build_object(
    'version','inventory-requirements-v1',
    'tracked_item_count',jsonb_array_length(v_requirements),
    'total_tracked_quantity',v_total_tracked,
    'requirements',v_requirements
  );
end;
$function$;
create function public.lock_and_validate_inventory_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_requirement_set jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_requirement_count integer;
  v_distinct_requirement_count integer;
  v_missing uuid;
  v_ambiguous uuid;
  v_locked_row record;
  v_locked_rows jsonb := '[]'::jsonb;
  v_locked jsonb;
begin
  if p_tenant_id is null or p_branch_id is null
     or p_requirement_set is null
     or jsonb_typeof(p_requirement_set) <> 'object'
     or p_requirement_set->>'version' <> 'inventory-requirements-v1'
     or jsonb_typeof(p_requirement_set->'requirements') <> 'array' then
    raise exception using errcode = '22023',
      message = 'INVENTORY_ITEMS_INVALID';
  end if;
  v_requirement_count :=
    jsonb_array_length(p_requirement_set->'requirements');
  if exists (
    select 1
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
    where jsonb_typeof(r.value) <> 'object'
       or coalesce(r.value->>'catalog_item_id','') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or (r.value->>'tenant_id') is distinct from p_tenant_id::text
       or (r.value->>'branch_id') is distinct from p_branch_id::text
       or (r.value->>'tracking_mode') is distinct from 'tracked_product'
       or coalesce(r.value->>'total_required_quantity','') !~
          '^[1-9][0-9]{0,4}$'
       or coalesce(r.value->>'representative_line_number','') !~
          '^[1-9][0-9]{0,2}$'
       or jsonb_typeof(coalesce(
            r.value->'source_line_numbers','[]'::jsonb
          )) <> 'array'
  ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_ITEMS_INVALID';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
    where (r.value->>'total_required_quantity')::integer > 10000
       or (r.value->>'representative_line_number')::integer > 100
  ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  select count(distinct (r.value->>'catalog_item_id')::uuid)
  into v_distinct_requirement_count
  from jsonb_array_elements(p_requirement_set->'requirements') r(value);
  if v_requirement_count <> v_distinct_requirement_count then
    raise exception using errcode = '22023',
      message = 'INVENTORY_ITEMS_INVALID';
  end if;

  /* Resolve cardinality before locking; the canonical unique key should make
     ambiguity impossible, but drift is detected rather than hidden. */
  with requirements as (
    select
      (r.value->>'catalog_item_id')::uuid as catalog_item_id
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
  ),
  cardinality as (
    select q.catalog_item_id,count(s.id) as stock_count
    from requirements q
    left join public.inventory_stock s
      on s.tenant_id = p_tenant_id
     and s.branch_id = p_branch_id
     and s.catalog_item_id = q.catalog_item_id
    group by q.catalog_item_id
  )
  select catalog_item_id into v_missing
  from cardinality where stock_count = 0
  order by catalog_item_id limit 1;
  if v_missing is not null then
    raise exception using errcode = 'P0002',
      message = 'INVENTORY_STOCK_NOT_FOUND';
  end if;

  with requirements as (
    select
      (r.value->>'catalog_item_id')::uuid as catalog_item_id
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
  ),
  cardinality as (
    select q.catalog_item_id,count(s.id) as stock_count
    from requirements q
    join public.inventory_stock s
      on s.tenant_id = p_tenant_id
     and s.branch_id = p_branch_id
     and s.catalog_item_id = q.catalog_item_id
    group by q.catalog_item_id
  )
  select catalog_item_id into v_ambiguous
  from cardinality where stock_count > 1
  order by catalog_item_id limit 1;
  if v_ambiguous is not null then
    raise exception using errcode = 'P0001',
      message = 'INVENTORY_STOCK_AMBIGUOUS';
  end if;

  /*
  Lock the complete set in one deterministic total order. This loop performs no
  quantity or version validation and no mutation. All matching row locks are
  acquired before the validation loop below begins.
  */
  for v_locked_row in
    select
      s.id as stock_id,s.tenant_id,s.branch_id,s.catalog_item_id,
      s.quantity_on_hand,s.record_version,
      (r.value->>'total_required_quantity')::integer as required_quantity,
      (r.value->>'representative_line_number')::integer
        as representative_line_number,
      r.value->'source_line_numbers' as source_line_numbers,
      r.value->>'tracking_mode' as tracking_mode
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
    join public.inventory_stock s
      on s.tenant_id = p_tenant_id
     and s.branch_id = p_branch_id
     and s.catalog_item_id = (r.value->>'catalog_item_id')::uuid
    order by s.catalog_item_id,s.id
    for update of s
  loop
    v_locked_rows := v_locked_rows || jsonb_build_array(jsonb_build_object(
      'stock_id',v_locked_row.stock_id,
      'tenant_id',v_locked_row.tenant_id,
      'branch_id',v_locked_row.branch_id,
      'catalog_item_id',v_locked_row.catalog_item_id,
      'required_quantity',v_locked_row.required_quantity,
      'quantity_before',v_locked_row.quantity_on_hand,
      'quantity_after',
        v_locked_row.quantity_on_hand - v_locked_row.required_quantity,
      'record_version_before',v_locked_row.record_version,
      'record_version_after',v_locked_row.record_version + 1,
      'tracking_mode',v_locked_row.tracking_mode,
      'representative_line_number',
        v_locked_row.representative_line_number,
      'source_line_numbers',v_locked_row.source_line_numbers
    ));
  end loop;
  if jsonb_array_length(v_locked_rows) <> v_requirement_count then
    raise exception using errcode = '40001',
      message = 'INVENTORY_LOCK_CONFLICT';
  end if;

  /* All stock rows are now locked. Only validation occurs in this pass. */
  for v_locked in select value from jsonb_array_elements(v_locked_rows)
  loop
    if (v_locked->>'tenant_id')::uuid <> p_tenant_id
       or (v_locked->>'branch_id')::uuid <> p_branch_id
       or v_locked->>'tracking_mode' <> 'tracked_product' then
      raise exception using errcode = '42501',
        message = 'INVENTORY_SCOPE_INVALID';
    end if;
    if (v_locked->>'required_quantity')::numeric <= 0
       or (v_locked->>'required_quantity')::numeric > 10000
       or (v_locked->>'quantity_before') is null
       or (v_locked->>'quantity_before')::numeric < 0 then
      raise exception using errcode = '22023',
        message = 'INVENTORY_QUANTITY_INVALID';
    end if;
    if (v_locked->>'record_version_before') is null
       or (v_locked->>'record_version_before')::bigint < 1 then
      raise exception using errcode = '22023',
        message = 'INVENTORY_VERSION_INVALID';
    end if;
    if (v_locked->>'quantity_after')::numeric < 0 then
      raise exception using errcode = '23514',
        message = 'INSUFFICIENT_STOCK';
    end if;
    if (v_locked->>'record_version_after')::bigint
       <> (v_locked->>'record_version_before')::bigint + 1 then
      raise exception using errcode = 'P0001',
        message = 'INVENTORY_VERSION_INVALID';
    end if;
  end loop;
  return jsonb_build_object(
    'version','locked-inventory-v1',
    'locked_count',v_requirement_count,
    'rows',v_locked_rows
  );
end;
$function$;
create function public.build_inventory_movement_evidence_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_catalog_item_id uuid,
  p_order_id uuid,
  p_invoice_id uuid,
  p_invoice_item_id uuid,
  p_correlation_id uuid,
  p_quantity_delta numeric,
  p_quantity_before numeric,
  p_quantity_after numeric,
  p_version_before bigint,
  p_version_after bigint
)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'version','inventory-movement-evidence-v1',
    'tenant_id',p_tenant_id,
    'branch_id',p_branch_id,
    'catalog_item_id',p_catalog_item_id,
    'order_id',p_order_id,
    'invoice_id',p_invoice_id,
    'invoice_item_id',p_invoice_item_id,
    'correlation_id',p_correlation_id,
    'movement_type','sale',
    'movement_reason','atomic_order_sale',
    'quantity_delta',p_quantity_delta,
    'quantity_before',p_quantity_before,
    'quantity_after',p_quantity_after,
    'stock_version_before',p_version_before,
    'stock_version_after',p_version_after,
    'inventory_engine_version','inventory-engine-v2-r1'
  );
$function$;
create function public.apply_inventory_mutations_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_correlation_id uuid,
  p_locked_set jsonb,
  p_invoice_item_map jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_locked jsonb;
  v_invoice_item_id uuid;
  v_invoice_item_count integer;
  v_evidence jsonb;
  v_hash text;
  v_movement_count integer := 0;
  v_update_count integer := 0;
  v_affected integer;
  v_evidence_refs jsonb := '[]'::jsonb;
begin
  if p_tenant_id is null or p_branch_id is null or p_order_id is null
     or p_invoice_id is null or p_actor_user_id is null
     or p_correlation_id is null
     or p_locked_set is null or jsonb_typeof(p_locked_set) <> 'object'
     or p_locked_set->>'version' <> 'locked-inventory-v1'
     or jsonb_typeof(p_locked_set->'rows') <> 'array'
     or coalesce(p_locked_set->>'locked_count','') !~ '^[0-9]{1,3}$'
     or p_invoice_item_map is null
     or jsonb_typeof(p_invoice_item_map) <> 'array' then
    raise exception using errcode = '22023',
      message = 'INVENTORY_MOVEMENT_PERSISTENCE_INVALID';
  end if;
  if jsonb_array_length(p_invoice_item_map)
       <> (p_locked_set->>'locked_count')::integer
     or exists (
       select 1
       from jsonb_array_elements(p_invoice_item_map) m(value)
       where jsonb_typeof(m.value) <> 'object'
          or coalesce(m.value->>'catalog_item_id','') !~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          or coalesce(m.value->>'invoice_item_id','') !~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_MOVEMENT_PERSISTENCE_INVALID';
  end if;

  /*
  Phase one inserts exactly one movement for every aggregate. Invoice items are
  already aggregated deterministically, so the one matching item is the exact
  representative linkage. Package 2 has no employee/request-fingerprint/
  inventory-stock-id movement columns; those remain an explicit 4R.4/Package 2
  follow-up rather than being hidden in notes.
  */
  for v_locked in
    select value from jsonb_array_elements(p_locked_set->'rows')
    order by (value->>'catalog_item_id')::uuid,(value->>'stock_id')::uuid
  loop
    select count(*),(array_agg(
      (m.value->>'invoice_item_id')::uuid
      order by (m.value->>'invoice_item_id')::uuid
    ))[1]
    into v_invoice_item_count,v_invoice_item_id
    from jsonb_array_elements(p_invoice_item_map) m(value)
    where (m.value->>'catalog_item_id')::uuid
      = (v_locked->>'catalog_item_id')::uuid;
    if v_invoice_item_count <> 1 or v_invoice_item_id is null then
      raise exception using errcode = 'P0001',
        message = 'INVENTORY_MOVEMENT_PERSISTENCE_INVALID';
    end if;

    v_evidence := public.build_inventory_movement_evidence_v2(
      p_tenant_id,p_branch_id,(v_locked->>'catalog_item_id')::uuid,
      p_order_id,p_invoice_id,v_invoice_item_id,p_correlation_id,
      -(v_locked->>'required_quantity')::numeric,
      (v_locked->>'quantity_before')::numeric,
      (v_locked->>'quantity_after')::numeric,
      (v_locked->>'record_version_before')::bigint,
      (v_locked->>'record_version_after')::bigint
    );
    v_hash := encode(extensions.digest(v_evidence::text,'sha256'),'hex');
    v_evidence_refs := v_evidence_refs || jsonb_build_array(
      jsonb_build_object(
        'catalog_item_id',v_locked->>'catalog_item_id',
        'inventory_snapshot_hash',v_hash,
        'quantity_delta',-(v_locked->>'required_quantity')::numeric,
        'quantity_after',(v_locked->>'quantity_after')::numeric,
        'stock_version_after',(v_locked->>'record_version_after')::bigint
      )
    );

    insert into public.inventory_movements (
      tenant_id,branch_id,catalog_item_id,movement_type,quantity_delta,
      source_type,source_id,notes,created_by,created_at,movement_reason,
      quantity_before,quantity_after,stock_version_before,stock_version_after,
      order_id,invoice_id,invoice_item_id,correlation_id,
      inventory_engine_version,inventory_snapshot_version,
      inventory_snapshot_hash
    )
    values (
      p_tenant_id,p_branch_id,(v_locked->>'catalog_item_id')::uuid,
      'sale',-(v_locked->>'required_quantity')::numeric,
      'invoice_item',v_invoice_item_id,'Core V2 atomic sale',p_actor_user_id,
      transaction_timestamp(),'atomic_order_sale',
      (v_locked->>'quantity_before')::numeric,
      (v_locked->>'quantity_after')::numeric,
      (v_locked->>'record_version_before')::bigint,
      (v_locked->>'record_version_after')::bigint,
      p_order_id,p_invoice_id,v_invoice_item_id,p_correlation_id::text,
      'inventory-engine-v2-r1','inventory-movement-evidence-v1',v_hash
    );
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = 'P0001',
        message = 'INVENTORY_MOVEMENT_PERSISTENCE_INVALID';
    end if;
    v_movement_count := v_movement_count + 1;
  end loop;

  /* Phase two mutates each previously locked aggregate exactly once. */
  for v_locked in
    select value from jsonb_array_elements(p_locked_set->'rows')
    order by (value->>'catalog_item_id')::uuid,(value->>'stock_id')::uuid
  loop
    update public.inventory_stock s
    set quantity_on_hand = (v_locked->>'quantity_after')::numeric,
        record_version = (v_locked->>'record_version_after')::bigint,
        updated_at = transaction_timestamp()
    where s.id = (v_locked->>'stock_id')::uuid
      and s.tenant_id = p_tenant_id
      and s.branch_id = p_branch_id
      and s.catalog_item_id = (v_locked->>'catalog_item_id')::uuid
      and s.quantity_on_hand = (v_locked->>'quantity_before')::numeric
      and s.record_version = (v_locked->>'record_version_before')::bigint;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = '40001',
        message = 'INVENTORY_MUTATION_CONFLICT';
    end if;
    v_update_count := v_update_count + 1;
  end loop;

  if v_movement_count <> (p_locked_set->>'locked_count')::integer
     or v_update_count <> (p_locked_set->>'locked_count')::integer then
    raise exception using errcode = 'P0001',
      message = 'INVENTORY_MUTATION_CONFLICT';
  end if;
  return jsonb_build_object(
    'inventory_engine_version','inventory-engine-v2-r1',
    'tracked_items_mutated',v_update_count,
    'movements_inserted',v_movement_count,
    'evidence_refs',v_evidence_refs
  );
end;
$function$;
create function public.atomic_semantic_event_uuid_v1(
  p_identity text
)
returns uuid
language sql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
  select (
    substr(v.hash,1,8)||'-'||substr(v.hash,9,4)||'-5'||substr(v.hash,14,3)||
    '-a'||substr(v.hash,18,3)||'-'||substr(v.hash,21,12)
  )::uuid
  from (
    select encode(extensions.digest(p_identity,'sha256'),'hex') as hash
  ) v;
$function$;
create function public.enqueue_atomic_outbox_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_invoice_id uuid,
  p_customer_id uuid,
  p_customer_was_created boolean,
  p_shared_number text,
  p_currency_code text,
  p_total numeric,
  p_payment_method text,
  p_payment_status text,
  p_financial_snapshot_hash text,
  p_inventory_result jsonb,
  p_correlation_id uuid,
  p_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_count integer := 0;
  v_expected integer := 1;
  v_payload jsonb;
  v_payload_hash text;
  v_event_id uuid;
  v_affected integer;
  v_event_hashes jsonb := '[]'::jsonb;
  v_constraint_name text;
begin
  if p_tenant_id is null or p_branch_id is null or p_order_id is null
     or p_invoice_id is null or p_customer_id is null
     or p_customer_was_created is null
     or nullif(btrim(p_shared_number),'') is null
     or coalesce(p_currency_code,'') !~ '^[A-Z]{3}$'
     or p_total is null or p_total < 0
     or nullif(btrim(p_payment_method),'') is null
     or nullif(btrim(p_payment_status),'') is null
     or coalesce(p_financial_snapshot_hash,'') !~ '^[0-9a-f]{64}$'
     or p_inventory_result is null
     or jsonb_typeof(p_inventory_result) <> 'object'
     or coalesce(p_inventory_result->>'tracked_items_mutated','') !~ '^[0-9]{1,3}$'
     or jsonb_typeof(p_inventory_result->'evidence_refs') <> 'array'
     or p_correlation_id is null or p_created_at is null then
    raise exception using errcode = '22023', message = 'OUTBOX_EVENT_INVALID';
  end if;

  /* Invoice creation is the canonical Release 1 financial event. */
  v_payload := jsonb_build_object(
    'payload_version','invoice-created-v1',
    'correlation_id',p_correlation_id,
    'aggregate_type','invoice',
    'aggregate_id',p_invoice_id,
    'invoice_id',p_invoice_id,
    'order_id',p_order_id,
    'customer_id',p_customer_id,
    'number',p_shared_number,
    'currency_code',p_currency_code,
    'total',p_total,
    'payment_method',p_payment_method,
    'payment_status',p_payment_status,
    'financial_snapshot_hash',p_financial_snapshot_hash
  );
  v_payload_hash := encode(extensions.digest(v_payload::text,'sha256'),'hex');
  v_event_id := public.atomic_semantic_event_uuid_v1(
    p_tenant_id::text||':invoice_created:invoice:'||
    p_invoice_id::text||':invoice-created-v1'
  );
  begin
    insert into public.atomic_outbox (
      id,event_id, correlation_id, aggregate_id, aggregate_type,
      tenant_id, branch_id, event_type, payload_version, payload,
      payload_hash, lease_owner, attempt_count, retry_count,
      execution_status, next_attempt_at, lease_expires_at,
      created_at, updated_at
    )
    values (
      v_event_id,v_event_id,p_correlation_id::text,p_invoice_id,'invoice',
      p_tenant_id,p_branch_id,'invoice_created','invoice-created-v1',v_payload,
      v_payload_hash,null,0,0,'pending_commit',p_created_at,null,
      p_created_at,p_created_at
    );
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = any(array['atomic_outbox_pkey','uq_atomic_outbox_event_id'])
    then
      raise exception using errcode = '23505',
        message = 'OUTBOX_DEDUPLICATION_CONFLICT';
    end if;
    raise;
  end;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using errcode = 'P0001',
      message = 'OUTBOX_PERSISTENCE_INVALID';
  end if;
  v_count := v_count + 1;
  v_event_hashes := v_event_hashes || jsonb_build_array(v_payload_hash);

  if p_customer_was_created then
    v_expected := v_expected + 1;
    v_payload := jsonb_build_object(
      'payload_version','customer-created-v1',
      'correlation_id',p_correlation_id,
      'aggregate_type','customer',
      'aggregate_id',p_customer_id,
      'customer_id',p_customer_id
    );
    v_payload_hash := encode(extensions.digest(v_payload::text,'sha256'),'hex');
    v_event_id := public.atomic_semantic_event_uuid_v1(
      p_tenant_id::text||':customer_created:customer:'||
      p_customer_id::text||':customer-created-v1'
    );
    begin
      insert into public.atomic_outbox (
        id,event_id,correlation_id,aggregate_id,aggregate_type,tenant_id,
        branch_id,event_type,payload_version,payload,payload_hash,lease_owner,
        attempt_count,retry_count,execution_status,next_attempt_at,
        lease_expires_at,created_at,updated_at
      ) values (
        v_event_id,v_event_id,p_correlation_id::text,p_customer_id,'customer',
        p_tenant_id,p_branch_id,'customer_created','customer-created-v1',
        v_payload,v_payload_hash,null,0,0,'pending_commit',p_created_at,null,
        p_created_at,p_created_at
      );
    exception when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = any(array['atomic_outbox_pkey','uq_atomic_outbox_event_id'])
      then
        raise exception using errcode = '23505',
          message = 'OUTBOX_DEDUPLICATION_CONFLICT';
      end if;
      raise;
    end;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = 'P0001',
        message = 'OUTBOX_PERSISTENCE_INVALID';
    end if;
    v_count := v_count + 1;
    v_event_hashes := v_event_hashes || jsonb_build_array(v_payload_hash);
  end if;

  if (p_inventory_result->>'tracked_items_mutated')::integer > 0 then
    v_expected := v_expected + 1;
    v_payload := jsonb_build_object(
      'payload_version','inventory-changed-v1',
      'correlation_id',p_correlation_id,
      'aggregate_type','inventory',
      'aggregate_id',p_order_id,
      'order_id',p_order_id,
      'invoice_id',p_invoice_id,
      'number',p_shared_number,
      'inventory_engine_version',p_inventory_result->>'inventory_engine_version',
      'tracked_items_mutated',
        (p_inventory_result->>'tracked_items_mutated')::integer,
      'evidence_refs',p_inventory_result->'evidence_refs'
    );
    v_payload_hash := encode(extensions.digest(v_payload::text,'sha256'),'hex');
    v_event_id := public.atomic_semantic_event_uuid_v1(
      p_tenant_id::text||':inventory_changed:inventory:'||
      p_order_id::text||':inventory-changed-v1'
    );
    begin
      insert into public.atomic_outbox (
        id,event_id,correlation_id,aggregate_id,aggregate_type,tenant_id,
        branch_id,event_type,payload_version,payload,payload_hash,lease_owner,
        attempt_count,retry_count,execution_status,next_attempt_at,
        lease_expires_at,created_at,updated_at
      ) values (
        v_event_id,v_event_id,p_correlation_id::text,p_order_id,'inventory',
        p_tenant_id,p_branch_id,'inventory_changed','inventory-changed-v1',
        v_payload,v_payload_hash,null,0,0,'pending_commit',p_created_at,null,
        p_created_at,p_created_at
      );
    exception when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = any(array['atomic_outbox_pkey','uq_atomic_outbox_event_id'])
      then
        raise exception using errcode = '23505',
          message = 'OUTBOX_DEDUPLICATION_CONFLICT';
      end if;
      raise;
    end;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = 'P0001',
        message = 'OUTBOX_PERSISTENCE_INVALID';
    end if;
    v_count := v_count + 1;
    v_event_hashes := v_event_hashes || jsonb_build_array(v_payload_hash);
  end if;

  if v_count <> v_expected then
    raise exception using errcode = 'P0001',
      message = 'OUTBOX_PERSISTENCE_INVALID';
  end if;
  return jsonb_build_object(
    'events_inserted',v_count,
    'payload_hashes',v_event_hashes
  );
exception
  when check_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = any(array[
      'ck_atomic_outbox_event_type','ck_atomic_outbox_aggregate_type',
      'ck_atomic_outbox_execution_status','ck_atomic_outbox_payload_object',
      'ck_atomic_outbox_payload_hash','ck_atomic_outbox_counts',
      'ck_atomic_outbox_correlation_id','ck_atomic_outbox_payload_version',
      'ck_atomic_outbox_bounded_text','ck_atomic_outbox_processing_lease',
      'ck_atomic_outbox_nonprocessing_lease',
      'ck_atomic_outbox_delivered_at','ck_atomic_outbox_terminal_lease',
      'ck_atomic_outbox_next_attempt'
    ]) then
      raise exception using errcode = 'P0001',
        message = 'OUTBOX_PERSISTENCE_INVALID';
    end if;
    raise;
end;
$function$;

/*
Financial authority boundary.

The caller supplies intent only: catalog identities, quantities, an optional
discount identity, a payment method, and (for cash only) tendered cash.
Catalog, branch pricing, VAT, discount, cost, totals, payment state, profit,
versions, and the committed snapshot hash are derived here from locked,
tenant-scoped database state. A financial quote remains advisory evidence; it
is never the committed financial truth.
*/
create function public.derive_atomic_financial_snapshot_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_financial_intent jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_unknown_key text;
  v_raw_item jsonb;
  v_line record;
  v_catalog public.catalog_items%rowtype;
  v_branch_price public.branch_catalog_items%rowtype;
  v_discount public.discounts%rowtype;
  v_vat public.vat_settings%rowtype;
  v_items_base jsonb := '[]'::jsonb;
  v_items_final jsonb := '[]'::jsonb;
  v_item jsonb;
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_discount_id uuid;
  v_payment_method text;
  v_cash_settlement_state text;
  v_cash_received numeric(18,2);
  v_unit_price numeric(18,2);
  v_quantity integer;
  v_gross numeric(18,2);
  v_cost numeric(18,2);
  v_subtotal numeric(18,2) := 0;
  v_discount_amount numeric(18,2) := 0;
  v_discount_allocated numeric(18,2) := 0;
  v_line_discount numeric(18,2);
  v_taxable numeric(18,2);
  v_taxable_subtotal numeric(18,2) := 0;
  v_vat_amount numeric(18,2);
  v_total numeric(18,2);
  v_remaining numeric(18,2) := 0;
  v_change numeric(18,2) := 0;
  v_payment_status text;
  v_vat_rule_version text;
  v_discount_rule_version text := 'discount-none-v1';
  v_override_count integer;
  v_vat_count integer;
  v_line_count integer;
  v_line_number integer := 0;
begin
  if p_tenant_id is null or p_branch_id is null
     or p_financial_intent is null
     or jsonb_typeof(p_financial_intent) <> 'object' then
    raise exception using errcode = '22023',
      message = 'FINANCIAL_INTENT_INVALID';
  end if;

  select k.key into v_unknown_key
  from jsonb_object_keys(p_financial_intent) as k(key)
  where k.key <> all(array[
    'items','discount_id','payment_method','cash_received'
  ])
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023',
      message = 'FINANCIAL_INTENT_UNKNOWN_KEYS';
  end if;
  if p_financial_intent->'items' is null
     or jsonb_typeof(p_financial_intent->'items') <> 'array'
     or jsonb_array_length(p_financial_intent->'items') = 0 then
    raise exception using errcode = '22023', message = 'EMPTY_CART';
  end if;
  if jsonb_array_length(p_financial_intent->'items') > 100 then
    raise exception using errcode = '22023', message = 'CART_LIMIT_EXCEEDED';
  end if;

  /* Validate every element before any text-to-type cast. */
  for v_raw_item in
    select value
    from jsonb_array_elements(p_financial_intent->'items')
  loop
    if jsonb_typeof(v_raw_item) <> 'object' then
      raise exception using errcode = '22023', message = 'ITEM_INTENT_INVALID';
    end if;
    select k.key into v_unknown_key
    from jsonb_object_keys(v_raw_item) as k(key)
    where k.key <> all(array['catalog_item_id','quantity'])
    limit 1;
    if v_unknown_key is not null
       or coalesce(v_raw_item->>'catalog_item_id','') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(v_raw_item->>'quantity','') !~ '^[1-9][0-9]{0,4}$' then
      raise exception using errcode = '22023', message = 'ITEM_INTENT_INVALID';
    end if;
    if (v_raw_item->>'quantity')::numeric > 10000 then
      raise exception using errcode = '22023', message = 'ITEM_INTENT_INVALID';
    end if;
  end loop;

  /*
  Aggregate repeated catalog identities first. This prevents duplicate add
  lines from changing rounding or lock order. UUID ordering is deterministic.
  */
  for v_line in
    select
      (j.value->>'catalog_item_id')::uuid as catalog_item_id,
      sum((j.value->>'quantity')::integer)::bigint as quantity,
      array_agg(j.source_line::integer order by j.source_line) as source_lines
    from jsonb_array_elements(p_financial_intent->'items')
      with ordinality j(value,source_line)
    group by (j.value->>'catalog_item_id')::uuid
    order by (j.value->>'catalog_item_id')::uuid
  loop
    if v_line.quantity > 10000 then
      raise exception using errcode = '22023', message = 'INVALID_QUANTITY';
    end if;
    v_quantity := v_line.quantity::integer;

    select * into v_catalog
    from public.catalog_items c
    where c.id = v_line.catalog_item_id
    for share;
    if not found then
      raise exception using errcode = 'P0002', message = 'PRICE_NOT_FOUND';
    end if;
    if v_catalog.tenant_id is distinct from p_tenant_id then
      raise exception using errcode = '42501', message = 'PRICE_SCOPE_INVALID';
    end if;
    if v_catalog.is_active is not true
       or v_catalog.deleted_at is not null then
      raise exception using errcode = '22023', message = 'PRICE_INVALID';
    end if;
    if v_catalog.item_type <> all(array['product','service']) then
      raise exception using errcode = '22023',
        message = 'FINANCIAL_CONFIGURATION_INVALID';
    end if;

    if exists (
      select 1
      from public.branch_catalog_items b
      where b.branch_id = p_branch_id
        and b.catalog_item_id = v_catalog.id
        and b.is_active
        and b.tenant_id is distinct from p_tenant_id
    ) then
      raise exception using errcode = '42501',
        message = 'PRICE_SCOPE_INVALID';
    end if;
    select count(*)::integer into v_override_count
    from public.branch_catalog_items b
    where b.tenant_id = p_tenant_id
      and b.branch_id = p_branch_id
      and b.catalog_item_id = v_catalog.id
      and b.is_active;
    if v_override_count > 1 then
      raise exception using errcode = 'P0001',
        message = 'PRICE_INVALID';
    end if;
    if v_override_count = 1 then
      select * into strict v_branch_price
      from public.branch_catalog_items b
      where b.tenant_id = p_tenant_id
        and b.branch_id = p_branch_id
        and b.catalog_item_id = v_catalog.id
        and b.is_active
      for share;
      v_unit_price := round(v_branch_price.price::numeric, 2);
    else
      v_branch_price.id := null;
      v_branch_price.updated_at := null;
      v_unit_price := round(v_catalog.default_price::numeric, 2);
    end if;
    if v_unit_price is null or v_unit_price < 0
       or v_unit_price > 99999999.99 then
      raise exception using errcode = 'P0001', message = 'PRICE_INVALID';
    end if;
    if v_catalog.cost_price is null or v_catalog.cost_price < 0 then
      raise exception using errcode = 'P0001',
        message = 'FINANCIAL_SNAPSHOT_INVALID';
    end if;

    v_gross := round(v_unit_price * v_quantity, 2);
    v_cost := round(v_catalog.cost_price::numeric * v_quantity, 2);
    if v_gross > 99999999.99 or v_cost > 9999999999999999.99 then
      raise exception using errcode = '22003', message = 'PRICE_INVALID';
    end if;
    v_subtotal := v_subtotal + v_gross;
    if v_subtotal > 99999999.99 then
      raise exception using errcode = '22003', message = 'PRICE_INVALID';
    end if;
    v_items_base := v_items_base || jsonb_build_array(jsonb_build_object(
      'catalog_item_id', v_catalog.id,
      'name', v_catalog.name,
      'item_type', v_catalog.item_type,
      'category', v_catalog.category,
      'quantity', v_quantity,
      'source_line_numbers', to_jsonb(v_line.source_lines),
      'unit_price', v_unit_price,
      'gross_amount', v_gross,
      'line_total', v_gross,
      'cost_snapshot', v_cost,
      'cost_price', round(v_catalog.cost_price::numeric, 2),
      'price_source', case when v_override_count = 1
        then 'branch_override' else 'catalog' end,
      'source_branch_price_id', case when v_override_count = 1
        then v_branch_price.id else null end,
      'source_catalog_updated_at', v_catalog.updated_at,
      'source_branch_price_updated_at', case when v_override_count = 1
        then v_branch_price.updated_at else null end,
      'inventory_tracking_mode', case
        when v_catalog.item_type = 'service' then 'service'
        when v_catalog.track_inventory then 'tracked_product'
        else 'untracked_product' end,
      'track_inventory', coalesce(v_catalog.track_inventory,false)
    ));
  end loop;
  v_subtotal := round(v_subtotal, 2);

  if nullif(p_financial_intent->>'discount_id','') is not null then
    if (p_financial_intent->>'discount_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'DISCOUNT_INVALID';
    end if;
    v_discount_id := (p_financial_intent->>'discount_id')::uuid;
    select * into v_discount
    from public.discounts d
    where d.id = v_discount_id
    for share;
    if not found
       or v_discount.tenant_id is distinct from p_tenant_id
       or v_discount.deleted_at is not null
       or v_discount.is_active is not true
       or (v_discount.branch_id is not null
           and v_discount.branch_id <> p_branch_id) then
      raise exception using errcode = '22023', message = 'DISCOUNT_INVALID';
    end if;
    if v_discount.type = 'percentage'
       and v_discount.value between 0 and 100 then
      v_discount_amount := round(v_subtotal * v_discount.value / 100, 2);
    elsif v_discount.type = 'fixed'
          and v_discount.value between 0 and v_subtotal then
      v_discount_amount := round(v_discount.value, 2);
    else
      raise exception using errcode = '22023',
        message = 'DISCOUNT_INVALID';
    end if;
    v_discount_rule_version := concat(
      'discount-v1:',v_discount.id::text,':',
      coalesce(extract(epoch from v_discount.updated_at)::text,'no-updated-at')
    );
  end if;

  /* Branch-specific VAT wins; otherwise exactly one tenant-global row. */
  select count(*)::integer into v_vat_count
  from public.vat_settings s
  where s.tenant_id = p_tenant_id and s.branch_id = p_branch_id
    and s.is_active;
  if v_vat_count > 1 then
    raise exception using errcode = 'P0001',
      message = 'VAT_INVALID';
  elsif v_vat_count = 1 then
    select * into strict v_vat
    from public.vat_settings s
    where s.tenant_id = p_tenant_id and s.branch_id = p_branch_id
      and s.is_active
    for share;
  else
    select count(*)::integer into v_vat_count
    from public.vat_settings s
    where s.tenant_id = p_tenant_id and s.branch_id is null
      and s.is_active;
    if v_vat_count > 1 then
      raise exception using errcode = 'P0001',
        message = 'VAT_INVALID';
    elsif v_vat_count = 0 then
      raise exception using errcode = 'P0002',
        message = 'VAT_INVALID';
    end if;
    select * into strict v_vat
    from public.vat_settings s
    where s.tenant_id = p_tenant_id and s.branch_id is null
      and s.is_active
    for share;
  end if;
  if v_vat.rate < 0 or v_vat.rate > 100 then
    raise exception using errcode = 'P0001',
      message = 'VAT_INVALID';
  end if;
  v_vat_rule_version := concat(
    'vat-v1:',v_vat.id::text,':',
    coalesce(extract(epoch from v_vat.updated_at)::text,'no-updated-at')
  );

  /*
  Header discount is allocated proportionally in deterministic item order.
  The last line receives the residual so line allocations equal the header
  amount exactly. All financial rounding is half-away-from-zero at 2 decimals,
  PostgreSQL numeric round() semantics.
  */
  v_line_count := jsonb_array_length(v_items_base);
  for v_item in select value from jsonb_array_elements(v_items_base)
  loop
    v_line_number := v_line_number + 1;
    v_gross := (v_item->>'gross_amount')::numeric;
    if v_line_number = v_line_count then
      v_line_discount := v_discount_amount - v_discount_allocated;
    elsif v_subtotal = 0 then
      v_line_discount := 0;
    else
      v_line_discount := round(v_discount_amount * v_gross / v_subtotal, 2);
    end if;
    v_line_discount := greatest(0, least(v_gross, v_line_discount));
    v_discount_allocated := v_discount_allocated + v_line_discount;
    v_taxable := round(v_gross - v_line_discount, 2);
    v_taxable_subtotal := v_taxable_subtotal + v_taxable;
    v_cost := (v_item->>'cost_snapshot')::numeric;
    v_items_final := v_items_final || jsonb_build_array(
      (v_item - 'line_total') || jsonb_build_object(
        'line_number', v_line_number,
        'discount_allocation', v_line_discount,
        'taxable_amount', v_taxable,
        'line_total', v_taxable,
        'profit_snapshot', round(v_taxable - v_cost, 2),
        'cost_snapshot_status', 'complete',
        'cost_snapshot_version', 'catalog-cost-v1',
        'pricing_snapshot', jsonb_build_object(
          'version','pricing-snapshot-v1',
          'price_source',v_item->>'price_source',
          'unit_price',(v_item->>'unit_price')::numeric,
          'source_catalog_updated_at',v_item->>'source_catalog_updated_at',
          'source_branch_price_id',v_item->>'source_branch_price_id',
          'source_branch_price_updated_at',
            v_item->>'source_branch_price_updated_at'
        )
      )
    );
  end loop;
  v_taxable_subtotal := round(v_taxable_subtotal, 2);
  v_vat_amount := round(v_taxable_subtotal * v_vat.rate / 100, 2);
  v_total := round(v_taxable_subtotal + v_vat_amount, 2);
  if v_discount_amount > 99999999.99
     or v_taxable_subtotal > 99999999.99
     or v_vat_amount > 99999999.99
     or v_total > 99999999.99 then
    raise exception using errcode = '22003',
      message = 'FINANCIAL_SNAPSHOT_INVALID';
  end if;

  v_payment_method := lower(nullif(btrim(p_financial_intent->>'payment_method'),''));
  if v_payment_method = 'cod' then v_payment_method := 'on_delivery'; end if;
  if v_payment_method <> all(array[
    'cash','card','mada','visa','transfer','on_delivery'
  ]) then
    raise exception using errcode = '22023',
      message = 'PAYMENT_METHOD_INVALID';
  end if;
  if nullif(p_financial_intent->>'cash_received','') is not null then
    if (p_financial_intent->>'cash_received') !~
       '^[0-9]{1,16}([.][0-9]{1,2})?$' then
      raise exception using errcode = '22023', message = 'PAYMENT_STATE_INVALID';
    end if;
    v_cash_received := round((p_financial_intent->>'cash_received')::numeric,2);
  else
    v_cash_received := 0;
  end if;
  if v_payment_method = 'cash' then
    v_remaining := greatest(round(v_total - v_cash_received,2),0);
    v_change := greatest(round(v_cash_received - v_total,2),0);
    v_payment_status := case when v_remaining = 0 then 'paid' else 'pending' end;
    v_cash_settlement_state := case
      when v_remaining > 0 then 'UNDERPAYMENT'
      when v_change > 0 then 'OVERPAYMENT'
      else 'EXACT_PAYMENT'
    end;
  elsif v_cash_received <> 0 then
    raise exception using errcode = '22023', message = 'PAYMENT_STATE_INVALID';
  elsif v_payment_method = any(array['card','mada','visa']) then
    v_payment_status := 'paid';
    v_cash_settlement_state := 'NOT_APPLICABLE';
  else
    v_payment_status := 'pending';
    v_remaining := v_total;
    v_cash_settlement_state := 'NOT_APPLICABLE';
  end if;
  if v_remaining > 0 and v_change > 0 then
      raise exception using errcode = 'P0001',
      message = 'PAYMENT_STATE_INVALID';
  end if;

  v_snapshot := jsonb_build_object(
    'currency_code','SAR',
    'subtotal',v_subtotal,
    'discount_id_snapshot',v_discount_id,
    'discount_name_snapshot',case when v_discount_id is null
      then null else v_discount.name end,
    'discount_type_snapshot',case when v_discount_id is null
      then null else v_discount.type end,
    'discount_value_snapshot',case when v_discount_id is null
      then null else v_discount.value end,
    'discount_amount',v_discount_amount,
    'discount',v_discount_amount,
    'taxable_subtotal',v_taxable_subtotal,
    'vat_setting_id_snapshot',v_vat.id,
    'vat_rate_snapshot',v_vat.rate,
    'vat_amount',v_vat_amount,
    'tax',v_vat_amount,
    'total',v_total,
    'payment_method',v_payment_method,
    'payment_status',v_payment_status,
    'cash_received',v_cash_received,
    'remaining_from_customer',v_remaining,
    'cash_change',v_change,
    'payment_snapshot',jsonb_build_object(
      'version','payment-snapshot-v1',
      'method',v_payment_method,
      'status',v_payment_status,
      'cash_received',v_cash_received,
      'remaining_from_customer',v_remaining,
      'cash_change',v_change,
      'cash_settlement_state',v_cash_settlement_state,
      'total',v_total,
      'currency_code','SAR'
    ),
    'pricing_rule_version','branch-override-catalog-fallback-v1',
    'vat_rule_version',v_vat_rule_version,
    'discount_rule_version',v_discount_rule_version,
    'rounding_version','numeric-round-half-away-2dp-v1',
    'payment_rule_version','payment-invariants-v1',
    'financial_engine_version','financial-engine-v2-r1',
    'financial_snapshot_version','financial-snapshot-v1',
    'financial_record_classification','authoritative_committed_snapshot',
    'financial_snapshot_complete',true,
    'financial_completeness_reasons','[]'::jsonb,
    'items',v_items_final
  );
  v_snapshot_hash := encode(
    extensions.digest(v_snapshot::text,'sha256'),'hex'
  );
  return jsonb_build_object(
    'snapshot',v_snapshot,
    'snapshot_hash',v_snapshot_hash
  );
end;
$function$;
create function public.create_order_atomic_v2(
  p_authorization jsonb,
  p_command jsonb,
  p_financial_snapshot jsonb,
  p_outbox_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_auth record;
  v_unknown_key text;
  v_context_token text;
  v_idempotency_key_hash text;
  v_user_id uuid;
  v_tenant_id uuid;
  v_branch_id uuid;
  v_employee_id uuid;
  v_correlation_id uuid;
  v_lease_owner uuid;
  v_idem public.idempotency_commands%rowtype;
  v_committed_idem public.idempotency_commands%rowtype;
  v_quote public.financial_quotes%rowtype;
  v_customer public.customers%rowtype;
  v_customer_result jsonb;
  v_financial_result jsonb;
  v_financial jsonb;
  v_financial_hash text;
  v_quoted_financial jsonb;
  v_quoted_financial_hash text;
  v_request_fingerprint text;
  v_customer_id uuid;
  v_order_id uuid := pg_catalog.gen_random_uuid();
  v_invoice_id uuid := pg_catalog.gen_random_uuid();
  v_order_number text;
  v_invoice_number text;
  v_transaction_at timestamptz := transaction_timestamp();
  v_period date;
  v_inventory_requirements jsonb;
  v_locked_inventory jsonb;
  v_inventory_result jsonb;
  v_invoice_item_id uuid;
  v_invoice_item_map jsonb := '[]'::jsonb;
  v_item jsonb;
  v_item_count integer := 0;
  v_expected_item_count integer;
  v_order_count integer := 0;
  v_invoice_count integer := 0;
  v_audit_count integer := 0;
  v_outbox_result jsonb;
  v_expected_outbox_count integer;
  v_customer_was_created boolean := false;
  v_result jsonb;
  v_result_hash text;
  v_updated_count integer;
begin
  /* 4S strict security envelope plus 4R.1 command/resource bounds. */
  if p_authorization is null
     or jsonb_typeof(p_authorization) <> 'object' then
    raise exception using errcode='22023',message='AUTH_CONTEXT_REQUIRED';
  end if;
  select k.key into v_unknown_key
  from jsonb_object_keys(p_authorization) as k(key)
  where k.key<>'authorization_context_token'
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode='22023',
      message='AUTH_CONTEXT_UNKNOWN_KEYS';
  end if;
  if jsonb_object_length(p_authorization)<>1
     or not (p_authorization ? 'authorization_context_token')
     or jsonb_typeof(p_authorization->'authorization_context_token')<>'string'
  then
    raise exception using errcode='22023',message='AUTH_CONTEXT_INVALID';
  end if;
  v_context_token:=p_authorization->>'authorization_context_token';
  if v_context_token is null
     or v_context_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='CONTEXT_TOKEN_INVALID';
  end if;

  if p_command is null or jsonb_typeof(p_command) <> 'object'
     or p_financial_snapshot is null
     or jsonb_typeof(p_financial_snapshot) <> 'object'
     or p_outbox_events is null
     or jsonb_typeof(p_outbox_events) <> 'array' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;
  if jsonb_array_length(p_outbox_events) <> 0 then
    raise exception using errcode = '22023', message = 'OUTBOX_EVENT_INVALID';
  end if;

  select k.key into v_unknown_key
  from jsonb_object_keys(p_command) as k(key)
  where k.key <> all(array[
    'command_type','branch_id',
    'idempotency_key_hash','request_fingerprint',
    'quote_id','quote_fingerprint','quote_hash','customer','note'
  ])
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023', message = 'COMMAND_UNKNOWN_KEYS';
  end if;

  if octet_length(p_command::text) > 1048576
     or octet_length(p_financial_snapshot::text) > 2097152
     or octet_length(p_outbox_events::text) > 262144
     or octet_length(p_authorization::text) > 1024
     or octet_length(p_command::text)
        + octet_length(p_financial_snapshot::text)
        + octet_length(p_outbox_events::text)
        + octet_length(p_authorization::text)
        > 3145728
     or octet_length(coalesce(p_command->'customer','{}'::jsonb)::text) > 65536
     or octet_length(p_financial_snapshot::text) > 2097152 then
    raise exception using errcode = '22023', message = 'COMMAND_TOO_LARGE';
  end if;

  if p_command->>'command_type' <> 'create_order' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;
  if coalesce(p_command->>'idempotency_key_hash','') !~
     '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_INVALID';
  end if;
  v_idempotency_key_hash:=p_command->>'idempotency_key_hash';
  if coalesce(p_command->>'branch_id','') !~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode='22023',message='COMMAND_INVALID';
  end if;
  if coalesce(p_command->>'request_fingerprint','') !~
     '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'REQUEST_FINGERPRINT_INVALID';
  end if;
  if coalesce(p_command->>'quote_id','') !~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;
  if coalesce(p_command->>'quote_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_command->>'quote_hash','') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'QUOTE_INVALID';
  end if;
  if p_financial_snapshot->'items' is null
     or jsonb_typeof(p_financial_snapshot->'items') <> 'array' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;
  if jsonb_array_length(p_financial_snapshot->'items') = 0
     or jsonb_array_length(p_financial_snapshot->'items') > 100
     or octet_length((p_financial_snapshot->'items')::text) > 1048576
     or jsonb_array_length(p_outbox_events) > 20 then
    raise exception using errcode = '22023', message = 'COMMAND_TOO_LARGE';
  end if;
  if p_command->'customer' is null
     or jsonb_typeof(p_command->'customer') <> 'object' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;

  v_request_fingerprint := public.build_atomic_request_fingerprint_v2(
    p_command,p_financial_snapshot
  );
  if coalesce(v_request_fingerprint,'') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001',
      message = 'REQUEST_FINGERPRINT_INVALID';
  end if;
  if v_request_fingerprint<>p_command->>'request_fingerprint' then
    raise exception using errcode='22023',
      message='REQUEST_FINGERPRINT_INVALID';
  end if;

  /*
  PostgreSQL owns the one committed correlation ID. The context is consumed
  before idempotency acquisition, so a committed replay requires a newly issued
  context bound to the same key hash. Consumption and every later stage share
  this transaction: any failure rolls consumption back.
  */
  v_correlation_id:=pg_catalog.gen_random_uuid();
  select * into strict v_auth
  from public.consume_atomic_authorization_context_v1(
    v_context_token,v_idempotency_key_hash,v_correlation_id
  );
  if v_auth.correlation_id is distinct from v_correlation_id then
    raise exception using errcode='P0001',
      message='CONTEXT_BINDING_INVALID';
  end if;
  v_user_id := v_auth.actor_user_id;
  v_tenant_id := v_auth.tenant_id;
  v_branch_id := v_auth.branch_id;
  v_employee_id := v_auth.employee_id;
  if (p_command->>'branch_id')::uuid is distinct from v_branch_id then
    raise exception using errcode='42501',
      message='CONTEXT_BINDING_INVALID';
  end if;

  v_idem := public.acquire_idempotency_command_v2(
    v_tenant_id, v_branch_id, 'create_order',
    v_idempotency_key_hash,
    v_request_fingerprint,
    v_user_id, v_employee_id, 'atomic-order-v2-r1', v_correlation_id
  );
  if v_idem.state = 'committed' then
    if v_idem.order_id is null or v_idem.invoice_id is null
       or v_idem.response_version <> 'atomic-order-response-v1'
       or v_idem.response_hash !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = 'P0001',
        message = 'IDEMPOTENCY_REPLAY_INVALID';
    end if;
    v_result := public.build_atomic_order_response_v1(
      v_idem.order_id,v_idem.invoice_id
    );
    v_result_hash := encode(
      extensions.digest(v_result::text,'sha256'),'hex'
    );
    if v_result_hash <> v_idem.response_hash then
      raise exception using errcode = 'P0001',
        message = 'IDEMPOTENCY_REPLAY_INVALID';
    end if;
    return v_result;
  end if;
  if coalesce(v_idem.lease_owner,'') !~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_LEASE_CONFLICT';
  end if;
  v_lease_owner := v_idem.lease_owner::uuid;

  /*
  Resolve/lock customer identity before financial derivation. Customer identity
  is tenant-scoped and ambiguity is a hard failure; no legacy winner is picked.
  */
  v_customer_result := public.resolve_customer_identity_result_v2(
    v_tenant_id, v_branch_id, v_user_id, p_command->'customer'
  );
  if v_customer_result is null
     or jsonb_typeof(v_customer_result) <> 'object'
     or coalesce(v_customer_result->>'customer_id','') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or jsonb_typeof(v_customer_result->'customer_was_created') <> 'boolean'
     or jsonb_typeof(v_customer_result->'customer_was_updated') <> 'boolean'
  then
    raise exception using errcode = 'P0001',
      message = 'CUSTOMER_PERSISTENCE_INVALID';
  end if;
  v_customer_id := (v_customer_result->>'customer_id')::uuid;
  /*
  create_new cannot resolve an existing identity: the resolver fails closed on
  conflicts. Consequently a successful create_new result is authoritative
  creation evidence; reuse/update are never classified as creation.
  */
  v_customer_was_created :=
    (v_customer_result->>'customer_was_created')::boolean;
  select * into strict v_customer
  from public.customers c
  where c.id = v_customer_id and c.tenant_id = v_tenant_id
  for share;

  /*
  4T parity boundary. Committed replay has already returned above. For a fresh
  command, lock the exact immutable context-bound quote and verify its complete
  evidence before deriving current financial state. No inventory, numbering or
  persistence stage has run yet.
  */
  select q.* into v_quote
  from public.financial_quotes q
  where q.id = nullif(p_command->>'quote_id', '')::uuid
  for share;
  if not found then
    raise exception using errcode='P0002',message='QUOTE_NOT_FOUND';
  end if;

  if v_quote.authorization_context_id is null
     or v_quote.authorization_context_id
        is distinct from v_auth.authorization_context_id
     or v_quote.issuer_context_version
        is distinct from 'atomic-auth-context-v1' then
    raise exception using errcode='42501',message='QUOTE_CONTEXT_INVALID';
  end if;
  if v_quote.tenant_id is distinct from v_tenant_id
     or v_quote.branch_id is distinct from v_branch_id then
    raise exception using errcode='42501',message='QUOTE_SCOPE_INVALID';
  end if;
  if v_quote.expires_at <= clock_timestamp() then
    raise exception using errcode='40001',message='QUOTE_EXPIRED';
  end if;

  if v_quote.quote_classification is distinct from 'advisory'
     or v_quote.quote_version is distinct from 'financial-quote-v1'
     or v_quote.financial_engine_version
        is distinct from 'financial-engine-v2-r1'
     or v_quote.request_fingerprint_version
        is distinct from 'atomic-request-fingerprint-v2'
     or v_quote.quote_snapshot_version
        is distinct from 'authoritative-quote-payload-v1'
     or v_quote.quote_payload->>'quote_payload_version'
        is distinct from 'authoritative-quote-payload-v1'
     or v_quote.quote_payload->>'quote_version'
        is distinct from 'financial-quote-v1'
     or v_quote.quote_payload->>'financial_engine_version'
        is distinct from 'financial-engine-v2-r1'
     or v_quote.quote_payload->>'request_fingerprint_version'
        is distinct from 'atomic-request-fingerprint-v2'
     or v_quote.quote_payload->>'issuer_context_version'
        is distinct from 'atomic-auth-context-v1' then
    raise exception using errcode='40001',message='QUOTE_VERSION_INVALID';
  end if;

  if v_quote.request_fingerprint is distinct from v_request_fingerprint
     or v_quote.quote_payload->>'request_fingerprint'
        is distinct from v_request_fingerprint
     or v_quote.quote_fingerprint
        is distinct from p_command->>'quote_fingerprint' then
    raise exception using
      errcode='40001',
      message='QUOTE_FINGERPRINT_MISMATCH';
  end if;

  if v_quote.quote_hash !~ '^[0-9a-f]{64}$'
     or v_quote.quote_hash is distinct from p_command->>'quote_hash'
     or public.verify_authoritative_quote_hash_v1(
       v_quote.quote_payload,v_quote.quote_hash
     ) is distinct from true then
    raise exception using errcode='40001',message='QUOTE_HASH_MISMATCH';
  end if;

  if jsonb_typeof(v_quote.quote_payload) is distinct from 'object'
     or jsonb_typeof(v_quote.quote_payload->'financial_snapshot')
        is distinct from 'object'
     or coalesce(v_quote.quote_payload->>'financial_snapshot_hash','')
        !~ '^[0-9a-f]{64}$'
     or v_quote.quote_payload->>'authorization_context_id'
        is distinct from v_auth.authorization_context_id::text
     or v_quote.quote_payload->>'tenant_id'
        is distinct from v_tenant_id::text
     or v_quote.quote_payload->>'branch_id'
        is distinct from v_branch_id::text
     or v_quote.quote_payload->'issued_at'
        is distinct from to_jsonb(v_quote.created_at)
     or v_quote.quote_payload->'expires_at'
        is distinct from to_jsonb(v_quote.expires_at) then
    raise exception using
      errcode='40001',
      message='QUOTE_FINANCIAL_SNAPSHOT_INVALID';
  end if;

  v_quoted_financial:=v_quote.quote_payload->'financial_snapshot';
  v_quoted_financial_hash:=
    v_quote.quote_payload->>'financial_snapshot_hash';

  if v_quote.financial_engine_version
       is distinct from v_quoted_financial->>'financial_engine_version'
     or v_quote.pricing_rule_version
       is distinct from v_quoted_financial->>'pricing_rule_version'
     or v_quote.vat_rule_version
       is distinct from v_quoted_financial->>'vat_rule_version'
     or v_quote.discount_rule_version
       is distinct from v_quoted_financial->>'discount_rule_version'
     or v_quote.rounding_version
       is distinct from v_quoted_financial->>'rounding_version'
     or v_quoted_financial->>'financial_snapshot_version'
       is distinct from 'financial-snapshot-v1'
     or encode(
       extensions.digest(v_quoted_financial::text,'sha256'),'hex'
     ) is distinct from v_quoted_financial_hash then
    raise exception using
      errcode='40001',
      message='QUOTE_FINANCIAL_SNAPSHOT_INVALID';
  end if;

  v_financial_result := public.derive_atomic_financial_snapshot_v2(
    v_tenant_id, v_branch_id, p_financial_snapshot
  );
  v_financial := v_financial_result->'snapshot';
  v_financial_hash := v_financial_result->>'snapshot_hash';
  if v_financial is null or jsonb_typeof(v_financial) <> 'object'
     or v_financial_hash !~ '^[0-9a-f]{64}$'
     or encode(extensions.digest(v_financial::text,'sha256'),'hex')
        <> v_financial_hash then
    raise exception using errcode = 'P0001',
      message = 'FINANCIAL_SNAPSHOT_INVALID';
  end if;

  /*
  Exact JSONB equality covers every normalized item, quantity, unit price,
  pricing source, line allocation, discount/VAT evidence, payment effect,
  currency and engine/rule version. Hash equality independently verifies the
  identical canonical jsonb::text representation used by Package 6B.
  */
  if v_financial is distinct from v_quoted_financial
     or v_financial_hash is distinct from v_quoted_financial_hash then
    raise exception using
      errcode='40001',
      message='QUOTE_FINANCIAL_SNAPSHOT_DRIFT';
  end if;

  v_expected_item_count := jsonb_array_length(v_financial->'items');
  if v_expected_item_count < 1
     or (select count(*) from jsonb_array_elements(v_financial->'items'))
        <> v_expected_item_count
     or (select count(distinct (i.value->>'line_number')::integer)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> v_expected_item_count
     or (select min((i.value->>'line_number')::integer)
         from jsonb_array_elements(v_financial->'items') i(value)) <> 1
     or (select max((i.value->>'line_number')::integer)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> v_expected_item_count
     or (select round(sum((i.value->>'gross_amount')::numeric),2)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> (v_financial->>'subtotal')::numeric
     or (select round(sum((i.value->>'discount_allocation')::numeric),2)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> (v_financial->>'discount_amount')::numeric
     or (select round(sum((i.value->>'taxable_amount')::numeric),2)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> (v_financial->>'taxable_subtotal')::numeric
     or (select round(sum((i.value->>'line_total')::numeric),2)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> (v_financial->>'taxable_subtotal')::numeric
     or round(
          (v_financial->>'taxable_subtotal')::numeric
          + (v_financial->>'vat_amount')::numeric,2
        ) <> (v_financial->>'total')::numeric then
    raise exception using errcode = 'P0001',
      message = 'FINANCIAL_RECONCILIATION_FAILED';
  end if;

  /*
  Package 2 generated order/invoice month columns use UTC, so Release 1 keeps
  UTC as the one numbering boundary. The transaction timestamp is stable for
  period selection and persisted dates. Package 6 must disable the legacy
  deduction/numbering triggers before this entry point can run.
  */
  v_period := date_trunc(
    'month',v_transaction_at at time zone 'UTC'
  )::date;
  perform public.assert_atomic_legacy_triggers_safe_v2();
  v_inventory_requirements := public.resolve_inventory_requirements_v2(
    v_tenant_id,v_branch_id,v_financial->'items'
  );
  v_locked_inventory := public.lock_and_validate_inventory_v2(
    v_tenant_id,v_branch_id,v_inventory_requirements
  );

  /* Number allocation occurs only after every stock row is locked/validated. */
  v_order_number := public.allocate_branch_monthly_number_v2(
    v_tenant_id, v_branch_id, v_period
  );
  v_invoice_number := v_order_number;

  begin
    insert into public.orders (
      id, order_number, customer_id, status, created_by, created_at,
      branch_id, tenant_id, created_by_employee_id,
      atomic_engine_version, financial_engine_version, correlation_id,
      idempotency_command_id, source_channel,
      customer_name_snapshot, customer_phone_snapshot,
      customer_record_version_snapshot
    )
    values (
      v_order_id, v_order_number, v_customer_id, 'in_progress', v_user_id,
      v_transaction_at, v_branch_id, v_tenant_id, v_employee_id,
      'atomic-order-v2-r1', v_financial->>'financial_engine_version',
      v_correlation_id, v_idem.id, 'atomic_rpc',
      v_customer.name, v_customer.phone, v_customer.record_version
    );
    get diagnostics v_order_count = row_count;
  exception
    when unique_violation then
      get stacked diagnostics v_unknown_key = constraint_name;
      if v_unknown_key = any(array[
        'idx_orders_tenant_branch_month_order_number_unique',
        'orders_monthly_order_number_unique'
      ]) then
        raise exception using errcode = '23505',
          message = 'NUMBER_ALLOCATION_CONFLICT';
      end if;
      if v_unknown_key = 'orders_pkey' then
        raise exception using errcode = '23505',
          message = 'ORDER_PERSISTENCE_CONFLICT';
      end if;
      raise;
  end;

  begin
    insert into public.invoices (
    id, invoice_number, order_id, customer_id, payment_method,
    payment_status, subtotal, discount, tax, total, note, created_by, created_at,
    cash_received, remaining_from_customer, cash_change, branch_id, tenant_id,
    atomic_engine_version, correlation_id, financial_quote_id,
    quote_fingerprint, financial_snapshot_version, financial_snapshot_hash,
    financial_snapshot_complete, financial_completeness_reasons,
    request_fingerprint, request_fingerprint_version, quote_version,
    financial_engine_version, payment_snapshot,
    customer_name_snapshot, customer_phone_snapshot,
    customer_email_snapshot, customer_record_version_snapshot,
    currency_code, discount_id_snapshot, discount_name_snapshot,
    discount_type_snapshot, discount_value_snapshot, discount_amount,
    taxable_subtotal, vat_setting_id_snapshot, vat_rate_snapshot, vat_amount,
    payment_rule_version, pricing_rule_version, vat_rule_version,
    discount_rule_version, rounding_version, financial_record_classification
  )
    values (
    v_invoice_id, v_invoice_number, v_order_id, v_customer_id,
    v_financial->>'payment_method', v_financial->>'payment_status',
    (v_financial->>'subtotal')::numeric,
    (v_financial->>'discount_amount')::numeric,
    (v_financial->>'vat_amount')::numeric,
    (v_financial->>'total')::numeric,
    nullif(p_command->>'note', ''), v_user_id, v_transaction_at,
    (v_financial->>'cash_received')::numeric,
    (v_financial->>'remaining_from_customer')::numeric,
    (v_financial->>'cash_change')::numeric,
    v_branch_id, v_tenant_id, 'atomic-order-v2-r1', v_correlation_id,
    v_quote.id, v_quote.quote_fingerprint, 'financial-snapshot-v1',
    v_financial_hash,
    (v_financial->>'financial_snapshot_complete')::boolean,
    v_financial->'financial_completeness_reasons',
    v_request_fingerprint, 'atomic-request-fingerprint-v2',
    v_quote.quote_version, v_financial->>'financial_engine_version',
    v_financial->'payment_snapshot',
    v_customer.name, v_customer.phone, v_customer.email,
    v_customer.record_version,
    v_financial->>'currency_code',
    nullif(v_financial->>'discount_id_snapshot','')::uuid,
    v_financial->>'discount_name_snapshot',
    v_financial->>'discount_type_snapshot',
    nullif(v_financial->>'discount_value_snapshot','')::numeric,
    (v_financial->>'discount_amount')::numeric,
    (v_financial->>'taxable_subtotal')::numeric,
    (v_financial->>'vat_setting_id_snapshot')::uuid,
    (v_financial->>'vat_rate_snapshot')::numeric,
    (v_financial->>'vat_amount')::numeric,
    v_financial->>'payment_rule_version',
    v_financial->>'pricing_rule_version',
    v_financial->>'vat_rule_version',
    v_financial->>'discount_rule_version',
    v_financial->>'rounding_version',
    v_financial->>'financial_record_classification'
    );
    get diagnostics v_invoice_count = row_count;
  exception
    when unique_violation then
      get stacked diagnostics v_unknown_key = constraint_name;
      if v_unknown_key = any(array[
        'idx_invoices_tenant_branch_month_invoice_number_unique',
        'invoices_monthly_invoice_number_unique'
      ]) then
        raise exception using errcode = '23505',
          message = 'NUMBER_ALLOCATION_CONFLICT';
      end if;
      if v_unknown_key = 'invoices_pkey' then
        raise exception using errcode = '23505',
          message = 'INVOICE_PERSISTENCE_CONFLICT';
      end if;
      raise;
  end;

  for v_item in select value from jsonb_array_elements(v_financial->'items')
  loop
    v_invoice_item_id := pg_catalog.gen_random_uuid();
    insert into public.invoice_items (
      id, invoice_id, item_id, item_name_snapshot, item_type_snapshot,
      quantity, unit_price, line_total, item_category_snapshot,
      cost_price, tenant_id, line_number, price_source,
      pricing_snapshot, inventory_snapshot_version,
      gross_amount, discount_allocation, taxable_amount,
      source_branch_price_id, source_catalog_updated_at,
      source_branch_price_updated_at, cost_snapshot, profit_snapshot,
      cost_snapshot_status, cost_snapshot_version,
      inventory_tracking_mode, inventory_movement_correlation_id
    )
    values (
      v_invoice_item_id,v_invoice_id,
      nullif(v_item->>'catalog_item_id','')::uuid,
      v_item->>'name', v_item->>'item_type',
      (v_item->>'quantity')::integer, (v_item->>'unit_price')::numeric,
      (v_item->>'line_total')::numeric, v_item->>'category',
      coalesce((v_item->>'cost_price')::numeric, 0), v_tenant_id,
      (v_item->>'line_number')::integer,
      v_item->>'price_source', v_item->'pricing_snapshot',
      'inventory-snapshot-v1',
      (v_item->>'gross_amount')::numeric,
      (v_item->>'discount_allocation')::numeric,
      (v_item->>'taxable_amount')::numeric,
      nullif(v_item->>'source_branch_price_id','')::uuid,
      nullif(v_item->>'source_catalog_updated_at','')::timestamptz,
      nullif(v_item->>'source_branch_price_updated_at','')::timestamptz,
      (v_item->>'cost_snapshot')::numeric,
      (v_item->>'profit_snapshot')::numeric,
      v_item->>'cost_snapshot_status',
      v_item->>'cost_snapshot_version',
      v_item->>'inventory_tracking_mode',
      v_correlation_id::text
    );
    get diagnostics v_updated_count = row_count;
    if v_updated_count <> 1 then
      raise exception using errcode = 'P0001',
        message = 'INVOICE_ITEM_PERSISTENCE_INVALID';
    end if;
    if v_item->>'inventory_tracking_mode' = 'tracked_product' then
      v_invoice_item_map := v_invoice_item_map || jsonb_build_array(
        jsonb_build_object(
          'catalog_item_id',v_item->>'catalog_item_id',
          'invoice_item_id',v_invoice_item_id
        )
      );
    end if;
    v_item_count := v_item_count + 1;
  end loop;
  if v_item_count = 0 then
    raise exception using errcode = '22023', message = 'EMPTY_CART';
  end if;
  if v_order_count <> 1 then
    raise exception using errcode = 'P0001',
      message = 'ORDER_PERSISTENCE_INVALID';
  end if;
  if v_invoice_count <> 1 then
    raise exception using errcode = 'P0001',
      message = 'INVOICE_PERSISTENCE_INVALID';
  end if;
  if v_item_count <> v_expected_item_count then
    raise exception using errcode = 'P0001',
      message = 'INVOICE_ITEM_PERSISTENCE_INVALID';
  end if;

  v_inventory_result := public.apply_inventory_mutations_v2(
    v_tenant_id,v_branch_id,v_order_id,v_invoice_id,v_user_id,
    v_correlation_id,v_locked_inventory,v_invoice_item_map
  );

  begin
    insert into public.audit_logs (
    tenant_id, branch_id, actor_user_id, actor_role, employee_id,
    action, event_type, entity_type, entity_id, metadata,
    order_id, invoice_id, customer_id, request_fingerprint,
    quote_fingerprint, before_snapshot, after_snapshot,
    correlation_id, audit_schema_version, created_at
  )
  values (
    v_tenant_id,v_branch_id,v_user_id,v_auth.actor_role,v_employee_id,
    'order.created.atomic_v2','order_created','order',v_order_id::text,
    jsonb_build_object(
      'authorization_source',v_auth.authorization_source,
      'authorization_context_id',v_auth.authorization_context_id,
      'idempotency_command_id',v_idem.id,
      'financial_quote_id',v_quote.id,
      'quote_version',v_quote.quote_version,
      'quote_snapshot_hash',v_quoted_financial_hash,
      'derived_snapshot_hash',v_financial_hash,
      'financial_parity_result','exact_match'
    ),
    v_order_id,v_invoice_id,v_customer_id,
    v_request_fingerprint,v_quote.quote_fingerprint,null,
    jsonb_build_object(
      'number',v_order_number,
      'item_count',v_item_count,
      'currency_code',v_financial->>'currency_code',
      'total',(v_financial->>'total')::numeric,
      'payment_method',v_financial->>'payment_method',
      'payment_status',v_financial->>'payment_status',
      'financial_snapshot_hash',v_financial_hash,
      'inventory_engine_version',
        v_inventory_result->>'inventory_engine_version',
      'inventory_evidence_refs',v_inventory_result->'evidence_refs',
      'atomic_engine_version','atomic-order-v2-r1',
      'financial_engine_version',v_financial->>'financial_engine_version'
    ),
    v_correlation_id,'atomic-audit-v1',v_transaction_at
    );
  exception
    when check_violation then
      get stacked diagnostics v_unknown_key = constraint_name;
      if v_unknown_key = any(array[
        'ck_audit_logs_request_fingerprint',
        'ck_audit_logs_quote_fingerprint',
        'ck_audit_logs_correlation_id',
        'ck_audit_logs_snapshots',
        'ck_audit_logs_schema_version'
      ]) then
        raise exception using errcode = 'P0001',
          message = 'AUDIT_PERSISTENCE_INVALID';
      end if;
      raise;
    when unique_violation then
      get stacked diagnostics v_unknown_key = constraint_name;
      if v_unknown_key = 'audit_logs_pkey' then
        raise exception using errcode = '23505',
          message = 'AUDIT_PERSISTENCE_INVALID';
      end if;
      raise;
  end;
  get diagnostics v_audit_count = row_count;
  if v_audit_count <> 1 then
    raise exception using errcode = 'P0001',
      message = 'AUDIT_PERSISTENCE_INVALID';
  end if;

  v_outbox_result := public.enqueue_atomic_outbox_v2(
    v_tenant_id,v_branch_id,v_order_id,v_invoice_id,v_customer_id,
    v_customer_was_created,v_order_number,v_financial->>'currency_code',
    (v_financial->>'total')::numeric,v_financial->>'payment_method',
    v_financial->>'payment_status',v_financial_hash,v_inventory_result,
    v_correlation_id,v_transaction_at
  );
  v_expected_outbox_count := 1
    + case when v_customer_was_created then 1 else 0 end
    + case when (v_inventory_result->>'tracked_items_mutated')::integer > 0
        then 1 else 0 end;
  if (v_outbox_result->>'events_inserted')::integer
       <> v_expected_outbox_count
     or jsonb_array_length(v_outbox_result->'payload_hashes')
       <> v_expected_outbox_count
     or exists (
       select 1
       from public.atomic_outbox o
       where o.correlation_id = v_correlation_id::text
         and o.payload_hash <> encode(
           extensions.digest(o.payload::text,'sha256'),'hex'
         )
     )
     or (select count(*)
         from public.atomic_outbox o
         where o.correlation_id = v_correlation_id::text)
        <> v_expected_outbox_count then
    raise exception using errcode = 'P0001',
      message = 'ATOMIC_EVIDENCE_INCOMPLETE';
  end if;

  if (v_inventory_result->>'movements_inserted')::integer
       <> (v_locked_inventory->>'locked_count')::integer
     or (v_inventory_result->>'tracked_items_mutated')::integer
       <> (v_locked_inventory->>'locked_count')::integer then
    raise exception using errcode = 'P0001',
      message = 'ATOMIC_EVIDENCE_INCOMPLETE';
  end if;

  v_result := public.build_atomic_order_response_v1(v_order_id,v_invoice_id);
  v_result_hash := encode(extensions.digest(v_result::text, 'sha256'), 'hex');

  update public.idempotency_commands
  set state = 'committed', order_id = v_order_id, invoice_id = v_invoice_id,
      response_version = 'atomic-order-response-v1',
      response_hash = v_result_hash, committed_at = clock_timestamp(),
      lease_owner = null, lease_expires_at = null,
      recovery_completed_at = case
        when recovery_started_at is null then null else clock_timestamp()
      end,
      failed_at = null, last_error_code = null,
      updated_at = clock_timestamp()
  where id = v_idem.id
    and state = 'started'
    and lease_owner = v_lease_owner::text
    and order_id is null
    and invoice_id is null;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_COMMIT_CONFLICT';
  end if;

  select * into v_committed_idem
  from public.idempotency_commands
  where id = v_idem.id;
  if not found
     or v_committed_idem.state <> 'committed'
     or v_committed_idem.lease_owner is not null
     or v_committed_idem.order_id <> v_order_id
     or v_committed_idem.invoice_id <> v_invoice_id
     or v_committed_idem.response_version <> 'atomic-order-response-v1'
     or v_committed_idem.response_hash <> v_result_hash then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_COMMIT_CONFLICT';
  end if;

  return v_result;
end;
$function$;

/*
Package 4 closes the default function-exposure window itself. Package 5 owns
final ownership/RLS and Package 6 owns the eventual approved entry-point grant.
No helper or entry point is executable by browser or service roles here.
*/
create function public.issue_atomic_authorization_context_v1(
  p_requested_branch_id uuid,
  p_idempotency_key_hash text,
  p_server_request_id text default null
)
returns table(context_id uuid,context_token text,expires_at timestamptz)
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_profile public.profiles%rowtype;
  v_branch_id uuid;
  v_token text;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',
      message='CONTEXT_IDEMPOTENCY_HASH_INVALID';
  end if;
  if p_server_request_id is not null
     and length(p_server_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='CONTEXT_SCOPE_INVALID';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id=v_user_id and p.tenant_id is not null
    and coalesce(p.is_active,true)=true
  for share;
  if not found then
    raise exception using errcode='42501',
      message='CONTEXT_ISSUER_NOT_AUTHORIZED';
  end if;
  if v_profile.role not in ('owner','admin','manager','employee','cashier') then
    raise exception using errcode='42501',message='CONTEXT_ROLE_INVALID';
  end if;

  if v_profile.role in ('owner','admin','manager') then
    v_branch_id:=p_requested_branch_id;
  else
    if p_requested_branch_id is not null
       and p_requested_branch_id is distinct from v_profile.branch_id then
      raise exception using errcode='42501',message='CONTEXT_SCOPE_INVALID';
    end if;
    v_branch_id:=v_profile.branch_id;
  end if;
  if v_branch_id is null or not exists (
    select 1 from public.branches b
    where b.id=v_branch_id and b.tenant_id=v_profile.tenant_id
  ) then
    raise exception using errcode='42501',message='CONTEXT_SCOPE_INVALID';
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  if v_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='55000',
      message='CONTEXT_TOKEN_GENERATION_FAILED';
  end if;
  v_expires_at:=clock_timestamp()+interval '5 minutes';

  return query
  insert into public.atomic_authorization_contexts as c(
    context_secret_hash,authenticated_user_id,tenant_id,branch_id,
    profile_employee_id,actor_role,authorization_source,purpose,
    idempotency_key_hash,context_version,issued_by_service,issuer_version,
    server_request_id,state,issued_at,expires_at
  ) values (
    encode(extensions.digest(v_token,'sha256'),'hex'),
    v_user_id,v_profile.tenant_id,v_branch_id,
    case when v_profile.role in ('employee','cashier') then v_user_id end,
    v_profile.role,'authenticated_user_jwt','create_order_atomic_v2',
    p_idempotency_key_hash,'atomic-auth-context-v1',
    'afex_context_issuer','issue-atomic-context-v1',
    p_server_request_id,'issued',clock_timestamp(),v_expires_at
  )
  returning c.context_id,v_token,v_expires_at;
end;
$function$;
create function public.issue_pos_atomic_authorization_context_v1(
  p_raw_pin text,
  p_requested_branch_id uuid,
  p_idempotency_key_hash text,
  p_server_request_id text default null
)
returns table(context_id uuid,context_token text,expires_at timestamptz)
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_profile public.profiles%rowtype;
  v_pos_id uuid;
  v_pos_role text;
  v_pos_branch_id uuid;
  v_count integer;
  v_token text;
  v_verified_at timestamptz;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_raw_pin !~ '^[0-9]{4}$' then
    raise exception using errcode='28000',message='POS_AUTHENTICATION_FAILED';
  end if;
  if p_idempotency_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',
      message='CONTEXT_IDEMPOTENCY_HASH_INVALID';
  end if;
  if p_server_request_id is not null
     and length(p_server_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='CONTEXT_SCOPE_INVALID';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id=v_user_id and p.tenant_id is not null
    and coalesce(p.is_active,true)=true
  for share;
  if not found then
    raise exception using errcode='42501',
      message='CONTEXT_ISSUER_NOT_AUTHORIZED';
  end if;

  select count(*)
  into v_count
  from public.verify_pos_pin_for_actor(
    p_raw_pin,v_user_id,p_requested_branch_id
  ) x;
  if v_count<>1 then
    raise exception using errcode='28000',message='POS_AUTHENTICATION_FAILED';
  end if;
  select x.id,x.role,x.branch_id
  into v_pos_id,v_pos_role,v_pos_branch_id
  from public.verify_pos_pin_for_actor(
    p_raw_pin,v_user_id,p_requested_branch_id
  ) x;
  if v_pos_role not in ('admin','manager','employee','cashier')
     or v_pos_branch_id is null then
    raise exception using errcode='42501',message='POS_SCOPE_INVALID';
  end if;

  select pp.id,pp.role,pp.branch_id
  into v_pos_id,v_pos_role,v_pos_branch_id
  from public.pos_profiles pp
  where pp.id=v_pos_id and pp.tenant_id=v_profile.tenant_id
    and pp.branch_id=v_pos_branch_id and pp.is_active=true
    and pp.role in ('admin','manager','employee','cashier')
  for share;
  if not found then
    raise exception using errcode='42501',message='POS_ACTOR_NOT_ACTIVE';
  end if;

  v_verified_at:=clock_timestamp();
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_issued_at:=clock_timestamp();
  v_expires_at:=v_issued_at+interval '5 minutes';

  return query
  insert into public.atomic_authorization_contexts as c(
    context_secret_hash,authenticated_user_id,tenant_id,branch_id,
    pos_profile_id,pos_verified_at,pos_verification_version,
    actor_role,authorization_source,purpose,idempotency_key_hash,
    context_version,issued_by_service,issuer_version,server_request_id,
    state,issued_at,expires_at
  ) values (
    encode(extensions.digest(v_token,'sha256'),'hex'),
    v_user_id,v_profile.tenant_id,v_pos_branch_id,v_pos_id,
    v_verified_at,'verify_pos_pin_for_actor-v1',
    v_pos_role,'pos_pin_server','create_order_atomic_v2',
    p_idempotency_key_hash,'atomic-auth-context-v1',
    'afex_context_issuer','issue-pos-context-v1',p_server_request_id,
    'issued',v_issued_at,v_expires_at
  )
  returning c.context_id,v_token,v_expires_at;
end;
$function$;
create function public.revoke_atomic_authorization_context_v1(
  p_context_id uuid,
  p_reason_code text
)
returns boolean
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_row public.atomic_authorization_contexts%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_reason_code is null or length(p_reason_code) not between 1 and 128
     or p_reason_code !~ '^[A-Z0-9_]+$' then
    raise exception using errcode='22023',message='CONTEXT_SCOPE_INVALID';
  end if;
  select * into v_row
  from public.atomic_authorization_contexts c
  where c.context_id=p_context_id
  for update;
  if not found or v_row.authenticated_user_id<>v_user_id then
    raise exception using errcode='42501',
      message='CONTEXT_ISSUER_NOT_AUTHORIZED';
  end if;
  if v_row.state<>'issued' then
    raise exception using errcode='55000',message='CONTEXT_NOT_ISSUED';
  end if;
  update public.atomic_authorization_contexts
  set state='revoked',revoked_at=clock_timestamp(),
      revoked_by_user_id=v_user_id,revocation_reason_code=p_reason_code,
      updated_at=clock_timestamp()
  where context_id=p_context_id and state='issued';
  if not found then
    raise exception using errcode='40001',
      message='CONTEXT_CONSUMPTION_CONFLICT';
  end if;
  return true;
end;
$function$;

-- Internal only: Package 4 must call this inside the sale transaction.

create function public.validate_atomic_authorization_context_internal_v1(
  p_context_token text,
  p_mode text,
  p_expected_idempotency_key_hash text default null,
  p_correlation_id uuid default null
)
returns table(
  authorization_context_id uuid,
  actor_user_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text,
  employee_id uuid,
  authorization_source text,
  idempotency_key_hash text,
  context_version text,
  expires_at timestamptz,
  correlation_id uuid
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_hash text;
  v_context public.atomic_authorization_contexts%rowtype;
begin
  if p_context_token is null
     or p_context_token !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'CONTEXT_TOKEN_INVALID';
  end if;
  if p_mode not in ('non_consuming_quote','consuming_order') then
    raise exception using
      errcode = '22023',
      message = 'CONTEXT_VALIDATION_MODE_INVALID';
  end if;
  if p_mode = 'consuming_order'
     and (
       p_expected_idempotency_key_hash !~ '^[0-9a-f]{64}$'
       or p_correlation_id is null
     ) then
    raise exception using
      errcode = '22023',
      message = 'CONTEXT_TOKEN_INVALID';
  end if;
  if p_mode = 'non_consuming_quote'
     and (
       p_expected_idempotency_key_hash is not null
       or p_correlation_id is not null
     ) then
    raise exception using
      errcode = '22023',
      message = 'CONTEXT_VALIDATION_MODE_INVALID';
  end if;

  v_hash := encode(extensions.digest(p_context_token, 'sha256'), 'hex');

  if p_mode = 'consuming_order' then
    select * into v_context
    from public.atomic_authorization_contexts c
    where c.context_secret_hash = v_hash
    for update;
  else
    /*
    FOR SHARE blocks consume/revoke until quote issuance commits, but does not
    serialize independent readers. The unique context quote index resolves two
    concurrent quote issuers without creating a second quote.
    */
    select * into v_context
    from public.atomic_authorization_contexts c
    where c.context_secret_hash = v_hash
    for share;
  end if;

  if not found then
    raise exception using errcode = '28000', message = 'CONTEXT_NOT_FOUND';
  end if;
  if v_context.state = 'revoked' then
    raise exception using errcode = '28000', message = 'CONTEXT_REVOKED';
  elsif v_context.state = 'consumed' then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_ALREADY_CONSUMED';
  elsif v_context.state <> 'issued' then
    raise exception using errcode = '28000', message = 'CONTEXT_NOT_ISSUED';
  end if;
  if v_context.expires_at <= clock_timestamp() then
    raise exception using errcode = '28000', message = 'CONTEXT_EXPIRED';
  end if;
  if v_context.purpose <> 'create_order_atomic_v2' then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_PURPOSE_INVALID';
  end if;
  if v_context.context_version <> 'atomic-auth-context-v1' then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_VERSION_INVALID';
  end if;
  if p_mode = 'consuming_order'
     and v_context.idempotency_key_hash
       <> p_expected_idempotency_key_hash then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;
  if v_context.authorization_source not in (
    'authenticated_user_jwt','pos_pin_server'
  ) then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_context.authenticated_user_id
      and p.tenant_id = v_context.tenant_id
      and p.is_active = true
  )
  or not exists (
    select 1
    from public.branches b
    where b.id = v_context.branch_id
      and b.tenant_id = v_context.tenant_id
  ) then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;

  if v_context.authorization_source = 'authenticated_user_jwt'
     and not exists (
       select 1
       from public.profiles p
       where p.id = v_context.authenticated_user_id
         and p.tenant_id = v_context.tenant_id
         and p.is_active = true
         and p.role = v_context.actor_role
         and (
           (
             p.role in ('owner','admin','manager')
             and v_context.profile_employee_id is null
           )
           or
           (
             p.role in ('employee','cashier')
             and p.branch_id = v_context.branch_id
             and v_context.profile_employee_id = p.id
           )
         )
     ) then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;

  if v_context.authorization_source = 'pos_pin_server'
     and not exists (
       select 1
       from public.pos_profiles pp
       where pp.id = v_context.pos_profile_id
         and pp.tenant_id = v_context.tenant_id
         and pp.branch_id = v_context.branch_id
         and pp.is_active = true
         and pp.role = v_context.actor_role
         and pp.role in ('admin','manager','employee','cashier')
     ) then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;

  if p_mode = 'consuming_order' then
    update public.atomic_authorization_contexts
    set state = 'consumed',
        used_at = clock_timestamp(),
        consumed_correlation_id = p_correlation_id,
        updated_at = clock_timestamp()
    where context_id = v_context.context_id
      and state = 'issued';

    if not found then
      raise exception using
        errcode = '40001',
        message = 'CONTEXT_CONSUMPTION_CONFLICT';
    end if;
  end if;

  return query select
    v_context.context_id,
    v_context.authenticated_user_id,
    v_context.tenant_id,
    v_context.branch_id,
    v_context.actor_role,
    v_context.employee_id,
    v_context.authorization_source,
    v_context.idempotency_key_hash,
    v_context.context_version,
    v_context.expires_at,
    p_correlation_id;
end;
$function$;

-- ===========================================================================
create function public.consume_atomic_authorization_context_v1(
  p_context_token text,
  p_expected_idempotency_key_hash text,
  p_correlation_id uuid
)
returns table(
  authorization_context_id uuid,
  actor_user_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text,
  employee_id uuid,
  authorization_source text,
  correlation_id uuid
)
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
begin
  /*
  Package 6B is the single source of token hashing, row locking, state,
  expiry, purpose/version, current profile/POS binding and transactional
  consumption. Additional internal columns are deliberately not exposed.
  Helper errors propagate unchanged.
  */
  return query
  select
    shared.authorization_context_id,
    shared.actor_user_id,
    shared.tenant_id,
    shared.branch_id,
    shared.actor_role,
    shared.employee_id,
    shared.authorization_source,
    shared.correlation_id
  from public.validate_atomic_authorization_context_internal_v1(
    p_context_token,
    'consuming_order',
    p_expected_idempotency_key_hash,
    p_correlation_id
  ) shared;
end;
$function$;

-- ===========================================================================
-- G. OUTBOX WORKER FUNCTIONS
-- ===========================================================================
create function public.claim_atomic_outbox_events_v1(
  p_lease_owner text,
  p_batch_size integer default 25,
  p_lease_seconds integer default 60
)
returns table(
  id uuid,event_id uuid,tenant_id uuid,branch_id uuid,event_type text,
  aggregate_id uuid,aggregate_type text,payload_version text,payload jsonb,
  payload_hash text,correlation_id text,attempt_count integer
)
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
begin
  if p_lease_owner is null or length(p_lease_owner) not between 16 and 128
     or p_lease_owner !~ '^[A-Za-z0-9._:-]+$'
     or p_batch_size not between 1 and 100
     or p_lease_seconds not between 15 and 300 then
    raise exception using errcode='22023',message='OUTBOX_CLAIM_INVALID';
  end if;
  return query
  with candidates as (
    select o.id
    from public.atomic_outbox o
    where (
      (o.execution_status in ('pending_commit','retryable')
       and o.next_attempt_at<=clock_timestamp())
      or
      (o.execution_status='processing'
       and o.lease_expires_at<=clock_timestamp())
    )
    order by o.next_attempt_at,o.created_at,o.id
    for update skip locked
    limit p_batch_size
  ),
  claimed as (
    update public.atomic_outbox o
    set execution_status='processing',lease_owner=p_lease_owner,
        lease_expires_at=clock_timestamp()
          + make_interval(secs=>p_lease_seconds),
        attempt_count=o.attempt_count+1,updated_at=clock_timestamp()
    from candidates c where o.id=c.id
    returning o.*
  )
  select c.id,c.event_id,c.tenant_id,c.branch_id,c.event_type,
    c.aggregate_id,c.aggregate_type,c.payload_version,c.payload,
    c.payload_hash,c.correlation_id,c.attempt_count
  from claimed c
  order by c.next_attempt_at,c.created_at,c.id;
end;
$function$;
create function public.complete_atomic_outbox_event_v1(
  p_event_id uuid,
  p_lease_owner text
)
returns boolean
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
begin
  if p_event_id is null or p_lease_owner is null
     or length(p_lease_owner) not between 16 and 128 then
    raise exception using errcode='22023',
      message='OUTBOX_COMPLETION_CONFLICT';
  end if;
  update public.atomic_outbox
  set execution_status='delivered',delivered_at=clock_timestamp(),
      lease_owner=null,lease_expires_at=null,last_error_code=null,
      last_error_classification=null,last_error_message=null,
      updated_at=clock_timestamp()
  where event_id=p_event_id and execution_status='processing'
    and lease_owner=p_lease_owner and lease_expires_at>clock_timestamp();
  if not found then
    raise exception using errcode='40001',
      message='OUTBOX_COMPLETION_CONFLICT';
  end if;
  return true;
end;
$function$;
create function public.fail_atomic_outbox_event_v1(
  p_event_id uuid,
  p_lease_owner text,
  p_error_code text,
  p_error_classification text,
  p_error_message text
)
returns text
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
declare
  v_row public.atomic_outbox%rowtype;
  v_status text;
  v_retry integer;
  v_delay_seconds integer;
begin
  if p_event_id is null or p_lease_owner is null
     or length(p_lease_owner) not between 16 and 128
     or p_error_code is null or length(p_error_code) not between 1 and 128
     or p_error_code !~ '^[A-Z0-9_]+$'
     or p_error_classification is null
     or length(p_error_classification) not between 1 and 128
     or p_error_message is null
     or length(p_error_message) not between 1 and 1000 then
    raise exception using errcode='22023',message='OUTBOX_FAILURE_INVALID';
  end if;
  select * into v_row from public.atomic_outbox o
  where o.event_id=p_event_id and o.execution_status='processing'
    and o.lease_owner=p_lease_owner
  for update;
  if not found then
    raise exception using errcode='40001',message='OUTBOX_LEASE_CONFLICT';
  end if;
  v_retry:=v_row.retry_count+1;
  v_status:=case when v_row.attempt_count>=8
    then 'dead_letter' else 'retryable' end;
  v_delay_seconds:=least(3600,30*(2^least(v_retry-1,7))::integer);
  update public.atomic_outbox
  set execution_status=v_status,retry_count=v_retry,
      next_attempt_at=case when v_status='retryable'
        then clock_timestamp()+make_interval(secs=>v_delay_seconds)
        else next_attempt_at end,
      lease_owner=null,lease_expires_at=null,
      last_error_code=p_error_code,
      last_error_classification=p_error_classification,
      last_error_message=p_error_message,updated_at=clock_timestamp()
  where id=v_row.id and execution_status='processing'
    and lease_owner=p_lease_owner;
  if not found then
    raise exception using errcode='40001',message='OUTBOX_LEASE_CONFLICT';
  end if;
  return v_status;
end;
$function$;

-- ===========================================================================

create function public.reject_core_v2_immutable_change_v1()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'CORE_V2_IMMUTABLE_EVIDENCE';
end;
$function$;

create trigger trg_core_v2_verification_evidence_immutable
before update or delete on public.core_v2_verification_evidence
for each row execute function public.reject_core_v2_immutable_change_v1();

create function public.touch_core_v2_control_row_v1()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  new.updated_at := clock_timestamp();
  new.record_version := old.record_version + 1;
  return new;
end;
$function$;

create trigger trg_touch_core_v2_activation_control
before update on public.core_v2_activation_control
for each row execute function public.touch_core_v2_control_row_v1();
create trigger trg_touch_core_v2_tenant_activation
before update on public.core_v2_tenant_activation
for each row execute function public.touch_core_v2_control_row_v1();
create trigger trg_touch_core_v2_branch_activation
before update on public.core_v2_branch_activation
for each row execute function public.touch_core_v2_control_row_v1();
create trigger trg_touch_core_v2_managed_identities
before update on public.core_v2_managed_identities
for each row execute function public.touch_core_v2_control_row_v1();
create trigger trg_touch_core_v2_rate_limit_config
before update on public.core_v2_issuer_rate_limit_config
for each row execute function public.touch_core_v2_control_row_v1();

-- ===========================================================================
-- H. DETERMINISTIC, SERVER-AUTHORITATIVE CANARY DECISION
-- ===========================================================================

create function public.is_core_v2_request_enabled_v1(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_stable_command_identity text,
  p_feature text
)
returns table(
  enabled boolean,
  decision_reason text,
  activation_version text,
  canary_bucket integer
)
language plpgsql
stable
parallel safe
security definer
set search_path = pg_catalog
as $function$
declare
  v_control public.core_v2_activation_control%rowtype;
  v_tenant public.core_v2_tenant_activation%rowtype;
  v_branch public.core_v2_branch_activation%rowtype;
  v_digest text;
  v_bucket integer;
  v_feature_global boolean;
  v_feature_tenant boolean;
  v_feature_branch boolean;
begin
  if p_tenant_id is null
     or p_stable_command_identity is null
     or length(p_stable_command_identity) not between 16 and 256
     or p_feature not in ('pos','admin_orders','quote','outbox_worker') then
    return query select false, 'INVALID_DECISION_INPUT', null::text, null::integer;
    return;
  end if;

  select * into v_control
  from public.core_v2_activation_control
  where singleton_id = true;

  if not found then
    return query select false, 'ACTIVATION_CONTROL_MISSING', null::text, null::integer;
    return;
  end if;

  if v_control.kill_switch or not v_control.global_enabled then
    return query select
      false,
      case when v_control.kill_switch
        then 'KILL_SWITCH_ACTIVE'
        else 'GLOBAL_DISABLED'
      end,
      v_control.activation_version,
      null::integer;
    return;
  end if;

  select * into v_tenant
  from public.core_v2_tenant_activation
  where tenant_id = p_tenant_id;
  if not found or not v_tenant.enabled or not v_tenant.canary_eligible then
    return query select
      false, 'TENANT_NOT_ENABLED', v_control.activation_version, null::integer;
    return;
  end if;

  if p_branch_id is not null then
    select * into v_branch
    from public.core_v2_branch_activation
    where tenant_id = p_tenant_id and branch_id = p_branch_id;
    if not found or not v_branch.enabled or not v_branch.canary_eligible then
      return query select
        false, 'BRANCH_NOT_ENABLED', v_control.activation_version, null::integer;
      return;
    end if;
  end if;

  v_digest := encode(
    extensions.digest(
      convert_to(
        p_tenant_id::text || '|' ||
        coalesce(p_branch_id::text, '<NULL_BRANCH>') || '|' ||
        p_stable_command_identity || '|' ||
        v_control.canary_seed || '|' ||
        v_control.canary_algorithm_version,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_bucket := (('x' || substr(v_digest, 1, 8))::bit(32)::bigint % 100)::integer;

  v_feature_global := case p_feature
    when 'pos' then v_control.pos_enabled
    when 'admin_orders' then v_control.admin_orders_enabled
    when 'quote' then v_control.quote_issuer_enabled
    when 'outbox_worker' then v_control.outbox_worker_enabled
  end;
  v_feature_tenant := case p_feature
    when 'pos' then v_tenant.pos_enabled
    when 'admin_orders' then v_tenant.admin_orders_enabled
    when 'quote' then v_tenant.quote_enabled
    when 'outbox_worker' then true
  end;
  v_feature_branch := case
    when p_branch_id is null then true
    when p_feature = 'pos' then v_branch.pos_enabled
    when p_feature = 'admin_orders' then v_branch.admin_orders_enabled
    when p_feature = 'quote' then v_branch.quote_enabled
    when p_feature = 'outbox_worker' then true
  end;

  if not v_feature_global or not v_feature_tenant or not v_feature_branch then
    return query select
      false, 'FEATURE_DISABLED', v_control.activation_version, v_bucket;
    return;
  end if;

  if v_bucket >= v_control.deterministic_canary_percentage then
    return query select
      false, 'OUTSIDE_CANARY', v_control.activation_version, v_bucket;
    return;
  end if;

  return query select
    true, 'ENABLED', v_control.activation_version, v_bucket;
end;
$function$;

-- ===========================================================================
-- I. ATOMIC DATABASE-BACKED ISSUER RATE LIMIT
-- No PIN, JWT, context token, email, IP address or raw customer data is stored.
-- ===========================================================================

create function public.check_and_record_core_v2_issuer_rate_limit_v1(
  p_issuer_kind text,
  p_authenticated_user_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_subject_scope_hash text,
  p_attempt_succeeded boolean
)
returns table(
  allowed boolean,
  retry_after_seconds integer,
  remaining_attempts integer,
  rate_limit_version text
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_config public.core_v2_issuer_rate_limit_config%rowtype;
  v_window_start timestamptz;
  v_row public.core_v2_issuer_rate_limit_windows%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_issuer_kind not in ('authenticated_context','pos_pin_context')
     or p_authenticated_user_id is null
     or p_tenant_id is null
     or p_branch_id is null
     or p_subject_scope_hash !~ '^[0-9a-f]{64}$'
     or p_attempt_succeeded is null then
    raise exception using
      errcode = '22023',
      message = 'ISSUER_RATE_LIMIT_INPUT_INVALID';
  end if;

  select * into strict v_config
  from public.core_v2_issuer_rate_limit_config
  where issuer_kind = p_issuer_kind
  for share;

  if not v_config.enabled then
    return query select
      false,
      v_config.window_seconds,
      0,
      v_config.configuration_version;
    return;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / v_config.window_seconds)
      * v_config.window_seconds
  );

  insert into public.core_v2_issuer_rate_limit_windows (
    issuer_kind,
    authenticated_user_id,
    tenant_id,
    branch_id,
    subject_scope_hash,
    window_started_at,
    attempt_count,
    successful_attempt_count,
    failed_attempt_count,
    last_attempt_at,
    expires_at
  ) values (
    p_issuer_kind,
    p_authenticated_user_id,
    p_tenant_id,
    p_branch_id,
    p_subject_scope_hash,
    v_window_start,
    1,
    case when p_attempt_succeeded then 1 else 0 end,
    case when p_attempt_succeeded then 0 else 1 end,
    v_now,
    v_window_start + make_interval(secs => v_config.retention_seconds)
  )
  on conflict (
    issuer_kind,
    authenticated_user_id,
    tenant_id,
    branch_id,
    subject_scope_hash,
    window_started_at
  ) do update
  set attempt_count =
        public.core_v2_issuer_rate_limit_windows.attempt_count + 1,
      successful_attempt_count =
        public.core_v2_issuer_rate_limit_windows.successful_attempt_count
        + case when excluded.successful_attempt_count = 1 then 1 else 0 end,
      failed_attempt_count =
        public.core_v2_issuer_rate_limit_windows.failed_attempt_count
        + case when excluded.failed_attempt_count = 1 then 1 else 0 end,
      last_attempt_at = excluded.last_attempt_at
  returning * into v_row;

  return query select
    v_row.attempt_count <= v_config.maximum_attempts,
    case
      when v_row.attempt_count <= v_config.maximum_attempts then 0
      else greatest(
        1,
        ceil(
          extract(
            epoch from (
              v_window_start
              + make_interval(secs => v_config.window_seconds)
              - v_now
            )
          )
        )::integer
      )
    end,
    greatest(0, v_config.maximum_attempts - v_row.attempt_count),
    v_config.configuration_version;
end;
$function$;

-- ===========================================================================
-- J. NON-CONSUMING AUTHORIZATION-CONTEXT VALIDATOR FOR A FUTURE QUOTE ISSUER
-- ===========================================================================

create function public.validate_atomic_authorization_context_for_quote_v1(
  p_context_token text
)
returns table(
  authorization_context_id uuid,
  authenticated_user_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text,
  employee_id uuid,
  authorization_source text,
  idempotency_key_hash text,
  context_version text,
  expires_at timestamptz
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
begin
  return query
  select
    shared.authorization_context_id,
    shared.actor_user_id,
    shared.tenant_id,
    shared.branch_id,
    shared.actor_role,
    shared.employee_id,
    shared.authorization_source,
    shared.idempotency_key_hash,
    shared.context_version,
    shared.expires_at
  from public.validate_atomic_authorization_context_internal_v1(
    p_context_token,
    'non_consuming_quote',
    null::text,
    null::uuid
  ) shared;
end;
$function$;

/*
Compatibility note:
Package 5R-B consuming validation, Package 6A-A quote validation and Package
6B quote issuance now delegate to the same shared helper. This wrapper exposes
only its approved legacy return shape and performs no hashing, lookup, state
mutation or error remapping.
*/

-- ===========================================================================
-- K. CONTROLLED OPERATOR FUNCTIONS (ALL REMAIN UNGRANTED)
-- ===========================================================================

create function public.record_core_v2_verification_evidence_v1(
  p_package_version text,
  p_environment text,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_test_suite_identifier text,
  p_test_run_identifier text,
  p_artifact_hash text,
  p_result text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_recorded_by uuid,
  p_change_ticket text,
  p_result_summary text,
  p_supersedes_evidence_id uuid default null
)
returns uuid
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_id uuid;
begin
  if p_recorded_by is null
     or not exists (
       select 1
       from public.profiles p
       where p.id = p_recorded_by
         and p.is_active = true
         and p.role in ('owner','admin')
         and (
           p_tenant_id is null
           or p.tenant_id = p_tenant_id
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'ACTIVATION_OPERATOR_NOT_AUTHORIZED';
  end if;

  insert into public.core_v2_verification_evidence (
    package_version,
    environment,
    tenant_id,
    branch_id,
    test_suite_identifier,
    test_run_identifier,
    artifact_hash,
    result,
    started_at,
    completed_at,
    recorded_by,
    change_ticket,
    result_summary,
    supersedes_evidence_id
  ) values (
    p_package_version,
    p_environment,
    p_tenant_id,
    p_branch_id,
    p_test_suite_identifier,
    p_test_run_identifier,
    p_artifact_hash,
    p_result,
    p_started_at,
    p_completed_at,
    p_recorded_by,
    p_change_ticket,
    p_result_summary,
    p_supersedes_evidence_id
  )
  returning evidence_id into v_id;

  return v_id;
end;
$function$;

create function public.register_core_v2_managed_identity_v1(
  p_database_role_name name,
  p_identity_kind text,
  p_purpose text,
  p_owner_team text,
  p_environment text,
  p_expected_membership_role name,
  p_secret_reference_label text,
  p_approved_by uuid,
  p_change_ticket text
)
returns uuid
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_id uuid;
  v_expected_oid oid;
  v_login_oid oid;
begin
  select oid into v_login_oid
  from pg_roles
  where rolname = p_database_role_name;
  if not found then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_DATABASE_ROLE_MISSING';
  end if;

  if not exists (
    select 1 from pg_roles
    where oid = v_login_oid
      and rolcanlogin = true
      and rolsuper = false
      and rolcreatedb = false
      and rolcreaterole = false
      and rolreplication = false
      and rolbypassrls = false
  ) then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_LOGIN_UNSAFE';
  end if;

  select oid into v_expected_oid
  from pg_roles
  where rolname = p_expected_membership_role;
  if not found then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_EXPECTED_ROLE_MISSING';
  end if;

  if not exists (
    select 1
    from pg_auth_members
    where member = v_login_oid
      and roleid = v_expected_oid
      and admin_option = false
  ) then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_MEMBERSHIP_MISSING';
  end if;

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles granted_role on granted_role.oid = m.roleid
    where m.member = v_login_oid
      and granted_role.rolname <> p_expected_membership_role::text
  ) then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_EXTRA_MEMBERSHIP';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_approved_by
      and p.is_active = true
      and p.role in ('owner','admin')
  ) then
    raise exception using
      errcode = '42501',
      message = 'ACTIVATION_OPERATOR_NOT_AUTHORIZED';
  end if;

  insert into public.core_v2_managed_identities (
    database_role_name,
    identity_kind,
    purpose,
    active,
    owner_team,
    environment,
    approved_at,
    approved_by,
    approval_change_ticket,
    last_verified_at,
    expected_membership_role,
    secret_reference_label
  ) values (
    p_database_role_name,
    p_identity_kind,
    p_purpose,
    true,
    p_owner_team,
    p_environment,
    clock_timestamp(),
    p_approved_by,
    p_change_ticket,
    clock_timestamp(),
    p_expected_membership_role,
    p_secret_reference_label
  )
  returning identity_id into v_id;

  return v_id;
end;
$function$;

create function public.deactivate_core_v2_v1(
  p_operator_id uuid,
  p_change_ticket text,
  p_reason text,
  p_expected_record_version bigint
)
returns boolean
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_operator_id
      and p.is_active = true
      and p.role in ('owner','admin')
  ) then
    raise exception using
      errcode = '42501',
      message = 'ACTIVATION_OPERATOR_NOT_AUTHORIZED';
  end if;
  if p_change_ticket is null
     or length(btrim(p_change_ticket)) not between 3 and 128
     or p_reason is null
     or length(btrim(p_reason)) not between 3 and 500 then
    raise exception using
      errcode = '22023',
      message = 'DEACTIVATION_EVIDENCE_INVALID';
  end if;

  update public.core_v2_activation_control
  set global_enabled = false,
      kill_switch = true,
      pos_enabled = false,
      admin_orders_enabled = false,
      quote_issuer_enabled = false,
      outbox_worker_enabled = false,
      deterministic_canary_percentage = 0,
      current_change_ticket = p_change_ticket,
      deactivated_at = clock_timestamp(),
      deactivated_by = p_operator_id
  where singleton_id = true
    and record_version = p_expected_record_version;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'ACTIVATION_VERSION_CONFLICT';
  end if;

  update public.core_v2_tenant_activation
  set enabled = false,
      canary_eligible = false,
      pos_enabled = false,
      admin_orders_enabled = false,
      quote_enabled = false,
      disabled_at = clock_timestamp(),
      disabled_reason = p_reason
  where enabled
     or canary_eligible
     or pos_enabled
     or admin_orders_enabled
     or quote_enabled;

  update public.core_v2_branch_activation
  set enabled = false,
      canary_eligible = false,
      pos_enabled = false,
      admin_orders_enabled = false,
      quote_enabled = false,
      disabled_at = clock_timestamp(),
      disabled_reason = p_reason
  where enabled
     or canary_eligible
     or pos_enabled
     or admin_orders_enabled
     or quote_enabled;

  return true;
end;
$function$;

/*
configure_core_v2_canary_v1 and activate_core_v2_canary_v1 are intentionally
not created. A safe activation function depends on the authoritative Package
6B quote contract and a trusted operator authentication handoff. Global
activation remains impossible in Package 6A.
*/

-- ===========================================================================
-- L. REAL, READ-ONLY READINESS V2
-- ===========================================================================

create function public.verify_core_v2_activation_readiness_v2(
  p_environment text default 'production',
  p_package_version text default 'core-v2-i5.9',
  p_tenant_id uuid default null,
  p_branch_id uuid default null
)
returns table(
  gate_name text,
  passed boolean,
  blocking boolean,
  detail text
)
language sql
stable
parallel safe
security definer
set search_path = pg_catalog
as $function$
  with control as (
    select *
    from public.core_v2_activation_control
    where singleton_id = true
  ),
  evidence as (
    select e.*
    from public.core_v2_verification_evidence e
    where e.package_version = p_package_version
      and e.environment = p_environment
      and e.completed_at<=statement_timestamp()
      and not exists (
        select 1
        from public.core_v2_verification_evidence superseding
        where superseding.supersedes_evidence_id=e.evidence_id
      )
  ),
  runtime_identity as (
    select i.*, login_role.oid login_oid, expected_role.oid expected_oid
    from public.core_v2_managed_identities i
    join pg_roles login_role
      on login_role.rolname = i.database_role_name
    join pg_roles expected_role
      on expected_role.rolname = i.expected_membership_role
    where i.environment = p_environment
      and i.identity_kind = 'runtime'
      and i.active
  ),
  worker_identity as (
    select i.*, login_role.oid login_oid, expected_role.oid expected_oid
    from public.core_v2_managed_identities i
    join pg_roles login_role
      on login_role.rolname = i.database_role_name
    join pg_roles expected_role
      on expected_role.rolname = i.expected_membership_role
    where i.environment = p_environment
      and i.identity_kind = 'outbox_worker'
      and i.active
  )
  select *
  from (values
    (
      'dependency_attestation',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'dependency-hash-package-2b-s'
          and result = 'PASS'
          and artifact_hash =
            '009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d'
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier = 'dependency-hash-package-4t'
          and result = 'PASS'
          and artifact_hash =
            '40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7'
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier = 'dependency-hash-package-5r-b'
          and result = 'PASS'
          and artifact_hash =
            'eb5ad92396a57022f35cd7a58f6c6f85e7ea735c3306f40040c084e82ecb13b7'
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier = 'dependency-hash-package-6'
          and result = 'PASS'
          and artifact_hash =
            '06b7c27a249b07d0fc58c8e22dd046376a85fb7e507a050a9d33f10e1c8205e3'
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier = 'dependency-hash-package-6b'
          and result = 'PASS'
          and artifact_hash =
            '46c0db2c04a2f48dd1519f72a8f627ca2ceae3ad0ad6af21a7897bc2bc3914ff'
      ),
      true,
      'Exact approved dependency attestation must be explicitly recorded.'
    ),
    (
      'roles_safe',
      not exists (
        select 1 from pg_roles
        where rolname in (
          'afex_core_owner','afex_context_issuer','afex_outbox_worker',
          'afex_core_runtime','afex_core_activation_owner',
          'afex_core_activation_operator'
        )
        and (
          rolcanlogin or rolsuper or rolcreatedb or rolcreaterole
          or rolinherit or rolreplication or rolbypassrls
        )
      ),
      true,
      'All dedicated roles must remain NOLOGIN and non-privileged.'
    ),
    (
      'managed_runtime_identity',
      exists (
        select 1
        from runtime_identity i
        where exists (
          select 1 from pg_auth_members m
          where m.member = i.login_oid
            and m.roleid = i.expected_oid
            and not m.admin_option
        )
        and not exists (
          select 1 from pg_auth_members m
          where m.member = i.login_oid
            and m.roleid <> i.expected_oid
        )
      ),
      true,
      'One active runtime login with only afex_core_runtime membership.'
    ),
    (
      'managed_worker_identity',
      exists (
        select 1
        from worker_identity i
        where exists (
          select 1 from pg_auth_members m
          where m.member = i.login_oid
            and m.roleid = i.expected_oid
            and not m.admin_option
        )
        and not exists (
          select 1 from pg_auth_members m
          where m.member = i.login_oid
            and m.roleid <> i.expected_oid
        )
      ),
      true,
      'One active worker login with only afex_outbox_worker membership.'
    ),
    (
      'runtime_direct_tables_closed',
      not has_table_privilege(
        'afex_core_runtime','public.orders','INSERT'
      )
      and not has_table_privilege(
        'afex_core_runtime','public.financial_quotes','SELECT'
      )
      and not has_table_privilege(
        'afex_core_runtime','public.atomic_outbox','SELECT'
      ),
      true,
      'Runtime role must have no direct business/Core table access.'
    ),
    (
      'atomic_entry_disabled',
      not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        where has_function_privilege(
          role_name,
          'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
          'EXECUTE'
        )
      ),
      true,
      'Atomic entry remains ungranted before Package 7 and final action.'
    ),
    (
      'issuers_ungranted',
      not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        cross join (values
          ('public.issue_atomic_authorization_context_v1(uuid,text,text)'),
          ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)')
        ) functions(signature)
        where has_function_privilege(role_name,signature,'EXECUTE')
      ),
      true,
      'Issuer gateway and rate-limit tests must pass before a separate grant.'
    ),
    (
      'quote_issuer_authoritative',
      exists (
        select 1
        from pg_proc p
        where p.oid=to_regprocedure(
          'public.issue_authoritative_financial_quote_v1(text,jsonb,text)'
        )
          and p.proowner='afex_core_owner'::regrole
          and p.prosecdef
          and p.provolatile='v'
          and p.proconfig=array['search_path=pg_catalog']::text[]
      )
      and exists (
        select 1
        from pg_proc p
        where p.oid=to_regprocedure(
          'public.verify_authoritative_quote_hash_v1(jsonb,text)'
        )
          and p.proowner='afex_core_owner'::regrole
          and not p.prosecdef
          and p.provolatile='i'
          and p.proconfig=array['search_path=pg_catalog']::text[]
      )
      and exists (
        select 1
        from pg_proc p
        where p.oid=to_regprocedure(
          'public.validate_atomic_authorization_context_internal_v1('
          || 'text,text,text,uuid)'
        )
          and p.proowner='afex_core_owner'::regrole
          and p.prosecdef
          and p.provolatile='v'
          and p.proconfig=array['search_path=pg_catalog']::text[]
      )
      and not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        cross join (values
          ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)'),
          ('public.verify_authoritative_quote_hash_v1(jsonb,text)'),
          ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)')
        ) functions(signature)
        where has_function_privilege(role_name,signature,'EXECUTE')
      )
      and not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        where has_table_privilege(
          role_name,'public.financial_quotes','INSERT'
        )
        or has_table_privilege(
          role_name,'public.financial_quotes','UPDATE'
        )
        or has_table_privilege(
          role_name,'public.financial_quotes','DELETE'
        )
      )
      and exists (
        select 1
        from pg_index i
        where i.indexrelid=to_regclass(
          'public.uq_financial_quotes_authorization_context'
        )
          and i.indisunique
          and i.indisvalid
          and i.indisready
      )
      and exists (
        select 1
        from pg_constraint c
        where c.conrelid=to_regclass('public.financial_quotes')
          and c.conname='fk_financial_quotes_authorization_context'
          and c.contype='f'
      )
      and exists (
        select 1
        from pg_trigger t
        where t.tgrelid=to_regclass('public.financial_quotes')
          and t.tgname='trg_financial_quotes_immutable_v1'
          and not t.tgisinternal
          and t.tgenabled='O'
          and t.tgfoid=to_regprocedure(
            'public.reject_financial_quote_mutation_v1()'
          )
      )
      and exists (
        select 1 from control c where not c.quote_issuer_enabled
      ),
      true,
      'Package 6B objects must be exact, immutable, internally owned, '
      || 'ungranted and disabled during preparation.'
    ),
    (
      'package4t_financial_parity',
      exists (
        select 1 from evidence
        where test_suite_identifier='financial_snapshot_parity'
          and result='PASS'
          and tenant_id is not distinct from p_tenant_id
          and branch_id is not distinct from p_branch_id
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier='financial_drift_rollback'
          and result='PASS'
          and tenant_id is not distinct from p_tenant_id
          and branch_id is not distinct from p_branch_id
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier=
          'committed_replay_after_configuration_change'
          and result='PASS'
          and tenant_id is not distinct from p_tenant_id
          and branch_id is not distinct from p_branch_id
      ),
      true,
      'Exact Package 4T parity, drift rollback and committed replay evidence.'
    ),
    (
      'package6b_quote_evidence',
      not exists (
        select 1
        from (values
          ('financial_quote_authority'),
          ('quote_hash_integrity'),
          ('quote_immutability'),
          ('context_quote_linkage'),
          ('shared_context_validation'),
          ('quote_concurrency'),
          ('quote_privilege_isolation')
        ) required(test_suite_identifier)
        where not exists (
          select 1 from evidence e
          where e.test_suite_identifier=required.test_suite_identifier
            and e.result='PASS'
            and e.tenant_id is not distinct from p_tenant_id
            and e.branch_id is not distinct from p_branch_id
        )
      ),
      true,
      'Every Package 6B authority, integrity, linkage, concurrency and '
      || 'privilege suite must have exact non-superseded scoped PASS evidence.'
    ),
    (
      'feature_singleton_fail_closed',
      (select count(*) = 1 from control)
      and exists (
        select 1 from control c
        where not c.global_enabled
          and c.kill_switch
          and not c.pos_enabled
          and not c.admin_orders_enabled
          and not c.quote_issuer_enabled
          and not c.outbox_worker_enabled
          and c.deterministic_canary_percentage = 0
      ),
      true,
      'Preparation state must remain entirely disabled.'
    ),
    (
      'tenant_branch_state_valid',
      not exists (
        select 1
        from public.core_v2_tenant_activation
        where enabled
           or canary_eligible
           or pos_enabled
           or admin_orders_enabled
           or quote_enabled
      )
      and not exists (
        select 1
        from public.core_v2_branch_activation
        where enabled
           or canary_eligible
           or pos_enabled
           or admin_orders_enabled
           or quote_enabled
      ),
      true,
      'No tenant or branch may be enabled during Package 6A preparation.'
    ),
    (
      'package7_pass',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'package-7-full-gate'
          and result = 'PASS'
          and tenant_id is not distinct from p_tenant_id
          and branch_id is not distinct from p_branch_id
      ),
      true,
      'Explicit environment/version/scope Package 7 PASS evidence.'
    ),
    (
      'legacy_mutation_closure',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'legacy-mutation-closure'
          and result = 'PASS'
      ),
      true,
      'Legacy mutation closure must be recorded, not inferred.'
    ),
    (
      'conflicting_trigger_closure',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'conflicting-trigger-closure'
          and result = 'PASS'
      ),
      true,
      'Conflicting trigger closure must be recorded.'
    ),
    (
      'package3_evidence',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'package-3-evidence'
          and result = 'PASS'
      ),
      true,
      'Package 3 evidence/backfill review must be recorded.'
    ),
    (
      'public_helpers_closed',
      not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        cross join (values
          ('public.validate_atomic_authorization_context_for_quote_v1(text)'),
          ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
          ('public.check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)')
        ) functions(signature)
        where has_function_privilege(role_name,signature,'EXECUTE')
      ),
      true,
      'Internal Package 6A helpers must have no PUBLIC execution.'
    ),
    (
      'service_role_not_managed_identity',
      not exists (
        select 1
        from public.core_v2_managed_identities
        where database_role_name = 'service_role'::name
      ),
      true,
      'Generic service_role cannot represent a managed runtime identity.'
    )
  ) gates(gate_name, passed, blocking, detail)
  order by gate_name;
$function$;

-- ===========================================================================
-- C. STRICT BUSINESS-INTENT NORMALIZATION
-- ===========================================================================

create function public.normalize_authoritative_quote_request_v1(
  p_request jsonb
)
returns jsonb
language plpgsql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $function$
declare
  v_unknown_key text;
  v_item jsonb;
  v_customer jsonb;
  v_intent text;
  v_payment_method text;
  v_note text;
  v_discount_id text;
  v_cash_received text;
  v_items jsonb;
begin
  if p_request is null then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_REQUIRED';
  end if;
  if jsonb_typeof(p_request) <> 'object'
     or octet_length(p_request::text) > 1114112 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  select k.key into v_unknown_key
  from jsonb_object_keys(p_request) as k(key)
  where k.key <> all(array[
    'customer','note','items','discount_id','payment_method','cash_received'
  ])
  limit 1;
  if v_unknown_key is not null then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_UNKNOWN_KEYS';
  end if;

  if p_request->'items' is null
     or jsonb_typeof(p_request->'items') <> 'array'
     or jsonb_array_length(p_request->'items') = 0 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if jsonb_array_length(p_request->'items') > 100
     or octet_length((p_request->'items')::text) > 1048576 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_TOO_MANY_ITEMS';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_request->'items')
  loop
    if jsonb_typeof(v_item) <> 'object'
       or exists (
         select 1 from jsonb_object_keys(v_item) as k(key)
         where k.key <> all(array['catalog_item_id','quantity'])
       )
       or coalesce(v_item->>'catalog_item_id','') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,4}$' then
      raise exception using
        errcode = '22023',
        message = 'QUOTE_ITEM_INVALID';
    end if;
    if (v_item->>'quantity')::numeric > 10000 then
      raise exception using
        errcode = '22023',
        message = 'QUOTE_QUANTITY_INVALID';
    end if;
  end loop;

  /*
  Aggregate duplicates now so quote issuance, hashing and Package 4S use the
  same deterministic catalog-ID order and quantity representation.
  */
  select jsonb_agg(
    jsonb_build_object(
      'catalog_item_id', grouped.catalog_item_id,
      'quantity', grouped.quantity
    )
    order by grouped.catalog_item_id
  )
  into v_items
  from (
    select
      (i.value->>'catalog_item_id')::uuid catalog_item_id,
      sum((i.value->>'quantity')::integer)::bigint quantity
    from jsonb_array_elements(p_request->'items') i(value)
    group by (i.value->>'catalog_item_id')::uuid
  ) grouped;

  if exists (
    select 1
    from jsonb_array_elements(v_items) i(value)
    where (i.value->>'quantity')::numeric > 10000
  ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_QUANTITY_INVALID';
  end if;

  if p_request->'customer' is null
     or jsonb_typeof(p_request->'customer') <> 'object'
     or octet_length((p_request->'customer')::text) > 65536 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  v_customer := p_request->'customer';
  if exists (
    select 1
    from jsonb_object_keys(v_customer) as k(key)
    where k.key <> all(array[
      'intent','id','record_version','name','phone','email','notes'
    ])
  ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_UNKNOWN_KEYS';
  end if;

  v_intent := nullif(btrim(v_customer->>'intent'),'');
  if v_intent not in (
    'reuse_existing','create_new','update_existing'
  ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if nullif(v_customer->>'id','') is not null
     and (v_customer->>'id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if nullif(v_customer->>'record_version','') is not null
     and (v_customer->>'record_version') !~ '^[1-9][0-9]{0,18}$' then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if nullif(btrim(v_customer->>'phone'),'') is null
     or public.normalize_customer_phone_v2(
       nullif(btrim(v_customer->>'phone'),'')
     ) is null
     or length(coalesce(v_customer->>'name','')) > 200
     or length(coalesce(v_customer->>'phone','')) > 32
     or length(coalesce(v_customer->>'email','')) > 320
     or length(coalesce(v_customer->>'notes','')) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if v_intent = 'create_new'
     and (
       nullif(btrim(v_customer->>'name'),'') is null
       or nullif(v_customer->>'id','') is not null
       or nullif(v_customer->>'record_version','') is not null
     ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if v_intent = 'update_existing'
     and (
       nullif(btrim(v_customer->>'name'),'') is null
       or nullif(v_customer->>'id','') is null
       or nullif(v_customer->>'record_version','') is null
     ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  v_payment_method := lower(nullif(btrim(p_request->>'payment_method'),''));
  if v_payment_method = 'cod' then
    v_payment_method := 'on_delivery';
  end if;
  if v_payment_method <> all(array[
    'cash','card','mada','visa','transfer','on_delivery'
  ]) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  v_discount_id := nullif(p_request->>'discount_id','');
  if v_discount_id is not null
     and v_discount_id !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_DISCOUNT_INVALID';
  end if;

  v_cash_received := nullif(p_request->>'cash_received','');
  if v_cash_received is not null
     and v_cash_received !~ '^[0-9]{1,16}([.][0-9]{1,2})?$' then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if v_payment_method <> 'cash' and v_cash_received is not null
     and round(v_cash_received::numeric,2) <> 0 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  v_note := nullif(btrim(p_request->>'note'),'');
  if v_note is not null and length(v_note) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  return jsonb_build_object(
    'customer', v_customer,
    'note', v_note,
    'items', v_items,
    'discount_id', v_discount_id,
    'payment_method', v_payment_method,
    'cash_received', v_cash_received
  );
end;
$function$;

-- ===========================================================================
-- D. QUOTE PAYLOAD/HASH VERIFICATION AND IMMUTABILITY
-- ===========================================================================

create function public.verify_authoritative_quote_hash_v1(
  p_quote_payload jsonb,
  p_quote_hash text
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $function$
  select
    p_quote_payload is not null
    and jsonb_typeof(p_quote_payload) = 'object'
    and p_quote_hash ~ '^[0-9a-f]{64}$'
    and encode(
      extensions.digest(p_quote_payload::text, 'sha256'),
      'hex'
    ) = p_quote_hash;
$function$;

create function public.reject_financial_quote_mutation_v1()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'FINANCIAL_QUOTE_IMMUTABLE';
end;
$function$;

create trigger trg_financial_quotes_immutable_v1
before update or delete on public.financial_quotes
for each row execute function public.reject_financial_quote_mutation_v1();

-- ===========================================================================
-- E. AUTHORITATIVE QUOTE ISSUER
-- ===========================================================================

create function public.issue_authoritative_financial_quote_v1(
  p_context_token text,
  p_business_intent jsonb,
  p_request_trace_id text default null
)
returns jsonb
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_auth record;
  v_intent jsonb;
  v_financial_intent jsonb;
  v_command_for_fingerprint jsonb;
  v_financial_result jsonb;
  v_snapshot jsonb;
  v_request_fingerprint text;
  v_quote_payload jsonb;
  v_quote_hash text;
  v_quote_fingerprint text;
  v_quote_id uuid;
  v_customer_id uuid;
  v_created_at timestamptz := clock_timestamp();
  v_expires_at timestamptz;
  v_existing public.financial_quotes%rowtype;
  v_constraint_name text;
  v_actor_type text;
  v_actor_id uuid;
  v_correlation_id text;
  v_financial_error text;
begin
  if p_request_trace_id is not null
     and (
       length(p_request_trace_id) not between 1 and 128
       or p_request_trace_id !~ '^[A-Za-z0-9._:-]+$'
     ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  select * into strict v_auth
  from public.validate_atomic_authorization_context_internal_v1(
    p_context_token,
    'non_consuming_quote',
    null,
    null
  );

  v_intent := public.normalize_authoritative_quote_request_v1(
    p_business_intent
  );

  v_financial_intent := jsonb_build_object(
    'items', v_intent->'items',
    'discount_id', v_intent->'discount_id',
    'payment_method', v_intent->'payment_method',
    'cash_received', v_intent->'cash_received'
  );
  v_command_for_fingerprint := jsonb_build_object(
    'command_type', 'create_order',
    'branch_id', v_auth.branch_id,
    'customer', v_intent->'customer',
    'note', v_intent->'note'
  );

  /*
  Quote issuance does not create/update a customer. It still proves any
  caller-referenced existing customer belongs to the context tenant and that
  the optimistic version required by update_existing is current.
  */
  if nullif(v_intent->'customer'->>'id','') is not null then
    v_customer_id := (v_intent->'customer'->>'id')::uuid;
    if not exists (
      select 1
      from public.customers c
      where c.id = v_customer_id
        and c.tenant_id = v_auth.tenant_id
        and (
          v_intent->'customer'->>'intent' <> 'update_existing'
          or c.record_version =
             (v_intent->'customer'->>'record_version')::bigint
        )
    ) then
      raise exception using
        errcode = '42501',
        message = 'QUOTE_SCOPE_INVALID';
    end if;
  end if;

  v_request_fingerprint := public.build_atomic_request_fingerprint_v2(
    v_command_for_fingerprint,
    v_financial_intent
  );
  if v_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_FINGERPRINT_MISMATCH';
  end if;

  /*
  Same-context/same-intent retry returns the immutable prior quote. A different
  intent never replaces it.
  */
  select * into v_existing
  from public.financial_quotes q
  where q.authorization_context_id = v_auth.authorization_context_id
  for share;
  if found then
    if v_existing.request_fingerprint <> v_request_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'QUOTE_ALREADY_EXISTS_FOR_CONTEXT';
    end if;
    if v_existing.expires_at <= clock_timestamp() then
      raise exception using errcode = '40001', message = 'QUOTE_CONTEXT_INVALID';
    end if;
    if not public.verify_authoritative_quote_hash_v1(
      v_existing.quote_payload,
      v_existing.quote_hash
    ) then
      raise exception using errcode = 'P0001', message = 'QUOTE_HASH_MISMATCH';
    end if;
    return jsonb_build_object(
      'quote_id', v_existing.id,
      'request_fingerprint', v_existing.request_fingerprint,
      'quote_fingerprint', v_existing.quote_fingerprint,
      'quote_hash', v_existing.quote_hash,
      'quote_version', v_existing.quote_version,
      'financial_engine_version', v_existing.financial_engine_version,
      'expires_at', v_existing.expires_at,
      'financial_snapshot', v_existing.quote_payload->'financial_snapshot',
      'canonical_customer_intent', v_intent->'customer',
      'canonical_note', v_intent->'note',
      'canonical_financial_intent', v_financial_intent,
      'replay', true
    );
  end if;

  begin
    v_financial_result := public.derive_atomic_financial_snapshot_v2(
      v_auth.tenant_id,
      v_auth.branch_id,
      v_financial_intent
    );
  exception
    when no_data_found
      or raise_exception
      or invalid_parameter_value
      or insufficient_privilege
      or numeric_value_out_of_range
    then
      get stacked diagnostics v_financial_error = message_text;
      case v_financial_error
        when 'PRICE_NOT_FOUND' then
          raise exception using
            errcode = 'P0002',
            message = 'QUOTE_ITEM_NOT_FOUND';
        when 'PRICE_SCOPE_INVALID' then
          raise exception using
            errcode = '42501',
            message = 'QUOTE_SCOPE_INVALID';
        when 'PRICE_INVALID' then
          raise exception using
            errcode = 'P0001',
            message = 'QUOTE_PRICE_UNAVAILABLE';
        when 'DISCOUNT_INVALID' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_DISCOUNT_INVALID';
        when 'VAT_INVALID' then
          raise exception using
            errcode = 'P0001',
            message = 'QUOTE_VAT_CONFIGURATION_INVALID';
        when 'INVALID_QUANTITY' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_QUANTITY_INVALID';
        when 'ITEM_INTENT_INVALID' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_ITEM_INVALID';
        when 'CART_LIMIT_EXCEEDED' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_TOO_MANY_ITEMS';
        when 'EMPTY_CART' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_REQUEST_INVALID';
        when 'PAYMENT_METHOD_INVALID' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_REQUEST_INVALID';
        when 'PAYMENT_STATE_INVALID' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_REQUEST_INVALID';
        else
          raise exception using
            errcode = 'P0001',
            message = 'QUOTE_FINANCIAL_CALCULATION_INVALID';
      end case;
  end;
  v_snapshot := v_financial_result->'snapshot';
  if v_snapshot is null
     or jsonb_typeof(v_snapshot) <> 'object'
     or coalesce(v_financial_result->>'snapshot_hash','')
       !~ '^[0-9a-f]{64}$'
     or encode(
       extensions.digest(v_snapshot::text, 'sha256'),
       'hex'
     ) <> v_financial_result->>'snapshot_hash' then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_FINANCIAL_CALCULATION_INVALID';
  end if;

  v_expires_at := least(
    v_auth.expires_at,
    v_created_at + interval '5 minutes'
  );
  if v_expires_at <= v_created_at then
    raise exception using errcode = '28000', message = 'CONTEXT_EXPIRED';
  end if;

  v_actor_type := case
    when v_auth.employee_id is null then 'user'
    else 'pos_employee'
  end;
  v_actor_id := coalesce(v_auth.employee_id, v_auth.actor_user_id);
  v_correlation_id := coalesce(
    p_request_trace_id,
    gen_random_uuid()::text
  );

  v_quote_payload := jsonb_build_object(
    'quote_payload_version', 'authoritative-quote-payload-v1',
    'quote_version', 'financial-quote-v1',
    'financial_engine_version', v_snapshot->>'financial_engine_version',
    'request_fingerprint_version', 'atomic-request-fingerprint-v2',
    'request_fingerprint', v_request_fingerprint,
    'authorization_context_id', v_auth.authorization_context_id,
    'issuer_context_version', v_auth.context_version,
    'tenant_id', v_auth.tenant_id,
    'branch_id', v_auth.branch_id,
    'actor_type', v_actor_type,
    'financial_snapshot', v_snapshot,
    'financial_snapshot_hash', v_financial_result->>'snapshot_hash',
    'issued_at', v_created_at,
    'expires_at', v_expires_at
  );
  v_quote_hash := encode(
    extensions.digest(v_quote_payload::text, 'sha256'),
    'hex'
  );
  v_quote_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'quote_fingerprint_version',
          'authoritative-quote-fingerprint-v1',
        'quote_version', 'financial-quote-v1',
        'financial_engine_version',
          v_snapshot->>'financial_engine_version',
        'request_fingerprint', v_request_fingerprint,
        'authorization_context_id', v_auth.authorization_context_id,
        'quote_hash', v_quote_hash
      )::text,
      'sha256'
    ),
    'hex'
  );

  if not public.verify_authoritative_quote_hash_v1(
    v_quote_payload,
    v_quote_hash
  ) then
    raise exception using errcode = 'P0001', message = 'QUOTE_HASH_MISMATCH';
  end if;

  begin
    insert into public.financial_quotes (
      tenant_id,
      branch_id,
      customer_id,
      correlation_id,
      request_fingerprint,
      request_fingerprint_version,
      quote_fingerprint,
      quote_version,
      financial_engine_version,
      pricing_rule_version,
      vat_rule_version,
      discount_rule_version,
      rounding_version,
      quote_snapshot_version,
      quote_classification,
      created_by_actor_type,
      created_by_actor_id,
      quote_payload,
      quote_hash,
      created_at,
      expires_at,
      authorization_context_id,
      issuer_context_version
    ) values (
      v_auth.tenant_id,
      v_auth.branch_id,
      v_customer_id,
      v_correlation_id,
      v_request_fingerprint,
      'atomic-request-fingerprint-v2',
      v_quote_fingerprint,
      'financial-quote-v1',
      v_snapshot->>'financial_engine_version',
      v_snapshot->>'pricing_rule_version',
      v_snapshot->>'vat_rule_version',
      v_snapshot->>'discount_rule_version',
      v_snapshot->>'rounding_version',
      'authoritative-quote-payload-v1',
      'advisory',
      v_actor_type,
      v_actor_id,
      v_quote_payload,
      v_quote_hash,
      v_created_at,
      v_expires_at,
      v_auth.authorization_context_id,
      v_auth.context_version
    )
    returning id into v_quote_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name not in (
        'uq_financial_quotes_authorization_context',
        'uq_financial_quotes_scope'
      ) then
        raise;
      end if;

      select * into v_existing
      from public.financial_quotes q
      where q.authorization_context_id = v_auth.authorization_context_id
      for share;
      if not found
         or v_existing.request_fingerprint <> v_request_fingerprint
         or not public.verify_authoritative_quote_hash_v1(
           v_existing.quote_payload,
           v_existing.quote_hash
         ) then
        raise exception using
          errcode = '23505',
          message = 'QUOTE_ALREADY_EXISTS_FOR_CONTEXT';
      end if;
      if v_existing.expires_at <= clock_timestamp() then
        raise exception using
          errcode = '40001',
          message = 'QUOTE_CONTEXT_INVALID';
      end if;
      return jsonb_build_object(
        'quote_id', v_existing.id,
        'request_fingerprint', v_existing.request_fingerprint,
        'quote_fingerprint', v_existing.quote_fingerprint,
        'quote_hash', v_existing.quote_hash,
        'quote_version', v_existing.quote_version,
        'financial_engine_version', v_existing.financial_engine_version,
        'expires_at', v_existing.expires_at,
        'financial_snapshot', v_existing.quote_payload->'financial_snapshot',
        'canonical_customer_intent', v_intent->'customer',
        'canonical_note', v_intent->'note',
        'canonical_financial_intent', v_financial_intent,
        'replay', true
      );
  end;

  return jsonb_build_object(
    'quote_id', v_quote_id,
    'request_fingerprint', v_request_fingerprint,
    'quote_fingerprint', v_quote_fingerprint,
    'quote_hash', v_quote_hash,
    'quote_version', 'financial-quote-v1',
    'financial_engine_version', v_snapshot->>'financial_engine_version',
    'expires_at', v_expires_at,
    'financial_snapshot', v_snapshot,
    'canonical_customer_intent', v_intent->'customer',
    'canonical_note', v_intent->'note',
    'canonical_financial_intent', v_financial_intent,
    'replay', false
  );
end;
$function$;

-- ===========================================================================
create function public.verify_core_v2_activation_readiness_v1()
returns table(
  gate_name text,
  passed boolean,
  blocking boolean,
  detail text
)
language sql
stable
parallel safe
security invoker
set search_path=pg_catalog
as $function$
  select *
  from (values
    (
      'dependency_hash_attestation',
      false,true,
      'External file hashes cannot be verified by PostgreSQL; reviewed operator evidence is required.'
    ),
    (
      'required_security_objects',
      to_regprocedure(
        'public.consume_atomic_authorization_context_v1(text,text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'
      ) is not null
      and to_regprocedure(
        'public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.validate_atomic_authorization_context_for_quote_v1(text)'
      ) is not null
      and to_regprocedure(
        'public.issue_authoritative_financial_quote_v1(text,jsonb,text)'
      ) is not null
      and to_regprocedure(
        'public.verify_authoritative_quote_hash_v1(jsonb,text)'
      ) is not null
      and to_regprocedure(
        'public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'
      ) is not null,
      true,
      'Package 4T, 5R-B, 6A-A and 6B final exact contracts are present.'
    ),
    (
      'runtime_role_safe',
      exists (
        select 1 from pg_roles r
        where r.rolname='afex_core_runtime'
          and not r.rolcanlogin and not r.rolsuper
          and not r.rolinherit and not r.rolbypassrls
      ),
      true,
      'Role is inert until a separately managed server identity is approved.'
    ),
    (
      'atomic_entry_disabled',
      not has_function_privilege(
        'afex_core_runtime',
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'service_role',
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      ),
      true,
      'Must remain disabled until Package 7 and manual canary approval.'
    ),
    (
      'internal_tables_closed',
      not has_table_privilege(
        'afex_core_runtime','public.atomic_authorization_contexts','SELECT'
      )
      and not has_table_privilege(
        'afex_core_runtime','public.idempotency_commands','SELECT'
      )
      and not has_table_privilege(
        'afex_core_runtime','public.atomic_outbox','SELECT'
      ),
      true,
      'Runtime caller must use SECURITY DEFINER entry points only.'
    ),
    (
      'context_issuer_runtime_path_approved',
      false,true,
      'Distinct server caller preserving auth.uid plus database/app rate limits is not approved.'
    ),
    (
      'authoritative_quote_issuer_ready',
      false,true,
      'Package 6B issuer exists but is ungranted and quote_issuer_enabled must remain false until all operational and Package 7 gates pass.'
    ),
    (
      'worker_identity_assigned',
      false,true,
      'Worker login/service identity and secret owner are external prerequisites.'
    ),
    (
      'legacy_mutation_paths_closed',
      false,true,
      'Legacy direct grants, policies, RPCs and mutation triggers remain for coexistence.'
    ),
    (
      'package3_evidence_approved',
      false,true,
      'Operator must record reviewed Package 3 backfill/evidence completion.'
    ),
    (
      'server_authoritative_feature_flags_ready',
      false,true,
      'Package 6A-A metadata exists, but Core V2 remains disabled pending controlled readiness V2 and operator approval.'
    ),
    (
      'package7_pass_recorded',
      false,true,
      'Package 6A-A evidence storage exists, but Package 7 must execute and record immutable PASS evidence through the controlled path.'
    ),
    (
      'global_activation',
      false,true,
      'Global activation is intentionally impossible in this package.'
    )
  ) gates(gate_name,passed,blocking,detail)
  order by gate_name;
$function$;

commit;
-- STOP D-I: verify signatures and body hashes.
begin;
-- PHASE J: INTERNAL OWNERSHIP/ACL; OPERATIONAL GRANTS DEFERRED.
revoke create on schema public from public,anon,authenticated,service_role;
revoke all on schema public from afex_core_runtime,afex_context_issuer,afex_outbox_worker,afex_core_activation_owner,afex_core_activation_operator;
grant usage on schema public to afex_core_owner;
grant usage on schema extensions to afex_core_owner;
grant execute on function extensions.digest(text,text)to afex_core_owner;
alter default privileges in schema public
  revoke execute on functions from public;
alter default privileges for role afex_core_owner in schema public
  revoke execute on functions from public;
alter default privileges for role afex_context_issuer in schema public
  revoke execute on functions from public;
alter default privileges for role afex_core_owner in schema public
  revoke select,insert,update,delete,truncate,references,trigger
  on tables from public;
alter default privileges for role afex_context_issuer in schema public
  revoke select,insert,update,delete,truncate,references,trigger
  on tables from public;
alter default privileges for role afex_core_owner in schema public
  revoke usage,select,update on sequences from public;
alter default privileges for role afex_context_issuer in schema public
  revoke usage,select,update on sequences from public;
alter function public.resolve_atomic_authorization_v2(jsonb,jsonb)
  owner to afex_core_owner;
alter function public.normalize_customer_phone_v2(text)
  owner to afex_core_owner;
alter function public.resolve_customer_identity_v2(uuid,uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.resolve_customer_identity_result_v2(uuid,uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.build_atomic_request_fingerprint_v2(jsonb,jsonb)
  owner to afex_core_owner;
alter function public.acquire_idempotency_command_v2(
  uuid,uuid,text,text,text,uuid,uuid,text,uuid
) owner to afex_core_owner;
alter function public.build_atomic_order_response_v1(uuid,uuid)
  owner to afex_core_owner;
alter function public.allocate_branch_monthly_number_v2(uuid,uuid,date)
  owner to afex_core_owner;
alter function public.assert_atomic_legacy_triggers_safe_v2()
  owner to afex_core_owner;
alter function public.resolve_inventory_requirements_v2(uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.lock_and_validate_inventory_v2(uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.build_inventory_movement_evidence_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,bigint,bigint
) owner to afex_core_owner;
alter function public.apply_inventory_mutations_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb
) owner to afex_core_owner;
alter function public.atomic_semantic_event_uuid_v1(text)
  owner to afex_core_owner;
alter function public.enqueue_atomic_outbox_v2(
  uuid,uuid,uuid,uuid,uuid,boolean,text,text,numeric,text,text,text,
  jsonb,uuid,timestamp with time zone
) owner to afex_core_owner;
alter function public.derive_atomic_financial_snapshot_v2(uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)
  owner to afex_core_owner;

revoke execute on function
  public.resolve_atomic_authorization_v2(jsonb,jsonb),
  public.normalize_customer_phone_v2(text),
  public.resolve_customer_identity_v2(uuid,uuid,uuid,jsonb),
  public.resolve_customer_identity_result_v2(uuid,uuid,uuid,jsonb),
  public.build_atomic_request_fingerprint_v2(jsonb,jsonb),
  public.acquire_idempotency_command_v2(
    uuid,uuid,text,text,text,uuid,uuid,text,uuid
  ),
  public.build_atomic_order_response_v1(uuid,uuid),
  public.allocate_branch_monthly_number_v2(uuid,uuid,date),
  public.assert_atomic_legacy_triggers_safe_v2(),
  public.resolve_inventory_requirements_v2(uuid,uuid,jsonb),
  public.lock_and_validate_inventory_v2(uuid,uuid,jsonb),
  public.build_inventory_movement_evidence_v2(
    uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,bigint,bigint
  ),
  public.apply_inventory_mutations_v2(
    uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb
  ),
  public.atomic_semantic_event_uuid_v1(text),
  public.enqueue_atomic_outbox_v2(
    uuid,uuid,uuid,uuid,uuid,boolean,text,text,numeric,text,text,text,
    jsonb,uuid,timestamp with time zone
  ),
  public.derive_atomic_financial_snapshot_v2(uuid,uuid,jsonb),
  public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)
from public,anon,authenticated,service_role,afex_context_issuer,
  afex_outbox_worker,afex_core_runtime,afex_core_activation_operator;

revoke execute on function
  public.validate_atomic_authorization_context_internal_v1(
    text,text,text,uuid
  )
from public,anon,authenticated,service_role,afex_core_runtime,
  afex_context_issuer,afex_outbox_worker,afex_core_activation_operator;

grant select on table
  public.profiles,public.pos_profiles,public.tenants,public.branches,
  public.catalog_items,
  public.branch_catalog_items,public.discounts,public.vat_settings,
  public.financial_quotes
to afex_core_owner;
grant select,insert,update on table
  public.customers,public.idempotency_commands,
  public.order_number_sequences,public.inventory_stock
to afex_core_owner;
grant select,insert on table
  public.orders,public.invoices,public.invoice_items,
  public.inventory_movements,public.audit_logs,public.atomic_outbox
to afex_core_owner;
grant select,update on table public.atomic_authorization_contexts
  to afex_core_owner;

-- ===========================================================================
-- E. INTERNAL TABLE DIRECT-ACCESS REVOCATION AND NARROW RLS
-- ===========================================================================

revoke select,insert,update,delete,truncate,references,trigger
  on table public.atomic_authorization_contexts
  from public,anon,authenticated,service_role,afex_outbox_worker;
revoke select,insert,update,delete,truncate,references,trigger
  on table public.idempotency_commands
  from public,anon,authenticated,service_role,afex_context_issuer,
       afex_outbox_worker;
revoke select,insert,update,delete,truncate,references,trigger
  on table public.atomic_outbox
  from public,anon,authenticated,service_role,afex_context_issuer,
       afex_outbox_worker;
revoke insert,update,delete,truncate,references,trigger
  on table public.financial_quotes
  from public,anon,authenticated,service_role,afex_context_issuer,
       afex_outbox_worker;
revoke select on table public.financial_quotes
  from public,anon,authenticated,service_role,afex_context_issuer,
       afex_outbox_worker;

alter table public.atomic_authorization_contexts enable row level security;
alter table public.financial_quotes enable row level security;
alter table public.idempotency_commands enable row level security;
alter table public.atomic_outbox enable row level security;
create policy context_issuer_insert_v1
  on public.atomic_authorization_contexts
  for insert to afex_context_issuer
  with check (
    state='issued'
    and purpose='create_order_atomic_v2'
    and context_version='atomic-auth-context-v1'
  );
create policy context_issuer_revoke_v1
  on public.atomic_authorization_contexts
  for update to afex_context_issuer
  using (state='issued')
  with check (state in ('issued','revoked'));
create policy context_issuer_read_v1
  on public.atomic_authorization_contexts
  for select to afex_context_issuer
  using (authenticated_user_id=auth.uid());
create policy context_core_consume_v1
  on public.atomic_authorization_contexts
  for all to afex_core_owner
  using (true) with check (true);
create policy financial_quotes_core_read_v1
  on public.financial_quotes
  for select to afex_core_owner using (true);
create policy idempotency_core_v1
  on public.idempotency_commands
  for all to afex_core_owner
  using (true) with check (true);
create policy outbox_core_v1
  on public.atomic_outbox
  for all to afex_core_owner
  using (true) with check (true);

revoke all on function public.resolve_atomic_authorization_v2(jsonb,jsonb)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.normalize_customer_phone_v2(text)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.resolve_customer_identity_v2(
  uuid,uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.resolve_customer_identity_result_v2(
  uuid,uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.build_atomic_request_fingerprint_v2(jsonb,jsonb)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.derive_atomic_financial_snapshot_v2(
  uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.acquire_idempotency_command_v2(
  uuid,uuid,text,text,text,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.build_atomic_order_response_v1(uuid,uuid)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.allocate_branch_monthly_number_v2(uuid,uuid,date)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.assert_atomic_legacy_triggers_safe_v2()
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.resolve_inventory_requirements_v2(
  uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.lock_and_validate_inventory_v2(
  uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.build_inventory_movement_evidence_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,bigint,bigint
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.apply_inventory_mutations_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.atomic_semantic_event_uuid_v1(text)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.enqueue_atomic_outbox_v2(
  uuid,uuid,uuid,uuid,uuid,boolean,text,text,numeric,text,text,text,jsonb,
  uuid,timestamptz
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)
alter function public.issue_atomic_authorization_context_v1(uuid,text,text)
  owner to afex_context_issuer;
alter function public.issue_pos_atomic_authorization_context_v1(
  text,uuid,text,text
) owner to afex_context_issuer;
alter function public.revoke_atomic_authorization_context_v1(uuid,text)
  owner to afex_context_issuer;
alter function public.consume_atomic_authorization_context_v1(text,text,uuid)
  owner to afex_core_owner;
alter function public.claim_atomic_outbox_events_v1(text,integer,integer)
  owner to afex_core_owner;
alter function public.complete_atomic_outbox_event_v1(uuid,text)
  owner to afex_core_owner;
alter function public.fail_atomic_outbox_event_v1(
  uuid,text,text,text,text
) owner to afex_core_owner;

revoke execute on function
  public.issue_atomic_authorization_context_v1(uuid,text,text),
  public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text),
  public.revoke_atomic_authorization_context_v1(uuid,text),
  public.consume_atomic_authorization_context_v1(text,text,uuid),
  public.claim_atomic_outbox_events_v1(text,integer,integer),
  public.complete_atomic_outbox_event_v1(uuid,text),
  public.fail_atomic_outbox_event_v1(uuid,text,text,text,text)
from public,anon,authenticated,service_role,afex_context_issuer,
  afex_outbox_worker;

alter function public.validate_atomic_authorization_context_internal_v1(
  text,text,text,uuid
) owner to afex_core_owner;
alter function public.normalize_authoritative_quote_request_v1(jsonb)
  owner to afex_core_owner;
alter function public.verify_authoritative_quote_hash_v1(jsonb,text)
  owner to afex_core_owner;
alter function public.reject_financial_quote_mutation_v1()
  owner to afex_core_owner;
alter function public.issue_authoritative_financial_quote_v1(text,jsonb,text)
  owner to afex_core_owner;

/*
Package 5R-A grants afex_core_owner SELECT on financial_quotes. Package 6B
adds only INSERT plus a matching narrow RLS policy. No runtime role receives
table access.
*/
grant insert on table public.financial_quotes to afex_core_owner;
create policy financial_quotes_core_insert_v1
  on public.financial_quotes
  for insert to afex_core_owner
  with check (
    authorization_context_id is not null
    and issuer_context_version = 'atomic-auth-context-v1'
    and quote_classification = 'advisory'
  );

revoke all on table public.financial_quotes
from public, anon, authenticated, service_role, afex_core_runtime,
  afex_outbox_worker, afex_context_issuer, afex_core_activation_operator;

revoke execute on function
  public.validate_atomic_authorization_context_internal_v1(
    text,text,text,uuid
  ),
  public.normalize_authoritative_quote_request_v1(jsonb),
  public.verify_authoritative_quote_hash_v1(jsonb,text),
  public.reject_financial_quote_mutation_v1(),
  public.issue_authoritative_financial_quote_v1(text,jsonb,text)
from public, anon, authenticated, service_role, afex_core_runtime,
  afex_outbox_worker, afex_context_issuer, afex_core_activation_operator;

alter table public.core_v2_activation_control
  owner to afex_core_activation_owner;
alter table public.core_v2_tenant_activation
  owner to afex_core_activation_owner;
alter table public.core_v2_branch_activation
  owner to afex_core_activation_owner;
alter table public.core_v2_verification_evidence
  owner to afex_core_activation_owner;
alter table public.core_v2_managed_identities
  owner to afex_core_activation_owner;
alter table public.core_v2_issuer_rate_limit_config
  owner to afex_core_activation_owner;
alter table public.core_v2_issuer_rate_limit_windows
  owner to afex_core_activation_owner;

alter table public.core_v2_activation_control enable row level security;
alter table public.core_v2_tenant_activation enable row level security;
alter table public.core_v2_branch_activation enable row level security;
alter table public.core_v2_verification_evidence enable row level security;
alter table public.core_v2_managed_identities enable row level security;
alter table public.core_v2_issuer_rate_limit_config enable row level security;
alter table public.core_v2_issuer_rate_limit_windows enable row level security;

alter table public.core_v2_activation_control force row level security;
alter table public.core_v2_tenant_activation force row level security;
alter table public.core_v2_branch_activation force row level security;
alter table public.core_v2_verification_evidence force row level security;
alter table public.core_v2_managed_identities force row level security;
alter table public.core_v2_issuer_rate_limit_config force row level security;
alter table public.core_v2_issuer_rate_limit_windows force row level security;

create policy core_v2_activation_owner_control_read
on public.core_v2_activation_control
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_tenants_read
on public.core_v2_tenant_activation
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_branches_read
on public.core_v2_branch_activation
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_evidence_read
on public.core_v2_verification_evidence
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_identities_read
on public.core_v2_managed_identities
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_rate_config_read
on public.core_v2_issuer_rate_limit_config
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_rate_windows_read
on public.core_v2_issuer_rate_limit_windows
for select to afex_core_activation_owner
using (true);

create policy core_v2_activation_operator_control
on public.core_v2_activation_control
for all to afex_core_activation_operator
using (true) with check (true);
create policy core_v2_activation_operator_tenants
on public.core_v2_tenant_activation
for all to afex_core_activation_operator
using (true) with check (true);
create policy core_v2_activation_operator_branches
on public.core_v2_branch_activation
for all to afex_core_activation_operator
using (true) with check (true);
create policy core_v2_activation_operator_evidence
on public.core_v2_verification_evidence
for insert to afex_core_activation_operator
with check (true);
create policy core_v2_activation_operator_identities
on public.core_v2_managed_identities
for all to afex_core_activation_operator
using (true) with check (true);
create policy core_v2_activation_operator_rate_config
on public.core_v2_issuer_rate_limit_config
for all to afex_core_activation_operator
using (true) with check (true);

create policy core_v2_context_issuer_rate_config_read
on public.core_v2_issuer_rate_limit_config
for select to afex_context_issuer
using (true);
create policy core_v2_context_issuer_rate_windows
on public.core_v2_issuer_rate_limit_windows
for all to afex_context_issuer
using (true) with check (true);

revoke all on table
  public.core_v2_activation_control,
  public.core_v2_tenant_activation,
  public.core_v2_branch_activation,
  public.core_v2_verification_evidence,
  public.core_v2_managed_identities,
  public.core_v2_issuer_rate_limit_config,
  public.core_v2_issuer_rate_limit_windows
from public, anon, authenticated, service_role, afex_core_runtime,
  afex_outbox_worker, afex_context_issuer, afex_core_activation_operator;
alter function public.reject_core_v2_immutable_change_v1()
  owner to afex_core_activation_owner;
alter function public.touch_core_v2_control_row_v1()
  owner to afex_core_activation_owner;
alter function public.is_core_v2_request_enabled_v1(uuid,uuid,text,text)
  owner to afex_core_activation_owner;
alter function public.check_and_record_core_v2_issuer_rate_limit_v1(
  text,uuid,uuid,uuid,text,boolean
) owner to afex_context_issuer;
alter function public.validate_atomic_authorization_context_for_quote_v1(text)
  owner to afex_core_owner;
alter function public.record_core_v2_verification_evidence_v1(
  text,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,
  uuid,text,text,uuid
) owner to afex_core_activation_operator;
alter function public.register_core_v2_managed_identity_v1(
  name,text,text,text,text,name,text,uuid,text
) owner to afex_core_activation_operator;
alter function public.deactivate_core_v2_v1(uuid,text,text,bigint)
  owner to afex_core_activation_operator;
alter function public.verify_core_v2_activation_readiness_v2(
  text,text,uuid,uuid
) owner to afex_core_activation_owner;

revoke execute on function
  public.reject_core_v2_immutable_change_v1(),
  public.touch_core_v2_control_row_v1(),
  public.is_core_v2_request_enabled_v1(uuid,uuid,text,text),
  public.check_and_record_core_v2_issuer_rate_limit_v1(
    text,uuid,uuid,uuid,text,boolean
  ),
  public.validate_atomic_authorization_context_for_quote_v1(text),
  public.validate_atomic_authorization_context_internal_v1(
    text,text,text,uuid
  ),
  public.issue_authoritative_financial_quote_v1(text,jsonb,text),
  public.verify_authoritative_quote_hash_v1(jsonb,text),
  public.record_core_v2_verification_evidence_v1(
    text,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,
    uuid,text,text,uuid
  ),
  public.register_core_v2_managed_identity_v1(
    name,text,text,text,text,name,text,uuid,text
  ),
  public.deactivate_core_v2_v1(uuid,text,text,bigint),
  public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)
from public, anon, authenticated, service_role, afex_core_runtime,
  afex_outbox_worker, afex_context_issuer, afex_core_activation_operator;

-- Trigger owners execute their trigger functions implicitly. No runtime
-- EXECUTE grants are required or provided.

alter default privileges for role afex_core_activation_owner
in schema public revoke all on tables from public;
alter default privileges for role afex_core_activation_owner
in schema public revoke execute on functions from public;
alter default privileges for role afex_core_activation_operator
in schema public revoke execute on functions from public;

do $package6aa_contract_assertion$
declare
  v_validator oid:=to_regprocedure(
    'public.validate_atomic_authorization_context_for_quote_v1(text)'
  );
  v_readiness oid:=to_regprocedure(
    'public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'
  );
begin
  if v_validator is null or v_readiness is null then
    raise exception using
      errcode='55000',
      message='PACKAGE6AA_REQUIRED_SIGNATURE_MISSING';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (
        (
          p.proname='validate_atomic_authorization_context_for_quote_v1'
          and p.oid<>v_validator
        )
        or
        (
          p.proname='verify_core_v2_activation_readiness_v2'
          and p.oid<>v_readiness
        )
      )
  ) then
    raise exception using
      errcode='55000',
      message='PACKAGE6AA_UNEXPECTED_OVERLOAD';
  end if;

  if pg_get_function_result(v_validator) is distinct from
    'TABLE(authorization_context_id uuid, authenticated_user_id uuid, '
    || 'tenant_id uuid, branch_id uuid, actor_role text, employee_id uuid, '
    || 'authorization_source text, idempotency_key_hash text, '
    || 'context_version text, expires_at timestamp with time zone)'
  or not exists (
    select 1
    from pg_proc p
    where p.oid=v_validator
      and p.proowner='afex_core_owner'::regrole
      and p.prosecdef
      and p.provolatile='v'
      and p.proconfig=array['search_path=pg_catalog']::text[]
  )
  or not exists (
    select 1
    from pg_proc p
    where p.oid=v_readiness
      and p.proowner='afex_core_activation_owner'::regrole
      and p.prosecdef
      and p.provolatile='s'
      and p.prolang=(select oid from pg_language where lanname='sql')
      and p.proconfig=array['search_path=pg_catalog']::text[]
  ) then
    raise exception using
      errcode='55000',
      message='PACKAGE6AA_FUNCTION_CONTRACT_MISMATCH';
  end if;
end;
$package6aa_contract_assertion$;

do $package6aa_fail_closed_assertion$
begin
  if not exists (
    select 1
    from public.core_v2_activation_control c
    where c.singleton_id
      and not c.global_enabled
      and c.kill_switch
      and not c.pos_enabled
      and not c.admin_orders_enabled
      and not c.quote_issuer_enabled
      and not c.outbox_worker_enabled
      and c.deterministic_canary_percentage=0
  )
  or exists (
    select 1
    from public.core_v2_tenant_activation
    where enabled or canary_eligible or pos_enabled
       or admin_orders_enabled or quote_enabled
  )
  or exists (
    select 1
    from public.core_v2_branch_activation
    where enabled or canary_eligible or pos_enabled
       or admin_orders_enabled or quote_enabled
  ) then
    raise exception using
      errcode='55000',
      message='PACKAGE6AA_FAIL_CLOSED_STATE_VIOLATION';
  end if;
end;
$package6aa_fail_closed_assertion$;
commit;
-- STOP J-L: review owners, RLS, policies, revocations and flags.
-- PHASE M: READ-ONLY FAIL-CLOSED POSTFLIGHT.
do $p10m$ declare exposure text;begin
 if not exists(select 1 from public.core_v2_activation_control where singleton_id and not global_enabled and kill_switch and deterministic_canary_percentage=0 and not pos_enabled and not admin_orders_enabled and not quote_issuer_enabled and not outbox_worker_enabled)or exists(select 1 from public.core_v2_tenant_activation where enabled or canary_eligible or pos_enabled or admin_orders_enabled or quote_enabled)or exists(select 1 from public.core_v2_branch_activation where enabled or canary_eligible or pos_enabled or admin_orders_enabled or quote_enabled)then raise exception using errcode='55000',message='P10_FAIL_CLOSED_STATE';end if;
 with f(r)as(values('PUBLIC'),('anon'),('authenticated'),('service_role'),('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),('afex_core_activation_operator')),p as(select p.oid,p.proowner,p.proacl,p.oid::regprocedure::text s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and(p.proname like'%atomic%'or p.proname like'%authoritative%'or p.proname like'%core_v2%'or p.proname like'%outbox%')),x as(select f.r,p.s from f cross join p left join pg_roles r on r.rolname=f.r cross join lateral aclexplode(coalesce(p.proacl,acldefault('f'::"char",p.proowner)))a where a.privilege_type='EXECUTE'and a.grantee=case when f.r='PUBLIC'then 0 else r.oid end and a.grantee<>p.proowner)select string_agg(r||'->'||s,',')into exposure from x;if exposure is not null then raise exception using errcode='55000',message='P10_OPERATIONAL_EXECUTE_EXPOSURE',detail=exposure;end if;
end;$p10m$;
select global_enabled,kill_switch,deterministic_canary_percentage,pos_enabled,admin_orders_enabled,quote_issuer_enabled,outbox_worker_enabled,activation_version from public.core_v2_activation_control;
select p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner)owner,p.prosecdef,p.provolatile,p.proparallel,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and(p.proname like'%atomic%'or p.proname like'%authoritative%'or p.proname like'%core_v2%'or p.proname like'%outbox%')order by signature;
/* DEPENDENCY PROOF
roles|B|environment|creation|yes
metadata|C|baseline+2B-S|creation|yes
4T functions|D-H|foundation; cross-calls runtime-only|creation/runtime|yes
shared validator/consumer|E|foundation+final bodies|runtime-only|yes
quote|G|4T+6A validator|creation/runtime|yes
readiness|I|metadata+final catalog|creation/runtime|yes
ownership/RLS/policies|J-K|roles+objects|creation|yes
postflight|M|completed cluster|execution|yes
Runtime tests NOT EXECUTED; Package 7 NOT RUN; Core V2 DISABLED. */
