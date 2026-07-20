import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260717150000_support_provider_operational_metrics.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')
const providerListApi = fs.readFileSync('app/api/provider/support/tickets/route.ts', 'utf8')
const customerListApi = fs.readFileSync('app/api/support/tickets/route.ts', 'utf8')
const customerDetailApi = fs.readFileSync('app/api/support/tickets/[id]/route.ts', 'utf8')
const providerPage = fs.readFileSync('components/provider-support-console.tsx', 'utf8')
const supportUi = fs.readFileSync('lib/support/ui.ts', 'utf8')

const required = [
  'where is_internal = false',
  'first_provider_reply_at',
  'last_customer_message_at',
  'last_provider_reply_at',
  'last_public_message_at',
  'last_public_sender_type',
  'public_message_count',
  "'awaiting_first_response'",
  "'within_time'",
  "'attention'",
  "'overdue'",
  "'waiting_customer'",
  "'resolved'",
  "'closed'",
  "v_operational_filter = 'needs_follow_up'",
  'limit v_page_size',
  'offset (v_page - 1) * v_page_size',
  'security definer',
  'set search_path = pg_catalog, public',
  'p_provider_user_id uuid',
  'v_provider_user_id uuid := p_provider_user_id',
  'statement_timestamp()',
  'from authenticated',
  'to service_role',
  'base_filtered_rows as',
  'operational_filtered_rows as',
  "'total', (select count(*) from operational_filtered_rows)",
  'from base_filtered_rows',
]

for (const marker of required) {
  if (!sql.includes(marker)) throw new Error(`Operational migration is missing: ${marker}`)
}

if (/support_ticket_events[\s\S]*operational_state/i.test(sql)) {
  throw new Error('Operational state must not depend on support ticket events')
}
if (/\b(message|diagnostic_context|tenant_id|sender_id)\b\s*',/i.test(sql)) {
  throw new Error('Operational RPC appears to expose a restricted field')
}
if (!/when metric_rows\.status = 'closed' then 'closed'[\s\S]*when metric_rows\.status = 'resolved' then 'resolved'/.test(sql)) {
  throw new Error('Closed/resolved precedence is not protected')
}
if ((sql.match(/create index if not exists/g) || []).length !== 1) {
  throw new Error('S4.1A must add exactly one necessary partial index')
}
if (/v_provider_user_id\s+uuid\s*:=\s*auth\.uid\(\)/.test(sql)) {
  throw new Error('Service-role RPC must not depend on auth.uid() for provider identity')
}
if (sql.includes('clock_timestamp()')) {
  throw new Error('Operational calculations must use one stable statement timestamp')
}
if (/p_tenant_id|tenant_id\s+uuid/.test(sql)) {
  throw new Error('Operational RPC must not accept a tenant identifier')
}
if (!/revoke all on function public\.get_provider_support_operational_dashboard\([\s\S]*?\) from public;[\s\S]*?from anon;[\s\S]*?from authenticated;[\s\S]*?grant execute[\s\S]*?to service_role;/.test(sql)) {
  throw new Error('RPC grants do not match the service-role Provider API architecture')
}
if (!/summary[\s\S]*from base_filtered_rows/.test(sql) || /summary[\s\S]*from operational_filtered_rows/.test(sql)) {
  throw new Error('Summary must use standard filters and ignore operational_filter')
}
if (!/operational_filtered_rows as[\s\S]*v_operational_filter[\s\S]*paged_rows as[\s\S]*from operational_filtered_rows/.test(sql)) {
  throw new Error('Items and pagination must apply operational_filter server-side')
}
if (!providerListApi.includes('supabaseAdmin') || !providerListApi.includes('requireSupportAuth')) {
  throw new Error('Provider list architecture must verify the session before service-role data access')
}
if (!providerListApi.includes("supabaseAdmin.rpc('get_provider_support_operational_dashboard'") || (providerListApi.match(/\.rpc\(/g) || []).length !== 1) {
  throw new Error('Provider list must use exactly one operational RPC call')
}
if (!providerListApi.includes('p_provider_user_id: auth.user.id')) {
  throw new Error('Provider identity must come only from requireSupportAuth session data')
}
if (!providerListApi.includes('p_operational_filter:') || !providerPage.includes("params.set('operational_filter', operationalFilter)")) {
  throw new Error('Operational filter must flow from UI to the server RPC')
}
if (providerPage.includes('SUPABASE_SERVICE_ROLE_KEY') || providerPage.includes('supabaseAdmin')) {
  throw new Error('Service-role credentials and clients must not enter the browser bundle')
}
if (!providerPage.includes('supportOperationalLabels') || !supportUi.includes("overdue: 'متأخرة'")) {
  throw new Error('Canonical Arabic operational mappings must be shared by the provider UI')
}
if (/\.reduce\(|public_message_count\s*[><=]/.test(providerPage)) {
  throw new Error('Provider UI must not aggregate operational state client-side')
}
if (providerListApi.includes("params.get('provider_user_id')") || /body\??\.provider_user_id|headers?\([^)]*provider_user_id/i.test(providerListApi)) {
  throw new Error('Provider identity must not come from browser-controlled request input')
}
if ([customerListApi, customerDetailApi].some((source) => source.includes('get_provider_support_operational_dashboard'))) {
  throw new Error('Customer routes must never call the provider operational RPC')
}

console.log('Support operational metrics checks passed.')
