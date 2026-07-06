import { supabaseAdmin } from '@/lib/supabase/admin'
import { maskId } from '@/lib/security/redaction'
import type {
  MetaCompatibleProviderConfig,
  UltraMsgProviderConfig,
  WhatsAppProviderConfig,
} from '@/lib/whatsapp/types'

type BranchWhatsAppConfigDbRow = {
  provider: 'ultramsg' | 'meta'
  phone_number: string
  instance_id: string
  token: string
  api_url: string
  is_active: boolean
}

type SystemWhatsAppConfigDbRow = {
  whatsapp_provider: string | null
  ultramsg_instance_id: string | null
  ultramsg_token: string | null
  ultramsg_api_url: string | null
}

function resolveSystemProviderKey(provider?: string | null) {
  if (provider === 'official') return 'meta'
  return 'ultramsg'
}

function buildWhatsAppConfigFromSystemSettings(
  config: SystemWhatsAppConfigDbRow | null
): WhatsAppProviderConfig | null {
  if (!config) return null

  const providerKey = resolveSystemProviderKey(config.whatsapp_provider)
  const apiUrl = config.ultramsg_api_url?.trim() || ''
  const token = config.ultramsg_token?.trim() || ''
  const instanceId = config.ultramsg_instance_id?.trim() || ''

  if (providerKey === 'meta') {
    const metaConfig: MetaCompatibleProviderConfig = {
      providerKey: 'meta',
      apiUrl,
      accessToken: token,
      phoneNumberId: instanceId,
    }

    return metaConfig
  }

  const ultraMsgConfig: UltraMsgProviderConfig = {
    providerKey: 'ultramsg',
    apiUrl,
    token,
  }

  return ultraMsgConfig
}

export async function getBranchWhatsAppProviderConfig(
  branchId: string | null | undefined,
  tenantId: string | null | undefined
): Promise<WhatsAppProviderConfig | null> {
  const normalizedBranchId = typeof branchId === 'string' ? branchId.trim() : ''
  const normalizedTenantId = typeof tenantId === 'string' ? tenantId.trim() : ''

  if (!normalizedTenantId) {
    return null
  }

  const { data, error } = normalizedBranchId
    ? await supabaseAdmin
        .from('branch_whatsapp_configs')
        .select('provider, phone_number, instance_id, token, api_url, is_active')
        .eq('branch_id', normalizedBranchId)
        .eq('tenant_id', normalizedTenantId)
        .maybeSingle()
    : { data: null, error: null }

  if (error) {
    throw new Error(error.message)
  }

  const config = data as BranchWhatsAppConfigDbRow | null

  console.info({
    scope: 'whatsapp-config-lookup',
    branchIdPresent: Boolean(normalizedBranchId),
    tenantIdMasked: maskId(normalizedTenantId),
    branchIdMasked: maskId(normalizedBranchId),
    configFound: Boolean(config),
    provider: config?.provider || null,
    isActive: config?.is_active ?? null,
    hasToken: Boolean(config?.token?.trim()),
    hasInstanceId: Boolean(config?.instance_id?.trim()),
    hasApiUrl: Boolean(config?.api_url?.trim()),
  })

  if (config?.is_active) {
    if (config.provider === 'meta') {
      const metaConfig: MetaCompatibleProviderConfig = {
        providerKey: 'meta',
        apiUrl: config.api_url.trim(),
        accessToken: config.token.trim(),
        phoneNumberId: config.instance_id.trim(),
      }

      return metaConfig
    }

    const ultraMsgConfig: UltraMsgProviderConfig = {
      providerKey: 'ultramsg',
      apiUrl: config.api_url.trim(),
      token: config.token.trim(),
    }

    return ultraMsgConfig
  }

  const { data: systemConfig, error: systemError } = await supabaseAdmin
    .from('system_settings')
    .select('whatsapp_provider, ultramsg_instance_id, ultramsg_token, ultramsg_api_url')
    .eq('tenant_id', normalizedTenantId)
    .limit(1)
    .maybeSingle()

  if (systemError) {
    throw new Error(systemError.message)
  }

  return buildWhatsAppConfigFromSystemSettings(
    (systemConfig as SystemWhatsAppConfigDbRow | null) ?? null
  )
}
