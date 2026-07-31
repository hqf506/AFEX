import 'server-only'

export const CORE_V2_FORBIDDEN_IMPORT_RULES = Object.freeze([
  'client_to_core_v2',
  'browser_to_service_role',
  'ui_to_trusted_runtime',
  'client_to_core_v2_internal',
  'api_to_browser_supabase_client',
  'core_v2_legacy_fallback',
  'browser_sensitive_environment_reachability',
  'browser_unresolved_environment_access',
  'core_v2_environment_access',
  'application_core_v2_ledger_access',
  'route_core_v2_activation',
  'contract_forbidden_import',
  'contract_forbidden_runtime_access',
] as const)

export type CoreV2ForbiddenImportRule =
  (typeof CORE_V2_FORBIDDEN_IMPORT_RULES)[number]
